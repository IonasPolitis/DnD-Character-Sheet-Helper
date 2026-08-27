var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DnDFeaturesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// classes.json
var classes_default = {
  Barbarian: "barbarian",
  Bard: "bard",
  "Blood Hunter": "blood-hunter",
  Cleric: "cleric",
  Druid: "druid",
  Fighter: "fighter",
  Monk: "monk",
  Paladin: "paladin",
  Ranger: "ranger",
  Rogue: "rogue",
  Sorcerer: "sorcerer",
  Warlock: "warlock",
  Wizard: "wizard"
};

// monk.json
var monk_default = {
  class: "Monk",
  features: {
    "1": [
      { name: "Bonus Unarmed Strike", description: "You can make an Unarmed Strike as a Bonus Action." }
    ],
    "2": [
      { name: "Flurry of Blows", description: "You can expend 1 Focus Point to make two Unarmed Strikes as a Bonus Action." }
    ]
  }
};

// data.ts
var classDataRegistry = {
  "monk": monk_default
  // "fighter": fighterData,
};
function getClassData(className) {
  const internalId = classes_default[className];
  if (!internalId) return null;
  return classDataRegistry[internalId];
}

// main.ts
var DEFAULT_SETTINGS = {
  combineClassSubclass: true,
  sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra"],
  themeChoice: "default",
  customColors: {
    "--dnd-bg-primary": "#1e1e24",
    "--dnd-bg-secondary": "#2b2b36",
    "--dnd-bg-tertiary": "#383847",
    "--dnd-bg-hover": "#3a3b4c",
    "--dnd-bg-darker": "#15151a",
    "--dnd-bg-group": "#22222a",
    "--dnd-text-primary": "#e0e0e0",
    "--dnd-text-secondary": "#a3a3b5",
    "--dnd-text-sublabel": "#888899",
    "--dnd-text-bright": "#ffffff",
    "--dnd-text-muted": "#666677",
    "--dnd-text-group": "#cccccc",
    "--dnd-border-primary": "#40404f",
    "--dnd-border-active": "#5c5c6e",
    "--dnd-border-focus": "#7a7a92",
    "--dnd-accent-teal": "#4db6ac",
    "--dnd-accent-red": "#e57373",
    "--dnd-accent-purple": "#ba68c8"
  }
};
var DnDFeaturesPlugin = class extends import_obsidian.Plugin {
  // Add the settings property
  settings;
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DnDSettingsTab(this.app, this));
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
      for (const [variable, color] of Object.entries(this.settings.customColors)) {
        document.body.style.setProperty(variable, color);
      }
    } else {
      for (const variable of Object.keys(this.settings.customColors)) {
        document.body.style.removeProperty(variable);
      }
    }
  }
  async processDnDBlock(source, el, ctx) {
    let blockData;
    try {
      blockData = (0, import_obsidian.parseYaml)(source);
    } catch (error) {
      el.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
      return;
    }
    const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
    const frontmatter = fileCache?.frontmatter || {};
    const resolveValue = (val) => {
      if (typeof val === "string" && val.startsWith("frontmatter.")) {
        const key = val.replace("frontmatter.", "");
        return frontmatter[key];
      }
      return val;
    };
    const level = resolveValue(blockData.level);
    const dndClass = resolveValue(blockData.class);
    const subclass = resolveValue(blockData.subclass);
    const classLevels = resolveValue(blockData["class-levels"]);
    const race = resolveValue(blockData.race);
    const background = resolveValue(blockData.background);
    const extraFeats = resolveValue(blockData["extra-feats"]);
    if (Array.isArray(dndClass) && Array.isArray(classLevels)) {
      const totalClassLevels = classLevels.reduce((sum, current) => sum + current, 0);
      if (totalClassLevels !== level) {
        const errorBox = el.createDiv({ cls: "dnd-error-window" });
        errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
        errorBox.createEl("p", {
          text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${level}).`
        });
        return;
      }
    }
    const dndWindow = el.createDiv({ cls: "dnd-features-window" });
    const classArray = Array.isArray(dndClass) ? dndClass : [dndClass];
    dndWindow.createEl("h3", {
      text: `Character Features: Level ${level}`,
      attr: { style: "margin-top: 0; color: var(--dnd-text-bright);" }
    });
    this.settings.sectionOrder.forEach((sectionName) => {
      if (this.settings.combineClassSubclass && sectionName === "Subclass") return;
      const sectionDiv = dndWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });
      if (sectionName === "Class" && dndClass) {
        classArray.forEach((className, index) => {
          const currentClassLevel = Array.isArray(classLevels) ? classLevels[index] : level;
          sectionDiv.createEl("h4", {
            text: `${className} Features (Level ${currentClassLevel})`,
            attr: { style: "color: var(--dnd-accent-teal); border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 4px; margin-bottom: 8px; margin-top: 12px;" }
          });
          const classData = getClassData(className);
          if (!classData || !classData.features) {
            sectionDiv.createEl("p", { text: `Data for ${className} not found.`, attr: { style: "color: var(--dnd-accent-red);" } });
            return;
          }
          for (let i = 1; i <= currentClassLevel; i++) {
            const levelFeatures = classData.features[i.toString()];
            if (levelFeatures && levelFeatures.length > 0) {
              levelFeatures.forEach((feature) => {
                const featureBlock = sectionDiv.createDiv({ attr: { style: "margin-bottom: 8px;" } });
                featureBlock.createEl("strong", { text: feature.name, attr: { style: "color: var(--dnd-text-bright);" } });
                featureBlock.createEl("span", { text: ` - ${feature.description}`, attr: { style: "color: var(--dnd-text-secondary);" } });
              });
            }
          }
        });
      } else if (sectionName === "Race" && race) {
        sectionDiv.createEl("h4", { text: "Racial Traits", attr: { style: "color: var(--dnd-accent-purple); border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 4px;" } });
        sectionDiv.createEl("p", { text: `Loading traits for ${race}...`, attr: { style: "color: var(--dnd-text-secondary);" } });
      }
    });
  }
};
var DnDSettingsTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "D&D 5.5e Features Settings" });
    new import_obsidian.Setting(containerEl).setName("Combine Class and Subclass Features").setDesc("If enabled, subclass features will be mixed chronologically into the main class section.").addToggle((toggle) => toggle.setValue(this.plugin.settings.combineClassSubclass).onChange(async (value) => {
      this.plugin.settings.combineClassSubclass = value;
      await this.plugin.saveSettings();
      this.display();
    }));
    containerEl.createEl("h3", { text: "Section Render Order", cls: "setting-item-name", attr: { style: "margin-top: 2rem;" } });
    containerEl.createEl("p", { text: 'Drag and drop the sections below to change their display order. If "Combine Class and Subclass" is enabled, the Subclass block will be hidden.', cls: "setting-item-description" });
    const listContainer = containerEl.createDiv({ cls: "dnd-draggable-list" });
    let dragSource = null;
    this.plugin.settings.sectionOrder.forEach((sectionName) => {
      if (this.plugin.settings.combineClassSubclass && sectionName === "Subclass") return;
      const item = listContainer.createDiv({ text: sectionName, cls: "dnd-draggable-item" });
      item.draggable = true;
      item.addEventListener("dragstart", () => {
        dragSource = item;
        item.style.opacity = "0.4";
      });
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("dragenter", (e) => {
        if (e.target !== dragSource) {
          e.target.style.border = "1px dashed var(--text-accent)";
        }
      });
      item.addEventListener("dragleave", (e) => {
        e.target.style.border = "1px solid var(--dnd-border-primary)";
      });
      item.addEventListener("drop", async (e) => {
        e.stopPropagation();
        const target = e.target;
        if (dragSource && dragSource !== target) {
          const fromIndex = this.plugin.settings.sectionOrder.indexOf(dragSource.innerText);
          const toIndex = this.plugin.settings.sectionOrder.indexOf(target.innerText);
          const [movedItem] = this.plugin.settings.sectionOrder.splice(fromIndex, 1);
          this.plugin.settings.sectionOrder.splice(toIndex, 0, movedItem);
          await this.plugin.saveSettings();
          this.display();
        }
      });
      item.addEventListener("dragend", () => {
        item.style.opacity = "1";
      });
    });
    containerEl.createEl("h3", { text: "Appearance & Theming", cls: "setting-item-name", attr: { style: "margin-top: 2rem;" } });
    new import_obsidian.Setting(containerEl).setName("Theme Selection").setDesc("Choose between the default layout colors or create your own custom palette.").addDropdown((drop) => drop.addOption("default", "Default Dark Theme").addOption("custom", "Custom Colors").setValue(this.plugin.settings.themeChoice).onChange(async (value) => {
      this.plugin.settings.themeChoice = value;
      this.plugin.applyTheme();
      await this.plugin.saveSettings();
      this.display();
    }));
    if (this.plugin.settings.themeChoice === "custom") {
      containerEl.createEl("p", { text: "Customize your palette. Changes apply instantly.", cls: "setting-item-description" });
      const colorGroups = {
        "Background Colors": ["--dnd-bg-primary", "--dnd-bg-secondary", "--dnd-bg-tertiary", "--dnd-bg-hover", "--dnd-bg-darker", "--dnd-bg-group"],
        "Text Colors": ["--dnd-text-primary", "--dnd-text-secondary", "--dnd-text-sublabel", "--dnd-text-bright", "--dnd-text-muted", "--dnd-text-group"],
        "Border Colors": ["--dnd-border-primary", "--dnd-border-active", "--dnd-border-focus"],
        "Accents": ["--dnd-accent-teal", "--dnd-accent-red", "--dnd-accent-purple"]
      };
      for (const [groupName, variables] of Object.entries(colorGroups)) {
        containerEl.createEl("h4", { text: groupName, attr: { style: "margin-top: 1rem; margin-bottom: 0.5rem; color: var(--text-accent);" } });
        variables.forEach((variable) => {
          const cleanName = variable.replace("--dnd-", "").replace(/-/g, " ");
          new import_obsidian.Setting(containerEl).setName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1)).addColorPicker((color) => color.setValue(this.plugin.settings.customColors[variable]).onChange(async (value) => {
            this.plugin.settings.customColors[variable] = value;
            this.plugin.applyTheme();
            await this.plugin.saveSettings();
          }));
        });
      }
    }
  }
};
