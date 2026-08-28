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

// rulebook/backgrounds.json
var backgrounds_default = {
  Acolyte: "magic-initiate-cleric",
  Artisan: "crafter",
  Charlatan: "skilled",
  Criminal: "alert",
  Entertainer: "musician",
  Farmer: "tough",
  Guard: "alert",
  Guide: "magic-initiate-druid",
  Hermit: "healer",
  Merchant: "lucky",
  Noble: "skilled",
  Sage: "magic-initiate-wizard",
  Sailor: "tavern-brawler",
  Soldier: "savage-attacker",
  Wayfarer: "lucky"
};

// rulebook/races.json
var races_default = {
  Aasimar: "aasimar",
  Dragonborn: "dragonborn",
  Dwarf: "dwarf",
  Elf: "elf",
  Gnome: "gnome",
  Goliath: "goliath",
  Halfling: "halfling",
  Human: "human",
  Orc: "orc",
  "Half-Orc": "half-orc",
  Tiefling: "tiefling"
};

// rulebook/classes/monk-subclasses.json
var monk_subclasses_default = {
  "Warrior of Mercy": {
    "3": [
      { name: "Hand of Harm", description: "Once per turn when you hit a creature with an Unarmed Strike and deal damage, you can expend 1 Focus Point to deal extra Necrotic damage equal to one roll of your Martial Arts die plus your Wisdom modifier." },
      { name: "Hand of Healing", description: "As a Magic action, you can expend 1 Focus Point to touch a creature and restore a number of Hit Points equal to a roll of your Martial Arts die plus your Wisdom modifier.\nWhen you use your Flurry of Blows, you can replace one of the Unarmed Strikes with a use of this feature without expending a Focus Point for the healing." }
    ],
    "6": [
      { name: "Physician's Touch", description: "Your Hand of Harm and Hand of Healing improve, as detailed below.\n \u2022 **Hand of Harm**:\nWhen you use Hand of Harm on a creature, you can also give that creature the Poisoned condition until the end of your next turn.\n \u2022 **Hand of Healing**:\nWhen you use Hand of Healing, you can also end one of the following conditions on the creature you heal: Blinded, Deafened, Paralyzed, Poisoned, or Stunned." }
    ],
    "11": [
      { name: "Flury of Healing and Harm", description: "When you use Flurry of Blows, you can replace each of the Unarmed Strikes w ith a use of Hand of Healing without expending Focus Points for the healing.\n  In addition, when you make an Unarmed Strike with Flur ry of Blows and deal damage, you can use Hand of Harm with that strike without expending a Focus Point for Hand of Harm. You ca n still use Hand of Harm only once per turn.\n  You can use these benefits a total number oftimes equal to your Wisdom modifier (minimum of once). You regain all expended uses when you finish a Long Rest." }
    ],
    "17": [
      { name: "Hand of Ultimate Mercy", description: "Your mastery of life energy opens the door to the ultimate mercy. As a Magic action, you can touch the corpse of a creature that died within the past 24 hours and expend 5 Focus Points. The creature then returns to life with a number of Hit Points equal to 4dl0 plus your Wisdom modifier. If the creature died with any of the following conditions, the creature revives with the conditions removed: Blinded, Deafened, Paralyzed, Poisoned, and Stunned\n  Once you use this feature, you can't use it again until you finish a Long Rest" }
    ]
  },
  "Warrior of Shadow": {
    "3": [
      { name: "Shadow Arts", description: "You have learned to draw on the power of the Shadowfell, gaining the following benefits.\n \u2022 **Darkness**: You can expend 1 Focus Point to cast the Darkness spell without spell components. You can see within the spell's area when you cast it with this feature. While the spell persists, you can move its area of Darkness to a space within 60 feet of yourself at the start of each of your turns.\n \u2022 **Darkvision**: You gain Darkvision with a range of 60 feet. If you already have Darkvision, its range increases by 60 feet.\n \u2022 **Shadowy Figments**: You know the Minor Illusion spell. Wisdom is your spellcasting ability for it." }
    ],
    "6": [
      { name: "Shadow Step", description: "While entirely within Dim Light or Darkness, you can use a Bonus Action to teleport up to 60 feet to an unoccupied space you can see that is also in Dim Light or Darkness. You then have Advantage on the next melee attack you make before the end of the current turn." }
    ],
    "11": [
      { name: "Improved Shadow Step", description: "You can draw on your Shadowfell connection to empower your teleportation. When you use your Shadow Step, you can expend 1 Focus Point to remove the requirement that you must start and end in Dim Light or Darkness for that use of the feature. As pal't of this Bonus Action, you can make an Unarmed Strike immediately after you teleport." }
    ],
    "17": [
      { name: "Cloak of Shadows", description: "As a Magic action while entirely within Dim Light or Darkness, you can expend 3 Focus Points to shroud yourself with shadows for 1 minute, until you have the Incapacitated condition, or until you end your turn in Bright Light. While shrouded by these shadows, you gain the following benefits." }
    ]
  },
  "Warrior of the Element": {
    "3": [
      { name: "Elemental Attunment", description: "At the start of your turn, you can expend l Focus Point to imbue yourself with elemental energy. The energy lasts for 10 minutes or until you have the Incapacitated condition. You gain the following benefits while this feature is active.\n \u2022 **Reach**: When you make an Unarmed Strike, your reach is 10 feet greater than normal, as elemental energy extends from you.\n \u2022 **Elemental Strikes**: Whenever you hit with your Unarmed Strike, you can cause it to deal your choice of Acid, Cold, Fire, Lightning, or Thunder damage rather than its normal damage type. When you deal one of these types with it, you can also force the target to make a Strength saving throw. On a failed save, you can move the target up to 10 feet toward or away from you, as elemental energy swirls around it.\n \u2022 **Manipulate Elements**: You know the Elementalism spell. Wisdom is your spellcasting ability for it." }
    ],
    "6": [
      { name: "Elemental Burst", description: "As a Magic action, you can expend 2 Focus Points to cause elemental energy to burst in a 20-foot-radius Sphere centered on a point within 120 feet of yourself. Choose a damage type: Acid, Cold, Fire, Lightning, or Thunder.\n  Each creature in the Sphere must make a Dexterity saving throw. On a failed save, a creature takes damage of the chosen type equal to three rolls of your Martial Arts die. On a successful save, a creature takes half as much damage." }
    ],
    "11": [
      { name: "Stride of the Element", description: "While your Elemental Attunement is active, you also have a Fly Speed and a Swim Speed equal to your Speed." }
    ],
    "17": [
      { name: "Elemental Epitome", description: "While your Elemental Attunement is active, you also gain the following benefits:\n \u2022 **Damage Resistance**: You gain Resistance to one of the following damage types of your choice: Acid, Cold, Fire, Lightning, or Thunder. At the start of each of your turns, you can change this choice.\n \u2022 **Destructive Stride**: When you use your Step of the Wind, your speed increases by 20 feet until the end o the turn.  For that duration, any creature of your choice takes damage equal to one roll of your Martial Arts die when you enter a space within 5 feet of it. The damage type is your choice of Acid, Cold, Fire, Lightning, or Thunder. A creature can take this damage only once per turn.\n \u2022 **Empowered Strikes**: Once on each of your turns, you can deal extra damage to a target equal to one roll of your Martial Arts die when you hit it with an Unarmed Strike. The extra damage is the same type dealt by that strike." }
    ]
  },
  "Warrior of the Open Hand": {
    "3": [
      { name: "Open Hand Technique", description: " \u2022 **Addle**: The target can't make Opportunity Attacks until the start of its next turn.\n \u2022 **Push**: The target must succeed on a Strength saving throw or be pushed up to 15 feet away from you.\n \u2022 **Topple**: The target must succeed on a Dexterity saving throw or have the Prone condition." }
    ],
    "6": [
      { name: "Wholeness of Body", description: "You gain the ability to heal yourself. As a Bonus Action, you can roll your Martial Arts die. You regain a number of Hit Points equal to the number rolled plus your Wisdom modifier (minimum of 1 Hit Point regained).\n  You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest." }
    ],
    "11": [
      { name: "Fleet Step", description: "When you take a Bonus Action other than Step of the Wind, you can also use Step of the Wind immediately after that Bonus Action." }
    ],
    "17": [
      { name: "Quivering Palm", description: "You gain the ability to set up lethal vibrations in someone's body. When you hit a creature with an Unarmed Strike, you can expend 4 Focus Points to start these imperceptible vibrations, which last for a number of days equal to your Monk level. The vibrations are harmless unless you take an action to end them. Alternatively, when you take the Attack action on your turn, you can forgo one of the attack ~ to end the vibrations. To end them, you and the target rnust be on the same plane of existence." }
    ]
  }
};

