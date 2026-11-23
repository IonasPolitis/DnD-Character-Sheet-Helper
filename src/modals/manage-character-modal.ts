import { App, Modal, Notice, TFile } from 'obsidian';
import {
    FeatPoolEntry,
    getAvailableFeats,
    getBackgroundData,
    getClassChoiceData,
    getClassData,
    getExtraFeat,
    getFeatMapData,
    getRaceData,
    getSubclassData
} from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    AbilityKey,
    SpeedModifierBreakdown,
    WeaponMasteryState,
    extractAbilityScores,
    flattenClassChoices,
    formatFeatureOrSlug,
    normalizeFeatKey,
    parseExtraFeatsList,
    parseJsonArrayProp,
    parseSavingThrows,
    parseStringArray,
    parseWeaponMasteryState,
    populateGroupedFeatSelect,
    sanitizeWeaponSlug,
    serializeWeaponMasteryState
} from '../helpers';
import { NoteModal } from './rest-note-modals';

export type ManageTabId = "stats" | "attack" | "ac" | "speed" | "skills" | "feats" | "items" | "features";

const MANAGE_TABS: readonly { id: ManageTabId; label: string; icon: string }[] = [
    { id: "stats", label: "Ability Scores", icon: "🖋️" },
    { id: "attack", label: "Attack Ability", icon: "🎯" },
    { id: "ac", label: "Armor Class Mod", icon: "🛡️" },
    { id: "speed", label: "Speed", icon: "🏃" },
    { id: "skills", label: "Skills", icon: "🔨" },
    { id: "feats", label: "Feats", icon: "✨" },
    { id: "items", label: "Items", icon: "🎒" },
    { id: "features", label: "Hide Features", icon: "📜" }
];

