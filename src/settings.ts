import { App, PluginSettingTab, Setting } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../main';
import { THEMES } from '../themes';
import { InitiativeState, FolderInputSuggest, createDefaultInitiativeState } from './dm-tools/dm-tools-party';

// 1. Define the shape of our settings
export interface DnDPluginSettings {
    combineClassSubclass: boolean;
    sectionOrder: string[];
    customRulebookPath: string;
    customRulebookPriority: boolean;

    // DM Tools & Compendium Suite Settings
    showDmToolsRibbon: boolean;
    defaultDmToolsView: "modal" | "sidebar";
    defaultDmToolsViewDesktop: "modal" | "sidebar";
    defaultDmToolsViewMobile: "modal" | "sidebar";
    partyFolderPath: string;
    statblocksFolderPath: string;
    savedInitiativeState: InitiativeState;

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
export const DEFAULT_SETTINGS: DnDPluginSettings = {
    combineClassSubclass: false,
    sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra Feats"],
    customRulebookPath: "",
    customRulebookPriority: false,

    showDmToolsRibbon: true,
    defaultDmToolsView: "sidebar",
    defaultDmToolsViewDesktop: "sidebar",
    defaultDmToolsViewMobile: "modal",
    partyFolderPath: "",
    statblocksFolderPath: "",
    savedInitiativeState: createDefaultInitiativeState(),

    selectedTheme: "default",
    ...THEMES.default.colors // Spread the default colors directly from the library!
};

// --- Settings Tab UI ---
export class DnDSettingsTab extends PluginSettingTab {
    plugin: DnDCharacterSheetHelperPlugin;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Triggers all open Markdown notes to re-render safely when rulebook settings change
    private refreshOpenSheets() {
        this.plugin.refreshOpenSheets();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'DnD Features' });

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