// rulebook/classes/monk.json
var monk_default = {
  class: "Monk",
  subclassFile: "monk-subclasses",
  features: {
    "1": [
      {
        name: "Bonus Unarmed Strike",
        description: "You can make an Unarmed Strike as a Bonus Action."
      }
    ],
    "2": [
      {
        name: "Monk's Focus",
        description: " \u2022 **Flurry of Blows**:\nYou can expend 1 Focus Point to make two Unarmed Strikes as a Bonus Action.\n \u2022 **Patient Defense**:\nYou can take the Disengage action as a Bonus Action. Alternatively, you can expend 1 Focus Point to take both the Disengage and the Dodge actions as a Bonus Action.\n \u2022 **Step of the Wind**:\nYou can take the Dash action as a Bonus Action. Alternatively, you can expend 1 Focus Point to take both the Disengage and Dash actions as a Bonus Action, and your jump distance is doubled for the turn."
      }
    ],
    "4": [
      {
        name: "Slow Fall",
        description: "You can take a Reaction when you fall to reduce any damage you take from the fall by an amount equal to five times your Monk level."
      }
    ],
    "5": [
      {
        name: "Stunning Strike",
        description: "Once per turn when you hit a creature with a Monk weapon or an Unarmed Strike, you can expend 1 Focus Point to attempt a stunning strike. The target must make a Constitution saving throw. On a failed save, the target has the Stunned condition until the start of your next turn. On a successful save, the target's Speed is halved until the start of your next turn, and the next attack roll made against the target before then has Advantage."
      }
    ],
    "6": [
      {
        name: "Empowered Strikes",
        description: "Whenever you deal damage with your Unarmed Strike, it can deal your choice of Force damage or its normal damage type."
      }
    ],
    "7": [
      {
        name: "Evasion",
        description: "When you're subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw and only half damage if you fail.\n You don't benefit from this feature if you have the Incapacitated condition."
      }
    ],
    "9": [
      {
        name: "Acrobatic Movement",
        description: "While you aren't wearing armor or wielding a Shield, you gain the ability to move along vertical surfaces and across liquids on your turn without falling during the movement."
      }
    ],
    "10": [
      {
        name: "Heightened Focus",
        description: "Your Flurry of Blows, Patient Defense, and Step of the Wind gain the following benefits:\n \u2022 **Flurry of Blows**: You can expend 1 Focus Point to use Flurry of Blows and make three Unarmed Strikes with it instead of two.\n \u2022 **Patient Defense**: When you expend a Focus Point to use Patient Defense, you gain a number of Temporary Hit Points equal to two rolls of your Martial Arts die.\n \u2022 **Step of the Wind**: When you expend a Focus Point to use Step of the Wind, you can choose a willing creature within 5 feet of yourself that is Large or smaller. You move the creature with you until the end of your turn. The creature's movement doesn't provoke Opportunity Attacks."
      },
      {
        name: "Self-Restoration",
        description: "Through sheer force of will, you can remove one of the following conditions from yourself at the end of each of your turns: Charmed, Frightened, or Poisoned.\n  In addition, forgoing food and drink doesn't give you levels of Exhaustion."
      }
    ],
    "13": [
      {
        name: "Deflect Energy",
        description: "You can now use your Deflect Attacks feature against attacks that deal any damage type, not just Bludgeoning, Piercing, or Slashing."
      }
    ],
    "14": [
      {
        name: "Disciplined Survivor",
        description: "Your physical and mental discipline grant you proficiency in all saving throws.\n  Additionally, whenever you make a saving throw and fail, you can expend 1 Focus Point to reroll it, and you must use the new roll."
      }
    ],
    "15": [
      {
        name: "Perfect Focus",
        description: "When you roll Initiative and don't use Uncanny Metabolism, you regain expended Focus Points until you have 4 if you have 3 or fewer."
      }
    ],
    "18": [
      {
        name: "Superior Defense",
        description: "At the start of your turn, you can expend 3 Focus Points to bolster yourself against harm for 1 minute or until you have the Incapacitated condition. During that time, you have Resistance to all damage except Force damage."
      }
    ],
    "19": [
      {
        name: "Epic Boon",
        description: "You gain an Epic Boon feat (see chapter 5) or another feat of your choice for which you qualify. Boon of Irresistible Offense is recommended."
      }
    ],
    "20": [
      {
        name: "Body and Mind",
        description: "You have developed your body and mind to new heights. Your Dexterity and Wisdom scores increase by 4, to a maximum of 25."
      }
    ]
  }
};

