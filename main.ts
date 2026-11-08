import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, parseYaml, MarkdownRenderChild, MarkdownRenderer, TFile, Modal, Notice, MarkdownView, normalizePath, Platform } from 'obsidian';
import { getClassData, getSubclassData, getBackgroundData, getRaceData, getExtraFeat, getItemData, getRuleData, getSpellData, getSpellsPoolData, getClassChoiceData, getFeatMapData } from './data';
import { MarkdownNotes, classesMap, racesMap, backgroundsMap, itemsMap } from './registry';
import { THEMES } from './themes';
 
// 1. Define the shape of our settings
interface DnDPluginSettings {
    combineClassSubclass: boolean;
    sectionOrder: string[];
    customRulebookPath: string;
    customRulebookPriority: boolean;

    // Theme Engine Variables
    selectedTheme: string;
    colorBgPrimary: string;
    colorBgSecondary: string;
    colorBgTertiary: string;
    colorBgHover: string;
    colorBgDarker: string;
    colorBgGroup: string;
    colorBgProficient: string;
    colorTextPrimary: string;
    colorTextSecondary: string;
    colorTextSublabel: string;
    colorTextBright: string;
    colorTextMuted: string;
    colorTextGroup: string;
    colorBorderPrimary: string;
    colorBorderActive: string;
    colorBorderFocus: string;
    colorAccentTeal: string;
    colorAccentRed: string;
    colorAccentPurple: string;
}

// 2. Set the default values
const DEFAULT_SETTINGS: DnDPluginSettings = {
    combineClassSubclass: false,
    sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra Feats"],
    customRulebookPath: "",
    customRulebookPriority: false,

    selectedTheme: "default",
    ...THEMES.default.colors // Spread the default colors directly from the library!
}

interface CharacterSheetVariables {
    DnD_level: number;
    DnD_proficiency_bonus: number;
    DnD_race: string[];
    DnD_race_lineage: string;
    DnD_class: string[];
    DnD_class_subclass: string[];
    DnD_class_chosen_items: string;
    DnD_languages: string[];
    DnD_background: string;
    DnD_background_feat: string;
    DnD_background_chosen_items: string;
    DnD_extra_feats: string[];
    DnD_spellcasting_ability: string;
    DnD_maxHealth: number;
    DnD_current_health: number;
    DnD_hit_dice: string;
    DnD_speed: number;
    DnD_strength: number;
    DnD_dexterity: number;
    DnD_constitution: number;
    DnD_intelligence: number;
    DnD_wisdom: number;
    DnD_charisma: number;
    DnD_hide_feature: string[];
    DnD_class_equipment: string;
    DnD_background_equipment: string;
    DnD_weapon: string;
    DnD_weapon_damage: number;
    DnD_armor: string;
    DnD_armorAc: number;
    DnD_armor_ac_bonus: number;
    DnD_armor_ac_mod: number;
    DnD_attack_stat: string;
    DnD_attack_roll_mod: number;
    dnd_gold_added: number;
    dnd_gold_spent: number;
    cssclasses: string;
    obsidianUIMode: string;
}

export default class DnDCharacterSheetHelperPlugin extends Plugin {
    settings: DnDPluginSettings;

    async onload() {
        // --- INITIALIZE PLUGIN & STANDALONE THEME ENGINE ---
        await this.loadSettings();
        this.applyTheme();

        // Register the settings tab we built
        this.addSettingTab(new DnDSettingsTab(this.app, this));

        // Register the processor for our specific code block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-features",
            this.processDnDFeaturesBlock.bind(this)
        );