// --- CONSOLIDATED MANAGE CHARACTER MODAL ---
export class ManageCharacterModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    // Tab Navigation State
    activeTab: ManageTabId = "stats";

    // --- Unified Data State ---
    cachedFrontmatter: Record<string, any> = {};
    // 1. Stats State
    currentStats: Record<string, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    // 1b. Saving Throws State
    currentSavingThrows: AbilityKey[] = [];
    // 2. AC State
    currentAcMod: number = 0;
    // 2b. Speed & Initiative State
    currentSpeed: number = 30;
    currentSpeedMod: number = 0;
    currentCustomSpeedMod: number = 0;
    speedBreakdown: SpeedModifierBreakdown | null = null;
    currentInitiativeMod: number = 0;
    currentCustomInitiativeMod: number = 0;
    initiativeBreakdown: { source: string; amount: number }[] = [];
    // 3. Attack State
    currentAttackStat: string = "strength";
    currentSpellcastingAbility: string = "";
    addAttackProficiency: boolean = true;
    extraAttackMod: number = 0;
    weaponMasteryState: WeaponMasteryState = { available: 0, mastered: [] };
    weaponMasteryBreakdown: { source: string; count: number }[] = [];
    availableMasteryWeapons: { id: string; name: string; mastery: string }[] = [];
    // 4. Skills & Tools State
    currentExtraSkills: string[] = [];
    currentToolProficiencies: string[] = [];
    availableTools: string[] = [];
    baseProficiencies: [string, string][] = [];
    allSkills = [
        "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
        "History", "Insight", "Intimidation", "Investigation", "Medicine",
        "Nature", "Perception", "Performance", "Persuasion", "Religion",
        "Sleight of Hand", "Stealth", "Survival"
    ];
    // 4b. Extra Feats State (DnD_extraFeats)
    currentExtraFeats: string[] = [];
    availableFeats: FeatPoolEntry[] = [];
    featDisplayMap: Record<string, FeatPoolEntry> = {};
    // 5. Item Bonuses State (Strictly Strings)
    currentSkillBonuses: [string, string, string][] = [];
    // 6. Hidden Features State
    currentHiddenFeatures: string[] = [];
    availableFeaturesToHide: string[] = [];

    contentContainer!: HTMLElement;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl } = this;

        this.modalEl.addClass("dnd-manage-modal", "dnd-spellbook-modal");
        contentEl.createEl("h3", { text: "Manage Character", cls: "dnd-section-header dnd-modal-header" });

        // --- FETCH ALL DATA ONCE ---
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};
        this.cachedFrontmatter = frontmatter;

        // Fetch Stats
        this.currentStats = extractAbilityScores(frontmatter);

        // Fetch Saving Throw Proficiencies
        this.currentSavingThrows = parseSavingThrows(frontmatter["DnD_classProficiencies"]);

        // Fetch AC
        this.currentAcMod = Number(frontmatter["DnD_armorAcMod"]) || 0;

        // Fetch Speed baseline
        this.currentSpeed = frontmatter["DnD_speed"] !== undefined && frontmatter["DnD_speed"] !== "" && !isNaN(Number(frontmatter["DnD_speed"]))
            ? Number(frontmatter["DnD_speed"])
            : 30;
        this.currentSpeedMod = Number(frontmatter["DnD_speedMod"]) || 0;

        // Fetch Extra Feats (DnD_extraFeats) & build feat catalog / display metadata
        this.currentExtraFeats = parseExtraFeatsList(frontmatter["DnD_extraFeats"]);
        this.availableFeats = await getAvailableFeats(this.app, this.plugin.settings);
        this.featDisplayMap = {};
        for (const f of this.availableFeats) {
            this.featDisplayMap[normalizeFeatKey(f.id)] = f;
            const nameSlug = normalizeFeatKey(f.name);
            if (nameSlug && !this.featDisplayMap[nameSlug]) {
                this.featDisplayMap[nameSlug] = f;
            }
        }
        for (const existingFeat of this.currentExtraFeats) {
            const slug = normalizeFeatKey(existingFeat);
            if (!slug || this.featDisplayMap[slug]) continue;
            const resolvedFeat = await getExtraFeat(this.app, this.plugin.settings, existingFeat);
            this.featDisplayMap[slug] = {
                id: existingFeat,
                name: resolvedFeat?.name ? String(resolvedFeat.name).trim() : formatFeatureOrSlug(existingFeat),
                category: resolvedFeat?.category ? String(resolvedFeat.category).trim() : ""
            };
        }

        // Fetch Attack & Spellcasting Ability
        this.extraAttackMod = Number(frontmatter["DnD_attackRollMod"]) || 0;
        if (frontmatter["DnD_attackStat"]) {
            this.currentAttackStat = String(frontmatter["DnD_attackStat"]).toLowerCase().trim();
        }
        const rawSpellAb = Array.isArray(frontmatter["DnD_spellcastingAbility"])
            ? frontmatter["DnD_spellcastingAbility"][0]
            : frontmatter["DnD_spellcastingAbility"];
        if (rawSpellAb && !String(rawSpellAb).trim().startsWith("<")) {
            const cleanSpellAb = String(rawSpellAb).trim();
            if (cleanSpellAb) {
                this.currentSpellcastingAbility = cleanSpellAb.charAt(0).toUpperCase() + cleanSpellAb.slice(1).toLowerCase();
            }
        }

        // Fetch Weapon Mastery State & Feat-dependent breakdowns
        this.weaponMasteryState = parseWeaponMasteryState(frontmatter["DnD_weaponMastery"]);
        await this.refreshFeatDependentState(frontmatter, true);

        const catalog = await this.plugin.loadRulebookEquipmentCatalog();
        this.availableMasteryWeapons = catalog.masteryWeapons;
        this.availableTools = catalog.tools;

        // Fetch Tool Proficiencies from Frontmatter (DnD_toolProficiencies)
        this.currentToolProficiencies = parseStringArray(frontmatter["DnD_toolProficiencies"]);

        // Fetch Skills from Frontmatter Database (Force Strings)
        const profsRaw = parseJsonArrayProp(frontmatter["DnD_skillProficiencies"]);
        profsRaw.forEach((p: any) => {
            if (Array.isArray(p) && p.length > 0) {
                if (String(p[1]) === "extra") this.currentExtraSkills.push(String(p[0]).toLowerCase());
                else this.baseProficiencies.push([String(p[0]).toLowerCase(), String(p[1])]);
            } else if (typeof p === 'string') {
                this.baseProficiencies.push([String(p).toLowerCase(), "class"]); // Safe fallback for 1D arrays
            }
        });

        // Fetch Skill Bonuses from Frontmatter Database (Force Strings)
        const bonusesRaw = parseJsonArrayProp(frontmatter["DnD_skillBonuses"]);
        this.currentSkillBonuses = bonusesRaw.map((b: any) => [String(b[0]), String(b[1]), String(b[2])]);

        // Fetch Attack Proficiency toggle from frontmatter (defaults to true)
        this.addAttackProficiency = frontmatter["DnD_attackProficiency"] !== undefined
            ? Boolean(frontmatter["DnD_attackProficiency"])
            : true;

        // Fetch Hidden Features from Frontmatter Database (DnD_hideFeature)
        this.currentHiddenFeatures = parseStringArray(frontmatter["DnD_hideFeature"]);

        // --- BUILD TAB HEADER ---
        const tabHeader = contentEl.createDiv({ cls: "dnd-modal-tabs" });

        for (const tab of MANAGE_TABS) {
            const btn = tabHeader.createEl("button", {
                text: `${tab.icon} ${tab.label}`,
                cls: "dnd-modal-tab-btn dnd-manage-tab-btn"
            });
            btn.dataset.tabId = tab.id;
            btn.onclick = async () => {
                this.activeTab = tab.id;
                this.renderTabs(tabHeader);
                if (tab.id === "speed") {
                    await this.refreshFeatDependentState(this.cachedFrontmatter, false);
                }
                this.renderContent();
            };
        }

        // --- FIXED CONTENT CONTAINER ---
        this.contentContainer = contentEl.createDiv({ cls: "dnd-manage-content" });

        // --- FOOTER BUTTONS ---
        const btnDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });

        const hiBtn = btnDiv.createEl("button", {
            text: this.plugin.activeHeroicInspiration.has(this.sourcePath)
                ? "✨ Heroic Inspiration: ON"
                : "Grant Heroic Inspiration",
            cls: this.plugin.activeHeroicInspiration.has(this.sourcePath) ? "is-active" : ""
        });
        hiBtn.onclick = () => {
            const nextState = !this.plugin.activeHeroicInspiration.has(this.sourcePath);
            this.plugin.setHeroicInspiration(this.sourcePath, nextState);
            hiBtn.setText(nextState ? "✨ Heroic Inspiration: ON" : "Grant Heroic Inspiration");
            hiBtn.classList.toggle("is-active", nextState);
            new Notice(nextState ? "Heroic Inspiration added to Inventory!" : "Heroic Inspiration removed.");
        };

        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = btnDiv.createEl("button", { text: "Save All Changes", cls: "mod-cta" });
        saveBtn.onclick = async (e) => {
            e.preventDefault();
            await this.saveAllChanges();
        };

        this.renderTabs(tabHeader);
        this.renderContent();
    }

    async fetchAvailableFeatures(frontmatter: Record<string, any>) {
        const discovered = new Set<string>();
        const level = Number(frontmatter["DnD_level"]) || 1;
        const dndClass = frontmatter["DnD_class"];
        const subclass = frontmatter["DnD_subclass"];
        const classLevels = frontmatter["DnD_classLevels"];
        const race = frontmatter["DnD_race"];
        const raceLineage = frontmatter["DnD_raceLineage"];
        const background = frontmatter["DnD_background"];
        const extraFeats = frontmatter["DnD_extraFeats"];

        const classChoicesFlat = flattenClassChoices(frontmatter["DnD_classChoices"]);

        const classArray = Array.isArray(dndClass) ? dndClass : (dndClass ? [dndClass] : []);
        const rawSubclassArray = Array.isArray(subclass) ? subclass : (subclass ? [subclass] : []);
        const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

        let finalExtraFeats = parseExtraFeatsList(extraFeats);
        const modalFeatRouterCache = new Map<string, boolean>();

        // 1. Class, Subclass & Class Choices Features
        for (let index = 0; index < classArray.length; index++) {
            const className = classArray[index];
            const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                ? Number(classLevels[index])
                : level;

            const classData = await getClassData(this.app, this.plugin.settings, className);
            if (!classData || !classData.features) continue;

            let subclassData: any = null;
            let hasActiveSubclass = false;
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, currentClassLevel);
            if (grantedSubclassFile && subclassArray[index]) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile, subclassArray[index]);
                if (subclassData) {
                    hasActiveSubclass = true;
                }
            }

            for (let i = 1; i <= currentClassLevel; i++) {
                const levelFeatures = classData.features[i.toString()];
                if (Array.isArray(levelFeatures)) {
                    for (const feature of levelFeatures) {
                        const autoFeat = await this.plugin.extractSingleAutoGrantedFeat(feature.grantedFeats, this.plugin.settings, modalFeatRouterCache);
                        if (autoFeat) finalExtraFeats.push(autoFeat);
                        if (feature.hide !== true && feature.name) {
                            discovered.add(String(feature.name).trim());
                        }
                    }
                }

                // Class Choices at this level
                for (const choiceEntry of classChoicesFlat) {
                    const choiceKey = choiceEntry.key;
                    const choiceLevel = choiceEntry.level;
                    if (Number(choiceLevel) === i && choiceKey) {
                        const featureData = await getClassChoiceData(this.app, this.plugin.settings, choiceKey);
                        if (featureData && featureData.name && featureData.hide !== true) {
                            discovered.add(String(featureData.name).trim());
                        }
                    }
                }

                // Subclass Features at this level
                if (hasActiveSubclass && subclassData) {
                    const subLevelFeatures = subclassData[i.toString()];
                    if (Array.isArray(subLevelFeatures)) {
                        for (const feature of subLevelFeatures) {
                            const autoFeat = await this.plugin.extractSingleAutoGrantedFeat(feature.grantedFeats, this.plugin.settings, modalFeatRouterCache);
                            if (autoFeat) finalExtraFeats.push(autoFeat);
                            if (feature.hide !== true && feature.name) {
                                discovered.add(String(feature.name).trim());
                            }
                        }
                    }
                }
            }
        }

        // 2. Race Traits
        if (race) {
            const raceData = await getRaceData(this.app, this.plugin.settings, race);
            const raceTraits = raceData?.traits || raceData?.features;
            if (Array.isArray(raceTraits)) {
                for (const trait of raceTraits) {
                    if (trait.lineage) {
                        if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) continue;
                    }
                    const autoFeat = await this.plugin.extractSingleAutoGrantedFeat(trait.grantedFeats, this.plugin.settings, modalFeatRouterCache);
                    if (autoFeat) finalExtraFeats.push(autoFeat);
                    if (trait.hide !== true && trait.name) {
                        discovered.add(String(trait.name).trim());
                    }
                }
            }
        }

        // 3. Background Feat
        if (background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, background);
            const featData = bgData && bgData.feat ? await getExtraFeat(this.app, this.plugin.settings, bgData.feat) : null;
            if (featData && featData.hide !== true && featData.name) {
                discovered.add(String(featData.name).trim());
            }
        }

        // 4. Extra & Granted Feats
        const uniqueFeats = [...new Set(finalExtraFeats)];
        for (const featId of uniqueFeats) {
            if (!featId || featId === "ability-score-improvement") continue;
            const safeFeatId = String(featId);

            const isRouter = !!(await getFeatMapData(this.app, this.plugin.settings, safeFeatId));
            if (isRouter) continue;

            const featData = await getExtraFeat(this.app, this.plugin.settings, safeFeatId);
            if (featData && featData.hide !== true && featData.name) {
                discovered.add(String(featData.name).trim());
            }
        }

        this.availableFeaturesToHide = Array.from(discovered);
    }

    /** Recomputes feat-dependent breakdowns (Speed, Initiative, Weapon Mastery, Hide Features) from `this.currentExtraFeats`. */
    async refreshFeatDependentState(frontmatter: Record<string, any>, isInitialLoad: boolean) {
        const charLevel = Number(frontmatter["DnD_level"]) || 1;
        const profBonus = Number(frontmatter["DnD_proficiencyBonus"]) || Math.ceil(1 + (charLevel / 4));
        const subclassVal = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        const bgFeat = await this.plugin.resolveBackgroundFeatId(
            frontmatter["DnD_background"],
            frontmatter["DnD_backgroundFeat"],
            this.plugin.settings
        );

        this.speedBreakdown = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"],
            frontmatter["DnD_classLevels"],
            charLevel,
            this.currentExtraFeats,
            bgFeat,
            frontmatter["DnD_armor"],
            this.currentSpeed,
            0,
            subclassVal,
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        const autoSpeedBonus = (this.speedBreakdown?.classSpeedBonus || 0) + (this.speedBreakdown?.featSpeedBonus || 0);
        if (isInitialLoad) {
            if (frontmatter["DnD_customSpeedMod"] !== undefined && frontmatter["DnD_customSpeedMod"] !== null && frontmatter["DnD_customSpeedMod"] !== "") {
                this.currentCustomSpeedMod = Number(frontmatter["DnD_customSpeedMod"]) || 0;
            } else {
                const legacyMod = Number(frontmatter["DnD_speedMod"]) || 0;
                this.currentCustomSpeedMod = legacyMod - autoSpeedBonus;
            }
        }
        this.currentSpeedMod = autoSpeedBonus + this.currentCustomSpeedMod;

        const initCalc = await this.plugin.resolveCharacterInitiativeModifiers(
            frontmatter["DnD_class"],
            frontmatter["DnD_classLevels"],
            charLevel,
            this.currentExtraFeats,
            bgFeat,
            subclassVal,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"],
            this.currentStats,
            profBonus,
            0,
            this.plugin.settings
        );
        this.initiativeBreakdown = initCalc.breakdown;
        if (isInitialLoad) {
            if (frontmatter["DnD_customInitiativeMod"] !== undefined && frontmatter["DnD_customInitiativeMod"] !== null && frontmatter["DnD_customInitiativeMod"] !== "") {
                this.currentCustomInitiativeMod = Number(frontmatter["DnD_customInitiativeMod"]) || 0;
            } else if (frontmatter["DnD_initiativeMod"] !== undefined && frontmatter["DnD_initiativeMod"] !== null && frontmatter["DnD_initiativeMod"] !== "") {
                this.currentCustomInitiativeMod = (Number(frontmatter["DnD_initiativeMod"]) || 0) - initCalc.autoBonus;
            } else {
                this.currentCustomInitiativeMod = 0;
            }
        }
        this.currentInitiativeMod = initCalc.autoBonus + this.currentCustomInitiativeMod;

        const masteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"],
            frontmatter["DnD_classLevels"],
            charLevel,
            this.currentExtraFeats,
            bgFeat,
            subclassVal,
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        this.weaponMasteryState.available = masteryCalc.totalSlots;
        this.weaponMasteryBreakdown = masteryCalc.breakdown;

        await this.fetchAvailableFeatures({
            ...frontmatter,
            DnD_extraFeats: this.currentExtraFeats
        });
    }

    renderTabs(tabHeader: HTMLElement) {
        const buttons = tabHeader.querySelectorAll("button");

        buttons.forEach((btn) => {
            btn.classList.toggle("is-active", (btn as HTMLElement).dataset.tabId === this.activeTab);
        });
    }

    renderContent() {
        this.contentContainer.empty();

        if (this.activeTab === "stats") {
            this.contentContainer.createEl("h4", { text: "Base Ability Scores", cls: "dnd-manage-section-title" });
            const statsGrid = this.contentContainer.createDiv({ cls: "dnd-form-grid-3" });

            const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
            statsList.forEach(stat => {
                const statDiv = statsGrid.createDiv();
                const displayStat = stat.charAt(0).toUpperCase() + stat.slice(1);
                statDiv.createEl("label", { text: displayStat, cls: "dnd-form-label-sub" });

                const statInput = statDiv.createEl("input", {
                    type: "number",
                    value: String(this.currentStats[stat]),
                    cls: "dnd-modal-form-input"
                });
                statInput.oninput = (e) => this.currentStats[stat] = Number((e.target as HTMLInputElement).value);
            });

            this.contentContainer.createEl("h4", { text: "Saving Throw Proficiencies", cls: "dnd-manage-section-title" });
            const savesGrid = this.contentContainer.createDiv({ cls: "dnd-form-grid-3" });
            (statsList as AbilityKey[]).forEach(stat => {
                const row = savesGrid.createDiv({ cls: "dnd-form-row" });
                const checkbox = row.createEl("input", { type: "checkbox" });
                checkbox.checked = this.currentSavingThrows.includes(stat);
                checkbox.onchange = (e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    if (checked) {
                        if (!this.currentSavingThrows.includes(stat)) this.currentSavingThrows.push(stat);
                    } else {
                        this.currentSavingThrows = this.currentSavingThrows.filter(s => s !== stat);
                    }
                };
                const displayStat = stat.charAt(0).toUpperCase() + stat.slice(1);
                row.createEl("label", { text: displayStat });
            });
        }

        else if (this.activeTab === "attack") {
            this.contentContainer.createEl("h4", { text: "Attack Roll Formula", cls: "dnd-manage-section-title" });

            const statDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            statDiv.createEl("label", { text: "Base Attack Ability:", cls: "dnd-form-label-sub" });
            const selectEl = statDiv.createEl("select", { cls: "dnd-modal-form-input" });
            const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
            stats.forEach(stat => selectEl.createEl("option", { text: stat.charAt(0).toUpperCase() + stat.slice(1), value: stat }));
            selectEl.value = this.currentAttackStat;
            selectEl.onchange = (e) => this.currentAttackStat = (e.target as HTMLSelectElement).value;

            const profDiv = this.contentContainer.createDiv({ cls: "dnd-form-row" });
            const profToggle = profDiv.createEl("input", { type: "checkbox" });
            profToggle.checked = this.addAttackProficiency;
            profToggle.onchange = (e) => this.addAttackProficiency = (e.target as HTMLInputElement).checked;
            profDiv.createEl("label", { text: "Add Proficiency Bonus" });

            const modDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            modDiv.createEl("label", { text: "Extra Modifier (Magic Weapons, Buffs):", cls: "dnd-form-label-sub" });
            const modInput = modDiv.createEl("input", {
                type: "number",
                value: String(this.extraAttackMod),
                cls: "dnd-modal-form-input"
            });
            modInput.oninput = (e) => this.extraAttackMod = Number((e.target as HTMLInputElement).value);

            // Spellcasting Ability Override Section
            this.contentContainer.createEl("h4", { text: "Spellcasting Ability", cls: "dnd-manage-section-title dnd-mt-15" });
            const spellAbDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            spellAbDiv.createEl("label", { text: "Primary Spellcasting Ability:", cls: "dnd-form-label-sub" });
            const spellAbSelect = spellAbDiv.createEl("select", { cls: "dnd-modal-form-input" });
            spellAbSelect.createEl("option", { text: "-- None --", value: "" });
            const spellAbilities = ["Intelligence", "Wisdom", "Charisma", "Strength", "Dexterity", "Constitution"];
            spellAbilities.forEach(ab => spellAbSelect.createEl("option", { text: ab, value: ab }));
            if (this.currentSpellcastingAbility && !spellAbilities.includes(this.currentSpellcastingAbility)) {
                spellAbSelect.createEl("option", { text: this.currentSpellcastingAbility, value: this.currentSpellcastingAbility });
            }
            spellAbSelect.value = this.currentSpellcastingAbility || "";
            spellAbSelect.onchange = (e) => this.currentSpellcastingAbility = (e.target as HTMLSelectElement).value;
            spellAbDiv.createEl("small", {
                text: "Overrides the automatic Class/Subclass or Race spellcasting ability and controls your Spell Save DC & Spellbook access.",
                cls: "dnd-form-hint"
            });

            // Weapon Masteries Management Section
            const masteryHeaderRow = this.contentContainer.createDiv({ cls: "dnd-flex-between dnd-mt-15" });
            masteryHeaderRow.createEl("h4", {
                text: `Weapon Masteries (${this.weaponMasteryState.mastered.length} / ${this.weaponMasteryState.available} Slots Used)`,
                cls: "dnd-manage-section-title"
            });
            const viewMasteriesLink = masteryHeaderRow.createEl("a", {
                text: "📖 View Weapon Masteries",
                cls: "dnd-note-link dnd-form-hint",
                href: "#"
            });
            viewMasteriesLink.onclick = (e) => {
                e.preventDefault();
                new NoteModal(this.app, this.plugin, "weapon-masteries").open();
            };

            if (this.weaponMasteryBreakdown.length > 0) {
                const sourcesText = this.weaponMasteryBreakdown.map(b => `${b.source} (${b.count})`).join(" • ");
                this.contentContainer.createEl("small", {
                    text: `Unlocked from: ${sourcesText}`,
                    cls: "dnd-form-hint"
                });
            }

            const masteryListDiv = this.contentContainer.createDiv({ cls: "dnd-modal-list dnd-form-group" });
            if (this.weaponMasteryState.mastered.length === 0) {
                masteryListDiv.createEl("p", {
                    text: this.weaponMasteryState.available > 0
                        ? "No weapons mastered yet. Select a weapon below to master it."
                        : "Your character does not currently have any unlocked Weapon Mastery slots.",
                    cls: "dnd-modal-empty-text"
                });
            } else {
                this.weaponMasteryState.mastered.forEach((slug) => {
                    const matched = this.availableMasteryWeapons.find(w => w.id === slug || sanitizeWeaponSlug(w.name) === slug);
                    const displayLabel = matched
                        ? `${matched.name} (${matched.mastery})`
                        : formatFeatureOrSlug(slug);

                    const itemRow = masteryListDiv.createDiv({ cls: "dnd-modal-list-item" });
                    itemRow.createEl("span", { text: displayLabel });

                    const removeBtn = itemRow.createEl("button", { text: "✕", cls: "dnd-btn-danger" });
                    removeBtn.onclick = () => {
                        this.weaponMasteryState.mastered = this.weaponMasteryState.mastered.filter(s => s !== slug);
                        this.renderContent();
                    };
                });
            }

            const addMasteryBar = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const masterySelect = addMasteryBar.createEl("select", { cls: "dnd-flex-1" });
            masterySelect.createEl("option", { text: "-- Select Weapon to Master --", value: "" });

            const canAddMore = this.weaponMasteryState.mastered.length < this.weaponMasteryState.available;
            this.availableMasteryWeapons.forEach(w => {
                if (!this.weaponMasteryState.mastered.includes(w.id)) {
                    masterySelect.createEl("option", { text: `${w.name} (${w.mastery})`, value: w.id });
                }
            });
            masterySelect.disabled = !canAddMore;

            const addMasteryBtn = addMasteryBar.createEl("button", { text: "Add Mastery" });
            addMasteryBtn.disabled = !canAddMore;
            addMasteryBtn.onclick = () => {
                const chosenSlug = masterySelect.value;
                if (!chosenSlug) return;
                if (this.weaponMasteryState.mastered.length >= this.weaponMasteryState.available) {
                    new Notice(`You can only master up to ${this.weaponMasteryState.available} weapon(s).`);
                    return;
                }
                if (!this.weaponMasteryState.mastered.includes(chosenSlug)) {
                    this.weaponMasteryState.mastered.push(chosenSlug);
                    this.renderContent();
                }
            };
        }

        else if (this.activeTab === "ac") {
            this.contentContainer.createEl("h4", { text: "Armor Class Adjustments", cls: "dnd-manage-section-title" });

            const inputDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            inputDiv.createEl("label", { text: "Miscellaneous AC Modifier (Shields, Buffs):", cls: "dnd-form-label-sub" });
            const inputEl = inputDiv.createEl("input", {
                type: "number",
                value: String(this.currentAcMod),
                cls: "dnd-modal-form-input"
            });
            inputEl.oninput = (e) => this.currentAcMod = Number((e.target as HTMLInputElement).value);

            this.contentContainer.createEl("p", {
                text: "Note: Your Base AC and Dexterity limits are automatically calculated based on your equipped armor and ability scores.",
                cls: "dnd-form-note"
            });
        }

        else if (this.activeTab === "speed") {
            this.contentContainer.createEl("h4", { text: "Speed Adjustments", cls: "dnd-manage-section-title" });

            const baseSpeedDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            baseSpeedDiv.createEl("label", { text: "Base Walking Speed (ft.):", cls: "dnd-form-label-sub" });
            const baseSpeedInput = baseSpeedDiv.createEl("input", {
                type: "number",
                value: String(this.currentSpeed),
                cls: "dnd-modal-form-input"
            });

            // Feature & Feat Speed Bonuses Card
            const autoBonus = (this.speedBreakdown?.classSpeedBonus || 0) + (this.speedBreakdown?.featSpeedBonus || 0);
            const breakdownCard = this.contentContainer.createDiv({ cls: "dnd-form-card" });
            breakdownCard.createEl("label", { text: "Class & Feat Speed Bonuses (Automatic):", cls: "dnd-form-label-bold" });

            const autoItems = (this.speedBreakdown?.breakdown || []).filter(b => b.source !== "Custom / Miscellaneous Modifier");
            if (autoItems.length === 0) {
                breakdownCard.createEl("p", {
                    text: "No class features or feats currently grant speed bonuses.",
                    cls: "dnd-form-hint"
                });
            } else {
                autoItems.forEach(b => {
                    const row = breakdownCard.createDiv({ cls: "dnd-modal-list-row" });
                    const nameSpan = row.createEl("span", {
                        text: `${b.source}: +${b.amount} ft.`,
                        cls: "dnd-modal-row-name"
                    });
                    if (!b.active) {
                        nameSpan.classList.add("dnd-text-muted");
                        row.createEl("small", {
                            text: b.reason ? `(${b.reason})` : "(Inactive)",
                            cls: "dnd-error-text"
                        });
                    }
                });
            }

            // Custom / Misc Modifier input
            const customSpeedDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            customSpeedDiv.createEl("label", { text: "Miscellaneous / Gear Speed Modifier (Magic Items, Buffs):", cls: "dnd-form-label-sub" });
            const customSpeedInput = customSpeedDiv.createEl("input", {
                type: "number",
                value: String(this.currentCustomSpeedMod),
                cls: "dnd-modal-form-input"
            });

            // Total Speed Preview Display
            const previewCard = this.contentContainer.createDiv({ cls: "dnd-form-card-active" });
            const updatePreview = () => {
                this.currentSpeedMod = autoBonus + this.currentCustomSpeedMod;
                const total = this.currentSpeed + this.currentSpeedMod;
                previewCard.empty();
                previewCard.createEl("strong", {
                    text: `Total Walking Speed: ${total} ft.`
                });
                const modText = this.currentSpeedMod !== 0
                    ? ` (Base ${this.currentSpeed} ft. + ${this.currentSpeedMod > 0 ? '+' : ''}${this.currentSpeedMod} ft. Modifier)`
                    : ` (Base ${this.currentSpeed} ft.)`;
                previewCard.createSpan({ text: modText });
            };

            baseSpeedInput.oninput = (e) => {
                this.currentSpeed = Number((e.target as HTMLInputElement).value) || 0;
                updatePreview();
            };

            customSpeedInput.oninput = (e) => {
                this.currentCustomSpeedMod = Number((e.target as HTMLInputElement).value) || 0;
                updatePreview();
            };

            updatePreview();

            this.contentContainer.createEl("p", {
                text: "Note: In DnD 5.5e, Monk Unarmored Movement scales automatically and replaces earlier tiers. Speedy and other feats stack additively with class speed.",
                cls: "dnd-form-note"
            });

            // --- INITIATIVE ADJUSTMENTS SECTION ---
            this.contentContainer.createEl("h4", { text: "Initiative Adjustments", cls: "dnd-manage-section-title" });

            const initAutoBonus = this.initiativeBreakdown.reduce((sum, item) => sum + item.amount, 0);
            const initBreakdownCard = this.contentContainer.createDiv({ cls: "dnd-form-card" });
            initBreakdownCard.createEl("label", { text: "Class, Subclass & Feat Initiative Bonuses (Automatic):", cls: "dnd-form-label-bold" });

            if (this.initiativeBreakdown.length === 0) {
                initBreakdownCard.createEl("p", {
                    text: "No class features or feats currently grant initiative bonuses (e.g., Alert, Dread Ambusher).",
                    cls: "dnd-form-hint"
                });
            } else {
                this.initiativeBreakdown.forEach(b => {
                    const row = initBreakdownCard.createDiv({ cls: "dnd-modal-list-row" });
                    const signedAmt = b.amount >= 0 ? `+${b.amount}` : `${b.amount}`;
                    row.createEl("span", {
                        text: `${b.source}: ${signedAmt}`,
                        cls: "dnd-modal-row-name"
                    });
                });
            }

            const customInitDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            customInitDiv.createEl("label", { text: "Miscellaneous / Gear Initiative Modifier (Magic Items, Buffs):", cls: "dnd-form-label-sub" });
            const customInitInput = customInitDiv.createEl("input", {
                type: "number",
                value: String(this.currentCustomInitiativeMod),
                cls: "dnd-modal-form-input"
            });

            const initPreviewCard = this.contentContainer.createDiv({ cls: "dnd-form-card-active" });
            const updateInitPreview = () => {
                const dexMod = Math.floor(((Number(this.currentStats.dexterity) || 10) - 10) / 2);
                this.currentInitiativeMod = initAutoBonus + this.currentCustomInitiativeMod;
                const totalInit = dexMod + this.currentInitiativeMod;
                const fmtSigned = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
                initPreviewCard.empty();
                initPreviewCard.createEl("strong", {
                    text: `Total Initiative Bonus: ${fmtSigned(totalInit)}`
                });
                const modText = this.currentInitiativeMod !== 0
                    ? ` (Dex ${fmtSigned(dexMod)} + ${fmtSigned(this.currentInitiativeMod)} Modifier)`
                    : ` (Dex ${fmtSigned(dexMod)})`;
                initPreviewCard.createSpan({ text: modText });
            };

            customInitInput.oninput = (e) => {
                this.currentCustomInitiativeMod = Number((e.target as HTMLInputElement).value) || 0;
                updateInitPreview();
            };

            updateInitPreview();
        }

        else if (this.activeTab === "skills") {
            this.contentContainer.createEl("h4", { text: "Additional Skill Proficiencies", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentExtraSkills.length === 0) {
                listDiv.createEl("p", { text: "No extra skills added.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentExtraSkills.forEach((skill, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });
                    row.createEl("span", { text: skill.replace(/\b\w/g, c => c.toUpperCase()), cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = () => {
                        this.currentExtraSkills.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const selectEl = addDiv.createEl("select", { cls: "dnd-modal-add-select" });
            selectEl.createEl("option", { text: "-- Select Skill to Add --", value: "" });

            this.allSkills.forEach(s => {
                const isExtra = this.currentExtraSkills.includes(s.toLowerCase());
                const isBase = this.baseProficiencies.some(p => p[0] === s.toLowerCase());
                if (!isExtra && !isBase) selectEl.createEl("option", { text: s, value: s.toLowerCase() });
            });

            const addBtn = addDiv.createEl("button", { text: "Add Skill" });
            addBtn.onclick = () => {
                if (selectEl.value) {
                    this.currentExtraSkills.push(selectEl.value);
                    this.renderContent();
                }
            };

            // --- TOOL PROFICIENCIES SECTION ---
            this.contentContainer.createEl("h4", { text: "Tool Proficiencies", cls: "dnd-manage-section-title" });

            const toolsListDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentToolProficiencies.length === 0) {
                toolsListDiv.createEl("p", { text: "No tool proficiencies added.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentToolProficiencies.forEach((toolName, index) => {
                    const row = toolsListDiv.createDiv({ cls: "dnd-modal-list-row" });
                    row.createEl("span", { text: toolName, cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = () => {
                        this.currentToolProficiencies.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const toolAddDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const toolSelectEl = toolAddDiv.createEl("select", { cls: "dnd-flex-2" });
            toolSelectEl.createEl("option", { text: "-- Select Rulebook Tool --", value: "" });
            const existingToolsLower = new Set(this.currentToolProficiencies.map(t => t.toLowerCase().trim()));
            this.availableTools.forEach(tName => {
                if (!existingToolsLower.has(tName.toLowerCase().trim())) {
                    toolSelectEl.createEl("option", { text: tName, value: tName });
                }
            });

            const customToolInput = toolAddDiv.createEl("input", {
                type: "text",
                cls: "dnd-flex-2",
                attr: { placeholder: "Or custom tool..." }
            });

            const addToolBtn = toolAddDiv.createEl("button", { text: "Add Tool" });
            addToolBtn.onclick = () => {
                const chosen = customToolInput.value.trim() || toolSelectEl.value.trim();
                if (!chosen) return;
                if (!this.currentToolProficiencies.some(t => t.toLowerCase().trim() === chosen.toLowerCase())) {
                    this.currentToolProficiencies.push(chosen);
                    this.renderContent();
                }
            };
        }

        else if (this.activeTab === "feats") {
            this.contentContainer.createEl("h4", { text: "Extra Feats", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentExtraFeats.length === 0) {
                listDiv.createEl("p", { text: "No extra feats added.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentExtraFeats.forEach((featEntry, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });
                    const meta = this.featDisplayMap[normalizeFeatKey(featEntry)];
                    const labelWrap = row.createEl("span", { cls: "dnd-modal-row-name dnd-feat-row-label" });
                    labelWrap.createSpan({ text: meta?.name || formatFeatureOrSlug(featEntry) });
                    if (meta?.category) {
                        labelWrap.createSpan({ text: meta.category, cls: "dnd-level-badge dnd-feat-cat-badge" });
                    }

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = async () => {
                        this.currentExtraFeats.splice(index, 1);
                        await this.refreshFeatDependentState(this.cachedFrontmatter, false);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const selectEl = addDiv.createEl("select", { cls: "dnd-modal-add-select" });
            const ownedFeatSlugs = new Set(this.currentExtraFeats.map(f => normalizeFeatKey(f)).filter(Boolean));
            populateGroupedFeatSelect(selectEl, this.availableFeats, ownedFeatSlugs);

            const addBtn = addDiv.createEl("button", { text: "Add Feat" });
            addBtn.onclick = async () => {
                const chosenId = selectEl.value;
                if (!chosenId) return;
                const chosenSlug = normalizeFeatKey(chosenId);
                if (!this.currentExtraFeats.some(f => normalizeFeatKey(f) === chosenSlug)) {
                    this.currentExtraFeats.push(chosenId);
                    await this.refreshFeatDependentState(this.cachedFrontmatter, false);
                    this.renderContent();
                }
            };

            this.contentContainer.createEl("small", {
                text: "Updates DnD_extraFeats. Speed, Initiative, Weapon Mastery slots, and Hide Features sync automatically on save; adjust Ability Scores, Saving Throws, Skills, or HP in their tabs if a feat grants choices.",
                cls: "dnd-form-hint"
            });
        }

        else if (this.activeTab === "items") {
            this.contentContainer.createEl("h4", { text: "Skill Bonuses (Magic Items & Gear)", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentSkillBonuses.length === 0) {
                listDiv.createEl("p", { text: "No item bonuses added.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentSkillBonuses.forEach((bonus, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });

                    const name = bonus[0];
                    const skill = bonus[1].replace(/\b\w/g, c => c.toUpperCase());
                    const val = Number(bonus[2]) > 0 ? `+${bonus[2]}` : `${bonus[2]}`;

                    row.createEl("span", { text: `${name}: ${val} to ${skill}`, cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = () => {
                        this.currentSkillBonuses.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const nameInput = addDiv.createEl("input", {
                type: "text",
                cls: "dnd-flex-2",
                attr: { placeholder: "Item Name (e.g. Cloak)" }
            });

            const selectEl = addDiv.createEl("select", { cls: "dnd-flex-2" });
            selectEl.createEl("option", { text: "-- Skill --", value: "" });
            this.allSkills.forEach(s => selectEl.createEl("option", { text: s, value: s.toLowerCase() }));

            const valInput = addDiv.createEl("input", {
                type: "number",
                cls: "dnd-flex-1",
                attr: { placeholder: "+ Val" }
            });

            const addBtn = addDiv.createEl("button", { text: "Add" });
            addBtn.onclick = () => {
                if (nameInput.value && selectEl.value && valInput.value) {
                    this.currentSkillBonuses.push([nameInput.value, selectEl.value, String(valInput.value)]);
                    this.renderContent();
                }
            };
        }

        else if (this.activeTab === "features") {
            this.contentContainer.createEl("h4", { text: "Hidden Character Features", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentHiddenFeatures.length === 0) {
                listDiv.createEl("p", { text: "No features are currently hidden.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentHiddenFeatures.forEach((featName, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });
                    row.createEl("span", { text: featName, cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", {
                        text: "✕",
                        cls: "dnd-modal-del-btn",
                        attr: { title: "Unhide Feature" }
                    });
                    delBtn.onclick = () => {
                        this.currentHiddenFeatures.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const selectEl = addDiv.createEl("select", { cls: "dnd-modal-add-select" });
            selectEl.createEl("option", { text: "-- Select Feature to Hide --", value: "" });

            const hiddenLowerSet = new Set(this.currentHiddenFeatures.map(f => f.toLowerCase().trim()));
            this.availableFeaturesToHide.forEach(featName => {
                if (!hiddenLowerSet.has(featName.toLowerCase().trim())) {
                    selectEl.createEl("option", { text: featName, value: featName });
                }
            });

            const hideBtn = addDiv.createEl("button", { text: "Hide Feature" });
            hideBtn.onclick = () => {
                if (selectEl.value) {
                    this.currentHiddenFeatures.push(selectEl.value);
                    this.renderContent();
                }
            };
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    async saveAllChanges() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        const updates: Record<string, any> = {};

        // 1. Process Stats Update
        Object.entries(this.currentStats).forEach(([stat, value]) => updates[`DnD_${stat}`] = value);

        // 1b. Process Saving Throw Proficiencies
        updates["DnD_classProficiencies"] = JSON.stringify(this.currentSavingThrows);

        // 2. Process Dynamic Armor AC Bonus & Unarmed Strike Damage (based on new Stats & Unarmored Defense!)
        const currentArmor = String(frontmatter["DnD_armor"] || "");
        const currentWeapon = String(frontmatter["DnD_weapon"] || "");
        const level = Number(frontmatter["DnD_level"]) || 1;
        const dndClass = frontmatter["DnD_class"];
        const classLevels = frontmatter["DnD_classLevels"];

        const safeWeaponName = currentWeapon.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        if (safeWeaponName === "unarmed-strike" || safeWeaponName === "unarmed-strikes") {
            updates["DnD_weaponDamage"] = await this.plugin.resolveUnarmedStrikeDamage(
                dndClass,
                classLevels,
                level,
                this.currentStats,
                this.currentAttackStat,
                this.plugin.settings
            );
        }

        const subclassForSave = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        const armorStats = await this.plugin.resolveEquippedArmorStats({
            armorNameInput: currentArmor,
            manualAcInput: frontmatter["DnD_armorAc"],
            classInput: dndClass,
            classLevelsInput: classLevels,
            totalLevel: level,
            statsRecord: this.currentStats,
            subclassInput: subclassForSave,
            fetchOptions: this.plugin.settings
        });
        if (armorStats.isUnarmored) {
            updates["DnD_armorAc"] = armorStats.armorAc;
        }
        updates["DnD_armorAcBonus"] = armorStats.armorAcBonus;
        updates["DnD_armorAcMod"] = this.currentAcMod;
        updates["DnD_speed"] = this.currentSpeed;
        updates["DnD_customSpeedMod"] = this.currentCustomSpeedMod;

        const profBonusForSave = Number(frontmatter["DnD_proficiencyBonus"]) || Math.ceil(1 + (level / 4));
        const bgFeatForSave = await this.plugin.resolveBackgroundFeatId(
            frontmatter["DnD_background"],
            frontmatter["DnD_backgroundFeat"],
            this.plugin.settings
        );

        // Recalculate Speed, Initiative & Weapon Mastery Slots from currentExtraFeats + currentStats
        const speedCalcSave = await this.plugin.resolveCharacterSpeedModifiers(
            dndClass,
            classLevels,
            level,
            this.currentExtraFeats,
            bgFeatForSave,
            currentArmor,
            this.currentSpeed,
            this.currentCustomSpeedMod,
            subclassForSave,
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        updates["DnD_speedMod"] = speedCalcSave.totalSpeedMod;

        const initCalcSave = await this.plugin.resolveCharacterInitiativeModifiers(
            dndClass,
            classLevels,
            level,
            this.currentExtraFeats,
            bgFeatForSave,
            subclassForSave,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"],
            this.currentStats,
            profBonusForSave,
            this.currentCustomInitiativeMod,
            this.plugin.settings
        );
        updates["DnD_customInitiativeMod"] = this.currentCustomInitiativeMod;
        updates["DnD_initiativeMod"] = initCalcSave.totalInitiativeMod;

        const masteryCalcSave = await this.plugin.resolveCharacterWeaponMasterySlots(
            dndClass,
            classLevels,
            level,
            this.currentExtraFeats,
            bgFeatForSave,
            subclassForSave,
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
        );
        this.weaponMasteryState.available = masteryCalcSave.totalSlots;

        updates["DnD_attackRollMod"] = this.extraAttackMod;
        updates["DnD_attackStat"] = this.currentAttackStat;
        updates["DnD_attackProficiency"] = this.addAttackProficiency;
        updates["DnD_spellcastingAbility"] = this.currentSpellcastingAbility || undefined;
        updates["DnD_weaponMastery"] = serializeWeaponMasteryState(
            this.weaponMasteryState.available,
            this.weaponMasteryState.mastered
        );

        // 3. Process Skills, Tools & Extra Feats Databases
        const combinedProficiencies = [...this.baseProficiencies];
        this.currentExtraSkills.forEach(s => combinedProficiencies.push([s, "extra"]));
        updates["DnD_skillProficiencies"] = JSON.stringify(combinedProficiencies);
        updates["DnD_toolProficiencies"] = this.currentToolProficiencies;
        updates["DnD_extraFeats"] = [...this.currentExtraFeats];

        // 4. Process Item Bonuses Database
        updates["DnD_skillBonuses"] = JSON.stringify(this.currentSkillBonuses);

        // 5. Process Hidden Features Database
        updates["DnD_hideFeature"] = JSON.stringify(this.currentHiddenFeatures);

        // --- EXECUTE FRONTMATTER SAVE ---
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);

        // --- EXECUTE MASS MARKDOWN REPLACEMENT ---
        const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
        if (file instanceof TFile) {
            const bonusRegex = /(bonuses:\s*\n)([\s\S]*?)(?=\n```)/;
            const profRegex = /(```(?:dnd-)?skills[\s\S]*?proficiencies:\s*\n)([\s\S]*?)(?=\n[ \t]*expertise:)/;
            const currentContent = await this.app.vault.cachedRead(file);
            if (bonusRegex.test(currentContent) || profRegex.test(currentContent)) {
                await this.app.vault.process(file, (content) => {
                    let updatedContent = content;

                    // B. Update Skills Block (if inline lists are used instead of frontmatter pointers)
                    const cSkills = combinedProficiencies.filter(p => p[1] === "class").map(p => `  - ${p[0]}`);
                    const bSkills = combinedProficiencies.filter(p => p[1] === "background").map(p => `  - ${p[0]}`);
                    const eSkills = combinedProficiencies.filter(p => p[1] === "extra").map(p => `  - ${p[0]}`);

                    let bonusInject = "";
                    if (this.currentSkillBonuses.length > 0) {
                        bonusInject = this.currentSkillBonuses.map(b =>
                            `  - name: ${b[0]}\n    target: ${b[1]}\n    value: ${b[2]}`
                        ).join('\n') + '\n';
                    } else {
                        bonusInject = "  - name: <Item Name>\n    target: <chosen skill>\n    value: <+value>\n";
                    }

                    updatedContent = updatedContent.replace(bonusRegex, `$1${bonusInject}`);

                    let profInject = "";
                    if (cSkills.length > 0) profInject += `  #Class\n${cSkills.join('\n')}\n`;
                    if (bSkills.length > 0) profInject += `  #Background\n${bSkills.join('\n')}\n`;
                    if (eSkills.length > 0) profInject += `  #Extra\n${eSkills.join('\n')}\n`;
                    if (profInject === "") profInject = "  - <chosen skills>\n";

                    updatedContent = updatedContent.replace(profRegex, `$1${profInject}`);

                    return updatedContent;
                });
            }
        }

        new Notice("Character updated successfully!");
        this.close();
    }
}