// rulebook/classes/paladin.json
var paladin_default = {
  class: "Paladin",
  subclassFile: "paladin-subclasses",
  features: {
    "4": [
      {
        name: "Ability Score Improvement",
        description: "You gain the Ability Score Improvement feat or another feat of your choice.",
        grantedFeats: ["ability-score-improvement"]
      }
    ]
  }
};

// rulebook/feats/ability-score-improvement.json
var ability_score_improvement_default = {
  name: "Ability Score Improvement",
  description: "Increase one ability score of your choice by 2, or increase two ability scores of your choice by 1. This feat can't increase an ability score above 20."
};

// rulebook/feats/alert.json
var alert_default = {
  name: "Alert",
  description: "**Initiative Proficiency**: When you roll Initiative, you can add your Proficiency Bonus to the roll.\n**Initiative Swap**: Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition."
};

// rulebook/feats/crafter.json
var crafter_default = {
  name: "Crafter",
  description: "**Tool Proficiency**: You gain proficiency with three different Ar tisan's Tools of your choice from the Fast Crafting table.\n**Discount**: Whenever you buy a nonmagical item, you r eceive a 20 percent discount on it.\n**Fast Crafting**: When you finish a Long Rest, you can craft one piece of gear from the Fast Crafting table, provided you have the Artisan's Tools associated with that item and h ave proficiency w ith those tools. The item lasts until you finish another Long Rest, at which point the item fa lls apart."
};

