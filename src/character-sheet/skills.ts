import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../../main';
import { createFrontmatterResolver, parseBlockYaml } from '../helpers';

export async function processDnDSkillsBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    const SKILLS_DEFINITION = [
        { name: "Acrobatics", ability: "dexterity", abbr: "DEX" },
        { name: "Animal Handling", ability: "wisdom", abbr: "WIS" },
        { name: "Arcana", ability: "intelligence", abbr: "INT" },
        { name: "Athletics", ability: "strength", abbr: "STR" },
        { name: "Deception", ability: "charisma", abbr: "CHA" },
        { name: "History", ability: "intelligence", abbr: "INT" },
        { name: "Insight", ability: "wisdom", abbr: "WIS" },
        { name: "Intimidation", ability: "charisma", abbr: "CHA" },
        { name: "Investigation", ability: "intelligence", abbr: "INT" },
        { name: "Medicine", ability: "wisdom", abbr: "WIS" },
        { name: "Nature", ability: "intelligence", abbr: "INT" },
        { name: "Perception", ability: "wisdom", abbr: "WIS" },
        { name: "Performance", ability: "charisma", abbr: "CHA" },
        { name: "Persuasion", ability: "charisma", abbr: "CHA" },
        { name: "Religion", ability: "intelligence", abbr: "INT" },
        { name: "Sleight of Hand", ability: "dexterity", abbr: "DEX" },
        { name: "Stealth", ability: "dexterity", abbr: "DEX" },
        { name: "Survival", ability: "wisdom", abbr: "WIS" }
    ];

    // Normalizes skill names ("sleight-of-hand", "SleightOfHand", "Sleight of Hand" -> "sleight of hand")
    const normalizeSkillKey = (raw: any): string => {
        if (!raw) return "";
        return String(raw)
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/[-_]/g, " ")
            .toLowerCase()
            .trim();
    };

    const renderContent = async () => {
        const wrapper = document.createElement("div");

        let blockData: Record<string, any> = {};
        try {
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-skills block.", cls: "dnd-error-text" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        // Resolves "frontmatter.Key" or "{{ frontmatter.Key }}"
        const resolveValue = createFrontmatterResolver(frontmatter);

        // Recursive Universal Parser for Skill Lists
        const parseSkillMap = (rawInput: any, map = new Map<string, string>()): Map<string, string> => {
            if (rawInput === undefined || rawInput === null) return map;

            const resolved = resolveValue(rawInput);
            if (resolved === undefined || resolved === null) return map;

            if (typeof resolved === "string") {
                const trimmed = resolved.trim();
                if (!trimmed || trimmed.includes("<chosen")) return map;

                if (trimmed.startsWith("[")) {
                    try {
                        const parsedJson = JSON.parse(trimmed);
                        return parseSkillMap(parsedJson, map);
                    } catch {
                        const fallbackArr = trimmed.slice(1, -1).split(",");
                        return parseSkillMap(fallbackArr, map);
                    }
                }

                if (trimmed.includes(",")) {
                    return parseSkillMap(trimmed.split(","), map);
                }

                const skillKey = normalizeSkillKey(trimmed);
                if (skillKey) map.set(skillKey, "");
                return map;
            }

            if (Array.isArray(resolved)) {
                const isTuple =
                    resolved.length === 2 &&
                    typeof resolved[0] === "string" &&
                    !resolved[0].trim().startsWith("[") &&
                    !resolved[0].trim().startsWith("frontmatter.") &&
                    (typeof resolved[1] === "string" || typeof resolved[1] === "number") &&
                    (["class", "background", "extra", "race", "feat"].includes(String(resolved[1]).toLowerCase()) || !isNaN(Number(resolved[1])));

                if (isTuple) {
                    const skillKey = normalizeSkillKey(resolved[0]);
                    const sourceTag = String(resolved[1]);
                    if (skillKey && !skillKey.includes("<chosen")) {
                        map.set(skillKey, sourceTag);
                    }
                } else {
                    for (const item of resolved) {
                        parseSkillMap(item, map);
                    }
                }
            }

            return map;
        };

        // Recursive Universal Parser for Item Bonuses
        const parseBonusesList = (rawInput: any, bonuses: { name: string; target: string; value: number }[] = []): { name: string; target: string; value: number }[] => {
            if (rawInput === undefined || rawInput === null) return bonuses;

            const resolved = resolveValue(rawInput);
            if (resolved === undefined || resolved === null) return bonuses;

            if (typeof resolved === "string") {
                const trimmed = resolved.trim();
                if (!trimmed) return bonuses;

                if (trimmed.startsWith("[")) {
                    try {
                        const parsedJson = JSON.parse(trimmed);
                        return parseBonusesList(parsedJson, bonuses);
                    } catch {
                        return bonuses;
                    }
                }

                if (trimmed.includes("|")) {
                    const parts = trimmed.split("|").map(p => p.trim());
                    if (parts.length >= 3) {
                        const name = parts[0];
                        const target = normalizeSkillKey(parts[1]);
                        const value = Number(parts[2].replace("+", "")) || 0;
                        if (name && target && !name.includes("<Item") && value !== 0) {
                            bonuses.push({ name, target, value });
                        }
                    }
                }
                return bonuses;
            }

            if (Array.isArray(resolved)) {
                const isSingleBonusTuple =
                    resolved.length >= 3 &&
                    typeof resolved[0] === "string" &&
                    typeof resolved[1] === "string" &&
                    !Array.isArray(resolved[0]) &&
                    !resolved[0].trim().startsWith("[") &&
                    !resolved[0].trim().startsWith("frontmatter.");

                if (isSingleBonusTuple) {
                    const name = String(resolved[0]).trim();
                    const target = normalizeSkillKey(resolved[1]);
                    const value = Number(String(resolved[2]).replace("+", "")) || 0;
                    if (name && target && !name.includes("<Item") && value !== 0) {
                        bonuses.push({ name, target, value });
                    }
                } else {
                    for (const item of resolved) {
                        parseBonusesList(item, bonuses);
                    }
                }
                return bonuses;
            }

            if (typeof resolved === "object") {
                const name = String(resolved.name || "Bonus").trim();
                const target = normalizeSkillKey(resolved.target || resolved.skill);
                const value = Number(String(resolved.value ?? resolved.bonus ?? 0).replace("+", "")) || 0;
                if (target && !name.includes("<Item") && value !== 0) {
                    bonuses.push({ name, target, value });
                }
            }

            return bonuses;
        };

        // 1. Resolve variables strictly from the code block's YAML properties
        const profMap = parseSkillMap(blockData.proficiencies);
        const expMap = parseSkillMap(blockData.expertise);
        const halfProfMap = parseSkillMap(blockData.half_proficiencies ?? blockData.halfProficiencies);
        const allBonuses = parseBonusesList(blockData.bonuses);

        // 2. Resolve Level & Proficiency Bonus
        const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
        const DnD_proficiency_bonus = Number(
            resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
        ) || Math.ceil(1 + (level / 4));

        // 3. Render the 2-Column Skills Window
        const skillsWindow = wrapper.createDiv({ cls: "dnd-skills-window" });
        const skillsGrid = skillsWindow.createDiv({ cls: "dnd-skills-grid" });

        for (const skillDef of SKILLS_DEFINITION) {
            const skillKey = normalizeSkillKey(skillDef.name);
            const abilityScore = Number(resolveValue(blockData[skillDef.ability]) ?? frontmatter[`DnD_${skillDef.ability}`]) || 10;
            const abilityMod = Math.floor((abilityScore - 10) / 2);

            const hasExpertise = expMap.has(skillKey);
            const hasProficiency = profMap.has(skillKey);
            const hasHalfProf = halfProfMap.has(skillKey);

            let profContribution = 0;
            let rankTier: "none" | "half" | "proficient" | "expertise" = "none";

            if (hasExpertise) {
                profContribution = DnD_proficiency_bonus * 2;
                rankTier = "expertise";
            } else if (hasProficiency) {
                profContribution = DnD_proficiency_bonus;
                rankTier = "proficient";
            } else if (hasHalfProf) {
                profContribution = Math.floor(DnD_proficiency_bonus / 2);
                rankTier = "half";
            }

            const matchingBonuses = allBonuses.filter(b => b.target === skillKey);
            const itemBonusTotal = matchingBonuses.reduce((sum, b) => sum + b.value, 0);

            const totalMod = abilityMod + profContribution + itemBonusTotal;
            const formattedTotal = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;

            const row = skillsGrid.createDiv({
                cls: `dnd-skill-row ${rankTier !== "none" ? `is-${rankTier}` : ""}`
            });

            const leftSide = row.createDiv({ cls: "dnd-skill-left" });

            leftSide.createEl("span", {
                cls: "dnd-skill-dot",
                attr: { title: rankTier !== "none" ? rankTier.charAt(0).toUpperCase() + rankTier.slice(1) : "Not Proficient" }
            });

            leftSide.createEl("span", { text: skillDef.abbr, cls: "dnd-skill-abbr" });
            leftSide.createEl("span", { text: skillDef.name, cls: "dnd-skill-name" });

            const rightSide = row.createDiv({ cls: "dnd-skill-mod" });
            rightSide.setText(formattedTotal);
        }

        // 4. Render Tool Proficiencies Footer Badge (if present)
        const rawTools = resolveValue(blockData.tools ?? blockData.toolProficiencies) ?? frontmatter["DnD_toolProficiencies"];
        const parseToolsList = (rawVal: any): string[] => {
            if (rawVal === undefined || rawVal === null || rawVal === "") return [];
            if (Array.isArray(rawVal)) {
                return rawVal
                    .map(item => String(resolveValue(item) ?? "").trim())
                    .filter(item => item !== "" && !item.startsWith("<"));
            }
            if (typeof rawVal === "string") {
                const trimmed = rawVal.trim();
                if (!trimmed || trimmed.startsWith("<")) return [];
                if (trimmed.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        return parseToolsList(parsed);
                    } catch {
                        // fall through
                    }
                }
                return trimmed
                    .split(",")
                    .map(s => s.trim())
                    .filter(s => s !== "" && !s.startsWith("<"));
            }
            return [];
        };

        const toolsList = parseToolsList(rawTools);
        if (toolsList.length > 0) {
            const toolsRow = skillsWindow.createDiv({ cls: "dnd-skills-tools-row" });
            const toolsBadge = toolsRow.createDiv({ cls: "dnd-info-languages-badge" });
            toolsBadge.createEl("span", { text: "TOOL PROFICIENCIES", cls: "dnd-info-languages-label" });
            toolsBadge.createEl("span", { text: toolsList.join(", "), cls: "dnd-info-languages-value" });
        }

        el.empty();
        el.appendChild(wrapper);
    };

    renderContent();

    renderChild.registerEvent(
        plugin.app.metadataCache.on("changed", (file) => {
            if (file.path === ctx.sourcePath) renderContent();
        })
    );
}
