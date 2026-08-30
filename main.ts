import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, parseYaml, MarkdownRenderChild, MarkdownRenderer, TFile } from 'obsidian';
import { getClassData, getSubclassData, getBackgroundFeat, getRaceData, getExtraFeat, getItemData } from './data';

// 1. Define the shape of our settings
interface DnDPluginSettings {
    combineClassSubclass: boolean;
    sectionOrder: string[];
    themeChoice: "default" | "custom";
    customColors: Record<string, string>; // Stores our 18 variables as key-value pairs
    customRulebookPath: string;           // Path to the user's homebrew folder
    customRulebookPriority: boolean;      // If true, homebrew overwrites native data
}

// 2. Set the default values
const DEFAULT_SETTINGS: DnDPluginSettings = {
    combineClassSubclass: false,
    sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra Feats"],
    themeChoice: "default",
    customRulebookPath: "",
    customRulebookPriority: false,
    customColors: {
        // ... (Keep all your existing color variables here exactly as they are) ...
        "--dnd-bg-primary": "#262A36", "--dnd-bg-secondary": "#323748", "--dnd-bg-tertiary": "#3A4055",
        "--dnd-bg-hover": "#363B4A", "--dnd-bg-darker": "#303440", "--dnd-bg-group": "#2D334A",
        "--dnd-text-primary": "#E0E0E0", "--dnd-text-secondary": "#A0A0D0", "--dnd-text-sublabel": "#A0C7D0",
        "--dnd-text-bright": "#ffffff", "--dnd-text-muted": "#B8B8D0", "--dnd-text-group": "#B8C4FF",
        "--dnd-border-primary": "#383E54", "--dnd-border-active": "#6D7CBA", "--dnd-border-focus": "#000",
        "--dnd-accent-teal": "#64D8CB", "--dnd-accent-red": "#E57373", "--dnd-accent-purple": "#B29DDB"
    }
}

export default class DnDFeaturesPlugin extends Plugin {
    // Add the settings property
    settings: DnDPluginSettings;

    async onload() {
        // Load settings from disk
        await this.loadSettings();

        // Apply custom colors immediately on startup!
        this.applyTheme();

        // Register the settings tab we built
        this.addSettingTab(new DnDSettingsTab(this.app, this));

        // Register the processor for our specific code block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-features",
            this.processDnDBlock.bind(this)
        );