// rulebook/feats/healer.json
var healer_default = {
  name: "Healer",
  description: "**Battle Medic**: If you have a Healer's Kit, you can expend one use of it and tend to a creature within 5 feet of yourself as a Utilize action. That creature can expend one of its Hit Point Dice, and you then roll that die. The creature regains a number of Hit Points equal to the roll plus your Proficiency Bonus.\n**Healing Rerolls**: Whenever you roll a die to determine the number of Hit Points you restore with a spell or with this feat's Battle Medic benefit, you can reroll the die if it rolls a 1, and you must use the new roll."
};

// rulebook/feats/lucky.json
var lucky_default = {
  name: "Lucky",
  description: "You have a number of Luck Points equal to your Proficiency Bonus and can spend the points on the benefits below. You regain your expended Luck Points when you finish a Long Rest.\n \u2022 Advatages: When you roll a d20 for a D20 Test, you can spend 1 Luck Point to give yourself Advantage on the roll.\n \u2022 Disadvantage: When a creature rolls a d20 for an attack roll against you, you can spend 1 Luck Point to impose Disadvantage on that roll."
};

// rulebook/feats/magic-initiate-cleric.json
var magic_initiate_cleric_default = {
  name: "<Feat_Name>",
  description: "<Feat_Description>"
};

