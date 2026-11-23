import { App, MarkdownView, Modal, Notice, TFile, normalizePath } from 'obsidian';
import {
    FeatPoolEntry,
    getAvailableFeats,
    getBackgroundData,
    getClassChoiceRouterData,
    getClassData,
    getExtraFeat,
    getItemData,
    getRaceData,
    getSubclassData,
    toSlug
} from '../../data';
import { backgroundsMap, classesMap, racesMap } from '../../registry';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    ALL_ABILITIES,
    AbilityKey,
    GrantedFeatMilestoneState,
    createEmptyGrantedFeatState,
    formatFeatureOrSlug,
    formatSpellTuples,
    normalizeFeatKey,
    parseExtraFeatsList,
    parseFeatAbilityImprovements,
    parseFeatSavingThrowProficiencies,
    parseSavingThrows,
    populateGroupedFeatSelect,
    serializeClassChoicesByRouter,
    serializeHitDiceState,
    serializeWeaponMasteryState
} from '../helpers';
import { NoteModal } from './rest-note-modals';
import { renderGrantedFeatMilestoneCard, renderWeaponAndArmorLoadoutControls } from './shared-controls';

export class CharacterWizardModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    currentStep: number = 1;
    totalSteps: number = 5; // UPGRADED to 5 steps!

    // Data pools for our dropdowns
    availableClasses: string[] = [];
    availableRaces: string[] = [];
    availableBackgrounds: string[] = [];
    availableFeats: FeatPoolEntry[] = [];
    availableItems: { id: string; name: string; type: string }[] = [];
    availableWeapons: { id: string; name: string; damage: string; mastery: string }[] = [];
    availableArmors: { id: string; name: string; ac: string; category: string }[] = [];
    availableTools: string[] = [];

    // Expanded storage for all our new choices
    wizardData: Record<string, any> = {
        name: "", level: 1, race: "", raceLineage: "", dndClass: "", subclass: "",
        DnD_spellcasting_ability: "", background: "", classEquipment: "A", backgroundEquipment: "A",
        classChosenItems: [] as string[], backgroundChosenItems: [] as string[],
        weapon: "", weaponDamage: "", armor: "", armorAc: "",
        isWeaponCustom: false, isArmorCustom: false,
        weaponMasteries: [] as string[],
        languages: "", extraFeats: [] as string[], toolProficiencies: "", speed: 30, maxHealth: 0,
        chosenSkills: [],
        chosenBgSkills: [],
        chosenAbilityBonuses: [],
        classChoices: [], // Stores the dynamic Class Choices [Router, Key, Level, ChoiceIndex]
        expertiseChoices: [],
        grantedFeatSelections: {} as Record<string, GrantedFeatMilestoneState>,
    };

    private pruneGrantedFeatSelectionsByPrefix(prefix: string) {
        if (!this.wizardData.grantedFeatSelections || typeof this.wizardData.grantedFeatSelections !== "object") return;
        for (const key of Object.keys(this.wizardData.grantedFeatSelections)) {
            if (key.startsWith(prefix)) {
                delete this.wizardData.grantedFeatSelections[key];
            }
        }
    }

    getWizardGrantedFeatKeys(): string[] {
        const out: string[] = [];
        const selections = this.wizardData.grantedFeatSelections || {};
        for (const sel of Object.values(selections) as GrantedFeatMilestoneState[]) {
            if (sel && sel.chosenOptionType !== "asi" && sel.chosenFeatKey) {
                out.push(sel.chosenFeatKey);
            }
        }
        return out;
    }

    getCompiledExtraFeats(): string[] {
        return parseExtraFeatsList([
            ...this.getWizardGrantedFeatKeys(),
            ...parseExtraFeatsList(this.wizardData.extraFeats)
        ]);
    }

    /** Strips filesystem- and Obsidian-illegal filename characters while preserving readable spacing. */
    private sanitizeNoteTitle(rawName: string): string {
        return rawName
            .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
            .replace(/\s+/g, " ")
            .replace(/^[.\s]+|[.\s]+$/g, "");
    }

    /** Resolves a collision-free vault path in the file's current folder, allowing case-only renames of `file`. */
    private resolveUniqueNotePath(file: TFile, baseTitle: string): string {
        const ext = file.extension || "md";
        const parentPath = file.parent?.path && file.parent.path !== "/" ? file.parent.path : "";
        const buildPath = (name: string) =>
            normalizePath(parentPath ? `${parentPath}/${name}.${ext}` : `${name}.${ext}`);

        const siblingNames = new Set(
            (file.parent?.children ?? [])
                .filter((child): child is TFile => child instanceof TFile && child.path !== file.path)
                .map(child => child.name.toLowerCase())
        );

        const hasCollision = (candidatePath: string, candidateFileName: string) => {
            if (siblingNames.has(candidateFileName.toLowerCase())) return true;
            const existing = this.app.vault.getAbstractFileByPath(candidatePath);
            return existing !== null && existing.path !== file.path;
        };

        let candidateBase = baseTitle;
        let candidatePath = buildPath(candidateBase);
        let suffix = 1;

        while (hasCollision(candidatePath, `${candidateBase}.${ext}`)) {
            candidateBase = `${baseTitle} ${suffix++}`;
            candidatePath = buildPath(candidateBase);
        }

        return candidatePath;
    }

    /** Renames the target note file to the user-entered character name when non-empty. */
    private async renameNoteToCharacterName(file: TFile | null): Promise<void> {
        if (!file) return;
        const sanitizedTitle = this.sanitizeNoteTitle(String(this.wizardData.name ?? ""));
        if (!sanitizedTitle) return;

        const targetPath = this.resolveUniqueNotePath(file, sanitizedTitle);
        if (targetPath === file.path) return;

        try {
            await this.app.fileManager.renameFile(file, targetPath);
        } catch (error) {
            console.warn("Character Wizard: Could not rename note to character name:", error);
            new Notice(`Note created, but could not rename title to "${sanitizedTitle}".`);
        }
    }

    // Incremented on every renderStep() call so stale (slower) async renders are discarded
    private renderToken = 0;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        this.contentEl.createEl("h3", { text: "Loading rulebook data...", cls: "dnd-section-header" });
        await this.fetchDropdownData();
        this.renderStep();
    }

    onClose() {
        this.contentEl.empty();
    }

    async fetchDropdownData() {
        // For Router Files ({ "<filename>": "<Display Name>" } like classes.json & races.json)
        const getRouterDisplayNames = async (fileName: string, nativeMap: Record<string, any>) => {
            const merged = await this.plugin.loadMergedRouterMap(fileName, nativeMap);
            const displayNames = new Set<string>();
            for (const [k, v] of Object.entries(merged)) {
                if (typeof v === "string") {
                    displayNames.add(v.trim());
                } else if (typeof k === "string") {
                    displayNames.add(k.trim());
                }
            }
            if (displayNames.size === 0) {
                console.warn(`Wizard: No data found for ${fileName}.`);
                new Notice(`Warning: Could not load ${fileName}. Dropdown will be empty.`);
            }
            return Array.from(displayNames).sort((a, b) => a.localeCompare(b));
        };

        // For Inline Object Maps ({ "<Display Name>": { ... } } like backgrounds.json)
        const getObjectKeys = async (fileName: string, nativeMap: Record<string, any>) => {
            const merged = await this.plugin.loadMergedRouterMap(fileName, nativeMap);
            const keys = Object.keys(merged).sort((a, b) => a.localeCompare(b));
            if (keys.length === 0) {
                console.warn(`Wizard: No data found for ${fileName}.`);
                new Notice(`Warning: Could not load ${fileName}. Dropdown will be empty.`);
            }
            return keys;
        };

        this.availableClasses = await getRouterDisplayNames("classes.json", classesMap);
        this.availableRaces = await getRouterDisplayNames("races.json", racesMap);
        this.availableBackgrounds = await getObjectKeys("backgrounds.json", backgroundsMap);
        this.availableFeats = await getAvailableFeats(this.app, this.plugin.settings);

        const catalog = await this.plugin.loadRulebookEquipmentCatalog();
        this.availableItems = catalog.items;
        this.availableWeapons = catalog.weapons;
        this.availableArmors = catalog.armors;
        this.availableTools = catalog.tools;
    }

    // Main rendering engine for the Wizard
    async renderStep() {
        const { contentEl } = this;
        const token = ++this.renderToken;

        // Build the whole step in a DETACHED container first. The step renderers await
        // rulebook lookups (race/class/subclass data), so emptying contentEl up front would
        // leave the modal blank/collapsed during those awaits — causing the flicker.
        const buildEl = document.createElement("div");

        buildEl.createEl("h2", {
            text: `Character Creation Wizard (Step ${this.currentStep} of ${this.totalSteps})`,
            cls: "dnd-section-header"
        });

        const stepContainer = buildEl.createDiv({ cls: "dnd-features-window" });

        // We MUST await all steps now so dynamic lineages and subclasses can fetch data before rendering
        if (this.currentStep === 1) {
            await this.renderStepOne(stepContainer);
        } else if (this.currentStep === 2) {
            await this.renderStepTwo(stepContainer);
        } else if (this.currentStep === 3) {
            await this.renderStepThree(stepContainer); // Features Options Step
        } else if (this.currentStep === 4) {
            await this.renderStepFour(stepContainer); // Equipment Step
        } else if (this.currentStep === 5) {
            this.renderStepFive(stepContainer); // Finalization Step
        }

        // A newer renderStep() started while we were awaiting — drop this outdated render
        if (token !== this.renderToken) return;

        const navContainer = buildEl.createDiv({ cls: "dnd-wizard-nav" });

        const backBtn = navContainer.createEl("button", { text: "Back" });
        backBtn.disabled = this.currentStep === 1;
        backBtn.onclick = () => {
            if (this.currentStep > 1) {
                this.currentStep--;
                this.renderStep();
            }
        };

        const nextBtn = navContainer.createEl("button", {
            text: this.currentStep === this.totalSteps ? "Finish & Generate" : "Next",
            cls: "mod-cta"
        });

        nextBtn.onclick = async () => {
            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                this.renderStep();
            } else {
                nextBtn.disabled = true;
                try {
                    await this.finishWizard();
                } catch (error) {
                    console.error("Character Wizard: Failed to generate character sheet:", error);
                    new Notice("Error: Could not generate the character sheet. Check the console for details.");
                    nextBtn.disabled = false;
                }
            }
        };

        // Swap the fully-built step in synchronously (no paint in between = no flicker)
        contentEl.empty();
        while (buildEl.firstChild) contentEl.appendChild(buildEl.firstChild);
    }

    async renderStepOne(container: HTMLElement) {
        container.createEl("h3", { text: "Core Details", cls: "dnd-class-header" });

        // Character Name & Level Inputs
        const grid = container.createDiv({ cls: "dnd-form-grid-name-lvl" });

        const nameDiv = grid.createDiv();
        nameDiv.createEl("label", { text: "Character Name: ", cls: "dnd-form-label" });
        const nameInput = nameDiv.createEl("input", { type: "text", value: this.wizardData.name, cls: "dnd-modal-form-input" });
        nameInput.placeholder = "e.g., Din";
        const updateCharacterName = (e: Event) => {
            this.wizardData.name = (e.target as HTMLInputElement).value;
        };
        nameInput.oninput = updateCharacterName;
        nameInput.onchange = updateCharacterName;

        const levelDiv = grid.createDiv();
        levelDiv.createEl("label", { text: "Level: ", cls: "dnd-form-label" });
        const levelInput = levelDiv.createEl("input", { type: "number", value: String(this.wizardData.level), cls: "dnd-modal-form-input" });
        levelInput.min = "1"; levelInput.max = "20";
        levelInput.onchange = async (e) => {
            this.wizardData.level = Number((e.target as HTMLInputElement).value) || 1;
            const newLvl = Number(this.wizardData.level) || 1;
            for (const key of Object.keys(this.wizardData.grantedFeatSelections || {})) {
                const lvlMatch = key.match(/:lvl(\d+):/);
                if (lvlMatch && Number(lvlMatch[1]) > newLvl) {
                    delete this.wizardData.grantedFeatSelections[key];
                }
            }
            await this.renderStep();
        };

        // --- RACE SECTION ---
        const raceDiv = container.createDiv({ cls: "dnd-form-group" });
        raceDiv.createEl("label", { text: "Race: ", cls: "dnd-form-label" });
        const raceSelect = raceDiv.createEl("select", { cls: "dnd-modal-form-input" });
        raceSelect.createEl("option", { text: "-- Select a Race --", value: "" });
        this.availableRaces.forEach(r => raceSelect.createEl("option", { text: r, value: r }));
        raceSelect.value = this.wizardData.race;

        raceSelect.onchange = async (e) => {
            this.wizardData.race = (e.target as HTMLSelectElement).value;
            this.wizardData.raceLineage = "";
            this.pruneGrantedFeatSelectionsByPrefix("race:");
            await this.renderStep();
        };

        // Conditional Race Lineage
        if (this.wizardData.race) {
            const raceData = await getRaceData(this.app, this.plugin.settings, this.wizardData.race);
            if (raceData && raceData.traits) {
                const lineages = new Set(raceData.traits.filter((t: any) => t.lineage).map((t: any) => t.lineage));
                if (lineages.size > 0) {
                    const linDiv = container.createDiv({ cls: "dnd-form-subpanel" });
                    linDiv.createEl("label", { text: "Race Lineage: ", cls: "dnd-form-label-sub" });
                    const linSelect = linDiv.createEl("select", { cls: "dnd-modal-form-input" });
                    linSelect.createEl("option", { text: "-- Select a Lineage --", value: "" });
                    Array.from(lineages).forEach((l: any) => linSelect.createEl("option", { text: l, value: l }));
                    linSelect.value = this.wizardData.raceLineage || "";
                    linSelect.onchange = (e) => {
                        this.wizardData.raceLineage = (e.target as HTMLSelectElement).value;
                        this.pruneGrantedFeatSelectionsByPrefix("race:");
                    };
                }
            }
        }

        // --- CLASS SECTION ---
        const classDiv = container.createDiv({ cls: "dnd-form-group" });
        classDiv.createEl("label", { text: "Class: ", cls: "dnd-form-label" });
        const classSelect = classDiv.createEl("select", { cls: "dnd-modal-form-input" });
        classSelect.createEl("option", { text: "-- Select a Class --", value: "" });
        this.availableClasses.forEach(c => classSelect.createEl("option", { text: c, value: c }));
        classSelect.value = this.wizardData.dndClass;

        classSelect.onchange = async (e) => {
            this.wizardData.dndClass = (e.target as HTMLSelectElement).value;
            this.wizardData.subclass = "";
            this.wizardData.classChoices = [];
            this.wizardData.chosenSkills = [];
            this.wizardData.expertiseChoices = [];
            this.pruneGrantedFeatSelectionsByPrefix("class:");
            this.pruneGrantedFeatSelectionsByPrefix("subclass:");
            await this.renderStep();
        };

        // Conditional Subclass
        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, Number(this.wizardData.level) || 1);

            if (grantedSubclassFile) {
                const allSubclasses = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile);
                if (allSubclasses && typeof allSubclasses === "object") {
                    const subclassNames = Object.keys(allSubclasses);
                    if (subclassNames.length > 0) {
                        const subDiv = container.createDiv({ cls: "dnd-form-subpanel" });
                        subDiv.createEl("label", { text: "Subclass: ", cls: "dnd-form-label-sub" });
                        const subSelect = subDiv.createEl("select", { cls: "dnd-modal-form-input" });
                        subSelect.createEl("option", { text: "-- Select a Subclass --", value: "" });
                        subclassNames.forEach(s => subSelect.createEl("option", { text: s, value: s }));
                        subSelect.value = this.wizardData.subclass || "";
                        subSelect.onchange = async (e) => {
                            this.wizardData.subclass = (e.target as HTMLSelectElement).value;
                            this.pruneGrantedFeatSelectionsByPrefix("subclass:");
                            await this.renderStep();
                        };
                    }
                }
            } else {
                this.wizardData.subclass = "";
            }
        }

        // --- BACKGROUND SECTION ---
        const bgDiv = container.createDiv({ cls: "dnd-form-group" });
        bgDiv.createEl("label", { text: "Background: ", cls: "dnd-form-label" });
        const bgSelect = bgDiv.createEl("select", { cls: "dnd-modal-form-input" });
        bgSelect.createEl("option", { text: "-- Select a Background --", value: "" });
        this.availableBackgrounds.forEach(b => bgSelect.createEl("option", { text: b, value: b }));
        bgSelect.value = this.wizardData.background || "";

        bgSelect.onchange = async (e) => {
            this.wizardData.background = (e.target as HTMLSelectElement).value;
            this.wizardData.chosenBgSkills = [];
            this.wizardData.chosenAbilityBonuses = [];
            await this.renderStep();
        };
    }

    async renderStepTwo(container: HTMLElement) {
        container.createEl("h3", { text: "Stats & Abilities", cls: "dnd-class-header" });

        // Fetch both Class and Background JSON exactly ONCE at the top of Step 2!
        let classData: any = null;
        if (this.wizardData.dndClass) {
            classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
        }
        let bgData: any = null;
        if (this.wizardData.background) {
            bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
        }

        // 1. Base Stats Grid
        const statsGrid = container.createDiv({ cls: "dnd-form-grid-3" });
        const stats = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

        stats.forEach(stat => {
            const statKey = stat.toLowerCase();
            if (this.wizardData[statKey] === undefined) this.wizardData[statKey] = 10;

            const statDiv = statsGrid.createDiv();
            statDiv.createEl("label", { text: `${stat}:`, cls: "dnd-form-label-sm" });

            const statInput = statDiv.createEl("input", { type: "number", value: String(this.wizardData[statKey]), cls: "dnd-modal-form-input" });
            statInput.onchange = (e) => {
                this.wizardData[statKey] = Number((e.target as HTMLInputElement).value);
                if (statKey === "constitution") this.renderStep();
            };
        });

        // 2. Health & Speed Controls
        const vitalsGrid = container.createDiv({ cls: "dnd-form-grid-2" });

        const speedDiv = vitalsGrid.createDiv();
        speedDiv.createEl("label", { text: "Speed (ft):", cls: "dnd-form-label-sm" });
        const speedInput = speedDiv.createEl("input", { type: "number", value: String(this.wizardData.speed), cls: "dnd-modal-form-input" });
        speedInput.onchange = (e) => this.wizardData.speed = Number((e.target as HTMLInputElement).value);

        const hpDiv = vitalsGrid.createDiv();
        let hitDieMax = 8;
        const rawWizardHd = classData?.HitDice || classData?.hitDice || classData?.hit_dice || classData?.hitDie || classData?.hit_die;
        if (rawWizardHd) {
            const parsedHitDie = parseInt(String(rawWizardHd).replace(/\D/g, ''));
            if (!isNaN(parsedHitDie) && parsedHitDie > 0) hitDieMax = parsedHitDie;
        }
        const wizardLevel = Math.max(1, Number(this.wizardData.level) || 1);

        hpDiv.createEl("label", { text: `Max Health (Hit Die: d${hitDieMax}):`, cls: "dnd-form-label-sm" });
        const hpWrapper = hpDiv.createDiv({ cls: "dnd-modal-add-bar" });

        const hpInput = hpWrapper.createEl("input", { type: "number", value: String(this.wizardData.maxHealth), cls: "dnd-modal-form-input" });
        hpInput.onchange = (e) => this.wizardData.maxHealth = Number((e.target as HTMLInputElement).value);

        const autoBtnLabel = wizardLevel > 1 ? `Auto (Lvl ${wizardLevel})` : "Auto (Lvl 1)";
        const autoBtnTitle = wizardLevel > 1
            ? `Lvl 1 Max (d${hitDieMax} + CON) + Lvl 2–${wizardLevel} Average`
            : `Max Hit Die (d${hitDieMax}) + CON Modifier`;
        const autoHpBtn = hpWrapper.createEl("button", { text: autoBtnLabel, attr: { title: autoBtnTitle } });
        autoHpBtn.onclick = async () => {
            let totalCon = this.wizardData.constitution || 10;
            if (this.wizardData.chosenAbilityBonuses) {
                totalCon += this.wizardData.chosenAbilityBonuses.filter((b: string) => b.toLowerCase() === "constitution").length;
            }

            const conMod = Math.floor((totalCon - 10) / 2);
            const lvl1Hp = hitDieMax + conMod;
            const avgPerHigherLvl = Math.ceil(hitDieMax / 2) + 1 + conMod;
            this.wizardData.maxHealth = Math.max(1, lvl1Hp + (wizardLevel - 1) * avgPerHigherLvl);
            await this.renderStep();
        };

        // 3. Spellcasting Dropdown (Class/Subclass takes priority; falls back to Race/Lineage traits)
        let classSpellAbilities: string[] = [];
        if (classData) {
            let subclassDataForSpell: any = null;
            const grantedSubclassFileForSpell = this.plugin.findGrantedSubclass(classData, wizardLevel);
            if (this.wizardData.subclass && grantedSubclassFileForSpell) {
                subclassDataForSpell = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFileForSpell, this.wizardData.subclass);
            }
            const spellMeta = this.plugin.resolveSpellcastingMetadata(classData, subclassDataForSpell, wizardLevel);
            classSpellAbilities = spellMeta.spellcastingAbilities;
        }

        let effectiveSpellAbilities = classSpellAbilities;
        let spellAbilitySourceLabel = "";
        if (effectiveSpellAbilities.length === 0 && this.wizardData.race) {
            const raceDataForSpell = await getRaceData(this.app, this.plugin.settings, this.wizardData.race);
            const raceSpellMeta = await this.plugin.resolveRaceSpellcastingMetadata(raceDataForSpell, this.wizardData.raceLineage, wizardLevel);
            if (raceSpellMeta.spellcastingAbilities.length > 0) {
                effectiveSpellAbilities = raceSpellMeta.spellcastingAbilities;
                spellAbilitySourceLabel = ` (from ${this.wizardData.raceLineage || this.wizardData.race})`;
            }
        }

        if (effectiveSpellAbilities.length > 0) {
            const spellDiv = container.createDiv({ cls: "dnd-form-group" });
            spellDiv.createEl("label", {
                text: `Primary Spellcasting Ability${spellAbilitySourceLabel}: `,
                cls: "dnd-form-label-sub"
            });
            const spellSelect = spellDiv.createEl("select", { cls: "dnd-modal-form-input" });
            spellSelect.createEl("option", { text: "-- Select Ability --", value: "" });

            effectiveSpellAbilities.forEach((ability: string) => spellSelect.createEl("option", { text: ability, value: ability }));

            if (effectiveSpellAbilities.length === 1) {
                this.wizardData.DnD_spellcasting_ability = effectiveSpellAbilities[0];
            } else if (!effectiveSpellAbilities.includes(this.wizardData.DnD_spellcasting_ability)) {
                this.wizardData.DnD_spellcasting_ability = "";
            }

            spellSelect.value = this.wizardData.DnD_spellcasting_ability || "";
            spellSelect.onchange = (e) => this.wizardData.DnD_spellcasting_ability = (e.target as HTMLSelectElement).value;
        } else {
            this.wizardData.DnD_spellcasting_ability = "";
        }

        // 4. Class Skills Pool (Dynamic Dropdowns)
        if (this.wizardData.dndClass) {
            const sp = classData?.skillsPool;

            if (sp && Array.isArray(sp) && sp.length === 2) {
                const availableSkills = sp[0] as string[];
                const numChoices = sp[1] as number;

                if (availableSkills.length > 0 && numChoices > 0) {
                    const skillsDiv = container.createDiv({ cls: "dnd-form-divider-section" });
                    skillsDiv.createEl("label", { text: `Class Skill Proficiencies (Choose ${numChoices}):`, cls: "dnd-form-label-sub" });

                    if (!this.wizardData.chosenSkills || this.wizardData.chosenSkills.length !== numChoices) {
                        this.wizardData.chosenSkills = new Array(numChoices).fill("");
                    }

                    const skillGrid = skillsDiv.createDiv({ cls: "dnd-form-grid-2" });

                    for (let i = 0; i < numChoices; i++) {
                        const skillSelect = skillGrid.createEl("select", { cls: "dnd-modal-form-input" });
                        skillSelect.createEl("option", { text: `-- Select Skill ${i + 1} --`, value: "" });

                        availableSkills.forEach((skill: string) => {
                            const displaySkill = skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                            skillSelect.createEl("option", { text: displaySkill, value: skill });
                        });

                        skillSelect.value = this.wizardData.chosenSkills[i] || "";
                        skillSelect.onchange = (e) => {
                            this.wizardData.chosenSkills[i] = (e.target as HTMLSelectElement).value;
                        };
                    }
                }
            }
        }

        // 5. Background Ability Score Bonuses
        if (bgData && bgData.abilityBonusPool && Array.isArray(bgData.abilityBonusPool)) {
            const bonusDiv = container.createDiv({ cls: "dnd-form-group" });
            bonusDiv.createEl("label", { text: "Background Ability Bonuses (+3 total):", cls: "dnd-form-label-sub" });

            if (!this.wizardData.chosenAbilityBonuses || this.wizardData.chosenAbilityBonuses.length !== 3) {
                this.wizardData.chosenAbilityBonuses = ["", "", ""];
            }

            const bonusGrid = bonusDiv.createDiv({ cls: "dnd-form-grid-3" });

            for (let i = 0; i < 3; i++) {
                const bonusSelect = bonusGrid.createEl("select", { cls: "dnd-modal-form-input" });
                bonusSelect.createEl("option", { text: `-- +1 Bonus --`, value: "" });

                bgData.abilityBonusPool.forEach((ability: string) => {
                    const displayAbil = ability.charAt(0).toUpperCase() + ability.slice(1);
                    bonusSelect.createEl("option", { text: displayAbil, value: ability });
                });

                bonusSelect.value = this.wizardData.chosenAbilityBonuses[i] || "";
                bonusSelect.onchange = (e) => {
                    this.wizardData.chosenAbilityBonuses[i] = (e.target as HTMLSelectElement).value;
                    if ((e.target as HTMLSelectElement).value.toLowerCase() === "constitution" || this.wizardData.chosenAbilityBonuses.includes("constitution")) {
                        this.renderStep();
                    }
                };
            }
            bonusDiv.createEl("small", { text: "Tip: Assign +1 to three different stats, or +2 to one and +1 to another.", cls: "dnd-form-hint" });
        }

        // 6. Background Skills Pool (Dynamic Dropdowns)
        if (bgData && bgData.skillsPool && Array.isArray(bgData.skillsPool) && bgData.skillsPool.length === 2) {
            const availableBgSkills = bgData.skillsPool[0] as string[];
            const numBgChoices = bgData.skillsPool[1] as number;

            if (availableBgSkills.length > 0 && numBgChoices > 0) {
                const bgSkillsDiv = container.createDiv({ cls: "dnd-form-group" });
                bgSkillsDiv.createEl("label", { text: `Background Skill Proficiencies (Choose ${numBgChoices}):`, cls: "dnd-form-label-sub" });

                if (!this.wizardData.chosenBgSkills || this.wizardData.chosenBgSkills.length !== numBgChoices) {
                    this.wizardData.chosenBgSkills = new Array(numBgChoices).fill("");
                }

                const bgSkillGrid = bgSkillsDiv.createDiv({ cls: "dnd-form-grid-2" });

                for (let i = 0; i < numBgChoices; i++) {
                    const skillSelect = bgSkillGrid.createEl("select", { cls: "dnd-modal-form-input" });
                    skillSelect.createEl("option", { text: `-- Select Skill ${i + 1} --`, value: "" });

                    availableBgSkills.forEach((skill: string) => {
                        const displaySkill = skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                        skillSelect.createEl("option", { text: displaySkill, value: skill });
                    });

                    skillSelect.value = this.wizardData.chosenBgSkills[i] || "";
                    skillSelect.onchange = (e) => {
                        this.wizardData.chosenBgSkills[i] = (e.target as HTMLSelectElement).value;
                    };
                }
            }
        }

        // 7. Automatic Background Skills (Read-Only Display)
        if (bgData && bgData.skills && Array.isArray(bgData.skills) && bgData.skills.length > 0) {
            const autoBgSkillsDiv = container.createDiv({ cls: "dnd-form-group" });
            autoBgSkillsDiv.createEl("label", { text: `Background Granted Skills:`, cls: "dnd-form-label-sub" });

            const autoSkillsText = bgData.skills.map((skill: string) => {
                return skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }).join(', ');

            autoBgSkillsDiv.createEl("div", {
                text: autoSkillsText,
                cls: "dnd-form-readonly-box"
            });
        }
    }

    async renderStepThree(container: HTMLElement) {
        container.createEl("h3", { text: "Features Options", cls: "dnd-class-header" });
        container.createEl("p", {
            text: "Configure your feature choices, race/class granted feats, and optional extra feats.",
            cls: "dnd-form-hint-block"
        });

        let hasChoices = false;
        const wizardLevelNum = Number(this.wizardData.level) || 1;
        if (!this.wizardData.grantedFeatSelections || typeof this.wizardData.grantedFeatSelections !== "object") {
            this.wizardData.grantedFeatSelections = {};
        }

        // Gather Skills from Step 2 & Background so Expertise selectors know eligible proficiencies
        let availableProficiencies: string[] = [];
        availableProficiencies.push(...(this.wizardData.chosenSkills || []));
        availableProficiencies.push(...(this.wizardData.chosenBgSkills || []));

        if (this.wizardData.background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgData?.skills) availableProficiencies.push(...bgData.skills);
        }
        availableProficiencies = [...new Set(availableProficiencies.filter(s => s !== "").map(s => s.toLowerCase()))];

        let classData: any = null;
        let subclassData: any = null;
        if (this.wizardData.dndClass) {
            classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, wizardLevelNum);
            if (this.wizardData.subclass && grantedSubclassFile) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile, this.wizardData.subclass);
            }

            if (classData && classData.features) {
                const { slotsByRouter } = this.plugin.resolveClassChoiceRoutersUpToLevel(classData, subclassData, wizardLevelNum);

                // Prune any stale classChoices if the user changed class or lowered level
                if (Array.isArray(this.wizardData.classChoices)) {
                    this.wizardData.classChoices = this.wizardData.classChoices.filter((c: any) => {
                        if (!Array.isArray(c) || c.length < 4) return false;
                        const rSlots = slotsByRouter[String(c[0])];
                        return rSlots && Number(c[3]) < rSlots.length;
                    });
                }

                // 1. Render all unlocked Class Choice Routers up to wizardLevelNum
                for (const [routerName, slots] of Object.entries(slotsByRouter)) {
                    if (!slots || slots.length === 0) continue;
                    const routerData = await getClassChoiceRouterData(this.app, this.plugin.settings, routerName);
                    if (!routerData) continue;

                    hasChoices = true;
                    const displayName = routerName.split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                    for (let choiceIndex = 0; choiceIndex < slots.length; choiceIndex++) {
                        const slotInfo = slots[choiceIndex];
                        const slotLevelStr = slotInfo.unlockedLevel.toString();

                        const choiceDiv = container.createDiv({ cls: "dnd-form-card" });
                        choiceDiv.createEl("label", {
                            text: `Level ${slotLevelStr}: ${slotInfo.featureName} (${displayName} ${choiceIndex + 1})`,
                            cls: "dnd-form-label-bold"
                        });

                        const selectEl = choiceDiv.createEl("select", { cls: "dnd-modal-form-input" });
                        selectEl.createEl("option", { text: `-- Select Option --`, value: "" });

                        Object.entries(routerData).forEach(([key, val]) => {
                            selectEl.createEl("option", { text: val as string, value: key });
                        });

                        const existingChoice = this.wizardData.classChoices.find((c: any) => c[0] === routerName && c[3] === choiceIndex);
                        if (existingChoice) {
                            existingChoice[2] = slotLevelStr;
                            selectEl.value = existingChoice[1];
                        }

                        selectEl.onchange = (e) => {
                            const selectedVal = (e.target as HTMLSelectElement).value;
                            this.wizardData.classChoices = this.wizardData.classChoices.filter((c: any) => !(c[0] === routerName && c[3] === choiceIndex));

                            if (selectedVal) {
                                this.wizardData.classChoices.push([routerName, selectedVal, slotLevelStr, choiceIndex]);
                            }
                        };
                    }
                }

                // 2. Render Class/Subclass Expertise Engine (grantedExpertise) across levels 1..wizardLevelNum
                if (!Array.isArray(this.wizardData.expertiseChoices)) {
                    this.wizardData.expertiseChoices = [];
                }
                let expertiseSlotIndex = 0;

                for (let lvl = 1; lvl <= wizardLevelNum; lvl++) {
                    const targetLevel = lvl.toString();
                    let levelFeatures: any[] = [];
                    if (classData.features[targetLevel]) {
                        levelFeatures = levelFeatures.concat(classData.features[targetLevel]);
                    }
                    if (subclassData && subclassData[targetLevel]) {
                        levelFeatures = levelFeatures.concat(subclassData[targetLevel]);
                    }

                    for (const feature of levelFeatures) {
                        if (feature.grantedExpertise && Array.isArray(feature.grantedExpertise) && feature.grantedExpertise.length === 2) {
                            hasChoices = true;
                            const expPool = feature.grantedExpertise[0] as string[];
                            const grantedExpertiseCount = Number(feature.grantedExpertise[1]) || 0;

                            if (grantedExpertiseCount > 0) {
                                const expDiv = container.createDiv({ cls: "dnd-form-card" });
                                expDiv.createEl("label", {
                                    text: `Level ${targetLevel}: ${feature.name} (${grantedExpertiseCount} Choices)`,
                                    cls: "dnd-form-label-bold"
                                });
                                expDiv.createEl("small", {
                                    text: "Select skills you are already proficient in to gain Expertise.",
                                    cls: "dnd-form-hint-block"
                                });

                                let filteredProficiencies = availableProficiencies;
                                if (expPool.length > 0) {
                                    const lowerPool = expPool.map(s => String(s).toLowerCase());
                                    filteredProficiencies = availableProficiencies.filter(skill => lowerPool.includes(String(skill).toLowerCase()));
                                }

                                if (filteredProficiencies.length === 0) {
                                    for (let e = 0; e < grantedExpertiseCount; e++) {
                                        this.wizardData.expertiseChoices[expertiseSlotIndex++] = ["", targetLevel];
                                    }
                                    expDiv.createEl("p", {
                                        text: "You have no eligible skill proficiencies to gain Expertise in. Please go back to Step 2 and select your class/background skills first!",
                                        cls: "dnd-error-text dnd-form-note"
                                    });
                                } else {
                                    for (let e = 0; e < grantedExpertiseCount; e++) {
                                        const slotIdx = expertiseSlotIndex++;
                                        const existingTuple = this.wizardData.expertiseChoices[slotIdx];
                                        const prevSkill = Array.isArray(existingTuple) ? String(existingTuple[0] || "") : "";
                                        const validPrevSkill = filteredProficiencies.includes(prevSkill) ? prevSkill : "";
                                        this.wizardData.expertiseChoices[slotIdx] = [validPrevSkill, targetLevel];

                                        const selectDiv = expDiv.createDiv({ cls: "dnd-form-slot-row" });
                                        selectDiv.createEl("small", { text: `Choice ${e + 1}:`, cls: "dnd-form-slot-label-sm" });

                                        const selectEl = selectDiv.createEl("select", { cls: "dnd-flex-1" });
                                        selectEl.createEl("option", { text: `-- Select Expertise --`, value: "" });

                                        filteredProficiencies.forEach(skill => {
                                            const displaySkill = skill.replace(/\b\w/g, c => c.toUpperCase());
                                            selectEl.createEl("option", { text: displaySkill, value: skill });
                                        });

                                        selectEl.value = validPrevSkill;

                                        selectEl.onchange = (evt) => {
                                            const val = (evt.target as HTMLSelectElement).value;
                                            this.wizardData.expertiseChoices[slotIdx] = [val, targetLevel];
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
                this.wizardData.expertiseChoices = this.wizardData.expertiseChoices.slice(0, expertiseSlotIndex);
            } else {
                this.wizardData.expertiseChoices = [];
            }
        } else {
            this.wizardData.expertiseChoices = [];
        }

        // 3. Gather Race Trait & Class/Subclass Granted Feats Milestones
        interface WizardFeatMilestone {
            slotKey: string;
            featureName: string;
            headerLabel: string;
            descriptionHint?: string;
            grantedFeats: string[];
        }
        const featMilestones: WizardFeatMilestone[] = [];

        if (this.wizardData.race) {
            const raceData = await getRaceData(this.app, this.plugin.settings, this.wizardData.race);
            const raceTraits = raceData?.traits || raceData?.features;
            const lineageClean = String(this.wizardData.raceLineage || "").trim().toLowerCase();
            if (Array.isArray(raceTraits)) {
                raceTraits.forEach((trait: any, tIdx: number) => {
                    if (!trait) return;
                    if (trait.lineage && String(trait.lineage).trim().toLowerCase() !== lineageClean) return;
                    if (Array.isArray(trait.grantedFeats) && trait.grantedFeats.length > 0) {
                        const raceSlug = toSlug(this.wizardData.race) || "race";
                        const traitName = trait.name || "Trait";
                        const traitSlug = toSlug(trait.name || `trait-${tIdx}`) || `trait-${tIdx}`;
                        featMilestones.push({
                            slotKey: `race:${raceSlug}:${traitSlug}:${tIdx}`,
                            featureName: traitName,
                            headerLabel: `Race Trait: ${traitName}`,
                            descriptionHint: typeof trait.description === "string" ? trait.description : undefined,
                            grantedFeats: trait.grantedFeats
                        });
                    }
                });
            }
        }

        if (classData?.features) {
            const classSlug = toSlug(this.wizardData.dndClass) || "class";
            for (let lvl = 1; lvl <= wizardLevelNum; lvl++) {
                const lvlKey = lvl.toString();
                const classLvlFeatures = classData.features[lvlKey];
                if (Array.isArray(classLvlFeatures)) {
                    classLvlFeatures.forEach((feature: any, fIdx: number) => {
                        if (feature && Array.isArray(feature.grantedFeats) && feature.grantedFeats.length > 0) {
                            const featureName = feature.name || "Granted Feats";
                            const fSlug = toSlug(feature.name || `feat-${fIdx}`) || `feat-${fIdx}`;
                            featMilestones.push({
                                slotKey: `class:${classSlug}:lvl${lvl}:${fSlug}:${fIdx}`,
                                featureName,
                                headerLabel: `Level ${lvl}: ${featureName}`,
                                grantedFeats: feature.grantedFeats
                            });
                        }
                    });
                }

                const subLvlFeatures = subclassData?.[lvlKey];
                if (Array.isArray(subLvlFeatures)) {
                    subLvlFeatures.forEach((feature: any, fIdx: number) => {
                        if (feature && Array.isArray(feature.grantedFeats) && feature.grantedFeats.length > 0) {
                            const featureName = feature.name || "Granted Feats";
                            const fSlug = toSlug(feature.name || `subfeat-${fIdx}`) || `subfeat-${fIdx}`;
                            featMilestones.push({
                                slotKey: `subclass:${classSlug}:lvl${lvl}:${fSlug}:${fIdx}`,
                                featureName,
                                headerLabel: `Level ${lvl} (${this.wizardData.subclass}): ${featureName}`,
                                grantedFeats: feature.grantedFeats
                            });
                        }
                    });
                }
            }
        }

        // Prune stale selections that no longer match active Race/Lineage/Class/Subclass/Level
        const validSlotKeys = new Set(featMilestones.map(m => m.slotKey));
        for (const existingKey of Object.keys(this.wizardData.grantedFeatSelections)) {
            if (!validSlotKeys.has(existingKey)) {
                delete this.wizardData.grantedFeatSelections[existingKey];
            }
        }

        const existingSavingThrows = parseSavingThrows(classData?.savingThroughProf || []);
        const getBaselineStats = (): Record<string, number> => {
            const base: Record<string, number> = {};
            for (const stat of ALL_ABILITIES) {
                const rawBase = Number(this.wizardData[stat]) || 10;
                const bgBonus = Array.isArray(this.wizardData.chosenAbilityBonuses)
                    ? this.wizardData.chosenAbilityBonuses.filter((b: string) => String(b).toLowerCase() === stat).length
                    : 0;
                base[stat] = rawBase + bgBonus;
            }
            return base;
        };

        const getStatsForMilestone = (excludeSlotKey: string): Record<string, number> => {
            const stats = getBaselineStats();
            for (const [otherKey, otherSel] of Object.entries(this.wizardData.grantedFeatSelections || {}) as [string, GrantedFeatMilestoneState][]) {
                if (otherKey === excludeSlotKey || !otherSel) continue;
                if (otherSel.chosenOptionType === "asi") {
                    if (otherSel.asiStat1 && ALL_ABILITIES.includes(otherSel.asiStat1 as AbilityKey)) {
                        stats[otherSel.asiStat1] = Math.min(20, (stats[otherSel.asiStat1] || 10) + 1);
                    }
                    if (otherSel.asiStat2 && ALL_ABILITIES.includes(otherSel.asiStat2 as AbilityKey)) {
                        stats[otherSel.asiStat2] = Math.min(20, (stats[otherSel.asiStat2] || 10) + 1);
                    }
                } else if (otherSel.chosenFeatKey && otherSel.abilityChoices) {
                    for (const chosenAb of Object.values(otherSel.abilityChoices)) {
                        if (chosenAb && ALL_ABILITIES.includes(chosenAb)) {
                            stats[chosenAb] = Math.min(20, (stats[chosenAb] || 10) + 1);
                        }
                    }
                }
            }
            return stats;
        };

        let renderOptionalExtraFeatsSection = () => {};

        for (const milestone of featMilestones) {
            let state = this.wizardData.grantedFeatSelections[milestone.slotKey] as GrantedFeatMilestoneState | undefined;
            if (!state) {
                state = createEmptyGrantedFeatState(milestone.featureName, milestone.grantedFeats);
                this.wizardData.grantedFeatSelections[milestone.slotKey] = state;
            } else {
                state.options = [...milestone.grantedFeats];
                state.featureName = milestone.featureName;
            }

            const rendered = await renderGrantedFeatMilestoneCard({
                app: this.app,
                settings: this.plugin.settings,
                parentEl: container,
                headerLabel: milestone.headerLabel,
                cardCls: "dnd-form-card",
                descriptionHint: milestone.descriptionHint,
                state,
                getCurrentStats: () => getStatsForMilestone(milestone.slotKey),
                existingSavingThrows,
                knownSkillsForExpertise: availableProficiencies,
                getAlreadyUsedExpertise: () => {
                    const used = (this.wizardData.expertiseChoices || [])
                        .map((c: any[]) => String(c?.[0] || "").toLowerCase())
                        .filter(Boolean);
                    for (const [otherKey, otherSel] of Object.entries(this.wizardData.grantedFeatSelections || {}) as [string, GrantedFeatMilestoneState][]) {
                        if (otherKey === milestone.slotKey || !otherSel) continue;
                        for (const exp of otherSel.featExpertiseChoices || []) {
                            if (exp) used.push(String(exp).toLowerCase());
                        }
                    }
                    return used;
                },
                onStateChange: () => {
                    renderOptionalExtraFeatsSection();
                }
            });
            if (rendered) hasChoices = true;
        }

        if (!hasChoices) {
            container.createEl("p", {
                text: "No automatic race or class feature choices available for this level.",
                cls: "dnd-form-note"
            });
        }

        // 4. Optional Extra Feats Section (moved from Step 4)
        if (!this.availableFeats || this.availableFeats.length === 0) {
            this.availableFeats = await getAvailableFeats(this.app, this.plugin.settings);
        }
        const featDisplayMap: Record<string, FeatPoolEntry> = {};
        for (const f of this.availableFeats) {
            featDisplayMap[normalizeFeatKey(f.id)] = f;
        }

        const optionalSectionDiv = container.createDiv({ cls: "dnd-form-divider-section" });
        renderOptionalExtraFeatsSection = () => {
            optionalSectionDiv.empty();
            optionalSectionDiv.createEl("h4", { text: "Extra Feats (Optional)", cls: "dnd-wizard-subhead" });
            optionalSectionDiv.createEl("small", {
                text: "Optionally add any extra bonus or homebrew feats (saved to DnD_extraFeats).",
                cls: "dnd-form-hint-block"
            });

            const currentOptional = parseExtraFeatsList(this.wizardData.extraFeats);
            this.wizardData.extraFeats = currentOptional;

            const listDiv = optionalSectionDiv.createDiv({ cls: "dnd-manage-scroll-list" });
            if (currentOptional.length === 0) {
                listDiv.createEl("p", { text: "No optional extra feats added.", cls: "dnd-manage-empty-box" });
            } else {
                currentOptional.forEach((featEntry, idx) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });
                    const meta = featDisplayMap[normalizeFeatKey(featEntry)];
                    const labelWrap = row.createEl("span", { cls: "dnd-modal-row-name dnd-feat-row-label" });
                    labelWrap.createSpan({ text: meta?.name || formatFeatureOrSlug(featEntry) });
                    if (meta?.category) {
                        labelWrap.createSpan({ text: meta.category, cls: "dnd-level-badge dnd-feat-cat-badge" });
                    }

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = () => {
                        const updated = parseExtraFeatsList(this.wizardData.extraFeats);
                        updated.splice(idx, 1);
                        this.wizardData.extraFeats = updated;
                        renderOptionalExtraFeatsSection();
                    };
                });
            }

            const addDiv = optionalSectionDiv.createDiv({ cls: "dnd-modal-add-bar" });
            const selectEl = addDiv.createEl("select", { cls: "dnd-modal-add-select" });
            const excludedSlugs = new Set<string>(
                [...currentOptional, ...this.getWizardGrantedFeatKeys()]
                    .map(f => normalizeFeatKey(f))
                    .filter(Boolean)
            );
            populateGroupedFeatSelect(selectEl, this.availableFeats, excludedSlugs, "-- Select Optional Extra Feat --");

            const addBtn = addDiv.createEl("button", { text: "Add Feat" });
            addBtn.onclick = () => {
                const chosenId = selectEl.value;
                if (!chosenId) return;
                const chosenSlug = normalizeFeatKey(chosenId);
                const updated = parseExtraFeatsList(this.wizardData.extraFeats);
                if (!updated.some(f => normalizeFeatKey(f) === chosenSlug)) {
                    updated.push(chosenId);
                    this.wizardData.extraFeats = updated;
                    renderOptionalExtraFeatsSection();
                }
            };
        };
        renderOptionalExtraFeatsSection();
    }

    async renderStepFour(container: HTMLElement) {
        container.createEl("h3", { text: "Equipment", cls: "dnd-class-header" });

        // Languages Input
        const langDiv = container.createDiv({ cls: "dnd-form-group" });
        langDiv.createEl("label", { text: "Languages: ", cls: "dnd-form-label-sm" });
        const langInput = langDiv.createEl("input", { type: "text", value: this.wizardData.languages, cls: "dnd-modal-form-input" });
        langInput.placeholder = "Common, Elvish...";
        langInput.onchange = (e) => this.wizardData.languages = (e.target as HTMLInputElement).value;

        // Tool Proficiencies Row (Comma-separated input + Quick-Add Rulebook Tool Dropdown)
        const toolsGrid = container.createDiv({ cls: "dnd-form-grid-2" });
        const toolsInputDiv = toolsGrid.createDiv();
        toolsInputDiv.createEl("label", { text: "Tool Proficiencies: ", cls: "dnd-form-label-sm" });
        const toolsInput = toolsInputDiv.createEl("input", {
            type: "text",
            value: this.wizardData.toolProficiencies || "",
            cls: "dnd-modal-form-input"
        });
        toolsInput.placeholder = "Thieves' Tools, Herbalism Kit...";
        toolsInput.oninput = (e) => this.wizardData.toolProficiencies = (e.target as HTMLInputElement).value;

        const toolsSelectDiv = toolsGrid.createDiv();
        toolsSelectDiv.createEl("label", { text: "Quick-Add Rulebook Tool: ", cls: "dnd-form-label-sm" });
        const toolsSelect = toolsSelectDiv.createEl("select", { cls: "dnd-modal-form-input" });
        toolsSelect.createEl("option", { text: "-- Select a Tool to Add --", value: "" });
        this.availableTools.forEach(toolName => {
            toolsSelect.createEl("option", { text: toolName, value: toolName });
        });
        toolsSelect.onchange = () => {
            const chosenTool = toolsSelect.value;
            if (!chosenTool) return;
            const currentTools = String(this.wizardData.toolProficiencies || "")
                .split(",")
                .map(t => t.trim())
                .filter(Boolean);
            if (!currentTools.some(t => t.toLowerCase() === chosenTool.toLowerCase())) {
                currentTools.push(chosenTool);
                this.wizardData.toolProficiencies = currentTools.join(", ");
                toolsInput.value = this.wizardData.toolProficiencies;
            }
            toolsSelect.value = "";
        };

        // HELPER: Extracts flexible ('|') item choice slots from a startingEquipment option
        interface FlexibleItemSlot {
            acceptedTypes: string[];
            labelText: string;
        }
        const getFlexibleSlots = (equipmentData: any): FlexibleItemSlot[] => {
            const slots: FlexibleItemSlot[] = [];
            if (!equipmentData || !equipmentData.items || typeof equipmentData.items !== "object") {
                return slots;
            }
            for (const [key, rawQty] of Object.entries(equipmentData.items)) {
                if (!key.includes("|")) continue;
                const qty = Math.max(1, Number(rawQty) || 1);
                const acceptedTypes = key
                    .split("|")
                    .map(t => t.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-'))
                    .filter(Boolean);
                if (acceptedTypes.length === 0) continue;

                const formattedTypes = acceptedTypes.map(typeSlug =>
                    typeSlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                ).join(' / ');

                for (let i = 0; i < qty; i++) {
                    const suffix = qty > 1 ? ` #${i + 1}` : "";
                    slots.push({
                        acceptedTypes,
                        labelText: `${formattedTypes}${suffix}`
                    });
                }
            }
            return slots;
        };

        const renderFlexibleItemDropdowns = (
            parentContainer: HTMLElement,
            prefixLabel: string,
            slots: FlexibleItemSlot[],
            dataKey: "classChosenItems" | "backgroundChosenItems"
        ) => {
            if (slots.length === 0) {
                this.wizardData[dataKey] = [];
                return;
            }

            const existingRaw = this.wizardData[dataKey];
            const existingArr: string[] = Array.isArray(existingRaw)
                ? existingRaw.map(v => String(v || ""))
                : (typeof existingRaw === "string" && existingRaw.trim() !== ""
                    ? existingRaw.split(",").map(s => s.trim())
                    : []);

            const normalizedSelections: string[] = new Array(slots.length).fill("");
            const subpanel = parentContainer.createDiv({ cls: "dnd-form-subpanel" });

            slots.forEach((slot, idx) => {
                const matchingItems = this.availableItems.filter(item =>
                    slot.acceptedTypes.includes(item.type)
                );

                subpanel.createEl("label", {
                    text: `${prefixLabel} (${slot.labelText}): `,
                    cls: "dnd-form-label-sub"
                });

                const selectEl = subpanel.createEl("select", { cls: "dnd-modal-form-input" });
                selectEl.createEl("option", { text: `-- Select ${slot.labelText} --`, value: "" });

                matchingItems.forEach(item => {
                    selectEl.createEl("option", { text: item.name, value: item.id });
                });

                const candidate = existingArr[idx] || "";
                const matchedItem = matchingItems.find(
                    item => item.id.toLowerCase() === candidate.toLowerCase() || item.name.toLowerCase() === candidate.toLowerCase()
                );
                if (matchedItem) {
                    selectEl.value = matchedItem.id;
                    normalizedSelections[idx] = matchedItem.id;
                }

                selectEl.onchange = (e) => {
                    normalizedSelections[idx] = (e.target as HTMLSelectElement).value;
                    this.wizardData[dataKey] = [...normalizedSelections];
                };
            });

            this.wizardData[dataKey] = normalizedSelections;
        };

        // --- Class Equipment Section ---
        let classFlexSlots: FlexibleItemSlot[] = [];
        let classEqOptions = ["A", "B"]; // Safe fallback

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (classData?.startingEquipment) {
                // Dynamically fetch A, B, C, etc. directly from the JSON
                classEqOptions = Object.keys(classData.startingEquipment).sort();

                const eqChoice = classEqOptions.includes(this.wizardData.classEquipment)
                    ? this.wizardData.classEquipment
                    : classEqOptions[0];
                if (classData.startingEquipment[eqChoice]) {
                    classFlexSlots = getFlexibleSlots(classData.startingEquipment[eqChoice]);
                }
            }
        }

        const classEqDiv = container.createDiv({ cls: "dnd-form-group" });
        classEqDiv.createEl("label", { text: "Class Starting Equipment Choice: ", cls: "dnd-form-label" });
        const classEqSelect = classEqDiv.createEl("select", { cls: "dnd-modal-form-input" });

        classEqOptions.forEach(opt => {
            classEqSelect.createEl("option", { text: `Choice ${opt}`, value: opt });
        });

        if (!classEqOptions.includes(this.wizardData.classEquipment)) {
            this.wizardData.classEquipment = classEqOptions[0];
        }
        classEqSelect.value = this.wizardData.classEquipment;

        classEqSelect.onchange = async (e) => {
            this.wizardData.classEquipment = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };

        renderFlexibleItemDropdowns(container, "Class Chosen Item", classFlexSlots, "classChosenItems");

        // --- Background Equipment Section ---
        let bgFlexSlots: FlexibleItemSlot[] = [];
        let bgEqOptions = ["A", "B"]; // Safe fallback

        if (this.wizardData.background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgData?.startingEquipment) {
                bgEqOptions = Object.keys(bgData.startingEquipment).sort();

                const eqChoice = bgEqOptions.includes(this.wizardData.backgroundEquipment)
                    ? this.wizardData.backgroundEquipment
                    : bgEqOptions[0];
                if (bgData.startingEquipment[eqChoice]) {
                    bgFlexSlots = getFlexibleSlots(bgData.startingEquipment[eqChoice]);
                }
            }
        }

        const bgEqDiv = container.createDiv({ cls: "dnd-form-group" });
        bgEqDiv.createEl("label", { text: "Background Starting Equipment Choice: ", cls: "dnd-form-label" });
        const bgEqSelect = bgEqDiv.createEl("select", { cls: "dnd-modal-form-input" });

        bgEqOptions.forEach(opt => {
            bgEqSelect.createEl("option", { text: `Choice ${opt}`, value: opt });
        });

        if (!bgEqOptions.includes(this.wizardData.backgroundEquipment)) {
            this.wizardData.backgroundEquipment = bgEqOptions[0];
        }
        bgEqSelect.value = this.wizardData.backgroundEquipment;

        bgEqSelect.onchange = async (e) => {
            this.wizardData.backgroundEquipment = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };

        renderFlexibleItemDropdowns(container, "Background Chosen Item", bgFlexSlots, "backgroundChosenItems");

        // --- Equipped Items (Weapon & Armor with Custom Toggle) ---
        container.createEl("h4", { text: "Equipped Items", cls: "dnd-wizard-subhead" });

        const bgDataForMastery = this.wizardData.background
            ? await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background)
            : null;
        const wizardMasteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            this.wizardData.dndClass,
            [Number(this.wizardData.level) || 1],
            Number(this.wizardData.level) || 1,
            this.getCompiledExtraFeats(),
            bgDataForMastery?.feat,
            this.wizardData.subclass,
            this.plugin.settings,
            this.wizardData.race,
            this.wizardData.raceLineage
        );
        if (!Array.isArray(this.wizardData.weaponMasteries)) {
            this.wizardData.weaponMasteries = [];
        }

        renderWeaponAndArmorLoadoutControls({
            parentEl: container,
            availableWeapons: this.availableWeapons,
            availableArmors: this.availableArmors,
            availableMasterySlots: wizardMasteryCalc.totalSlots,
            getMasteredWeapons: () => Array.isArray(this.wizardData.weaponMasteries) ? this.wizardData.weaponMasteries : [],
            setMasteredWeapons: (list) => { this.wizardData.weaponMasteries = list; },
            getWeaponName: () => this.wizardData.weapon || "",
            setWeaponName: (val) => { this.wizardData.weapon = val; },
            getWeaponDamage: () => this.wizardData.weaponDamage || "",
            setWeaponDamage: (val) => { this.wizardData.weaponDamage = val; },
            getIsWeaponCustom: () => Boolean(this.wizardData.isWeaponCustom),
            setIsWeaponCustom: (val) => { this.wizardData.isWeaponCustom = val; },
            getArmorName: () => this.wizardData.armor || "",
            setArmorName: (val) => { this.wizardData.armor = val; },
            getArmorAc: () => this.wizardData.armorAc ?? "",
            setArmorAc: (val) => { this.wizardData.armorAc = val; },
            getIsArmorCustom: () => Boolean(this.wizardData.isArmorCustom),
            setIsArmorCustom: (val) => { this.wizardData.isArmorCustom = val; },
            defaultArmorAcOnClear: "",
            coerceMatchedArmorAc: (acStr) => Number(acStr) || 10,
            onViewMasteries: () => new NoteModal(this.app, this.plugin, "weapon-masteries").open(),
            onModeToggleReRender: () => { void this.renderStep(); }
        });
    }

    renderStepFive(container: HTMLElement) {
        container.createEl("h3", { text: "Finalization", cls: "dnd-class-header" });
        container.createEl("p", { text: "Review your choices. Clicking finish will generate the sheet!" });
    }

    async finishWizard() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            new Notice("Error: Please open a note to generate the character sheet.");
            return;
        }

        // 1. Generate unique state keys based on Character Name
        const rawName = this.wizardData.name || "hero";
        const safeName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomId = Math.random().toString(36).substring(2, 6);
        const stateKey = `${safeName}_${randomId}`;

        // 2. Fetch Dynamic Data from Class & Background JSON
        let DnD_hit_dice = "d8";
        let savingThrows: string[] = [];
        let proficiencyBonusArray: any[] | null = null;
        let bgFeat = "";
        let bgDataStore: any = null;
        let unarmoredDefense = "";
        let attackStat = "strength";
        let spellcastingData: any = null;
        let initialSpeedMod = 0;
        const wizardLvlNum = Number(this.wizardData.level) || 1;
        let classSpellsPool: string | null = null;
        let classSpellAbilitiesForWizard: string[] = [];

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (classData) {
                const hd = classData.HitDice || classData.hitDice || classData.hit_dice || classData.hitDie || classData.hit_die;
                if (hd) DnD_hit_dice = String(hd).trim();

                if (classData.savingThroughProf && Array.isArray(classData.savingThroughProf)) {
                    savingThrows = classData.savingThroughProf;
                }

                if (classData.proficiencyBonus && Array.isArray(classData.proficiencyBonus)) {
                    proficiencyBonusArray = classData.proficiencyBonus;
                }

                // Extract Data-Driven Mechanics
                if (classData.unarmoredDefense) unarmoredDefense = String(classData.unarmoredDefense).toLowerCase().trim();
                if (classData.defaultAttackStat) attackStat = String(classData.defaultAttackStat).toLowerCase().trim();

                // Extract Spellcasting Engine Data
                let subclassDataForWizard: any = null;
                if (this.wizardData.subclass) {
                    const grantedSub = this.plugin.findGrantedSubclass(classData, Number(this.wizardData.level) || 1);
                    if (grantedSub) {
                        subclassDataForWizard = await getSubclassData(this.app, this.plugin.settings, grantedSub, this.wizardData.subclass);
                    }
                }
                const spellMeta = this.plugin.resolveSpellcastingMetadata(classData, subclassDataForWizard, wizardLvlNum);
                if (spellMeta.spellcastingTable) {
                    spellcastingData = spellMeta.spellcastingTable;
                }
                classSpellsPool = spellMeta.spellsPool;
                classSpellAbilitiesForWizard = spellMeta.spellcastingAbilities;
            }
        }

        const raceDataForWizard = this.wizardData.race
            ? await getRaceData(this.app, this.plugin.settings, this.wizardData.race)
            : null;
        const raceSpellMetaForWizard = await this.plugin.resolveRaceSpellcastingMetadata(
            raceDataForWizard,
            this.wizardData.raceLineage,
            wizardLvlNum
        );
        if (!this.wizardData.DnD_spellcasting_ability) {
            if (classSpellAbilitiesForWizard.length === 1) {
                this.wizardData.DnD_spellcasting_ability = classSpellAbilitiesForWizard[0];
            } else if (classSpellAbilitiesForWizard.length === 0 && raceSpellMetaForWizard.spellcastingAbilities.length === 1) {
                this.wizardData.DnD_spellcasting_ability = raceSpellMetaForWizard.spellcastingAbilities[0];
            }
        }
        const compiledSpellPools = Array.from(new Set([
            ...(classSpellsPool ? [classSpellsPool] : []),
            ...raceSpellMetaForWizard.spellsPools
        ]));

        if (this.wizardData.background) {
            bgDataStore = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgDataStore && bgDataStore.feat) {
                bgFeat = formatFeatureOrSlug(bgDataStore.feat);
            }
        }

        // --- Calculate Final Stats (Base + Background Bonuses + Fixed Feat Bonuses) ---
        const getStatDetails = (statName: string) => {
            const base = this.wizardData[statName] || 10;
            const bonus = this.wizardData.chosenAbilityBonuses
                ? this.wizardData.chosenAbilityBonuses.filter((b: string) => b.toLowerCase() === statName.toLowerCase()).length
                : 0;
            return { base, bonus, final: base + bonus };
        };

        const strStats = getStatDetails("strength");
        const dexStats = getStatDetails("dexterity");
        const conStats = getStatDetails("constitution");
        const intStats = getStatDetails("intelligence");
        const wisStats = getStatDetails("wisdom");
        const chaStats = getStatDetails("charisma");

        // --- Dynamic AC & Unarmed Strike Calculation ---
        const wizardStatsRecord: Record<string, number> = {
            strength: strStats.final,
            dexterity: dexStats.final,
            constitution: conStats.final,
            intelligence: intStats.final,
            wisdom: wisStats.final,
            charisma: chaStats.final
        };

        const preFeatureConMod = Math.floor((wizardStatsRecord.constitution - 10) / 2);
        const wizardExtraFeats = this.getCompiledExtraFeats();
        const extraFeatSavingThrows: AbilityKey[] = [];
        const featGrantedExpertise: [string, string][] = [];

        // Apply ASI, choice-based improveAbility, saving throws & expertise from Step 3 grantedFeatSelections
        for (const [slotKey, sel] of Object.entries(this.wizardData.grantedFeatSelections || {}) as [string, GrantedFeatMilestoneState][]) {
            if (!sel) continue;
            if (sel.chosenOptionType === "asi") {
                if (sel.asiStat1 && ALL_ABILITIES.includes(sel.asiStat1 as AbilityKey)) {
                    wizardStatsRecord[sel.asiStat1] = Math.min(20, (wizardStatsRecord[sel.asiStat1] || 10) + 1);
                }
                if (sel.asiStat2 && ALL_ABILITIES.includes(sel.asiStat2 as AbilityKey)) {
                    wizardStatsRecord[sel.asiStat2] = Math.min(20, (wizardStatsRecord[sel.asiStat2] || 10) + 1);
                }
            } else if (sel.chosenFeatKey) {
                const fData = await getExtraFeat(this.app, this.plugin.settings, sel.chosenFeatKey);
                if (fData) {
                    const improvements = parseFeatAbilityImprovements(fData);
                    improvements.forEach((imp, impIdx) => {
                        if (imp.isChoice && sel.abilityChoices?.[impIdx]) {
                            const targetStat = sel.abilityChoices[impIdx];
                            if (ALL_ABILITIES.includes(targetStat)) {
                                wizardStatsRecord[targetStat] = Math.min(imp.maxCap, (wizardStatsRecord[targetStat] || 10) + imp.amount);
                            }
                        }
                    });
                    const chosenAbilities = Object.values(sel.abilityChoices || {});
                    const gainedSaves = parseFeatSavingThrowProficiencies(fData, chosenAbilities[0]);
                    gainedSaves.forEach(s => {
                        if (!extraFeatSavingThrows.includes(s)) extraFeatSavingThrows.push(s);
                    });
                }
                const lvlMatch = slotKey.match(/:lvl(\d+):/);
                const grantedLevelStr = lvlMatch ? lvlMatch[1] : "1";
                if (Array.isArray(sel.featExpertiseChoices)) {
                    for (const expSkill of sel.featExpertiseChoices) {
                        if (expSkill) featGrantedExpertise.push([String(expSkill), grantedLevelStr]);
                    }
                }
            }
        }

        // Apply fixed (!isChoice) improveAbility & explicit saving throws once across all compiled extra feats
        for (const fKey of wizardExtraFeats) {
            if (!fKey) continue;
            const fData = await getExtraFeat(this.app, this.plugin.settings, String(fKey));
            if (fData) {
                const improvements = parseFeatAbilityImprovements(fData);
                for (const imp of improvements) {
                    if (!imp.isChoice && imp.options.length === 1) {
                        const targetStat = imp.options[0];
                        const curr = wizardStatsRecord[targetStat] || 10;
                        wizardStatsRecord[targetStat] = Math.min(imp.maxCap, curr + imp.amount);
                    }
                }
                const explicitSaves = parseFeatSavingThrowProficiencies(fData);
                explicitSaves.forEach(s => {
                    if (!extraFeatSavingThrows.includes(s)) extraFeatSavingThrows.push(s);
                });
            }
        }

        const postFeatureConMod = Math.floor((wizardStatsRecord.constitution - 10) / 2);
        const featureConDelta = Math.max(0, postFeatureConMod - preFeatureConMod);
        const finalWizardMaxHealth = (Number(this.wizardData.maxHealth) > 0)
            ? Number(this.wizardData.maxHealth) + (featureConDelta * wizardLvlNum)
            : this.wizardData.maxHealth;

        // Resolve Speed Modifier deterministically adhering to D&D 5.5e
        const speedCalc = await this.plugin.resolveCharacterSpeedModifiers(
            this.wizardData.dndClass,
            this.wizardData.classLevels,
            wizardLvlNum,
            wizardExtraFeats,
            bgDataStore?.feat,
            this.wizardData.armor,
            this.wizardData.speed || 30,
            0,
            this.wizardData.subclass,
            this.plugin.settings,
            this.wizardData.race,
            this.wizardData.raceLineage
        );
        initialSpeedMod = speedCalc.totalSpeedMod;

        // If "Unarmed Strike" was chosen as the weapon, compute its dynamic scaling damage
        const safeWizardWeapon = String(this.wizardData.weapon || "").toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        if (!this.wizardData.isWeaponCustom && (safeWizardWeapon === "unarmed-strike" || safeWizardWeapon === "unarmed-strikes")) {
            this.wizardData.weaponDamage = await this.plugin.resolveUnarmedStrikeDamage(
                this.wizardData.dndClass,
                null,
                Number(this.wizardData.level) || 1,
                wizardStatsRecord,
                attackStat,
                this.plugin.settings
            );
        }

        const armorStats = await this.plugin.resolveEquippedArmorStats({
            armorNameInput: this.wizardData.armor,
            manualAcInput: this.wizardData.armorAc,
            isCustomMode: Boolean(this.wizardData.isArmorCustom),
            classInput: this.wizardData.dndClass,
            classLevelsInput: null,
            totalLevel: Number(this.wizardData.level) || 1,
            statsRecord: wizardStatsRecord,
            subclassInput: this.wizardData.subclass,
            fetchOptions: this.plugin.settings
        });
        this.wizardData.armorAc = armorStats.armorAc;
        this.wizardData.armorAcBonus = armorStats.armorAcBonus;
        this.wizardData.armorAcMod = 0; // Initialize manual modifier strictly to 0

        // 3. Prepare the Template string
        let finalContent = (await this.plugin.getTemplateContent()) || "";
        if (!finalContent) {
            new Notice("Error: Template missing from registry!");
            return;
        }

        // 4. Inject Frontmatter Data
        const lvlIdx = Math.max(0, (Number(this.wizardData.level) || 1) - 1);
        const DnD_proficiency_bonus = (proficiencyBonusArray && proficiencyBonusArray[lvlIdx] !== undefined)
            ? Number(proficiencyBonusArray[lvlIdx]) || Math.ceil(1 + (this.wizardData.level / 4))
            : Math.ceil(1 + (this.wizardData.level / 4));

        const injectYAML = (key: string, value: any) => {
            if (value !== undefined && value !== "") {
                const regex = new RegExp(`^${key}:.*$`, "m");
                if (regex.test(finalContent)) {
                    finalContent = finalContent.replace(regex, `${key}: ${value}`);
                } else {
                    // Safely insert before the CLOSING '---' of the frontmatter block!
                    finalContent = finalContent.replace(/^(---\r?\n[\s\S]*?\r?\n)---/m, `$1${key}: ${value}\n---`);
                }
            }
        };

        const injectListYAML = (key: string, value: any) => {
            if (value !== undefined && value !== null && value !== "") {
                const arr = Array.isArray(value)
                    ? value.map(v => String(v ?? "").trim()).filter(s => s !== "")
                    : (typeof value === "string"
                        ? value.split(',').map(s => s.trim()).filter(s => s !== "")
                        : []);
                if (arr.length === 0) return;
                const listStr = "\n" + arr.map(v => `  - ${v}`).join("\n");
                const regex = new RegExp(`^${key}:.*$`, "m");
                if (regex.test(finalContent)) {
                    finalContent = finalContent.replace(regex, `${key}:${listStr}`);
                } else {
                    // Safely insert before the CLOSING '---' of the frontmatter block!
                    finalContent = finalContent.replace(/^(---\r?\n[\s\S]*?\r?\n)---/m, `$1${key}:${listStr}\n---`);
                }
            }
        };

        // --- Core Single Variables ---
        injectYAML("DnD_id", stateKey);
        finalContent = finalContent.replace(/^level:/m, "DnD_level:");
        finalContent = finalContent.replace(/frontmatter\.level\b/g, "frontmatter.DnD_level");
        finalContent = finalContent.replace(/^proficiency_bonus:/m, "DnD_proficiencyBonus:");
        finalContent = finalContent.replace(/frontmatter\.proficiency_bonus\b/g, "frontmatter.DnD_proficiencyBonus");
        finalContent = finalContent.replace(/^(spellcasting_ability|DnD_spellcasting-ability):/m, "DnD_spellcastingAbility:");
        injectYAML("DnD_level", this.wizardData.level);
        injectYAML("DnD_proficiencyBonus", DnD_proficiency_bonus);
        injectYAML("DnD_raceLineage", this.wizardData.raceLineage);
        injectYAML("DnD_background", this.wizardData.background);
        injectYAML("DnD_backgroundFeat", bgFeat);
        if (this.wizardData.DnD_spellcasting_ability) {
            injectYAML("DnD_spellcastingAbility", this.wizardData.DnD_spellcasting_ability);
        } else {
            finalContent = finalContent.replace(/^DnD_spellcastingAbility:.*$\r?\n?/m, "");
        }
        injectYAML("DnD_classEquipment", this.wizardData.classEquipment);
        injectYAML("DnD_backgroundEquipment", this.wizardData.backgroundEquipment);
        const groupedWizardChoices: Record<string, [string, string][]> = {};
        const sortedWizardChoices = [...(this.wizardData.classChoices || [])].sort(
            (a: any[], b: any[]) => (Number(a[3]) || 0) - (Number(b[3]) || 0)
        );
        for (const c of sortedWizardChoices) {
            if (Array.isArray(c) && c.length >= 3 && c[0] && c[1]) {
                const rName = String(c[0]).trim();
                if (!groupedWizardChoices[rName]) groupedWizardChoices[rName] = [];
                groupedWizardChoices[rName].push([String(c[1]).trim(), String(c[2]).trim()]);
            }
        }
        const finalClassChoices = serializeClassChoicesByRouter(groupedWizardChoices);
        // Wrapping in single quotes forces Obsidian's UI to accept it as a clean text string!
        injectYAML("DnD_classChoices", `'${JSON.stringify(finalClassChoices)}'`);

        // --- Compile Starting Equipment into DnD_starterEquipment ---
        const sanitizeWizardItem = (val: any) => {
            if (!val) return null;
            return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        };

        const buildWizardItemPool = async (rawItems: any) => {
            const list = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? rawItems.split(',') : (rawItems ? [String(rawItems)] : []));
            const pool: { id: string; type: string }[] = [];
            for (const item of list) {
                const rawStr = String(item || "").trim();
                if (!rawStr) continue;
                const matchedFromPool = this.availableItems.find(
                    it => it.id.toLowerCase() === rawStr.toLowerCase() || it.name.toLowerCase() === rawStr.toLowerCase()
                );
                const resolvedId = matchedFromPool ? matchedFromPool.id : sanitizeWizardItem(rawStr);
                if (!resolvedId) continue;
                const data = await getItemData(this.app, this.plugin.settings, resolvedId);
                if (data && data.type) {
                    pool.push({ id: resolvedId, type: sanitizeWizardItem(data.type) as string });
                }
            }
            return pool;
        };

        const classChosenPool = await buildWizardItemPool(this.wizardData.classChosenItems);
        const bgChosenPool = await buildWizardItemPool(this.wizardData.backgroundChosenItems);
        const starterItemCounts: Record<string, number> = {};

        const collectStartingItems = (eqData: any, sourcePool: { id: string; type: string }[]) => {
            if (!eqData) return;
            const itemsList = eqData.items ? eqData.items : (eqData.gold ? null : eqData);
            if (!itemsList) return;

            const strictSlots: [string, number][] = [];
            const flexibleSlots: [string, number][] = [];

            for (const [itemId, qty] of Object.entries(itemsList)) {
                if (itemId.includes('|')) flexibleSlots.push([itemId, Number(qty)]);
                else strictSlots.push([itemId, Number(qty)]);
            }

            for (const [itemId, qty] of strictSlots) {
                starterItemCounts[itemId] = (starterItemCounts[itemId] || 0) + Number(qty);
            }

            const getCleanAcceptedTypes = (rawKey: string) =>
                rawKey.split('|').map(t => sanitizeWizardItem(t)).filter((t): t is string => Boolean(t));

            flexibleSlots.sort((a, b) => getCleanAcceptedTypes(a[0]).length - getCleanAcceptedTypes(b[0]).length);
            for (const [itemId, qty] of flexibleSlots) {
                const acceptedTypes = getCleanAcceptedTypes(itemId);
                let amountNeeded = Number(qty);
                for (let i = 0; i < sourcePool.length && amountNeeded > 0; i++) {
                    const poolItem = sourcePool[i];
                    if (acceptedTypes.includes(poolItem.type)) {
                        starterItemCounts[poolItem.id] = (starterItemCounts[poolItem.id] || 0) + 1;
                        amountNeeded -= 1;
                        sourcePool.splice(i, 1);
                        i--;
                    }
                }
            }
        };

        if (this.wizardData.dndClass && this.wizardData.classEquipment) {
            const cData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (cData?.startingEquipment) {
                collectStartingItems(cData.startingEquipment[this.wizardData.classEquipment], classChosenPool);
            }
        }
        if (bgDataStore && this.wizardData.backgroundEquipment && bgDataStore.startingEquipment) {
            collectStartingItems(bgDataStore.startingEquipment[this.wizardData.backgroundEquipment], bgChosenPool);
        }

        const compiledStarterEquipment: [string, string, string][] = Object.entries(starterItemCounts)
            .filter(([_, qty]) => qty > 0)
            .map(([id, qty]) => [String(id), String(qty), "true"]);

        injectYAML("DnD_starterEquipment", `'${JSON.stringify(compiledStarterEquipment)}'`);
        injectYAML("DnD_inventoryItems", `'[]'`);
        injectYAML("DnD_customItems", `'[]'`);
        finalContent = finalContent.replace(
            /^extraItems:.*$/m,
            `starterEquipment: frontmatter.DnD_starterEquipment\ninventoryItems: frontmatter.DnD_inventoryItems\ncustomItems: frontmatter.DnD_customItems\nwealthAdded: frontmatter.DnD_wealthAdded\nwealthSpent: frontmatter.DnD_wealthSpent`
        );
        finalContent = finalContent.replace(/^DnD_spellcasting_ability:/m, "spellcastingAbility:");
        if (/(```dnd-spells\r?\n[\s\S]*?)^spellcastingAbility:.*$/m.test(finalContent) && !/^spellPools:/m.test(finalContent)) {
            finalContent = finalContent.replace(
                /(```dnd-spells\r?\n[\s\S]*?^spellcastingAbility:.*)$/m,
                `$1\nspellPools: frontmatter.DnD_spellPools`
            );
        }

        // Upgrade legacy gold frontmatter lines to 4-Currency Wealth arrays
        finalContent = finalContent.replace(/^dnd_gold_added:/m, "DnD_wealthAdded:");
        finalContent = finalContent.replace(/^dnd_gold_spent:/m, "DnD_wealthSpent:");
        injectYAML("DnD_wealthAdded", `'["0","0","0","0"]'`);
        injectYAML("DnD_wealthSpent", `'["0","0","0","0"]'`);

        // Populate Spell Pools and Auto-Granted Racial Spells (both Known & Prepared)
        if (compiledSpellPools.length > 0) {
            injectListYAML("DnD_spellPools", compiledSpellPools);
        } else {
            injectYAML("DnD_spellPools", "[]");
        }
        const initialRacialSpellsJson = JSON.stringify(formatSpellTuples(raceSpellMetaForWizard.grantedSpellsByLevel));
        injectYAML("DnD_spells", `'${initialRacialSpellsJson}'`);
        injectYAML("DnD_preparedSpells", `'${initialRacialSpellsJson}'`);

        // Dynamically Build Consolidated 9-Element Spell Slots Array: '[["<Spell-Slots>","<Used-Spell-Slots>"], ...]'
        const targetLvl = this.wizardData.level.toString();
        const compiledSpellSlots: [string, string][] = Array.from({ length: 9 }, () => ["0", "0"]);

        if (spellcastingData && spellcastingData[targetLvl] && Array.isArray(spellcastingData[targetLvl].slots)) {
            const slots = spellcastingData[targetLvl].slots;
            for (let i = 0; i < 9; i++) {
                const maxStr = String(Number(slots[i]) || 0);
                compiledSpellSlots[i] = [maxStr, "0"];
            }
        }
        // Clean up any legacy DnD_spellSlots_1..9 lines if they exist in the template, then inject DnD_spellSlots
        finalContent = finalContent.replace(/^DnD_spellSlots_[2-9]:.*\n?/gm, "");
        finalContent = finalContent.replace(/^DnD_spellSlots_1:/m, "DnD_spellSlots:");
        injectYAML("DnD_spellSlots", `'${JSON.stringify(compiledSpellSlots)}'`);

        // --- NEW: EXPERTISE & PROFICIENCY ARRAYS ---
        // Compile the Proficiency Array: [["stealth", "class"], ["history", "background"]]
        let compiledProficiencies: any[] = [];
        (this.wizardData.chosenSkills || []).forEach((s: string) => { if (s) compiledProficiencies.push([String(s), "class"]); });
        (this.wizardData.chosenBgSkills || []).forEach((s: string) => { if (s) compiledProficiencies.push([String(s), "background"]); });
        if (bgDataStore && bgDataStore.skills) {
            bgDataStore.skills.forEach((s: string) => { if (s) compiledProficiencies.push([String(s).toLowerCase(), "background"]); });
        }
        // Wrapping in single quotes prevents Obsidian UI warnings
        injectYAML("DnD_skillProficiencies", `'${JSON.stringify(compiledProficiencies)}'`);

        // Compile Expertise: [["stealth", "1"]] (using strings in arrays)
        const finalExpertise: [string, string][] = (this.wizardData.expertiseChoices || [])
            .filter((c: any[]) => c[0] !== "")
            .map((c: any[]): [string, string] => [String(c[0]), String(c[1])]);
        for (const [expSkill, expLvl] of featGrantedExpertise) {
            if (!finalExpertise.some(e => e[0].toLowerCase() === expSkill.toLowerCase())) {
                finalExpertise.push([expSkill, expLvl]);
            }
        }
        // Wrapping in single quotes prevents Obsidian UI warnings
        injectYAML("DnD_skillExpertise", `'${JSON.stringify(finalExpertise)}'`);

        // Map Class + Feat Saving Throw Proficiencies into DnD_classProficiencies
        const formattedClassProfs = Array.from(new Set([
            ...savingThrows.map((st: string) => String(st).toLowerCase()),
            ...extraFeatSavingThrows
        ]));
        injectYAML("DnD_classProficiencies", `'${JSON.stringify(formattedClassProfs)}'`);

        // --- Core List Variables ---
        injectListYAML("DnD_race", this.wizardData.race);
        injectListYAML("DnD_class", this.wizardData.dndClass);
        injectListYAML("DnD_subclass", this.wizardData.subclass);
        injectListYAML("DnD_languages", this.wizardData.languages);
        injectListYAML("DnD_toolProficiencies", this.wizardData.toolProficiencies);
        injectListYAML("DnD_extraFeats", wizardExtraFeats);
        injectListYAML("DnD_classChosenItems", this.wizardData.classChosenItems);
        injectListYAML("DnD_backgroundChosenItems", this.wizardData.backgroundChosenItems);
        injectYAML("DnD_featureUses", `'[]'`);
        injectYAML("DnD_hideFeature", `'[]'`);

        // --- Equipment & Combat Formula variables ---
        const finalInitiativeCalc = await this.plugin.resolveCharacterInitiativeModifiers(
            this.wizardData.dndClass,
            [Number(this.wizardData.level) || 1],
            Number(this.wizardData.level) || 1,
            wizardExtraFeats,
            bgDataStore?.feat || bgFeat,
            this.wizardData.subclass,
            this.wizardData.race,
            this.wizardData.raceLineage,
            wizardStatsRecord,
            DnD_proficiency_bonus,
            0,
            this.plugin.settings
        );

        const finalMasteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            this.wizardData.dndClass,
            [Number(this.wizardData.level) || 1],
            Number(this.wizardData.level) || 1,
            wizardExtraFeats,
            bgDataStore?.feat,
            this.wizardData.subclass,
            this.plugin.settings,
            this.wizardData.race,
            this.wizardData.raceLineage
        );
        const validMastered = Array.isArray(this.wizardData.weaponMasteries)
            ? this.wizardData.weaponMasteries.slice(0, finalMasteryCalc.totalSlots)
            : [];
        const serializedWeaponMastery = serializeWeaponMasteryState(finalMasteryCalc.totalSlots, validMastered);

        injectYAML("DnD_weapon", this.wizardData.weapon);
        injectYAML("DnD_weaponDamage", this.wizardData.weaponDamage);
        injectYAML("DnD_weaponMastery", `'${serializedWeaponMastery}'`);
        injectYAML("DnD_armor", this.wizardData.armor);
        injectYAML("DnD_armorAc", this.wizardData.armorAc);
        injectYAML("DnD_armorAcBonus", this.wizardData.armorAcBonus);
        injectYAML("DnD_armorAcMod", this.wizardData.armorAcMod);
        injectYAML("DnD_attackRollMod", 0);
        injectYAML("DnD_unarmoredDefense", unarmoredDefense);
        injectYAML("DnD_attackStat", attackStat);

        // --- Stat variables ---
        const DnD_current_health = finalWizardMaxHealth;
        injectYAML("DnD_maxHealth", finalWizardMaxHealth);
        injectYAML("DnD_currentHealth", DnD_current_health);
        injectYAML("DnD_exhaustion", 0);
        injectYAML("DnD_hitDice", `'${serializeHitDiceState(DnD_hit_dice, 0)}'`);
        injectYAML("DnD_speed", this.wizardData.speed);
        injectYAML("DnD_speedMod", initialSpeedMod);
        injectYAML("DnD_initiativeMod", finalInitiativeCalc.totalInitiativeMod);
        injectYAML("DnD_customInitiativeMod", 0);
        injectYAML("DnD_strength", wizardStatsRecord.strength);
        injectYAML("DnD_dexterity", wizardStatsRecord.dexterity);
        injectYAML("DnD_constitution", wizardStatsRecord.constitution);
        injectYAML("DnD_intelligence", wizardStatsRecord.intelligence);
        injectYAML("DnD_wisdom", wizardStatsRecord.wisdom);
        injectYAML("DnD_charisma", wizardStatsRecord.charisma);

        // --- 5B. PRECISE SKILLS BLOCK REWRITING ---
        const cSkills = compiledProficiencies.filter(p => p[1] === "class").map(p => `  - ${p[0]}`);
        const bSkills = compiledProficiencies.filter(p => p[1] === "background").map(p => `  - ${p[0]}`);

        let profInject = "";
        if (cSkills.length > 0) profInject += `  #Class\n${cSkills.join('\n')}\n`;
        if (bSkills.length > 0) profInject += `  #Background\n${bSkills.join('\n')}\n`;
        if (profInject === "") profInject = "  - <chosen skills>\n";

        // Matches both ```dnd-skills and legacy ```skills if the template uses inline lists
        const profRegex = /(```(?:dnd-)?skills[\s\S]*?proficiencies:\s*\n)([\s\S]*?)(?=\n[ \t]*expertise:)/;
        finalContent = finalContent.replace(profRegex, `$1${profInject}`);

        let expInject = finalExpertise.length > 0
            ? finalExpertise.map((e: any[]) => `  - ${e[0]}`).join('\n') + '\n'
            : "  - <chosen skills>\n";

        const expRegex = /(expertise:\s*\n)([\s\S]*?)(?=\n[ \t]*half_proficiencies:)/;
        finalContent = finalContent.replace(expRegex, `$1${expInject}`);

        // 6. Rename Note Title (if provided), Paste to Editor, and Finalize UI State
        await this.renameNoteToCharacterName(view.file);

        try {
            const currentState = view.getState();
            if (currentState.mode !== 'source') {
                currentState.mode = 'source';
                await view.setState(currentState, { history: false });
            }

            setTimeout(async () => {
                view.editor.replaceSelection(finalContent);
                new Notice("Character Sheet Generated Successfully!");

                const newState = view.getState();
                newState.mode = 'preview';
                await view.setState(newState, { history: false });
            }, 100);
        } catch (error) {
            console.error("Failed to insert template:", error);
            new Notice("Error: Could not insert template file.");
        }

        this.close();
    }
}
