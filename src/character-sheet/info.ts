import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../../main';
import { createFrontmatterResolver, extractAbilityScores, parseBlockYaml } from '../helpers';

export async function processDnDInfoBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

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
            wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-info block.", cls: "dnd-error-text" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        const resolveValue = createFrontmatterResolver(frontmatter);

        // Helper to turn strings, YAML arrays, or JSON strings into a clean display string
        const formatTextValue = (rawVal: any, fallback: string = "-"): string => {
            const resolved = resolveValue(rawVal);
            if (resolved === undefined || resolved === null || resolved === "") return fallback;

            if (Array.isArray(resolved)) {
                const filtered = resolved
                    .map(item => String(resolveValue(item) ?? "").trim())
                    .filter(item => item !== "" && !item.startsWith("<"));
                return filtered.length > 0 ? filtered.join(", ") : fallback;
            }

            if (typeof resolved === "string") {
                const trimmed = resolved.trim();
                if (!trimmed || trimmed.startsWith("<")) return fallback;
                if (trimmed.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        return formatTextValue(parsed, fallback);
                    } catch {
                        return trimmed;
                    }
                }
                return trimmed;
            }

            return String(resolved);
        };

        const formatSigned = (num: number): string => (num >= 0 ? `+${num}` : `${num}`);

        const mode = String(resolveValue(blockData.mode) || "character").toLowerCase().trim();

        interface InfoCardItem {
            label: string;
            value: string;
            sublabel: string;
        }

        const cards: InfoCardItem[] = [];
        let languagesStr = "";

        if (mode === "combat") {
            // --- COMBAT MODE: ARMOR CLASS, INITIATIVE, ATTACK ROLL, SPEED ---
            const dexScore = Number(resolveValue(blockData.dexterity) ?? frontmatter["DnD_dexterity"]) || 10;
            const dexMod = Math.floor((dexScore - 10) / 2);

            // Helper to safely parse numeric modifiers (including strings like "+2" or "-1")
            const parseNumericMod = (rawVal: any, fallback: number = 0): number => {
                const resolved = resolveValue(rawVal);
                if (resolved === undefined || resolved === null || resolved === "") return fallback;
                const cleaned = String(resolved).trim().replace(/^\+/, "");
                const num = Number(cleaned);
                return isNaN(num) ? fallback : num;
            };

            // 1. Armor Class
            const rawBaseAc = resolveValue(blockData.armorAc) ?? frontmatter["DnD_armorAc"];
            const hasBaseAc = rawBaseAc !== undefined && rawBaseAc !== null && rawBaseAc !== "";
            const baseAc = hasBaseAc ? parseNumericMod(rawBaseAc, 10) : 10;

            const rawAcBonus = resolveValue(blockData.armorAcBonus) ?? frontmatter["DnD_armorAcBonus"];
            const acBonus = (rawAcBonus !== undefined && rawAcBonus !== null && rawAcBonus !== "")
                ? parseNumericMod(rawAcBonus, 0)
                : (hasBaseAc ? 0 : dexMod);

            const acMod = parseNumericMod(resolveValue(blockData.armorAcMod) ?? frontmatter["DnD_armorAcMod"], 0);

            const explicitAc = resolveValue(blockData.armorClass ?? blockData.ac);
            const finalAc = (explicitAc !== undefined && explicitAc !== null && explicitAc !== "" && !isNaN(Number(explicitAc)))
                ? Number(explicitAc)
                : (baseAc + acBonus + acMod);

            const armorName = formatTextValue(resolveValue(blockData.armor) ?? frontmatter["DnD_armor"], "Unarmored");

            cards.push({
                label: "ARMOR CLASS",
                value: String(finalAc),
                sublabel: armorName
            });

            const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
            const DnD_proficiency_bonus = Number(
                resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
            ) || Math.ceil(1 + (level / 4));

            // 2. Initiative (Dexterity Modifier + DnD_initiativeMod / automatic feat & feature modifiers)
            const explicitInit = resolveValue(blockData.initiative);
            const rawInitMod = resolveValue(
                blockData.initiativeMod ?? blockData.DnD_initiative_mod ?? blockData.DnD_initiativeMod
            ) ?? frontmatter["DnD_initiativeMod"];

            let resolvedInitMod = 0;
            if (rawInitMod !== undefined && rawInitMod !== null && String(rawInitMod).trim() !== "") {
                resolvedInitMod = parseNumericMod(rawInitMod, 0);
            } else {
                const statsForInit = extractAbilityScores(frontmatter, blockData, resolveValue);
                const bgFeatForInit = await plugin.resolveBackgroundFeatId(
                    resolveValue(blockData.background) ?? frontmatter["DnD_background"],
                    resolveValue(blockData.backgroundFeat) ?? frontmatter["DnD_backgroundFeat"],
                    plugin.settings
                );
                const initCalc = await plugin.resolveCharacterInitiativeModifiers(
                    frontmatter["DnD_class"],
                    frontmatter["DnD_classLevels"],
                    level,
                    frontmatter["DnD_extraFeats"],
                    bgFeatForInit,
                    frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
                    frontmatter["DnD_race"],
                    frontmatter["DnD_raceLineage"],
                    statsForInit,
                    DnD_proficiency_bonus,
                    frontmatter["DnD_customInitiativeMod"],
                    plugin.settings
                );
                resolvedInitMod = initCalc.totalInitiativeMod;
            }

            const initVal = (explicitInit !== undefined && explicitInit !== null && explicitInit !== "" && !isNaN(Number(explicitInit)))
                ? Number(explicitInit)
                : (dexMod + resolvedInitMod);
            const defaultInitSublabel = resolvedInitMod !== 0
                ? `Dex (${formatSigned(dexMod)}) + Bonus (${formatSigned(resolvedInitMod)})`
                : "Dexterity Modifier";
            const initSublabel = formatTextValue(blockData.initiativeSublabel, defaultInitSublabel);

            cards.push({
                label: "INITIATIVE",
                value: formatSigned(initVal),
                sublabel: initSublabel
            });

            // 3. Attack Roll (Base Ability Mod + Proficiency Bonus + DnD_attack_roll_mod)
            const attackStatRaw = formatTextValue(resolveValue(blockData.attackStat) ?? frontmatter["DnD_attackStat"], "strength").toLowerCase();
            const attackStatScore = Number(resolveValue(blockData[attackStatRaw]) ?? frontmatter[`DnD_${attackStatRaw}`]) || 10;
            const attackStatMod = Math.floor((attackStatScore - 10) / 2);

            const rawIncludeProf = resolveValue(blockData.attackProficiency) ?? frontmatter["DnD_attackProficiency"];
            const includeProf = rawIncludeProf !== undefined && rawIncludeProf !== null && rawIncludeProf !== ""
                ? String(rawIncludeProf).toLowerCase() !== "false" && Boolean(rawIncludeProf)
                : true;

            const DnD_attack_roll_mod = parseNumericMod(
                resolveValue(blockData.attackRollMod ?? blockData.DnD_attack_roll_mod ?? blockData.DnD_attackRollMod) ?? frontmatter["DnD_attackRollMod"],
                0
            );

            const explicitAttack = resolveValue(blockData.attackRoll);
            const totalAttack = (explicitAttack !== undefined && explicitAttack !== null && explicitAttack !== "" && !isNaN(Number(explicitAttack)))
                ? Number(explicitAttack)
                : (attackStatMod + (includeProf ? DnD_proficiency_bonus : 0) + DnD_attack_roll_mod);

            const capStatName = attackStatRaw.charAt(0).toUpperCase() + attackStatRaw.slice(1);
            const attackSublabel = formatTextValue(blockData.attackSublabel, `${capStatName} Modifier`);

            cards.push({
                label: "ATTACK ROLL",
                value: formatSigned(totalAttack),
                sublabel: attackSublabel
            });

            // 4. Speed
            const rawSpeed = resolveValue(blockData.speed) ?? frontmatter["DnD_speed"];
            const rawSpeedMod = parseNumericMod(
                resolveValue(blockData.speedMod ?? blockData.DnD_speed_mod ?? blockData.DnD_speedMod) ?? frontmatter["DnD_speedMod"],
                0
            );
            let speedDisplay = `${30 + rawSpeedMod} feet`;
            if (rawSpeed !== undefined && rawSpeed !== null && String(rawSpeed).trim() !== "") {
                const sTrim = String(rawSpeed).trim();
                speedDisplay = !isNaN(Number(sTrim)) ? `${Number(sTrim) + rawSpeedMod} feet` : sTrim;
            }
            const speedSublabel = formatTextValue(resolveValue(blockData.speedSublabel) ?? frontmatter["DnD_speedSublabel"], "");

            cards.push({
                label: "SPEED",
                value: speedDisplay,
                sublabel: speedSublabel
            });
        } else {
            // --- CHARACTER MODE: RACE, CLASS, BACKGROUND, LEVEL (+ LANGUAGES) ---
            const raceVal = formatTextValue(resolveValue(blockData.race) ?? frontmatter["DnD_race"], "-");
            const raceSub = formatTextValue(resolveValue(blockData.raceLineage ?? blockData.lineage) ?? frontmatter["DnD_raceLineage"], "");

            const classVal = formatTextValue(resolveValue(blockData.class) ?? frontmatter["DnD_class"], "-");
            const classSub = formatTextValue(resolveValue(blockData.subclass) ?? frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"], "");

            const bgVal = formatTextValue(resolveValue(blockData.background) ?? frontmatter["DnD_background"], "-");
            const bgSub = formatTextValue(resolveValue(blockData.backgroundFeat) ?? frontmatter["DnD_backgroundFeat"], "");

            const levelNum = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
            const DnD_proficiency_bonus = Number(
                resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
            ) || Math.ceil(1 + (levelNum / 4));
            const levelSub = formatTextValue(blockData.levelSublabel, `${formatSigned(DnD_proficiency_bonus)} Proficiency`);

            cards.push(
                { label: "RACE", value: raceVal, sublabel: raceSub },
                { label: "CLASS", value: classVal, sublabel: classSub },
                { label: "BACKGROUND", value: bgVal, sublabel: bgSub },
                { label: "LEVEL", value: String(levelNum), sublabel: levelSub }
            );

            languagesStr = formatTextValue(resolveValue(blockData.languages) ?? frontmatter["DnD_languages"], "");
        }

        // Render 4-Column Responsive Grid (splits cleanly into 2x2 if narrow)
        const containerEl = wrapper.createDiv({ cls: "dnd-info-container" });
        const gridEl = containerEl.createDiv({ cls: "dnd-info-grid" });

        const updateGridColumns = () => {
            const width = gridEl.clientWidth;
            if (width <= 0) return;

            const MIN_CARD_WIDTH = 155;
            const GAP_PX = 10;
            const requiredWidth = (4 * MIN_CARD_WIDTH) + (3 * GAP_PX);

            gridEl.classList.toggle("is-2col", width < requiredWidth);
        };

        activeResizeObserver = new ResizeObserver(() => updateGridColumns());
        activeResizeObserver.observe(gridEl);

        // Render Cards
        for (const c of cards) {
            const cardEl = gridEl.createDiv({ cls: "dnd-info-card" });
            cardEl.createDiv({ text: c.label, cls: "dnd-info-card-label" });
            cardEl.createDiv({ text: c.value, cls: "dnd-info-card-value" });

            if (c.sublabel) {
                cardEl.createDiv({ text: c.sublabel, cls: "dnd-info-card-sublabel" });
            }
        }

        // Render Languages Pill Badge in Character Mode
        if (mode === "character" && languagesStr) {
            const langRow = containerEl.createDiv({ cls: "dnd-info-languages-row" });
            const langBadge = langRow.createDiv({ cls: "dnd-info-languages-badge" });
            langBadge.createEl("span", { text: "LANGUAGES", cls: "dnd-info-languages-label" });
            langBadge.createEl("span", { text: languagesStr, cls: "dnd-info-languages-value" });
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