// rulebook/feats/magic-initiate-druid.json
var magic_initiate_druid_default = {
  name: "<Feat_Name>",
  description: "<Feat_Description>"
};

// rulebook/feats/magic-initiate-wizard.json
var magic_initiate_wizard_default = {
  name: "<Feat_Name>",
  description: "<Feat_Description>"
};

// rulebook/feats/musician.json
var musician_default = {
  name: "Musician",
  description: "**Encouraging Song**: As you finish a Short or Long Rest, you can play a song on a Musical Instrument with which you have proficiency and give Heroic Inspiration to allies who hear the song. The number of allies you can affect in this way equals your Proficiency Bonus."
};

// rulebook/feats/savage-attacker.json
var savage_attacker_default = {
  name: "Savage Attacker",
  description: "You've trained to deal particularly damaging strikes. Once per turn when you hit a target with a weapon, you can roll the weapon's damage dice twice and use either roll against the target."
};

// rulebook/feats/skilled.json
var skilled_default = {
  name: "Skilled",
  description: "You gain proficiency in any combination of three skills or tools of your choice."
};

// rulebook/feats/tavern-brawler.json
var tavern_brawler_default = {
  name: "Tavern Brawler",
  description: "**Enhanced Unarmed Strike**: When you hit with your Unarmed Strike and deal damage, you can deal Bludgeoning damage equal to ld4 plus your Strength modifier instead of the normal damage of an Unarmed Strike\n**Damage Rerolls**: Whenever you roll a damage die for your Unarmed Strike, you can reroll the die if it rolls a 1, and you must use the new roll.\n**Improvised Weaponry**: You have proficiency with improvised weapons.\n**Push**: When you hit a creature with an Unarmed Strike as part of the Attack action on your turn, you can deal damage to the target and also push it 5 feet away from you. You can use this benefit only once per turn."
};

// rulebook/feats/tough.json
var tough_default = {
  name: "Tough",
  description: "Your Hit Point maximum increases by an amount equal to twice your character level when you gain this feat. Whenever you gain a character level thereafter, your Hit Point maximum increases by an additional 2 Hit Points."
};

// rulebook/races/half-orc.json
var half_orc_default = {
  traits: [
    { name: "Adrenaline Rush", description: "You can take the Dash action as a Bonus Action. When you do so, you gain Temporary Hit Points equal to your Proficiency Bonus.\n  You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest." },
    { name: "Darkvision", description: "You have Darkvision with a range of 120 feet." },
    { name: "Relentless Endurance", description: "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest." }
  ]
};

// rulebook/races/orc.json
var orc_default = {
  traits: [
    { name: "Adrenaline Rush", description: "You can take the Dash action as a Bonus Action. When you do so, you gain Temporary Hit Points equal to your Proficiency Bonus.\n  You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest." },
    { name: "Darkvision", description: "You have Darkvision with a range of 120 feet." },
    { name: "Relentless Endurance", description: "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest." }
  ]
};

// registry.ts
var classRegistry = {
  "monk": monk_default,
  "paladin": paladin_default
};
var subclassRegistry = {
  "monk-subclasses": monk_subclasses_default
};
var featRegistry = {
  "ability-score-improvement": ability_score_improvement_default,
  "alert": alert_default,
  "crafter": crafter_default,
  "healer": healer_default,
  "lucky": lucky_default,
  "magic-initiate-cleric": magic_initiate_cleric_default,
  "magic-initiate-druid": magic_initiate_druid_default,
  "magic-initiate-wizard": magic_initiate_wizard_default,
  "musician": musician_default,
  "savage-attacker": savage_attacker_default,
  "skilled": skilled_default,
  "tavern-brawler": tavern_brawler_default,
  "tough": tough_default
};
var raceRegistry = {
  "half-orc": half_orc_default,
  "orc": orc_default
};