        // Register the processor for the inventory block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-inventory",
            this.processInventoryBlock.bind(this)
        );
    }

    // Helper functions for Obsidian to read/write settings
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- Theme Engine Logic ---
    applyTheme() {
        if (this.settings.themeChoice === "custom") {
            // Inject custom colors into Obsidian's root DOM
            for (const [variable, color] of Object.entries(this.settings.customColors)) {
                document.body.style.setProperty(variable, color);
            }
        } else {
            // Remove custom inline styles to revert to the styles.css defaults
            for (const variable of Object.keys(this.settings.customColors)) {
                document.body.style.removeProperty(variable);
            }
        }
    }

    // --- Helper: Safely Update Gold Frontmatter ---
    async updateGoldFrontmatter(filePath: string, type: 'base' | 'added' | 'spent', amount: number) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const key = `dnd_gold_${type}`;
                const current = Number(frontmatter[key]) || 0;
                frontmatter[key] = current + amount;
            });
        }
    }

    // --- Helper: Safely Render Markdown and Fix Spacing ---
    async renderDndMarkdown(text: string, container: HTMLElement, sourcePath: string, component: MarkdownRenderChild) {
        if (!text) return;

        // 1. Trim trailing newlines that cause empty invisible <p> tags
        const cleanText = text.trim();

        // 2. Render the markdown securely
        await MarkdownRenderer.render(this.app, cleanText, container, sourcePath, component);

        // 3. Strip the bottom margin from the very last child to eliminate dead space!
        const lastChild = container.lastElementChild as HTMLElement;
        if (lastChild) {
            lastChild.style.marginBottom = '0';
        }
    }

    async processDnDBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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
            const level = resolveValue(blockData.level);
            const dndClass = resolveValue(blockData.class);
            const subclass = resolveValue(blockData.subclass);
            const classLevels = resolveValue(blockData['class-levels']);
            const race = resolveValue(blockData.race);
            const raceLineage = resolveValue(blockData['race-lineage']);
            const background = resolveValue(blockData.background);
            const extraFeats = resolveValue(blockData['extra-feats']);

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

            // 7. PRE-PASS: Gather all auto-granted feats from classes and subclasses
            let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : (extraFeats ? [extraFeats] : []);

            if (dndClass) {
                // Changed from forEach to a standard for-loop so we can await the data!
                for (let index = 0; index < classArray.length; index++) {
                    const className = classArray[index];
                    const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                        ? Number(classLevels[index])
                        : Number(level);

                    // Await the new async fetcher and pass app/settings
                    const classData = await getClassData(this.app, this.settings, className);

                    if (classData && classData.features) {
                        for (let i = 1; i <= currentClassLevel; i++) {
                            const levelFeatures = classData.features[i.toString()];
                            if (levelFeatures) {
                                levelFeatures.forEach((feature: any) => {
                                    if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                        finalExtraFeats.push(...feature.grantedFeats);
                                    }
                                });
                            }

                            if (classData.subclassFile && subclassArray[index]) {
                                // Await subclass data as well
                                const subclassData = await getSubclassData(this.app, this.settings, classData.subclassFile, subclassArray[index]);
                                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;
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
            finalExtraFeats = [...new Set(finalExtraFeats)];

            // Loop through the user's custom section order using a for...of loop to support async/await
            for (const sectionName of this.settings.sectionOrder) {
                // 1. CONDITIONAL RENDERING: Skip this section entirely if the user didn't provide the variable
                // Notice how we use 'continue' now instead of 'return' so we don't break the async loop!
                if (sectionName === "Class" && !dndClass) continue;
                if (sectionName === "Subclass" && (!subclass || this.settings.combineClassSubclass || Number(level) < 3)) continue;
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

                        // Added await and passed this.app, this.settings
                        const classData = await getClassData(this.app, this.settings, className);

                        if (!classData || !classData.features) {
                            sectionDiv.createEl("p", { text: `Data for ${className} not found.`, cls: "dnd-error-text" });
                            continue;
                        }

                        for (let i = 1; i <= currentClassLevel; i++) {
                            const levelFeatures = classData.features[i.toString()];

                            if (levelFeatures && levelFeatures.length > 0) {
                                for (const feature of levelFeatures) {
                                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });

                                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                    await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                }
                            }

                            if (this.settings.combineClassSubclass && subclassArray[index] && classData.subclassFile) {
                                const subclassName = subclassArray[index];
                                // Added await and passed this.app, this.settings
                                const subclassData = await getSubclassData(this.app, this.settings, classData.subclassFile, subclassName);
                                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;

                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
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
                        const currentClassLevel = Array.isArray(classLevels) ? classLevels[index] : level;
                        const subclassName = subclassArray[index];

                        // Added await and passed this.app, this.settings
                        const classData = await getClassData(this.app, this.settings, className);

                        if (subclassName && classData && classData.subclassFile) {
                            if (classArray.length > 1) {
                                sectionDiv.createEl("h4", { text: `${subclassName} Features`, cls: "dnd-class-header" });
                            }

                            // Added await and passed this.app, this.settings
                            const subclassData = await getSubclassData(this.app, this.settings, classData.subclassFile, subclassName);
                            if (!subclassData) continue;

                            for (let i = 1; i <= currentClassLevel; i++) {
                                const subLevelFeatures = subclassData[i.toString()];
                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
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
                    const raceData = await getRaceData(this.app, this.settings, race);

                    if (raceData && raceData.traits) {
                        for (const trait of raceData.traits) {
                            // --- THE GATEKEEPER LOGIC ---
                            // If this trait has a specific lineage flag...
                            if (trait.lineage) {
                                // ...skip rendering it if the user didn't provide a lineage OR if it doesn't match!
                                if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) {
                                    continue;
                                }
                            }

                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            // Dynamic Badge & Class
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
                    const featData = await getBackgroundFeat(this.app, this.settings, background);
                    if (featData) {
                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                        titleContainer.createEl("span", { text: "Origin Feat", cls: "dnd-level-badge" });
                        titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });

                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                        await this.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                    } else {
                        sectionDiv.createEl("p", { text: `Data for background "${background}" not found.`, cls: "dnd-error-text" });
                    }
                }

                // Render Extra Feats Section
                else if (sectionName === "Extra Feats") {
                    // Changed to a for...of loop so it properly respects the await command!
                    for (const featId of finalExtraFeats) {
                        // Ensure featId is a string before passing it
                        const safeFeatId = typeof featId === 'string' ? featId : String(featId);
                        const featData = await getExtraFeat(this.app, this.settings, safeFeatId);

                        if (featData) {
                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            titleContainer.createEl("span", { text: featData.badge ? featData.badge : "Feat", cls: "dnd-level-badge" });
                            titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                        } else {
                            sectionDiv.createEl("p", { text: `Data for extra feat "${safeFeatId}" not found.`, cls: "dnd-error-text" });
                        }
                    }
                }
            } // <-- This closes the sectionName loop perfectly!
            // Now that all async fetching and rendering is 100% complete, push it to the screen!
            el.empty();
            el.appendChild(wrapper);
        }; // <-- This closes our new renderContent() function

        // 3. Initial Render
        renderContent();

        // 4. Register Event Listener for Frontmatter Changes
        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                // If the file that changed is the one we are currently looking at, re-render!
                if (file.path === ctx.sourcePath) {
                    renderContent();
                }
            })
        );
    }

    async processInventoryBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        const renderContent = async () => {
            const wrapper = document.createElement('div');
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
            const classEq = resolveValue(blockData['class-equipment']);
            const bgEq = resolveValue(blockData['background-equipment']);
            const weaponSlot = resolveValue(blockData.weapon);
            const weaponDamage = resolveValue(blockData.weapon_damage);
            const armourSlot = resolveValue(blockData.armour);
            const armourAc = resolveValue(blockData.armour_ac);
            const extraItemsRaw = resolveValue(blockData['extra-items']);

            // --- Modular Umbrella Item Logic ---
            const musicalInstrumentChoice = resolveValue(blockData['musical-instrument']);
            const gamingSetChoice = resolveValue(blockData['gaming-set']);
            const variableClassItemsRaw = resolveValue(blockData['variable-class-items']);

            // Build a unified dictionary for all umbrella items
            const variantMap = new Map<string, string>();

            // 1. Auto-map the official Rulebook shortcuts
            if (musicalInstrumentChoice) variantMap.set('musical-instrument', String(musicalInstrumentChoice).toLowerCase().replace(/\s+/g, '-'));
            if (gamingSetChoice) variantMap.set('gaming-set', String(gamingSetChoice).toLowerCase().replace(/\s+/g, '-'));

            // 2. Auto-map the custom homebrew list
            if (Array.isArray(variableClassItemsRaw)) {
                variableClassItemsRaw.forEach(pair => {
                    // Ensure the user provided a valid [umbrella, variant] pair
                    if (Array.isArray(pair) && pair.length === 2) {
                        const umbrella = String(pair[0]).toLowerCase().replace(/\s+/g, '-');
                        const variant = String(pair[1]).toLowerCase().replace(/\s+/g, '-');
                        variantMap.set(umbrella, variant);
                    }
                });
            }

            // 2. Fetch Core Data to read Starting Equipment
            let grantedGold = 0;
            // Split into two separate dictionaries to track where they came from
            const startingItemCounts: Record<string, number> = {};
            const extraItemCounts: Record<string, number> = {};

            // Updated helper now accepts the target dictionary to fill
            const addItemsToPool = (eqData: any, targetPool: Record<string, number>) => {
                if (!eqData) return;
                if (eqData.gold) grantedGold += Number(eqData.gold);

                if (eqData.items) {
                    for (const [itemId, qty] of Object.entries(eqData.items)) {
                        let finalItemId = itemId;
                        if (variantMap.has(itemId)) {
                            const variant = variantMap.get(itemId);
                            finalItemId = `${itemId}-${variant}`;
                        }
                        targetPool[finalItemId] = (targetPool[finalItemId] || 0) + Number(qty);
                    }
                }
            };

            if (dndClass && classEq) {
                const primaryClass = Array.isArray(dndClass) ? dndClass[0] : dndClass;
                const classData = await getClassData(this.app, this.settings, primaryClass);
                // Fill the Starting Equipment pool
                if (classData?.['starting-equipment']) addItemsToPool(classData['starting-equipment'][classEq], startingItemCounts);
            }

            // Add manual extra items to the Extra Items pool
            const extraItems = Array.isArray(extraItemsRaw) ? extraItemsRaw : (extraItemsRaw ? [extraItemsRaw] : []);
            for (const item of extraItems) {
                const safeItem = typeof item === 'string' ? item.toLowerCase().replace(/\s+/g, '-') : String(item);
                extraItemCounts[safeItem] = (extraItemCounts[safeItem] || 0) + 1;
            }

            // 3. Omission Logic for Equipped Slots (Checks both pools!)
            const consumeItem = (itemName: string) => {
                if (!itemName) return null;
                const safeName = itemName.toLowerCase().replace(/\s+/g, '-');
                if (startingItemCounts[safeName] && startingItemCounts[safeName] > 0) {
                    startingItemCounts[safeName] -= 1;
                } else if (extraItemCounts[safeName] && extraItemCounts[safeName] > 0) {
                    extraItemCounts[safeName] -= 1;
                }
                return itemName;
            };

            const equippedWeapon = consumeItem(weaponSlot);
            const equippedArmour = consumeItem(armourSlot);

            // --- 4. RENDER UI ---

            wrapper.createEl("h3", { text: "Equipment & Items:", cls: "dnd-section-header" });

            // A. Wealth Bar (Strict Single-Line Layout)
            const goldBase = Number(frontmatter['dnd_gold_base']) || 0;
            const goldAdded = Number(frontmatter['dnd_gold_added']) || 0;
            const goldSpent = Number(frontmatter['dnd_gold_spent']) || 0;
            const totalGold = goldBase + goldAdded + grantedGold - goldSpent;

            const wealthWindow = wrapper.createDiv({ cls: "dnd-features-window" });
            
            // By wrapping the contents in a brand NEW div without any classes, we bypass the CSS block rules entirely!
            const wealthContainer = wealthWindow.createDiv({ 
                style: "display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 100%; padding: 5px;" 
            });

            // Left Side: Badge + GP (Inline)
            const wealthLeft = wealthContainer.createDiv({ style: "display: flex; align-items: center; gap: 10px;" });
            wealthLeft.createEl("span", { text: "Wealth", cls: "dnd-level-badge" });
            wealthLeft.createEl("strong", { text: `${totalGold} GP`, style: "font-size: 1.1em; color: var(--dnd-text-bright);" });

            // Right Side: Input + Add + Spend (Inline)
            const wealthRight = wealthContainer.createDiv({ style: "display: flex; flex-direction: row; gap: 8px; align-items: center;" });
            const amountInput = wealthRight.createEl("input", { type: "number", value: "1", style: "width: 60px; text-align: center; background: var(--dnd-bg-darker); border: 1px solid var(--dnd-border-primary); color: var(--dnd-text-bright); border-radius: 4px; padding: 4px;" });
            const addBtn = wealthRight.createEl("button", { text: "Add" });
            const subBtn = wealthRight.createEl("button", { text: "Spend" });

            addBtn.onclick = () => this.updateGoldFrontmatter(ctx.sourcePath, 'added', Number(amountInput.value) || 0);
            subBtn.onclick = () => this.updateGoldFrontmatter(ctx.sourcePath, 'spent', Number(amountInput.value) || 0);

            // B. Equipped Slots (Side-by-Side Flex Layout)
            if (equippedWeapon || equippedArmour) {
                const equipGrid = wrapper.createDiv({ style: "display: flex; gap: 10px; margin-bottom: 15px;" });

                const renderSlot = async (label: string, itemName: string, overrideStat: string, statLabel: string) => {
                    if (!itemName) return;
                    const safeName = itemName.toLowerCase().replace(/\s+/g, '-');
                    let data = await getItemData(this.app, this.settings, safeName);

                    const fallbackName = safeName.replace(/\b\w/g, c => c.toUpperCase()).replace(/-/g, ' ');
                    if (!data) data = { name: fallbackName, description: "" };

                    // Creating a styled Block-Level Card
                    const card = equipGrid.createDiv({ cls: "dnd-features-window", style: "flex: 1; display: flex; flex-direction: column; padding: 12px; text-align: center; margin: 0; background: var(--dnd-bg-secondary);" });
                    card.createDiv({ text: label.toUpperCase(), style: "font-size: 0.7em; opacity: 0.7; letter-spacing: 1px; margin-bottom: 4px;" });
                    card.createDiv({ text: data.name, style: "font-size: 1.1em; font-weight: bold; color: var(--dnd-text-bright); margin-bottom: 4px;" });

                    const statToDisplay = overrideStat || (data[statLabel.toLowerCase()] ? data[statLabel.toLowerCase()] : "");
                    if (statToDisplay) card.createDiv({ text: statToDisplay, style: "font-size: 1em; font-weight: bold; color: var(--dnd-text-sublabel);" });
                };

                await renderSlot("Weapon", equippedWeapon, weaponDamage, "Damage");
                await renderSlot("Armor", equippedArmour, armourAc, "AC");
            }

            // C. Backpack (Separated Sections - Single Line Layout)
            const backpackWindow = wrapper.createDiv({ cls: "dnd-features-window" });
            backpackWindow.createEl("h4", { text: "Backpack Contents", cls: "dnd-class-header", style: "margin: 10px 15px;" });

            // Reusable renderer for our two different item pools
            const renderPool = async (pool: Record<string, number>, title?: string) => {
                // Only render the sub-header if this specific pool has items remaining!
                if (title && Object.keys(pool).some(k => pool[k] > 0)) {
                    backpackWindow.createEl("h5", { text: title, style: "margin: 15px 15px 5px 15px; opacity: 0.8; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;" });
                }

                for (const [itemId, qty] of Object.entries(pool)) {
                    if (qty <= 0) continue; 

                    let data = await getItemData(this.app, this.settings, itemId);
                    const fallbackName = itemId.replace(/\b\w/g, c => c.toUpperCase()).replace(/-/g, ' ');
                    if (!data) data = { name: fallbackName, description: "" };

                    // 1. Remove the .dnd-feature-block class entirely to prevent the top border "divider" line!
                    const itemRow = backpackWindow.createDiv({ 
                        style: "display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 8px 15px; border-bottom: 1px solid var(--dnd-border-primary);" 
                    });
                    
                    // 2. Left side holds Badge, Name, AND Description on the exact same line
                    const contentLeft = itemRow.createDiv({ style: "display: flex; align-items: baseline; gap: 8px; flex-grow: 1; flex-wrap: wrap;" });
                    contentLeft.createEl("span", { text: `x${qty}`, cls: "dnd-level-badge" });
                    contentLeft.createEl("strong", { text: data.name, style: "color: var(--dnd-text-bright); white-space: nowrap;" });

                    if (data.description) {
                        // Notice we aren't using .dnd-feature-desc here either!
                        const descDiv = contentLeft.createDiv({ style: "color: var(--dnd-text-secondary); font-size: 0.9em;" });
                        await this.renderDndMarkdown(data.description, descDiv, ctx.sourcePath, renderChild);
                        
                        // 3. Obsidian's Markdown engine wraps text in a `<p>` tag which forces a line break. 
                        // We target the `<p>` tag programmatically and force it to be inline!
                        const pTags = descDiv.getElementsByTagName('p');
                        for (let i = 0; i < pTags.length; i++) {
                            pTags[i].style.display = "inline";
                            pTags[i].style.margin = "0";
                        }
                    }

                    if (data.weight) {
                        // 4. Weight goes on the far right, strictly bounded so it never touches the description
                        itemRow.createEl("span", { text: `${data.weight * qty} lbs`, style: "color: var(--dnd-text-muted); font-size: 0.9em; white-space: nowrap; flex-shrink: 0;" });
                    }
                }
            };

            // Render Starting Equipment First, then Extra Items!
            await renderPool(startingItemCounts);
            await renderPool(extraItemCounts, "Extra Items");
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

}

