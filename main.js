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

// rulebook/classes.json
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

// rulebook/classes/monk.json
var monk_default = {
  class: "Monk",
  subclassFile: "monk-subclasses",
  features: {
    "1": [
      { name: "Bonus Unarmed Strike", description: "You can make an Unarmed Strike as a Bonus Action." }
    ],
    "2": [
      { name: "Flurry of Blows", description: "You can expend 1 Focus Point to make two Unarmed Strikes as a Bonus Action." }
    ]
  }
};

// rulebook/classes/monk-subclasses.json
var monk_subclasses_default = {
  "Warrior of Mercy": {
    "3": [
      { name: "Hand of Healing", description: "You can expend 1 Focus Point..." }
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
var subclassDataRegistry = {
  "monk-subclasses": monk_subclasses_default
};
function getSubclassData(subclassFile, subclassName) {
  const fileData = subclassDataRegistry[subclassFile];
  if (!fileData) return null;
  return fileData[subclassName];
}

// main.ts
var DEFAULT_SETTINGS = {
  combineClassSubclass: false,
  sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra"],
  themeChoice: "default",
  customColors: {
    "--dnd-bg-primary": "#262A36",
    "--dnd-bg-secondary": "#323748",
    "--dnd-bg-tertiary": "#3A4055",
    "--dnd-bg-hover": "#363B4A",
    "--dnd-bg-darker": "#303440",
    "--dnd-bg-group": "#2D334A",
    "--dnd-text-primary": "#E0E0E0",
    "--dnd-text-secondary": "#A0A0D0",
    "--dnd-text-sublabel": "#A0C7D0",
    "--dnd-text-bright": "#ffffff",
    "--dnd-text-muted": "#B8B8D0",
    "--dnd-text-group": "#B8C4FF",
    "--dnd-border-primary": "#383E54",
    "--dnd-border-active": "#6D7CBA",
    "--dnd-border-focus": "#000",
    "--dnd-accent-teal": "#64D8CB",
    "--dnd-accent-red": "#E57373",
    "--dnd-accent-purple": "#B29DDB"
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
    const renderChild = new import_obsidian.MarkdownRenderChild(el);
    ctx.addChild(renderChild);
    const renderContent = () => {
      el.empty();
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
      const parsedLevel = Number(level) || 0;
      if (Array.isArray(dndClass) && dndClass.length > 1) {
        if (!Array.isArray(classLevels) || classLevels.length !== dndClass.length) {
          const errorBox = el.createDiv({ cls: "dnd-error-window" });
          errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
          errorBox.createEl("p", {
            text: `You have multiple classes listed, but the "class-levels" variable is missing or is invalid. Please provide a level for each class.`
          });
          return;
        }
        const totalClassLevels = classLevels.reduce((sum, current) => sum + Number(current), 0);
        if (totalClassLevels !== parsedLevel) {
          const errorBox = el.createDiv({ cls: "dnd-error-window" });
          errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
          errorBox.createEl("p", {
            text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${parsedLevel}).`
          });
          return;
        }
      }
      const classArray = Array.isArray(dndClass) ? dndClass : [dndClass];
      const rawSubclassArray = Array.isArray(subclass) ? subclass : subclass ? [subclass] : [];
      const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);
      this.settings.sectionOrder.forEach((sectionName) => {
        if (sectionName === "Class" && !dndClass) return;
        if (sectionName === "Subclass" && (!subclass || this.settings.combineClassSubclass || Number(level) < 3)) return;
        if (sectionName === "Race" && !race) return;
        if (sectionName === "Background" && !background) return;
        if (sectionName === "Extra" && !extraFeats) return;
        let sectionTitle = `${sectionName} Features:`;
        if (sectionName === "Class" && this.settings.combineClassSubclass && subclass) sectionTitle = "Class & Subclass Features:";
        if (sectionName === "Race") sectionTitle = "Race Traits:";
        if (sectionName === "Background") sectionTitle = "Background Feat:";
        el.createEl("h3", {
          text: sectionTitle,
          attr: { style: "color: var(--dnd-text-primary); margin-bottom: 8px; margin-top: 24px; font-weight: 600;" }
        });
        const sectionWindow = el.createDiv({ cls: "dnd-features-window" });
        const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });
        if (sectionName === "Class") {
          classArray.forEach((className, index) => {
            const currentClassLevel = Array.isArray(classLevels) && classLevels.length > index ? Number(classLevels[index]) : Number(level);
            if (classArray.length > 1) {
              sectionDiv.createEl("h4", {
                text: `${className} Features (Level ${currentClassLevel})`,
                attr: { style: "color: var(--dnd-accent-teal); border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 4px; margin-bottom: 12px; margin-top: 0;" }
              });
            }
            const classData = getClassData(className);
            if (!classData || !classData.features) {
              sectionDiv.createEl("p", { text: `Data for ${className} not found.`, attr: { style: "color: var(--dnd-accent-red);" } });
              return;
            }
            for (let i = 1; i <= currentClassLevel; i++) {
              const levelFeatures = classData.features[i.toString()];
              if (levelFeatures && levelFeatures.length > 0) {
                levelFeatures.forEach((feature) => {
                  const featureBlock = sectionDiv.createDiv({ attr: { style: "margin-bottom: 14px;" } });
                  const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
                  titleContainer.createEl("span", {
                    text: `Lvl ${i}`,
                    cls: "dnd-level-badge"
                  });
                  titleContainer.createEl("span", {
                    text: feature.name,
                    attr: { style: "color: var(--dnd-text-bright);" }
                  });
                  featureBlock.createEl("div", {
                    text: feature.description,
                    attr: { style: "color: var(--dnd-text-primary); line-height: 1.5; margin-top: 4px;" }
                  });
                });
              }
              if (this.settings.combineClassSubclass && subclassArray[index] && classData.subclassFile) {
                const subclassName = subclassArray[index];
                const subclassData = getSubclassData(classData.subclassFile, subclassName);
                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;
                if (subLevelFeatures && subLevelFeatures.length > 0) {
                  subLevelFeatures.forEach((feature) => {
                    const featureBlock = sectionDiv.createDiv({ attr: { style: "margin-bottom: 14px;" } });
                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
                    titleContainer.createEl("span", { text: `Lvl ${i}`, cls: "dnd-level-badge", attr: { style: "background-color: var(--dnd-bg-group);" } });
                    titleContainer.createEl("span", { text: feature.name, attr: { style: "color: var(--dnd-text-bright);" } });
                    featureBlock.createEl("div", { text: feature.description, attr: { style: "color: var(--dnd-text-primary); line-height: 1.5; margin-top: 4px;" } });
                  });
                }
              }
            }
          });
        } else if (sectionName === "Subclass") {
          classArray.forEach((className, index) => {
            const currentClassLevel = Array.isArray(classLevels) ? classLevels[index] : level;
            const subclassName = subclassArray[index];
            const classData = getClassData(className);
            if (subclassName && classData && classData.subclassFile) {
              if (classArray.length > 1) {
                sectionDiv.createEl("h4", { text: `${subclassName} Features`, attr: { style: "color: var(--dnd-accent-teal); border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 4px; margin-bottom: 12px; margin-top: 0;" } });
              }
              const subclassData = getSubclassData(classData.subclassFile, subclassName);
              if (!subclassData) return;
              for (let i = 1; i <= currentClassLevel; i++) {
                const subLevelFeatures = subclassData[i.toString()];
                if (subLevelFeatures && subLevelFeatures.length > 0) {
                  subLevelFeatures.forEach((feature) => {
                    const featureBlock = sectionDiv.createDiv({ attr: { style: "margin-bottom: 14px;" } });
                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
                    titleContainer.createEl("span", { text: `Lvl ${i}`, cls: "dnd-level-badge" });
                    titleContainer.createEl("span", { text: feature.name, attr: { style: "color: var(--dnd-text-bright);" } });
                    featureBlock.createEl("div", { text: feature.description, attr: { style: "color: var(--dnd-text-primary); line-height: 1.5; margin-top: 4px;" } });
                  });
                }
              }
            }
          });
        } else if (sectionName === "Race") {
          sectionDiv.createEl("p", { text: `Loading traits for ${race}...`, attr: { style: "color: var(--dnd-text-secondary);" } });
        }
      });
    };
    renderContent();
    renderChild.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path === ctx.sourcePath) {
          renderContent();
        }
      })
    );
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