// data.ts
function getIgnoreCase(registry, searchKey) {
  if (!registry || !searchKey) return null;
  const normalizedKey = Array.isArray(searchKey) ? searchKey[0] : searchKey;
  if (typeof normalizedKey !== "string") return null;
  const realKey = Object.keys(registry).find((k) => k.toLowerCase() === normalizedKey.toLowerCase());
  return realKey ? registry[realKey] : null;
}
function getClassData(className) {
  const classFile = getIgnoreCase(classes_default, className);
  if (!classFile) return null;
  return getIgnoreCase(classRegistry, classFile);
}
function getSubclassData(subclassFile, subclassName) {
  const fileData = getIgnoreCase(subclassRegistry, subclassFile);
  if (!fileData) return null;
  return getIgnoreCase(fileData, subclassName);
}
function getBackgroundFeat(backgroundName) {
  const featId = getIgnoreCase(backgrounds_default, backgroundName);
  if (!featId) return null;
  return getIgnoreCase(featRegistry, featId);
}
function getRaceData(raceName) {
  const raceId = getIgnoreCase(races_default, raceName);
  if (!raceId) return null;
  return getIgnoreCase(raceRegistry, raceId);
}
function getExtraFeat(featName) {
  return getIgnoreCase(featRegistry, featName);
}

