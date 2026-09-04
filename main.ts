import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, parseYaml, MarkdownRenderChild, MarkdownRenderer, TFile, Modal } from 'obsidian';
import { getClassData, getSubclassData, getBackgroundData, getRaceData, getExtraFeat, getItemData, getRuleData } from './data';
import { MarkdownNotes } from './registry';

// 1. Define the shape of our settings
interface DnDPluginSettings {
    combineClassSubclass: boolean;
    sectionOrder: string[];
    themeChoice: "default" | "custom";
    customColors: Record<string, string>; // Stores the 18 variables as key-value pairs
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

export default class DnDCharacterSheetHelperPlugin extends Plugin {
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
                    bulletSpan.style.color = 'var(--dnd-text-secondary)'; // Adjust colour pallete
                    bulletSpan.style.fontSize = '2em'; // Adjust size

                    htmlEl.insertBefore(bulletSpan, htmlEl.firstChild);
                    htmlEl.setAttribute('data-custom-bullet', 'true');
                }
            }
        });
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
            const hideRaw = resolveValue(blockData.hide);

            // Normalize the 'hide' variable into a clean array of lowercased strings to prevent typo-misses
            let hiddenFeatures: string[] = [];
            if (Array.isArray(hideRaw)) {
                hiddenFeatures = hideRaw.map(name => String(name).toLowerCase().trim());
            } else if (typeof hideRaw === 'string') {
                hiddenFeatures = hideRaw.split(',').map(name => String(name).toLowerCase().trim());
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

            // 7. PRE-PASS: Gather all auto-granted feats from classes and subclasses
            let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : (extraFeats ? [extraFeats] : []);

            if (dndClass) {
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
                                    if (feature.name && hiddenFeatures.includes(feature.name.toLowerCase())) continue;

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
                                const subclassData = await getSubclassData(this.app, this.settings, classData.subclassFile, subclassName);
                                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;

                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
                                        if (feature.name && hiddenFeatures.includes(feature.name.toLowerCase())) continue;

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
                                        if (feature.name && hiddenFeatures.includes(feature.name.toLowerCase())) continue;

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
                            if (trait.name && hiddenFeatures.includes(trait.name.toLowerCase())) continue;

                            if (trait.lineage) {
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
                    const bgData = await getBackgroundData(this.app, this.settings, background);
                    const featData = bgData && bgData.feat ? await getExtraFeat(this.app, this.settings, bgData.feat) : null;

                    if (featData && !hiddenFeatures.includes(featData.name.toLowerCase())) {
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
                    for (const featId of finalExtraFeats) {
                        const safeFeatId = typeof featId === 'string' ? featId : String(featId);
                        const featData = await getExtraFeat(this.app, this.settings, safeFeatId);

                        if (featData) {
                            if (featData.name && hiddenFeatures.includes(featData.name.toLowerCase())) continue;

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
                attr: { style: "position: fixed; display: none; z-index: 9999; background: var(--dnd-bg-secondary); border: 1px solid var(--dnd-border-primary); border-radius: 6px; padding: 12px; width: 300px; box-shadow: 0 8px 16px rgba(0,0,0,0.6); pointer-events: none;" }
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
            const classEq = resolveValue(blockData['class-equipment']);
            const bgEq = resolveValue(blockData['background-equipment']);
            const weaponSlot = resolveValue(blockData.weapon);
            const weaponDamage = resolveValue(blockData.weapon_damage);
            const armorSlot = resolveValue(blockData.armor);
            const armorAc = resolveValue(blockData.armor_ac);
            const extraItemsRaw = resolveValue(blockData['extra-items']);

            // --- Phase 1 & 2: Pre-Pass & Build the "Available Choices" Pools ---
            const classChosenItemsRaw = resolveValue(blockData['class-chosen-items']);
            const bgChosenItemsRaw = resolveValue(blockData['background-chosen-items']);

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

                    const data = await getItemData(this.app, this.settings, safeId);
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
                const classData = await getClassData(this.app, this.settings, primaryClass);
                if (classData?.['starting-equipment']) addItemsToPool(classData['starting-equipment'][classEq], startingItemCounts, classChosenItemsPool);
            }

            // Check for both the background name AND the A/B choice variable
            if (background && bgEq) {
                // Fetch the background data
                const bgData = await getBackgroundData(this.app, this.settings, background);

                if (bgData?.['starting-equipment']) {
                    addItemsToPool(bgData['starting-equipment'][bgEq], startingItemCounts, bgChosenItemsPool);
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

                    let data = await getItemData(this.app, this.settings, safeName);

                    // 2. Type-Checking: Ensure the item exists AND matches the expected type
                    const isRecognizedType = data && data.type && String(data.type).toLowerCase().includes(expectedType.toLowerCase());

                    // Default to fallback behavior (raw name, manual stat, no description)
                    let displayName = actualName;
                    let displayStat = manualStat ? String(manualStat) : "-";
                    let displayDesc = "";

                    // 3. Apply Official Data if recognized
                    if (isRecognizedType) {
                        displayName = data.name || actualName;
                        // Ignore manual overrides and pull natively
                        displayStat = expectedType === "Weapon" ? (data.damage || "-") : (data.ac || "-");
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
                        attr: { style: "font-size: 0.85em; color: var(--dnd-text-secondary); letter-spacing: 1.5px; font-weight: 600;" }
                    });

                    // MIDDLE: The Stat
                    card.createDiv({
                        text: displayStat,
                        attr: { style: "font-size: 1.6em; font-weight: bold; color: var(--dnd-text-bright);" }
                    });

                    // BOTTOM: Description 
                    if (displayDesc) {
                        const noteDiv = card.createDiv({
                            attr: { style: "font-size: 0.9em; color: var(--dnd-text-sublabel); line-height: 1.3;" }
                        });

                        await this.renderDndMarkdown(displayDesc, noteDiv, ctx.sourcePath, renderChild);

                        // Strip Obsidian's block paragraph margins so the card stays beautifully compact
                        noteDiv.querySelectorAll('*').forEach((childEl: HTMLElement) => {
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
            const goldBase = Number(frontmatter['dnd_gold_base']) || 0;
            const goldAdded = Number(frontmatter['dnd_gold_added']) || 0;
            const goldSpent = Number(frontmatter['dnd_gold_spent']) || 0;
            const totalGold = goldBase + goldAdded + grantedGold - goldSpent;

            const wealthWindow = wrapper.createDiv({
                cls: "dnd-features-window",
                attr: { style: "display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 12px 16px;" }
            });

            // 1. The Left Group (Badge + Gold Text remain close together)
            const wealth = wealthWindow.createEl("span", { attr: { style: "display: flex; align-items: center;" } });
            wealth.createEl("span", { text: "Wealth", cls: "dnd-level-badge", attr: { style: "margin-right: 10px;" } });
            wealth.createEl("strong", { text: `${totalGold} GP`, attr: { style: "font-size: 1.1em; color: var(--dnd-text-bright);" } });
            // 2. The Controls
            const amountInput = wealthWindow.createEl("input", { type: "number", value: "1", attr: { style: "text-align: center; background: var(--dnd-bg-darker); border: 1px solid var(--dnd-border-primary); color: var(--dnd-text-bright); border-radius: 4px; padding: 4px; width: 40px;" } });
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
                attr: { style: "display: flex; justify-content: space-between; align-items: center; margin: 0 0 10px 0; border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 8px;" }
            });
            backpackHeader.createEl("h4", { text: "Backpack Contents", attr: { style: "color: var(--dnd-text-primary); margin: 0; border: none; padding: 0;" } });

            const weightTracker = backpackHeader.createEl("span", {
                text: "Weight: 0 lbs",
                attr: { style: "font-size: 0.85em; color: var(--dnd-text-muted); font-weight: normal; letter-spacing: 0.5px;" }
            });
            let totalWeight = 0;

            const renderPool = async (pool: Record<string, number>, title?: string) => {
                // Filter out items with 0 quantity so we only create headers/grids if there are items to show
                const validItems = Object.entries(pool).filter(([_, qty]) => qty > 0);
                if (validItems.length === 0) return;

                if (title) {
                    // Small divider sub-header strictly for Extra Items
                    backpackWindow.createEl("div", { text: title, attr: { style: "margin: 16px 0 8px 0; font-weight: bold; font-size: 0.85em; text-transform: uppercase; color: var(--dnd-text-sublabel); border-bottom: 1px solid var(--dnd-bg-tertiary); padding-bottom: 4px;" } });
                }

                // --- THE 2-COLUMN GRID CONTAINER ---
                const gridContainer = backpackWindow.createDiv({
                    attr: { style: "display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; row-gap: 4px;" }
                });

                for (const [itemId, qty] of validItems) {
                    let data = await getItemData(this.app, this.settings, itemId);
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
                        tooltipWindow.createEl("h4", { text: data.name, attr: { style: "margin: 0 0 4px 0; color: var(--dnd-text-bright); font-size: 1.1em;" } });
                        if (data.type) {
                            tooltipWindow.createEl("div", { text: data.type.toUpperCase(), attr: { style: "font-size: 0.75em; color: var(--dnd-text-secondary); letter-spacing: 1px; margin-bottom: 8px;" } });
                        }

                        // 2. Stats (Weight & Cost)
                        const statsDiv = tooltipWindow.createDiv({ attr: { style: "display: flex; gap: 15px; margin-bottom: 8px; font-size: 0.85em; color: var(--dnd-text-muted);" } });

                        if (data.weight) statsDiv.createEl("span", { text: `Weight: ${data.weight} lbs` });
                        if (data.cost) statsDiv.createEl("span", { text: `Cost: ${data.cost} GP` });

                        // 3. Description (Rendered securely with your Markdown engine!)
                        if (data.description) {
                            const descDiv = tooltipWindow.createDiv({ attr: { style: "font-size: 0.9em; line-height: 1.4; color: var(--dnd-text-primary);" } });
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

                    itemRow.createEl("strong", { text: data.name + colon, attr: { style: "color: var(--dnd-text-bright); margin-right: 4px" } });

                    // 3. Weight & Cost (Fixed the 'display: color:' typo here)
                    const rightSide = itemRow.createEl("span", {
                        attr: { style: "color: var(--dnd-text-muted); font-size: 0.9em; white-space: nowrap; text-align: center;" }
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
            const hbRule = resolveValue(blockData.rules)

            // 6. Setup the Registry Lookup (Preparation for Data Fetching)
            const rulesArray = Array.isArray(hbRule) ? hbRule : (hbRule ? [hbRule] : []);

            if (rulesArray.length > 0) {
                const sectionWindow = wrapper.createDiv({ cls: "dnd-features-window" });
                const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-rules` });

                for (const ruleKey of rulesArray) {
                    const ruleData = await getRuleData(this.app, this.settings, ruleKey);

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

        // --- BUNDLED REGISTRY LOOKUP ---
        const fileContent = MarkdownNotes[this.noteKey];

        if (fileContent) {
            // Render the fetched markdown into the pop-up
            MarkdownRenderer.render(this.app, fileContent, contentEl, "", null as any);
        } else {
            // Updated fallback message so you know it is checking the registry correctly
            contentEl.createEl("p", {
                text: `Error: Could not find "${this.noteKey}" in the bundled Markdown registry. Make sure you ran the generation script!`,
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
                    this.plugin.applyTheme();
                    await this.plugin.saveSettings();
                    this.display();
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
                    const cleanName = variable.replace('--dnd-', '').replace(/-/g, ' ');

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