        // Sub-header & Draggable List for Section Order
        containerEl.createEl('h4', { text: 'Section Order', cls: 'dnd-settings-subgroup' });
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
                    (e.target as HTMLElement).style.border = '1px dashed var(--interactive-accent, var(--text-accent))';
                }
            });

            item.addEventListener('dragleave', (e) => {
                (e.target as HTMLElement).style.border = '';
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

        // --- DM Tools & Compendium Settings ---
        containerEl.createEl('h3', { text: 'DM Tools & Compendium', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Configure how the DM Tools & Compendium (Rulebook Search, Spell Browser, Initiative Tracker, Party Dashboard, and Monster Statblocks) open.', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('Show DM Tools Ribbon Icon')
            .setDesc('Display a DM Tools icon in the left ribbon sidebar for 1-click access to the DM Tools & Compendium.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDmToolsRibbon !== false)
                .onChange(async (value) => {
                    this.plugin.settings.showDmToolsRibbon = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDmToolsRibbonIcon();
                }));

        new Setting(containerEl)
            .setName('Default DM Tools View Mode (Desktop)')
            .setDesc('Choose whether the DM Tools open in the docked Right Sidebar panel or as a centered Modal window by default on Desktop (you can switch between both at any time with 1 click).')
            .addDropdown(drop => drop
                .addOption('sidebar', 'Docked Right Sidebar Panel')
                .addOption('modal', 'Centered Modal Window')
                .setValue(this.plugin.settings.defaultDmToolsViewDesktop || 'sidebar')
                .onChange(async (value: string) => {
                    this.plugin.settings.defaultDmToolsViewDesktop = (value === 'modal' ? 'modal' : 'sidebar');
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default DM Tools View Mode (Mobile)')
            .setDesc('Choose whether the DM Tools open as a centered Modal window or in the Right Sidebar panel by default on Mobile.')
            .addDropdown(drop => drop
                .addOption('modal', 'Centered Modal Window')
                .addOption('sidebar', 'Docked Right Sidebar Panel')
                .setValue(this.plugin.settings.defaultDmToolsViewMobile || 'modal')
                .onChange(async (value: string) => {
                    this.plugin.settings.defaultDmToolsViewMobile = (value === 'sidebar' ? 'sidebar' : 'modal');
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Party Character Sheets Folder')
            .setDesc('Enter the vault folder path containing your party\'s character sheets (e.g., "Campaign/Party", or "/" for vault root). Used by the Party Dashboard and 1-click Initiative party import.')
            .addText(text => {
                text
                    .setPlaceholder('Folder path...')
                    .setValue(this.plugin.settings.partyFolderPath || '')
                    .onChange(async (value) => {
                        this.plugin.settings.partyFolderPath = value.trim();
                        await this.plugin.saveSettings();
                        window.dispatchEvent(new CustomEvent('dnd-dm-party-folder-updated'));
                    });
                new FolderInputSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Statblocks / Bestiary Folder')
            .setDesc('Optional vault folder containing Markdown notes with ```statblock YAML blocks (scanned alongside your currently active note for the Monsters & Statblocks tab).')
            .addText(text => {
                text
                    .setPlaceholder('Folder path...')
                    .setValue(this.plugin.settings.statblocksFolderPath || '')
                    .onChange(async (value) => {
                        this.plugin.settings.statblocksFolderPath = value.trim();
                        await this.plugin.saveSettings();
                        window.dispatchEvent(new CustomEvent('dnd-dm-statblocks-folder-updated'));
                    });
                new FolderInputSuggest(this.app, text.inputEl);
            });

        // --- Custom Rulebook Settings ---
        containerEl.createEl('h3', { text: 'Homebrew & Custom Data', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Add your own custom JSON files to expand or overwrite the native rulebook.', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('Custom Rulebook Folder Path')
            .setDesc('Enter the path to your custom rulebook folder within your vault (e.g., "TTRPG/My Rulebook"). Leave blank to disable.')
            .addText(text => {
                text
                    .setPlaceholder('Folder path...')
                    .setValue(this.plugin.settings.customRulebookPath)
                    .onChange(async (value) => {
                        this.plugin.settings.customRulebookPath = value;
                        await this.plugin.saveSettings();
                        this.plugin.resetCustomRulebookWatcherState();
                        await this.plugin.checkCustomRulebookChanges(false, true);
                        await this.plugin.syncWeaponMasteriesMarkdown();
                        this.refreshOpenSheets();
                    });
                new FolderInputSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Custom Rulebook Priority')
            .setDesc('If enabled, custom homebrew files will completely overwrite native files with the same name. If disabled, native files take priority.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.customRulebookPriority)
                .onChange(async (value) => {
                    this.plugin.settings.customRulebookPriority = value;
                    await this.plugin.saveSettings();
                    this.plugin.resetCustomRulebookWatcherState();
                    await this.plugin.checkCustomRulebookChanges(false, true);
                    await this.plugin.syncWeaponMasteriesMarkdown();
                    this.refreshOpenSheets();
                }));

        // --- Theme Engine UI ---
        containerEl.createEl('h3', { text: 'Appearance & Theming', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Select a preset theme or customize individual colors. Changes apply instantly.', cls: 'setting-item-description' });

        // Build the Theme Dropdown
        const themeDropdown = new Setting(containerEl)
            .setName('Theme Preset')
            .setDesc(
                this.plugin.settings.selectedTheme === 'obsidian'
                    ? 'Automatically mirrors your active Obsidian theme, accent color, and light/dark mode.'
                    : 'Choose a predefined color theme.'
            );

        themeDropdown.addDropdown(drop => {
            Object.entries(THEMES).forEach(([key, theme]) => {
                drop.addOption(key, theme.name);
            });
            drop.setValue(this.plugin.settings.selectedTheme);
            drop.onChange(async (value) => {
                const theme = THEMES[value];
                if (theme) {
                    this.plugin.settings.selectedTheme = value;
                    if (value === 'obsidian') {
                        this.plugin.applyTheme();
                    } else {
                        Object.assign(this.plugin.settings, theme.colors);
                        this.plugin.applyTheme();
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }
            });
        });

        // Generate Color Pickers
        if (this.plugin.settings.selectedTheme === "obsidian") {
            this.plugin.applyTheme();
        }
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