// main.ts
var DEFAULT_SETTINGS = {
  combineClassSubclass: false,
  sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra Feats"],
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
      let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : extraFeats ? [extraFeats] : [];
      if (dndClass) {
        classArray.forEach((className, index) => {
          const currentClassLevel = classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index ? Number(classLevels[index]) : Number(level);
          const classData = getClassData(className);
          if (classData && classData.features) {
            for (let i = 1; i <= currentClassLevel; i++) {
              const levelFeatures = classData.features[i.toString()];
              if (levelFeatures) {
                levelFeatures.forEach((feature) => {
                  if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                    finalExtraFeats.push(...feature.grantedFeats);
                  }
                });
              }
              if (classData.subclassFile && subclassArray[index]) {
                const subclassData = getSubclassData(classData.subclassFile, subclassArray[index]);
                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;
                if (subLevelFeatures) {
                  subLevelFeatures.forEach((feature) => {
                    if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                      finalExtraFeats.push(...feature.grantedFeats);
                    }
                  });
                }
              }
            }
          }
        });
      }
      finalExtraFeats = [...new Set(finalExtraFeats)];
      this.settings.sectionOrder.forEach((sectionName) => {
        if (sectionName === "Class" && !dndClass) return;
        if (sectionName === "Subclass" && (!subclass || this.settings.combineClassSubclass || Number(level) < 3)) return;
        if (sectionName === "Race" && !race) return;
        if (sectionName === "Background" && !background) return;
        if (sectionName === "Extra Feats" && finalExtraFeats.length === 0) return;
        let sectionTitle = `${sectionName} Features:`;
        if (sectionName === "Class" && this.settings.combineClassSubclass && subclass) sectionTitle = "Class & Subclass Features:";
        if (sectionName === "Race") sectionTitle = "Race Traits:";
        if (sectionName === "Background") sectionTitle = "Background Feat:";
        if (sectionName === "Extra Feats") sectionTitle = "Extra Feats:";
        el.createEl("h3", { text: sectionTitle, cls: "dnd-section-header" });
        const sectionWindow = el.createDiv({ cls: "dnd-features-window" });
        const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });
        if (sectionName === "Class") {
          classArray.forEach((className, index) => {
            const currentClassLevel = classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index ? Number(classLevels[index]) : Number(level);
            if (classArray.length > 1) {
              sectionDiv.createEl("h4", { text: `${className} Features (Level ${currentClassLevel})`, cls: "dnd-class-header" });
            }
            const classData = getClassData(className);
            if (!classData || !classData.features) {
              sectionDiv.createEl("p", { text: `Data for ${className} not found.`, cls: "dnd-error-text" });
              return;
            }
            for (let i = 1; i <= currentClassLevel; i++) {
              const levelFeatures = classData.features[i.toString()];
              if (levelFeatures && levelFeatures.length > 0) {
                levelFeatures.forEach((feature) => {
                  const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                  const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
                  titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                  titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                  const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                  import_obsidian.MarkdownRenderer.render(this.app, feature.description, descDiv, ctx.sourcePath, renderChild);
                });
              }
              if (this.settings.combineClassSubclass && subclassArray[index] && classData.subclassFile) {
                const subclassName = subclassArray[index];
                const subclassData = getSubclassData(classData.subclassFile, subclassName);
                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;
                if (subLevelFeatures && subLevelFeatures.length > 0) {
                  subLevelFeatures.forEach((feature) => {
                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge dnd-badge-combined" });
                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                    import_obsidian.MarkdownRenderer.render(this.app, feature.description, descDiv, ctx.sourcePath, renderChild);
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
                sectionDiv.createEl("h4", { text: `${subclassName} Features`, cls: "dnd-class-header" });
              }
              const subclassData = getSubclassData(classData.subclassFile, subclassName);
              if (!subclassData) return;
              for (let i = 1; i <= currentClassLevel; i++) {
                const subLevelFeatures = subclassData[i.toString()];
                if (subLevelFeatures && subLevelFeatures.length > 0) {
                  subLevelFeatures.forEach((feature) => {
                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                    import_obsidian.MarkdownRenderer.render(this.app, feature.description, descDiv, ctx.sourcePath, renderChild);
                  });
                }
              }
            }
          });
        } else if (sectionName === "Race") {
          const raceData = getRaceData(race);
          if (raceData && raceData.traits) {
            raceData.traits.forEach((trait) => {
              const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
              const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
              titleContainer.createEl("span", { text: trait.badge ? trait.badge : "Trait", cls: "dnd-level-badge" });
              titleContainer.createEl("span", { text: trait.name, cls: "dnd-feature-name" });
              featureBlock.createEl("div", { text: trait.description, cls: "dnd-feature-desc" });
            });
          } else {
            sectionDiv.createEl("p", { text: `Data for race "${race}" not found.`, cls: "dnd-error-text" });
          }
        } else if (sectionName === "Background") {
          const featData = getBackgroundFeat(background);
          if (featData) {
            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
            titleContainer.createEl("span", { text: "Origin Feat", cls: "dnd-level-badge" });
            titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });
            featureBlock.createEl("div", { text: featData.description, cls: "dnd-feature-desc" });
          } else {
            sectionDiv.createEl("p", { text: `Data for background "${background}" not found.`, cls: "dnd-error-text" });
          }
        } else if (sectionName === "Extra Feats") {
          finalExtraFeats.forEach((featId) => {
            const featData = getExtraFeat(featId);
            if (featData) {
              const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
              const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });
              titleContainer.createEl("span", { text: featData.badge ? featData.badge : "Feat", cls: "dnd-level-badge" });
              titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });
              featureBlock.createEl("div", { text: featData.description, cls: "dnd-feature-desc" });
            } else {
              sectionDiv.createEl("p", { text: `Data for extra feat "${featId}" not found.`, cls: "dnd-error-text" });
            }
          });
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
    containerEl.createEl("h3", { text: "Section Render Order", cls: "setting-item-name dnd-settings-header" });
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
    containerEl.createEl("h3", { text: "Appearance & Theming", cls: "setting-item-name dnd-settings-header" });
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
        containerEl.createEl("h4", { text: groupName, cls: "dnd-settings-subgroup" });
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