        // Register the processor for the inventory block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-inventory",
            this.processDnDInventoryBlock.bind(this)
        );

        // Register the processor for the inventory block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-rules",
            this.processDnDRulesBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-controls",
            this.processDnDControlsBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-spells",
            this.processDnDSpellsBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-skills",
            this.processDnDSkillsBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-info",
            this.processDnDInfoBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-abilities",
            this.processDnDAbilitiesBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-health",
            this.processDnDHealthBlock.bind(this)
        );

        // Automatically reset expended spell slots (index 1 -> "0") in the 9-element array when Long Rest is clicked
        this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const btn = target?.closest('button');
            if (btn && (btn.textContent?.includes('Long Rest') || btn.getAttribute('value') === 'long-rest')) {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    await this.app.fileManager.processFrontMatter(activeFile, (fm: Record<string, any>) => {
                        const slotKey = fm["DnD_spellSlots"] !== undefined ? "DnD_spellSlots" : (fm["DnD_spellsSlots"] !== undefined ? "DnD_spellsSlots" : null);
                        if (!slotKey) return;

                        let rawSlots = fm[slotKey];
                        if (typeof rawSlots === "string" && rawSlots.trim().startsWith("[")) {
                            try { rawSlots = JSON.parse(rawSlots.trim()); } catch { rawSlots = null; }
                        }

                        if (Array.isArray(rawSlots)) {
                            const resetSlots = rawSlots.map((pair: any) => {
                                if (Array.isArray(pair) && pair.length >= 2) {
                                    return [String(pair[0]), "0"];
                                }
                                return ["0", "0"];
                            });
                            fm[slotKey] = JSON.stringify(resetSlots);
                        }
                    });
                }
            }
        });
        
        this.addCommand({
            id: 'csh-launch-character-wizard',
            name: 'Launch Character Creation Wizard',
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);

                if (!view) {
                    new Notice("Please open a note first to launch the Wizard.");
                    return;
                }

                // Launch our new multi-step wizard!
                new CharacterWizardModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'csh-character-sheet-template',
            name: 'Set Character Sheet Template',
            callback: async () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);

                if (!view) {
                    new Notice("Please open a note first to insert the template.");
                    return;
                }

                try {
                    const currentState = view.getState();
                    if (currentState.mode !== 'source') {
                        currentState.mode = 'source';
                        await view.setState(currentState, { history: false });
                    }
                    setTimeout(() => {
                        const content = MarkdownNotes['dnd_character_template'];

                        if (!content) {
                            const available = Object.keys(MarkdownNotes).join(', ');
                            new Notice(`Template missing! Available files: ${available}`);
                            return;
                        }

                        // Paste the content
                        view.editor.replaceSelection(content);
                    }, 100);

                } catch (error) {
                    console.error("Failed to insert template:", error);
                    new Notice("Error: Could not insert template file.");
                }
            }
        });


    }

    // Helper functions for Obsidian to read/write settings
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- Theme Engine Logic ---
    private colorCssVars(): [string, string][] {
        return Object.entries(this.settings)
            .filter(([key]) => key.startsWith("color"))
            // Magic Regex: Converts "colorBgPrimary" -> "--dnd-ui-color-bg-primary"
            .map(([key, value]) => [`--dnd-ui-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`, value as string]);
    }

    applyTheme() {
        // 1. Apply to the main Obsidian window
        for (const [name, value] of this.colorCssVars()) {
            document.documentElement.style.setProperty(name, value);
        }

        // 2. Apply to all popped-out windows (if on Desktop)
        if (Platform.isDesktop) {
            this.app.workspace.iterateAllLeaves((leaf) => {
                const windowDoc = leaf.view.containerEl.ownerDocument;
                if (windowDoc) {
                    for (const [name, value] of this.colorCssVars()) {
                        windowDoc.documentElement.style.setProperty(name, value);
                    }
                }
            });
        }
    }

    // --- Helper: Safely Update Gold Frontmatter ---
    async updateGoldFrontmatter(filePath: string, type: 'base' | 'added' | 'spent', amount: number) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            // Explicitly type the frontmatter parameter to prevent TS errors
            await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, any>) => {
                // Safely map the union type to the exact string key without string manipulation
                const keyMap = { base: 'DnD_GoldBase', added: 'DnD_GoldAdded', spent: 'DnD_GoldSpent' };
                const key = keyMap[type];

                const current = Number(frontmatter[key]) || 0;
                frontmatter[key] = current + amount;
            });
        }
    }

    // --- Helper: Safely Update Multiple Frontmatter Variables ---
    async updateCharacterFrontmatter(filePath: string, updates: Record<string, any>) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, any>) => {
                for (const [key, value] of Object.entries(updates)) {
                    frontmatter[key] = value;
                }
            });
        }
    }

    // --- Helper: Safely Render Markdown and Fix Spacing ---
    async renderDndMarkdown(text: string, container: HTMLElement, sourcePath: string, component: MarkdownRenderChild) {
        if (!text) return;

        // 1. Trim trailing newlines AND intercept tab characters!
        const cleanText = text.trim().replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');

        // 2. Render the markdown securely
        await MarkdownRenderer.render(this.app, cleanText, container, sourcePath, component);

        // 2.5 Intercept custom "note:" links to open our pop-up modal!
        container.addEventListener('click', (event) => {
            let target = event.target as HTMLElement;

            const closestLink = target.closest('a');
            if (closestLink) {
                target = closestLink;
            }

            if (target.tagName === 'A') {
                const href = target.getAttribute('href');
                // Listen for your new generic "note:" syntax
                if (href && href.startsWith('note:')) {
                    event.preventDefault(); // Stop Obsidian from navigating away

                    // Extract the filename (e.g., "note:wild-magic-surge" -> "wild-magic-surge")
                    const noteKey = href.replace('note:', '').toLowerCase();

                    // Pass 'this' (the plugin instance) so the Modal can find the plugin folder!
                    new NoteModal(this.app, this, noteKey).open();
                }
            }
        });

        // 3. If a header is the VERY first item in the text, completely remove its top margin!
        const firstChild = container.firstElementChild as HTMLElement;
        if (firstChild && firstChild.tagName.match(/^H[1-6]$/i)) {
            firstChild.style.marginTop = '0';
        }

        // 4. Strip the bottom margin from the very last child to eliminate dead space!
        const lastChild = container.lastElementChild as HTMLElement;
        if (lastChild) {
            lastChild.style.marginBottom = '0';
        }

        // 5. Eliminate the large default Obsidian margins from all block elements
        const blockElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol, li, blockquote, pre, table, hr');
        blockElements.forEach((el: Element) => {
            const htmlEl = el as HTMLElement;
            const tag = htmlEl.tagName.toLowerCase();

            // 1. BASELINE: Zero out vertical margins for every single element by default
            htmlEl.style.marginTop = '0';
            htmlEl.style.marginBottom = '0';

            // 2. EXCEPTIONS: Standard block elements that NEED breathing room
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote', 'pre', 'hr'].includes(tag)) {
                htmlEl.style.marginTop = '0.5em';
                htmlEl.style.marginBottom = '0.5em';
            }
            // 3. LIST PARAGRAPHS: Prevent the paragraph from breaking onto a new line under the bullet
            else if (tag === 'p' && htmlEl.closest('li')) {
                htmlEl.style.display = 'inline';
            }
            // 4. LIST CONTAINERS: Strip hidden padding/margins and flush to the left edge
            else if (tag === 'ul' || tag === 'ol') {
                htmlEl.style.paddingTop = '0';
                htmlEl.style.marginLeft = '0';
                htmlEl.style.paddingLeft = '0'; // Flushed completely left!
            }
            // 5. BULLET POINTS: The Custom Styled Injection
            else if (tag === 'li') {
                // 1. Hide the rigid native bullet
                htmlEl.style.listStyleType = 'none';

                // 2. List's Text
                htmlEl.style.paddingLeft = '0'; // 'paddingLeft' is 0 so wrapped text hits the edge
                htmlEl.style.marginLeft = '0'; // 'textIndent' pushes ONLY the first line inward
                htmlEl.style.textIndent = '1.05em'; // Adjust List Text (text after a bullet-point) placement

                // 3. Set relative positioning so our custom bullet can float inside this space
                htmlEl.style.position = 'relative';

                // 4. Bullet-Point adjustment.
                if (!htmlEl.getAttribute('data-custom-bullet')) {
                    const bulletSpan = document.createElement('span');
                    bulletSpan.innerHTML = '&bull;'; // Standard bullet entity

                    // Style it to match Obsidian's native look perfectly!
                    bulletSpan.style.position = 'absolute';
                    bulletSpan.style.left = '0'; // Adjust bullet-point placement 
                    bulletSpan.style.textIndent = '0'; // Ensure the absolute bullet ignores the text-indent of the parent

                    bulletSpan.style.lineHeight = '1';
                    bulletSpan.style.top = '-0.175em'; // Adjust height position
                    bulletSpan.style.color = 'var(--dnd-ui-color-text-secondary)'; // Adjust colour pallete
                    bulletSpan.style.fontSize = '2em'; // Adjust size

                    htmlEl.insertBefore(bulletSpan, htmlEl.firstChild);
                    htmlEl.setAttribute('data-custom-bullet', 'true');
                }
            }
        });
    }

    // --- Helper: Discover if a class grants a subclass at or before maxLevel ---
    findGrantedSubclass(classData: any, maxLevel: number): string | null {
        if (!classData || !classData.features) return null;
        for (let lvl = 1; lvl <= maxLevel; lvl++) {
            const levelFeatures = classData.features[lvl.toString()];
            if (Array.isArray(levelFeatures)) {
                for (const feature of levelFeatures) {
                    // Updated to match the new "grantedSubclasses" key
                    if (feature.grantedSubclasses && typeof feature.grantedSubclasses === "string") {
                        return feature.grantedSubclasses.trim();
                    }
                }
            }
        }
        return null;
    }

    async processDnDFeaturesBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Create a Render Child to manage the lifecycle and reactivity
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // 2. Wrap our entire rendering logic into a reusable function
        const renderContent = async () => {
            // Create a temporary wrapper to prevent UI flickering while awaiting data
            const wrapper = document.createElement('div');

            // Parse the user's code block using Obsidian's built-in YAML parser
            let blockData;
            try {
                blockData = parseYaml(source);
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            // 2. Fetch the frontmatter for the current active file
            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            // 3. Helper function to resolve "frontmatter.property" values
            const resolveValue = (val: any) => {
                if (typeof val === 'string') {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
                    if (trimmed.startsWith('frontmatter.')) {
                        return frontmatter[trimmed.replace('frontmatter.', '')];
                    }
                }
                return val;
            };

            // 4. Resolve all core variables
            const level = resolveValue(blockData.level) ?? frontmatter['DnD_level'];
            const dndClass = resolveValue(blockData.class);
            const subclass = resolveValue(blockData.subclass);
            console.log("D&D Plugin [dnd-features]: Rendering block with", {
                level,
                dndClass,
                background: resolveValue(blockData.background),
                customRulebookPath: this.settings.customRulebookPath
            });
            const classLevels = resolveValue(blockData['classLevels']);
            const race = resolveValue(blockData.race);
            const raceLineage = resolveValue(blockData['raceLineage']);
            const background = resolveValue(blockData.background);
            const extraFeats = resolveValue(blockData['extraFeats']);
            let classChoicesRaw = resolveValue(blockData['classChoices']);
            if (typeof classChoicesRaw === 'string' && classChoicesRaw.trim().startsWith('[')) {
                try { classChoicesRaw = JSON.parse(classChoicesRaw.trim()); } catch { classChoicesRaw = []; }
            }
            const classChoicesArray = Array.isArray(classChoicesRaw) ? classChoicesRaw : [];
            const hideRaw = resolveValue(blockData.hide);
            const edition = resolveValue(blockData.edition);

            // Create a localized settings object that injects the block's edition variable 
            // without modifying the user's global plugin settings.
            const fetchOptions = {
                ...this.settings,
                edition: edition ? String(edition) : undefined
            };

            // Normalize the 'hide' variable into a clean array of lowercased strings to prevent typo-misses
            let hiddenFeatures: string[] = [];
            let parsedHide = hideRaw;
            if (typeof parsedHide === 'string' && parsedHide.trim().startsWith('[')) {
                try { parsedHide = JSON.parse(parsedHide.trim()); } catch { parsedHide = []; }
            }
            if (Array.isArray(parsedHide)) {
                hiddenFeatures = parsedHide.map(name => String(name).toLowerCase().trim()).filter(Boolean);
            } else if (typeof parsedHide === 'string' && parsedHide.trim() !== '') {
                hiddenFeatures = parsedHide.split(',').map(name => String(name).toLowerCase().trim()).filter(Boolean);
            }

            // 5. Validate Multiclassing Levels & Ensure Numbers
            const parsedLevel = Number(level) || 0; // Force total level to be a number

            // If the user has multiple classes listed, we must strictly validate the class-levels
            if (Array.isArray(dndClass) && dndClass.length > 1) {

                // Error Check 1: Is the class-levels array missing or the wrong size?
                if (!Array.isArray(classLevels) || classLevels.length !== dndClass.length) {
                    const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
                    errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
                    errorBox.createEl("p", {
                        text: `You have multiple classes listed, but the "class-levels" variable is missing or is invalid. Please provide a level for each class.`
                    });
                    el.empty();
                    el.appendChild(wrapper);
                    return; // Stop rendering features
                }

                // Error Check 2: Does the math add up?
                const totalClassLevels = classLevels.reduce((sum, current) => sum + Number(current), 0);
                if (totalClassLevels !== parsedLevel) {
                    const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
                    errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
                    errorBox.createEl("p", {
                        text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${parsedLevel}).`
                    });
                    el.empty();
                    el.appendChild(wrapper);
                    return; // Stop rendering features
                }
            }

            // 6. Setup the Registry Lookup (Preparation for Data Fetching)
            const classArray = Array.isArray(dndClass) ? dndClass : [dndClass];
            // Ensure subclass is an array, and pad it with nulls to safely match the class array length
            const rawSubclassArray = Array.isArray(subclass) ? subclass : (subclass ? [subclass] : []);
            const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

            // 7. PRE-PASS: Gather all auto-granted feats and determine dynamic subclass level via grantedSubclass
            let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : (extraFeats ? [extraFeats] : []);

            // This flag will tell our renderer if the character is high enough level to show the subclass
            let hasActiveSubclass = false;

            if (dndClass) {
                for (let index = 0; index < classArray.length; index++) {
                    const className = classArray[index];
                    const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                        ? Number(classLevels[index])
                        : Number(level);

                    // Use fetchOptions instead of this.settings!
                    const classData = await getClassData(this.app, fetchOptions, className);

                    if (classData && classData.features) {
                        const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);
                        let subclassData: any = null;

                        if (grantedSubclassFile && subclassArray[index]) {
                            subclassData = await getSubclassData(this.app, fetchOptions, grantedSubclassFile, subclassArray[index]);
                            if (subclassData) {
                                hasActiveSubclass = true;
                            }
                        }

                        for (let i = 1; i <= currentClassLevel; i++) {
                            const levelFeatures = classData.features[i.toString()];
                            if (levelFeatures) {
                                levelFeatures.forEach((feature: any) => {
                                    if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                        finalExtraFeats.push(...feature.grantedFeats);
                                    }
                                });
                            }

                            if (subclassData) {
                                const subLevelFeatures = subclassData[i.toString()];
                                if (subLevelFeatures) {
                                    subLevelFeatures.forEach((feature: any) => {
                                        if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                            finalExtraFeats.push(...feature.grantedFeats);
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Clean up the gathered feats to remove engine mechanics and router files
            const validFeats: string[] = [];
            for (const featId of finalExtraFeats) {
                // 1. Hard-filter our core engine mechanic trigger
                if (featId === "ability-score-improvement") continue;

                // 2. Check if this ID is a feat router map (e.g., general-feats or epic-boon-feats)
                const routerData = await getFeatMapData(this.app, fetchOptions, String(featId));
                const isRouter = !!routerData;

                // If it is NOT a router file, it's a real feat we should display!
                if (!isRouter) {
                    validFeats.push(featId);
                }
            }

            // Finalize the array with only valid, unique feats
            finalExtraFeats = [...new Set(validFeats)];

            // Loop through the user's custom section order using a for...of loop to support async/await
            for (const sectionName of this.settings.sectionOrder) {
                // 1. CONDITIONAL RENDERING: Skip this section entirely if the user didn't provide the variable
                if (sectionName === "Class" && !dndClass) continue;
                if (sectionName === "Subclass" && (!subclass || this.settings.combineClassSubclass || !hasActiveSubclass)) continue;
                if (sectionName === "Race" && !race) continue;
                if (sectionName === "Background" && !background) continue;
                if (sectionName === "Extra Feats" && finalExtraFeats.length === 0) continue;

                // Determine the dynamic header title for this section
                let sectionTitle = `${sectionName} Features:`;
                if (sectionName === "Class" && this.settings.combineClassSubclass && subclass) sectionTitle = "Class & Subclass Features:";
                if (sectionName === "Race") sectionTitle = "Race Traits:";
                if (sectionName === "Background") sectionTitle = "Background Feat:";
                if (sectionName === "Extra Feats") sectionTitle = "Extra Feats:";

                /// Create the Header Title using our new CSS class on the wrapper
                wrapper.createEl("h3", { text: sectionTitle, cls: "dnd-section-header" });

                const sectionWindow = wrapper.createDiv({ cls: "dnd-features-window" });
                const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });

                // Render Class Section
                if (sectionName === "Class") {
                    for (let index = 0; index < classArray.length; index++) {
                        const className = classArray[index];
                        const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                            ? Number(classLevels[index])
                            : Number(level);

                        if (classArray.length > 1) {
                            sectionDiv.createEl("h4", { text: `${className} Features (Level ${currentClassLevel})`, cls: "dnd-class-header" });
                        }

                        const classData = await getClassData(this.app, fetchOptions, className);

                        if (!classData || !classData.features) {
                            sectionDiv.createEl("p", { text: `Data for ${className} not found.`, cls: "dnd-error-text" });
                            continue;
                        }

                        for (let i = 1; i <= currentClassLevel; i++) {
                            const levelFeatures = classData.features[i.toString()];

                            if (levelFeatures && levelFeatures.length > 0) {
                                for (const feature of levelFeatures) {
                                    // IMPLEMENTED: JSON-level 'hide' boolean check
                                    if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });

                                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                    await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                }
                            }

                            // NEW: Dynamically inject class choices (e.g. Eldritch Invocations, Divine Orders)
                            for (const choiceTuple of classChoicesArray) {
                                let routerFile = "";
                                let choiceKey = "";
                                let choiceLevel = 0;

                                // Safely handle both ["router_file", "choice_key", level] and ["filename", level] formats
                                if (Array.isArray(choiceTuple)) {
                                    if (choiceTuple.length === 3) {
                                        [routerFile, choiceKey, choiceLevel] = choiceTuple;
                                    } else if (choiceTuple.length === 2) {
                                        [choiceKey, choiceLevel] = choiceTuple;
                                    }
                                }

                                // If this choice belongs to the current level we are rendering...
                                if (Number(choiceLevel) === i && choiceKey) {
                                    const featureData = await getClassChoiceData(this.app, fetchOptions, choiceKey);
                                    if (featureData && featureData.name) {
                                        if (featureData.hide === true || (featureData.name && hiddenFeatures.includes(featureData.name.toLowerCase()))) continue;

                                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                        const badgeText = featureData.badge || "Choice";
                                        titleContainer.createEl("span", { text: badgeText, cls: "dnd-level-badge dnd-badge-combined" });
                                        titleContainer.createEl("span", { text: featureData.name, cls: "dnd-feature-name" });

                                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                        await this.renderDndMarkdown(featureData.description, descDiv, ctx.sourcePath, renderChild);
                                    }
                                }
                            }

                            const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);
                            if (this.settings.combineClassSubclass && subclassArray[index] && grantedSubclassFile) {
                                const subclassName = subclassArray[index];
                                const subclassData = await getSubclassData(this.app, fetchOptions, grantedSubclassFile, subclassName);
                                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;

                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
                                        // IMPLEMENTED: JSON-level 'hide' boolean check
                                        if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                        titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge dnd-badge-combined" });
                                        titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });

                                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                        await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                    }
                                }
                            }
                        }
                    }
                }

                // Render Subclass Section
                else if (sectionName === "Subclass") {
                    for (let index = 0; index < classArray.length; index++) {
                        const className = classArray[index];
                        const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                            ? Number(classLevels[index])
                            : Number(level);
                        const subclassName = subclassArray[index];

                        const classData = await getClassData(this.app, fetchOptions, className);
                        const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);

                        if (subclassName && classData && grantedSubclassFile) {
                            if (classArray.length > 1) {
                                sectionDiv.createEl("h4", { text: `${subclassName} Features`, cls: "dnd-class-header" });
                            }

                            const subclassData = await getSubclassData(this.app, fetchOptions, grantedSubclassFile, subclassName);
                            if (!subclassData) continue;

                            for (let i = 1; i <= currentClassLevel; i++) {
                                const subLevelFeatures = subclassData[i.toString()];
                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
                                        // IMPLEMENTED: JSON-level 'hide' boolean check
                                        if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                        titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                        titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });

                                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                        await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                    }
                                }
                            }
                        }
                    }
                }

                // Render Race Section
                else if (sectionName === "Race") {
                    const raceData = await getRaceData(this.app, fetchOptions, race);

                    if (raceData && raceData.traits) {
                        for (const trait of raceData.traits) {
                            // IMPLEMENTED: JSON-level 'hide' boolean check
                            if (trait.hide === true || (trait.name && hiddenFeatures.includes(trait.name.toLowerCase()))) continue;

                            if (trait.lineage) {
                                if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) {
                                    continue;
                                }
                            }

                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            const defaultBadge = trait.lineage ? "Lineage" : "Trait";
                            const badgeClass = trait.lineage ? "dnd-level-badge dnd-badge-combined" : "dnd-level-badge";

                            titleContainer.createEl("span", { text: trait.badge ? trait.badge : defaultBadge, cls: badgeClass });
                            titleContainer.createEl("span", { text: trait.name, cls: "dnd-feature-name" });

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(trait.description, descDiv, ctx.sourcePath, renderChild);
                        }
                    } else {
                        sectionDiv.createEl("p", { text: `Data for race "${race}" not found.`, cls: "dnd-error-text" });
                    }
                }

                // Render Background Section
                else if (sectionName === "Background") {
                    const bgData = await getBackgroundData(this.app, fetchOptions, background);
                    const featData = bgData && bgData.feat ? await getExtraFeat(this.app, fetchOptions, bgData.feat) : null;

                    // IMPLEMENTED: JSON-level 'hide' boolean check
                    if (featData && featData.hide !== true && !hiddenFeatures.includes(featData.name.toLowerCase())) {
                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                        titleContainer.createEl("span", { text: "Origin Feat", cls: "dnd-level-badge" });
                        titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });

                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                        await this.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                    } else if (!featData) {
                        sectionDiv.createEl("p", { text: `Data for background "${background}" not found.`, cls: "dnd-error-text" });
                    }
                }

                // Render Extra Feats Section
                else if (sectionName === "Extra Feats") {
                    for (const featId of finalExtraFeats) {
                        const safeFeatId = typeof featId === 'string' ? featId : String(featId);
                        const featData = await getExtraFeat(this.app, fetchOptions, safeFeatId);

                        if (featData) {
                            // IMPLEMENTED: JSON-level 'hide' boolean check
                            if (featData.hide === true || (featData.name && hiddenFeatures.includes(featData.name.toLowerCase()))) continue;

                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            // NEW: Dynamically pull the category or fallback to "Feat"
                            const badgeText = featData.badge ? featData.badge : (featData.category ? featData.category : "Feat");
                            titleContainer.createEl("span", { text: badgeText, cls: "dnd-level-badge" });
                            titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                        } else {
                            sectionDiv.createEl("p", { text: `Data for extra feat "${safeFeatId}" not found.`, cls: "dnd-error-text" });
                        }
                    }
                }
            }
            el.empty();
            el.appendChild(wrapper);
        };

        // 3. Initial Render
        renderContent();

        // 4. Register Event Listener for Frontmatter Changes
        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath) {
                    renderContent();
                }
            })
        );
    }

    async processDnDInventoryBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        const renderContent = async () => {
            const wrapper = document.createElement('div');

            // --- THE INVENTORY TOOLTIP ---
            const tooltipWindow = document.body.createDiv({
                cls: "dnd-inventory-tooltip",
                attr: { style: "position: fixed; display: none; z-index: 9999; background: var(--dnd-ui-color-bg-secondary); border: 1px solid var(--dnd-ui-color-border-primary); border-radius: 6px; padding: 12px; width: 300px; box-shadow: 0 8px 16px rgba(0,0,0,0.6); pointer-events: none;" }
            });

            let blockData;
            try {
                blockData = parseYaml(source);
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-inventory block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === 'string' && val.startsWith('frontmatter.')) {
                    return frontmatter[val.replace('frontmatter.', '')];
                }
                return val;
            };

            // 1. Resolve Variables
            const dndClass = resolveValue(blockData.class);
            const background = resolveValue(blockData.background);
            const classEq = resolveValue(blockData['classEquipment']);
            const bgEq = resolveValue(blockData['backgroundEquipment']);
            const weaponSlot = resolveValue(blockData.weapon);
            const weaponDamage = resolveValue(blockData.weaponDamage);
            const armorSlot = resolveValue(blockData.armor);
            const armorAc = resolveValue(blockData.armorAc);
            const extraItemsRaw = resolveValue(blockData['extraItems']);
            const edition = resolveValue(blockData.edition);

            const fetchOptions = {
                ...this.settings,
                edition: edition ? String(edition) : undefined
            };

            // --- Phase 1 & 2: Pre-Pass & Build the "Available Choices" Pools ---
            const classChosenItemsRaw = resolveValue(blockData['classChosenItems']);
            const bgChosenItemsRaw = resolveValue(blockData['backgroundChosenItems']);

            // Helper to sanitize items natively
            const sanitizeItem = (val: any) => {
                if (!val) return null;
                return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
            };

            // Reusable helper to securely build a standalone item pool
            const buildPool = async (rawItems: any) => {
                const list = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? rawItems.split(',') : (rawItems ? [String(rawItems)] : []));
                const pool: { id: string, type: string }[] = [];
                for (const item of list) {
                    const safeId = sanitizeItem(item);
                    if (!safeId) continue;

                    const data = await getItemData(this.app, fetchOptions, safeId);
                    if (data && data.type) {
                        // Fully sanitize the type to match class requirements perfectly
                        pool.push({ id: safeId, type: sanitizeItem(data.type) as string });
                    }
                }
                return pool;
            };

            // Build STRICTLY SEPARATE pools for class and background!
            const classChosenItemsPool = await buildPool(classChosenItemsRaw);
            const bgChosenItemsPool = await buildPool(bgChosenItemsRaw);

            // 2. Fetch Core Data to read Starting Equipment
            let grantedGold = 0;
            const startingItemCounts: Record<string, number> = {};
            const extraItemCounts: Record<string, number> = {};

            // --- Phase 3: The Greedy Matcher Engine ---
            const addItemsToPool = (eqData: any, targetPool: Record<string, number>, sourcePool: { id: string, type: string }[]) => {
                if (!eqData) return;
                if (eqData.gold) grantedGold += Number(eqData.gold);

                // Safely handle both Class format (eqData.items) and Background format (direct object)
                const itemsList = eqData.items ? eqData.items : (eqData.gold ? null : eqData);

                if (itemsList) {
                    // Separate strict items from flexible "OR" slots
                    const strictSlots: [string, number][] = [];
                    const flexibleSlots: [string, number][] = [];

                    for (const [itemId, qty] of Object.entries(itemsList)) {
                        // Detect our Pipe syntax!
                        if (itemId.includes('|')) {
                            flexibleSlots.push([itemId, Number(qty)]);
                        } else {
                            strictSlots.push([itemId, Number(qty)]);
                        }
                    }

                    // 1. Process strict items immediately (e.g., "dagger": 5)
                    for (const [itemId, qty] of strictSlots) {
                        targetPool[itemId] = (targetPool[itemId] || 0) + Number(qty);
                    }

                    // 2. Process flexible "OR" slots (e.g., "artisans-tool|musical-instrument": 1)
                    // Sort them so slots with FEWER options are processed first to avoid starving them
                    flexibleSlots.sort((a, b) => a[0].split('|').length - b[0].split('|').length);

                    for (const [itemId, qty] of flexibleSlots) {
                        // Pass each side of the pipe through our global sanitizer for a perfect 1:1 match
                        const acceptedTypes = itemId.split('|').map(t => sanitizeItem(t) as string);
                        let amountNeeded = Number(qty);

                        // Search the SPECIFIC source pool for matching items
                        for (let i = 0; i < sourcePool.length && amountNeeded > 0; i++) {
                            const poolItem = sourcePool[i];

                            // If the item's type matches one of the slot's accepted types...
                            if (acceptedTypes.includes(poolItem.type)) {
                                // Add it to the backpack
                                targetPool[poolItem.id] = (targetPool[poolItem.id] || 0) + 1;
                                amountNeeded -= 1;
                                sourcePool.splice(i, 1);
                                i--;
                            }
                        }
                    }
                }
            };

            if (dndClass && classEq) {
                const primaryClass = Array.isArray(dndClass) ? dndClass[0] : dndClass;
                const classData = await getClassData(this.app, fetchOptions, primaryClass);
                if (classData?.['startingEquipment']) addItemsToPool(classData['startingEquipment'][classEq], startingItemCounts, classChosenItemsPool);
            }

            // Check for both the background name AND the A/B choice variable
            if (background && bgEq) {
                // Fetch the background data
                const bgData = await getBackgroundData(this.app, fetchOptions, background);

                if (bgData?.['startingEquipment']) {
                    addItemsToPool(bgData['startingEquipment'][bgEq], startingItemCounts, bgChosenItemsPool);
                }
            }

            // Add manual extra items to the Extra Items pool
            let extraItems: string[] = [];
            if (Array.isArray(extraItemsRaw)) {
                extraItems = extraItemsRaw;
            } else if (typeof extraItemsRaw === 'string') {
                extraItems = extraItemsRaw.split(',');
            } else if (extraItemsRaw) {
                extraItems = [String(extraItemsRaw)];
            }

            for (const item of extraItems) {
                // Use our global helper to sanitize the string instantly
                const safeItem = sanitizeItem(item);
                if (!safeItem) continue;

                // Directly load the item! No variantMap interception is needed.
                extraItemCounts[safeItem] = (extraItemCounts[safeItem] || 0) + 1;
            }

            // 3. Omission Logic for Equipped Slots (Checks both pools!)
            const consumeItem = (rawItemName: any) => {
                // Using the helper protects against stray quotes in the frontmatter!
                const safeName = sanitizeItem(rawItemName);
                if (!safeName) return null;

                if (startingItemCounts[safeName] && startingItemCounts[safeName] > 0) {
                    startingItemCounts[safeName] -= 1;
                } else if (extraItemCounts[safeName] && extraItemCounts[safeName] > 0) {
                    extraItemCounts[safeName] -= 1;
                }
                // Return clean, exact text (without quotes) for fallback display
                return String(rawItemName).replace(/['"]/g, '').trim();
            };

            const equippedWeapon = consumeItem(weaponSlot);
            const equippedArmor = consumeItem(armorSlot);

            // --- 4. RENDER UI ---
            wrapper.createEl("h3", { text: "Equipment, Wealth & Items:", cls: "dnd-section-header" });

            // -----------------------------------------------------------
            // A. WEAPON & ARMOR 
            // -----------------------------------------------------------
            if (equippedWeapon || equippedArmor) {
                // Main container with attr to ensure Flexbox works
                const equipGrid = wrapper.createDiv({
                    attr: { style: "display: flex; gap: 10px;" }
                });

                const renderSlot = async (
                    slotLabel: "Weapon" | "Armor",
                    rawItemInput: any,
                    manualStat: any,
                    expectedType: "Weapon" | "Armor"
                ) => {
                    if (!rawItemInput) return;

                    const actualName = String(rawItemInput).replace(/['"]/g, '').trim();
                    if (actualName.toLowerCase() === "none") return;

                    // Use the global helper so item mapping is always perfectly consistent
                    const safeName = sanitizeItem(rawItemInput) as string;

                    let data = await getItemData(this.app, fetchOptions, safeName);

                    // 2. Type-Checking: Ensure the item exists AND matches the expected type
                    const isRecognizedType = data && data.type && String(data.type).toLowerCase().includes(expectedType.toLowerCase());

                    // Default to fallback behavior (raw name, manual stat, no description)
                    let displayName = actualName;
                    let displayStat = manualStat ? String(manualStat) : "-";
                    let displayDesc = "";

                    // 3. Apply Official Data if recognized
                    if (isRecognizedType) {
                        displayName = data.name || actualName;
                        displayStat = manualStat ? String(manualStat) : (expectedType === "Weapon" ? (data.damage || "-") : (data.ac || "-"));
                        displayDesc = data.description || "";
                    }

                    // Card styling
                    const card = equipGrid.createDiv({
                        cls: "dnd-features-window",
                        attr: { style: "flex: 1; display: flex; flex-direction: column; padding: 10px; text-align: center; margin: 0; justify-content: center; gap: 6px;" }
                    });

                    // TOP: Item Name
                    card.createDiv({
                        text: displayName.toUpperCase(),
                        attr: { style: "font-size: 0.85em; color: var(--dnd-ui-color-text-secondary); letter-spacing: 1.5px; font-weight: 600;" }
                    });

                    // MIDDLE: The Stat
                    card.createDiv({
                        text: displayStat,
                        attr: { style: "font-size: 1.6em; font-weight: bold; color: var(--dnd-ui-color-text-bright);" }
                    });

                    // BOTTOM: Description 
                    if (displayDesc) {
                        const noteDiv = card.createDiv({
                            attr: { style: "font-size: 0.9em; color: var(--dnd-ui-color-text-sublabel); line-height: 1.3;" }
                        });

                        await this.renderDndMarkdown(displayDesc, noteDiv, ctx.sourcePath, renderChild);

                        // Strip Obsidian's block paragraph margins so the card stays beautifully compact
                        noteDiv.querySelectorAll('*').forEach((childNode: Element) => {
                            const childEl = childNode as HTMLElement;
                            childEl.style.display = "inline";
                            childEl.style.margin = "0";
                            childEl.style.padding = "0";
                        });
                    }
                };

                // Inject the updated parameters including our expected Types!
                await renderSlot("Weapon", equippedWeapon, weaponDamage, "Weapon");
                await renderSlot("Armor", equippedArmor, armorAc, "Armor");
            }

            // -----------------------------------------------------------
            // B. WEALTH
            // -----------------------------------------------------------
            const goldBase = Number(frontmatter['DnD_GoldBase']) || 0;
            const goldAdded = Number(frontmatter['DnD_GoldAdded']) || 0;
            const goldSpent = Number(frontmatter['DnD_GoldSpent']) || 0;
            const totalGold = goldBase + goldAdded + grantedGold - goldSpent;

            const wealthWindow = wrapper.createDiv({
                cls: "dnd-features-window",
                attr: { style: "display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 12px 16px;" }
            });

            // 1. The Left Group (Badge + Gold Text remain close together)
            const wealth = wealthWindow.createEl("span", { attr: { style: "display: flex; align-items: center;" } });
            wealth.createEl("span", { text: "Wealth", cls: "dnd-level-badge", attr: { style: "margin-right: 10px;" } });
            wealth.createEl("strong", { text: `${totalGold} GP`, attr: { style: "font-size: 1.1em; color: var(--dnd-ui-color-text-bright);" } });
            // 2. The Controls
            const amountInput = wealthWindow.createEl("input", { type: "number", value: "1", attr: { style: "text-align: center; background: var(--dnd-ui-color-bg-darker); border: 1px solid var(--dnd-ui-color-border-primary); color: var(--dnd-ui-color-text-bright); border-radius: 4px; padding: 4px; width: 40px;" } });
            const addBtn = wealthWindow.createEl("button", { text: "Add" });
            const subBtn = wealthWindow.createEl("button", { text: "Spend" });

            addBtn.onclick = () => this.updateGoldFrontmatter(ctx.sourcePath, 'added', Number(amountInput.value) || 0);
            subBtn.onclick = () => this.updateGoldFrontmatter(ctx.sourcePath, 'spent', Number(amountInput.value) || 0);

            // -----------------------------------------------------------
            // C. BACKPACK CONTENTS
            // -----------------------------------------------------------
            // Restored the window class so the outer box appears!
            const backpackWindow = wrapper.createDiv({ cls: "dnd-features-window" });

            const backpackHeader = backpackWindow.createDiv({
                cls: "dnd-class-header",
                attr: { style: "display: flex; justify-content: space-between; align-items: center; margin: 0 0 10px 0; border-bottom: 1px solid var(--dnd-ui-color-border-primary); padding-bottom: 8px;" }
            });
            backpackHeader.createEl("h4", { text: "Backpack Contents", attr: { style: "color: var(--dnd-ui-color-text-primary); margin: 0; border: none; padding: 0;" } });

            const weightTracker = backpackHeader.createEl("span", {
                text: "Weight: 0 lbs",
                attr: { style: "font-size: 0.85em; color: var(--dnd-ui-color-text-muted); font-weight: normal; letter-spacing: 0.5px;" }
            });
            let totalWeight = 0;

            const renderPool = async (pool: Record<string, number>, title?: string) => {
                // Filter out items with 0 quantity so we only create headers/grids if there are items to show
                const validItems = Object.entries(pool).filter(([_, qty]) => qty > 0);
                if (validItems.length === 0) return;

                if (title) {
                    // Small divider sub-header strictly for Extra Items
                    backpackWindow.createEl("div", { text: title, attr: { style: "margin: 16px 0 8px 0; font-weight: bold; font-size: 0.85em; text-transform: uppercase; color: var(--dnd-ui-color-text-sublabel); border-bottom: 1px solid var(--dnd-ui-color-bg-tertiary); padding-bottom: 4px;" } });
                }

                // --- THE RESPONSIVE GRID CONTAINER ---
                const gridContainer = backpackWindow.createDiv({
                    cls: "dnd-inventory-grid"
                });

                for (const [itemId, qty] of validItems) {
                    let data = await getItemData(this.app, fetchOptions, itemId);
                    const fallbackName = itemId.replace(/\b\w/g, c => c.toUpperCase()).replace(/-/g, ' ');
                    if (!data) data = { name: fallbackName, description: "" };

                    // STRICT ONE LINE CONTAINER
                    const itemRow = gridContainer.createEl("span", {
                        attr: { style: "display: flex; flex-direction: row; align-items: center; width: 100%; padding: 3px 0; cursor: default;" }
                    });

                    // --- HOVER TOOLTIP ENGINE ---
                    const X_OFFSET = 12; // Pixels to the right of the cursor
                    const Y_OFFSET = 15; // Pixels below the cursor

                    itemRow.addEventListener('mouseenter', async (e) => {
                        tooltipWindow.empty(); // Wipe the previous item's data

                        // 1. Name & Category
                        tooltipWindow.createEl("h4", { text: data.name, attr: { style: "margin: 0 0 4px 0; color: var(--dnd-ui-color-text-bright); font-size: 1.1em;" } });
                        if (data.type) {
                            tooltipWindow.createEl("div", { text: data.type.toUpperCase(), attr: { style: "font-size: 0.75em; color: var(--dnd-ui-color-text-secondary); letter-spacing: 1px; margin-bottom: 8px;" } });
                        }

                        // 2. Stats (Weight & Cost)
                        const statsDiv = tooltipWindow.createDiv({ attr: { style: "display: flex; gap: 15px; margin-bottom: 8px; font-size: 0.85em; color: var(--dnd-ui-color-text-muted);" } });

                        if (data.weight) statsDiv.createEl("span", { text: `Weight: ${data.weight} lbs` });
                        if (data.cost) statsDiv.createEl("span", { text: `Cost: ${data.cost} GP` });

                        // 3. Description (Rendered securely with your Markdown engine!)
                        if (data.description) {
                            const descDiv = tooltipWindow.createDiv({ attr: { style: "font-size: 0.9em; line-height: 1.4; color: var(--dnd-ui-color-text-primary);" } });
                            await this.renderDndMarkdown(data.description, descDiv, ctx.sourcePath, renderChild);
                        }

                        // Make visible and position using your custom variables
                        tooltipWindow.style.display = "block";
                        tooltipWindow.style.left = `${e.clientX + X_OFFSET}px`;
                        tooltipWindow.style.top = `${e.clientY + Y_OFFSET}px`;
                    });

                    // Smoothly follow the mouse, using your custom variables
                    itemRow.addEventListener('mousemove', (e) => {
                        const xPos = e.clientX + X_OFFSET;
                        const safeX = (xPos + 300 > window.innerWidth) ? e.clientX - 300 - X_OFFSET : xPos;

                        tooltipWindow.style.left = `${safeX}px`;
                        tooltipWindow.style.top = `${e.clientY + Y_OFFSET}px`;
                    });

                    // Hide it instantly when the mouse leaves the row
                    itemRow.addEventListener('mouseleave', () => {
                        tooltipWindow.style.display = "none";
                    });

                    // 1. Badge 
                    itemRow.createEl("span", { text: `x${qty}`, cls: "dnd-level-badge", attr: { style: "margin: 0 10px 0 0; flex-shrink: 0;" } });

                    // 2. Name (Conditional Colon!)
                    const hasExtraInfo = !!(data.weight || data.cost);
                    const colon = hasExtraInfo ? ": " : "";

                    itemRow.createEl("strong", { text: data.name + colon, attr: { style: "color: var(--dnd-ui-color-text-bright); margin-right: 4px" } });

                    // 3. Weight & Cost (Fixed the 'display: color:' typo here)
                    const rightSide = itemRow.createEl("span", {
                        attr: { style: "color: var(--dnd-ui-color-text-muted); font-size: 0.9em; white-space: nowrap; text-align: center;" }
                    });

                    if (data.weight) {
                        rightSide.createEl("span", { text: `${data.weight * qty}lbs,  ` });

                        totalWeight += (data.weight * qty);
                    }
                    if (data.cost) {
                        rightSide.createEl("span", { text: `${data.cost}GP` });
                    }
                }
            };

            await renderPool(startingItemCounts);
            await renderPool(extraItemCounts, "Extra Items");
            weightTracker.setText(`Weight: ${totalWeight % 1 === 0 ? totalWeight : totalWeight.toFixed(1)} lbs`);

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDRulesBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Create a Render Child to manage the lifecycle and reactivity
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // 2. Wrap our entire rendering logic into a reusable function
        const renderContent = async () => {
            // Create a temporary wrapper to prevent UI flickering while awaiting data
            const wrapper = document.createElement('div');

            // Parse the user's code block using Obsidian's built-in YAML parser
            let blockData;
            try {
                blockData = parseYaml(source);
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-rules block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            // 2. Fetch the frontmatter for the current active file
            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter = fileCache?.frontmatter || {};

            // 3. Helper function to resolve "frontmatter.property" values
            const resolveValue = (val: any) => {
                if (typeof val === 'string' && val.startsWith('frontmatter.')) {
                    const key = val.replace('frontmatter.', '');
                    return frontmatter[key];
                }
                return val;
            };

            // 4. Resolve all core variables
            const hbRule = resolveValue(blockData.rules);
            const edition = resolveValue(blockData.edition);

            const fetchOptions = {
                ...this.settings,
                edition: edition ? String(edition) : undefined
            };

            // 6. Setup the Registry Lookup (Preparation for Data Fetching)
            const rulesArray = Array.isArray(hbRule) ? hbRule : (hbRule ? [hbRule] : []);

            if (rulesArray.length > 0) {
                const sectionWindow = wrapper.createDiv({ cls: "dnd-features-window" });
                const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-rules` });

                for (const ruleKey of rulesArray) {
                    const ruleData = await getRuleData(this.app, fetchOptions, ruleKey);

                    // Fix 2: Check for ruleData.rules instead of ruleData.rule
                    if (ruleData && ruleData.rules) {
                        // Use the JSON's main name for the header, or fallback to the key
                        const headerName = ruleData.name ? ruleData.name : ruleKey;
                        sectionDiv.createEl("h4", { text: `${headerName}:`, cls: "dnd-class-header" });

                        for (const rule of ruleData.rules) {
                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            titleContainer.createEl("span", { text: rule.badge ? rule.badge : "Rule", cls: "dnd-level-badge" });
                            titleContainer.createEl("span", { text: rule.name, cls: "dnd-feature-name" });

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(rule.description, descDiv, ctx.sourcePath, renderChild);
                        }
                    } else {
                        sectionDiv.createEl("p", { text: `Data for rule "${ruleKey}" not found.`, cls: "dnd-error-text" });
                    }
                }
            }

            // Fix 3: Actually append the fully built wrapper to Obsidian's element
            el.empty();
            el.appendChild(wrapper);
        };
        renderContent();
        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDControlsBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Parse the YAML options (e.g., align: right-up)
        let blockData: Record<string, any> = {};
        try {
            if (source.trim()) {
                blockData = parseYaml(source) || {};
            }
        } catch (error) {
            el.createEl("p", { text: "Error: Invalid YAML in dnd-controls block.", cls: "dnd-error-text" });
            return;
        }

        // 2. Fetch the frontmatter for the active file to check for spellcasting
        const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        // 3. Determine Alignment & Line Shifting
        let justifyContent = "flex-start";
        let marginTop = "10px";
        let marginBottom = "10px";
        let position = "static";
        let zIndex = "auto";

        if (blockData.align === "right") justifyContent = "flex-end";
        if (blockData.align === "center") justifyContent = "center";

        if (blockData.align === "right-up") {
            justifyContent = "flex-end";
            marginTop = "-45px";
            marginBottom = "15px";
            position = "relative";
            zIndex = "10";
        }

        if (blockData.align === "right-down") {
            justifyContent = "flex-end";
            marginTop = "25px";
            marginBottom = "10px";
        }

        // 4. Create the Button Container
        const container = el.createDiv({
            cls: "dnd-controls",
            attr: { style: `display: flex; gap: 10px; flex-wrap: wrap; justify-content: ${justifyContent}; margin-top: ${marginTop}; margin-bottom: ${marginBottom}; position: ${position}; z-index: ${zIndex};` }
        });

        // 5. Create the Buttons
        const addExpBtn = container.createEl("button", { text: "🗡️ Level Up", cls: "mod-cta" });
        addExpBtn.onclick = () => {
            new LevelUpModal(this.app, this, ctx.sourcePath).open();
        };

        const equipItemsBtn = container.createEl("button", { text: "⚔️ Equip Items" });
        equipItemsBtn.onclick = () => {
            new EquipItemsModal(this.app, this, ctx.sourcePath).open();
        };

        const manageCharBtn = container.createEl("button", { text: "⚙️ Manage Character" });
        manageCharBtn.onclick = () => {
            new ManageCharacterModal(this.app, this, ctx.sourcePath).open();
        };

        // Conditionally render the Spellbook button ONLY if DnD_spellcastingAbility exists in frontmatter
        if (frontmatter["DnD_spellcastingAbility"]) {
            const spellbookBtn = container.createEl("button", { text: "📖 Spellbook" });
            spellbookBtn.onclick = () => {
                new SpellbookModal(this.app, this, ctx.sourcePath).open();
            };
        }
    }

    // Helper: Reads a spell or spell router from the bundled registry (or customRulebookPath)
    async loadSpellFile(fileNameWithoutExt: string): Promise<any | null> {
        return await getSpellData(this.app, this.settings, fileNameWithoutExt);
    }

    async processDnDSpellsBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // Create a single reusable hover tooltip for this block
        const tooltipWindow = document.body.createDiv({
            cls: "dnd-inventory-tooltip",
            attr: { style: "position: fixed; display: none; z-index: 9999; background: var(--dnd-ui-color-bg-secondary); border: 1px solid var(--dnd-ui-color-border-primary); border-radius: 6px; padding: 12px; width: 320px; box-shadow: 0 8px 16px rgba(0,0,0,0.6); pointer-events: none;" }
        });
        renderChild.register(() => tooltipWindow.remove());

        const renderContent = async () => {
            const wrapper = document.createElement('div');

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    blockData = parseYaml(source) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-spells block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            // Standard helper: Only reads from frontmatter if the user explicitly writes "frontmatter.<key>"
            const resolveValue = (val: any) => {
                if (typeof val === 'string') {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith('frontmatter.')) {
                        return frontmatter[trimmed.replace('frontmatter.', '')];
                    }
                }
                return val;
            };

            // 1. Resolve DnD_spellcasting_ability strictly from the code block variable
            const DnD_spellcasting_ability = resolveValue(
                blockData.DnD_spellcasting_ability ?? blockData.spellcastingAbility ?? blockData["DnD_spellcastingAbility"]
            ) || "";

            // --- HIDE-AND-SHOW LOGIC ---
            // If the character has no spellcasting ability, completely abort rendering.
            if (!DnD_spellcasting_ability || String(DnD_spellcasting_ability).trim().startsWith("<")) {
                el.empty();
                return;
            }

            const spellAbilityKey = String(DnD_spellcasting_ability).toLowerCase().trim();
            const abilityScore = Number(resolveValue(blockData[spellAbilityKey]) ?? frontmatter[`DnD_${spellAbilityKey}`]) || 10;
            const abilityMod = Math.floor((abilityScore - 10) / 2);
            const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
            const DnD_proficiency_bonus = Number(
                resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
            ) || Math.ceil(1 + (level / 4));

            const spellSaveDc = 8 + DnD_proficiency_bonus + abilityMod;
            const spellAttackMod = DnD_proficiency_bonus + abilityMod;
            const spellAttackStr = spellAttackMod >= 0 ? `+${spellAttackMod}` : `${spellAttackMod}`;

            // 2. Parse Known & Prepared Spells Tuples strictly from blockData.spells & blockData.preparedSpells
            const parseTuples = (raw: any): Record<string, string[]> => {
                const map: Record<string, string[]> = {};
                if (raw === undefined || raw === null) return map;
                let parsed = resolveValue(raw);
                if (typeof parsed === "string") {
                    const trimmed = parsed.trim();
                    if (trimmed.startsWith("[")) {
                        try { parsed = JSON.parse(trimmed); } catch { parsed = []; }
                    } else {
                        parsed = [];
                    }
                }
                if (Array.isArray(parsed)) {
                    for (const rawEntry of parsed) {
                        const entry = resolveValue(rawEntry);
                        if (Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[0])) {
                            map[String(entry[1])] = entry[0].map((s: any) => String(s));
                        }
                    }
                }
                return map;
            };

            const knownMap = parseTuples(blockData.spells);
            const preparedMap = parseTuples(blockData.preparedSpells);

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
            let targetSlotsFmKey = "DnD_spellSlots";
            if (typeof rawSpellSlotsProp === "string" && rawSpellSlotsProp.trim().startsWith("frontmatter.")) {
                targetSlotsFmKey = rawSpellSlotsProp.trim().replace("frontmatter.", "");
            }

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
                    attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; margin: 0; text-align: center;" }
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

                    for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
                        const isUsed = slotIdx < usedSlots;
                        const pip = pipsContainer.createDiv({
                            cls: `dnd-slot-pip ${isUsed ? "is-used" : ""}`,
                            attr: { title: isUsed ? "Click to restore slot" : "Click to expend slot" }
                        });

                        pip.onclick = async (e) => {
                            e.stopPropagation();
                            const newUsed = isUsed ? slotIdx : slotIdx + 1;
                            const updatedTuples: [string, string][] = slotsArray.map((s, idx) => [
                                String(s.max),
                                idx === slotArrayIdx ? String(newUsed) : String(s.used)
                            ]);
                            await this.updateCharacterFrontmatter(ctx.sourcePath, {
                                [targetSlotsFmKey]: JSON.stringify(updatedTuples)
                            });
                        };
                    }
                }

                // If the character has slots for this level (e.g., for upcasting) but no spells prepared at this level
                if (spellKeys.length === 0) {
                    spellsWindow.createEl("p", {
                        text: `No Level ${lvl} spells currently prepared.`,
                        attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; font-size: 0.85em; margin: 0 0 12px 0;" }
                    });
                    continue;
                }

                // 2-Column Grid (fills top-left to bottom-right just like dnd-inventory)
                const gridContainer = spellsWindow.createDiv({ cls: "dnd-spells-grid" });

                for (const spellKey of spellKeys) {
                    const fallbackName = spellKey.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    const spellData = (await this.loadSpellFile(spellKey)) || {
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
                        badgeGroup.createEl("span", { text: "C", cls: "dnd-level-badge", attr: { title: "Concentration", style: "margin: 0; padding: 1px 6px; font-size: 0.75em;" } });
                    }
                    if (spellData.ritual) {
                        badgeGroup.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined", attr: { title: "Ritual", style: "margin: 0; padding: 1px 6px; font-size: 0.75em;" } });
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
                        descDrawer.style.display = "none";
                        await this.renderDndMarkdown(spellData.description, descDrawer, ctx.sourcePath, renderChild);

                        card.style.cursor = "pointer";
                        card.onclick = () => {
                            const isHidden = descDrawer.style.display === "none";
                            descDrawer.style.display = isHidden ? "block" : "none";
                        };

                        // --- D. HOVER TOOLTIP (Matches dnd-inventory) ---
                        const X_OFFSET = 12;
                        const Y_OFFSET = 15;

                        card.addEventListener('mouseenter', async (e) => {
                            if (descDrawer.style.display === "block") return; // Don't show tooltip if drawer is already expanded
                            tooltipWindow.empty();

                            tooltipWindow.createEl("h4", { text: spellData.name || fallbackName, attr: { style: "margin: 0 0 4px 0; color: var(--dnd-ui-color-text-bright); font-size: 1.05em;" } });
                            const subHeader = lvl === "0" ? `${spellData.school || ""} Cantrip` : `Level ${lvl} ${spellData.school || ""}`;
                            tooltipWindow.createEl("div", { text: subHeader.trim().toUpperCase(), attr: { style: "font-size: 0.75em; color: var(--dnd-ui-color-text-secondary); letter-spacing: 1px; margin-bottom: 8px;" } });

                            const tipDesc = tooltipWindow.createDiv({ attr: { style: "font-size: 0.9em; line-height: 1.4; color: var(--dnd-ui-color-text-primary);" } });
                            await this.renderDndMarkdown(spellData.description, tipDesc, ctx.sourcePath, renderChild);

                            tooltipWindow.style.display = "block";
                            tooltipWindow.style.left = `${e.clientX + X_OFFSET}px`;
                            tooltipWindow.style.top = `${e.clientY + Y_OFFSET}px`;
                        });

                        card.addEventListener('mousemove', (e) => {
                            const xPos = e.clientX + X_OFFSET;
                            const safeX = (xPos + 320 > window.innerWidth) ? e.clientX - 320 - X_OFFSET : xPos;
                            tooltipWindow.style.left = `${safeX}px`;
                            tooltipWindow.style.top = `${e.clientY + Y_OFFSET}px`;
                        });

                        card.addEventListener('mouseleave', () => {
                            tooltipWindow.style.display = "none";
                        });
                    }
                }
            }

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDSkillsBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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
                if (source.trim()) {
                    // Strip YAML comments (like #Class or #Background) before parsing so they never interfere
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-skills block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            // Resolves "frontmatter.Key" or "{{ frontmatter.Key }}"
            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

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
            const skillsWindow = wrapper.createDiv({
                cls: "dnd-skills-window",
                // Reduced padding to match the screenshots
                attr: {
                    style: "width: 100%; border: 1px solid var(--dnd-ui-color-border-primary); background-color: var(--dnd-ui-color-bg-primary); color: var(--dnd-ui-color-text-primary); border-radius: 6px; padding: 10px 14px; margin: 10px 0; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); box-sizing: border-box;"
                }
            });

            const skillsGrid = skillsWindow.createDiv({
                cls: "dnd-skills-grid"
            });

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
                    cls: `dnd-skill-row ${rankTier !== "none" ? `is-${rankTier}` : ""}`,
                    attr: {
                        // Added position: relative so the absolute dot anchors perfectly inside this row's left padding
                        style: `display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px; background-color: transparent; position: relative;`
                    }
                });

                const leftSide = row.createDiv({
                    cls: "dnd-skill-left",
                    attr: {
                        // Restored gap: 12px since the absolute dot no longer takes up flexbox space!
                        style: "display: flex; align-items: center; gap: 12px; min-width: 0;"
                    }
                });

                // --- NEW: Dynamic Indicator Dot ---
                leftSide.createEl("span", {
                    cls: "dnd-skill-dot",
                    attr: { title: rankTier !== "none" ? rankTier.charAt(0).toUpperCase() + rankTier.slice(1) : "Not Proficient" }
                });

                leftSide.createEl("span", {
                    text: skillDef.abbr,
                    cls: "dnd-skill-abbr",
                    attr: {
                        style: "font-size: 0.78em; font-style: italic; font-weight: 500; color: var(--dnd-ui-color-text-muted); width: 32px; display: inline-block; flex-shrink: 0; letter-spacing: 0.5px;"
                    }
                });

                leftSide.createEl("span", {
                    text: skillDef.name,
                    cls: "dnd-skill-name",
                    attr: {
                        style: "font-size: 0.95em; color: var(--dnd-ui-color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                    }
                });

                const rightSide = row.createDiv({
                    cls: "dnd-skill-mod",
                    attr: {
                        style: "font-size: 0.95em; font-weight: 400; color: var(--dnd-ui-color-text-primary); margin-left: 12px; flex-shrink: 0;"
                    }
                });
                rightSide.setText(formattedTotal);
            }

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDAbilitiesBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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
                if (source.trim()) {
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-abilities block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

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
            const gridEl = wrapper.createDiv({
                cls: "dnd-abilities-grid",
                attr: {
                    style: `display: grid; width: 100%; gap: 10px; margin: 10px 0; grid-template-columns: repeat(${totalCards}, minmax(0, 1fr)); box-sizing: border-box;`
                }
            });

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
                    cls: `dnd-ability-card ${card.isProficient ? "is-proficient" : ""}`,
                    attr: {
                        style: `display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; border: 1px solid ${card.isProficient ? "var(--dnd-ui-color-border-active)" : "var(--dnd-ui-color-border-primary)"}; background-color: ${card.isProficient ? "var(--dnd-ui-color-bg-proficient)" : "var(--dnd-ui-color-bg-primary)"}; box-sizing: border-box;`
                    }
                });

                // Top Header Bar: Handle (Left) + Underlined Score (Right)
                const headerEl = cardEl.createDiv({
                    cls: "dnd-ability-header",
                    attr: {
                        // FIX: Static secondary background prevents the header from blending into the proficient body
                        style: `display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background-color: var(--dnd-ui-color-bg-secondary);`
                    }
                });

                headerEl.createEl("span", {
                    text: card.handle,
                    cls: "dnd-ability-abbr",
                    attr: {
                        // Muted text color for abbreviation
                        style: "font-size: 0.85em; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: var(--dnd-ui-color-text-muted);"
                    }
                });

                headerEl.createEl("span", {
                    text: String(card.score),
                    cls: "dnd-ability-score",
                    attr: {
                        // Muted text color for score with clean bottom border instead of text-underline-offset
                        style: "font-size: 0.9em; font-weight: 500; color: var(--dnd-ui-color-text-muted); border-bottom: 1px solid var(--dnd-ui-color-text-muted); padding-bottom: 1px; line-height: 1;"
                    }
                });

                // Card Body: Large Underlined Modifier + Italic Saving Throw
                const bodyEl = cardEl.createDiv({
                    cls: "dnd-ability-body",
                    attr: {
                        style: "display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 14px 10px 10px 10px; gap: 10px; flex: 1;"
                    }
                });

                bodyEl.createEl("div", {
                    text: card.modStr,
                    cls: "dnd-ability-mod",
                    attr: {
                        // Removed bold text and used border-bottom instead of text-underline-offset
                        style: "font-size: 1.65em; font-weight: 400; line-height: 1.1; color: var(--dnd-ui-color-text-bright); border-bottom: 2px solid var(--dnd-ui-color-text-bright); padding-bottom: 4px;"
                    }
                });

                bodyEl.createEl("div", {
                    text: `Saving ${card.saveStr}`,
                    cls: "dnd-ability-save",
                    attr: {
                        style: `font-size: 0.82em; font-style: italic; color: ${card.isProficient ? "var(--dnd-ui-color-text-sublabel)" : "var(--dnd-ui-color-text-muted)"};`
                    }
                });
            }

            el.empty();
            el.appendChild(wrapper);
            requestAnimationFrame(() => updateGridColumns());
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDInfoBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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
                if (source.trim()) {
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-info block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

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

                const acMod = parseNumericMod(blockData.armorAcMod ?? frontmatter["DnD_armorAcMod"], 0);

                const explicitAc = resolveValue(blockData.armorClass ?? blockData.ac);
                const finalAc = (explicitAc !== undefined && explicitAc !== null && explicitAc !== "" && !isNaN(Number(explicitAc)))
                    ? Number(explicitAc)
                    : (baseAc + acBonus + acMod);

                const armorName = formatTextValue(blockData.armor ?? frontmatter["DnD_armor"], "Unarmored");

                cards.push({
                    label: "ARMOR CLASS",
                    value: String(finalAc),
                    sublabel: armorName
                });

                // 2. Initiative
                const explicitInit = resolveValue(blockData.initiative);
                const initVal = (explicitInit !== undefined && explicitInit !== null && explicitInit !== "" && !isNaN(Number(explicitInit)))
                    ? Number(explicitInit)
                    : dexMod;
                const initSublabel = formatTextValue(blockData.initiativeSublabel, "Dexterity Modifier");

                cards.push({
                    label: "INITIATIVE",
                    value: formatSigned(initVal),
                    sublabel: initSublabel
                });

                // 3. Attack Roll (Base Ability Mod + Proficiency Bonus + DnD_attack_roll_mod)
                const attackStatRaw = formatTextValue(blockData.attackStat ?? frontmatter["DnD_attackStat"], "strength").toLowerCase();
                const attackStatScore = Number(resolveValue(blockData[attackStatRaw]) ?? frontmatter[`DnD_${attackStatRaw}`]) || 10;
                const attackStatMod = Math.floor((attackStatScore - 10) / 2);

                const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
                const DnD_proficiency_bonus = Number(
                    resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
                ) || Math.ceil(1 + (level / 4));

                const rawIncludeProf = resolveValue(blockData.attackProficiency) ?? frontmatter["DnD_attackProficiency"];
                const includeProf = rawIncludeProf !== undefined && rawIncludeProf !== null && rawIncludeProf !== ""
                    ? String(rawIncludeProf).toLowerCase() !== "false" && Boolean(rawIncludeProf)
                    : true;

                const DnD_attack_roll_mod = parseNumericMod(
                    blockData.attackRollMod ?? blockData.DnD_attack_roll_mod ?? blockData.DnD_attackRollMod ?? frontmatter["DnD_attackRollMod"],
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
                const rawSpeed = resolveValue(blockData.speed ?? frontmatter["DnD_speed"]);
                let speedDisplay = "30 feet";
                if (rawSpeed !== undefined && rawSpeed !== null && String(rawSpeed).trim() !== "") {
                    const sTrim = String(rawSpeed).trim();
                    speedDisplay = !isNaN(Number(sTrim)) ? `${sTrim} feet` : sTrim;
                }
                const speedSublabel = formatTextValue(blockData.speedSublabel ?? frontmatter["DnD_speedSublabel"], "");

                cards.push({
                    label: "SPEED",
                    value: speedDisplay,
                    sublabel: speedSublabel
                });
            } else {
                // --- CHARACTER MODE: RACE, CLASS, BACKGROUND, LEVEL (+ LANGUAGES) ---
                const raceVal = formatTextValue(blockData.race ?? frontmatter["DnD_race"], "-");
                const raceSub = formatTextValue(blockData.raceLineage ?? blockData.lineage ?? frontmatter["DnD_raceLineage"], "");

                const classVal = formatTextValue(blockData.class ?? frontmatter["DnD_class"], "-");
                const classSub = formatTextValue(blockData.subclass ?? frontmatter["DnD_subclass"], "");

                const bgVal = formatTextValue(blockData.background ?? frontmatter["DnD_background"], "-");
                const bgSub = formatTextValue(blockData.backgroundFeat ?? frontmatter["DnD_backgroundFeat"], "");

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

                languagesStr = formatTextValue(blockData.languages ?? frontmatter["DnD_languages"], "");
            }

            // Render 4-Column Responsive Grid (splits cleanly into 2x2 if narrow)
            const containerEl = wrapper.createDiv({ cls: "dnd-info-container" });

            const gridEl = containerEl.createDiv({
                cls: "dnd-info-grid",
                attr: {
                    style: "display: grid; width: 100%; gap: 10px; margin: 10px 0 6px 0; grid-template-columns: repeat(4, minmax(0, 1fr)); box-sizing: border-box;"
                }
            });

            const updateGridColumns = () => {
                const width = gridEl.clientWidth;
                if (width <= 0) return;

                const MIN_CARD_WIDTH = 155;
                const GAP_PX = 10;
                const requiredWidth = (4 * MIN_CARD_WIDTH) + (3 * GAP_PX);

                if (width < requiredWidth) {
                    gridEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
                } else {
                    gridEl.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
                }
            };

            activeResizeObserver = new ResizeObserver(() => updateGridColumns());
            activeResizeObserver.observe(gridEl);

            // Render Cards
            for (const c of cards) {
                const cardEl = gridEl.createDiv({
                    cls: "dnd-info-card",
                    attr: {
                        style: "display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 14px 12px; border-radius: 6px; background-color: var(--dnd-ui-color-bg-primary); color: var(--dnd-ui-color-text-primary); border: 1px solid var(--dnd-ui-color-border-primary); min-height: 92px; box-sizing: border-box; text-align: center;"
                    }
                });

                cardEl.createDiv({
                    text: c.label,
                    cls: "dnd-info-card-label",
                    attr: {
                        style: "font-size: 0.8em; text-transform: uppercase; letter-spacing: 1px; color: var(--dnd-ui-color-text-secondary); margin-bottom: 8px; font-weight: 500;"
                    }
                });

                cardEl.createDiv({
                    text: c.value,
                    cls: "dnd-info-card-value",
                    attr: {
                        style: "font-size: 1.35em; font-weight: 700; color: var(--dnd-ui-color-text-bright); line-height: 1.2;"
                    }
                });

                if (c.sublabel) {
                    cardEl.createDiv({
                        text: c.sublabel,
                        cls: "dnd-info-card-sublabel",
                        attr: {
                            style: "font-size: 0.78em; color: var(--dnd-ui-color-text-sublabel); margin-top: 6px; line-height: 1.2;"
                        }
                    });
                }
            }

            // Render Languages Pill Badge in Character Mode (Matching bottom-left of Screenshot 2)
            if (mode === "character" && languagesStr) {
                const langRow = containerEl.createDiv({
                    cls: "dnd-info-languages-row",
                    attr: {
                        style: "display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; margin-bottom: 10px;"
                    }
                });

                const langBadge = langRow.createDiv({
                    cls: "dnd-info-languages-badge",
                    attr: {
                        style: "display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 6px; background-color: var(--dnd-ui-color-bg-primary); border: 1px solid var(--dnd-ui-color-border-primary);"
                    }
                });

                langBadge.createEl("span", {
                    text: "LANGUAGES",
                    cls: "dnd-info-languages-label",
                    attr: {
                        style: "font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.8px; color: var(--dnd-ui-color-text-secondary); font-weight: 500;"
                    }
                });

                langBadge.createEl("span", {
                    text: languagesStr,
                    cls: "dnd-info-languages-value",
                    attr: {
                        style: "font-size: 0.85em; font-weight: 700; color: var(--dnd-ui-color-text-bright);"
                    }
                });
            }

            el.empty();
            el.appendChild(wrapper);
            requestAnimationFrame(() => updateGridColumns());
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDHealthBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // Persistent session states across frontmatter re-renders
        let tempHp = 0;
        let usedHitDice = 0;
        let manualDeathSavesOpen = false;
        let deathSaveLeft: boolean[] = [false, false, false];
        let deathSaveRight: boolean[] = [false, false, false];

        const renderContent = async () => {
            const wrapper = document.createElement("div");

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-health block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

            // 1. Resolve health (Max HP), hitDice (DnD_hit_dice), and level (DnD_level)
            const rawMaxHealth = resolveValue(blockData.health ?? blockData.maxHealth);
            const maxHealth = (rawMaxHealth !== undefined && rawMaxHealth !== null && rawMaxHealth !== "" && !isNaN(Number(rawMaxHealth)))
                ? Math.max(1, Number(rawMaxHealth))
                : Math.max(1, Number(frontmatter["DnD_maxHealth"]) || 1);

            let rawHitDice = resolveValue(blockData.hitDice ?? blockData.DnD_hit_dice) ?? frontmatter["DnD_hitDice"];
            if (!rawHitDice && frontmatter["DnD_class"]) {
                const primaryClass = Array.isArray(frontmatter["DnD_class"]) ? frontmatter["DnD_class"][0] : frontmatter["DnD_class"];
                const classData = await getClassData(this.app, this.settings, primaryClass);
                if (classData) {
                    rawHitDice = classData.HitDice || classData.hitDice || classData.hit_dice;
                }
            }
            const DnD_hit_dice = String(rawHitDice || "d8").trim().replace(/^<.*>$/, "d8") || "d8";

            const rawLevel = resolveValue(blockData.level ?? blockData.DnD_level);
            const DnD_level = (rawLevel !== undefined && rawLevel !== null && rawLevel !== "" && !isNaN(Number(rawLevel)))
                ? Math.max(1, Number(rawLevel))
                : Math.max(1, Number(frontmatter["DnD_level"]) || 1);

            // Clamp used hit dice to current level
            if (usedHitDice > DnD_level) usedHitDice = DnD_level;

            // Resolve DnD_current_health from frontmatter.DnD_currentHealth (or block override)
            let targetCurrentHpKey = "DnD_currentHealth";
            if (typeof blockData.currentHealth === "string" && blockData.currentHealth.trim().startsWith("frontmatter.")) {
                targetCurrentHpKey = blockData.currentHealth.trim().replace("frontmatter.", "");
            }

            const rawCurrentHealth = resolveValue(blockData.currentHealth) ?? frontmatter[targetCurrentHpKey];
            const DnD_current_health = (rawCurrentHealth !== undefined && rawCurrentHealth !== null && rawCurrentHealth !== "" && !isNaN(Number(rawCurrentHealth)))
                ? Math.max(0, Math.min(maxHealth, Number(rawCurrentHealth)))
                : maxHealth;

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
                await this.updateCharacterFrontmatter(ctx.sourcePath, {
                    [targetCurrentHpKey]: newHp
                });
            };

            dmgBtn.onclick = async () => {
                let remainingDmg = Math.max(0, Number(amountInput.value) || 0);
                if (remainingDmg <= 0) return;

                // Deduct from Temp HP first
                if (tempHp > 0) {
                    const absorbed = Math.min(tempHp, remainingDmg);
                    tempHp -= absorbed;
                    remainingDmg -= absorbed;
                }

                const newHp = Math.max(0, DnD_current_health - remainingDmg);
                if (newHp !== DnD_current_health) {
                    await this.updateCharacterFrontmatter(ctx.sourcePath, {
                        [targetCurrentHpKey]: newHp
                    });
                } else {
                    renderContent();
                }
            };

            tempBtn.onclick = () => {
                const amt = Math.max(0, Number(amountInput.value) || 0);
                tempHp = amt;
                renderContent();
            };

            // 3. Hit Dice Section
            healthWindow.createDiv({ cls: "dnd-health-divider" });

            const hitDiceRow = healthWindow.createDiv({ cls: "dnd-health-hitdice-row" });
            hitDiceRow.createEl("span", {
                text: `HIT DICE (${DnD_hit_dice.toUpperCase()})`,
                cls: "dnd-health-hitdice-label"
            });

            const hdPipsContainer = hitDiceRow.createDiv({ cls: "dnd-spell-slots-pips" });
            for (let i = 0; i < DnD_level; i++) {
                const isUsed = i < usedHitDice;
                const pip = hdPipsContainer.createDiv({
                    cls: `dnd-slot-pip ${isUsed ? "is-used" : ""}`,
                    attr: { title: isUsed ? "Click to restore Hit Die" : "Click to spend Hit Die" }
                });
                pip.onclick = (e) => {
                    e.stopPropagation();
                    usedHitDice = isUsed ? i : i + 1;
                    renderContent();
                };
            }

            // 4. Death Saves Section (Shows automatically at 0 HP or when manually toggled)
            const showDeathSaves = DnD_current_health <= 0 || manualDeathSavesOpen;
            if (showDeathSaves) {
                healthWindow.createDiv({ cls: "dnd-health-divider" });

                const deathSavesRow = healthWindow.createDiv({ cls: "dnd-health-deathsaves-row" });

                const leftPips = deathSavesRow.createDiv({ cls: "dnd-spell-slots-pips" });
                for (let i = 0; i < 3; i++) {
                    const pip = leftPips.createDiv({
                        cls: `dnd-slot-pip ${deathSaveLeft[i] ? "is-used" : ""}`,
                        attr: { title: "Death Save Failure" }
                    });
                    pip.onclick = (e) => {
                        e.stopPropagation();
                        deathSaveLeft[i] = !deathSaveLeft[i];
                        renderContent();
                    };
                }

                deathSavesRow.createEl("span", {
                    text: "💀",
                    cls: "dnd-health-skull"
                });

                const rightPips = deathSavesRow.createDiv({ cls: "dnd-spell-slots-pips" });
                for (let i = 0; i < 3; i++) {
                    const pip = rightPips.createDiv({
                        cls: `dnd-slot-pip ${deathSaveRight[i] ? "is-used" : ""}`,
                        attr: { title: "Death Save Success" }
                    });
                    pip.onclick = (e) => {
                        e.stopPropagation();
                        deathSaveRight[i] = !deathSaveRight[i];
                        renderContent();
                    };
                }
            }

            // 5. Bottom Action Buttons: Short Rest, Long Rest, Death Saves
            const bottomBar = wrapper.createDiv({ cls: "dnd-health-rest-bar" });

            const shortRestBtn = bottomBar.createEl("button", {
                text: "Short Rest",
                cls: "dnd-health-rest-btn",
                attr: { value: "short-rest" }
            });
            shortRestBtn.onclick = () => {
                window.dispatchEvent(new Event("short-rest"));
                new Notice("Short Rest taken!");
            };

            const longRestBtn = bottomBar.createEl("button", {
                text: "Long Rest",
                cls: "dnd-health-rest-btn",
                attr: { value: "long-rest" }
            });
            longRestBtn.onclick = async () => {
                tempHp = 0;
                usedHitDice = 0;
                manualDeathSavesOpen = false;
                deathSaveLeft = [false, false, false];
                deathSaveRight = [false, false, false];

                await this.updateCharacterFrontmatter(ctx.sourcePath, {
                    [targetCurrentHpKey]: maxHealth
                });
                renderContent();
                window.dispatchEvent(new Event("long-rest"));
                new Notice("Long Rest completed! HP, Hit Dice, and Spell Slots restored.");
            };

            const deathSavesBtn = bottomBar.createEl("button", {
                text: "Death Saves",
                cls: `dnd-health-rest-btn ${showDeathSaves ? "is-active" : ""}`
            });
            deathSavesBtn.onclick = () => {
                manualDeathSavesOpen = !manualDeathSavesOpen;
                renderContent();
            };

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }
}