// --- Settings Tab UI ---
class DnDSettingsTab extends PluginSettingTab {
    plugin: DnDFeaturesPlugin;

    constructor(app: App, plugin: DnDFeaturesPlugin) {
        super(app, plugin);
        this.plugin = plugin;
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
                    this.display(); // Visually refresh the settings tab to hide/show Subclass
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
                }));

        new Setting(containerEl)
            .setName('Custom Rulebook Priority')
            .setDesc('If enabled, custom homebrew files will completely overwrite native files with the same name. If disabled, native files take priority.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.customRulebookPriority)
                .onChange(async (value) => {
                    this.plugin.settings.customRulebookPriority = value;
                    await this.plugin.saveSettings();
                }));

        // Draggable List for Section Order
        containerEl.createEl('h3', { text: 'Section Render Order', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Drag and drop the sections below to change their display order. If "Combine Class and Subclass" is enabled, the Subclass block will be hidden.', cls: 'setting-item-description' });

        const listContainer = containerEl.createDiv({ cls: 'dnd-draggable-list' });
        let dragSource: HTMLElement | null = null;

        // Loop through our saved array to build the UI
        this.plugin.settings.sectionOrder.forEach((sectionName) => {
            // Hide the Subclass item if the toggle is active
            if (this.plugin.settings.combineClassSubclass && sectionName === 'Subclass') return;

            const item = listContainer.createDiv({ text: sectionName, cls: 'dnd-draggable-item' });
            item.draggable = true;

            // HTML5 Drag and Drop Event Listeners
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
                (e.target as HTMLElement).style.border = '1px solid var(--dnd-border-primary)';
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
                    this.display();
                }
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });
        });

        // --- Theme Engine UI ---
        containerEl.createEl('h3', { text: 'Appearance & Theming', cls: 'setting-item-name dnd-settings-header' });

        new Setting(containerEl)
            .setName('Theme Selection')
            .setDesc('Choose between the default layout colors or create your own custom palette.')
            .addDropdown(drop => drop
                .addOption('default', 'Default Dark Theme')
                .addOption('custom', 'Custom Colors')
                .setValue(this.plugin.settings.themeChoice)
                .onChange(async (value) => {
                    this.plugin.settings.themeChoice = value as "default" | "custom";
                    this.plugin.applyTheme(); // Instantly apply changes
                    await this.plugin.saveSettings();
                    this.display(); // Refresh UI to show/hide color pickers
                }));

        // Only show color pickers if "Custom" is selected
        if (this.plugin.settings.themeChoice === "custom") {
            containerEl.createEl('p', { text: 'Customize your palette. Changes apply instantly.', cls: 'setting-item-description' });

            // Grouping for a clean UI
            const colorGroups = {
                "Background Colors": ["--dnd-bg-primary", "--dnd-bg-secondary", "--dnd-bg-tertiary", "--dnd-bg-hover", "--dnd-bg-darker", "--dnd-bg-group"],
                "Text Colors": ["--dnd-text-primary", "--dnd-text-secondary", "--dnd-text-sublabel", "--dnd-text-bright", "--dnd-text-muted", "--dnd-text-group"],
                "Border Colors": ["--dnd-border-primary", "--dnd-border-active", "--dnd-border-focus"],
                "Accents": ["--dnd-accent-teal", "--dnd-accent-red", "--dnd-accent-purple"]
            };

            // Dynamically generate color pickers
            for (const [groupName, variables] of Object.entries(colorGroups)) {
                containerEl.createEl('h4', { text: groupName, cls: 'dnd-settings-subgroup' });

                variables.forEach((variable) => {
                    const cleanName = variable.replace('--dnd-', '').replace(/-/g, ' '); // E.g., "--dnd-bg-primary" becomes "bg primary"

                    new Setting(containerEl)
                        .setName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1)) // Capitalize first letter
                        .addColorPicker(color => color
                            .setValue(this.plugin.settings.customColors[variable])
                            .onChange(async (value) => {
                                this.plugin.settings.customColors[variable] = value;
                                this.plugin.applyTheme(); // Update DOM instantly
                                await this.plugin.saveSettings();
                            }));
                });
            }
        }
    }
}