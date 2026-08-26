import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, parseYaml } from 'obsidian';
import { getClassData } from './data';

// 1. Define the shape of our settings
interface DnDPluginSettings {
    combineClassSubclass: boolean;
    sectionOrder: string[];
    themeChoice: "default" | "custom";
    customColors: Record<string, string>; // Stores our 18 variables as key-value pairs
}

// 2. Set the default values
const DEFAULT_SETTINGS: DnDPluginSettings = {
    combineClassSubclass: true,
    sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra"],
    themeChoice: "default",
    customColors: {
        "--dnd-bg-primary": "#1e1e24", "--dnd-bg-secondary": "#2b2b36", "--dnd-bg-tertiary": "#383847", 
        "--dnd-bg-hover": "#3a3b4c", "--dnd-bg-darker": "#15151a", "--dnd-bg-group": "#22222a",
        "--dnd-text-primary": "#e0e0e0", "--dnd-text-secondary": "#a3a3b5", "--dnd-text-sublabel": "#888899", 
        "--dnd-text-bright": "#ffffff", "--dnd-text-muted": "#666677", "--dnd-text-group": "#cccccc",
        "--dnd-border-primary": "#40404f", "--dnd-border-active": "#5c5c6e", "--dnd-border-focus": "#7a7a92",
        "--dnd-accent-teal": "#4db6ac", "--dnd-accent-red": "#e57373", "--dnd-accent-purple": "#ba68c8"
    }
}

export default class DnDFeaturesPlugin extends Plugin {
    // Add the settings property
    settings: DnDPluginSettings;
    
    async onload() {
        // Load settings from disk
        await this.loadSettings();

        // Register the settings tab we built
        this.addSettingTab(new DnDSettingsTab(this.app, this));

        // Register the processor for our specific code block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-features", 
            this.processDnDBlock.bind(this)
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

    async processDnDBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Parse the user's code block using Obsidian's built-in YAML parser
        let blockData;
        try {
            blockData = parseYaml(source);
        } catch (error) {
            el.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
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
        const background = resolveValue(blockData.background);
        const extraFeats = resolveValue(blockData['extra-feats']);

        // 5. Validate Multiclassing Levels
        if (Array.isArray(dndClass) && Array.isArray(classLevels)) {
            const totalClassLevels = classLevels.reduce((sum, current) => sum + current, 0);
            if (totalClassLevels !== level) {
                // Create a styled container for the error
                const errorBox = el.createDiv({ cls: "dnd-error-window" });
                errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
                errorBox.createEl("p", { 
                    text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${level}).` 
                });
                return; // Stop rendering features
            }
        }

        // 6. Create the Main Visual Window
        const dndWindow = el.createDiv({ cls: "dnd-features-window" });
        
        // 7. Setup the Registry Lookup (Preparation for Data Fetching)
        // We will ensure dndClass is treated as an array for multiclassing support
        const classArray = Array.isArray(dndClass) ? dndClass : [dndClass];
        
        // Render a header to test our new window styling
        dndWindow.createEl("h3", { 
            text: `Character Features: Level ${level}`,
            attr: { style: "margin-top: 0; color: var(--dnd-text-bright);" }
        });

        // Loop through the user's custom section order
        this.settings.sectionOrder.forEach((sectionName) => {
            // Skip Subclass if it's combined (we will handle it inside the Class loop later)
            if (this.settings.combineClassSubclass && sectionName === "Subclass") return;

            // Create the container for this specific section
            const sectionDiv = dndWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });
            
            // Render Class Section
            if (sectionName === "Class" && dndClass) {
                classArray.forEach((className, index) => {
                    const currentClassLevel = Array.isArray(classLevels) ? classLevels[index] : level;
                    
                    sectionDiv.createEl("h4", { 
                        text: `${className} Features (Level ${currentClassLevel})`,
                        attr: { style: "color: var(--dnd-accent-teal); border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 4px; margin-bottom: 8px; margin-top: 12px;" }
                    });

                    // Fetch the data from our data.ts hub
                    const classData = getClassData(className);

                    if (!classData || !classData.features) {
                        sectionDiv.createEl("p", { text: `Data for ${className} not found.`, attr: { style: "color: var(--dnd-accent-red);" }});
                        return; // Move to the next class
                    }

                    // Iterate from Level 1 up to the current level
                    for (let i = 1; i <= currentClassLevel; i++) {
                        const levelFeatures = classData.features[i.toString()];
                        
                        if (levelFeatures && levelFeatures.length > 0) {
                            levelFeatures.forEach((feature: any) => {
                                // Create a visual block for each feature
                                const featureBlock = sectionDiv.createDiv({ attr: { style: "margin-bottom: 8px;" }});
                                featureBlock.createEl("strong", { text: feature.name, attr: { style: "color: var(--dnd-text-bright);" }});
                                featureBlock.createEl("span", { text: ` - ${feature.description}`, attr: { style: "color: var(--dnd-text-secondary);" }});
                            });
                        }
                    }
                });
            }
            
            // Placeholder for other sections (Race, Background, etc.)
            else if (sectionName === "Race" && race) {
                sectionDiv.createEl("h4", { text: "Racial Traits", attr: { style: "color: var(--dnd-accent-purple); border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 4px;" }});
                sectionDiv.createEl("p", { text: `Loading traits for ${race}...`, attr: { style: "color: var(--dnd-text-secondary);" }});
            }
        });
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

        // Draggable List for Section Order
        containerEl.createEl('h3', { text: 'Section Render Order', cls: 'setting-item-name', attr: { style: 'margin-top: 2rem;' } });
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
        containerEl.createEl('h3', { text: 'Appearance & Theming', cls: 'setting-item-name', attr: { style: 'margin-top: 2rem;' } });

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
                containerEl.createEl('h4', { text: groupName, attr: { style: 'margin-top: 1rem; margin-bottom: 0.5rem; color: var(--text-accent);' } });
                
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