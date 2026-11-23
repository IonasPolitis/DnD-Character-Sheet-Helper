import { MarkdownPostProcessorContext, MarkdownRenderChild, Notice } from 'obsidian';
import { getClassData } from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    createFrontmatterResolver,
    extractFrontmatterKey,
    parseBlockYaml,
    parseHitDiceState,
    serializeHitDiceState
} from '../helpers';
import { ShortRestModal } from '../modals/rest-note-modals';

export async function processDnDHealthBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    // Persistent session states across frontmatter re-renders
    let manualDeathSavesOpen = false;
    let manualExhaustionOpen = false;
    let deathSaveLeft: boolean[] = [false, false, false];
    let deathSaveRight: boolean[] = [false, false, false];

    const renderContent = async () => {
        const wrapper = document.createElement("div");

        let blockData: Record<string, any> = {};
        try {
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-health block.", cls: "dnd-error-text" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        const resolveValue = createFrontmatterResolver(frontmatter);

        // 1. Resolve health (Max HP), level (DnD_level), and hitDice ([HitDie, SpentCount] in DnD_hitDice)
        const rawMaxHealth = resolveValue(blockData.health ?? blockData.maxHealth);
        const maxHealth = (rawMaxHealth !== undefined && rawMaxHealth !== null && rawMaxHealth !== "" && !isNaN(Number(rawMaxHealth)))
            ? Math.max(1, Number(rawMaxHealth))
            : Math.max(1, Number(frontmatter["DnD_maxHealth"]) || 1);

        const rawLevel = resolveValue(blockData.level ?? blockData.DnD_level);
        const DnD_level = (rawLevel !== undefined && rawLevel !== null && rawLevel !== "" && !isNaN(Number(rawLevel)))
            ? Math.max(1, Number(rawLevel))
            : Math.max(1, Number(frontmatter["DnD_level"]) || 1);

        const rawHitDiceConfig = blockData.hitDice ?? blockData.DnD_hit_dice;
        const targetHitDiceKey = extractFrontmatterKey(rawHitDiceConfig, "DnD_hitDice");

        let fallbackHitDie = "d8";
        if (frontmatter["DnD_class"]) {
            const primaryClass = Array.isArray(frontmatter["DnD_class"]) ? frontmatter["DnD_class"][0] : frontmatter["DnD_class"];
            const classData = await getClassData(plugin.app, plugin.settings, primaryClass);
            if (classData) {
                const chd = classData.HitDice || classData.hitDice || classData.hit_dice;
                if (chd) fallbackHitDie = String(chd).trim();
            }
        }

        const rawHitDice = resolveValue(rawHitDiceConfig) ?? frontmatter[targetHitDiceKey];
        const parsedHd = parseHitDiceState(rawHitDice, fallbackHitDie, DnD_level);
        const DnD_hit_dice = parsedHd.hitDie;
        const spentHitDice = parsedHd.spent;

        // Resolve DnD_current_health from frontmatter.DnD_currentHealth (or block override)
        const targetCurrentHpKey = extractFrontmatterKey(blockData.currentHealth, "DnD_currentHealth");

        const rawCurrentHealth = resolveValue(blockData.currentHealth) ?? frontmatter[targetCurrentHpKey];
        const DnD_current_health = (rawCurrentHealth !== undefined && rawCurrentHealth !== null && rawCurrentHealth !== "" && !isNaN(Number(rawCurrentHealth)))
            ? Math.max(0, Math.min(maxHealth, Number(rawCurrentHealth)))
            : maxHealth;

        // Resolve DnD_tempHealth from frontmatter.DnD_tempHealth (or block override)
        const targetTempHpKey = extractFrontmatterKey(blockData.tempHealth, "DnD_tempHealth");
        const rawTempHealth = resolveValue(blockData.tempHealth) ?? frontmatter[targetTempHpKey];
        const tempHp = (rawTempHealth !== undefined && rawTempHealth !== null && rawTempHealth !== "" && !isNaN(Number(rawTempHealth)))
            ? Math.max(0, Math.floor(Number(rawTempHealth)))
            : 0;

        // Resolve DnD_exhaustion (0..6) from frontmatter.DnD_exhaustion (or block override)
        const targetExhaustionKey = extractFrontmatterKey(blockData.exhaustion, "DnD_exhaustion");
        const rawExhaustion = resolveValue(blockData.exhaustion) ?? frontmatter[targetExhaustionKey];
        const exhaustionLevel = (rawExhaustion !== undefined && rawExhaustion !== null && rawExhaustion !== "" && !isNaN(Number(rawExhaustion)))
            ? Math.max(0, Math.min(6, Math.floor(Number(rawExhaustion))))
            : 0;

        // 2. Build Main Health Card Window
        const healthWindow = wrapper.createDiv({ cls: "dnd-health-window" });

        // Header Label
        healthWindow.createDiv({
            text: "HIT POINTS",
            cls: "dnd-health-label"
        });

        // Current / Max HP Numbers (+ Temp HP badge if active)
        const numbersRow = healthWindow.createDiv({ cls: "dnd-health-numbers" });
        numbersRow.createEl("span", {
            text: String(DnD_current_health),
            cls: "dnd-health-current"
        });
        numbersRow.createEl("span", {
            text: ` / ${maxHealth}`,
            cls: "dnd-health-max"
        });

        if (tempHp > 0) {
            numbersRow.createEl("span", {
                text: ` (+${tempHp} Temp)`,
                cls: "dnd-health-temp"
            });
        }

        // Progress Bar
        const barTrack = healthWindow.createDiv({ cls: "dnd-health-bar-track" });
        const fillPercent = Math.max(0, Math.min(100, (DnD_current_health / maxHealth) * 100));
        const barFill = barTrack.createDiv({ cls: "dnd-health-bar-fill" });
        barFill.style.width = `${fillPercent}%`;

        // Controls Row: Input + Heal / Damage / Temp HP Buttons
        const controlsRow = healthWindow.createDiv({ cls: "dnd-health-controls" });
        const amountInput = controlsRow.createEl("input", {
            type: "number",
            value: "1",
            cls: "dnd-health-input",
            attr: { min: "1" }
        });

        const healBtn = controlsRow.createEl("button", {
            text: "Heal",
            cls: "dnd-health-btn dnd-health-btn-heal"
        });
        const dmgBtn = controlsRow.createEl("button", {
            text: "Damage",
            cls: "dnd-health-btn dnd-health-btn-damage"
        });
        const tempBtn = controlsRow.createEl("button", {
            text: "Temp HP",
            cls: "dnd-health-btn dnd-health-btn-temp"
        });

        healBtn.onclick = async () => {
            const amt = Math.max(0, Number(amountInput.value) || 0);
            if (amt <= 0) return;
            const newHp = Math.min(maxHealth, DnD_current_health + amt);
            if (newHp > 0) {
                deathSaveLeft = [false, false, false];
                deathSaveRight = [false, false, false];
            }
            await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                [targetCurrentHpKey]: newHp
            });
        };

        dmgBtn.onclick = async () => {
            let remainingDmg = Math.max(0, Math.round(Number(amountInput.value) || 0));
            if (remainingDmg <= 0) return;

            // Deduct from Temp HP first
            let nextTempHp = tempHp;
            if (nextTempHp > 0) {
                const absorbed = Math.min(nextTempHp, remainingDmg);
                nextTempHp -= absorbed;
                remainingDmg -= absorbed;
            }

            const newHp = Math.max(0, DnD_current_health - remainingDmg);
            const updates: Record<string, any> = {};
            if (newHp !== DnD_current_health) updates[targetCurrentHpKey] = newHp;
            if (nextTempHp !== tempHp) updates[targetTempHpKey] = nextTempHp;
            if (Object.keys(updates).length > 0) {
                await plugin.updateCharacterFrontmatter(ctx.sourcePath, updates);
            }
        };

        tempBtn.onclick = async () => {
            const amt = Math.max(0, Math.floor(Number(amountInput.value) || 0));
            await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                [targetTempHpKey]: amt
            });
        };

        // 3. Hit Dice Section (persisted in frontmatter as [HitDie, SpentCount])
        healthWindow.createDiv({ cls: "dnd-health-divider" });

        const hitDiceRow = healthWindow.createDiv({ cls: "dnd-health-hitdice-row" });
        hitDiceRow.createEl("span", {
            text: `HIT DICE (${DnD_hit_dice.toUpperCase()} • ${DnD_level - spentHitDice}/${DnD_level})`,
            cls: "dnd-health-hitdice-label"
        });

        const hdPipsContainer = hitDiceRow.createDiv({ cls: "dnd-spell-slots-pips" });
        for (let i = 0; i < DnD_level; i++) {
            const isSpent = i < spentHitDice;
            const pip = hdPipsContainer.createDiv({
                cls: `dnd-slot-pip ${isSpent ? "is-used" : ""}`,
                attr: { title: isSpent ? "Tap to restore Hit Die" : "Tap to spend Hit Die" }
            });

            pip.addEventListener("pointerdown", async (e: PointerEvent) => {
                if (e.button !== 0 && e.pointerType === "mouse") return;
                e.preventDefault();
                e.stopPropagation();
                const newSpent = isSpent
                    ? Math.max(0, spentHitDice - 1)
                    : Math.min(DnD_level, spentHitDice + 1);
                await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                    [targetHitDiceKey]: serializeHitDiceState(DnD_hit_dice, newSpent)
                });
            });
        }

        // 4. Death Saves Section (Shows automatically at 0 HP or when manually toggled)
        const showDeathSaves = DnD_current_health <= 0 || manualDeathSavesOpen;
        if (showDeathSaves) {
            healthWindow.createDiv({ cls: "dnd-health-divider" });

            const deathSavesRow = healthWindow.createDiv({ cls: "dnd-health-deathsaves-row" });

            // Left Pips: Failures (--dnd-ui-color-accent-red in styles.css)
            const leftPips = deathSavesRow.createDiv({ cls: "dnd-spell-slots-pips" });
            for (let i = 0; i < 3; i++) {
                const pip = leftPips.createDiv({
                    cls: `dnd-slot-pip dnd-deathsave-fail ${deathSaveLeft[i] ? "is-used" : ""}`,
                    attr: { title: "Death Save Failure" }
                });
                pip.addEventListener("pointerdown", (e: PointerEvent) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    e.preventDefault();
                    e.stopPropagation();
                    deathSaveLeft[i] = !deathSaveLeft[i];
                    pip.classList.toggle("is-used", deathSaveLeft[i]);
                });
            }

            deathSavesRow.createEl("span", {
                text: "💀",
                cls: "dnd-health-skull"
            });

            // Right Pips: Successes (--dnd-ui-color-accent-teal in styles.css)
            const rightPips = deathSavesRow.createDiv({ cls: "dnd-spell-slots-pips" });
            for (let i = 0; i < 3; i++) {
                const pip = rightPips.createDiv({
                    cls: `dnd-slot-pip dnd-deathsave-success ${deathSaveRight[i] ? "is-used" : ""}`,
                    attr: { title: "Death Save Success" }
                });
                pip.addEventListener("pointerdown", (e: PointerEvent) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    e.preventDefault();
                    e.stopPropagation();
                    deathSaveRight[i] = !deathSaveRight[i];
                    pip.classList.toggle("is-used", deathSaveRight[i]);
                });
            }
        }

        // 4.5. Exhaustion Section (2024 Unified Scale 1–6; shows automatically when Exhaustion > 0 or manually toggled)
        const showExhaustion = exhaustionLevel > 0 || manualExhaustionOpen;
        if (showExhaustion) {
            healthWindow.createDiv({ cls: "dnd-health-divider" });

            const exhaustionRow = healthWindow.createDiv({ cls: "dnd-health-hitdice-row dnd-health-exhaustion-row" });
            const exInfo = exhaustionRow.createDiv({ cls: "dnd-health-exhaustion-info" });
            exInfo.createEl("span", {
                text: `EXHAUSTION (${exhaustionLevel}/6)`,
                cls: "dnd-health-hitdice-label"
            });

            let penaltyText = "(Penalties: -2 on D20 Dice Rolls & -5 feet Speed per Level)";
            if (exhaustionLevel >= 6) {
                penaltyText = "💀 Death (-12 D20 Tests • -30 ft. Speed)";
            } else if (exhaustionLevel > 0) {
                penaltyText = `-${exhaustionLevel * 2} to all D20 Tests • -${exhaustionLevel * 5} ft. Speed`;
            }
            exInfo.createEl("span", {
                text: penaltyText,
                cls: `dnd-health-exhaustion-sub ${exhaustionLevel > 0 ? "is-active" : ""}`
            });

            const exPips = exhaustionRow.createDiv({ cls: "dnd-spell-slots-pips" });
            for (let lvl = 1; lvl <= 6; lvl++) {
                const isActive = lvl <= exhaustionLevel;
                const pip = exPips.createDiv({
                    cls: `dnd-slot-pip dnd-exhaustion-pip ${isActive ? "is-used" : ""}`,
                    attr: {
                        title: lvl === 6
                            ? "Exhaustion Level 6: Death"
                            : `Exhaustion Level ${lvl}: -${lvl * 2} D20 Tests, -${lvl * 5} ft. Speed`
                    }
                });
                pip.addEventListener("pointerdown", async (e: PointerEvent) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    e.preventDefault();
                    e.stopPropagation();
                    const newExhaustion = exhaustionLevel === lvl ? lvl - 1 : lvl;
                    await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                        [targetExhaustionKey]: newExhaustion
                    });
                });
            }
        }

        // 5. Bottom Action Buttons: Short Rest, Long Rest, Death Saves, Exhaustion
        const bottomBar = wrapper.createDiv({ cls: "dnd-health-rest-bar" });

        const shortRestBtn = bottomBar.createEl("button", {
            text: "Short Rest",
            cls: "dnd-health-rest-btn",
            attr: { value: "short-rest" }
        });
        shortRestBtn.onclick = () => {
            new ShortRestModal(plugin.app, plugin, ctx.sourcePath, {
                maxHealth,
                currentHealth: DnD_current_health,
                hitDiceStr: DnD_hit_dice,
                level: DnD_level,
                spentHitDice,
                targetCurrentHpKey,
                targetHitDiceKey,
                onHealAboveZero: () => {
                    deathSaveLeft = [false, false, false];
                    deathSaveRight = [false, false, false];
                }
            }).open();
        };

        const longRestBtn = bottomBar.createEl("button", {
            text: "Long Rest",
            cls: "dnd-health-rest-btn",
            attr: { value: "long-rest" }
        });
        longRestBtn.onclick = async () => {
            manualDeathSavesOpen = false;
            deathSaveLeft = [false, false, false];
            deathSaveRight = [false, false, false];
            const newExhaustion = Math.max(0, exhaustionLevel - 1);
            if (newExhaustion === 0) manualExhaustionOpen = false;

            // 2024 PHB: Long Rest restores half of total Hit Dice (minimum 1)
            const recoveredHd = Math.max(1, Math.floor(DnD_level / 2));
            const newSpentHd = Math.max(0, spentHitDice - recoveredHd);
            const actualRecoveredHd = spentHitDice - newSpentHd;

            await plugin.resetCharacterRestState(ctx.sourcePath, "long", {
                [targetCurrentHpKey]: maxHealth,
                [targetTempHpKey]: 0,
                [targetHitDiceKey]: serializeHitDiceState(DnD_hit_dice, newSpentHd),
                [targetExhaustionKey]: newExhaustion
            });
            renderContent();
            window.dispatchEvent(new Event("long-rest"));

            const restoredItems = ["HP", "Spell Slots", "Feature Uses"];
            if (actualRecoveredHd > 0) {
                restoredItems.push(`${actualRecoveredHd} Hit ${actualRecoveredHd === 1 ? "Die" : "Dice"}`);
            }
            let noticeMsg = `Long Rest completed! ${restoredItems.join(", ")} restored.`;
            if (exhaustionLevel > 0) {
                noticeMsg += ` Exhaustion reduced to ${newExhaustion}.`;
            }
            new Notice(noticeMsg);
        };

        const deathSavesBtn = bottomBar.createEl("button", {
            text: "Death Saves",
            cls: `dnd-health-rest-btn ${showDeathSaves ? "is-active" : ""}`
        });
        deathSavesBtn.onclick = () => {
            manualDeathSavesOpen = !manualDeathSavesOpen;
            renderContent();
        };

        const exhaustionBtn = bottomBar.createEl("button", {
            text: exhaustionLevel > 0 ? `Exhaustion (${exhaustionLevel})` : "Exhaustion",
            cls: `dnd-health-rest-btn ${showExhaustion ? "is-active" : ""}`
        });
        exhaustionBtn.onclick = () => {
            manualExhaustionOpen = !manualExhaustionOpen;
            renderContent();
        };

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
