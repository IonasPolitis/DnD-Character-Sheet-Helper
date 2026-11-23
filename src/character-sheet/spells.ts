import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { getSpellData } from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    createFrontmatterResolver,
    extractFrontmatterKey,
    parseBlockYaml,
    parseSpellTuples,
    parseStringArray
} from '../helpers';

export async function processDnDSpellsBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    let isUpdatingSlots = false;

    const renderContent = async () => {
        const wrapper = document.createElement('div');

        let blockData: Record<string, any> = {};
        try {
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid format in dnd-spells block.", cls: "dnd-error" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        // Standard helper: Only reads from frontmatter if the user explicitly writes "frontmatter.<key>"
        const resolveValue = createFrontmatterResolver(frontmatter);

        // 1. Resolve spellcastingAbility strictly from the code block variable
        const spellcastingAbility = resolveValue(blockData.spellcastingAbility) || "";
        const edition = resolveValue(blockData.edition);
        const fetchOptions = {
            ...plugin.settings,
            edition: edition ? String(edition) : undefined
        };

        // --- HIDE-AND-SHOW LOGIC ---
        // If the character has no spellcasting ability, completely abort rendering.
        if (!spellcastingAbility || String(spellcastingAbility).trim().startsWith("<")) {
            el.empty();
            return;
        }

        const spellAbilityKey = String(spellcastingAbility).toLowerCase().trim();
        const abilityScore = Number(resolveValue(blockData[spellAbilityKey]) ?? frontmatter[`DnD_${spellAbilityKey}`]) || 10;
        const abilityMod = Math.floor((abilityScore - 10) / 2);
        const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
        const DnD_proficiency_bonus = Number(
            resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
        ) || Math.ceil(1 + (level / 4));

        const spellSaveDc = 8 + DnD_proficiency_bonus + abilityMod;
        const spellAttackMod = DnD_proficiency_bonus + abilityMod;
        const spellAttackStr = spellAttackMod >= 0 ? `+${spellAttackMod}` : `${spellAttackMod}`;

        // 2. Parse Known & Prepared Spells Tuples and optional standalone spellPools array
        const resolvedSpellPools = parseStringArray(resolveValue(blockData.spellPools), true);
        if (resolvedSpellPools.length > 0) {
            wrapper.dataset.spellPools = JSON.stringify(resolvedSpellPools);
        }

        const knownMap = parseSpellTuples(blockData.spells, resolveValue);
        const preparedMap = parseSpellTuples(blockData.preparedSpells, resolveValue);

        const hasAnyPrepared = Object.values(preparedMap).some(list => list.length > 0);
        const showAll = String(blockData.show || "").toLowerCase() === "all" || !hasAnyPrepared;
        const activeMap = showAll ? knownMap : preparedMap;

        // 3. Parse Consolidated 9-Element Spell Slots Array strictly from blockData.spellSlots (or spellsSlots)
        // Structure: [ ["<Spell-Slots>", "<Used-Spell-Slots>"], ... (9 items for Levels 1-9) ]
        const rawSpellSlotsProp = blockData.spellSlots ?? blockData.spellsSlots;
        const parseAllSpellSlots = (rawInput: any): { max: number; used: number }[] => {
            const defaultSlots = Array.from({ length: 9 }, () => ({ max: 0, used: 0 }));
            if (rawInput === undefined || rawInput === null || rawInput === "") return defaultSlots;

            let parsed = resolveValue(rawInput);
            if (typeof parsed === "string") {
                const trimmed = parsed.trim();
                if (trimmed.startsWith("[")) {
                    try { parsed = JSON.parse(trimmed); } catch { parsed = []; }
                } else {
                    return defaultSlots;
                }
            }

            if (Array.isArray(parsed)) {
                for (let i = 0; i < 9; i++) {
                    const pair = resolveValue(parsed[i]);
                    if (Array.isArray(pair) && pair.length >= 2) {
                        const max = Number(String(pair[0]).replace(/[^0-9]/g, "")) || 0;
                        const used = Math.min(max, Math.max(0, Number(String(pair[1]).replace(/[^0-9]/g, "")) || 0));
                        defaultSlots[i] = { max, used };
                    }
                }
            }
            return defaultSlots;
        };

        const slotsArray = parseAllSpellSlots(rawSpellSlotsProp);

        // Determine which frontmatter key to update when clicking a spell slot pip (defaulting to DnD_spellSlots)
        const targetSlotsFmKey = extractFrontmatterKey(rawSpellSlotsProp, "DnD_spellSlots");

        // Gather all levels that either have spells OR have > 0 max spell slots in the 9-element array
        const levelSet = new Set<string>(
            Object.keys(activeMap).filter(lvl => Array.isArray(activeMap[lvl]) && activeMap[lvl].length > 0)
        );
        for (let i = 0; i < 9; i++) {
            if (slotsArray[i].max > 0) {
                levelSet.add(String(i + 1));
            }
        }

        const sortedLevels = Array.from(levelSet).sort((a, b) => Number(a) - Number(b));

        wrapper.createEl("h3", { text: "Spellbook & Prepared Spells:", cls: "dnd-section-header" });

        if (sortedLevels.length === 0) {
            const emptyWindow = wrapper.createDiv({ cls: "dnd-features-window" });
            emptyWindow.createEl("p", {
                text: "No spells prepared or added yet. Click the 📖 Spellbook button to manage your spells!",
                cls: "dnd-spells-empty"
            });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        // 4. Render Outer Container Window
        const spellsWindow = wrapper.createDiv({ cls: "dnd-spells-window" });

        for (const lvl of sortedLevels) {
            const spellKeys = activeMap[lvl] || [];
            const preparedForLevel = preparedMap[lvl] || [];

            const isCantrip = String(lvl).toLowerCase().startsWith("cantrip") || lvl === "0";
            const levelHeaderTitle = isCantrip ? "Cantrips" : `Level ${lvl} Spells`;

            const levelHeader = spellsWindow.createDiv({ cls: "dnd-spells-level-header" });
            levelHeader.createEl("h4", { text: levelHeaderTitle });

            // Render Native Interactive Spell Slot Tracker from the 9-element array
            const slotArrayIdx = Number(lvl) - 1;
            const slotInfo = (!isCantrip && slotArrayIdx >= 0 && slotArrayIdx < 9) ? slotsArray[slotArrayIdx] : { max: 0, used: 0 };
            const maxSlots = slotInfo.max;
            const usedSlots = slotInfo.used;

            if (!isCantrip && maxSlots > 0) {
                const slotTracker = levelHeader.createDiv({ cls: "dnd-spell-slots-tracker" });
                slotTracker.createEl("span", {
                    text: `Spell Slots:`,
                    cls: "dnd-spell-slots-label"
                });

                const pipsContainer = slotTracker.createDiv({ cls: "dnd-spell-slots-pips" });
                const pipStates: boolean[] = Array.from({ length: maxSlots }, (_, idx) => idx < usedSlots);

                const applyPipVisual = (pipEl: HTMLElement, active: boolean) => {
                    pipEl.classList.toggle("is-used", active);
                    pipEl.setAttribute("title", active ? "Tap to restore slot" : "Tap to expend slot");
                };

                for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
                    const pip = pipsContainer.createDiv({
                        cls: `dnd-slot-pip ${pipStates[slotIdx] ? "is-used" : ""}`
                    });
                    applyPipVisual(pip, pipStates[slotIdx]);

                    pip.addEventListener("pointerdown", async (e: PointerEvent) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        e.stopPropagation();

                        // 1. Toggle this pip's state and update the UI FIRST (instant response)
                        pipStates[slotIdx] = !pipStates[slotIdx];
                        applyPipVisual(pip, pipStates[slotIdx]);

                        // 2. Count total used slots for this level and update memory
                        const newUsedCount = pipStates.filter(Boolean).length;
                        slotsArray[slotArrayIdx].used = newUsedCount;

                        // 3. Save to frontmatter in the background without rebuilding the DOM
                        isUpdatingSlots = true;
                        const updatedTuples: [string, string][] = slotsArray.map((s, idx) => [
                            String(s.max),
                            idx === slotArrayIdx ? String(newUsedCount) : String(s.used)
                        ]);
                        try {
                            await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                                [targetSlotsFmKey]: JSON.stringify(updatedTuples)
                            });
                        } finally {
                            setTimeout(() => { isUpdatingSlots = false; }, 150);
                        }
                    });
                }
            }

            // If the character has slots for this level (e.g., for upcasting) but no spells prepared at this level
            if (spellKeys.length === 0) {
                spellsWindow.createEl("p", {
                    text: `No Level ${lvl} spells currently prepared.`,
                    cls: "dnd-spells-level-empty"
                });
                continue;
            }

            // 2-Column Grid (fills top-left to bottom-right just like dnd-inventory)
            const gridContainer = spellsWindow.createDiv({ cls: "dnd-spells-grid" });

            for (const spellKey of spellKeys) {
                const fallbackName = spellKey.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                const spellData = (await getSpellData(plugin.app, fetchOptions, spellKey)) || {
                    name: fallbackName,
                    level: Number(lvl),
                    school: "",
                    castingTime: "-",
                    range: "-",
                    components: ["-"],
                    duration: "-",
                    description: ""
                };

                const isPrepared = preparedForLevel.includes(spellKey);
                const card = gridContainer.createDiv({
                    cls: `dnd-spell-card ${showAll && isPrepared ? "dnd-spell-card-prepared" : ""}`
                });

                // --- A. INTEGRATED CARD HEADER (Name + School & Badges) ---
                const cardHeader = card.createDiv({ cls: "dnd-spell-card-header" });
                cardHeader.createEl("span", {
                    text: (spellData.name || fallbackName).toUpperCase(),
                    cls: "dnd-spell-card-title"
                });

                const badgeGroup = cardHeader.createDiv({ cls: "dnd-spell-card-badges" });
                if (spellData.school) {
                    badgeGroup.createEl("span", { text: spellData.school, cls: "dnd-spell-school-label" });
                }
                if (spellData.concentration) {
                    badgeGroup.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
                }
                if (spellData.ritual) {
                    badgeGroup.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
                }

                // --- B. CARD BODY (Left Combat Math Sidebar + Right 2x2 Metadata Grid) ---
                const cardBody = card.createDiv({ cls: "dnd-spell-card-body" });

                // Left Sidebar: Save DC & Spell Attack
                const combatBox = cardBody.createDiv({ cls: "dnd-spell-combat-box" });

                const dcGroup = combatBox.createDiv({ cls: "dnd-spell-combat-stat" });
                dcGroup.createEl("div", { text: `DC ${spellSaveDc}`, cls: "dnd-spell-combat-val" });
                dcGroup.createEl("div", { text: "SPELL DC", cls: "dnd-spell-combat-lbl" });

                const atkGroup = combatBox.createDiv({ cls: "dnd-spell-combat-stat" });
                atkGroup.createEl("div", { text: spellAttackStr, cls: "dnd-spell-combat-val" });
                atkGroup.createEl("div", { text: "SPELL ATK", cls: "dnd-spell-combat-lbl" });

                // Right 2x2 Grid: Casting Time, Range, Components, Duration
                const metaGrid = cardBody.createDiv({ cls: "dnd-spell-meta-grid" });

                const createMetaCell = (label: string, value: string) => {
                    const cell = metaGrid.createDiv({ cls: "dnd-spell-meta-cell" });
                    cell.createEl("div", { text: label, cls: "dnd-spell-meta-label" });
                    cell.createEl("div", { text: value || "-", cls: "dnd-spell-meta-val" });
                };

                const compArray = Array.isArray(spellData.components) ? spellData.components.join(", ") : String(spellData.components || "-");
                const fullComponents = spellData.materials ? `${compArray} (${spellData.materials})` : compArray;

                createMetaCell("CASTING TIME", spellData.castingTime || "-");
                createMetaCell("RANGE", spellData.range || "-");
                createMetaCell("COMPONENTS", fullComponents);
                createMetaCell("DURATION", spellData.duration || "-");

                // --- C. COLLAPSIBLE DESCRIPTION DRAWER (Click Card to Toggle) ---
                if (spellData.description) {
                    const descDrawer = card.createDiv({ cls: "dnd-spell-desc-drawer" });
                    await plugin.renderDndMarkdown(spellData.description, descDrawer, ctx.sourcePath, renderChild);

                    card.addClass("is-clickable");
                    card.onclick = () => {
                        descDrawer.classList.toggle("is-open");
                    };
                }
            }
        }

        el.empty();
        el.appendChild(wrapper);
    };

    renderContent();

    renderChild.registerEvent(
        plugin.app.metadataCache.on('changed', (file) => {
            if (file.path === ctx.sourcePath && !isUpdatingSlots) renderContent();
        })
    );
}