// --- CHARACTER CREATION WIZARD UI ---
class CharacterWizardModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    currentStep: number = 1;
    totalSteps: number = 5; // UPGRADED to 5 steps!

    // Data pools for our dropdowns
    availableClasses: string[] = [];
    availableRaces: string[] = [];
    availableBackgrounds: string[] = [];

    // Expanded storage for all our new choices
    wizardData: Record<string, any> = {
        name: "", level: 1, race: "", raceLineage: "", dndClass: "", subclass: "",
        DnD_spellcasting_ability: "", background: "", classEquipment: "A", backgroundEquipment: "A",
        classChosenItems: "", backgroundChosenItems: "",
        weapon: "", weaponDamage: "", armor: "", armorAc: "",
        languages: "", extraFeats: "", speed: 30, maxHealth: 0,
        chosenSkills: [],
        chosenBgSkills: [],
        chosenAbilityBonuses: [],
        classChoices: [], // <-- NEW: Stores the dynamic Class Choices [Router, Key, Level]
        expertiseChoices: [],
    };

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
        const getKeys = async (fileName: string, nativeMap: Record<string, any>) => {
            const keys: Set<string> = new Set(Object.keys(nativeMap || {}));
            const basePath = this.plugin.settings.customRulebookPath?.trim();
            if (basePath) {
                const customPath = normalizePath(`${basePath}/${fileName}`);
                try {
                    if (await this.app.vault.adapter.exists(customPath)) {
                        const content = await this.app.vault.adapter.read(customPath);
                        Object.keys(JSON.parse(content)).forEach(k => keys.add(k));
                    }
                } catch (e) {
                    console.error(`Wizard Error: Could not read custom file at ${customPath}`, e);
                }
            }
            if (keys.size === 0) {
                console.warn(`Wizard: No data found for ${fileName}.`);
                new Notice(`Warning: Could not load ${fileName}. Dropdown will be empty.`);
            }
            return Array.from(keys).sort();
        };

        this.availableClasses = await getKeys("classes.json", classesMap);
        this.availableRaces = await getKeys("races.json", racesMap);
        this.availableBackgrounds = await getKeys("backgrounds.json", backgroundsMap);
    }

    // Main rendering engine for the Wizard
    async renderStep() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", {
            text: `Character Creation Wizard (Step ${this.currentStep} of ${this.totalSteps})`,
            cls: "dnd-section-header"
        });

        const stepContainer = contentEl.createDiv({ cls: "dnd-features-window" });

        // We MUST await all steps now so dynamic lineages and subclasses can fetch data before rendering
        if (this.currentStep === 1) {
            await this.renderStepOne(stepContainer);
        } else if (this.currentStep === 2) {
            await this.renderStepTwo(stepContainer);
        } else if (this.currentStep === 3) {
            await this.renderStepThree(stepContainer); // NEW Class Options Step
        } else if (this.currentStep === 4) {
            await this.renderStepFour(stepContainer); // Equipment Step
        } else if (this.currentStep === 5) {
            this.renderStepFive(stepContainer); // Finalization Step
        }

        const navContainer = contentEl.createDiv({
            attr: { style: "display: flex; justify-content: space-between; margin-top: 20px;" }
        });

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
                await this.finishWizard();
            }
        };
    }

    async renderStepOne(container: HTMLElement) {
        container.createEl("h3", { text: "Core Details", cls: "dnd-class-header" });

        // Character Name & Level Inputs
        const grid = container.createDiv({ attr: { style: "display: grid; grid-template-columns: 3fr 1fr; gap: 10px; margin-bottom: 12px;" } });

        const nameDiv = grid.createDiv();
        nameDiv.createEl("label", { text: "Character Name: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const nameInput = nameDiv.createEl("input", { type: "text", value: this.wizardData.name });
        nameInput.style.width = "100%";
        nameInput.placeholder = "e.g., Din";
        nameInput.onchange = (e) => this.wizardData.name = (e.target as HTMLInputElement).value;

        const levelDiv = grid.createDiv();
        levelDiv.createEl("label", { text: "Level: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const levelInput = levelDiv.createEl("input", { type: "number", value: String(this.wizardData.level) });
        levelInput.min = "1"; levelInput.max = "20"; levelInput.style.width = "100%";
        levelInput.onchange = async (e) => {
            this.wizardData.level = Number((e.target as HTMLInputElement).value) || 1;
            await this.renderStep();
        };

        // --- RACE SECTION ---
        const raceDiv = container.createDiv({ attr: { style: "margin-bottom: 12px;" } });
        raceDiv.createEl("label", { text: "Race: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const raceSelect = raceDiv.createEl("select");
        raceSelect.style.width = "100%";
        raceSelect.createEl("option", { text: "-- Select a Race --", value: "" });
        this.availableRaces.forEach(r => raceSelect.createEl("option", { text: r, value: r }));
        raceSelect.value = this.wizardData.race;

        // Re-render the step if Race changes to fetch Lineages dynamically!
        raceSelect.onchange = async (e) => {
            this.wizardData.race = (e.target as HTMLSelectElement).value;
            this.wizardData.raceLineage = "";
            await this.renderStep();
        };

        // Conditional Race Lineage
        if (this.wizardData.race) {
            const raceData = await getRaceData(this.app, this.plugin.settings, this.wizardData.race);
            if (raceData && raceData.traits) {
                // Extract unique lineages from the traits
                const lineages = new Set(raceData.traits.filter((t: any) => t.lineage).map((t: any) => t.lineage));
                if (lineages.size > 0) {
                    const linDiv = container.createDiv({ attr: { style: "margin-bottom: 12px; margin-left: 15px; border-left: 2px solid var(--dnd-ui-color-border-active); padding-left: 10px;" } });
                    linDiv.createEl("label", { text: "Race Lineage: ", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
                    const linSelect = linDiv.createEl("select");
                    linSelect.style.width = "100%";
                    linSelect.createEl("option", { text: "-- Select a Lineage --", value: "" });
                    Array.from(lineages).forEach((l: any) => linSelect.createEl("option", { text: l, value: l }));
                    linSelect.value = this.wizardData.raceLineage || "";
                    linSelect.onchange = (e) => this.wizardData.raceLineage = (e.target as HTMLSelectElement).value;
                }
            }
        }

        // --- CLASS SECTION ---
        const classDiv = container.createDiv({ attr: { style: "margin-bottom: 12px;" } });
        classDiv.createEl("label", { text: "Class: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const classSelect = classDiv.createEl("select");
        classSelect.style.width = "100%";
        classSelect.createEl("option", { text: "-- Select a Class --", value: "" });
        this.availableClasses.forEach(c => classSelect.createEl("option", { text: c, value: c }));

        // FIX: Bound to dndClass instead of class
        classSelect.value = this.wizardData.dndClass;

        classSelect.onchange = async (e) => {
            this.wizardData.dndClass = (e.target as HTMLSelectElement).value;
            this.wizardData.subclass = "";
            await this.renderStep();
        };

        // Conditional Subclass (Only shows if the class grants a subclass at or before the chosen starting level)
        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, Number(this.wizardData.level) || 1);

            if (grantedSubclassFile) {
                const allSubclasses = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile);
                if (allSubclasses && typeof allSubclasses === "object") {
                    const subclassNames = Object.keys(allSubclasses);
                    if (subclassNames.length > 0) {
                        const subDiv = container.createDiv({ attr: { style: "margin-bottom: 12px; margin-left: 15px; border-left: 2px solid var(--dnd-ui-color-border-active); padding-left: 10px;" } });
                        subDiv.createEl("label", { text: "Subclass: ", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
                        const subSelect = subDiv.createEl("select");
                        subSelect.style.width = "100%";
                        subSelect.createEl("option", { text: "-- Select a Subclass --", value: "" });
                        subclassNames.forEach(s => subSelect.createEl("option", { text: s, value: s }));
                        subSelect.value = this.wizardData.subclass || "";
                        subSelect.onchange = (e) => this.wizardData.subclass = (e.target as HTMLSelectElement).value;
                    }
                }
            } else {
                this.wizardData.subclass = "";
            }
        }

        // --- BACKGROUND SECTION (Moved from Step 3) ---
        const bgDiv = container.createDiv({ attr: { style: "margin-bottom: 12px;" } });
        bgDiv.createEl("label", { text: "Background: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const bgSelect = bgDiv.createEl("select");
        bgSelect.style.width = "100%";
        bgSelect.createEl("option", { text: "-- Select a Background --", value: "" });
        this.availableBackgrounds.forEach(b => bgSelect.createEl("option", { text: b, value: b }));
        bgSelect.value = this.wizardData.background || "";

        // Triggers a re-render so Step 3 can later know what background is active
        bgSelect.onchange = async (e) => {
            this.wizardData.background = (e.target as HTMLSelectElement).value;
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
        const statsGrid = container.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;" } });
        const stats = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

        stats.forEach(stat => {
            const statKey = stat.toLowerCase();
            if (this.wizardData[statKey] === undefined) this.wizardData[statKey] = 10;

            const statDiv = statsGrid.createDiv();
            statDiv.createEl("label", { text: `${stat}:`, attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });

            const statInput = statDiv.createEl("input", { type: "number", value: String(this.wizardData[statKey]) });
            statInput.style.width = "100%";
            statInput.onchange = (e) => {
                this.wizardData[statKey] = Number((e.target as HTMLInputElement).value);
                if (statKey === "constitution") this.renderStep();
            };
        });

        // 2. Health & Speed Controls (Moved UP above the skills)
        const vitalsGrid = container.createDiv({ attr: { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;" } });

        const speedDiv = vitalsGrid.createDiv();
        speedDiv.createEl("label", { text: "Speed (ft):", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const speedInput = speedDiv.createEl("input", { type: "number", value: String(this.wizardData.speed) });
        speedInput.style.width = "100%";
        speedInput.onchange = (e) => this.wizardData.speed = Number((e.target as HTMLInputElement).value);

        const hpDiv = vitalsGrid.createDiv();
        hpDiv.createEl("label", { text: "Max Health:", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const hpWrapper = hpDiv.createDiv({ attr: { style: "display: flex; gap: 5px;" } });

        const hpInput = hpWrapper.createEl("input", { type: "number", value: String(this.wizardData.maxHealth) });
        hpInput.style.width = "100%";
        hpInput.onchange = (e) => this.wizardData.maxHealth = Number((e.target as HTMLInputElement).value);

        const autoHpBtn = hpWrapper.createEl("button", { text: "Auto (Lvl 1)", attr: { title: "Max Hit Die + CON Modifier" } });
        autoHpBtn.onclick = async () => {
            let hitDieMax = 8;
            if (classData && classData.hitDice) {
                const parsedHitDie = parseInt(String(classData.hitDice).replace(/\D/g, ''));
                if (!isNaN(parsedHitDie)) hitDieMax = parsedHitDie;
            }

            // Safely tally base CON + Background CON bonuses!
            let totalCon = this.wizardData.constitution || 10;
            if (this.wizardData.chosenAbilityBonuses) {
                totalCon += this.wizardData.chosenAbilityBonuses.filter((b: string) => b.toLowerCase() === "constitution").length;
            }

            const conMod = Math.floor((totalCon - 10) / 2);
            this.wizardData.maxHealth = hitDieMax + conMod;
            await this.renderStep();
        };

        // 3. Spellcasting Dropdown
        if (this.wizardData.dndClass) {
            if (classData && classData.spellcastingAbilities && Array.isArray(classData.spellcastingAbilities)) {
                const spellDiv = container.createDiv();
                spellDiv.createEl("label", { text: "Primary Spellcasting Ability: ", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
                const spellSelect = spellDiv.createEl("select");
                spellSelect.style.width = "100%";
                spellSelect.createEl("option", { text: "-- Select Ability --", value: "" });

                classData.spellcastingAbilities.forEach((ability: string) => spellSelect.createEl("option", { text: ability, value: ability }));

                if (classData.spellcastingAbilities.length === 1) {
                    this.wizardData.DnD_spellcasting_ability = classData.spellcastingAbilities[0];
                }

                spellSelect.value = this.wizardData.DnD_spellcasting_ability || "";
                spellSelect.onchange = (e) => this.wizardData.DnD_spellcasting_ability = (e.target as HTMLSelectElement).value;
            }
        }

        // 4. Class Skills Pool (Dynamic Dropdowns)
        if (this.wizardData.dndClass) {
            const sp = classData?.skillsPool;

            if (sp && Array.isArray(sp) && sp.length === 2) {
                const availableSkills = sp[0] as string[];
                const numChoices = sp[1] as number;

                if (availableSkills.length > 0 && numChoices > 0) {
                    // KEEPS the top border (the "long line") as requested!
                    const skillsDiv = container.createDiv({ attr: { style: "margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--dnd-ui-color-border-primary);" } });
                    skillsDiv.createEl("label", { text: `Class Skill Proficiencies (Choose ${numChoices}):`, attr: { style: "display: block; margin-bottom: 8px; color: var(--dnd-ui-color-text-sublabel);" } });

                    if (!this.wizardData.chosenSkills || this.wizardData.chosenSkills.length !== numChoices) {
                        this.wizardData.chosenSkills = new Array(numChoices).fill("");
                    }

                    const skillGrid = skillsDiv.createDiv({ attr: { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" } });

                    for (let i = 0; i < numChoices; i++) {
                        const skillSelect = skillGrid.createEl("select");
                        skillSelect.style.width = "100%";
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

        // 5. Background Ability Score Bonuses (Moved DOWN)
        if (bgData && bgData.abilityBonusPool && Array.isArray(bgData.abilityBonusPool)) {
            // FIX: Removed border-bottom and padding-bottom so no stray short lines appear! 
            const bonusDiv = container.createDiv({ attr: { style: "margin-top: 15px;" } });
            bonusDiv.createEl("label", { text: "Background Ability Bonuses (+3 total):", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 8px; color: var(--dnd-ui-color-text-sublabel);" } });

            if (!this.wizardData.chosenAbilityBonuses || this.wizardData.chosenAbilityBonuses.length !== 3) {
                this.wizardData.chosenAbilityBonuses = ["", "", ""];
            }

            const bonusGrid = bonusDiv.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;" } });

            for (let i = 0; i < 3; i++) {
                const bonusSelect = bonusGrid.createEl("select");
                bonusSelect.style.width = "100%";
                bonusSelect.createEl("option", { text: `-- +1 Bonus --`, value: "" });

                bgData.abilityBonusPool.forEach((ability: string) => {
                    const displayAbil = ability.charAt(0).toUpperCase() + ability.slice(1);
                    bonusSelect.createEl("option", { text: displayAbil, value: ability });
                });

                bonusSelect.value = this.wizardData.chosenAbilityBonuses[i] || "";
                bonusSelect.onchange = (e) => {
                    this.wizardData.chosenAbilityBonuses[i] = (e.target as HTMLSelectElement).value;
                    // Re-render so HP updates if CON gets a bonus!
                    if ((e.target as HTMLSelectElement).value.toLowerCase() === "constitution" || this.wizardData.chosenAbilityBonuses.includes("constitution")) {
                        this.renderStep();
                    }
                };
            }
            bonusDiv.createEl("small", { text: "Tip: Assign +1 to three different stats, or +2 to one and +1 to another.", attr: { style: "display: block; margin-top: 6px; color: var(--dnd-ui-color-text-muted);" } });
        }

        // 6. Background Skills Pool (Dynamic Dropdowns)
        if (bgData && bgData.skillsPool && Array.isArray(bgData.skillsPool) && bgData.skillsPool.length === 2) {
            const availableBgSkills = bgData.skillsPool[0] as string[];
            const numBgChoices = bgData.skillsPool[1] as number;

            if (availableBgSkills.length > 0 && numBgChoices > 0) {
                // FIX: Uses margin-top without borders, grouping it nicely below the Background Bonuses!
                const bgSkillsDiv = container.createDiv({ attr: { style: "margin-top: 15px;" } });
                bgSkillsDiv.createEl("label", { text: `Background Skill Proficiencies (Choose ${numBgChoices}):`, attr: { style: "display: block; margin-bottom: 8px; color: var(--dnd-ui-color-text-sublabel);" } });

                if (!this.wizardData.chosenBgSkills || this.wizardData.chosenBgSkills.length !== numBgChoices) {
                    this.wizardData.chosenBgSkills = new Array(numBgChoices).fill("");
                }

                const bgSkillGrid = bgSkillsDiv.createDiv({ attr: { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" } });

                for (let i = 0; i < numBgChoices; i++) {
                    const skillSelect = bgSkillGrid.createEl("select");
                    skillSelect.style.width = "100%";
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
            const autoBgSkillsDiv = container.createDiv({ attr: { style: "margin-top: 15px;" } });
            autoBgSkillsDiv.createEl("label", { text: `Background Granted Skills:`, attr: { style: "display: block; margin-bottom: 8px; color: var(--dnd-ui-color-text-sublabel);" } });

            // Format array into a clean Title Case string
            const autoSkillsText = bgData.skills.map((skill: string) => {
                return skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }).join(', ');

            // Display them in a visually distinct, read-only box
            autoBgSkillsDiv.createEl("div", {
                text: autoSkillsText,
                attr: { style: "padding: 8px 12px; background: var(--dnd-ui-color-bg-darker); border: 1px solid var(--dnd-ui-color-border-primary); border-radius: 4px; color: var(--dnd-ui-color-text-muted);" }
            });
        }
    }

    async renderStepThree(container: HTMLElement) {
        container.createEl("h3", { text: "Class Options", cls: "dnd-class-header" });
        container.createEl("p", { text: "Select your specialized class features.", attr: { style: "color: var(--dnd-ui-color-text-muted); margin-bottom: 15px;" } });

        let hasChoices = false;

        // NEW: Fetch Background Skills so we know what they are proficient in for Expertise!
        let availableProficiencies: string[] = [];
        availableProficiencies.push(...(this.wizardData.chosenSkills || []));
        availableProficiencies.push(...(this.wizardData.chosenBgSkills || []));

        if (this.wizardData.background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgData?.skills) availableProficiencies.push(...bgData.skills);
        }
        // Clean and lowercase the pool for clean dropdowns
        availableProficiencies = [...new Set(availableProficiencies.filter(s => s !== "").map(s => s.toLowerCase()))];

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);

            // NEW: Fetch Subclass data if granted at or before this level!
            let subclassData: any = null;
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, Number(this.wizardData.level) || 1);
            if (this.wizardData.subclass && grantedSubclassFile) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile, this.wizardData.subclass);
            }

            if (classData && classData.features) {
                // INSTEAD of looping 1 to level, we strictly read the JSON payload for the TARGET level!
                // This perfectly matches your JSON design (e.g. Warlock Level 5 explicitly listing 5 invocations).
                let levelFeatures: any[] = [];
                const targetLevel = this.wizardData.level.toString();

                if (classData.features[targetLevel]) {
                    levelFeatures = levelFeatures.concat(classData.features[targetLevel]);
                }
                if (subclassData && subclassData[targetLevel]) {
                    levelFeatures = levelFeatures.concat(subclassData[targetLevel]);
                }

                if (levelFeatures.length > 0) {
                    for (const feature of levelFeatures) {
                        // If this feature has a dynamic Class Choices array in the JSON...
                        if (feature.classChoices && Array.isArray(feature.classChoices)) {
                            hasChoices = true;

                            // Use a traditional for-loop to track the exact index of the choice
                            for (let choiceIndex = 0; choiceIndex < feature.classChoices.length; choiceIndex++) {
                                const routerName = feature.classChoices[choiceIndex];
                                const routerData = await getClassChoiceData(this.app, this.plugin.settings, routerName);

                                if (routerData) {
                                    // Build a clean UI Card for the choice
                                    const choiceDiv = container.createDiv({ attr: { style: "margin-bottom: 12px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });

                                    const displayName = routerName.split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                    choiceDiv.createEl("label", { text: `Level ${targetLevel}: ${feature.name} (${displayName} ${choiceIndex + 1})`, attr: { style: "display: block; margin-bottom: 8px; font-weight: bold; color: var(--dnd-ui-color-text-secondary);" } });

                                    const selectEl = choiceDiv.createEl("select");
                                    selectEl.style.width = "100%";
                                    selectEl.createEl("option", { text: `-- Select Option --`, value: "" });

                                    Object.entries(routerData).forEach(([key, val]) => {
                                        selectEl.createEl("option", { text: val as string, value: key });
                                    });

                                    // Restore previous selection using Level + Router + Choice Index!
                                    const existingChoice = this.wizardData.classChoices.find((c: any) => c[0] === routerName && c[2] === targetLevel && c[3] === choiceIndex);
                                    if (existingChoice) selectEl.value = existingChoice[1];

                                    // Save securely in internal memory as [Router File, Chosen Key, Level, Index]
                                    selectEl.onchange = (e) => {
                                        const selectedVal = (e.target as HTMLSelectElement).value;

                                        // Remove old choice for this specific slot
                                        this.wizardData.classChoices = this.wizardData.classChoices.filter((c: any) => !(c[0] === routerName && c[2] === targetLevel && c[3] === choiceIndex));

                                        if (selectedVal) {
                                            this.wizardData.classChoices.push([routerName, selectedVal, targetLevel, choiceIndex]);
                                        }
                                    };
                                }
                            }
                        }

                        // --- NEW: EXPERTISE ENGINE (grantedExpertise) ---
                        if (feature.grantedExpertise && Array.isArray(feature.grantedExpertise) && feature.grantedExpertise.length === 2) {
                            hasChoices = true;
                            const expPool = feature.grantedExpertise[0] as string[];
                            const grantedExpertiseCount = feature.grantedExpertise[1] as number;

                            if (grantedExpertiseCount > 0) {
                                const expDiv = container.createDiv({ attr: { style: "margin-bottom: 20px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });
                                expDiv.createEl("label", { text: `Level ${targetLevel}: ${feature.name} (${grantedExpertiseCount} Choices)`, attr: { style: "display: block; margin-bottom: 8px; font-weight: bold; color: var(--dnd-ui-color-text-secondary);" } });
                                expDiv.createEl("small", { text: "Select skills you are already proficient in to gain Expertise.", attr: { style: "display: block; margin-bottom: 12px; color: var(--dnd-ui-color-text-muted);" } });

                                // Strictly filter available proficiencies based on the explicitly provided JSON pool
                                let filteredProficiencies = availableProficiencies;
                                if (expPool.length > 0) {
                                    filteredProficiencies = availableProficiencies.filter(skill => expPool.map(s => String(s).toLowerCase()).includes(String(skill).toLowerCase()));
                                }

                                // Ensure our data array is ready for the total choices provided by the JSON
                                if (!this.wizardData.expertiseChoices || this.wizardData.expertiseChoices.length !== grantedExpertiseCount) {
                                    this.wizardData.expertiseChoices = Array(grantedExpertiseCount).fill(["", targetLevel]);
                                }

                                // UX Improvement: Warn the user if they skipped selecting skills in Step 2!
                                if (filteredProficiencies.length === 0) {
                                    expDiv.createEl("p", { text: "You have no eligible skill proficiencies to gain Expertise in. Please go back to Step 2 and select your class/background skills first!", attr: { style: "color: var(--dnd-ui-color-accent-red); font-style: italic; font-size: 0.9em;" } });
                                } else {
                                    for (let e = 0; e < grantedExpertiseCount; e++) {
                                        const selectDiv = expDiv.createDiv({ attr: { style: "margin-bottom: 8px; display: flex; align-items: center;" } });
                                        selectDiv.createEl("small", { text: `Choice ${e + 1}:`, attr: { style: "flex: 0 0 65px; color: var(--dnd-ui-color-text-sublabel);" } });

                                        const selectEl = selectDiv.createEl("select", { attr: { style: "flex: 1;" } });
                                        selectEl.createEl("option", { text: `-- Select Expertise --`, value: "" });

                                        filteredProficiencies.forEach(skill => {
                                            const displaySkill = skill.replace(/\b\w/g, c => c.toUpperCase());
                                            selectEl.createEl("option", { text: displaySkill, value: skill });
                                        });

                                        if (this.wizardData.expertiseChoices[e]) selectEl.value = this.wizardData.expertiseChoices[e][0];

                                        selectEl.onchange = (evt) => {
                                            const val = (evt.target as HTMLSelectElement).value;
                                            this.wizardData.expertiseChoices[e] = [val, targetLevel];
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!hasChoices) {
            container.createEl("p", { text: "No additional class choices available for this level.", attr: { style: "font-style: italic; color: var(--dnd-ui-color-text-sublabel);" } });
        }
    }

    async renderStepFour(container: HTMLElement) {
        // Changed the header text slightly since Background is now in Step 1
        container.createEl("h3", { text: "Equipment & Feats", cls: "dnd-class-header" });

        // Languages & Feats Grid
        const extraGrid = container.createDiv({ attr: { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;" } });

        const langDiv = extraGrid.createDiv();
        langDiv.createEl("label", { text: "Languages: ", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const langInput = langDiv.createEl("input", { type: "text", value: this.wizardData.languages });
        langInput.style.width = "100%"; langInput.placeholder = "Common, Elvish...";
        langInput.onchange = (e) => this.wizardData.languages = (e.target as HTMLInputElement).value;

        const featDiv = extraGrid.createDiv();
        featDiv.createEl("label", { text: "Extra Feats: ", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const featInput = featDiv.createEl("input", { type: "text", value: this.wizardData.extraFeats });
        featInput.style.width = "100%"; featInput.placeholder = "Tough, Alert...";
        featInput.onchange = (e) => this.wizardData.extraFeats = (e.target as HTMLInputElement).value;

        // HELPER: Checks for flexible choices and generates a dynamic placeholder
        const getFlexibleData = (equipmentData: any) => {
            let hasFlex = false;
            let placeholder = "e.g., Lute, Mason's Tools...";

            if (equipmentData && equipmentData.items) {
                // Find any key that contains the flexible pipe character
                const flexKeys = Object.keys(equipmentData.items).filter(key => key.includes('|'));
                if (flexKeys.length > 0) {
                    hasFlex = true;
                    // Format the options: 'artisans-tool|musical-instrument' -> 'Artisans Tool, Musical Instrument'
                    const options = flexKeys[0].split('|')
                        .filter(item => item !== "") // Handle trailing pipes like 'artisans-tool|'
                        .map(item => {
                            return item.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                        });
                    placeholder = `e.g., ${options.join(', ')}`;
                }
            }
            return { hasFlex, placeholder };
        };

        // --- Class Equipment Section ---
        let showClassItems = false;
        let classPlaceholder = "e.g., Lute, Mason's Tools...";
        let classEqOptions = ["A", "B"]; // Safe fallback

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (classData?.startingEquipment) {
                // Dynamically fetch A, B, C, etc. directly from the JSON
                classEqOptions = Object.keys(classData.startingEquipment).sort();

                const eqChoice = this.wizardData.classEquipment || classEqOptions[0];
                if (classData.startingEquipment[eqChoice]) {
                    const flexData = getFlexibleData(classData.startingEquipment[eqChoice]);
                    showClassItems = flexData.hasFlex;
                    classPlaceholder = flexData.placeholder;
                }
            }
        }

        const classEqDiv = container.createDiv({ attr: { style: "margin-bottom: 12px;" } });
        classEqDiv.createEl("label", { text: "Class Starting Equipment Choice: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const classEqSelect = classEqDiv.createEl("select");
        classEqSelect.style.width = "100%";

        // Dynamically build the dropdown options
        classEqOptions.forEach(opt => {
            classEqSelect.createEl("option", { text: `Choice ${opt}`, value: opt });
        });

        // Ensure the current value is valid; if not, default to the first available choice
        if (!classEqOptions.includes(this.wizardData.classEquipment)) {
            this.wizardData.classEquipment = classEqOptions[0];
        }
        classEqSelect.value = this.wizardData.classEquipment;

        // Re-render when changing A/B/C so the flexible input box can appear/disappear dynamically
        classEqSelect.onchange = async (e) => {
            this.wizardData.classEquipment = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };

        if (showClassItems) {
            const classItemsDiv = container.createDiv({ attr: { style: "margin-bottom: 12px; margin-left: 15px; border-left: 2px solid var(--dnd-ui-color-border-active); padding-left: 10px;" } });
            classItemsDiv.createEl("label", { text: "Class Chosen Items (Required): ", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
            const classItemsInput = classItemsDiv.createEl("input", { type: "text", value: this.wizardData.classChosenItems || "" });
            classItemsInput.style.width = "100%";
            classItemsInput.placeholder = classPlaceholder;
            classItemsInput.onchange = (e) => this.wizardData.classChosenItems = (e.target as HTMLInputElement).value;
        }

        // --- Background Equipment Section ---
        let showBgItems = false;
        let bgPlaceholder = "e.g., Dice, Forgery Kit...";
        let bgEqOptions = ["A", "B"]; // Safe fallback

        if (this.wizardData.background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgData?.startingEquipment) {
                // Dynamically fetch A, B, C, etc. directly from the JSON
                bgEqOptions = Object.keys(bgData.startingEquipment).sort();

                const eqChoice = this.wizardData.backgroundEquipment || bgEqOptions[0];
                if (bgData.startingEquipment[eqChoice]) {
                    const flexData = getFlexibleData(bgData.startingEquipment[eqChoice]);
                    showBgItems = flexData.hasFlex;
                    bgPlaceholder = flexData.placeholder;
                }
            }
        }

        const bgEqDiv = container.createDiv({ attr: { style: "margin-bottom: 12px;" } });
        bgEqDiv.createEl("label", { text: "Background Starting Equipment Choice: ", attr: { style: "display: block; margin-bottom: 4px;" } });
        const bgEqSelect = bgEqDiv.createEl("select");
        bgEqSelect.style.width = "100%";

        // Dynamically build the dropdown options
        bgEqOptions.forEach(opt => {
            bgEqSelect.createEl("option", { text: `Choice ${opt}`, value: opt });
        });

        // Ensure the current value is valid; if not, default to the first available choice
        if (!bgEqOptions.includes(this.wizardData.backgroundEquipment)) {
            this.wizardData.backgroundEquipment = bgEqOptions[0];
        }
        bgEqSelect.value = this.wizardData.backgroundEquipment;

        bgEqSelect.onchange = async (e) => {
            this.wizardData.backgroundEquipment = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };

        if (showBgItems) {
            const bgItemsDiv = container.createDiv({ attr: { style: "margin-bottom: 12px; margin-left: 15px; border-left: 2px solid var(--dnd-ui-color-border-active); padding-left: 10px;" } });
            bgItemsDiv.createEl("label", { text: "Background Chosen Items (Required): ", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
            const bgItemsInput = bgItemsDiv.createEl("input", { type: "text", value: this.wizardData.backgroundChosenItems || "" });
            bgItemsInput.style.width = "100%";
            bgItemsInput.placeholder = bgPlaceholder;
            bgItemsInput.onchange = (e) => this.wizardData.backgroundChosenItems = (e.target as HTMLInputElement).value;
        }

        // --- Weapon Section ---
        container.createEl("h4", { text: "Equipped Items", attr: { style: "margin-top: 20px; margin-bottom: 10px; color: var(--dnd-ui-color-text-muted);" } });
        const weaponGrid = container.createDiv({ attr: { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;" } });

        const weaponNameDiv = weaponGrid.createDiv();
        weaponNameDiv.createEl("label", { text: "Weapon Name: ", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const weaponInput = weaponNameDiv.createEl("input", { type: "text", value: this.wizardData.weapon || "" });
        weaponInput.style.width = "100%"; weaponInput.placeholder = "Longsword";
        weaponInput.onchange = (e) => this.wizardData.weapon = (e.target as HTMLInputElement).value;

        const weaponDmgDiv = weaponGrid.createDiv();
        weaponDmgDiv.createEl("label", { text: "Weapon Damage: ", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const weaponDmgInput = weaponDmgDiv.createEl("input", { type: "text", value: this.wizardData.weaponDamage || "" });
        weaponDmgInput.style.width = "100%"; weaponDmgInput.placeholder = "1d8 Slashing";
        weaponDmgInput.onchange = (e) => this.wizardData.weaponDamage = (e.target as HTMLInputElement).value;

        // --- Armor Section ---
        const armorGrid = container.createDiv({ attr: { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;" } });

        const armorNameDiv = armorGrid.createDiv();
        armorNameDiv.createEl("label", { text: "Armor Name: ", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const armorInput = armorNameDiv.createEl("input", { type: "text", value: this.wizardData.armor || "" });
        armorInput.style.width = "100%"; armorInput.placeholder = "Chain Mail";
        armorInput.onchange = (e) => this.wizardData.armor = (e.target as HTMLInputElement).value;

        const armorAcDiv = armorGrid.createDiv();
        armorAcDiv.createEl("label", { text: "Armor AC: ", attr: { style: "display: block; font-size: 0.9em; margin-bottom: 4px;" } });
        const armorAcInput = armorAcDiv.createEl("input", { type: "number", value: this.wizardData.armorAc || "" });
        armorAcInput.style.width = "100%"; armorAcInput.placeholder = "16";
        armorAcInput.onchange = (e) => this.wizardData.armorAc = Number((e.target as HTMLInputElement).value);
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
        let pactMagicData: any = null;

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (classData) {
                const hd = classData.HitDice || classData.hitDice || classData.hit_dice;
                if (hd) DnD_hit_dice = hd;

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
                if (classData.spellcasting) spellcastingData = classData.spellcasting;
                if (classData.pactMagic) pactMagicData = classData.pactMagic;
            }
        }

        if (this.wizardData.background) {
            bgDataStore = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgDataStore && bgDataStore.feat) {
                bgFeat = bgDataStore.feat.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            }
        }

        // --- Calculate Final Stats (Base + Background Bonuses) ---
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

        // --- Dynamic AC Modifier Calculation ---
        const dexMod = Math.floor((dexStats.final - 10) / 2);
        let armorAcBonus = dexMod;
        let isUnarmored = true;
        const manualArmorAc = Number(this.wizardData.armorAc) || 0;

        if (this.wizardData.armor && this.wizardData.armor.toLowerCase() !== "none") {
            const safeArmorName = this.wizardData.armor.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
            const armorData = await getItemData(this.app, this.plugin.settings, safeArmorName);

            if (armorData && armorData.ac && armorData.category) {
                isUnarmored = false;
                this.wizardData.armorAc = parseInt(armorData.ac);
                const category = String(armorData.category).toLowerCase();
                if (category.includes("light")) {
                    armorAcBonus = dexMod;
                } else if (category.includes("medium")) {
                    armorAcBonus = Math.min(dexMod, 2);
                } else if (category.includes("heavy")) {
                    armorAcBonus = 0;
                }
            } else if (manualArmorAc > 10) {
                isUnarmored = false;
                this.wizardData.armorAc = manualArmorAc;
            }
        }

        if (isUnarmored) {
            this.wizardData.armorAc = manualArmorAc > 10 ? manualArmorAc : 10;
            if (unarmoredDefense) {
                const secondaryStat = getStatDetails(unarmoredDefense);
                armorAcBonus = dexMod + Math.floor((secondaryStat.final - 10) / 2);
            }
        }

        this.wizardData.armorAcBonus = armorAcBonus;
        this.wizardData.armorAcMod = 0; // Initialize manual modifier strictly to 0

        // 3. Prepare the Template string
        let finalContent = MarkdownNotes['dnd_character_template'] || "";
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
            if (value !== undefined && value !== "") {
                let listStr = "";
                if (Array.isArray(value)) {
                    listStr = "\n" + value.map(v => `  - ${v}`).join("\n");
                } else if (typeof value === "string") {
                    const arr = value.split(',').map(s => s.trim()).filter(s => s !== "");
                    listStr = "\n" + arr.map(v => `  - ${v}`).join("\n");
                }
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
        injectYAML("DnD_spellcastingAbility", this.wizardData.DnD_spellcasting_ability);
        injectYAML("DnD_classEquipment", this.wizardData.classEquipment);
        injectYAML("DnD_backgroundEquipment", this.wizardData.backgroundEquipment);
        const finalClassChoices = this.wizardData.classChoices.map((c: any[]) => [String(c[1]), String(c[2])]);
        // Wrapping in single quotes forces Obsidian's UI to accept it as a clean text string!
        injectYAML("DnD_classChoices", `'${JSON.stringify(finalClassChoices)}'`);

        // Initialize Empty Spells Arrays
        injectYAML("DnD_spells", `'[]'`);
        injectYAML("DnD_preparedSpells", `'[]'`);

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
        const finalExpertise = (this.wizardData.expertiseChoices || [])
            .filter((c: any[]) => c[0] !== "")
            .map((c: any[]) => [String(c[0]), String(c[1])]);
        // Wrapping in single quotes prevents Obsidian UI warnings
        injectYAML("DnD_skillExpertise", `'${JSON.stringify(finalExpertise)}'`);

        // Map Class Saving Throw Proficiencies ("savingThroughProf") into DnD_classProficiencies
        const formattedClassProfs = savingThrows.map((st: string) => String(st).toLowerCase());
        injectYAML("DnD_classProficiencies", `'${JSON.stringify(formattedClassProfs)}'`);

        // --- Core List Variables ---
        injectListYAML("DnD_race", this.wizardData.race);
        injectListYAML("DnD_class", this.wizardData.dndClass);
        injectListYAML("DnD_subclass", this.wizardData.subclass);
        injectListYAML("DnD_languages", this.wizardData.languages);
        injectListYAML("DnD_extraFeats", this.wizardData.extraFeats);
        injectListYAML("DnD_classChosenItems", this.wizardData.classChosenItems);
        injectListYAML("DnD_backgroundChosenItems", this.wizardData.backgroundChosenItems);
        injectYAML("DnD_hideFeature", `'[]'`);

        // --- Equipment & Combat Formula variables ---
        injectYAML("DnD_weapon", this.wizardData.weapon);
        injectYAML("DnD_weaponDamage", this.wizardData.weaponDamage);
        injectYAML("DnD_armor", this.wizardData.armor);
        injectYAML("DnD_armorAc", this.wizardData.armorAc);
        injectYAML("DnD_armorAcBonus", this.wizardData.armorAcBonus);
        injectYAML("DnD_armorAcMod", this.wizardData.armorAcMod);
        injectYAML("DnD_attackRollMod", 0);
        injectYAML("DnD_unarmoredDefense", unarmoredDefense);
        injectYAML("DnD_attackStat", attackStat);

        // --- Stat variables ---
        const DnD_current_health = this.wizardData.maxHealth;
        injectYAML("DnD_maxHealth", this.wizardData.maxHealth);
        injectYAML("DnD_currentHealth", DnD_current_health);
        injectYAML("DnD_hitDice", DnD_hit_dice);
        injectYAML("DnD_speed", this.wizardData.speed);
        injectYAML("DnD_strength", strStats.final);
        injectYAML("DnD_dexterity", dexStats.final);
        injectYAML("DnD_constitution", conStats.final);
        injectYAML("DnD_intelligence", intStats.final);
        injectYAML("DnD_wisdom", wisStats.final);
        injectYAML("DnD_charisma", chaStats.final);

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

        // --- 5D. Update Stat History Table ---
        const formatTableStat = (abbr: string, stats: { base: number, bonus: number }) => {
            const baseStr = String(stats.base).padStart(2, ' ');
            const bonusStr = stats.bonus > 0 ? `+${stats.bonus}` : " - ";
            const regex = new RegExp(`\\|\\s*${abbr}\\s*\\|\\s*-\\s*\\|\\s*--->\\s*\\|`);
            finalContent = finalContent.replace(regex, `| ${abbr} |  ${baseStr}  |  ${bonusStr.padEnd(4, ' ')} |`);
        };

        formatTableStat("STR", strStats);
        formatTableStat("DEX", dexStats);
        formatTableStat("CON", conStats);
        formatTableStat("INT", intStats);
        formatTableStat("WIS", wisStats);
        formatTableStat("CHA", chaStats);

        // 6. Paste to Editor and Finalize UI State
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

// --- THE POP-UP UI ---
class NoteModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    noteKey: string;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, noteKey: string) {
        super(app);
        this.plugin = plugin;
        this.noteKey = noteKey;
    }

    async onOpen() {
        const { contentEl, titleEl } = this;

        const formattedTitle = this.noteKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        titleEl.setText(formattedTitle);

        const fetchNativeNote = (): string | null => MarkdownNotes[this.noteKey] || null;

        const fetchCustomNote = async (basePath: string): Promise<string | null> => {
            const mdPath = normalizePath(`${basePath}/markdown/${this.noteKey}.md`);
            if (await this.app.vault.adapter.exists(mdPath)) {
                try {
                    return await this.app.vault.adapter.read(mdPath);
                } catch (e) {
                    console.error(`NoteModal Error: Failed to read custom markdown at ${mdPath}`, e);
                }
            }
            return null;
        };

        // 1st & 2nd STAGE: Resolve Markdown Note with Custom Rulebook Priority
        const customBasePath = this.plugin.settings.customRulebookPath?.trim() || "";
        let fileContent: string | null = null;

        if (!customBasePath) {
            fileContent = fetchNativeNote();
        } else if (this.plugin.settings.customRulebookPriority) {
            fileContent = (await fetchCustomNote(customBasePath)) ?? fetchNativeNote();
        } else {
            fileContent = fetchNativeNote() ?? (await fetchCustomNote(customBasePath));
        }

        if (fileContent) {
            MarkdownRenderer.render(this.app, fileContent, contentEl, "", null as any);
        } else {
            contentEl.createEl("p", {
                text: `Error: Could not find "${this.noteKey}" in the bundled Markdown registry or Custom Rulebook.`,
                cls: "dnd-error-text"
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- Settings Tab UI ---
class DnDSettingsTab extends PluginSettingTab {
    plugin: DnDCharacterSheetHelperPlugin;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Triggers all open Markdown notes to re-render safely when rulebook settings change
    private refreshOpenSheets() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                const file = leaf.view.file;
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache) {
                    this.app.metadataCache.trigger('changed', file, '', cache);
                }
            }
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'D&D 5.5e Features Settings' });

        // Toggle for Combining Class & Subclass
        new Setting(containerEl)
            .setName('Combine Class and Subclass Features')
            .setDesc('If enabled, subclass features will be mixed chronologically into the main class section.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.combineClassSubclass)
                .onChange(async (value) => {
                    this.plugin.settings.combineClassSubclass = value;
                    await this.plugin.saveSettings();
                    this.refreshOpenSheets();
                    this.display();
                }));

        // --- Custom Rulebook Settings ---
        containerEl.createEl('h3', { text: 'Homebrew & Custom Data', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Add your own custom JSON files to expand or overwrite the native rulebook.', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('Custom Rulebook Folder Path')
            .setDesc('Enter the path to your custom rulebook folder within your vault (e.g., "TTRPG/My Rulebook"). Leave blank to disable.')
            .addText(text => text
                .setPlaceholder('Folder path...')
                .setValue(this.plugin.settings.customRulebookPath)
                .onChange(async (value) => {
                    this.plugin.settings.customRulebookPath = value;
                    await this.plugin.saveSettings();
                    this.refreshOpenSheets();
                }));

        new Setting(containerEl)
            .setName('Custom Rulebook Priority')
            .setDesc('If enabled, custom homebrew files will completely overwrite native files with the same name. If disabled, native files take priority.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.customRulebookPriority)
                .onChange(async (value) => {
                    this.plugin.settings.customRulebookPriority = value;
                    await this.plugin.saveSettings();
                    this.refreshOpenSheets();
                }));

        // Draggable List for Section Order
        containerEl.createEl('h3', { text: 'Section Render Order', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Drag and drop the sections below to change their display order. If "Combine Class and Subclass" is enabled, the Subclass block will be hidden.', cls: 'setting-item-description' });

        const listContainer = containerEl.createDiv({ cls: 'dnd-draggable-list' });
        let dragSource: HTMLElement | null = null;

        // Loop through our saved array to build the UI
        this.plugin.settings.sectionOrder.forEach((sectionName) => {
            if (this.plugin.settings.combineClassSubclass && sectionName === 'Subclass') return;

            const item = listContainer.createDiv({ text: sectionName, cls: 'dnd-draggable-item' });
            item.draggable = true;

            item.addEventListener('dragstart', () => {
                dragSource = item;
                item.style.opacity = '0.4';
            });

            item.addEventListener('dragover', (e) => e.preventDefault()); // Required to allow dropping

            item.addEventListener('dragenter', (e) => {
                if (e.target !== dragSource) {
                    (e.target as HTMLElement).style.border = '1px dashed var(--text-accent)';
                }
            });

            item.addEventListener('dragleave', (e) => {
                (e.target as HTMLElement).style.border = '1px solid var(--dnd-ui-color-border-primary)';
            });

            item.addEventListener('drop', async (e) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;

                if (dragSource && dragSource !== target) {
                    // Update the array order in memory
                    const fromIndex = this.plugin.settings.sectionOrder.indexOf(dragSource.innerText);
                    const toIndex = this.plugin.settings.sectionOrder.indexOf(target.innerText);

                    const [movedItem] = this.plugin.settings.sectionOrder.splice(fromIndex, 1);
                    this.plugin.settings.sectionOrder.splice(toIndex, 0, movedItem);

                    // Save and refresh UI
                    await this.plugin.saveSettings();
                    this.refreshOpenSheets();
                    this.display();
                }
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });
        });

        // --- Theme Engine UI ---
        containerEl.createEl('h3', { text: 'Appearance & Theming', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Select a preset theme or customize individual colors. Changes apply instantly.', cls: 'setting-item-description' });

        // Build the Theme Dropdown
        const themeDropdown = new Setting(containerEl)
            .setName('Theme Preset')
            .setDesc('Choose a predefined color theme.');

        themeDropdown.addDropdown(drop => {
            Object.entries(THEMES).forEach(([key, theme]) => {
                drop.addOption(key, theme.name);
            });
            drop.setValue(this.plugin.settings.selectedTheme);
            drop.onChange(async (value) => {
                const theme = THEMES[value];
                if (theme) {
                    this.plugin.settings.selectedTheme = value;
                    Object.assign(this.plugin.settings, theme.colors);
                    this.plugin.applyTheme();
                    await this.plugin.saveSettings();
                    this.display();
                }
            });
        });

        // Generate Color Pickers
        const COLOR_GROUPS: { header: string; keys: (keyof DnDPluginSettings)[] }[] = [
            { header: "Background Colors", keys: ["colorBgPrimary", "colorBgSecondary", "colorBgTertiary", "colorBgHover", "colorBgDarker", "colorBgGroup", "colorBgProficient"] },
            { header: "Text Colors", keys: ["colorTextPrimary", "colorTextSecondary", "colorTextSublabel", "colorTextBright", "colorTextMuted", "colorTextGroup"] },
            { header: "Border Colors", keys: ["colorBorderPrimary", "colorBorderActive", "colorBorderFocus"] },
            { header: "Accents", keys: ["colorAccentTeal", "colorAccentRed", "colorAccentPurple"] }
        ];

        COLOR_GROUPS.forEach(group => {
            containerEl.createEl('h4', { text: group.header, cls: 'dnd-settings-subgroup' });

            group.keys.forEach((key) => {
                const readableName = key.replace('color', '').replace(/([A-Z])/g, ' $1').trim();

                new Setting(containerEl)
                    .setName(readableName)
                    .addColorPicker(color => color
                        .setValue(this.plugin.settings[key] as string)
                        .onChange(async (value) => {
                            (this.plugin.settings as any)[key] = value;
                            this.plugin.settings.selectedTheme = "custom";
                            this.plugin.applyTheme();
                            await this.plugin.saveSettings();
                        }));
            });
        });
    }
}

// --- EQUIP ITEMS MODAL ---
class EquipItemsModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    weaponName: string = "";
    weaponDamage: string = "";
    armorName: string = "";
    armorAc: string = "";

    originalWeapon: string = "";
    originalWeaponDamage: string = "";
    originalArmor: string = "";
    originalArmorAc: string = "";

    isWeaponCustom: boolean = false;
    isArmorCustom: boolean = false;

    availableWeapons: { id: string; name: string; damage: string }[] = [];
    availableArmors: { id: string; name: string; ac: string; category: string }[] = [];

    formContainer!: HTMLElement;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Equip Items", cls: "dnd-section-header" });

        // 1. Fetch current loadout from frontmatter
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.originalWeapon = String(frontmatter["DnD_weapon"] ?? "").trim();
        this.originalWeaponDamage = String(frontmatter["DnD_weaponDamage"] ?? "").trim();
        this.originalArmor = String(frontmatter["DnD_armor"] ?? "").trim();
        this.originalArmorAc = frontmatter["DnD_armorAc"] !== undefined ? String(frontmatter["DnD_armorAc"]).trim() : "";

        this.weaponName = this.originalWeapon;
        this.weaponDamage = this.originalWeaponDamage;
        this.armorName = this.originalArmor;
        this.armorAc = this.originalArmorAc;

        // 2. Load available Weapons and Armors from native registry + custom rulebook
        await this.fetchEquipmentPools();

        // 3. Auto-detect whether the currently equipped weapon/armor is a custom item
        if (this.weaponName && this.weaponName.toLowerCase() !== "none") {
            const matchedWeapon = this.availableWeapons.find(
                w => w.name.toLowerCase() === this.weaponName.toLowerCase() || w.id.toLowerCase() === this.weaponName.toLowerCase()
            );
            if (matchedWeapon) {
                this.weaponName = matchedWeapon.name;
                this.isWeaponCustom = false;
            } else {
                this.isWeaponCustom = true;
            }
        }

        if (this.armorName && this.armorName.toLowerCase() !== "none") {
            const matchedArmor = this.availableArmors.find(
                a => a.name.toLowerCase() === this.armorName.toLowerCase() || a.id.toLowerCase() === this.armorName.toLowerCase()
            );
            if (matchedArmor) {
                this.armorName = matchedArmor.name;
                this.isArmorCustom = false;
            } else {
                this.isArmorCustom = true;
            }
        }

        // 4. Create dynamic form container & footer buttons
        this.formContainer = contentEl.createDiv();
        this.renderForm();

        const btnDiv = contentEl.createDiv({
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--dnd-ui-color-border-primary); padding-top: 15px; margin-top: 20px;" }
        });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnDiv.createEl("button", { text: "Equip Loadout", cls: "mod-cta" });
        confirmBtn.onclick = async () => {
            await this.equipItems();
        };
    }

    async fetchEquipmentPools() {
        const itemLookupKeys = new Set<string>(Object.keys(itemsMap || {}));
        const basePath = this.plugin.settings.customRulebookPath?.trim();

        if (basePath) {
            const customItemsPath = normalizePath(`${basePath}/items.json`);
            try {
                if (await this.app.vault.adapter.exists(customItemsPath)) {
                    const content = await this.app.vault.adapter.read(customItemsPath);
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === "object") {
                        Object.keys(parsed).forEach(k => itemLookupKeys.add(k));
                    }
                }
            } catch (e) {
                console.error(`EquipItemsModal: Could not read custom items.json at ${customItemsPath}`, e);
            }
        }

        const weaponsMap = new Map<string, { id: string; name: string; damage: string }>();
        const armorsMap = new Map<string, { id: string; name: string; ac: string; category: string }>();

        for (const key of itemLookupKeys) {
            const data = await getItemData(this.app, this.plugin.settings, key);
            if (!data || !data.type) continue;

            const typeLower = String(data.type).toLowerCase();
            const displayName = String(data.name || key).trim();
            const mapKey = displayName.toLowerCase();

            if (typeLower.includes("weapon")) {
                weaponsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    damage: String(data.damage || "")
                });
            } else if (typeLower.includes("armor")) {
                armorsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    ac: String(data.ac || "10"),
                    category: String(data.category || "")
                });
            }
        }

        this.availableWeapons = Array.from(weaponsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        this.availableArmors = Array.from(armorsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    renderForm() {
        this.formContainer.empty();

        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === "Enter") this.equipItems();
        };

        // Helper to build the themed pill toggle switch on the right of each field
        const createModeToggle = (parentRow: HTMLElement, isCustom: boolean, onToggle: () => void) => {
            const toggleWrap = parentRow.createDiv({
                cls: "dnd-equip-toggle-wrapper",
                attr: { title: "Switch between Rulebook Database and Custom Item" }
            });

            toggleWrap.createEl("span", {
                text: "Custom",
                cls: `dnd-equip-toggle-label ${isCustom ? "is-active" : ""}`
            });

            const switchTrack = toggleWrap.createDiv({
                cls: `dnd-toggle-switch ${isCustom ? "is-active" : ""}`
            });
            switchTrack.createDiv({ cls: "dnd-toggle-knob" });

            toggleWrap.onclick = () => onToggle();
        };

        // ==========================================
        // 1. WEAPON SECTION
        // ==========================================
        const weaponSection = this.formContainer.createDiv({ attr: { style: "margin-bottom: 18px;" } });
        weaponSection.createEl("label", {
            text: "Weapon Name:",
            attr: { style: "display: block; margin-bottom: 6px; color: var(--dnd-ui-color-text-sublabel);" }
        });

        const weaponRow = weaponSection.createDiv({ cls: "dnd-equip-row" });

        if (!this.isWeaponCustom) {
            const weaponSelect = weaponRow.createEl("select", { cls: "dnd-equip-field" });
            weaponSelect.createEl("option", { text: "-- Select a Weapon --", value: "" });
            weaponSelect.createEl("option", { text: "None (Unarmed)", value: "None" });

            this.availableWeapons.forEach(w => {
                const dmgSuffix = w.damage ? ` (${w.damage})` : "";
                weaponSelect.createEl("option", { text: `${w.name}${dmgSuffix}`, value: w.name });
            });

            weaponSelect.value = this.weaponName;
            weaponSelect.onchange = (e) => {
                this.weaponName = (e.target as HTMLSelectElement).value;
                const matched = this.availableWeapons.find(w => w.name === this.weaponName);
                if (matched) {
                    this.weaponDamage = matched.damage;
                } else if (this.weaponName === "None" || this.weaponName === "") {
                    this.weaponDamage = "";
                }
            };
        } else {
            const weaponInput = weaponRow.createEl("input", {
                type: "text",
                value: this.weaponName === "None" ? "" : this.weaponName,
                cls: "dnd-equip-field"
            });
            weaponInput.placeholder = "e.g., Sun Blade";
            weaponInput.oninput = (e) => {
                this.weaponName = (e.target as HTMLInputElement).value;
            };
            weaponInput.onkeyup = handleEnter;
        }

        createModeToggle(weaponRow, this.isWeaponCustom, () => {
            this.isWeaponCustom = !this.isWeaponCustom;
            if (!this.isWeaponCustom) {
                const matched = this.availableWeapons.find(w => w.name.toLowerCase() === this.weaponName.toLowerCase());
                this.weaponName = matched ? matched.name : "";
                this.weaponDamage = matched ? matched.damage : "";
            }
            this.renderForm();
        });

        if (this.isWeaponCustom) {
            const weaponSub = weaponSection.createDiv({ cls: "dnd-equip-custom-sub" });
            weaponSub.createEl("label", {
                text: "Weapon Damage:",
                attr: { style: "display: block; margin-bottom: 4px; font-size: 0.9em; color: var(--dnd-ui-color-text-sublabel);" }
            });
            const dmgInput = weaponSub.createEl("input", {
                type: "text",
                value: this.weaponDamage,
                cls: "dnd-equip-field"
            });
            dmgInput.placeholder = "e.g., 1d8 + 2 Radiant";
            dmgInput.oninput = (e) => {
                this.weaponDamage = (e.target as HTMLInputElement).value;
            };
            dmgInput.onkeyup = handleEnter;
        }

        // ==========================================
        // 2. ARMOR SECTION
        // ==========================================
        const armorSection = this.formContainer.createDiv({ attr: { style: "margin-bottom: 10px;" } });
        armorSection.createEl("label", {
            text: "Armor Name:",
            attr: { style: "display: block; margin-bottom: 6px; color: var(--dnd-ui-color-text-sublabel);" }
        });

        const armorRow = armorSection.createDiv({ cls: "dnd-equip-row" });

        if (!this.isArmorCustom) {
            const armorSelect = armorRow.createEl("select", { cls: "dnd-equip-field" });
            armorSelect.createEl("option", { text: "-- Select Armor --", value: "" });
            armorSelect.createEl("option", { text: "None (Unarmored)", value: "None" });

            this.availableArmors.forEach(a => {
                const catLabel = a.category ? `, ${a.category}` : "";
                armorSelect.createEl("option", { text: `${a.name} (AC ${a.ac}${catLabel})`, value: a.name });
            });

            armorSelect.value = this.armorName;
            armorSelect.onchange = (e) => {
                this.armorName = (e.target as HTMLSelectElement).value;
                const matched = this.availableArmors.find(a => a.name === this.armorName);
                if (matched) {
                    this.armorAc = matched.ac;
                } else if (this.armorName === "None" || this.armorName === "") {
                    this.armorAc = "10";
                }
            };
        } else {
            const armorInput = armorRow.createEl("input", {
                type: "text",
                value: this.armorName === "None" ? "" : this.armorName,
                cls: "dnd-equip-field"
            });
            armorInput.placeholder = "e.g., Elven Chain";
            armorInput.oninput = (e) => {
                this.armorName = (e.target as HTMLInputElement).value;
            };
            armorInput.onkeyup = handleEnter;
        }

        createModeToggle(armorRow, this.isArmorCustom, () => {
            this.isArmorCustom = !this.isArmorCustom;
            if (!this.isArmorCustom) {
                const matched = this.availableArmors.find(a => a.name.toLowerCase() === this.armorName.toLowerCase());
                this.armorName = matched ? matched.name : "";
                this.armorAc = matched ? matched.ac : "10";
            }
            this.renderForm();
        });

        if (this.isArmorCustom) {
            const armorSub = armorSection.createDiv({ cls: "dnd-equip-custom-sub" });
            armorSub.createEl("label", {
                text: "Armor AC:",
                attr: { style: "display: block; margin-bottom: 4px; font-size: 0.9em; color: var(--dnd-ui-color-text-sublabel);" }
            });
            const acInput = armorSub.createEl("input", {
                type: "number",
                value: this.armorAc,
                cls: "dnd-equip-field"
            });
            acInput.placeholder = "e.g., 16";
            acInput.oninput = (e) => {
                this.armorAc = (e.target as HTMLInputElement).value;
            };
            acInput.onkeyup = handleEnter;
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    async equipItems() {
        const updates: Record<string, any> = {};

        // 1. Process Weapon Update
        const weaponChanged = this.weaponName !== this.originalWeapon || (this.isWeaponCustom && this.weaponDamage !== this.originalWeaponDamage);
        if (weaponChanged) {
            if (!this.isWeaponCustom) {
                if (!this.weaponName || this.weaponName.toLowerCase() === "none") {
                    updates["DnD_weapon"] = "None";
                    updates["DnD_weaponDamage"] = "";
                } else {
                    const safeWeaponName = this.weaponName.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
                    const weaponData = await getItemData(this.app, this.plugin.settings, safeWeaponName);
                    updates["DnD_weapon"] = weaponData?.name || this.weaponName;
                    updates["DnD_weaponDamage"] = weaponData?.damage || "";
                }
            } else {
                const cleanCustomWeapon = this.weaponName.trim();
                updates["DnD_weapon"] = cleanCustomWeapon || "None";
                updates["DnD_weaponDamage"] = cleanCustomWeapon ? this.weaponDamage.trim() : "";
            }
        }

        // 2. Process Armor Update
        const armorChanged = this.armorName !== this.originalArmor || (this.isArmorCustom && this.armorAc !== this.originalArmorAc);
        if (armorChanged) {
            const fileCache = this.app.metadataCache.getCache(this.sourcePath);
            const frontmatter = fileCache?.frontmatter || {};
            const currentDex = Number(frontmatter["DnD_dexterity"]) || 10;
            const dexMod = Math.floor((currentDex - 10) / 2);

            let unarmoredStat = frontmatter["DnD_unarmoredDefense"] ? String(frontmatter["DnD_unarmoredDefense"]).toLowerCase().trim() : "";
            if (!unarmoredStat && frontmatter["DnD_class"]) {
                const primaryClass = Array.isArray(frontmatter["DnD_class"]) ? frontmatter["DnD_class"][0] : frontmatter["DnD_class"];
                const classData = await getClassData(this.app, this.plugin.settings, primaryClass);
                if (classData?.unarmoredDefense) {
                    unarmoredStat = String(classData.unarmoredDefense).toLowerCase().trim();
                    updates["DnD_unarmoredDefense"] = unarmoredStat;
                }
            }

            const getUnarmoredBonus = () => {
                if (unarmoredStat) {
                    const secondaryScore = Number(frontmatter[`DnD_${unarmoredStat}`]) || 10;
                    return dexMod + Math.floor((secondaryScore - 10) / 2);
                }
                return dexMod;
            };

            if (!this.isArmorCustom) {
                const safeArmorName = this.armorName.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
                const armorData = (this.armorName && this.armorName.toLowerCase() !== "none")
                    ? await getItemData(this.app, this.plugin.settings, safeArmorName)
                    : null;

                if (armorData && armorData.ac && armorData.category) {
                    const baseAc = parseInt(String(armorData.ac));
                    const category = String(armorData.category).toLowerCase();
                    let armorAcBonus = dexMod;

                    if (category.includes("light")) armorAcBonus = dexMod;
                    else if (category.includes("medium")) armorAcBonus = Math.min(dexMod, 2);
                    else if (category.includes("heavy")) armorAcBonus = 0;

                    updates["DnD_armor"] = armorData.name;
                    updates["DnD_armorAc"] = baseAc;
                    updates["DnD_armorAcBonus"] = armorAcBonus;
                } else {
                    updates["DnD_armor"] = "None";
                    updates["DnD_armorAc"] = 10;
                    updates["DnD_armorAcBonus"] = getUnarmoredBonus();
                }
            } else {
                const cleanCustomArmor = this.armorName.trim();
                const parsedCustomAc = parseInt(this.armorAc);

                if (!cleanCustomArmor || cleanCustomArmor.toLowerCase() === "none") {
                    updates["DnD_armor"] = "None";
                    updates["DnD_armorAc"] = !isNaN(parsedCustomAc) ? parsedCustomAc : 10;
                    updates["DnD_armorAcBonus"] = !isNaN(parsedCustomAc) ? 0 : getUnarmoredBonus();
                } else {
                    updates["DnD_armor"] = cleanCustomArmor;
                    updates["DnD_armorAc"] = !isNaN(parsedCustomAc) ? parsedCustomAc : 10;
                    updates["DnD_armorAcBonus"] = 0;
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);
            new Notice("Loadout equipped successfully!");
        }

        this.close();
    }
}

// --- CONSOLIDATED MANAGE CHARACTER MODAL ---
class ManageCharacterModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    // Tab Navigation State
    activeTab: "stats" | "attack" | "ac" | "skills" | "items" | "features" = "stats";

    // --- Unified Data State ---
    // 1. Stats State
    currentStats: Record<string, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    // 2. AC State
    currentAcMod: number = 0;
    // 3. Attack State
    currentAttackStat: string = "strength";
    addAttackProficiency: boolean = true;
    extraAttackMod: number = 0;
    // 4. Skills State
    currentExtraSkills: string[] = [];
    baseProficiencies: [string, string][] = [];
    allSkills = [
        "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
        "History", "Insight", "Intimidation", "Investigation", "Medicine",
        "Nature", "Perception", "Performance", "Persuasion", "Religion",
        "Sleight of Hand", "Stealth", "Survival"
    ];
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

        // Modal Dimension Lock to prevent jittering when switching tabs
        this.modalEl.style.width = "650px";
        this.modalEl.style.maxWidth = "90vw";

        contentEl.createEl("h3", { text: "Manage Character", cls: "dnd-section-header", attr: { style: "margin-bottom: 10px;" } });

        // --- FETCH ALL DATA ONCE ---
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        // Fetch Stats
        const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        statsList.forEach(stat => this.currentStats[stat] = Number(frontmatter[`DnD_${stat}`]) || 10);

        // Fetch AC
        this.currentAcMod = Number(frontmatter["DnD_armorAcMod"]) || 0;

        // Fetch Attack
        this.extraAttackMod = Number(frontmatter["DnD_attackRollMod"]) || 0;
        if (frontmatter["DnD_attackStat"]) {
            this.currentAttackStat = String(frontmatter["DnD_attackStat"]).toLowerCase().trim();
        }

        // Fetch Skills from Frontmatter Database (Force Strings)
        let profsRaw = frontmatter["DnD_skillProficiencies"] || [];
        if (typeof profsRaw === 'string') {
            try { profsRaw = JSON.parse(profsRaw); } catch { profsRaw = []; }
        }
        profsRaw.forEach((p: any) => {
            if (Array.isArray(p) && p.length > 0) {
                if (String(p[1]) === "extra") this.currentExtraSkills.push(String(p[0]).toLowerCase());
                else this.baseProficiencies.push([String(p[0]).toLowerCase(), String(p[1])]);
            } else if (typeof p === 'string') {
                this.baseProficiencies.push([String(p).toLowerCase(), "class"]); // Safe fallback for 1D arrays
            }
        });

        // Fetch Skill Bonuses from Frontmatter Database (Force Strings)
        let bonusesRaw = frontmatter["DnD_skillBonuses"] || [];
        if (typeof bonusesRaw === 'string') {
            try { bonusesRaw = JSON.parse(bonusesRaw); } catch { bonusesRaw = []; }
        }
        this.currentSkillBonuses = bonusesRaw.map((b: any) => [String(b[0]), String(b[1]), String(b[2])]);

        // Fetch Attack Proficiency toggle from frontmatter (defaults to true)
        this.addAttackProficiency = frontmatter["DnD_attackProficiency"] !== undefined
            ? Boolean(frontmatter["DnD_attackProficiency"])
            : true;

        // Fetch Hidden Features from Frontmatter Database (DnD_hideFeature)
        let hideRaw = frontmatter["DnD_hideFeature"] || [];
        if (typeof hideRaw === "string") {
            const trimmed = hideRaw.trim();
            if (trimmed.startsWith("[")) {
                try { hideRaw = JSON.parse(trimmed); } catch { hideRaw = []; }
            } else if (trimmed !== "") {
                hideRaw = trimmed.split(",").map((s: string) => s.trim());
            } else {
                hideRaw = [];
            }
        }
        if (Array.isArray(hideRaw)) {
            this.currentHiddenFeatures = hideRaw.map((f: any) => String(f).trim()).filter(Boolean);
        }

        await this.fetchAvailableFeatures(frontmatter);

        // --- BUILD TAB HEADER ---
        const tabHeader = contentEl.createDiv({ attr: { style: "display: flex; gap: 5px; flex-wrap: wrap; border-bottom: 1px solid var(--dnd-ui-color-border-primary); margin-bottom: 15px; padding-bottom: 5px;" } });

        const createTabBtn = (id: typeof this.activeTab, label: string, icon: string) => {
            const btn = tabHeader.createEl("button", { text: `${icon} ${label}`, attr: { style: "flex: 1; background: transparent; box-shadow: none; border-radius: 4px; color: var(--dnd-ui-color-text-muted);" } });
            btn.onclick = () => {
                this.activeTab = id;
                this.renderTabs(tabHeader);
                this.renderContent();
            };
            return btn;
        };

        // Rendered in the exact order requested
        createTabBtn("stats", "Ability Scores", "🖋️");
        createTabBtn("attack", "Attack Ability", "🎯");
        createTabBtn("ac", "Armor Class Mod", "🛡️");
        createTabBtn("skills", "Skills", "🔨");
        createTabBtn("items", "Items", "🎒");
        createTabBtn("features", "Hide Features", "📜");
        

        // --- FIXED CONTENT CONTAINER ---
        this.contentContainer = contentEl.createDiv({
            attr: { style: "min-height: 280px; max-height: 400px; overflow-y: auto; padding: 5px;" }
        });

        // --- FOOTER BUTTONS ---
        const btnDiv = contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid var(--dnd-ui-color-border-primary); padding-top: 15px;" } });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = btnDiv.createEl("button", { text: "Save All Changes", cls: "mod-cta" });
        saveBtn.onclick = async (e) => {
            e.preventDefault();
            await this.saveAllChanges();
        };

        // Initial Render
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

        let classChoicesRaw = frontmatter["DnD_classChoices"];
        if (typeof classChoicesRaw === "string" && classChoicesRaw.trim().startsWith("[")) {
            try { classChoicesRaw = JSON.parse(classChoicesRaw.trim()); } catch { classChoicesRaw = []; }
        }
        const classChoicesArray = Array.isArray(classChoicesRaw) ? classChoicesRaw : [];

        const classArray = Array.isArray(dndClass) ? dndClass : (dndClass ? [dndClass] : []);
        const rawSubclassArray = Array.isArray(subclass) ? subclass : (subclass ? [subclass] : []);
        const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

        let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : (extraFeats ? [extraFeats] : []);

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
                        if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                            finalExtraFeats.push(...feature.grantedFeats);
                        }
                        if (feature.hide !== true && feature.name) {
                            discovered.add(String(feature.name).trim());
                        }
                    }
                }

                // Class Choices at this level
                for (const choiceTuple of classChoicesArray) {
                    let choiceKey = "";
                    let choiceLevel = 0;
                    if (Array.isArray(choiceTuple)) {
                        if (choiceTuple.length === 3) [, choiceKey, choiceLevel] = choiceTuple;
                        else if (choiceTuple.length === 2) [choiceKey, choiceLevel] = choiceTuple;
                    }
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
                            if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                finalExtraFeats.push(...feature.grantedFeats);
                            }
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
            if (raceData && Array.isArray(raceData.traits)) {
                for (const trait of raceData.traits) {
                    if (trait.hide === true || !trait.name) continue;
                    if (trait.lineage) {
                        if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) continue;
                    }
                    discovered.add(String(trait.name).trim());
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

    renderTabs(tabHeader: HTMLElement) {
        const buttons = tabHeader.querySelectorAll("button");
        const tabs = ["stats", "attack", "ac", "skills", "items", "features"];

        buttons.forEach((btn, index) => {
            if (tabs[index] === this.activeTab) {
                btn.style.background = "var(--dnd-ui-color-bg-tertiary)";
                btn.style.color = "var(--dnd-ui-color-text-bright)";
                btn.style.fontWeight = "bold";
                btn.style.border = "1px solid var(--dnd-ui-color-border-active)";
            } else {
                btn.style.background = "transparent";
                btn.style.color = "var(--dnd-ui-color-text-muted)";
                btn.style.fontWeight = "normal";
                btn.style.border = "1px solid transparent";
            }
        });
    }

    renderContent() {
        this.contentContainer.empty();

        if (this.activeTab === "stats") {
            this.contentContainer.createEl("h4", { text: "Base Ability Scores", attr: { style: "margin-top: 0; color: var(--dnd-ui-color-text-bright);" } });
            const statsGrid = this.contentContainer.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;" } });

            const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
            statsList.forEach(stat => {
                const statDiv = statsGrid.createDiv();
                const displayStat = stat.charAt(0).toUpperCase() + stat.slice(1);
                statDiv.createEl("label", { text: displayStat, attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });

                const statInput = statDiv.createEl("input", { type: "number", value: String(this.currentStats[stat]) });
                statInput.style.width = "100%";
                statInput.oninput = (e) => this.currentStats[stat] = Number((e.target as HTMLInputElement).value);
            });
        }

        else if (this.activeTab === "attack") {
            this.contentContainer.createEl("h4", { text: "Attack Roll Formula", attr: { style: "margin-top: 0; color: var(--dnd-ui-color-text-bright);" } });

            const statDiv = this.contentContainer.createDiv({ attr: { style: "margin-bottom: 12px;" } });
            statDiv.createEl("label", { text: "Base Attack Ability:", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
            const selectEl = statDiv.createEl("select", { attr: { style: "width: 100%;" } });
            const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
            stats.forEach(stat => selectEl.createEl("option", { text: stat.charAt(0).toUpperCase() + stat.slice(1), value: stat }));
            selectEl.value = this.currentAttackStat;
            selectEl.onchange = (e) => this.currentAttackStat = (e.target as HTMLSelectElement).value;

            const profDiv = this.contentContainer.createDiv({ attr: { style: "display: flex; align-items: center; gap: 10px; margin-bottom: 12px;" } });
            const profToggle = profDiv.createEl("input", { type: "checkbox" });
            profToggle.checked = this.addAttackProficiency;
            profToggle.onchange = (e) => this.addAttackProficiency = (e.target as HTMLInputElement).checked;
            profDiv.createEl("label", { text: "Add Proficiency Bonus", attr: { style: "color: var(--dnd-ui-color-text-primary);" } });

            const modDiv = this.contentContainer.createDiv({ attr: { style: "margin-bottom: 12px;" } });
            modDiv.createEl("label", { text: "Extra Modifier (Magic Weapons, Buffs):", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
            const modInput = modDiv.createEl("input", { type: "number", value: String(this.extraAttackMod), attr: { style: "width: 100%;" } });
            modInput.oninput = (e) => this.extraAttackMod = Number((e.target as HTMLInputElement).value);
        }

        else if (this.activeTab === "ac") {
            this.contentContainer.createEl("h4", { text: "Armor Class Adjustments", attr: { style: "margin-top: 0; color: var(--dnd-ui-color-text-bright);" } });

            const inputDiv = this.contentContainer.createDiv({ attr: { style: "margin-bottom: 15px;" } });
            inputDiv.createEl("label", { text: "Miscellaneous AC Modifier (Shields, Buffs):", attr: { style: "display: block; margin-bottom: 4px; color: var(--dnd-ui-color-text-sublabel);" } });
            const inputEl = inputDiv.createEl("input", { type: "number", value: String(this.currentAcMod), attr: { style: "width: 100%;" } });
            inputEl.oninput = (e) => this.currentAcMod = Number((e.target as HTMLInputElement).value);

            this.contentContainer.createEl("p", { text: "Note: Your Base AC and Dexterity limits are automatically calculated based on your equipped armor and ability scores.", attr: { style: "color: var(--dnd-ui-color-text-muted); font-size: 0.9em; font-style: italic;" } });
        }

        else if (this.activeTab === "skills") {
            this.contentContainer.createEl("h4", { text: "Additional Skill Proficiencies", attr: { style: "margin-top: 0; color: var(--dnd-ui-color-text-bright);" } });

            const listDiv = this.contentContainer.createDiv({ attr: { style: "margin-bottom: 15px; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;" } });
            if (this.currentExtraSkills.length === 0) {
                listDiv.createEl("p", { text: "No extra skills added.", attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; margin: 0; text-align: center; padding: 10px;" } });
            } else {
                this.currentExtraSkills.forEach((skill, index) => {
                    const row = listDiv.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: center; background: var(--dnd-ui-color-bg-tertiary); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });
                    row.createEl("span", { text: skill.replace(/\b\w/g, c => c.toUpperCase()), attr: { style: "color: var(--dnd-ui-color-text-bright); font-weight: 500;" } });

                    const delBtn = row.createEl("button", { text: "✕", attr: { style: "width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; box-shadow: none; color: var(--dnd-ui-color-text-muted);" } });
                    delBtn.onmouseenter = () => { delBtn.style.background = "var(--dnd-ui-color-accent-red)"; delBtn.style.color = "white"; };
                    delBtn.onmouseleave = () => { delBtn.style.background = "transparent"; delBtn.style.color = "var(--dnd-ui-color-text-muted)"; };
                    delBtn.onclick = () => {
                        this.currentExtraSkills.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ attr: { style: "display: flex; gap: 10px;" } });
            const selectEl = addDiv.createEl("select", { attr: { style: "flex: 1;" } });
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
        }
        else if (this.activeTab === "items") {
            this.contentContainer.createEl("h4", { text: "Skill Bonuses (Magic Items & Gear)", attr: { style: "margin-top: 0; color: var(--dnd-ui-color-text-bright);" } });

            // A. Display existing bonuses
            const listDiv = this.contentContainer.createDiv({ attr: { style: "margin-bottom: 15px; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;" } });
            if (this.currentSkillBonuses.length === 0) {
                listDiv.createEl("p", { text: "No item bonuses added.", attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; margin: 0; text-align: center; padding: 10px;" } });
            } else {
                this.currentSkillBonuses.forEach((bonus, index) => {
                    const row = listDiv.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: center; background: var(--dnd-ui-color-bg-tertiary); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });

                    const name = bonus[0];
                    const skill = bonus[1].replace(/\b\w/g, c => c.toUpperCase());
                    const val = Number(bonus[2]) > 0 ? `+${bonus[2]}` : `${bonus[2]}`;

                    row.createEl("span", { text: `${name}: ${val} to ${skill}`, attr: { style: "color: var(--dnd-ui-color-text-bright); font-weight: 500;" } });

                    const delBtn = row.createEl("button", { text: "✕", attr: { style: "width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; box-shadow: none; color: var(--dnd-ui-color-text-muted);" } });
                    delBtn.onmouseenter = () => { delBtn.style.background = "var(--dnd-ui-color-accent-red)"; delBtn.style.color = "white"; };
                    delBtn.onmouseleave = () => { delBtn.style.background = "transparent"; delBtn.style.color = "var(--dnd-ui-color-text-muted)"; };
                    delBtn.onclick = () => {
                        this.currentSkillBonuses.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            // B. Add new bonus form
            const addDiv = this.contentContainer.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center;" } });

            const nameInput = addDiv.createEl("input", { type: "text", attr: { style: "flex: 2;", placeholder: "Item Name (e.g. Cloak)" } });

            const selectEl = addDiv.createEl("select", { attr: { style: "flex: 2;" } });
            selectEl.createEl("option", { text: "-- Skill --", value: "" });
            this.allSkills.forEach(s => selectEl.createEl("option", { text: s, value: s.toLowerCase() }));

            const valInput = addDiv.createEl("input", { type: "number", attr: { style: "flex: 1;", placeholder: "+ Val" } });

            const addBtn = addDiv.createEl("button", { text: "Add" });
            addBtn.onclick = () => {
                if (nameInput.value && selectEl.value && valInput.value) {
                    this.currentSkillBonuses.push([nameInput.value, selectEl.value, String(valInput.value)]);
                    this.renderContent();
                }
            };
        }
        else if (this.activeTab === "features") {
            this.contentContainer.createEl("h4", { text: "Hidden Character Features", attr: { style: "margin-top: 0; color: var(--dnd-ui-color-text-bright);" } });

            const listDiv = this.contentContainer.createDiv({ attr: { style: "margin-bottom: 15px; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;" } });
            if (this.currentHiddenFeatures.length === 0) {
                listDiv.createEl("p", { text: "No features are currently hidden.", attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; margin: 0; text-align: center; padding: 10px;" } });
            } else {
                this.currentHiddenFeatures.forEach((featName, index) => {
                    const row = listDiv.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: center; background: var(--dnd-ui-color-bg-tertiary); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });
                    row.createEl("span", { text: featName, attr: { style: "color: var(--dnd-ui-color-text-bright); font-weight: 500;" } });

                    const delBtn = row.createEl("button", { text: "✕", attr: { title: "Unhide Feature", style: "width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; box-shadow: none; color: var(--dnd-ui-color-text-muted);" } });
                    delBtn.onmouseenter = () => { delBtn.style.background = "var(--dnd-ui-color-accent-red)"; delBtn.style.color = "white"; };
                    delBtn.onmouseleave = () => { delBtn.style.background = "transparent"; delBtn.style.color = "var(--dnd-ui-color-text-muted)"; };
                    delBtn.onclick = () => {
                        this.currentHiddenFeatures.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ attr: { style: "display: flex; gap: 10px;" } });
            const selectEl = addDiv.createEl("select", { attr: { style: "flex: 1;" } });
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

        // 2. Process Dynamic Armor AC Bonus (based on new Dex & Unarmored Defense!)
        const currentArmor = frontmatter["DnD_armor"] || "";
        const newDexMod = Math.floor((this.currentStats.dexterity - 10) / 2);
        let armorAcBonus = newDexMod;
        let isUnarmored = true;

        if (currentArmor && currentArmor.toLowerCase() !== "none") {
            const safeArmorName = currentArmor.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
            const armorData = await getItemData(this.app, this.plugin.settings, safeArmorName);

            if (armorData && armorData.category) {
                isUnarmored = false;
                const category = String(armorData.category).toLowerCase();
                if (category.includes("light")) armorAcBonus = newDexMod;
                else if (category.includes("medium")) armorAcBonus = Math.min(newDexMod, 2);
                else if (category.includes("heavy")) armorAcBonus = 0;
            } else if (Number(frontmatter["DnD_armorAc"]) > 10) {
                isUnarmored = false;
            }
        }

        if (isUnarmored) {
            let unarmoredStat = frontmatter["DnD_unarmoredDefense"] ? String(frontmatter["DnD_unarmoredDefense"]).toLowerCase().trim() : "";
            if (!unarmoredStat && frontmatter["DnD_class"]) {
                const primaryClass = Array.isArray(frontmatter["DnD_class"]) ? frontmatter["DnD_class"][0] : frontmatter["DnD_class"];
                const classData = await getClassData(this.app, this.plugin.settings, primaryClass);
                if (classData?.unarmoredDefense) {
                    unarmoredStat = String(classData.unarmoredDefense).toLowerCase().trim();
                    updates["DnD_unarmoredDefense"] = unarmoredStat;
                }
            }
            if (unarmoredStat && this.currentStats[unarmoredStat] !== undefined) {
                armorAcBonus = newDexMod + Math.floor((this.currentStats[unarmoredStat] - 10) / 2);
            }
        }

        updates["DnD_armorAcBonus"] = armorAcBonus;
        updates["DnD_armorAcMod"] = this.currentAcMod;
        updates["DnD_attackRollMod"] = this.extraAttackMod;
        updates["DnD_attackStat"] = this.currentAttackStat;
        updates["DnD_attackProficiency"] = this.addAttackProficiency;

        // 3. Process Skills Database
        const combinedProficiencies = [...this.baseProficiencies];
        this.currentExtraSkills.forEach(s => combinedProficiencies.push([s, "extra"]));
        updates["DnD_skillProficiencies"] = JSON.stringify(combinedProficiencies);

        // 4. Process Item Bonuses Database
        updates["DnD_skillBonuses"] = JSON.stringify(this.currentSkillBonuses);

        // 5. Process Hidden Features Database
        updates["DnD_hideFeature"] = JSON.stringify(this.currentHiddenFeatures);

        // --- EXECUTE FRONTMATTER SAVE ---
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);

        // --- EXECUTE MASS MARKDOWN REPLACEMENT ---
        const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
        if (file instanceof TFile) {
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

                const bonusRegex = /(bonuses:\s*\n)([\s\S]*?)(?=\n```)/;
                updatedContent = updatedContent.replace(bonusRegex, `$1${bonusInject}`);

                let profInject = "";
                if (cSkills.length > 0) profInject += `  #Class\n${cSkills.join('\n')}\n`;
                if (bSkills.length > 0) profInject += `  #Background\n${bSkills.join('\n')}\n`;
                if (eSkills.length > 0) profInject += `  #Extra\n${eSkills.join('\n')}\n`;
                if (profInject === "") profInject = "  - <chosen skills>\n";

                const profRegex = /(```(?:dnd-)?skills[\s\S]*?proficiencies:\s*\n)([\s\S]*?)(?=\n[ \t]*expertise:)/;
                updatedContent = updatedContent.replace(profRegex, `$1${profInject}`);

                // C. Update Stat History Table
                const colMap: Record<number, number> = { 4: 4, 6: 5, 8: 5, 10: 6, 12: 6, 14: 7, 16: 7, 19: 8 };
                const targetCol = colMap[Number(frontmatter["DnD_level"])];
                if (targetCol !== undefined) {
                    const abbreviations: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
                    Object.keys(this.currentStats).forEach(stat => {
                        const abbr = abbreviations[stat];
                        const newVal = String(this.currentStats[stat]).padStart(2, ' ');
                        const rowRegex = new RegExp(`(\\|\\s*${abbr}\\s*\\|[^\\n]+)`);
                        updatedContent = updatedContent.replace(rowRegex, (match) => {
                            const cells = match.split('|');
                            if (cells.length > targetCol) cells[targetCol] = `  ${newVal}   `;
                            return cells.join('|');
                        });
                    });
                }

                return updatedContent;
            });
        }

        new Notice("Character updated successfully!");
        this.close();
    }
}

// --- LEVEL UP MODAL ---
class LevelUpModal extends Modal {
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

    // ASI & Feat Tracking
    isAsiLevel: boolean = false;
    asiChoice: "asi" | "feat" = "asi";
    asiStat1: string = "";
    asiStat2: string = "";
    chosenFeat: string = "";
    availableFeats: Record<string, string> = {};
    currentStats: Record<string, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

    classChoicesState: { router: string, key: string, level: number, domIndex: number }[] = [];
    // Tracks purely additive Expertise gained at this specific level
    newExpertiseChoices: string[] = [];
    newGrantedExpertiseCount: number = 0;
    expertisePool: string[] = []; // Tracks the allowed JSON pool

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

        const conScore = Number(frontmatter["DnD_constitution"]) || 10;
        this.conMod = Math.floor((conScore - 10) / 2);

        // Fetch primary class and existing subclass safely (supporting both DnD_subclass and DnD_Subclass)
        const classVal = frontmatter["DnD_class"];
        this.dndClass = (Array.isArray(classVal) ? classVal[0] : classVal) || "";

        this.subclassFmKey = frontmatter["DnD_subclass"] !== undefined
            ? "DnD_subclass"
            : (frontmatter["DnD_Subclass"] !== undefined ? "DnD_Subclass" : "DnD_subclass");
        const subclassVal = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        this.currentSubclass = (Array.isArray(subclassVal) ? subclassVal[0] : subclassVal) || "";

        const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        statsList.forEach(s => {
            this.currentStats[s] = Number(frontmatter[`DnD_${s}`]) || 10;
        });

        // 2. Fetch the Hit Die dynamically from the rulebook JSON
        let classData: any = null;
        if (this.dndClass) {
            classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData) {
                const hdStr = classData.HitDice || classData.hitDice || classData.hit_dice;
                if (hdStr) {
                    const parsed = parseInt(String(hdStr).replace(/\D/g, ''));
                    if (!isNaN(parsed)) this.hitDie = parsed;
                }
            }
        }

        // --- Build UI ---
        contentEl.createEl("p", {
            text: `Advancing from Level ${this.currentLevel} to Level ${this.newLevel}.`,
            attr: { style: "color: var(--dnd-ui-color-text-bright); font-weight: bold;" }
        });

        // A. Hit Points Section
        const hpDiv = contentEl.createDiv({ attr: { style: "margin-bottom: 20px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px;" } });
        hpDiv.createEl("label", {
            text: `New Max HP (Hit Die: d${this.hitDie}, CON: ${this.conMod > 0 ? '+' : ''}${this.conMod}):`,
            attr: { style: "display: block; margin-bottom: 8px; color: var(--dnd-ui-color-text-sublabel);" }
        });

        const hpInputContainer = hpDiv.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center;" } });
        const hpInput = hpInputContainer.createEl("input", { type: "number", value: String(this.newMaxHealth) });
        hpInput.style.flex = "1";

        const averageHpGain = Math.ceil(this.hitDie / 2) + 1 + this.conMod;
        const avgBtn = hpInputContainer.createEl("button", { text: `Take Average (+${averageHpGain})` });
        avgBtn.onclick = () => {
            this.newMaxHealth = this.currentMaxHealth + averageHpGain;
            hpInput.value = String(this.newMaxHealth);
        };

        hpInput.addEventListener('input', (e) => {
            this.newMaxHealth = Number((e.target as HTMLInputElement).value);
        });

        // B. Dynamic Subclass Section (Driven by "grantedSubclasses" in Class JSON at this.newLevel)
        const targetLevel = this.newLevel.toString();
        let newlyGrantedSubclassFile: string | null = null;
        let grantedSubclassFeatureName = "Subclass";

        const newLevelClassFeatures = classData?.features?.[targetLevel];
        if (Array.isArray(newLevelClassFeatures)) {
            for (const feature of newLevelClassFeatures) {
                if (feature.grantedSubclasses && typeof feature.grantedSubclasses === "string") {
                    newlyGrantedSubclassFile = feature.grantedSubclasses.trim();
                    if (feature.name) grantedSubclassFeatureName = String(feature.name);
                    break;
                }
            }
        }

        if (newlyGrantedSubclassFile) {
            const subDiv = contentEl.createDiv({ attr: { style: "margin-bottom: 20px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-active);" } });
            subDiv.createEl("label", {
                text: `Level ${this.newLevel} ${grantedSubclassFeatureName} (Select Subclass):`,
                attr: { style: "display: block; margin-bottom: 8px; font-weight: bold; color: var(--dnd-ui-color-text-secondary);" }
            });

            const subSelect = subDiv.createEl("select");
            subSelect.style.width = "100%";
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

        // C. Container for Dynamic Class/Subclass Milestones (Choices, Expertise, ASI/Feats)
        this.milestonesContainer = contentEl.createDiv();
        await this.renderDynamicMilestones(classData, frontmatter);

        // D. Finalization Buttons
        const btnDiv = contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 10px;" } });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnDiv.createEl("button", { text: "Complete Level Up", cls: "mod-cta" });
        confirmBtn.onclick = async (e) => {
            e.preventDefault();
            await this.executeLevelUp();
        };
    }

    async renderDynamicMilestones(classData: any, frontmatter: Record<string, any>) {
        this.milestonesContainer.empty();

        this.isAsiLevel = false;
        this.newGrantedExpertiseCount = 0;
        this.expertisePool = [];
        this.classChoicesState = [];
        this.newExpertiseChoices = [];

        const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        const slotsByRouter: Record<string, number> = {};
        const targetLevel = this.newLevel.toString();

        if (classData) {
            let subclassData: any = null;
            const activeSubclassFile = this.plugin.findGrantedSubclass(classData, this.newLevel);
            if (this.currentSubclass && activeSubclassFile) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, activeSubclassFile, this.currentSubclass);
            }

            let levelFeatures: any[] = [];
            if (classData?.features?.[targetLevel]) levelFeatures = levelFeatures.concat(classData.features[targetLevel]);
            if (subclassData?.[targetLevel]) levelFeatures = levelFeatures.concat(subclassData[targetLevel]);

            for (const feature of levelFeatures) {
                if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                    if (feature.grantedFeats.includes("ability-score-improvement")) this.isAsiLevel = true;
                }

                if (feature.classChoices && Array.isArray(feature.classChoices)) {
                    for (const router of feature.classChoices) {
                        if (!slotsByRouter[router]) slotsByRouter[router] = 0;
                        slotsByRouter[router] += 1;
                    }
                }

                if (feature.grantedExpertise && Array.isArray(feature.grantedExpertise) && feature.grantedExpertise.length === 2) {
                    this.expertisePool = [...new Set([...this.expertisePool, ...feature.grantedExpertise[0]])];
                    this.newGrantedExpertiseCount += feature.grantedExpertise[1] as number;
                }
            }
        }

        // 1. Class Choices Snapshot Engine
        let existingChoicesRaw = frontmatter["DnD_classChoices"] || [];
        if (typeof existingChoicesRaw === 'string') {
            try { existingChoicesRaw = JSON.parse(existingChoicesRaw); } catch { existingChoicesRaw = []; }
        }
        const existingChoices: { router: string | null; key: string; level: number }[] = [];
        for (const c of (Array.isArray(existingChoicesRaw) ? existingChoicesRaw : [])) {
            if (Array.isArray(c) && c.length === 3) {
                existingChoices.push({ router: String(c[0]), key: String(c[1]), level: Number(c[2]) });
            } else if (Array.isArray(c) && c.length === 2) {
                existingChoices.push({ router: null, key: String(c[0]), level: Number(c[1]) });
            }
        }

        for (const [routerName, slotCount] of Object.entries(slotsByRouter)) {
            const routerData = await getClassChoiceData(this.app, this.plugin.settings, routerName);

            if (routerData) {
                const routerDiv = this.milestonesContainer.createDiv({ attr: { style: "margin-bottom: 20px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });
                const displayName = routerName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                routerDiv.createEl("label", { text: `Manage ${displayName} (${slotCount} Slots)`, attr: { style: "display: block; margin-bottom: 8px; font-weight: bold; color: var(--dnd-ui-color-text-secondary);" } });
                routerDiv.createEl("small", { text: "Review your choices. If you wish to swap an old choice, select a new one.", attr: { style: "display: block; margin-bottom: 12px; color: var(--dnd-ui-color-text-muted);" } });

                const pastChoicesForRouter = existingChoices.filter((c) =>
                    c.router === routerName || (c.router === null && routerData[c.key])
                );

                for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
                    const selectDiv = routerDiv.createDiv({ attr: { style: "margin-bottom: 8px; display: flex; align-items: center;" } });

                    let assignedKey = "";
                    let originalLevel = this.newLevel;

                    const pastChoice = pastChoicesForRouter[slotIndex];
                    if (pastChoice) {
                        assignedKey = pastChoice.key;
                        originalLevel = pastChoice.level;
                    }

                    selectDiv.createEl("small", { text: `Lvl ${originalLevel} Slot:`, attr: { style: "flex: 0 0 90px; color: var(--dnd-ui-color-text-sublabel);" } });

                    const selectEl = selectDiv.createEl("select", { attr: { style: "flex: 1; min-width: 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" } });
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
            const expDiv = this.milestonesContainer.createDiv({ attr: { style: "margin-bottom: 20px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-primary);" } });
            expDiv.createEl("label", { text: `New Expertise Granted (${this.newGrantedExpertiseCount} Choices)`, attr: { style: "display: block; margin-bottom: 8px; font-weight: bold; color: var(--dnd-ui-color-text-secondary);" } });
            expDiv.createEl("small", { text: "Select from your known proficiencies to gain Expertise.", attr: { style: "display: block; margin-bottom: 12px; color: var(--dnd-ui-color-text-muted);" } });

            let existingProfsRaw = frontmatter["DnD_skillProficiencies"] || [];
            if (typeof existingProfsRaw === 'string') try { existingProfsRaw = JSON.parse(existingProfsRaw); } catch { existingProfsRaw = []; }

            let knownSkills: string[] = [];
            (Array.isArray(existingProfsRaw) ? existingProfsRaw : []).forEach((p: any) => {
                if (Array.isArray(p) && p.length > 0) knownSkills.push(p[0]);
                else if (typeof p === 'string') knownSkills.push(p);
            });

            if (this.expertisePool.length > 0) {
                knownSkills = knownSkills.filter((s: string) => this.expertisePool.map(e => String(e).toLowerCase()).includes(String(s).toLowerCase()));
            }

            let existingExpRaw = frontmatter["DnD_skillExpertise"] || [];
            if (typeof existingExpRaw === 'string') try { existingExpRaw = JSON.parse(existingExpRaw); } catch { existingExpRaw = []; }
            const currentExpertise = (Array.isArray(existingExpRaw) ? existingExpRaw : []).map((e: any) => String(e[0]).toLowerCase());

            knownSkills = knownSkills.filter(s => !currentExpertise.includes(String(s).toLowerCase()));
            this.newExpertiseChoices = Array(this.newGrantedExpertiseCount).fill("");

            if (knownSkills.length === 0) {
                expDiv.createEl("p", { text: "You have no eligible skill proficiencies available to gain Expertise in.", attr: { style: "color: var(--dnd-ui-color-accent-red); font-style: italic; font-size: 0.9em;" } });
            } else {
                for (let i = 0; i < this.newGrantedExpertiseCount; i++) {
                    const selectDiv = expDiv.createDiv({ attr: { style: "margin-bottom: 8px; display: flex; align-items: center;" } });

                    selectDiv.createEl("small", { text: `Choice ${i + 1}:`, attr: { style: "flex: 0 0 65px; color: var(--dnd-ui-color-text-sublabel);" } });
                    const selectEl = selectDiv.createEl("select", { attr: { style: "flex: 1;" } });
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

        // 3. Render ASI / Feat UI
        if (this.isAsiLevel) {
            const loadedGeneralFeats = await getFeatMapData(this.app, this.plugin.settings, "general-feats");
            if (loadedGeneralFeats && typeof loadedGeneralFeats === "object") {
                this.availableFeats = loadedGeneralFeats;
            }

            const asiDiv = this.milestonesContainer.createDiv({ attr: { style: "margin-bottom: 20px; padding: 10px; background: var(--dnd-ui-color-bg-tertiary); border-radius: 6px; border: 1px solid var(--dnd-ui-color-border-active);" } });

            asiDiv.createEl("label", { text: `Level ${this.newLevel} Milestone: Ability Score Improvement or Feat`, attr: { style: "display: block; margin-bottom: 8px; color: var(--dnd-ui-color-text-secondary); font-weight: bold;" } });

            const choiceSelect = asiDiv.createEl("select", { attr: { style: "width: 100%; margin-bottom: 10px;" } });
            choiceSelect.createEl("option", { text: "Ability Score Improvement (+2 / +1 & +1)", value: "asi" });
            choiceSelect.createEl("option", { text: "Take a General Feat", value: "feat" });

            this.asiChoice = "asi";

            const asiContainer = asiDiv.createDiv({ attr: { style: `display: grid; grid-template-columns: 1fr 1fr; gap: 10px;` } });
            const statSelect1 = asiContainer.createEl("select", { attr: { style: "width: 100%;" } });
            const statSelect2 = asiContainer.createEl("select", { attr: { style: "width: 100%;" } });
            statSelect1.createEl("option", { text: "-- +1 Stat --", value: "" });
            statSelect2.createEl("option", { text: "-- +1 Stat --", value: "" });

            statsList.forEach(s => {
                const label = s.charAt(0).toUpperCase() + s.slice(1) + ` (${this.currentStats[s]})`;
                statSelect1.createEl("option", { text: label, value: s });
                statSelect2.createEl("option", { text: label, value: s });
            });
            statSelect1.onchange = (e) => this.asiStat1 = (e.target as HTMLSelectElement).value;
            statSelect2.onchange = (e) => this.asiStat2 = (e.target as HTMLSelectElement).value;

            const featContainer = asiDiv.createDiv({ attr: { style: `display: none;` } });
            const featSelect = featContainer.createEl("select", { attr: { style: "width: 100%;" } });
            featSelect.createEl("option", { text: "-- Select a Feat --", value: "" });
            Object.entries(this.availableFeats).forEach(([key, name]) => {
                featSelect.createEl("option", { text: name as string, value: key });
            });
            featSelect.onchange = (e) => this.chosenFeat = (e.target as HTMLSelectElement).value;

            choiceSelect.onchange = (e) => {
                this.asiChoice = (e.target as HTMLSelectElement).value as "asi" | "feat";
                asiContainer.style.display = this.asiChoice === "asi" ? "grid" : "none";
                featContainer.style.display = this.asiChoice === "feat" ? "block" : "none";
            };

            asiDiv.createEl("small", { text: "Tip: If you boost Constitution, manually adjust your Max HP above to retroactively include +1 HP per level!", attr: { style: "display: block; margin-top: 8px; color: var(--dnd-ui-color-text-muted);" } });
        }

        if (this.classChoicesState.length > 0 || this.newGrantedExpertiseCount > 0) {
            this.milestonesContainer.createEl("p", {
                text: "Note: Please consult the rulebook regarding swapping choices. Generally, you may only replace one existing choice when you gain a level in a class.",
                attr: { style: "color: var(--dnd-ui-color-text-muted); font-size: 0.85em; font-style: italic; margin-bottom: 15px;" }
            });
        }
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

        // Fetch Class JSON for Proficiency Bonus Progression & Spell Slot Progression
        if (this.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData) {
                const lvlIdx = Math.max(0, this.newLevel - 1);
                if (Array.isArray(classData.proficiencyBonus) && classData.proficiencyBonus[lvlIdx] !== undefined) {
                    DnD_proficiency_bonus = Number(classData.proficiencyBonus[lvlIdx]) || DnD_proficiency_bonus;
                }

                if (classData.spellcasting) {
                    const newSpellData = classData.spellcasting[this.newLevel.toString()];
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

        updates["DnD_proficiencyBonus"] = DnD_proficiency_bonus;

        // Snapshot Output: Map down to [Key, Level] strictly as strings (2-part tuple)
        const finalClassChoices = this.classChoicesState
            .filter(c => c.key !== "")
            .map(c => [String(c.key), String(c.level)]);

        if (this.classChoicesState.length > 0) {
            updates["DnD_classChoices"] = JSON.stringify(finalClassChoices);
        }

        // Purely Additive Expertise Output (using strings in arrays)
        let existingExpRaw = frontmatter["DnD_skillExpertise"] || [];
        if (typeof existingExpRaw === 'string') try { existingExpRaw = JSON.parse(existingExpRaw); } catch { existingExpRaw = []; }

        const finalExpertise = (Array.isArray(existingExpRaw) ? existingExpRaw : []).map((e: any) => Array.isArray(e) ? [String(e[0]), String(e[1])] : e);

        this.newExpertiseChoices.forEach(choice => {
            if (choice) {
                finalExpertise.push([String(choice), String(this.newLevel)]);
            }
        });

        if (finalExpertise.length > 0) updates["DnD_skillExpertise"] = JSON.stringify(finalExpertise);

        // --- Handle ASI / Feats & Recalculate AC Bonus if Stats Changed ---
        if (this.isAsiLevel) {
            if (this.asiChoice === "asi") {
                if (this.asiStat1) this.currentStats[this.asiStat1] += 1;
                if (this.asiStat2) this.currentStats[this.asiStat2] += 1;

                Object.keys(this.currentStats).forEach(s => updates[`DnD_${s}`] = this.currentStats[s]);

                // Recalculate AC Bonus in case Dexterity or Unarmored Defense stat increased
                const currentArmor = frontmatter["DnD_armor"] || "";
                const newDexMod = Math.floor((this.currentStats.dexterity - 10) / 2);
                let armorAcBonus = newDexMod;
                let isUnarmored = true;

                if (currentArmor && currentArmor.toLowerCase() !== "none") {
                    const safeArmorName = currentArmor.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
                    const armorData = await getItemData(this.app, this.plugin.settings, safeArmorName);

                    if (armorData && armorData.category) {
                        isUnarmored = false;
                        const category = String(armorData.category).toLowerCase();
                        if (category.includes("light")) armorAcBonus = newDexMod;
                        else if (category.includes("medium")) armorAcBonus = Math.min(newDexMod, 2);
                        else if (category.includes("heavy")) armorAcBonus = 0;
                    } else if (Number(frontmatter["DnD_armorAc"]) > 10) {
                        isUnarmored = false;
                    }
                }

                if (isUnarmored) {
                    const unarmoredStat = frontmatter["DnD_unarmoredDefense"] ? String(frontmatter["DnD_unarmoredDefense"]).toLowerCase().trim() : "";
                    if (unarmoredStat && this.currentStats[unarmoredStat] !== undefined) {
                        armorAcBonus = newDexMod + Math.floor((this.currentStats[unarmoredStat] - 10) / 2);
                    }
                }
                updates["DnD_armorAcBonus"] = armorAcBonus;
            }
            else if (this.asiChoice === "feat" && this.chosenFeat) {
                let existingFeats = frontmatter["DnD_extraFeats"];
                if (!Array.isArray(existingFeats)) {
                    existingFeats = existingFeats ? [existingFeats] : [];
                }
                updates["DnD_extraFeats"] = [...existingFeats, this.chosenFeat];
            }
        }

        // 1. Thread-safe Frontmatter Update
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);

        // 2. Thread-safe Markdown String Update (Expertise & ASI Table)
        const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
        if (file instanceof TFile) {
            await this.app.vault.process(file, (content) => {
                let updatedContent = content;

                // A. Rewrite Expertise in skills block
                if (finalExpertise.length > 0) {
                    const expInject = finalExpertise.map((e: any) => `  - ${e[0]}`).join('\n') + '\n';
                    const expRegex = /(expertise:\s*\n)([\s\S]*?)(?=\n[ \t]*half_proficiencies:)/;
                    updatedContent = updatedContent.replace(expRegex, `$1${expInject}`);
                }

                // B. Update Stat History Table if ASI was taken
                if (this.isAsiLevel && this.asiChoice === "asi") {
                    const colMap: Record<number, number> = { 4: 4, 6: 5, 8: 5, 10: 6, 12: 6, 14: 7, 16: 7, 19: 8 };
                    const targetCol = colMap[this.newLevel];

                    if (targetCol !== undefined) {
                        const abbreviations: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };

                        Object.keys(this.currentStats).forEach(stat => {
                            const abbr = abbreviations[stat];
                            const newVal = String(this.currentStats[stat]).padStart(2, ' ');
                            const rowRegex = new RegExp(`(\\|\\s*${abbr}\\s*\\|[^\\n]+)`);
                            updatedContent = updatedContent.replace(rowRegex, (match) => {
                                const cells = match.split('|');
                                if (cells.length > targetCol) cells[targetCol] = `  ${newVal}   `;
                                return cells.join('|');
                            });
                        });
                    }
                }
                return updatedContent;
            });
        }

        new Notice(`Successfully leveled up to Level ${this.newLevel}!`);
        this.close();
    }
}

// --- SPELLBOOK MODAL ---
class SpellbookModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    dndClass: string = "";
    characterLevel: number = 1;
    spellsPoolFile: string = "";

    // Progression limits from class JSON ("spellcasting" or "pactMagic")
    maxCantrips: number = 0;
    maxPreparedSpells: number = 0;

    // Router data: { "0": { "mage-hand": "Mage Hand" }, "1": { "magic-missile": "Magic Missile" } }
    routerData: Record<string, Record<string, string>> = {};

    // Internal state mapped by string level ("0", "1", ..., "9") -> array of spell keys
    knownSpellsByLevel: Record<string, string[]> = {};
    preparedSpellsByLevel: Record<string, string[]> = {};

    // UI Elements for live re-rendering
    activeLevelTab: string = "0";
    trackerContainer!: HTMLElement;
    tabsContainer!: HTMLElement;
    listContainer!: HTMLElement;
    previewContainer!: HTMLElement;
    renderChild!: MarkdownRenderChild;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    // Helper: Reads a spell or spell router from the bundled registry (or customRulebookPath)
    async loadSpellJson(fileNameWithoutExt: string): Promise<any | null> {
        return await getSpellData(this.app, this.plugin.settings, fileNameWithoutExt);
    }

    // Helper: Parses frontmatter tuple array [ [ ["spell1", "spell2"], "1" ] ] into Record<string, string[]>
    parseSpellTuples(raw: any): Record<string, string[]> {
        const result: Record<string, string[]> = {};
        let parsed = raw;

        if (typeof raw === "string") {
            try { parsed = JSON.parse(raw); } catch { parsed = []; }
        }

        if (Array.isArray(parsed)) {
            for (const entry of parsed) {
                if (Array.isArray(entry) && entry.length === 2) {
                    const [spellsList, lvlKey] = entry;
                    const safeLvl = String(lvlKey);
                    if (Array.isArray(spellsList)) {
                        result[safeLvl] = spellsList.map(s => String(s));
                    }
                }
            }
        }
        return result;
    }

    // Helper: Formats Record<string, string[]> back into [ [ ["spell1", "spell2"], "1" ] ]
    formatSpellTuples(map: Record<string, string[]>): [string[], string][] {
        const output: [string[], string][] = [];
        const sortedLevels = Object.keys(map).sort((a, b) => Number(a) - Number(b));

        for (const lvl of sortedLevels) {
            const spells = map[lvl];
            if (Array.isArray(spells) && spells.length > 0) {
                output.push([spells, String(lvl)]);
            }
        }
        return output;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-spellbook-modal");

        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        contentEl.createEl("h3", { text: "📖 Spellbook Manager", cls: "dnd-section-header", attr: { style: "margin-bottom: 10px;" } });

        // 1. Read Frontmatter
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.characterLevel = Number(frontmatter["DnD_level"]) || 1;
        const classVal = frontmatter["DnD_class"];
        this.dndClass = (Array.isArray(classVal) ? classVal[0] : classVal) || "";

        // Parse Known Spells (DnD_spells) and Prepared Spells (DnD_preparedSpells)
        this.knownSpellsByLevel = this.parseSpellTuples(frontmatter["DnD_spells"]);
        this.preparedSpellsByLevel = this.parseSpellTuples(frontmatter["DnD_preparedSpells"]);

        // 2. Fetch Class Data to find "spellsPool" and "spellcasting" / "pactMagic" limits
        if (this.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData) {
                if (classData.spellsPool) {
                    this.spellsPoolFile = String(classData.spellsPool).trim();
                }

                const lvlStr = this.characterLevel.toString();
                const castingTable = classData.spellcasting?.[lvlStr] || classData.pactMagic?.[lvlStr];
                if (castingTable) {
                    this.maxCantrips = Number(castingTable.cantrips) || 0;
                    this.maxPreparedSpells = Number(castingTable.preparedSpells) || 0;
                }
            }
        }

        if (!this.spellsPoolFile) {
            contentEl.createEl("p", {
                text: `No "spellsPool" property found in ${this.dndClass || "class"} JSON. Add "spellsPool": "<router-filename>" to your class JSON to enable the Spellbook.`,
                cls: "dnd-error-text"
            });
            return;
        }

        // 3. Load Spell Pool Router Map from spellsMap (or customRulebookPath)
        const loadedRouter = await getSpellsPoolData(this.app, this.plugin.settings, this.spellsPoolFile);
        if (!loadedRouter || typeof loadedRouter !== "object") {
            contentEl.createEl("p", {
                text: `Could not load spell router file: /rulebook/spells/${this.spellsPoolFile}.json`,
                cls: "dnd-error-text"
            });
            return;
        }
        this.routerData = loadedRouter;

        // Ensure default active tab exists in routerData
        const availableLevels = Object.keys(this.routerData).sort((a, b) => Number(a) - Number(b));
        if (availableLevels.length > 0 && !availableLevels.includes(this.activeLevelTab)) {
            this.activeLevelTab = availableLevels[0];
        }

        // 4. Build Layout Containers
        this.trackerContainer = contentEl.createDiv({
            attr: { style: "display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--dnd-ui-color-bg-tertiary); border: 1px solid var(--dnd-ui-color-border-primary); border-radius: 6px; margin-bottom: 12px;" }
        });

        this.tabsContainer = contentEl.createDiv({
            attr: { style: "display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--dnd-ui-color-border-primary); padding-bottom: 6px; margin-bottom: 12px;" }
        });

        const bodyGrid = contentEl.createDiv({
            cls: "dnd-spellbook-body"
        });

        this.listContainer = bodyGrid.createDiv({
            cls: "dnd-spellbook-list"
        });

        this.previewContainer = bodyGrid.createDiv({
            cls: "dnd-spellbook-preview"
        });
        this.renderEmptyPreview();

        // 5. Footer Buttons
        const footerDiv = contentEl.createDiv({
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; border-top: 1px solid var(--dnd-ui-color-border-primary); padding-top: 12px;" }
        });

        const cancelBtn = footerDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = footerDiv.createEl("button", { text: "Save Spellbook", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            await this.saveSpellbook();
        };

        // Initial Render
        this.renderTracker();
        this.renderLevelTabs();
        this.renderSpellList();
    }

    // Counts total prepared cantrips (level "0") and leveled spells ("1"-"9")
    getPreparedCounts(): { cantrips: number; leveled: number } {
        const cantrips = (this.preparedSpellsByLevel["0"] || []).length;
        let leveled = 0;
        for (const [lvl, list] of Object.entries(this.preparedSpellsByLevel)) {
            if (lvl !== "0" && Array.isArray(list)) {
                leveled += list.length;
            }
        }
        return { cantrips, leveled };
    }

    renderTracker() {
        this.trackerContainer.empty();
        const { cantrips, leveled } = this.getPreparedCounts();

        const leftInfo = this.trackerContainer.createDiv();
        leftInfo.createEl("strong", {
            text: `${this.dndClass} (Level ${this.characterLevel})`,
            attr: { style: "color: var(--dnd-ui-color-text-bright);" }
        });

        const rightCounters = this.trackerContainer.createDiv({
            attr: { style: "display: flex; gap: 16px; font-size: 0.9em;" }
        });

        const cantripText = this.maxCantrips > 0 ? `${cantrips} / ${this.maxCantrips}` : `${cantrips}`;
        const prepText = this.maxPreparedSpells > 0 ? `${leveled} / ${this.maxPreparedSpells}` : `${leveled}`;

        const cSpan = rightCounters.createEl("span", { attr: { style: "color: var(--dnd-ui-color-text-sublabel);" } });
        cSpan.createEl("strong", { text: "Cantrips Prepared: ", attr: { style: "color: var(--dnd-ui-color-text-secondary);" } });
        cSpan.createSpan({ text: cantripText });

        const pSpan = rightCounters.createEl("span", { attr: { style: "color: var(--dnd-ui-color-text-sublabel);" } });
        pSpan.createEl("strong", { text: "Spells Prepared: ", attr: { style: "color: var(--dnd-ui-color-text-secondary);" } });
        pSpan.createSpan({ text: prepText });
    }

    renderLevelTabs() {
        this.tabsContainer.empty();
        const availableLevels = Object.keys(this.routerData).sort((a, b) => Number(a) - Number(b));

        for (const lvl of availableLevels) {
            const label = lvl === "0" ? "Cantrips" : `Lvl ${lvl}`;
            const isActive = this.activeLevelTab === lvl;

            const btn = this.tabsContainer.createEl("button", {
                text: label,
                attr: {
                    style: `padding: 4px 10px; border-radius: 4px; font-size: 0.85em; cursor: pointer; box-shadow: none; ${isActive
                            ? "background: var(--dnd-ui-color-bg-tertiary); color: var(--dnd-ui-color-text-bright); font-weight: bold; border: 1px solid var(--dnd-ui-color-border-active);"
                            : "background: transparent; color: var(--dnd-ui-color-text-muted); border: 1px solid transparent;"
                        }`
                }
            });

            btn.onclick = () => {
                this.activeLevelTab = lvl;
                this.renderLevelTabs();
                this.renderSpellList();
            };
        }
    }

    renderSpellList() {
        this.listContainer.empty();

        const lvl = this.activeLevelTab;
        const levelPool = this.routerData[lvl] || {};

        if (!this.knownSpellsByLevel[lvl]) this.knownSpellsByLevel[lvl] = [];
        if (!this.preparedSpellsByLevel[lvl]) this.preparedSpellsByLevel[lvl] = [];

        const knownList = this.knownSpellsByLevel[lvl];
        const preparedList = this.preparedSpellsByLevel[lvl];

        // 1. Add Spell Bar (from Router Pool)
        const addBar = this.listContainer.createDiv({
            attr: { style: "display: flex; gap: 8px; align-items: center;" }
        });

        const selectEl = addBar.createEl("select", { attr: { style: "flex: 1;" } });
        selectEl.createEl("option", { text: `-- Add ${lvl === "0" ? "Cantrip" : `Level ${lvl} Spell`} --`, value: "" });

        Object.entries(levelPool)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([spellKey, spellName]) => {
                if (!knownList.includes(spellKey)) {
                    selectEl.createEl("option", { text: spellName, value: spellKey });
                }
            });

        // Preview the spell immediately when selected in the dropdown before adding it
        selectEl.onchange = async () => {
            const chosenKey = selectEl.value;
            if (chosenKey) {
                await this.renderSpellPreview(chosenKey, levelPool[chosenKey]);
            } else {
                this.renderEmptyPreview();
            }
        };

        const addBtn = addBar.createEl("button", { text: "Add" });
        addBtn.onclick = async () => {
            const chosenKey = selectEl.value;
            if (!chosenKey) return;

            knownList.push(chosenKey);
            this.renderSpellList();
            await this.renderSpellPreview(chosenKey, levelPool[chosenKey]);
        };

        // 2. Known Spells List for this Level
        if (knownList.length === 0) {
            this.listContainer.createEl("p", {
                text: `No ${lvl === "0" ? "cantrips" : `level ${lvl} spells`} in your Spellbook yet.`,
                attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; text-align: center; margin-top: 20px;" }
            });
            return;
        }

        for (const spellKey of knownList) {
            const displayName = levelPool[spellKey] || spellKey.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            const isPrepared = preparedList.includes(spellKey);

            const row = this.listContainer.createDiv({
                attr: {
                    style: `display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: 6px; background: var(--dnd-ui-color-bg-tertiary); border: 1px solid ${isPrepared ? "var(--dnd-ui-color-border-active)" : "var(--dnd-ui-color-border-primary)"
                        };`
                }
            });

            // Left: Prepared Checkbox + Clickable Spell Name
            const leftGroup = row.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer;" } });

            const prepCheckbox = leftGroup.createEl("input", {
                type: "checkbox",
                attr: { title: "Toggle Prepared Status" }
            });
            prepCheckbox.checked = isPrepared;

            prepCheckbox.onclick = (e) => {
                e.stopPropagation();
                const { cantrips, leveled } = this.getPreparedCounts();

                if (prepCheckbox.checked) {
                    // Enforce limits when preparing a new spell
                    if (lvl === "0" && this.maxCantrips > 0 && cantrips >= this.maxCantrips) {
                        prepCheckbox.checked = false;
                        new Notice(`Cantrip limit reached (${this.maxCantrips} max). Unprepare a cantrip first!`);
                        return;
                    }
                    if (lvl !== "0" && this.maxPreparedSpells > 0 && leveled >= this.maxPreparedSpells) {
                        prepCheckbox.checked = false;
                        new Notice(`Prepared spells limit reached (${this.maxPreparedSpells} max). Unprepare a spell first!`);
                        return;
                    }
                    if (!preparedList.includes(spellKey)) preparedList.push(spellKey);
                } else {
                    this.preparedSpellsByLevel[lvl] = preparedList.filter(k => k !== spellKey);
                }

                this.renderTracker();
                this.renderSpellList();
            };

            const nameSpan = leftGroup.createEl("span", {
                text: displayName,
                attr: { style: "color: var(--dnd-ui-color-text-bright); font-weight: 500;" }
            });
            leftGroup.onclick = async () => {
                await this.renderSpellPreview(spellKey, displayName);
            };

            // Right: Remove Button
            const delBtn = row.createEl("button", {
                text: "✕",
                attr: {
                    title: "Remove from Spellbook",
                    style: "width: 24px; height: 24px; padding: 0; background: transparent; box-shadow: none; color: var(--dnd-ui-color-text-muted);"
                }
            });
            delBtn.onmouseenter = () => { delBtn.style.background = "var(--dnd-ui-color-accent-red)"; delBtn.style.color = "white"; };
            delBtn.onmouseleave = () => { delBtn.style.background = "transparent"; delBtn.style.color = "var(--dnd-ui-color-text-muted)"; };
            delBtn.onclick = () => {
                this.knownSpellsByLevel[lvl] = knownList.filter(k => k !== spellKey);
                this.preparedSpellsByLevel[lvl] = this.preparedSpellsByLevel[lvl].filter(k => k !== spellKey);
                this.renderTracker();
                this.renderSpellList();
            };
        }
    }

    renderEmptyPreview() {
        this.previewContainer.empty();
        this.previewContainer.createEl("p", {
            text: "Click on any spell in your Spellbook to inspect its details.",
            attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic; text-align: center; margin-top: 40px;" }
        });
    }

    async renderSpellPreview(spellKey: string, fallbackName: string) {
        this.previewContainer.empty();
        const spellData = await this.loadSpellJson(spellKey);

        if (!spellData) {
            this.previewContainer.createEl("h4", { text: fallbackName, attr: { style: "margin: 0 0 6px 0; color: var(--dnd-ui-color-text-bright);" } });
            this.previewContainer.createEl("p", {
                text: `Details file (/rulebook/spells/${spellKey}.json) not found.`,
                attr: { style: "color: var(--dnd-ui-color-text-muted); font-style: italic;" }
            });
            return;
        }

        // Title & Badges
        const headerDiv = this.previewContainer.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;" } });
        headerDiv.createEl("h4", { text: spellData.name || fallbackName, attr: { style: "margin: 0; color: var(--dnd-ui-color-text-bright);" } });

        const badgesDiv = headerDiv.createDiv({ attr: { style: "display: flex; gap: 4px;" } });
        if (spellData.concentration) {
            badgesDiv.createEl("span", { text: "C", cls: "dnd-level-badge", attr: { title: "Concentration", style: "margin: 0; padding: 2px 6px;" } });
        }
        if (spellData.ritual) {
            badgesDiv.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined", attr: { title: "Ritual", style: "margin: 0; padding: 2px 6px;" } });
        }

        const lvlText = Number(spellData.level) === 0 ? `${spellData.school || ""} Cantrip` : `Level ${spellData.level} ${spellData.school || ""}`;
        this.previewContainer.createEl("div", {
            text: lvlText.trim(),
            attr: { style: "font-size: 0.8em; color: var(--dnd-ui-color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;" }
        });

        // Core Metadata Grid
        const metaDiv = this.previewContainer.createDiv({
            attr: { style: "font-size: 0.85em; color: var(--dnd-ui-color-text-sublabel); margin-bottom: 10px; border-bottom: 1px solid var(--dnd-ui-color-border-primary); padding-bottom: 8px; line-height: 1.5;" }
        });

        if (spellData.castingTime) metaDiv.createEl("div", { text: `Casting Time: ${spellData.castingTime}` });
        if (spellData.range) metaDiv.createEl("div", { text: `Range: ${spellData.range}` });
        if (spellData.components) {
            const compStr = Array.isArray(spellData.components) ? spellData.components.join(", ") : String(spellData.components);
            const matStr = spellData.materials ? ` (${spellData.materials})` : "";
            metaDiv.createEl("div", { text: `Components: ${compStr}${matStr}` });
        }
        if (spellData.duration) metaDiv.createEl("div", { text: `Duration: ${spellData.duration}` });

        // Description
        if (spellData.description) {
            const descDiv = this.previewContainer.createDiv({ attr: { style: "font-size: 0.9em; line-height: 1.4;" } });
            await this.plugin.renderDndMarkdown(spellData.description, descDiv, this.sourcePath, this.renderChild);
        }
    }

    async saveSpellbook() {
        const formattedKnown = this.formatSpellTuples(this.knownSpellsByLevel);
        const formattedPrepared = this.formatSpellTuples(this.preparedSpellsByLevel);

        await this.plugin.updateCharacterFrontmatter(this.sourcePath, {
            "DnD_spells": JSON.stringify(formattedKnown),
            "DnD_preparedSpells": JSON.stringify(formattedPrepared)
        });

        new Notice("Spellbook saved!");
        this.close();
    }

    onClose() {
        if (this.renderChild) {
            this.renderChild.unload();
        }
        this.contentEl.empty();
    }
}

// --- CUSTOM NOTIFICATION UI ---
export class DnDCustomNotice extends Notice {
    constructor(
        title: string,
        message: string,
        iconString: string = "🎲",
        primaryAction?: { text: string; callback: () => void },
        secondaryAction?: { text: string; callback: () => void },
        duration: number = 0 // 0 = stays open until clicked or dismissed with X
    ) {
        super("", duration);

        // Grab the true outer .notice element so Obsidian doesn't render a second box behind ours
        const rootEl = (this.noticeEl.closest(".notice") as HTMLElement) || this.noticeEl;
        rootEl.empty();
        rootEl.addClass("dnd-custom-notice");

        // Enforce solid, unclipped horizontal card styling matching our plugin windows
        rootEl.style.backgroundColor = "var(--dnd-ui-color-bg-primary)";
        rootEl.style.border = "1px solid var(--dnd-ui-color-border-primary)";
        rootEl.style.borderRadius = "12px";
        rootEl.style.padding = "16px 18px";
        rootEl.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.45)";
        rootEl.style.opacity = "1";
        rootEl.style.backdropFilter = "none";
        rootEl.style.width = "360px";
        rootEl.style.maxWidth = "90vw";
        rootEl.style.overflow = "visible";
        rootEl.style.boxSizing = "border-box";
        rootEl.style.cursor = "default";

        // Stop Obsidian from closing the notice when clicking on the card body itself
        rootEl.onclick = (e) => e.stopPropagation();

        // Main 2-Column Layout: [Left Icon] + [Right Content Column]
        const layout = rootEl.createDiv({
            cls: "dnd-notice-layout",
            attr: {
                style: "display: flex; flex-direction: row; align-items: flex-start; gap: 14px; width: 100%;"
            }
        });

        // 1. Left App-Style Icon Box
        const iconBox = layout.createDiv({
            cls: "dnd-notice-icon",
            attr: {
                style: "width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0; background-color: var(--dnd-ui-color-bg-secondary); border: 1px solid var(--dnd-ui-color-border-primary); display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.25);"
            }
        });
        iconBox.innerText = iconString;

        // 2. Right Column: Header (Title + Close X), Message, and Action Buttons
        const contentCol = layout.createDiv({
            cls: "dnd-notice-content",
            attr: {
                style: "display: flex; flex-direction: column; flex: 1; min-width: 0;"
            }
        });

        // Top Row: Title on the left, '✕' Close button on the right
        const headerRow = contentCol.createDiv({
            cls: "dnd-notice-header",
            attr: {
                style: "display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;"
            }
        });

        headerRow.createEl("div", {
            text: title,
            cls: "dnd-notice-title",
            attr: {
                style: "font-size: 1.1em; font-weight: 700; color: var(--dnd-ui-color-text-bright); line-height: 1.25;"
            }
        });

        const closeBtn = headerRow.createEl("button", {
            text: "✕",
            cls: "dnd-notice-close",
            attr: {
                title: "Dismiss",
                style: "background: transparent; border: none; box-shadow: none; color: var(--dnd-ui-color-text-muted); font-size: 14px; padding: 0 2px; height: auto; cursor: pointer; line-height: 1;"
            }
        });
        closeBtn.onmouseenter = () => { closeBtn.style.color = "var(--dnd-ui-color-text-bright)"; };
        closeBtn.onmouseleave = () => { closeBtn.style.color = "var(--dnd-ui-color-text-muted)"; };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.hide();
        };

        // Subtitle / Message Text
        contentCol.createEl("div", {
            text: message,
            cls: "dnd-notice-message",
            attr: {
                style: "font-size: 0.92em; line-height: 1.4; color: var(--dnd-ui-color-text-muted); margin-bottom: 14px; word-wrap: break-word;"
            }
        });

        // Bottom Row: Action Buttons aligned beneath the message (matching Reference Image 2)
        if (primaryAction || secondaryAction) {
            const btnRow = contentCol.createDiv({
                cls: "dnd-notice-buttons",
                attr: {
                    style: "display: flex; flex-direction: row; gap: 10px; align-items: center; flex-wrap: wrap;"
                }
            });

            if (primaryAction) {
                const pBtn = btnRow.createEl("button", {
                    text: primaryAction.text,
                    cls: "mod-cta",
                    attr: {
                        style: "padding: 7px 16px; border-radius: 8px; font-weight: 600; font-size: 0.9em; cursor: pointer; border: 1px solid var(--dnd-ui-color-border-active); background-color: var(--dnd-ui-color-border-active); color: var(--dnd-ui-color-text-bright); box-shadow: none; height: auto;"
                    }
                });
                pBtn.onclick = (e) => {
                    e.stopPropagation();
                    primaryAction.callback();
                    this.hide();
                };
            }

            if (secondaryAction) {
                const sBtn = btnRow.createEl("button", {
                    text: secondaryAction.text,
                    attr: {
                        style: "padding: 7px 16px; border-radius: 8px; font-weight: 500; font-size: 0.9em; cursor: pointer; border: 1px solid var(--dnd-ui-color-border-primary); background-color: var(--dnd-ui-color-bg-secondary); color: var(--dnd-ui-color-text-primary); box-shadow: none; height: auto;"
                    }
                });
                sBtn.onclick = (e) => {
                    e.stopPropagation();
                    secondaryAction.callback();
                    this.hide();
                };
            }
        }
    }
}