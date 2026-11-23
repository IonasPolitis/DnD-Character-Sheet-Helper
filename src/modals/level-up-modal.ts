import { App, Modal, Notice, TFile } from 'obsidian';
import {
    getClassChoiceRouterData,
    getClassData,
    getExtraFeat,
    getRaceData,
    getSubclassData
} from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    ALL_ABILITIES,
    AbilityKey,
    GrantedFeatMilestoneState,
    SpeedModifierBreakdown,
    combineUniqueFeatIds,
    createEmptyGrantedFeatState,
    extractAbilityScores,
    formatSpellTuples,
    mergeSpellTuples,
    parseClassChoicesByRouter,
    parseExtraFeatsList,
    parseFeatAbilityImprovements,
    parseFeatSavingThrowProficiencies,
    parseHitDiceState,
    parseJsonArrayProp,
    parseSavingThrows,
    parseSpellTuples,
    parseStringArray,
    parseWeaponMasteryState,
    serializeClassChoicesByRouter,
    serializeWeaponMasteryState
} from '../helpers';
import { renderGrantedFeatMilestoneCard } from './shared-controls';

export class LevelUpModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;
    currentLevel: number = 1;
    newLevel: number = 2;
    currentMaxHealth: number = 0;
    newMaxHealth: number = 0;
    conMod: number = 0;
    dndClass: string = "";
    hitDie: number = 8; // Safe fallback
    currentSubclass: string = "";
    subclassFmKey: string = "DnD_subclass";

    // Dynamic Milestone Container so selecting a Subclass refreshes choices/feats live
    milestonesContainer!: HTMLElement;

    // Data-Driven Granted Feats & ASI Tracking
    grantedFeatsState: GrantedFeatMilestoneState[] = [];
    currentStats: Record<string, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    originalConMod: number = 0;
    baseMaxHealthChosen: number = 0;
    conHpBonus: number = 0;
    hpInputEl: HTMLInputElement | null = null;
    retroactiveConHpBadge: HTMLElement | null = null;
    speedMilestoneBadge: HTMLElement | null = null;
    weaponMasteryMilestoneBadge: HTMLElement | null = null;
    currentSpeedCalc: SpeedModifierBreakdown | null = null;
    currentMasterySlots: number = 0;

    classChoicesState: { router: string, key: string, level: number, domIndex: number }[] = [];
    classChoicesByRouter: Record<string, [string, string][]> = {};
    // Tracks purely additive Expertise gained at this specific level
    newExpertiseChoices: string[] = [];
    newGrantedExpertiseCount: number = 0;
    expertisePool: string[] = []; // Tracks the allowed JSON pool
    newSpellcastingAbility: string = "";

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Level Up Character", cls: "dnd-section-header" });

        // 1. Fetch current live data from the active sheet
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.currentLevel = Number(frontmatter["DnD_level"]) || 1;
        this.newLevel = this.currentLevel + 1;

        this.currentMaxHealth = Number(frontmatter["DnD_maxHealth"]) || 0;
        this.newMaxHealth = this.currentMaxHealth;
        this.baseMaxHealthChosen = this.newMaxHealth;
        this.conHpBonus = 0;

        const conScore = Number(frontmatter["DnD_constitution"]) || 10;
        this.conMod = Math.floor((conScore - 10) / 2);
        this.originalConMod = this.conMod;

        // Fetch primary class and existing subclass safely (supporting both DnD_subclass and DnD_Subclass)
        const classVal = frontmatter["DnD_class"];
        this.dndClass = (Array.isArray(classVal) ? classVal[0] : classVal) || "";

        this.subclassFmKey = frontmatter["DnD_subclass"] !== undefined
            ? "DnD_subclass"
            : (frontmatter["DnD_Subclass"] !== undefined ? "DnD_Subclass" : "DnD_subclass");
        const subclassVal = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        this.currentSubclass = (Array.isArray(subclassVal) ? subclassVal[0] : subclassVal) || "";

        this.currentStats = extractAbilityScores(frontmatter);

        const bgFeatForBaseline = await this.plugin.resolveBackgroundFeatId(
            frontmatter["DnD_background"],
            frontmatter["DnD_backgroundFeat"],
            this.plugin.settings
        );

        // Fetch current speed breakdown at this.currentLevel for live milestone comparison
        this.currentSpeedCalc = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.currentLevel,
            frontmatter["DnD_extraFeats"],
            bgFeatForBaseline,
            frontmatter["DnD_armor"],
            frontmatter["DnD_speed"],
            frontmatter["DnD_customSpeedMod"],
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );

        const currentMasteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.currentLevel,
            frontmatter["DnD_extraFeats"],
            bgFeatForBaseline,
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        this.currentMasterySlots = currentMasteryCalc.totalSlots;

        // 2. Fetch the Hit Die from frontmatter (DnD_hitDice) or dynamically from the rulebook JSON
        let classData: any = null;
        if (this.dndClass) {
            classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
        }

        const fmHitDiceRaw = frontmatter["DnD_hitDice"] ?? frontmatter["DnD_hit_dice"] ?? frontmatter["hitDice"];
        const classHitDiceStr = classData?.HitDice || classData?.hitDice || classData?.hit_dice || classData?.hitDie || classData?.hit_die;
        const resolvedHdStr = parseHitDiceState(fmHitDiceRaw, classHitDiceStr ? String(classHitDiceStr).trim() : "d8", this.newLevel).hitDie;

        if (resolvedHdStr) {
            const parsed = parseInt(resolvedHdStr.replace(/\D/g, ''));
            if (!isNaN(parsed) && parsed > 0) this.hitDie = parsed;
        }

        // --- Build UI ---
        contentEl.createEl("p", {
            text: `Advancing from Level ${this.currentLevel} to Level ${this.newLevel}.`,
            cls: "dnd-levelup-intro"
        });
        this.speedMilestoneBadge = contentEl.createDiv({ cls: "dnd-asi-hidden" });
        this.weaponMasteryMilestoneBadge = contentEl.createDiv({ cls: "dnd-asi-hidden" });

        // A. Hit Points Section
        const hpDiv = contentEl.createDiv({ cls: "dnd-form-card" });
        hpDiv.createEl("label", {
            text: `New Max HP (Hit Die: d${this.hitDie}, CON: ${this.conMod > 0 ? '+' : ''}${this.conMod}):`,
            cls: "dnd-form-label-sub"
        });

        const hpInputContainer = hpDiv.createDiv({ cls: "dnd-modal-add-bar" });
        const hpInput = hpInputContainer.createEl("input", {
            type: "number",
            value: String(this.newMaxHealth),
            cls: "dnd-flex-1"
        });
        this.hpInputEl = hpInput;

        const averageHpGain = Math.ceil(this.hitDie / 2) + 1 + this.conMod;
        const avgBtn = hpInputContainer.createEl("button", { text: `Take Average (+${averageHpGain})` });
        avgBtn.onclick = async () => {
            this.baseMaxHealthChosen = this.currentMaxHealth + averageHpGain;
            await this.updateRetroactiveConHp();
        };

        hpInput.addEventListener('input', (e) => {
            const val = Number((e.target as HTMLInputElement).value) || 0;
            this.baseMaxHealthChosen = val - this.conHpBonus;
            this.newMaxHealth = val;
        });

        this.retroactiveConHpBadge = hpDiv.createDiv({ cls: "dnd-asi-hidden" });

        // B. Dynamic Subclass Section
        const targetLevel = this.newLevel.toString();
        let newlyGrantedSubclassFile: string | null = null;
        let grantedSubclassFeatureName = "Subclass";

        const newLevelClassFeatures = classData?.features?.[targetLevel];
        if (Array.isArray(newLevelClassFeatures)) {
            for (const feature of newLevelClassFeatures) {
                const grantedSub = feature?.grantedSubclasses ?? feature?.grantedSubclass;
                if (grantedSub && typeof grantedSub === "string") {
                    newlyGrantedSubclassFile = grantedSub.trim().replace(/\.json$/i, "");
                    if (feature.name) grantedSubclassFeatureName = String(feature.name);
                    break;
                }
            }
        }

        if (newlyGrantedSubclassFile) {
            const subDiv = contentEl.createDiv({ cls: "dnd-form-card-active" });
            subDiv.createEl("label", {
                text: `Level ${this.newLevel} ${grantedSubclassFeatureName} (Select Subclass):`,
                cls: "dnd-form-label-bold"
            });

            const subSelect = subDiv.createEl("select", { cls: "dnd-modal-form-input" });
            subSelect.createEl("option", { text: "-- Select a Subclass --", value: "" });

            const allSubclasses = await getSubclassData(this.app, this.plugin.settings, newlyGrantedSubclassFile);
            if (allSubclasses && typeof allSubclasses === "object") {
                Object.keys(allSubclasses).forEach(s => subSelect.createEl("option", { text: s, value: s }));
            }

            subSelect.value = this.currentSubclass || "";
            subSelect.onchange = async (e) => {
                this.currentSubclass = (e.target as HTMLSelectElement).value;
                await this.renderDynamicMilestones(classData, frontmatter);
            };
        }

        // C. Container for Dynamic Class/Subclass Milestones
        this.milestonesContainer = contentEl.createDiv();
        await this.renderDynamicMilestones(classData, frontmatter);

        // D. Finalization Buttons
        const btnDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnDiv.createEl("button", { text: "Complete Level Up", cls: "mod-cta" });
        confirmBtn.onclick = async (e) => {
            e.preventDefault();
            await this.executeLevelUp();
        };
    }

    async updateRetroactiveConHp() {
        let projectedCon = this.currentStats.constitution || 10;

        for (const gfState of this.grantedFeatsState) {
            if (gfState.chosenOptionType === "asi") {
                if (gfState.asiStat1 === "constitution") projectedCon = Math.min(20, projectedCon + 1);
                if (gfState.asiStat2 === "constitution") projectedCon = Math.min(20, projectedCon + 1);
            } else if (gfState.chosenFeatKey) {
                const featData = await getExtraFeat(this.app, this.plugin.settings, gfState.chosenFeatKey);
                if (featData) {
                    const improvements = parseFeatAbilityImprovements(featData);
                    improvements.forEach((imp, idx) => {
                        let targetStat: AbilityKey | null = null;
                        if (!imp.isChoice) {
                            targetStat = imp.options[0];
                        } else if (gfState.abilityChoices[idx]) {
                            targetStat = gfState.abilityChoices[idx];
                        }
                        if (targetStat === "constitution") {
                            projectedCon = Math.min(imp.maxCap, projectedCon + imp.amount);
                        }
                    });
                }
            }
        }

        const newConMod = Math.floor((projectedCon - 10) / 2);
        const modDelta = Math.max(0, newConMod - this.originalConMod);
        this.conHpBonus = modDelta * this.newLevel;

        this.newMaxHealth = this.baseMaxHealthChosen + this.conHpBonus;
        if (this.hpInputEl) {
            this.hpInputEl.value = String(this.newMaxHealth);
        }

        if (this.retroactiveConHpBadge) {
            if (this.conHpBonus > 0) {
                this.retroactiveConHpBadge.className = "dnd-form-hint";
                this.retroactiveConHpBadge.empty();
                this.retroactiveConHpBadge.createEl("strong", {
                    text: `CON Increase Retroactive HP: +${this.conHpBonus} Max HP `
                });
                this.retroactiveConHpBadge.createSpan({
                    text: `(+${modDelta} CON mod × Level ${this.newLevel}) automatically added to Max HP.`
                });
            } else {
                this.retroactiveConHpBadge.className = "dnd-asi-hidden";
                this.retroactiveConHpBadge.empty();
            }
        }
    }

    async updateSpeedMilestoneBadge() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        const currentFeats = combineUniqueFeatIds(
            frontmatter["DnD_extraFeats"],
            this.grantedFeatsState.map(gf => gf.chosenFeatKey).filter(Boolean)
        );
        const bgFeatForMilestone = await this.plugin.resolveBackgroundFeatId(
            frontmatter["DnD_background"],
            frontmatter["DnD_backgroundFeat"],
            this.plugin.settings
        );

        const projectedSpeed = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            currentFeats,
            bgFeatForMilestone,
            frontmatter["DnD_armor"],
            frontmatter["DnD_speed"],
            frontmatter["DnD_customSpeedMod"],
            this.currentSubclass ? [this.currentSubclass] : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]),
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );

        if (this.speedMilestoneBadge && this.currentSpeedCalc) {
            if (projectedSpeed.totalSpeed > this.currentSpeedCalc.totalSpeed) {
                const diff = projectedSpeed.totalSpeed - this.currentSpeedCalc.totalSpeed;
                this.speedMilestoneBadge.className = "dnd-form-hint";
                this.speedMilestoneBadge.empty();
                this.speedMilestoneBadge.createEl("strong", { text: `⚡ Speed Increase: ` });
                this.speedMilestoneBadge.createSpan({
                    text: `${this.currentSpeedCalc.totalSpeed} ft. → ${projectedSpeed.totalSpeed} ft. (+${diff} ft.)`
                });
            } else {
                this.speedMilestoneBadge.className = "dnd-asi-hidden";
                this.speedMilestoneBadge.empty();
            }
        }

        const projectedMastery = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            currentFeats,
            bgFeatForMilestone,
            this.currentSubclass ? [this.currentSubclass] : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]),
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );

        if (this.weaponMasteryMilestoneBadge) {
            if (projectedMastery.totalSlots > this.currentMasterySlots) {
                const diff = projectedMastery.totalSlots - this.currentMasterySlots;
                this.weaponMasteryMilestoneBadge.className = "dnd-form-hint";
                this.weaponMasteryMilestoneBadge.empty();
                this.weaponMasteryMilestoneBadge.createEl("strong", { text: `⚔️ Weapon Mastery Slots: ` });
                this.weaponMasteryMilestoneBadge.createSpan({
                    text: `${this.currentMasterySlots} → ${projectedMastery.totalSlots} (+${diff} Slot${diff > 1 ? 's' : ''} — Manage in Attack Ability tab or Equip Items)`
                });
            } else {
                this.weaponMasteryMilestoneBadge.className = "dnd-asi-hidden";
                this.weaponMasteryMilestoneBadge.empty();
            }
        }
    }

    async renderDynamicMilestones(classData: any, frontmatter: Record<string, any>) {
        this.milestonesContainer.empty();

        this.grantedFeatsState = [];
        this.newGrantedExpertiseCount = 0;
        this.expertisePool = [];
        this.classChoicesState = [];
        this.classChoicesByRouter = {};
        this.newExpertiseChoices = [];
        this.newSpellcastingAbility = "";

        let slotsByRouter: Record<string, { unlockedLevel: number; featureName: string }[]> = {};
        let activeRoutersAtTargetLevel = new Set<string>();
        const grantedFeatMilestones: { featureName: string; grantedFeats: string[] }[] = [];
        const targetLevel = this.newLevel.toString();

        if (classData) {
            let subclassData: any = null;
            const activeSubclassFile = this.plugin.findGrantedSubclass(classData, this.newLevel);
            if (this.currentSubclass && activeSubclassFile) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, activeSubclassFile, this.currentSubclass);
            }

            // Spellcasting Ability Milestone (Class/Subclass takes priority over existing Racial ability when newly unlocked)
            let prevSubclassData: any = null;
            const prevSubVal = frontmatter[this.subclassFmKey] ?? frontmatter["DnD_Subclass"] ?? frontmatter["DnD_subclass"];
            const prevSubclassName = (Array.isArray(prevSubVal) ? prevSubVal[0] : prevSubVal) || "";
            const prevSubclassFile = this.plugin.findGrantedSubclass(classData, this.currentLevel);
            if (prevSubclassName && prevSubclassFile) {
                prevSubclassData = await getSubclassData(this.app, this.plugin.settings, prevSubclassFile, prevSubclassName);
            }

            const prevClassMeta = this.plugin.resolveSpellcastingMetadata(classData, prevSubclassData, this.currentLevel);
            const spellMeta = this.plugin.resolveSpellcastingMetadata(classData, subclassData, this.newLevel);

            const existingRaw = frontmatter["DnD_spellcastingAbility"];
            const existingSpellStr = Array.isArray(existingRaw) ? String(existingRaw[0] || "") : String(existingRaw || "");
            const hasExistingAbility = Boolean(existingSpellStr.trim() && !existingSpellStr.trim().startsWith("<"));
            const unlockedClassCasting = prevClassMeta.spellcastingAbilities.length === 0 && spellMeta.spellcastingAbilities.length > 0;

            let promptAbilities: string[] = [];
            let promptSourceLabel = this.currentSubclass || this.dndClass;
            let isClassOverride = false;

            if (unlockedClassCasting || (!hasExistingAbility && spellMeta.spellcastingAbilities.length > 0)) {
                promptAbilities = [...spellMeta.spellcastingAbilities];
                isClassOverride = unlockedClassCasting && hasExistingAbility;
            } else if (!hasExistingAbility && frontmatter["DnD_race"]) {
                const raceData = await getRaceData(this.app, this.plugin.settings, frontmatter["DnD_race"]);
                const raceMeta = await this.plugin.resolveRaceSpellcastingMetadata(raceData, frontmatter["DnD_raceLineage"], this.newLevel);
                if (raceMeta.spellcastingAbilities.length > 0) {
                    promptAbilities = [...raceMeta.spellcastingAbilities];
                    const linVal = frontmatter["DnD_raceLineage"];
                    const raceVal = frontmatter["DnD_race"];
                    promptSourceLabel = String((Array.isArray(linVal) ? linVal[0] : linVal) || (Array.isArray(raceVal) ? raceVal[0] : raceVal) || "Race");
                }
            }

            if (promptAbilities.length > 0) {
                const spellCard = this.milestonesContainer.createDiv({ cls: "dnd-form-card-active" });
                spellCard.createEl("label", {
                    text: `Spellcasting Ability Unlocked (${promptSourceLabel}):`,
                    cls: "dnd-form-label-bold"
                });

                const spellSelect = spellCard.createEl("select", { cls: "dnd-modal-form-input" });
                spellSelect.createEl("option", { text: "-- Select Spellcasting Ability --", value: "" });
                promptAbilities.forEach((ability: string) => {
                    spellSelect.createEl("option", { text: ability, value: ability });
                });

                const existingCap = existingSpellStr.trim()
                    ? existingSpellStr.trim().charAt(0).toUpperCase() + existingSpellStr.trim().slice(1).toLowerCase()
                    : "";
                if (isClassOverride && existingCap && !promptAbilities.some(a => a.toLowerCase() === existingCap.toLowerCase())) {
                    spellSelect.createEl("option", { text: `${existingCap} (Keep Current)`, value: existingCap });
                }

                if (promptAbilities.length === 1) {
                    this.newSpellcastingAbility = promptAbilities[0];
                    spellSelect.value = this.newSpellcastingAbility;
                }

                spellSelect.onchange = (e) => {
                    this.newSpellcastingAbility = (e.target as HTMLSelectElement).value;
                };

                if (isClassOverride) {
                    spellCard.createEl("small", {
                        text: `Class/Subclass spellcasting takes priority over your existing ability (${existingSpellStr.trim()}). You can switch it anytime in Manage Character.`,
                        cls: "dnd-form-hint"
                    });
                }
            }

            const resolvedRouters = this.plugin.resolveClassChoiceRoutersUpToLevel(classData, subclassData, this.newLevel);
            slotsByRouter = resolvedRouters.slotsByRouter;
            activeRoutersAtTargetLevel = resolvedRouters.activeRoutersAtTargetLevel;

            let levelFeatures: any[] = [];
            if (classData?.features?.[targetLevel]) levelFeatures = levelFeatures.concat(classData.features[targetLevel]);
            if (subclassData?.[targetLevel]) levelFeatures = levelFeatures.concat(subclassData[targetLevel]);

            for (const feature of levelFeatures) {
                if (feature.grantedFeats && Array.isArray(feature.grantedFeats) && feature.grantedFeats.length > 0) {
                    grantedFeatMilestones.push({
                        featureName: feature.name || "Granted Feats",
                        grantedFeats: feature.grantedFeats
                    });
                }

                if (feature.grantedExpertise && Array.isArray(feature.grantedExpertise) && feature.grantedExpertise.length === 2) {
                    this.expertisePool = [...new Set([...this.expertisePool, ...feature.grantedExpertise[0]])];
                    this.newGrantedExpertiseCount += feature.grantedExpertise[1] as number;
                }
            }
        }

        // 1. Class Choices Snapshot Engine (Grouped by Router)
        this.classChoicesByRouter = parseClassChoicesByRouter(frontmatter["DnD_classChoices"]);

        // Resolve any unmapped legacy flat choices against custom homebrew routers if needed
        if (this.classChoicesByRouter["__legacy__"] && this.classChoicesByRouter["__legacy__"].length > 0) {
            const remainingLegacy: [string, string][] = [];
            for (const [legacyKey, legacyLvl] of this.classChoicesByRouter["__legacy__"]) {
                let matchedRouter: string | null = null;
                for (const routerCandidate of Object.keys(slotsByRouter)) {
                    const rData = await getClassChoiceRouterData(this.app, this.plugin.settings, routerCandidate);
                    if (rData && rData[legacyKey] !== undefined) {
                        matchedRouter = routerCandidate;
                        break;
                    }
                }
                if (matchedRouter) {
                    if (!this.classChoicesByRouter[matchedRouter]) this.classChoicesByRouter[matchedRouter] = [];
                    this.classChoicesByRouter[matchedRouter].push([legacyKey, legacyLvl]);
                } else {
                    remainingLegacy.push([legacyKey, legacyLvl]);
                }
            }
            if (remainingLegacy.length > 0) {
                this.classChoicesByRouter["__legacy__"] = remainingLegacy;
            } else {
                delete this.classChoicesByRouter["__legacy__"];
            }
        }

        for (const [routerName, slots] of Object.entries(slotsByRouter)) {
            if (!activeRoutersAtTargetLevel.has(routerName)) continue;

            const routerData = await getClassChoiceRouterData(this.app, this.plugin.settings, routerName);
            const slotCount = slots.length;

            if (routerData && slotCount > 0) {
                const routerDiv = this.milestonesContainer.createDiv({ cls: "dnd-form-card" });
                const displayName = routerName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                routerDiv.createEl("label", { text: `Manage ${displayName} (${slotCount} Slots)`, cls: "dnd-form-label-bold" });
                routerDiv.createEl("small", { text: "Review your choices. If you wish to swap an old choice, select a new one.", cls: "dnd-form-hint-block" });

                const pastChoicesForRouter = this.classChoicesByRouter[routerName] || [];

                for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
                    const selectDiv = routerDiv.createDiv({ cls: "dnd-form-slot-row" });

                    let assignedKey = "";
                    let originalLevel = slots[slotIndex]?.unlockedLevel || this.newLevel;

                    const pastChoice = pastChoicesForRouter[slotIndex];
                    if (pastChoice) {
                        assignedKey = pastChoice[0];
                        originalLevel = Number(pastChoice[1]) || originalLevel;
                    }

                    selectDiv.createEl("small", { text: `Lvl ${originalLevel} Slot:`, cls: "dnd-form-slot-label" });

                    const selectEl = selectDiv.createEl("select", { cls: "dnd-form-slot-select" });
                    selectEl.createEl("option", { text: `-- Select Option --`, value: "" });

                    Object.entries(routerData).forEach(([key, val]) => {
                        selectEl.createEl("option", { text: val as string, value: key });
                    });

                    selectEl.value = assignedKey;
                    this.classChoicesState.push({ router: routerName, key: assignedKey, level: originalLevel, domIndex: slotIndex });

                    selectEl.onchange = (e) => {
                        const newVal = (e.target as HTMLSelectElement).value;
                        const stateObj = this.classChoicesState.find(c => c.router === routerName && c.domIndex === slotIndex);
                        if (stateObj) stateObj.key = newVal;
                    };
                }
            }
        }

        // 2. Additive Expertise UI
        if (this.newGrantedExpertiseCount > 0) {
            const expDiv = this.milestonesContainer.createDiv({ cls: "dnd-form-card" });
            expDiv.createEl("label", { text: `New Expertise Granted (${this.newGrantedExpertiseCount} Choices)`, cls: "dnd-form-label-bold" });
            expDiv.createEl("small", { text: "Select from your known proficiencies to gain Expertise.", cls: "dnd-form-hint-block" });

            const existingProfsRaw = parseJsonArrayProp(frontmatter["DnD_skillProficiencies"]);

            let knownSkills: string[] = [];
            existingProfsRaw.forEach((p: any) => {
                if (Array.isArray(p) && p.length > 0) knownSkills.push(p[0]);
                else if (typeof p === 'string') knownSkills.push(p);
            });

            if (this.expertisePool.length > 0) {
                knownSkills = knownSkills.filter((s: string) => this.expertisePool.map(e => String(e).toLowerCase()).includes(String(s).toLowerCase()));
            }

            const existingExpRaw = parseJsonArrayProp(frontmatter["DnD_skillExpertise"]);
            const currentExpertise = existingExpRaw.map((e: any) => Array.isArray(e) ? String(e[0]).toLowerCase() : String(e).toLowerCase());

            knownSkills = knownSkills.filter(s => !currentExpertise.includes(String(s).toLowerCase()));
            this.newExpertiseChoices = Array(this.newGrantedExpertiseCount).fill("");

            if (knownSkills.length === 0) {
                expDiv.createEl("p", {
                    text: "You have no eligible skill proficiencies available to gain Expertise in.",
                    cls: "dnd-error-text dnd-form-note"
                });
            } else {
                for (let i = 0; i < this.newGrantedExpertiseCount; i++) {
                    const selectDiv = expDiv.createDiv({ cls: "dnd-form-slot-row" });

                    selectDiv.createEl("small", { text: `Choice ${i + 1}:`, cls: "dnd-form-slot-label-sm" });
                    const selectEl = selectDiv.createEl("select", { cls: "dnd-flex-1" });
                    selectEl.createEl("option", { text: `-- Select Expertise --`, value: "" });

                    knownSkills.forEach((skill: string) => {
                        const displaySkill = skill.replace(/\b\w/g, c => c.toUpperCase());
                        selectEl.createEl("option", { text: displaySkill, value: skill });
                    });

                    selectEl.onchange = (e) => {
                        this.newExpertiseChoices[i] = (e.target as HTMLSelectElement).value;
                    };
                }
            }
        }

        // 3. Render Data-Driven Granted Feats / ASI Milestones
        const existingProfsForFeatsRaw = parseJsonArrayProp(frontmatter["DnD_skillProficiencies"]);
        const knownSkillsForFeats: string[] = [];
        existingProfsForFeatsRaw.forEach((p: any) => {
            if (Array.isArray(p) && p.length > 0) knownSkillsForFeats.push(String(p[0]));
            else if (typeof p === "string") knownSkillsForFeats.push(p);
        });
        const existingExpForFeatsRaw = parseJsonArrayProp(frontmatter["DnD_skillExpertise"]);
        const existingExpForFeats = existingExpForFeatsRaw.map((e: any) =>
            Array.isArray(e) ? String(e[0]).toLowerCase() : String(e).toLowerCase()
        );
        const existingSavesForFeats = parseSavingThrows(frontmatter["DnD_classProficiencies"]);

        for (let mIdx = 0; mIdx < grantedFeatMilestones.length; mIdx++) {
            const milestone = grantedFeatMilestones[mIdx];
            const state = createEmptyGrantedFeatState(milestone.featureName, milestone.grantedFeats);
            this.grantedFeatsState.push(state);

            await renderGrantedFeatMilestoneCard({
                app: this.app,
                settings: this.plugin.settings,
                parentEl: this.milestonesContainer,
                headerLabel: `Level ${this.newLevel} Milestone: ${milestone.featureName}`,
                cardCls: "dnd-form-card-active",
                state,
                getCurrentStats: () => {
                    const stats = { ...this.currentStats };
                    for (const otherState of this.grantedFeatsState) {
                        if (otherState === state || !otherState) continue;
                        if (otherState.chosenOptionType === "asi") {
                            if (otherState.asiStat1 && ALL_ABILITIES.includes(otherState.asiStat1 as AbilityKey)) {
                                stats[otherState.asiStat1] = Math.min(20, (stats[otherState.asiStat1] || 10) + 1);
                            }
                            if (otherState.asiStat2 && ALL_ABILITIES.includes(otherState.asiStat2 as AbilityKey)) {
                                stats[otherState.asiStat2] = Math.min(20, (stats[otherState.asiStat2] || 10) + 1);
                            }
                        } else if (otherState.chosenFeatKey && otherState.abilityChoices) {
                            for (const chosenAb of Object.values(otherState.abilityChoices)) {
                                if (chosenAb && ALL_ABILITIES.includes(chosenAb)) {
                                    stats[chosenAb] = Math.min(20, (stats[chosenAb] || 10) + 1);
                                }
                            }
                        }
                    }
                    return stats;
                },
                existingSavingThrows: existingSavesForFeats,
                knownSkillsForExpertise: knownSkillsForFeats,
                getAlreadyUsedExpertise: () => {
                    const used = [
                        ...existingExpForFeats,
                        ...this.newExpertiseChoices.map(c => c.toLowerCase()).filter(Boolean)
                    ];
                    for (const otherState of this.grantedFeatsState) {
                        if (otherState === state || !otherState) continue;
                        for (const exp of otherState.featExpertiseChoices || []) {
                            if (exp) used.push(String(exp).toLowerCase());
                        }
                    }
                    return used;
                },
                onStateChange: async () => {
                    await this.updateRetroactiveConHp();
                    await this.updateSpeedMilestoneBadge();
                }
            });
        }

        if (this.classChoicesState.length > 0 || this.newGrantedExpertiseCount > 0) {
            this.milestonesContainer.createEl("p", {
                text: "Note: Please consult the rulebook regarding swapping choices. Generally, you may only replace one existing choice when you gain a level in a class.",
                cls: "dnd-form-note"
            });
        }

        await this.updateSpeedMilestoneBadge();
    }

    onClose() {
        this.contentEl.empty();
    }

    async executeLevelUp() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        let DnD_proficiency_bonus = Math.ceil(1 + (this.newLevel / 4));
        const hpGain = Math.max(0, this.newMaxHealth - this.currentMaxHealth);
        const existingCurrentHp = frontmatter["DnD_currentHealth"] !== undefined
            ? Number(frontmatter["DnD_currentHealth"])
            : this.currentMaxHealth;
        const DnD_current_health = Math.min(this.newMaxHealth, existingCurrentHp + hpGain);

        const updates: Record<string, any> = {
            "DnD_level": this.newLevel,
            "DnD_maxHealth": this.newMaxHealth,
            "DnD_currentHealth": DnD_current_health,
            [this.subclassFmKey]: this.currentSubclass ? [this.currentSubclass] : []
        };

        if (this.newSpellcastingAbility) {
            updates["DnD_spellcastingAbility"] = this.newSpellcastingAbility;
        }

        // Fetch Class JSON for Proficiency Bonus Progression & Spell Slot Progression
        let classSpellsPoolForLvl: string | null = null;
        if (this.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData) {
                const lvlIdx = Math.max(0, this.newLevel - 1);
                if (Array.isArray(classData.proficiencyBonus) && classData.proficiencyBonus[lvlIdx] !== undefined) {
                    DnD_proficiency_bonus = Number(classData.proficiencyBonus[lvlIdx]) || DnD_proficiency_bonus;
                }

                let subclassDataForSlots: any = null;
                const activeSubclassFile = this.plugin.findGrantedSubclass(classData, this.newLevel);
                if (this.currentSubclass && activeSubclassFile) {
                    subclassDataForSlots = await getSubclassData(this.app, this.plugin.settings, activeSubclassFile, this.currentSubclass);
                }
                const spellMeta = this.plugin.resolveSpellcastingMetadata(classData, subclassDataForSlots, this.newLevel);
                classSpellsPoolForLvl = spellMeta.spellsPool;
                const castingTable = spellMeta.spellcastingTable;

                if (castingTable) {
                    const newSpellData = castingTable[this.newLevel.toString()];
                    if (newSpellData && Array.isArray(newSpellData.slots)) {
                        const slotKey = frontmatter["DnD_spellsSlots"] !== undefined && frontmatter["DnD_spellSlots"] === undefined
                            ? "DnD_spellsSlots"
                            : "DnD_spellSlots";

                        let existingSlots: any = frontmatter[slotKey];
                        if (typeof existingSlots === "string" && existingSlots.trim().startsWith("[")) {
                            try { existingSlots = JSON.parse(existingSlots.trim()); } catch { existingSlots = []; }
                        }
                        if (!Array.isArray(existingSlots)) existingSlots = [];

                        const updatedSlots: [string, string][] = Array.from({ length: 9 }, (_, index) => {
                            const maxStr = String(Number(newSpellData.slots[index]) || 0);
                            let currentUsed = "0";
                            const existingPair = existingSlots[index];
                            if (Array.isArray(existingPair) && existingPair.length >= 2) {
                                currentUsed = String(existingPair[1] || "0");
                            }
                            return [maxStr, currentUsed];
                        });

                        // Save as a JSON string to force Obsidian to keep it as a one-liner!
                        updates[slotKey] = JSON.stringify(updatedSlots);
                    }
                }
            }
        }

        // Grant newly unlocked Racial/Lineage spells in (currentLevel..newLevel] and sync DnD_spellPools
        const raceDataForLvl = frontmatter["DnD_race"]
            ? await getRaceData(this.app, this.plugin.settings, frontmatter["DnD_race"])
            : null;
        const raceIncrementalMeta = await this.plugin.resolveRaceSpellcastingMetadata(
            raceDataForLvl,
            frontmatter["DnD_raceLineage"],
            this.newLevel,
            this.currentLevel + 1
        );
        const raceFullMeta = await this.plugin.resolveRaceSpellcastingMetadata(
            raceDataForLvl,
            frontmatter["DnD_raceLineage"],
            this.newLevel
        );

        if (Object.keys(raceIncrementalMeta.grantedSpellsByLevel).length > 0) {
            const knownMap = parseSpellTuples(frontmatter["DnD_spells"]);
            const preparedMap = parseSpellTuples(frontmatter["DnD_preparedSpells"]);
            const knownChanged = mergeSpellTuples(knownMap, raceIncrementalMeta.grantedSpellsByLevel);
            const preparedChanged = mergeSpellTuples(preparedMap, raceIncrementalMeta.grantedSpellsByLevel);
            if (knownChanged) updates["DnD_spells"] = JSON.stringify(formatSpellTuples(knownMap));
            if (preparedChanged) updates["DnD_preparedSpells"] = JSON.stringify(formatSpellTuples(preparedMap));
        }

        const existingSpellPools = parseStringArray(frontmatter["DnD_spellPools"], true);
        const hasClassPoolAlready = Boolean(
            classSpellsPoolForLvl && existingSpellPools.some(p => p.toLowerCase() === classSpellsPoolForLvl!.toLowerCase())
        );
        const combinedPoolCandidates = [
            ...(classSpellsPoolForLvl && !hasClassPoolAlready ? [classSpellsPoolForLvl] : []),
            ...existingSpellPools,
            ...raceFullMeta.spellsPools
        ];
        const mergedSpellPools = parseStringArray(combinedPoolCandidates, true);
        const poolsDiffer = mergedSpellPools.length !== existingSpellPools.length
            || mergedSpellPools.some((p, idx) => p !== existingSpellPools[idx]);
        if (poolsDiffer && (mergedSpellPools.length > 0 || frontmatter["DnD_spellPools"] !== undefined)) {
            updates["DnD_spellPools"] = mergedSpellPools;
        }

        updates["DnD_proficiencyBonus"] = DnD_proficiency_bonus;

        // Grouped-by-Router Snapshot Output: [ ["<Router>", [ ["<Choice>", "<Level>"], ... ] ], ... ]
        const updatedByRouter: Record<string, [string, string][]> = { ...this.classChoicesByRouter };
        const activeRoutersInState = new Set(this.classChoicesState.map(c => c.router));
        for (const routerName of activeRoutersInState) {
            updatedByRouter[routerName] = this.classChoicesState
                .filter(c => c.router === routerName && c.key !== "")
                .map(c => [String(c.key), String(c.level)]);
        }

        const serializedClassChoices = serializeClassChoicesByRouter(updatedByRouter);
        if (serializedClassChoices.length > 0 || frontmatter["DnD_classChoices"] !== undefined) {
            updates["DnD_classChoices"] = JSON.stringify(serializedClassChoices);
        }

        // Purely Additive Expertise Output (using strings in arrays)
        const existingExpRaw = parseJsonArrayProp(frontmatter["DnD_skillExpertise"]);
        const finalExpertise = existingExpRaw.map((e: any) => Array.isArray(e) ? [String(e[0]), String(e[1])] : e);

        this.newExpertiseChoices.forEach(choice => {
            if (choice) {
                finalExpertise.push([String(choice), String(this.newLevel)]);
            }
        });

        this.grantedFeatsState.forEach(gf => {
            if (gf.featExpertiseChoices && Array.isArray(gf.featExpertiseChoices)) {
                gf.featExpertiseChoices.forEach(choice => {
                    if (choice) {
                        finalExpertise.push([String(choice), String(this.newLevel)]);
                    }
                });
            }
        });

        if (finalExpertise.length > 0) updates["DnD_skillExpertise"] = JSON.stringify(finalExpertise);

        // --- Handle Data-Driven Granted Feats / ASI & Recalculate Unarmed Strike / AC Bonus on Level Up ---
        let existingFeats = parseExtraFeatsList(frontmatter["DnD_extraFeats"]);

        for (const gfState of this.grantedFeatsState) {
            if (gfState.chosenOptionType === "asi") {
                if (gfState.asiStat1 && ALL_ABILITIES.includes(gfState.asiStat1 as AbilityKey)) {
                    const curr1 = this.currentStats[gfState.asiStat1] || 10;
                    this.currentStats[gfState.asiStat1] = Math.max(curr1, Math.min(20, curr1 + 1));
                }
                if (gfState.asiStat2 && ALL_ABILITIES.includes(gfState.asiStat2 as AbilityKey)) {
                    const curr2 = this.currentStats[gfState.asiStat2] || 10;
                    this.currentStats[gfState.asiStat2] = Math.max(curr2, Math.min(20, curr2 + 1));
                }

                Object.keys(this.currentStats).forEach(s => updates[`DnD_${s}`] = this.currentStats[s]);
            } else if (gfState.chosenFeatKey) {
                existingFeats = parseExtraFeatsList([...existingFeats, gfState.chosenFeatKey]);
                updates["DnD_extraFeats"] = [...existingFeats];

                const chosenFeatData = await getExtraFeat(this.app, this.plugin.settings, gfState.chosenFeatKey);
                if (chosenFeatData) {
                    const improvements = parseFeatAbilityImprovements(chosenFeatData);
                    improvements.forEach((entry, idx) => {
                        let targetStat: AbilityKey | null = null;
                        if (!entry.isChoice) {
                            targetStat = entry.options[0];
                        } else if (gfState.abilityChoices[idx]) {
                            targetStat = gfState.abilityChoices[idx];
                        }

                        if (targetStat && ALL_ABILITIES.includes(targetStat)) {
                            const currentVal = this.currentStats[targetStat] || 10;
                            const newVal = Math.min(entry.maxCap, currentVal + entry.amount);
                            this.currentStats[targetStat] = newVal;
                            updates[`DnD_${targetStat}`] = newVal;
                        }
                    });
                }
            }
        }

        // Collect saving throw proficiencies from chosen feats
        const currentSaves = parseSavingThrows(frontmatter["DnD_classProficiencies"]);
        let savesUpdated = false;

        for (const gfState of this.grantedFeatsState) {
            if (gfState.chosenFeatKey) {
                const chosenFeatData = await getExtraFeat(this.app, this.plugin.settings, gfState.chosenFeatKey);
                if (chosenFeatData) {
                    const chosenAbilities = Object.values(gfState.abilityChoices);
                    const firstChoice = chosenAbilities[0];
                    const gainedSaves = parseFeatSavingThrowProficiencies(chosenFeatData, firstChoice);
                    for (const save of gainedSaves) {
                        if (!currentSaves.includes(save)) {
                            currentSaves.push(save);
                            savesUpdated = true;
                        }
                    }
                }
            }
        }

        if (savesUpdated) {
            updates["DnD_classProficiencies"] = JSON.stringify(currentSaves);
        }

        // Always recalculate Unarmed Strike damage (in case scalingDice increased at this level or ASI boosted STR/DEX)
        const currentWeapon = String(frontmatter["DnD_weapon"] || "");
        const safeWeaponName = currentWeapon.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        if (safeWeaponName === "unarmed-strike" || safeWeaponName === "unarmed-strikes") {
            updates["DnD_weaponDamage"] = await this.plugin.resolveUnarmedStrikeDamage(
                frontmatter["DnD_class"] || this.dndClass,
                frontmatter["DnD_classLevels"],
                this.newLevel,
                this.currentStats,
                String(frontmatter["DnD_attackStat"] || "strength"),
                this.plugin.settings
            );
        }

        // Recalculate AC Bonus in case Dexterity/Unarmored Defense stat increased or Unarmored Defense was unlocked
        const currentArmor = String(frontmatter["DnD_armor"] || "");
        const effectiveSubclass = this.currentSubclass
            ? [this.currentSubclass]
            : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]);

        const armorStats = await this.plugin.resolveEquippedArmorStats({
            armorNameInput: currentArmor,
            manualAcInput: frontmatter["DnD_armorAc"],
            classInput: frontmatter["DnD_class"] || this.dndClass,
            classLevelsInput: frontmatter["DnD_classLevels"],
            totalLevel: this.newLevel,
            statsRecord: this.currentStats,
            subclassInput: effectiveSubclass,
            fetchOptions: this.plugin.settings
        });
        if (armorStats.isUnarmored) {
            updates["DnD_armorAc"] = armorStats.armorAc;
        }
        updates["DnD_armorAcBonus"] = armorStats.armorAcBonus;

        const bgFeatForLvlUp = await this.plugin.resolveBackgroundFeatId(
            frontmatter["DnD_background"],
            frontmatter["DnD_backgroundFeat"],
            this.plugin.settings
        );

        // Recalculate deterministic Speed Modifier
        const speedCalc = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            existingFeats,
            bgFeatForLvlUp,
            frontmatter["DnD_armor"],
            frontmatter["DnD_speed"],
            frontmatter["DnD_customSpeedMod"],
            effectiveSubclass,
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        updates["DnD_speedMod"] = speedCalc.totalSpeedMod;

        const masteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            existingFeats,
            bgFeatForLvlUp,
            effectiveSubclass,
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        const existingMasteryState = parseWeaponMasteryState(frontmatter["DnD_weaponMastery"]);
        updates["DnD_weaponMastery"] = serializeWeaponMasteryState(masteryCalc.totalSlots, existingMasteryState.mastered);

        // Recalculate Initiative Modifier on Level Up (Proficiency Bonus, new Feats, or ASI to WIS/etc.)
        const initCalc = await this.plugin.resolveCharacterInitiativeModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            existingFeats,
            bgFeatForLvlUp,
            effectiveSubclass,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"],
            this.currentStats,
            DnD_proficiency_bonus,
            frontmatter["DnD_customInitiativeMod"],
            this.plugin.settings
        );
        updates["DnD_initiativeMod"] = initCalc.totalInitiativeMod;

        // 1. Thread-safe Frontmatter Update
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);

        // 2. Thread-safe Markdown String Update (Expertise in skills block)
        if (finalExpertise.length > 0) {
            const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
            if (file instanceof TFile) {
                const expRegex = /(expertise:\s*\n)([\s\S]*?)(?=\n[ \t]*half_proficiencies:)/;
                const currentContent = await this.app.vault.cachedRead(file);
                if (expRegex.test(currentContent)) {
                    await this.app.vault.process(file, (content) => {
                        const expInject = finalExpertise.map((e: any) => `  - ${e[0]}`).join('\n') + '\n';
                        return content.replace(expRegex, `$1${expInject}`);
                    });
                }
            }
        }

        new Notice(`Successfully leveled up to Level ${this.newLevel}!`);
        this.close();
    }
}
