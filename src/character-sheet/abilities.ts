import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../../main';
import { createFrontmatterResolver, parseBlockYaml } from '../helpers';

export async function processDnDAbilitiesBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    const CORE_ABILITIES = [
        { name: "strength", handle: "STR" },
        { name: "dexterity", handle: "DEX" },
        { name: "constitution", handle: "CON" },
        { name: "intelligence", handle: "INT" },
        { name: "wisdom", handle: "WIS" },
        { name: "charisma", handle: "CHA" }
    ];

    let activeResizeObserver: ResizeObserver | null = null;
    renderChild.register(() => {
        if (activeResizeObserver) activeResizeObserver.disconnect();
    });

    const renderContent = async () => {
        if (activeResizeObserver) {
            activeResizeObserver.disconnect();
            activeResizeObserver = null;
        }

        const wrapper = document.createElement("div");

        let blockData: Record<string, any> = {};
        try {
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-abilities block.", cls: "dnd-error-text" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        const resolveValue = createFrontmatterResolver(frontmatter);

        // 1. Parse Proficiencies (Supports frontmatter.DnD_classProficiencies, YAML lists, and bracket arrays)
        const parseProficiencies = (rawInput: any, set = new Set<string>()): Set<string> => {
            if (rawInput === undefined || rawInput === null) return set;

            const resolved = resolveValue(rawInput);
            if (resolved === undefined || resolved === null) return set;

            if (typeof resolved === "string") {
                const trimmed = resolved.trim();
                if (!trimmed || trimmed.includes("<chosen")) return set;

                if (trimmed.startsWith("[")) {
                    try {
                        return parseProficiencies(JSON.parse(trimmed), set);
                    } catch {
                        return parseProficiencies(trimmed.slice(1, -1).split(","), set);
                    }
                }

                if (trimmed.includes(",")) {
                    return parseProficiencies(trimmed.split(","), set);
                }

                set.add(trimmed.toLowerCase());
                return set;
            }

            if (Array.isArray(resolved)) {
                for (const item of resolved) {
                    parseProficiencies(item, set);
                }
            }

            return set;
        };

        // 2. Parse Extras: [ ["<ability-name>", "<ability-handle>", "<ability-score>", "<saving-throw>"], ... ]
        const parseExtras = (rawInput: any): { name: string; handle: string; score: number; saveRaw: any }[] => {
            const list: { name: string; handle: string; score: number; saveRaw: any }[] = [];
            if (rawInput === undefined || rawInput === null) return list;

            let resolved = resolveValue(rawInput);
            if (typeof resolved === "string") {
                const trimmed = resolved.trim();
                if (trimmed.startsWith("[")) {
                    try {
                        resolved = JSON.parse(trimmed);
                    } catch {
                        resolved = [];
                    }
                }
            }

            if (Array.isArray(resolved)) {
                // Support both a 2D array of tuples and a single 1D tuple if someone only wrote one array
                const tuples = (resolved.length >= 3 && !Array.isArray(resolved[0])) ? [resolved] : resolved;

                for (const rawTuple of tuples) {
                    const tuple = resolveValue(rawTuple);
                    if (!Array.isArray(tuple) || tuple.length < 3) continue;

                    const name = String(resolveValue(tuple[0]) ?? "").trim();
                    const handle = String(resolveValue(tuple[1]) ?? "").trim();
                    const scoreRaw = resolveValue(tuple[2]);
                    const saveRaw = tuple.length >= 4 ? resolveValue(tuple[3]) : "";

                    // Skip unedited template placeholders like "<ability-name>"
                    if (!name || !handle || name.includes("<ability") || handle.includes("<ability")) continue;

                    const score = Number(scoreRaw);
                    list.push({
                        name,
                        handle: handle.toUpperCase(),
                        score: isNaN(score) ? 10 : score,
                        saveRaw
                    });
                }
            }

            return list;
        };

        const profSet = parseProficiencies(blockData.proficiencies);
        const extrasList = parseExtras(blockData.extras);

        const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
        const DnD_proficiency_bonus = Number(
            resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
        ) || Math.ceil(1 + (level / 4));

        // 3. Build Unified List of Ability Cards to Render
        interface AbilityCardData {
            name: string;
            handle: string;
            score: number;
            modStr: string;
            saveStr: string;
            isProficient: boolean;
        }

        const cardsToRender: AbilityCardData[] = [];

        // A. Standard 6 Abilities
        for (const abil of CORE_ABILITIES) {
            const rawScore = resolveValue(blockData[abil.name] ?? blockData[abil.handle.toLowerCase()]);
            const score = (rawScore !== undefined && rawScore !== null && rawScore !== "" && !isNaN(Number(rawScore)))
                ? Number(rawScore)
                : 10;

            const mod = Math.floor((score - 10) / 2);
            const isProficient = profSet.has(abil.name.toLowerCase()) || profSet.has(abil.handle.toLowerCase());
            const saveVal = mod + (isProficient ? DnD_proficiency_bonus : 0);

            cardsToRender.push({
                name: abil.name,
                handle: abil.handle,
                score,
                modStr: mod >= 0 ? `+${mod}` : `${mod}`,
                saveStr: saveVal >= 0 ? `+${saveVal}` : `${saveVal}`,
                isProficient
            });
        }

        // B. Extra Homebrew Abilities
        for (const extra of extrasList) {
            const mod = Math.floor((extra.score - 10) / 2);
            const nameLower = extra.name.toLowerCase();
            const handleLower = extra.handle.toLowerCase();
            const saveStrRaw = String(extra.saveRaw ?? "").trim();

            let isProficient = profSet.has(nameLower) || profSet.has(handleLower);
            let saveVal = mod + (isProficient ? DnD_proficiency_bonus : 0);

            if (saveStrRaw.toLowerCase() === "proficient" || saveStrRaw.toLowerCase() === "true") {
                isProficient = true;
                saveVal = mod + DnD_proficiency_bonus;
            } else if (saveStrRaw !== "" && !saveStrRaw.includes("<saving") && !isNaN(Number(saveStrRaw.replace("+", "")))) {
                saveVal = Number(saveStrRaw.replace("+", ""));
            }

            cardsToRender.push({
                name: extra.name,
                handle: extra.handle,
                score: extra.score,
                modStr: mod >= 0 ? `+${mod}` : `${mod}`,
                saveStr: saveVal >= 0 ? `+${saveVal}` : `${saveVal}`,
                isProficient
            });
        }

        // 4. Render Responsive Grid Container
        const totalCards = cardsToRender.length;
        const gridEl = wrapper.createDiv({ cls: "dnd-abilities-grid" });
        gridEl.style.gridTemplateColumns = `repeat(${totalCards}, minmax(0, 1fr))`;

        // Dynamically split into 2 equal rows if the note width cannot fit all cards on 1 row
        const updateGridColumns = () => {
            const width = gridEl.clientWidth;
            if (width <= 0) return;

            const MIN_CARD_WIDTH = 105; // Minimum px width before splitting in half
            const GAP_PX = 10;
            const requiredSingleRowWidth = (totalCards * MIN_CARD_WIDTH) + ((totalCards - 1) * GAP_PX);

            if (width < requiredSingleRowWidth && totalCards > 1) {
                const halfCols = Math.ceil(totalCards / 2);
                gridEl.style.gridTemplateColumns = `repeat(${halfCols}, minmax(0, 1fr))`;
            } else {
                gridEl.style.gridTemplateColumns = `repeat(${totalCards}, minmax(0, 1fr))`;
            }
        };

        activeResizeObserver = new ResizeObserver(() => updateGridColumns());
        activeResizeObserver.observe(gridEl);

        // 5. Render Individual Ability Cards
        for (const card of cardsToRender) {
            const cardEl = gridEl.createDiv({
                cls: `dnd-ability-card ${card.isProficient ? "is-proficient" : ""}`
            });

            const headerEl = cardEl.createDiv({ cls: "dnd-ability-header" });
            headerEl.createEl("span", { text: card.handle, cls: "dnd-ability-abbr" });
            headerEl.createEl("span", { text: String(card.score), cls: "dnd-ability-score" });

            const bodyEl = cardEl.createDiv({ cls: "dnd-ability-body" });
            bodyEl.createEl("div", { text: card.modStr, cls: "dnd-ability-mod" });
            bodyEl.createEl("div", { text: `Saving ${card.saveStr}`, cls: "dnd-ability-save" });
        }

        el.empty();
        el.appendChild(wrapper);
        requestAnimationFrame(() => updateGridColumns());
    };

    renderContent();

    renderChild.registerEvent(
        plugin.app.metadataCache.on("changed", (file) => {
            if (file.path === ctx.sourcePath) renderContent();
        })
    );
}
