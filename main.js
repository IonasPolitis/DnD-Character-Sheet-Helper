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
var import_obsidian2 = require("obsidian");

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
  Acolyte: {
    feat: "magic-initiate-cleric",
    "starting-equipment": {
      A: {
        items: {
          "calligraphers-supplies": 1,
          book: 1,
          "holy-symbol": 1,
          parchmant: 10,
          robe: 1
        },
        gold: 8
      },
      B: { items: {}, gold: 50 }
    }
  },
  Artisan: {
    feat: "crafter",
    "starting-equipment": {
      A: {
        items: {
          "artisans-tool|": 1,
          pouche: 2,
          "travelers-clothes": 1
        },
        gold: 32
      },
      B: { items: {}, gold: 50 }
    }
  },
  Charlatan: {
    feat: "skilled",
    "starting-equipment": {
      A: {
        items: {
          "forgery-kit": 1,
          costume: 1,
          "fine-clothes": 1
        },
        gold: 15
      },
      B: { items: {}, gold: 50 }
    }
  },
  Criminal: {
    feat: "alert",
    "starting-equipment": {
      A: {
        items: {
          dagger: 2,
          "thieves-tools": 1,
          crowbar: 1,
          pouche: 2,
          "travelers-clothes": 1
        },
        gold: 16
      },
      B: { items: {}, gold: 50 }
    }
  },
  Entertainer: {
    feat: "musician",
    "starting-equipment": {
      A: {
        items: {
          "musical-instrument|": 1,
          costume: 2,
          mirror: 1,
          perfume: 1,
          "travelers-clothes": 1
        },
        gold: 11
      },
      B: { items: {}, gold: 50 }
    }
  },
  Farmer: {
    feat: "tough",
    "starting-equipment": {
      A: {
        items: {
          sickle: 1,
          "carpenters-tools": 1,
          "healers-kit": 1,
          "iron-pot": 1,
          shovel: 1,
          "travelers-clothes": 1
        },
        gold: 30
      },
      B: { items: {}, gold: 50 }
    }
  },
  Guard: {
    feat: "alert",
    "starting-equipment": {
      A: {
        items: {
          spear: 1,
          "light-crossbow": 1,
          bolt: 1,
          "gaming-set|": 1,
          "hooded-lantern": 1,
          manacles: 1,
          quiver: 1,
          "travelers-clothes": 1
        },
        gold: 12
      },
      B: { items: {}, gold: 50 }
    }
  },
  Guide: {
    feat: "magic-initiate-druid",
    "starting-equipment": {
      A: {
        items: {
          shortbow: 1,
          arrow: 20,
          "cartographers-tools": 1,
          bedroll: 1,
          quiver: 1,
          tent: 1,
          "travelers-clothes": 1
        },
        gold: 3
      },
      B: { items: {}, gold: 50 }
    }
  },
  Hermit: {
    feat: "healer",
    "starting-equipment": {
      A: {
        items: {
          quarterstaff: 1,
          "herbalism-kit": 1,
          bedroll: 1,
          book: 1,
          lamp: 1,
          oil: 3,
          "travelers-clothes": 1
        },
        gold: 16
      },
      B: { items: {}, gold: 50 }
    }
  },
  Merchant: {
    feat: "lucky",
    "starting-equipment": {
      A: {
        items: {
          "navigators-tools": 1,
          pouche: 2,
          "travelers-clothes": 1
        },
        gold: 22
      },
      B: { items: {}, gold: 50 }
    }
  },
  Noble: {
    feat: "skilled",
    "starting-equipment": {
      A: {
        items: {
          "gaming-set|": 1,
          "fine-clothes": 1,
          perfume: 1
        },
        gold: 29
      },
      B: { items: {}, gold: 50 }
    }
  },
  Sage: {
    feat: "magic-initiate-wizard",
    "starting-equipment": {
      A: {
        items: {
          quarterstaff: 1,
          "calligraphers-supplies": 1,
          book: 1,
          parchmant: 8,
          robe: 1
        },
        gold: 8
      },
      B: { items: {}, gold: 50 }
    }
  },
  Sailor: {
    feat: "tavern-brawler",
    "starting-equipment": {
      A: {
        items: {
          dagger: 1,
          "navigators-tools": 1,
          rope: 1,
          "travelers-clothes": 1
        },
        gold: 20
      },
      B: { items: {}, gold: 50 }
    }
  },
  Scribe: {
    feat: "skilled",
    "starting-equipment": {
      A: {
        items: {
          "calligraphers-supplies": 1,
          "fine-clothes": 1,
          lamp: 1,
          oil: 3,
          parchmant: 12
        },
        gold: 23
      },
      B: { items: {}, gold: 50 }
    }
  },
  Soldier: {
    feat: "savage-attacker",
    "starting-equipment": {
      A: {
        items: {
          spear: 1,
          shortbow: 1,
          arrow: 20,
          "gaming-set|": 1,
          "healers-kit": 1,
          quiver: 1,
          "travelers-clothes": 1
        },
        gold: 14
      },
      B: { items: {}, gold: 50 }
    }
  },
  Wayfarer: {
    feat: "lucky",
    "starting-equipment": {
      A: {
        items: {
          dagger: 2,
          "thieves-tools": 1,
          "gaming-set|": 1,
          bedroll: 1,
          pouche: 2,
          "travelers-clothes": 1
        },
        gold: 16
      },
      B: { items: {}, gold: 50 }
    }
  }
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

// rulebook/items.json
var items_default = {
  "Alchemist's Supplies": "alchemists-supplies",
  "Arcane Focus": "arcane-focus",
  Arrows: "arrows",
  Battleaxe: "battleaxe",
  Blowgun: "blowgun",
  Book: "book",
  Breastplate: "breastplate",
  "Brewer's Supplies": "brewers-supplies",
  "Burglar's Pack": "burglars-pack",
  "Calligrapher's Supplies": "calligraphers-supplies",
  "Carpenter's Tools": "carpenters-tools",
  "Cartographer's Tools": "cartographers-tools",
  "Chain Mail": "chain-mail",
  "Chain Shirt": "chain-shirt",
  Club: "club",
  "Cobbler's Tools": "cobblers-tools",
  "Cook's Utensils": "cooks-utensils",
  Dagger: "dagger",
  Dart: "dart",
  "Disguise Kit": "disguise-kit",
  "Druidic Focus": "druidic-focus",
  "Dungeoneer's Pack": "dungeoneers-pack",
  "Entertainer's Pack": "entertainers-pack",
  "Explorer's Pack": "explorers-pack",
  Flail: "flail",
  "Forgery Kit": "forgery-kit",
  "Gaming Set - Dice": "dice",
  "Gaming Set - Dragonchess": "dragonchess",
  "Gaming Set - Playing Cards": "playing-cards",
  "Gaming Set - Three-Dragon Ante": "three-dragon-ante",
  Glaive: "glaive",
  "Glassblower's Tools": "glassblowers-tools",
  Greataxe: "greataxe",
  Greatclub: "greatclub",
  Greatsword: "greatsword",
  Halberd: "halberd",
  "Half Plate Armor": "half-plate-armor",
  "Hand Crossbow": "hand-crossbow",
  Handaxe: "handaxe",
  "Heavy Crossbow": "heavy-crossbow",
  "Herbalism Kit": "herbalism-kit",
  "Hide Armor": "hide-armor",
  "Holy Symbol": "holy-symbol",
  Javelin: "javelin",
  "Jeweler's Tools": "jewelers-tools",
  Lance: "lance",
  "Leather Armor": "leather-armor",
  "Leatherworker's Tools": "leatherworkers-tools",
  "Light Crossbow": "light-crossbow",
  "Light Hammer": "light-hammer",
  Longbow: "longbow",
  Longsword: "longsword",
  Mace: "mace",
  "Mason's Tools": "masons-tools",
  Maul: "maul",
  Morningstar: "morningstar",
  Bagpipes: "bagpipes",
  Drum: "drum",
  Dulcimer: "dulcimer",
  Flute: "flute",
  Horn: "horn",
  Lute: "lute",
  Lyre: "lyre",
  "Pan Flute": "flute",
  Shawm: "shawm",
  Viol: "viol",
  Musket: "musket",
  "Navigator's Tools": "navigators-tools",
  "Padded Armor": "padded-armor",
  "Painter's Supplies": "painters-supplies",
  Pike: "pike",
  Pistol: "pistol",
  "Plate Armor": "plate-armor",
  "Poisoner's Kit": "poisoners-kit",
  "Potter's Tools": "potters-tools",
  "Priest's Pack": "priests-pack",
  Quarterstaff: "quarterstaff",
  Quiver: "quiver",
  Rapier: "rapier",
  "Ring Mail": "ring-mail",
  Robe: "robe",
  "Scale Mail": "scale-mail",
  "Scholar's Pack": "scholars-pack",
  Scimitar: "scimitar",
  Shield: "shield",
  Shortbow: "shortbow",
  Shortsword: "shortsword",
  Sickle: "sickle",
  Sling: "sling",
  "Smith's Tools": "smiths-tools",
  Spear: "spear",
  Spellbook: "spellbook",
  "Splint Armor": "splint-armor",
  "Studded Leather Armor": "studded-leather-armor",
  "Thieves' Tools": "thieves-tools",
  "Tinker's Tools": "tinkers-tools",
  Trident: "trident",
  "War Pick": "war-pick",
  Warhammer: "warhammer",
  "Weaver's Tools": "weavers-tools",
  Whip: "whip",
  "Woodcarver's Tools": "woodcarvers-tools"
};

// rulebook/classes/barbarian-subclasses.json
var barbarian_subclasses_default = {
  "Path of the Berserker": {
    "3": [
      {
        name: "Frenzy",
        description: "If you use Reckless Attack while your Rage is active, you deal extra damage to the first target you hit on your turn with a Strength-based attack. To determine the extra damage, roll a number of d6s equal to your Rage Damage bonus, and add them together. The damage has the same type as the weapon or Unarmed Strike used for the attack."
      }
    ],
    "6": [
      {
        name: "Mindless Rage",
        description: "You have Immunity to the Charmed and Frightened conditions while your Rage is active. If you're Charmed or Frightened when you enter your Rage, the condition ends on you."
      }
    ],
    "10": [
      {
        name: "Retaliation",
        description: "When you take damage from a creature that is within 5 feet of you, you can take a Reaction to make one melee attack against that creature, using a weapon or an Unarmed Strike."
      }
    ],
    "14": [
      {
        name: "Intimidating Presence",
        description: "As a Bonus Action, you can strike terror into others with your menacing presence and primal power. When you do so, each creature of your choice in a 30-foot Emanation originating from you must make a Wisdom saving throw (DC 8 plus your Strength modifier and Proficiency Bonus). On a failed save, a creature has the Frightened condition for 1 minute. At the end of each of the Frightened creature's turns, the creature repeats the save, ending the effect on itself on a success.\n	Once you use this feature, you can't use it again until you finish a Long Rest unless you expend a use of your Rage (no action required) to restore your use of it."
      }
    ]
  },
  "Path of the Wild Heart": {
    "3": [
      {
        name: "Rage of the Wilds",
        description: "Your Rage taps into the primal power of animals. Whenever you activate your Rage, you gain one of the following options of your choice.\n - **Bear**: While your Rage is active, you have Resistance to every damage type except Force, Necrotic, Psychic, and Radiant.\n - **Eagle**: When you activate your Rage, you can take the Disengage and Dash actions as part of that Bonus Action. While your Rage is active, you can take a Bonus Action to take both of those actions.\n - **Wolf**: While your Rage is active, your allies have Advantage on attack rolls against any enemy of yours within 5 feet of you."
      }
    ],
    "6": [
      {
        name: "Aspect of the Wilds",
        description: "You gain one of the following options of your choice. Whenever you finish a Long Rest, you can change your choice.\n - **Owl**: You have Darkvision with a range of 60 feet. If you already have Darkvision, its range increases by 60 feet.\n - **Panther**: You have a Climb Speed equal to your Speed.\n - **Salmon**: You have a Swim Speed equal to your Speed."
      }
    ],
    "10": [
      {
        name: "Nature Speaker",
        description: "You can cast the Commune with Nature spell but only as a Ritual. Wisdom is your spellcasting ability for it."
      }
    ],
    "14": [
      {
        name: "Power of the Wilds",
        description: "Whenever you activate your Rage, you gain one of the following options of your choice.\n - **Falcon**: While your Rage is active, you have a Fly Speed equal to your Speed if you aren't wearing any armor.\n - **Lion**: While your Rage is active, any of your enemies within 5 feet of you have Disadvantage on attack rolls against targets other than you or another Barbarian who has this option active.\n - **Ram**: While your Rage is active, you can cause a Large or smaller creature to have the Prone condition when you hit it with a melee attack."
      }
    ]
  },
  "Path of the World Tree": {
    "3": [
      {
        name: "Vitality of the Tree",
        description: "Your Rage taps into the life force of the World Tree. You gain the following benefits.\n - **Vitality Surge**: When you activate your Rage, you gain a number of Temporary Hit Points equal to your Barbarian level.\n **Life-Giving Force**: At the start of each of your turns while your Rage is active, you can choose another creature within 10 feet of yourself to gain Temporary Hit Points. To determine the number of Temporary Hit Points, roll a number of d6s equal to your Rage Damage bonus, and add them together. If any of these Temporary Hit Points remain when your Rage ends, they vanish."
      }
    ],
    "6": [
      {
        name: "Branches of the Tree",
        description: "Whenever a creature you can see starts its turn within 30 feet of you while your Rage is active, you can take a Reaction to summon spectral branches of the World Tree around it. The target must succeed on a Strength saving throw (DC 8 plus your Strength modifier and Proficiency Bonus) or be teleported to an unoccupied space you can see within 5 feet of yourself or in the nearest unoccupied space you can see. After the target teleports, you can reduce its Speed to O until the end of the current turn."
      }
    ],
    "10": [
      {
        name: "Battering Roots",
        description: "During your turn, your reach is 10 feet greater with any Melee weapon that has the Heavy or Versatile property, as tendrils of the World Tree extend from you. When you hit with such a weapon on your turn, you can activate the Push or Topple mastery property in addition to a different mastery property you're using with that weapon."
      }
    ],
    "14": [
      {
        name: "Travel along the Tree",
        description: "When you activate your Rage and as a Bonus Action while your Rage is active, you can teleport up to 60 feet to an unoccupied space you can see.\n	In addition, once per Rage, you can increase the range of that teleport to 150 feet. When you do so, you can also bring up to six willing creatures who are within 10 feet of you. Each cFeature teleports to an unoccupied space of yom:i choice within 10 feet of your destination space."
      }
    ]
  },
  "Path of the Zealot": {
    "3": [
      {
        name: "Divine Fure",
        description: "On each of your turns while your Rage is active, the first creature you hit with a weapon or an Unarmed Strike takes extra damage equal to ld6 plus half your Barbarian level (round down). The extra damage is Necrotic or Radiant; you choose the type each time you deal the damage."
      },
      {
        name: "Warrior of the Gods",
        description: "You have a pool of four dl2s that you can spend to heal yourself. As a Bonus Action, you can expend dice from the pool, roll them, and regain a number of Hit Points equal to the roll's total.\n	Your pool regains all expended dice when you finish a Long Rest.\nThe pool's maximum number of dice increases by one when you reach Barbarian levels 6 (5 dice), 12 (6 dice), and 17 (7 dice)."
      }
    ],
    "6": [
      {
        name: "Fanatical Focus",
        description: "Once per active Rage, if you fail a saving throw, you can reroll it with a bonus equal to your Rage Damage bonus, and you must use the new roll."
      }
    ],
    "10": [
      {
        name: "Zealous Presence",
        description: "As a Bonus Action, you unleash a battle cry infused with divine energy. Up to ten other creatures of your choice within 60 feet of you gain Advantage on attack rolls and saving throws until the start of your next turn.\n	Once you use this feature, you can't use it again until you finish a Long Rest unless you expend a use of your Rage (no action required} to restore your use of it."
      }
    ],
    "14": [
      {
        name: "Rage of the Gods",
        description: "When you activate your Rage, you can assume the form of a divine warrior. This form lasts for 1 minute or until you drop to O Hit Points. Once you use this feature, you can't do so again until you finish a Long Rest.\n	While in this form, you gain the benefit **Flight**. You have a Fly Speed equal to your Speed and can hover."
      }
    ]
  }
};

// rulebook/classes/barbarian.json
var barbarian_default = {
  class: "Barbarian",
  subclassFile: "barbarian-subclasses",
  "starting-equipment": {
    A: {
      items: {
        greataxe: 1,
        handaxe: 4,
        longsword: 1,
        "explorers-pack": 1
      },
      gold: 15
    },
    B: { items: {}, gold: 75 }
  },
  features: {
    "1": [
      {
        name: "Rage",
        description: "While active, your Rage follows the rules below:\n - **Damage Resistance**:\nYou have Resistance to Bludgeoning, Piercing, and Slashing damage.\n - **Rage Damage**: When you make an attack using Strength-with either a weapon or an Unarmed Strike-and deal damage to the target, you gain a bonus to the damage that increases as you gain levels as a Barbarian, as shown in the Rage Damage column of the Barbarian Features table.\n - **Strength Advantage**:\nYou have Advantage on Strength checks and Strength saving throws.\n - **No Concentration or Spells**:\nYou can't maintain Concentration, and you can't cast spells.\n - **Duration**: The Rage lasts until the end of your next turn, and it ends early if you don Heavy armor or have the Incapacitated condition. If your Rage is still active on your next turn, you can extend the Rage for another round by doing one of the following:\n - Make an attack roll against an enemy.\n - Force an enemy to make a saving throw.\n - Take a Bonus Action to extend your Rage."
      }
    ],
    "2": [
      {
        name: "Danger Sense",
        description: "You gain an uncanny sense of when things aren't as they should be, giving you an edge when you dodge perils. You have Advantage on Dexterity saving throws unless you have the Incapacitated condition."
      }
    ],
    "3": [
      {
        name: "Primal Knowledge",
        description: "while your Rage is active, you can channel primal power when you attempt certain tasks; whenever you make an ability check using one of the following skills, you can make it as a Strength check even if it normally uses a different ability: Acrobatics, Intimidation, Perception, Stealth, or Survival."
      }
    ],
    "5": [
      {
        name: "Extra Attack",
        description: "You can attack twice instead of once whenever you take the Attack action on your turn."
      }
    ],
    "7": [
      {
        name: "Feral Instinct",
        description: "Your instincts are so honed that you have Advantage on Initiative rolls."
      },
      {
        name: "Instinctive Pounce",
        description: "As part of the Bonus Action you take to enter your Rage, you can move up to half your Speed."
      }
    ],
    "9": [
      {
        name: "Brutal Strike",
        description: "If you use Reck.less Attack, you can forgo any Advantage on one Strength-based attack roll of your choice on your turn. The chosen attack roll mustn't have Disadvantage. If the chosen attack roll hits, the target takes an extra ldlO damage of the same type dealt by the weapon or Unarmed Strike, and you can cause one Brutal Strike effect of your choice. You have the following effect options.\n - **Forceful Blow**: The target is pushed 15 feet straight away from you. You can then move up to half your Speed straight toward the target without provoking Opportunity Attacks.\n - **Hamstering Blow**: The target's Speed is reduced by 15 feet until the start of your next turn. A target can be affected by only one Hamstring Blow at a timethe most recent one."
      }
    ],
    "11": [
      {
        name: "Relentless Rage",
        description: "Your Rage can keep you fighting despite grievous wounds. If you drop to O Hit Points while your Rage is active and don't die outright, you can make a DC 10 Constitution saving throw. If you succeed, your Hit Points instead change to a number equal to twice your Barbarian level.\n  Each time you use this feature after the first, the DC increases by 5. When you finish a Short or Long Rest, the DC resets to 10."
      }
    ],
    "13": [
      {
        name: "Improved Brutal Strike",
        description: "You have honed new ways to attack furiously. The following effects are now among your Brutal Strike options.\n - **Staggering Blow**: The target has Disadvantage on the next saving throw it makes, and it can't make Opportunity Attacks until the start of your next turn.\n - **Sundering Blow**: Before the start of your next turn, the next attack roll made by another creature against the target gains a +5 bonus to the roll. An attack roll can gain only one Sundering Blow bonus."
      }
    ]
  }
};

// rulebook/classes/bard-subclasses.json
var bard_subclasses_default = {
  "College of Dance": {
    "3": [
      {
        name: "Dazzling Footwork",
        description: " - **Dance Virtuoso**: You have Advantage on any Charisma (Performance) check you make that involves you dancing.\n - **Agile Strikes**: When you expend a use of your Bardic Inspiration as part of an action, a Bonus Action, or a Reaction, you can make one Unarmed Strike as part of that action, Bonus Action, or Reaction\n - **Bardic Damage**: You can use Dexterity instead of Strength for the attack rolls of your Unarmed Strikes. When you deal damage with an Unarmed Strike, you can deal Bludgeoning damage equal to a roll of your Bardic Inspiration die plus your Dexterity modifier, instead of the strike's normal damage. This roll doesn't expend the die."
      }
    ],
    "6": [
      {
        name: "Inspiring Movement",
        description: "When an enemy you can see ends its turn within 5 feet of you, you can take a Reaction and expend one use of your Bardic Inspiration to move up to half your Speed. Then one ally of your choice within 30 feet of you can also move up to half their Speed using their Reaction.\n  None of this feature's movement provokes Opportunity Attacks."
      },
      {
        name: "Tandem Footwork",
        description: "When you roll Initiative, you can expend one use of your Bardic Inspiration if you don't have the Incapacitated condition. When you do so, roll your Bardic Inspiration die; you and each ally within 30 feet of you who can see or hear you gains a bonus to Initiative equal to the number rolled."
      }
    ],
    "14": [
      {
        name: "Leading Evasion",
        description: "When you are subjected to an effect that allows you damage, you instead take no damage if you succeed on the saving throw and only half damage if you fail. If any creatures within 5 feet of you are making the same Dexterity saving throw, you can share this benefit with them for that save.\n  You can't use this feature if you have the Incapacitated condition."
      }
    ]
  },
  "College of Glamour": {
    "3": [
      {
        name: "Beguiling Magic",
        description: "immediately after you cast an Enchantment or Illusion spell using a spell slot, you can cause a creature you can see within 60 feet of yourself to make a Wisdom saving throw against your spell save DC. On a failed save, the target has the Charmed or Frightened condition (your choice) for 1 minute. The target repeats the save at the end of each of its turns, ending the effect on itself on a success.\n  Once you use this benefit, you can't use it again until you finish a Long Rest. You can also restore your use of it by expending one use of your Bardic Inspiration (no action required)."
      },
      {
        name: "Mantle of Inspiearion",
        description: "You can weave fey magic into a song or dance to fill others with vigor. As a Bonus Action, you can expend a use of Bardic Inspiration, rolling a Bardic Inspiration die. When you do so, choose a number of other creatures within 60 feet of yourself, up to a number equal to your Charisma modifier (minimum of one creature). Each of those creatures gains a number of Temporary Hit Points equal to two times the number rolled on the Bardic Inspiration die, and then each can use its Reaction to move up to its Speed without provoking Opportunity Attacks."
      }
    ],
    "6": [
      {
        name: "Mantle of Majestry",
        description: "You always have the Command spell prepared.\n  As a Bonus Action, you cast Command without expending a spell slot, and you take on an unearthly appearance for 1 minute or until your Concentration ends. During this time, you can cast Command as a Bonus Action without expending a spell slot .Any creature Charmed by you automaticaily fails its saving throw against the Command you cast with this feature.\n  Once you use this feature, you can't use it again until you finish a Long Rest. You can a lso res tore your use of it by expending a level 3+ s pell slot (no action required)."
      }
    ],
    "14": [
      {
        name: "Unbreakable Majesty",
        description: "As a Bonus Action, you can assume a magically majestic presence for 1 minute or until you have the Incapacitated condition. For the duration, whenever any creature hits you with an attack roll for the first time on a turn, the attacker must succeed on a Charisma saving throw against your spell save DC, or the attack misses instead, as the creature recoils from your majesty. Once you assume this majestic presence, you can't do so again until you finish a Short or Long Rest."
      }
    ]
  },
  "College of Lore": {
    "3": [
      {
        name: "Cutting Words",
        description: "You learn to use your wit to supernaturally distract, confuse, and otherwise sap the confidence and competence of others. When a creature that you can see within 60 feet of yourself makes a damage roll or succeeds on an ability check or attack roll, you can take a Reaction to expend one use of your Bardic Inspiration; roll your Bardic Inspiration die, and subtract the number rolled from the creature's roll, reducing the damage or potentially turning the success into a failure."
      }
    ],
    "6": [
      {
        name: "Magical Discoveries",
        description: "You learn two spells of your choice. These spells can come from the Cleric, Druid, or Wizard spell list or any combination thereof (see a class's section for its spell list). A spell you choose must be a cantrip or a spell for which you have spell slots, as shown in the Bard Features table.\n  You always have the chosen spells prepared, and whenever you ga in a Bard level, you can replace one of the spells with another spell that meets these requirements."
      }
    ],
    "14": [
      {
        name: "Peerless Skill",
        description: "When you make an ability check or attack roll and fail. you can expend one use of Bardic Inspiration; roll the Bardic Inspiration die, and add the number rolled to the d20, potentially turning a failure into a success. On a failure, the Bardic Inspiration isn't expended."
      }
    ]
  },
  "College of Valor": {
    "3": [
      {
        name: "",
        description: "A creature that has a Bardic Inspiration die from you can use it for one of the following effects.\n - **Defense**: When the creature is hit by an attack roll, that creature can use its Reaction to roll the Bardic Inspiration die and add the number rolled to its AC against that attack, potentially causing the attack to miss.\n - **Offense**: Immediately after the creature hits a target with an attack roll, the creature can roll the Bardic Inspiration die and add the number rolled to the attack's damage against the target."
      }
    ],
    "6": [
      {
        name: "Extra Attack",
        description: "You can attack twice instead of once whenever you take the Attack action on your turn.\n  In addition, you can cast one of your can trips that has a casting time of an action in place of one of those attacks."
      }
    ],
    "14": [
      {
        name: "Battle Magic",
        description: "After you cast a spell that has a casting time of an action, you can make one attack with a weapon as a Bonus Action."
      }
    ]
  }
};

// rulebook/classes/bard.json
var bard_default = {
  class: "Bard",
  subclassFile: "bard-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "leather-armor": 1,
        dagger: 2,
        "musical-instrument|": 1,
        "entertainers-pack": 1
      },
      gold: 19
    },
    B: { items: {}, gold: 0 }
  },
  features: {
    "1": [
      {
        name: "Bardic Inspiration",
        description: "As a Bonus Action, you can inspire another creature within 60 feet of yourself who can see or hear you. That creature gains one of your Bardic Inspiration dice.\n - **Number of Uses**: You can confer a Bardic Inspiration die a number of times equal to your Charisma modifier (minimum of once), and you regain all expended uses when you finish a Long Rest."
      }
    ],
    "2": [
      {
        name: "Jack of All Trades",
        description: "You can add half your Proficiency Bonus (round down) to any ability check you make that uses a skill proficiency you lack and that doesn't otherwise use your Proficiency Bonus."
      }
    ],
    "5": [
      {
        name: "Font of Inspiration",
        description: "You can expend a spell slot (no action required) to regain one expended use of Bardic Inspiration."
      }
    ],
    "7": [
      {
        name: "Countercharm",
        description: "You can use musical notes or words of power to disrupt mind-influencing effects. If you or a creature within 30 feet of you fails a saving throw against an effect that applies the Charmed or Frightened condition, you can take a Reaction to cause the save to be rerolled, and the new roll has Advantage."
      }
    ],
    "18": [
      {
        name: "Superior Inspiration",
        description: "When you roll Initiative, you regain expended uses of Bardic Inspiration until you have two if you have fewer than that"
      }
    ],
    "20": [
      {
        name: "Words of Creation",
        description: "You have mastered two of the Words of Creation: the words of life and death. You therefore always have the Power Word Heal and Power Word Kill spells prepared. When you cast either spell, you can target a second creature with it if that creature is within 10 feet of the first target."
      }
    ]
  }
};

// rulebook/classes/cleric-subclasses.json
var cleric_subclasses_default = {
  "Life Domain": {
    "3": [
      {
        name: "Discipline of Life",
        description: "When a spell you cast with a spell slot restores Hit Points to a creature, that creature regains additional Hit Points on the turn you cast the spell. The additional Hit Points equal 2 plus the spell slot's level."
      },
      {
        name: "Life Domain Spells",
        description: "When you reach a Cleric level specified in the Life Domain Spells table, you thereafter always have the listed spells prepared.\n\n| Cleric Level | Prepared Spells |\n| :-----: | ----- |\n| 3 | Aid, Bless, Cure Wounds, Lesser Restoration |\n| 5 | Mass Healing Word, Revivify |\n| 7 | Aura of Life, Death Ward |\n| 9 | Greater Restoration, Mass Cure Wounds |"
      },
      {
        name: "Preserve Life",
        description: "As a Magic action, you present your Holy Symbol and expend a use of your Channel Divinity to evoke healing energy that can restore a number of Hit Points equal to five times your Cleric level. Choose Bloodied creatures within 30 feet of yourself (which can include you), and divide those Hit Points among them. This feature can restore a creature to no more than half its Hit Point maximum."
      }
    ],
    "6": [
      {
        name: "Blessed Healer",
        description: "he healing spells you cast on others heal you as well. Immediately after you cast a spell with a spell slot that restores Hit Points to one or more creatures other than yourself, you regain Hit Points equal to 2 plus the spell slot's level."
      }
    ]
  },
  "Light Domain": {
    "3": [
      {
        name: "Light Domain Spells",
        description: "When you reach a Cleric level specified in the Light Domain Spells table, you thereafter always have the listed spells prepared.\n\n| Cleric Level | Prepared Spells |\n| :-----: | ----- |\n| 3 | Burning Hands, Faerie Fire, Scorching Ray, See Invisibility |\n| 5 | Daylight, Fireball |\n| 7 | Arcane Eye, Wall of Fire |\n| 9 | Flame Strike, Scrying |"
      },
      {
        name: "Radiance of the Dawn",
        description: "As a Magic action, you present your Holy Symbol and expend a use of your Channel Divinity to emit a flash of light in a 30-foot Emanation originating from yourself. Any magical Darkness-such as that created by the Darkness spell-in that area is dispelled. Additionally, each creature of your choice in that area must make a Constitution saving throw, taking Radiant damage equal to 2d10 plus your Cleric level on a failed save or half as much damage on a successful one."
      },
      {
        name: "Warding Flare",
        description: "When a creature that you can see within 30 feet of yourself makes an attack roll, you can take a Reaction to impose Disadvantage on the attack roll, causing light to flare before it hits or misses.\n  You can use this feature a number of times equal to your Wisdom modifier (minimum of once). You regain all expended uses when you finish a Long Rest."
      }
    ],
    "6": [
      {
        name: "Improved Warding Flare",
        description: "You regain all expended uese of Warding Flare when you finish a Short or Long Rest.\n  In addition, whenever you use Warding Flare, you can give the target of the triggering attack a number of Temporary Hit Points equal to 2d6 plus your Wisdom modifier."
      }
    ],
    "17": [
      {
        name: "Corona of Light",
        description: "As a Magic action, you cause yourself to emit an aura of sunlight that lasts for 1 minute or until you dismiss it (no action required). You emit Bright Light in a 60-foot radius and Dim Light for an additional 30 feet. Your enemies in the Bright Light have Disadvantage on saving throws against your Radiance of the Dawn and any spell that deals Fire or Radiant damage.\n  You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest."
      }
    ]
  },
  "Trickery Domain": {
    "3": [
      {
        name: "Blessing of the Trickstrer",
        description: "As a Magic action, you can choose yourself or a willing creature within 30 feet of yourself to have Advantage on Dexterity (Stealth) checks. This blessing lasts until you finish a Long Rest or you use this feature again"
      },
      {
        name: "Invoke Duplicity",
        description: "As a Bonus Action, you can expend one use of your Channel Divinity to create a perfect visual illusion of yourself in an unoccupied space you can see within 30 feet of yourself. The illusion is intangible and doesn't occupy its space. It lasts for 1 minute, but it ends early if you dismiss it (no action required) or have the Incapacitated condition. The illusion is animated and mimics your expressions and gestures. While it persists, you ga in the following benefits:\n - **Cast Spells**: You can cast spells as though you were in the illusion's space, but you must use your own senses.\n - **Distract**: When both you and yo ur illusion are within 5 feet of a creature that can see the illusion you have Advantage on attack rolls against that creature, given how distracting the illusion is to the target.\n - **Move**: As a Bonus Action, you can move the illusion up to 30 feet to an unoccupied space you can see that is within 120 feet of yourself."
      },
      {
        name: "Trickster Domain Spells",
        description: "When you reach a Cleric level specified in the Trickery Domain Spells table, you thereafter always have the listed spells prepared.\n\n| Cleric Level | Prepared Spells |\n| :-----: | ----- |\n| 3 | Charm Person, Disguise Self, Invisibility, Pass without Trace |\n| 5 | Hypnotic Pattern , Nondetection |\n| 7 | Confusion, Dimension Door |\n| 9 | Dominate Person, Modify Memory |"
      }
    ],
    "6": [
      {
        name: "Trickster's Transposition",
        description: "Whenever you take the Bonus Action to create or move the illusion of your Invoke Duplicity, you can teleport, swapping places with the illusion."
      }
    ],
    "17": [
      {
        name: "Improved Duplicity",
        description: "The illusion of your Invoke Duplicity has grown more powerful in the following ways.\n - **Shared Distraction**: When you and your allies make attack rolls against a creature within 5 feet of the illusion, the attack rolls have Advantage.\n - **Healing Illusion**: When the illusion ends, you or a creature of your choice within 5 feet of it regains a number of Hit Points equal to your Cleric level"
      }
    ]
  },
  "War Domain": {
    "3": [
      {
        name: "Guided Strike",
        description: "When you or a creature within 30 feet of you misses with an attack roll, you can expend one use of you r Channel Divinity and give that roll a + 10 bonus, potentially causing it to hit. When you use this feature to benefit another creature's attack roll, you must take a Reaction to do so."
      },
      {
        name: "War Domain Spells",
        description: "When you reach a Cleric level specified in the War Domain Spells table, you thereafter always have the listed spells prepared.\n\n| Cleric Level | Prepared Spells |\n| :-----: | ----- |\n| 3 | Guiding Bolt, Magic Weapon, Shield of Faith, Spiritual Weapon |\n| 5 | Crusader's Mantle, Spirit Guardians |\n| 7 | Fire Shield, Freedom of Movement |\n| 9 | Hold Monster, Steel Wind Strike |"
      },
      {
        name: "War Priest",
        description: "As a Bonus Action, you can make one attack with a weapon or an Unarmed Strike. You can use this Bonus Action a number of times equal to your Wisdom modifier (minimum of once). You regain all expended uses when you finish a Short or Long Rest."
      }
    ],
    "6": [
      {
        name: "War God's Blessing",
        description: "You can expend a use of your Channel Divinity to cast Shield of Faith or Spiritual Weapon rather than expending a spell slot. When you cast either spell in this way, the spell doesn't require Concentration. Instead the spell lasts for 1 minute, but it ends early if you cast that spell again, have the Incapacitated condition, or die"
      }
    ],
    "17": [
      {
        name: "Avatar of Battle",
        description: "You gain Resistance to Bludgeoning, Piercing, and Slashing damage"
      }
    ]
  }
};

// rulebook/classes/cleric.json
var cleric_default = {
  class: "Cleric",
  subclassFile: "cleric-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "chain-shirt": 1,
        shield: 1,
        mace: 1,
        "Holy Symbol": 1,
        "Priest's Pack": 1
      },
      gold: 7
    },
    B: { items: {}, gold: 110 }
  },
  features: {
    "2": [
      {
        name: "Channel Divinity",
        description: "You can channel divine energy directly from the Outer Planes to fuel magical effects. You start with two such effects: Divine Spark and Turn Undead. You can use this class's Channel Divinity twice. You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.\n - **Divine Spark**: As a Magic action, you point your Holy Symbol at another creature you can see within 30 feet of yourself and focus divine energy at it. Roll ld8 and add your Wisdom modifier. You either restore Hit Points to the creature equal to that total or force the creature to make a Constitution saving throw. On a failed save, the creature takes Necrotic or Radiant damage (your choice) equal to that total. On a successful save, the creature takes half as much damage (round down).\n - **Turn Undead**: As a Magic action, you present your Holy Symbol and censure Undead creatures. Each Undead of your choice within 30 feet of you must make a Wisdom saving throw. If the creature fails its save, it has the Frightened and Incapacitated conditions for 1 minute. For that duration, it tries to move as far from you as it can on its turns. This effect ends early on the creature if it takes any damage, if you have the Incapacitated condition, or if you die."
      }
    ],
    "5": [
      {
        name: "Sear Undead",
        description: "Whenever you use Turn Undead, you can roll a number of d8s equal to your Wisdom modifier (minimum of ld8) and add the rolls together. Each Undead that fails its saving throw against that use of Turn Undead takes Radiant damage equal to the roll's total. This damage doesn't end the turn effect."
      }
    ],
    "7": [
      {
        name: "Blessed Strikes",
        description: "You gain one of the following options of your choice:\n - **Divine Strike**:\nOnce on each of your turns when you hit a creature with an attack roll using a weapon, you can cause the target to take an extra 1d8 Necrotic or Radiant damage.\n - **Potent Spellcasting**:\nAdd your Wisdom modifier to the damage you deal with any Cleric cantrip."
      }
    ],
    "10": [
      {
        name: "Devine Intervention",
        description: "As a Magic action, choose any Cleric spell of level 5 or lower that doesn't require a Reaction to cast. As part of the same action, you cast that spell without expending a spell slot or needing Material components. You can't use this feature again until you finish a Long Rest."
      }
    ],
    "14": [
      {
        name: "Improved Blessed Strikes",
        description: "The option you chose for Blessed Strikes grows more powerful:\n - **Divine Strike**:\nThe extra damage of your Divine Strike increases to 2d8.\n - **Potent Spellcasting**:\nWhen you cast a Cleric cantrip and deal damage to a creature with it, you can give vitality to yourself or another creature within 60 feet of yourself, granting a number of Temporary Hit Points equal to twice your Wisdom modifier."
      }
    ]
  }
};

// rulebook/classes/druid-subclasses.json
var druid_subclasses_default = {
  "Circle of the Land": {
    "3": [
      {
        name: "Lans's Aid",
        description: "As a Magic action, you can expend a use of your Wild Shape and choose a point within 60 feet of yourself. Vitality-giving flowers and life-draining thorns appear for a moment in a 10-foot-radius Sphere centered on that point. Each creature of your choice in the Sphere must make a Constitution saving throw against your spell save DC, taking 2d6 Necrotic damage on a failed save or half as much damage on a successful one. One creature of your choice in that area regains 2d6 Hit Points.\n  The damage and healing increase by ld6 when you reach Druid levels 10 (3d6) and 14 (4d6)."
      }
    ],
    "6": [
      {
        name: "Natural Recovery",
        description: "You can cast one of the level 1 + spells that you have prepared from your Circle Spells feature without expending a spell slot, and you must finish a Long Rest before you do so again.\n In addition, when you finish a Short Rest, you can choose expended spell slots to recover. The spell slots can have a combined level that is equal to or less than half your Druid level (round up), and none of them can be level 6+ . For example, if you're a level 6 Druid, you can recover up to three levels' worth of spell slots. Once you recover spell slots with this feature, you can't do so again until you finish a Long Rest."
      }
    ],
    "10": [
      {
        name: "Nature's Ward",
        description: "You are immune to the Poisoned condition, and you have Resistance to a damage type associated with your current land choice in the Circle Spells feature, as shown in the Nature's Ward table.\n#### Nature's Ward\n| Land Type  | Arid | Polar | Temprate  | Tropical |\n| ----- | ----- | ----- | ----- | ----- |\n| Resistance | Fire | Cold | Lightning | Poison |"
      }
    ],
    "14": [
      {
        name: "Nature's Sanctuary",
        description: "As a Magic action, you can expend a use of your Wild Shape and cause spectral trees and vines to appear in a 15-foot Cube on the ground within 120 feet of yourself. They last there for 1 minute or until you have the Incapacitated condition or die. You and your allies have Half Cover while in that a rea and your allies gain the current Resistance of your Nature's Ward while there."
      }
    ]
  },
  "Circle of the Moon": {
    "3": [
      {
        name: "Circle of the Moon",
        description: " - **Challenge Rating**: The maximum Challenge Rating for the form equals your Druid level divided by 3 (round down).\n - **Armor Class**: Until you leave the form, your AC equals 13 plus your Wisdom modifier if that total is higher than the Beast's AC.\n - **Temporary Hit Points**: You gain a number of Temporary Hit Points equal to three times your Druid level."
      },
      {
        name: "Circle of the Moon Spells",
        description: "When you reach a Druid level specified in the Circle of the Moon Spells table, you ther eafter always have the listed spells prepared.\n#### Circle of the Moon Spells\n\n| Level 3 | Level 5 | Level 7 | Level 9 |\n| ----- | ----- | ----- | ----- |\n| Cure Wounds, Moonbeam, Starry Wisp | Conjure Animals | Fount of Moonlight | Mass Cure Wounds |"
      }
    ],
    "6": [
      {
        name: "Improved Circle Forms",
        description: "While in a Wild Shape form, you gain the following benefits:\n - **Lunar Radiance**: Each of your attacks in a Wild Shape form can deal its normal damage type or Radiant damage. You make this choice each time you hit with those attacks.\n - **Increased Toughness**: You can add your Wisdom modifier to your Constitution saving throws."
      }
    ],
    "10": [
      {
        name: "Moonlight Step",
        description: "As a Bonus Action, you teleport up to 30 feet to an unoccupied space you can see, and you have Advantage on the next attack roll you make before the end of this turn.\n	You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest. You can also regain uses by expending a level 2+ spell slot for each use you want to restore (no action required)."
      }
    ],
    "14": [
      {
        name: "Lunar Form",
        description: " - **Improved Lunar Radiance**: Once per turn, you can deal an extra 2d10 Radiant damage to a target you hit with a Wild Shape form's attack.\n - **Shared Moonlight**: Whenever you use MoonlightStep, you can also teleport one willing creature. That creature must be within 10 feet of you, and you teleport it to an unoccupied space you can see within 10 fe et of your destination space."
      }
    ]
  },
  "Circle of the Sea": {
    "3": [
      {
        name: "Circle of the Sea Spells",
        description: "When you reach a Druid level specified in the Circle of the Sea Spells table, you thereafter always have the listed spells prepared.\n#### Circle of the Sea Spells\n\n| Level 3 | Level 5 | Level 7 | Level 9 |\n| ----- | ----- | ----- | ----- |\n| Fog Cloud, Gust of Wind, Ray of Frost, Shatter, Thunderwave | Lightning Bolt, Water Breathing | Control Water, Ice Storm | Conjure Elemental, Hold Monster |"
      },
      {
        name: "Wrath of the Sea",
        description: "As a Bonus Action, you can expend a use of your Wild Shape to manifest a 5-foot Emanation that takes the form of ocean spray that surrounds you for 10 minutes. It ends early if you dismiss it (no action required), manifest it again, or have the Incapacitated condition.\n	When you manifest the Emanation and as a Bonus Action on your subsequent turns, you can choose another creature you can see in the Emanation. The target must succeed on a Constitution saving throw against your spell save DC or take Cold damage and, if the creature is Large or smaller, be pushed up to 15 feet away from you. To determine this damage, roll a number of d6s equal to your Wisdom modifier (minimum of one die)."
      }
    ],
    "6": [
      {
        name: "Aquatic Afinity",
        description: "The size of the Emanation created by your Wrath of the Sea increases to 10 feet.\n	In addition, you gain a Swim Speed equal to your Speed."
      }
    ],
    "10": [
      {
        name: "Stormborn",
        description: "Your Wrath of the Sea confers two more benefits while active, as detailed below.\n - **Flight**: You gain a Fly Speed equal to your Speed.\n - **Resistance**: You have Resistance to Cold, Lightning, and Thunder damage."
      }
    ],
    "14": [
      {
        name: "Oceanic Gift",
        description: "Instead of manifesting the Emanation of Wrath of the Sea around yourself, you can manifest it around one willing creature within 60 feet of yourself. That creature gains all the benefits of the Emanation and uses your spell save DC and Wisdom modifier for it.\n	In addition, you can manifest the Emanation around both the other creature and yourself if you expend two uses of your Wild Shape ins tead of one when manifesting it."
      }
    ]
  },
  "Circle of the Stars": {
    "3": [
      {
        name: "Star Map",
        description: "You've created a star chart as part of your heavenly studies, and while holding it you have the Guidance and Guiding Bolt spells prepared, and you can cast Guiding Bolt without expending a spell slot. You can cast it in that way a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest."
      },
      {
        name: "Starry Form",
        description: "As a Bonus Action, you can expend a use of your Wild Shape feature to take on a starry fo rm rather than shape-shifting.\n	This form sheds Bright Light in a 10-foot radius and Dim Light for a n additional 10 feet. The form lasts for 10 m inutes. It ends early if you dismiss it (no action required), have the Inca pacitated condition, or use this feature again. Whenever you assume your starry form, choose which of the following constellations glimmers on your body:\n - **Archer**: As a Bonus Action you can make a ranged spell attack, hurling a luminous arrow that targets one creature within 60 feet of yourself. On a hit, the attack deals Radiant damage equal to ld8 plus your Wisdom modifier.\n - **Chalice**: Whenever you cast a spell using a spell slot that restores Hit Points to a creature, you or another creature within 30 feet of you can regain Hit Points equal to ld8 plus your Wisdom modifier.\n - **Dragon**: When you make an Intelligence or a Wisdom check or a Constitution saving throw to maintain Concentration, you can treat a roll of 9 or lower on the d20 as a 10."
      }
    ],
    "6": [
      {
        name: "Cosmic Omen",
        description: "Whenever you finish a Long Rest, you can consult your Star Map for omens and roll a die. Until you finish your next Long Rest, you gain access to a special Reaction based on whether you rolled an even or an odd number on the die:\n - **Weal** (Even): Whenever a creature you can see within 30 feet of you is about to make a D20 Test, you can take a Reaction to roll ld6 and add the number rolled to the total.\n - **Woe** (Odd): Whenever a creature you can see within 30 feet of you is about to make a D20 Test, you can take a Reaction to roll ld6 and subtract the number rolled from the total.\nYou can use this Reaction a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest."
      }
    ],
    "10": [
      {
        name: "Twinkling Constellations",
        description: "At the start of each of your turns while in your Starry Form, you can change which constellation glimmers on your body."
      }
    ],
    "14": [
      {
        name: "Full of Stars",
        description: "While in your Starry Form, you become partially incor poreal, giving you Resistance to Bludgeoning, Piercing, a nd Slashing damage."
      }
    ]
  }
};

// rulebook/classes/druid.json
var druid_default = {
  class: "Druid",
  subclassFile: "druid-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "leather-armor": 1,
        shield: 1,
        sickle: 1,
        quarterstaff: 1,
        "explorers-pack": 1,
        "herbalism-kit": 1
      },
      gold: 9
    },
    B: { items: {}, gold: 50 }
  },
  features: {
    "1": [
      {
        name: "Druidic",
        description: "While learning Druidic you also unlocked the magic of communicating with animals; you always have the Speak with Animals spell prepared.\n  You can use Druidic to leave hidden messages. You and others who know Druidic automatically spot such a message. Others spot the message's presence with a successful DC 15 Intelligence (Investigation) check but can't decipher it without magic"
      }
    ],
    "2": [
      {
        name: "Wild Shape",
        description: "As a Bonus Action, you shape-shift into a Beast form that you have learned for this feature. You stay in that form for a number of hours equal to half your Druid level or until you use Wild Shape again, have the Incapacitated condition, or die. You can also leave the form early as a Bonus Action.\n  **Number of Uses**: You can use Wild Shape twice. You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.\n  Whenever you finish a Long Rest, you can replace one of your known forms with another eligible form.\n  **Temporary Hit Points**: When you assume a Wild Shape form, you gain a number of Temporary Hit Points equal to your Druid level."
      },
      {
        name: "Wild Companion",
        description: "You can summon a nature spirit that assumes an animal form to aid you. As a Magic action, you can expend a spell slot or a use of Wild Shape to cast the Find Familiar spell without Material components.\n  When you cast the spell in this way, the familiar is Fey and disappears when you finish a Long Rest."
      }
    ],
    "5": [
      {
        name: "Wild Resurgence",
        description: "Once on each of your turns, if you have no uses of Wild Shape left, you can give yourself one use by expending a spell slot (no action required).\n  In addition, you can expend one use of Wild Shape (no action required) to give yourself a level 1 spell slot, but you can't do so again until you finish a Long Rest."
      }
    ],
    "7": [
      {
        name: "Elemental Fury",
        description: "The might of the elements flows through you. You gain one of the following options of your choice.\n - **Potent Spellcasting**: Add your Wisdom modifier to the damage you deal with any Druid cantrip.\n - **Primal Strike**: Once on each of your turns when you hit a creature with an attack roll using a weapon or a Beast form's attack in Wild Shape, you can cause the target to take an extra ld8 Cold, Fire, Lightning, or Thunder damage (choose when you hit)."
      }
    ],
    "19": [
      {
        name: "Beast Spells",
        description: "While using Wild Shape, you can cast spells in Beast form, except for any spell that has a Material component with a cost specified or that consumes its Material component."
      }
    ],
    "20": [
      {
        name: "Archdruid",
        description: "The vitality of nature constantly blooms within you, granting you the following benefits.\n - **Evergreen Wild Shape**: Whenever you roll Initiative and have no uses of Wild Shape left, you regain one expended use of it.\n - **Nature Magician**: You can convert uses of Wild Shape into a spell slot (no action required). Choose a number of your unexpended uses of Wild Shape and convert them into a single spell slot, with each use contributing 2 spell levels. For example, if you convert two uses of Wild Shape, you produce a level 4 spell slot. Once you use this benefit, you can't do so again until you finish a Long Rest.\n - **Longevity**: The primal magic that you wield causes you to age more slowly. For every ten years that pass, your body ages only one year."
      }
    ]
  }
};

// rulebook/classes/fighter-subclasses.json
var fighter_subclasses_default = {
  "Battle Master": {
    "3": [
      {
        name: "Combat Superiority",
        description: "Your experience on the battlefield has refined your figh ting techniques. You learn maneuvers that are fueled by special dice called Superiority Dice.\n	**Saving Throughs**: If a maneuver requires a saving throw, the DC equals 8 plus your Strength or Dexterity modifier (your choice) and Proficiency Bonus."
      }
    ],
    "7": [
      {
        name: "Know Your Enemy",
        description: "As a Bonus Action, you can discern certain strengths and weaknesses of a creature you can see within 30 feet of yourself; you know whether that creature has any Immunities, Resistances, or Vul-nerabilities, and if the creature has any, you know what they are.\n	Once you use this feature, you can't do so again until you finish a Long Rest. You can also restore a use of the feature by expending one Superiority Die (no action required)."
      }
    ]
  },
  Champion: {
    "3": [
      {
        name: "Remarkable Athlete",
        description: "Thanks to your athleticism, you have Advantage on Initiative rolls and Strength (Athletics) checks.\n	In addition, immediately after you score a Critical Hit, you can move up to half your Speed without provoking Opportunity Attacks."
      }
    ],
    "10": [
      {
        name: "Heroic Warrior",
        description: "The thrill of battle drives you toward victory. During combat, you can give yourself Heroic Inspiration whenever you start your turn without it."
      }
    ],
    "18": [
      {
        name: "Survivor",
        description: "You attain the pinnacle of resilience in battle, giving you these benefits.\n - **Defy Death**: You have Advantage on Death Saving Throws. Moreover, when you roll 18-20 on a Death Saving Thr:ow, you gain the benefit of rolling a 20 on it.\n - **Heroic Rally**: At the start of each of your turns, you regain Hit Points equal to 5 plus your Constitution modifier if you are Bloodied and have at least 1 Hit Point."
      }
    ]
  },
  "Eldrich Knight": {
    "3": [
      {
        name: "War Bond",
        description: "You learn a ritual that creates a magical bond between yourself and one weapon, which ritual takes 1 hour. You can have up to two bonded weapons.\n	Once you have bonded a weapon to yourself, you can't be disarmed of that weapon unless you have the Incapacitated condition.If it is on the same plane of existence, you can summon that weapon as a Bonus Action, causing it to teleport instantly to your hand."
      }
    ],
    "10": [
      {
        name: "Eldritch Strike",
        description: "You learn how to make your weapon strikes undercut a creature's ability to withstand your spells. When you hit a creature with an attack using a weapon, that creature has Disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn."
      }
    ],
    "15": [
      {
        name: "Arcane Charge",
        description: "When you use your Action Surge, you can teleport up to 30 feet to an unoccupied space you can see. You can teleport before or after the additional action."
      }
    ]
  },
  "Psi Warrior": {
    "3": [
      {
        name: "Psionic Power",
        description: " - **Protective Field**: When you or another creature you can see within 30 feet of you takes damage, you can take a Reaction to expend one Psionic Energy Die, roll the die, and reduce the damage taken by the number rolled plus your Intelligence modifier (minimum reduction of 1), as you create a momentary shield of telekinetic force.\n - **Psionic Strike**: You can propel your weapons with psionic force. Once on each of your turns, immediately after you hit a target within 30 feet of yourself with an attack and deal damage to it with a weapon, you can expend one Psionic Energy Die, rolling it and dealing Force damage to the target equal to the number rolled plus your Intelligence modifier.\n - **Telekinetic Movement**: You can move an object or a creature with your mind. As a Magic action, choose one target you can see within 30 feet of yourself; the target must be a loose object that is Large or smaller or one willing creature other than you. You transport the target up to 30 feet to an unoccupied space you can see. Alternatively, if the target is a Tiny object, you can transport it to or from your hand.\n	Once you take this action, you can't do so again until you finish a Short or Long Rest unless you expend a Psionic Energy Die (no action required) to restore your use of it."
      }
    ],
    "7": [
      {
        name: "Telekinetic Adept",
        description: "You have mastered new ways to use your telekinetic abilities, detailed below.\n - **Psi-Powered Leap**: As a Bonus Action, you gain a Fly Speed equal to twice your Speed until the end of the current turn. Once you take this Bonus Action, you can't do so again until you finish a Short or Long Rest unless you expend a Psionic Energy Die (no action required) to restore your use of it.\n - **Telekinetic Thrust**: When you deal damage to a target with your Psionic Strike, you can force the target to make a Strength saving throw (DC 8 plus your Intelligence modifier and Proficiency Bonus). On a failed save, you can give the target the Prone condition or transport it up to 10 feet horizontally."
      }
    ],
    "10": [
      {
        name: "Guarded Mind",
        description: "You have Resistance to Psychic damage. Moreover, if you start your turn with the Charmed or Frightened condition, you can expend a Psionic Energy Die (no action required) and end every effect on yourself giving you those conditions."
      }
    ],
    "15": [
      {
        name: "Bulwark of Force",
        description: "You can shield yourself and others with telekinetic force. As a Bonus Action, you can choose creatures, including yourself, within 30 feet of yourself, up to a number of creatures equal to your Intelligence modifier (minimum of one creature). Each of the chosen creatures has Half Cover for 1 minute or until you have the Incapacitated condition.\n	Once you use this feature, you can't do so again until you finish a Long Rest unless you expend a Psionic Energy Die (no action required) to restore your use of it."
      }
    ],
    "18": [
      {
        name: "Telekinetic Master",
        description: "You always have the Telekinesis spell prepared. With this feature, you can cast it without a spell slot or components, and your spellcasting ability for it is Intelligence. On each of your turns while you maintain Concentration on it, including the turn when you cast it, you can make one attack with a weapon as a Bonus Action.\n	Once you cast the spell with this feature, you can't do so in this way again until you finish a Long Rest unless you expend a Psionic Energy Die (no action required) to restore your use of it."
      }
    ]
  }
};

// rulebook/classes/fighter.json
var fighter_default = {
  class: "Fighter",
  subclassFile: "fighter-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "chain-mail": 1,
        greatsword: 1,
        flail: 1,
        javelin: 8,
        "dungeoneers-pack": 1
      },
      gold: 4
    },
    B: {
      items: {
        "studded-leather-armor": 1,
        scimitar: 1,
        shortsword: 1,
        longbow: 8,
        arrow: 20,
        quiver: 1,
        "dungeoneers-pack": 1
      },
      gold: 11
    },
    C: {
      items: {},
      gold: 0
    }
  },
  features: {
    "1": [
      {
        name: "Second Wind",
        description: "As a Bonus Action, you can use it to regain Hit Points equal to ldlO plus your Fighter level.\n	You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest."
      }
    ],
    "2": [
      {
        name: "Action Surge",
        description: "You can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action, except the Magic action.\n	Once you use this feature, you can't do so again until you finish a Short or Long Rest. Starting at level 17, you can use it twice before a rest but only once on a turn."
      },
      {
        name: "Tactical Mind",
        description: "When you fail an ability check, you can expend a use of your Second Wind to push yourself toward success. Rather than regaining Hit Points, you roll ldlO and add the number rolled to the ability check, potentially turning it into a success. If the check still fails, this use of Second Wind isn't expended."
      }
    ],
    "5": [
      {
        name: "Extra Attack",
        description: "You can attack twice instead of once whenever you take the Attack action on your turn."
      },
      {
        name: "Tactical Shift",
        description: "Whenever you activate your Second Wind with a Bonus Action, you can move up to half your Speed without provoking Opportunity Attacks."
      }
    ],
    "9": [
      {
        name: "Indomitable",
        description: "If you fail a saving throw, you can re roll it with a bonus equal to your Fighter level. You must use the new roll, and you can't use this feature again until you finish a Long Rest.\n	You can use this feature twice before a Long Reststarting at level 13 and three times at level 17."
      },
      {
        name: "Tactical Master",
        description: "When you attack with a weapon whose mastery property you can use, you can replace that property with the Push, Sap, or Slow property for that attack."
      }
    ],
    "11": [
      {
        name: "Two Extra Attacks",
        description: "You can attack three times instead of once whenever you take the Attack action on your turn."
      }
    ],
    "13": [
      {
        name: "Studied Attacks",
        description: "You study your opponents and learn from each attack you make. If you make an attack roll against a creature and miss, you have Advantage on your next attack roll against that creature before the end of your next turn."
      }
    ],
    "20": [
      {
        name: "Three Extra Attacks",
        description: "You can attack four times instead of once whenever you take the Attack action on you r turn."
      }
    ]
  }
};

// rulebook/classes/monk-subclasses.json
var monk_subclasses_default = {
  "Warrior of Mercy": {
    "3": [
      { name: "Hand of Harm", description: "Once per turn when you hit a creature with an Unarmed Strike and deal damage, you can expend 1 Focus Point to deal extra Necrotic damage equal to one roll of your Martial Arts die plus your Wisdom modifier." },
      { name: "Hand of Healing", description: "As a Magic action, you can expend 1 Focus Point to touch a creature and restore a number of Hit Points equal to a roll of your Martial Arts die plus your Wisdom modifier.\nWhen you use your Flurry of Blows, you can replace one of the Unarmed Strikes with a use of this feature without expending a Focus Point for the healing." }
    ],
    "6": [
      { name: "Physician's Touch", description: "Your Hand of Harm and Hand of Healing improve, as detailed below.\n - **Hand of Harm**:\nWhen you use Hand of Harm on a creature, you can also give that creature the Poisoned condition until the end of your next turn.\n - **Hand of Healing**:\nWhen you use Hand of Healing, you can also end one of the following conditions on the creature you heal: Blinded, Deafened, Paralyzed, Poisoned, or Stunned." }
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
      { name: "Shadow Arts", description: "You have learned to draw on the power of the Shadowfell, gaining the following benefits.\n - **Darkness**: You can expend 1 Focus Point to cast the Darkness spell without spell components. You can see within the spell's area when you cast it with this feature. While the spell persists, you can move its area of Darkness to a space within 60 feet of yourself at the start of each of your turns.\n - **Darkvision**: You gain Darkvision with a range of 60 feet. If you already have Darkvision, its range increases by 60 feet.\n - **Shadowy Figments**: You know the Minor Illusion spell. Wisdom is your spellcasting ability for it." }
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
      { name: "Elemental Attunment", description: "At the start of your turn, you can expend l Focus Point to imbue yourself with elemental energy. The energy lasts for 10 minutes or until you have the Incapacitated condition. You gain the following benefits while this feature is active.\n - **Reach**: When you make an Unarmed Strike, your reach is 10 feet greater than normal, as elemental energy extends from you.\n - **Elemental Strikes**: Whenever you hit with your Unarmed Strike, you can cause it to deal your choice of Acid, Cold, Fire, Lightning, or Thunder damage rather than its normal damage type. When you deal one of these types with it, you can also force the target to make a Strength saving throw. On a failed save, you can move the target up to 10 feet toward or away from you, as elemental energy swirls around it.\n - **Manipulate Elements**: You know the Elementalism spell. Wisdom is your spellcasting ability for it." }
    ],
    "6": [
      { name: "Elemental Burst", description: "As a Magic action, you can expend 2 Focus Points to cause elemental energy to burst in a 20-foot-radius Sphere centered on a point within 120 feet of yourself. Choose a damage type: Acid, Cold, Fire, Lightning, or Thunder.\n  Each creature in the Sphere must make a Dexterity saving throw. On a failed save, a creature takes damage of the chosen type equal to three rolls of your Martial Arts die. On a successful save, a creature takes half as much damage." }
    ],
    "11": [
      { name: "Stride of the Element", description: "While your Elemental Attunement is active, you also have a Fly Speed and a Swim Speed equal to your Speed." }
    ],
    "17": [
      { name: "Elemental Epitome", description: "While your Elemental Attunement is active, you also gain the following benefits:\n - **Damage Resistance**: You gain Resistance to one of the following damage types of your choice: Acid, Cold, Fire, Lightning, or Thunder. At the start of each of your turns, you can change this choice.\n - **Destructive Stride**: When you use your Step of the Wind, your speed increases by 20 feet until the end o the turn.  For that duration, any creature of your choice takes damage equal to one roll of your Martial Arts die when you enter a space within 5 feet of it. The damage type is your choice of Acid, Cold, Fire, Lightning, or Thunder. A creature can take this damage only once per turn.\n - **Empowered Strikes**: Once on each of your turns, you can deal extra damage to a target equal to one roll of your Martial Arts die when you hit it with an Unarmed Strike. The extra damage is the same type dealt by that strike." }
    ]
  },
  "Warrior of the Open Hand": {
    "3": [
      { name: "Open Hand Technique", description: " \u2022 **Addle**: The target can't make Opportunity Attacks until the start of its next turn.\n - **Push**: The target must succeed on a Strength saving throw or be pushed up to 15 feet away from you.\n - **Topple**: The target must succeed on a Dexterity saving throw or have the Prone condition." }
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
  "starting-equipment": {
    A: {
      items: {
        spear: 1,
        dagger: 5,
        "artisans-tool|musical-instrument": 1,
        "explorers-pack": 1
      },
      gold: 11
    },
    B: { items: {}, gold: 50 }
  },
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
        description: " - **Flurry of Blows**:\nYou can expend 1 Focus Point to make two Unarmed Strikes as a Bonus Action.\n - **Patient Defense**:\nYou can take the Disengage action as a Bonus Action. Alternatively, you can expend 1 Focus Point to take both the Disengage and the Dodge actions as a Bonus Action.\n - **Step of the Wind**:\nYou can take the Dash action as a Bonus Action. Alternatively, you can expend 1 Focus Point to take both the Disengage and Dash actions as a Bonus Action, and your jump distance is doubled for the turn."
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
        description: "Your Flurry of Blows, Patient Defense, and Step of the Wind gain the following benefits:\n - **Flurry of Blows**: You can expend 1 Focus Point to use Flurry of Blows and make three Unarmed Strikes with it instead of two.\n - **Patient Defense**: When you expend a Focus Point to use Patient Defense, you gain a number of Temporary Hit Points equal to two rolls of your Martial Arts die.\n - **Step of the Wind**: When you expend a Focus Point to use Step of the Wind, you can choose a willing creature within 5 feet of yourself that is Large or smaller. You move the creature with you until the end of your turn. The creature's movement doesn't provoke Opportunity Attacks."
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

// rulebook/classes/paladin-subclasses.json
var paladin_subclasses_default = {
  "Oath of Devotion": {
    "3": [
      {
        name: "Sacred Weapon",
        description: "When you take the Attack action, you can expend one use of your Channel Divinity to imbue one Melee weapon that you are holding with positive energy. For 10 minutes or until you use this feature again, you add your Charisma modifier to attack rolls you make with that weapon (minimum bonus of +1), and each time you hit with it, you cause it to deal its normal damage type or Radiant damage.\n	The weapon also emits Bright Light in a 20-foot radius and Dim Light 20 feet beyond that.\nYou can end this effect early (no action required).\n	This effect also ends if you aren't carrying the weapon."
      }
    ],
    "7": [
      {
        name: "Aura of Devotion",
        description: "You and your allies have Immunity to the Charmed condition while in your Aura of Protection. If a Charmed ally enters the aura, that condition has no effect on that ally while there."
      }
    ],
    "15": [
      {
        name: "Smite of Protection",
        description: "Your magical smite now radiates protective energy. Whenever you cast Divine Smite, you and your allies have Half Cover while in your Aura of Protection. The aura has this benefit until the start of your next turn."
      }
    ],
    "20": [
      {
        name: "Holy Nimbus",
        description: "As a Bonus Action, you can imbue your Aura of Protection with holy power, granting the benefits below for 10 minutes or until you end them (no action required). Once you use this feature, you can't use it again until you finish a Long Rest. You can also restore your use of it by expending a level 5 spell slot (no action required).\n - **Holy Ward**: You have Advantage on any saving throw you are forced to make by a Fiend or an Undead.\n - **Radiant Damage**: Whenever an enemy starts its turn in the aura, that creature takes Radiant damage equal to your Charisma modifier plus your Proficiency Bonus.\n - **Sunlight**: The aura is filled with Bright Light that is sunlight."
      }
    ]
  },
  "Oath of Glory": {
    "3": [
      {
        name: "Inspiring Smite",
        description: "Immediately after you cast Divine Smite, you can expend one use of your Channel Divinity and distribute Temporary Hit Points to creatures of your choice within 30 feet of yourself, which can include you. The total number of Temporary Hit Points equals 2d8 plus your Paladin level, divided among the chosen creatures however you like."
      },
      {
        name: "Oath of Glory Spells",
        description: "The magic of your oath ensures you always have certain spells ready:\n#### Oath of Glory Spells\n\n| Level 3 | Level 5 | Level 9 | Level 13 | Level 17 |\n| ----- | ----- | ----- | ----- | ----- |\n| Guiding Bolt, Heroism | Enhance Ability, Magic Weapon | Haste, Protection from Energy | Compulsion, Freedom of Movement | Legend Lore, Yolande's Regal Presence |"
      },
      {
        name: "Pearless Athlete",
        description: "As a Bonus Action, you can expend one use of your Channel Divinity to augment your athleticism. For 1 hour, you have Advantage on Strength (Athletics) and Dexterity (Acrobatics) checks, and the distance of your Long and High Jumps increases by 10 feet (this extra distance costs movement as normal)."
      }
    ],
    "7": [
      {
        name: "Aura of Alacrity",
        description: "Whenever an ally enters your Aura of Protection for the first time on a turn or starts their turn there, the ally's Speed increases by 10 feet until the end of their next turn."
      }
    ],
    "15": [
      {
        name: "Glorious Defense",
        description: "You can turn defense into a sudden strike. When you or another creature you can see within 10 feet of you is hit by an attack roll, you can take a Reaction to grant a bonus to the target's AC against that attack, potentially causing it to miss. The bonus equals your Charisma modifier (minimum of +1). If the attack misses, you can make one attack with a weapon against the attacker as part of this Reaction if the attacker is within your weapon's range.\n	You can use this feature a number of times equal to your Charisma modifier (minimum of once), and you regain all expended uses when you finish a Long Rest."
      }
    ],
    "20": [
      {
        name: "Living Legend",
        description: "You can empower yourself with the legends -whether true or exaggerated- of your great deeds. As a Bonus Ac tion, you gain the benefits below for 10 minutes. Once you use this feature, you can't use it again until you finish a Long Rest. You can also restore your use of it by expending a level 5 spell slot (no action required).\n - **Charismatic**: You are blessed with an otherworldly presence and have Advantage on all Charisma checks.\n - **Saving Throw Reroll**: If you fail a saving throw, you can take a Reaction to reroll it. You must use this new roll.\n - **Unerring Strike**: Once on each of your turns when you make an attack roll with a weapon and miss, you can cause that attack to hit instead."
      }
    ]
  },
  "Oath of the Ancients": {
    "3": [
      {
        name: "Nature's Wrath",
        description: "As a Magic action, you can expend one use of your Channel Divinity to conjure spectral vines around nearby creatures. Each creature of your choice that you can see within 15 feet of yourself must succeed on a Strength saving throw or have the Restrained condition for 1 minute. A Restrained creature repeats the save at the end of each of its turns, ending the effect on itself on a success."
      },
      {
        name: "Oath of the Ancients Spells",
        description: "The magic of your oath ensures you always have certain spells ready.\n#### Oath of the Ancients\n\n| Level 3 | Level 5 | Level 9 | Level 13 | Level 17 |\n| ----- | ----- | ----- | ----- | ----- |\n| Ensnaring Strike, Speak with Animals | Misty Step, Moonbeam | Plant Growth, Protection from Energy | Ice Storm, Stoneskin | Commune with Nature, Tree Stride |"
      }
    ],
    "7": [
      {
        name: "Aura of Warding",
        description: "Ancient magic lies so heavily upon you that it forms an eldritch ward, blunting energy from beyond the Material Plane; you and your allies have Resistance to Necrotic, Psychic, and Radiant damage while in your Aura of Protection."
      }
    ],
    "15": [
      {
        name: "Undying Sentinel",
        description: "When you are reduced to 0 Hit Points and not killed outright, you can drop to 1 Hit Point instead, and you regain a number of Hit Points equal to three times your Paladin level. Once you use this feature, you can't do so again until you finish a Long Rest.\n	Additionally, you can't be aged magically, and you cease visibly aging."
      }
    ],
    "20": [
      {
        name: "Elder Champion",
        description: "As a Bonus Action, you can imbue your Aura of Protection with primal power, granting the benefits below for 1 minute or until you end them (no action required}. Once you use this feature, you can't use it again until you finish a Long Rest. You can also restore your use of it by expending a level 5 spell slot (no action required)\n - **Diminish Defiance**:  Enemies in the aura have Disadvantage on saving throws against your spells and Channel Divinity options\n - **Regeneration**:  At the start of each of your turns, you regain 10 Hit Points\n - **Swift Spells**:  Whenever you cast a spell that has a casting time of an action, you can cast it using a Bonus Action instead"
      }
    ]
  },
  "Oath of Vengeance": {
    "3": [
      {
        name: "Oath of Vengeance Spells",
        description: "The magic of your oath ensures you always have certain spells read.\n#### Oath of Vengeance Spells\n\n| Level 3 | Level 5 | Level 9 | Level 13 | Level 17 |\n| ----- | ----- | ----- | ----- | ----- |\n| Bane, Hunter's Mark | Hold Person, Misty Step | Haste, Protection from Energy | Banishment , Dimension Door | Hold Monster, Scrying |"
      },
      {
        name: "Vow of Enmity",
        description: "When you take the Attack action, you can expend one use of your Channel Divinity to utter a vow of enmity against a creature you can see within 30 feet of yourself. You have Advantage on attack rolls against the creature for 1 minute or until you use this feature again.\n	If the creature drops to 0 Hit Points before the vow ends, you can transfer the vow to a different creature within 30 feet of yourself (no action required)."
      }
    ],
    "7": [
      {
        name: "Relentless Avenger",
        description: "Your supernatural focus helps you close off a foe's retreat. When you hit a creature with an Opportunity Attack, you can reduce the creature's Speed to O until the end of the current turn. You can then move up to half your Speed as part of the same Reaction. This movement doesn't provoke Opportunity Attacks"
      }
    ],
    "15": [
      {
        name: "Soul of Vengeance",
        description: "Immediately after a creature under the effect of your Vow of Enmity hits or misses with an attack roll, you can take a Reaction to make a melee attack against that creature if it's within range."
      }
    ],
    "20": [
      {
        name: "Avenging Angel",
        description: "As a Bonus Action, you gain the benefits below for 10 minutes or until you end them (no action required). Once you use this feature, you can't use it again until you finish a Long Rest. You can also restore your use of it by expending a level 5 spell slot (no action required).\n - **Flight**: You sprout spectral wings on your back, have a Fly Speed of 60 feet, and can hover.\n - **Frighful Aura**: Whenever an enemy starts its turn in your Aura of Protection, that creature must succeed on a Wisdom saving throw or have the Frightened condition for 1 minute or until it takes any da mage. Attack rolls against the Frightened creature have Advantage."
      }
    ]
  }
};

// rulebook/classes/paladin.json
var paladin_default = {
  class: "Paladin",
  subclassFile: "paladin-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "chain-mail": 1,
        shield: 1,
        longsword: 1,
        javelin: 6,
        "holy-symbol": 1,
        "priests-pack": 1
      },
      gold: 9
    },
    B: { items: {}, gold: 150 }
  },
  features: {
    "1": [
      {
        name: "Lay on Hands",
        description: "Your blessed touch can heal wounds. You have a pool of healing power that replenishes when you finish a Long Rest. With that pool, you can restore a total number of Hit Points equal to five times your Paladin level.\n	As a Bonus Action, you can touch a creature (which could be yourself) and draw power from the pool of healing to restore a number of Hit Points to that creature, up to the maximum amount remaining in the pool.\n	You can also expend 5 Hit Points from the pool of healing power to remove the Poisoned condition from the creature; those points don't also restore Hit Points to the creature."
      },
      {
        name: "Weapon Mastery",
        description: "Whenever you finish a Long Rest, you can change the kinds of weapons you chose. For example, you could switch to using the mastery properties of Hal-berds and Flails"
      }
    ],
    "5": [
      {
        name: "Extra Attack",
        description: "You can attack twice instead of once whenever you take the Attack action on your turn."
      },
      {
        name: "Faithful Steed",
        description: "You can call on the aid of an otherworldly steed. You always have the Find Steed spell prepared.\n	You can also cast the spell once without expending a spell slot, and you regain the ability to do so when you finish a Long Rest."
      }
    ],
    "6": [
      {
        name: "Aura of Protection",
        description: "You radiate a protective, unseeable aura in a 10-foot Emanation that originates from you. The aura is inactive while you have the Incapacitated condition.\n	You and your allies in the aura gain a bonus to saving throws equal to your Charisma modifier (minimum bonus of +1).\n	If another Paladin is present, a creature can benefit from only one Aura of Protection at a time; the creat ure chooses which aura while in them."
      }
    ],
    "9": [
      {
        name: "Abjure Foes",
        description: "As a Magic action, you can expend one use of this class's Channel Divinity to overwhelm foes with awe. As you present your Holy Symbol or weapon, you can target a number of creatures equal to your Charisma modifier (minimum of one creature) that you can see within 60 feet of yourself. Each target must succeed on a Wisdom saving throw or have the Frightened condition for 1 minute or until it takes any damage. While Frightened in this way, a target can do only one of the following on its turns: move, take an action, or take a Bonus Action."
      }
    ],
    "10": [
      {
        name: "Aura of Courage",
        description: "You and your allies have Immunity to the Frightened condition while in your Aura of Protection. If a Frightened ally enters the aura, that condition has no effect on that ally while there."
      }
    ],
    "14": [
      {
        name: "Restoring Touch",
        description: "When you use Lay On Hands on a creature, you can also remove one or more of the following conditions from the creature: Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned. You must expend 5 Hit Points from the healing pool of Lay On Hands for each of these conditions you remove; those points don't also restore Hit Points to the creature."
      }
    ]
  }
};

// rulebook/classes/ranger-subclasses.json.json
var ranger_subclasses_json_default = {
  "<Subclass_Name>": {
    "<Level>": [
      {
        name: "<Feature_Name>",
        description: "<Feature_Description>"
      }
    ]
  }
};

// rulebook/classes/ranger.json
var ranger_default = {
  class: "Ranger",
  subclassFile: "ranger-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "studded-leather-armor": 1,
        scimitar: 1,
        shortsword: 1,
        longbow: 1,
        arrows: 20,
        quiver: 1,
        "druidic-focus": 1,
        "explorers-pack": 1
      },
      gold: 7
    },
    B: { items: {}, gold: 150 }
  },
  features: {
    "1": [
      {
        name: "",
        description: ""
      }
    ]
  }
};

// rulebook/classes/rogue-subclasses.json
var rogue_subclasses_default = {
  "<Subclass_Name>": {
    "<Level>": [
      {
        name: "<Feature_Name>",
        description: "<Feature_Description>"
      }
    ]
  }
};

// rulebook/classes/rogue.json
var rogue_default = {
  class: "Rogue",
  subclassFile: "rogue-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "leather-armor": 1,
        dagger: 1,
        shortsword: 1,
        shortbow: 1,
        arrow: 20,
        quiver: 1,
        "thieves-tools": 1,
        "burglars-pack": 1
      },
      gold: 8
    },
    B: { items: {}, gold: 100 }
  },
  features: {
    "1": [
      {
        name: "",
        description: ""
      }
    ]
  }
};

// rulebook/classes/sorcerer-subclasses.json
var sorcerer_subclasses_default = {
  "<Subclass_Name>": {
    "<Level>": [
      {
        name: "<Feature_Name>",
        description: "<Feature_Description>"
      }
    ]
  }
};

// rulebook/classes/sorcerer.json
var sorcerer_default = {
  class: "Sorcerer",
  subclassFile: "sorcerer-subclasses",
  "starting-equipment": {
    A: {
      items: {
        spear: 1,
        dagger: 2,
        "arcane-focus": 1,
        "dungeoneers-pack": 1
      },
      gold: 28
    },
    B: { items: {}, gold: 50 }
  },
  features: {
    "1": [
      {
        name: "",
        description: ""
      }
    ]
  }
};

// rulebook/classes/warlock-subclasses.json
var warlock_subclasses_default = {
  "<Subclass_Name>": {
    "<Level>": [
      {
        name: "<Feature_Name>",
        description: "<Feature_Description>"
      }
    ]
  }
};

// rulebook/classes/warlock.json
var warlock_default = {
  class: "Warlock",
  subclassFile: "warlock-subclasses",
  "starting-equipment": {
    A: {
      items: {
        "leather-armor": 1,
        sickle: 1,
        dagger: 2,
        "arcane-focus": 1,
        book: 1,
        "scholars-pack": 1
      },
      gold: 15
    },
    B: { items: {}, gold: 100 }
  },
  features: {
    "1": [
      {
        name: "",
        description: ""
      }
    ]
  }
};

// rulebook/classes/wizard-subclasses.json
var wizard_subclasses_default = {
  "<Subclass_Name>": {
    "<Level>": [
      {
        name: "<Feature_Name>",
        description: "<Feature_Description>"
      }
    ]
  }
};

// rulebook/classes/wizard.json
var wizard_default = {
  class: "Wizard",
  subclassFile: "wizard-subclasses",
  "starting-equipment": {
    A: {
      items: {
        dagger: 2,
        "arcane-focus": 1,
        robe: 1,
        spellbook: 1,
        "scholars-pack": 1
      },
      gold: 5
    },
    B: { items: {}, gold: 55 }
  },
  features: {
    "1": [
      {
        name: "",
        description: ""
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
  description: " \u2022 **Initiative Proficiency**:\nWhen you roll Initiative, you can add your Proficiency Bonus to the roll.\n - **Initiative Swap**:\nImmediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition."
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
  name: "Magic Initiate - Druid",
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

// rulebook/races/aasimar.json
var aasimar_default = {
  traits: [
    {
      name: "Celestial Resistance",
      description: "You have Resistance to Necrotic damage and Radiant damage."
    },
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 60 feet."
    },
    {
      name: "Healing Hands",
      description: "As a Magic action, you touch a creature and roll a number of d4s equal to your Proficiency Bonus and it regains the number of Hit Points rolled. Once you use this trait, you can't use it again until you finish a Long Rest."
    },
    {
      name: "Celestial Revelation",
      description: "At Level 3 you can transform as a Bonus Action. The tra nsforma ti on lasts for 1 minute or until you end it (no action required). Once you transform , you can't do so aga in until you finish a Long Rest.\n  Once on each of your turns before the t ra nsformation ends, you can deal extra damage to one target when you deal damage to it with an attack or a spell. The extra damage equ als your Pro ficienc y Bonus, and the extra damage's type is either Necrotic for Necrotic Shroud or Radiant fo r Heavenly Wings and Inner Radi ance.\n   \u2022 **Heavenly Wings**: Two spectral wings sprout from your back temporarily. Until the transformation ends, you have a Fly Speed equal to your Speed.\n   \u2022 **Inner Radiance**: Searing light temporarily radiates from your eyes and mouth. For the duration , you shed Bright Light in a 10-foot radius and Dim Light for an additional 10 feet, and at the end of each of your turns, each creature within 10 feet of you takes Radiant damage equal to your Proficiency Bonus.\n   \u2022 **Necrotic Shroud**: Your eyes briefly become pools of darkness, and flightless wings sprout from your back temporarily. Creatures other than your allies within 10 feet of you must succeed on a Charisma saving throw (DC 8 plus your Charisma modifier and Proficiency Bonus) or have the Frightened condition until the end of your next turn."
    }
  ]
};

// rulebook/races/dragonborn.json
var dragonborn_default = {
  traits: [
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Acid",
      lineage: "Black"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Lightning",
      lineage: "Blue"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Fire",
      lineage: "Brass"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Lightning",
      lineage: "Bronze"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Acid",
      lineage: "Copper"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Fire",
      lineage: "Gold"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Poison",
      lineage: "Green"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Fire",
      lineage: "Red"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Cold",
      lineage: "Silver"
    },
    {
      name: "Draconic Ancestry",
      description: "Damage Type: Cold",
      lineage: "White"
    },
    {
      name: "Breath Weapon",
      description: "When you take the Attack action on your turn, you can replace one of your attacks with an exhalation of magical energy in either a 15-foot Cone or a 30-foot Line that is 5 feet wide (choose the shape each time). Each creature in that area must make a Dexterity saving throw (DC 8 plus your Constitution modifier and Proficiency Bonus). On a failed save, a creature takes 1dl0 damage of the type determined by your Draconic Ancestry trait. On a successful save, a creature takes half as much damage. This damage increases by 1dlO when you reach character levels S (2d10), 11 {3d10), and 17 (4d10).\n  You can use this Breath Weapon a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest."
    },
    {
      name: "Damage Resistance",
      description: "You have Resistance to the damage type determined by your Draconic Ancestry trait."
    },
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 60 feet"
    },
    {
      name: "Draconic Flight",
      description: "At Level 5, as a Bonus Action you can sprout spectral wings on your back that last for 10 minutes, until you retract them (no action required), or have the Incapacitated condition. During that time, you have a Fly Speed equal to your Speed.\n  Once you use this trait, you can't use it again until you finish a Long Rest."
    }
  ]
};

// rulebook/races/dwarf.json
var dwarf_default = {
  traits: [
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 120 feet.",
      lineage: "Lineage_Name"
    },
    {
      name: "Dwarven Resilience",
      description: "You have Resistance to Poison damage. You also have Advantage on saving throws you make to avoid or end the Poisoned condition.",
      lineage: "Lineage_Name"
    },
    {
      name: "Dwarven Toughness",
      description: "Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level.",
      lineage: "Lineage_Name"
    },
    {
      name: "Stonecunning",
      description: "As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes. You must be on a stone surface or touching a stone surface to use this Tremorsense. The stone can be natural or worked.\n  You can use this Bonus Action a number of times equal to your Proficiency Bonus, and you regain all expended uses when you fini sh a Lonb Rest.",
      lineage: "Lineage_Name"
    },
    {
      name: "<Trait_Name>",
      description: "<Trait_Description>",
      lineage: "Lineage_Name"
    },
    {
      name: "<Trait_Name>",
      description: "<Trait_Description>",
      lineage: "Lineage_Name"
    }
  ]
};

// rulebook/races/elf.json
var elf_default = {
  traits: [
    {
      name: "Darkvision",
      description: "You can see in dim light within 60 feet of you as if it were bright light..."
    },
    {
      name: "Elven Lineage",
      description: "You are the recipient of a legacy that grants you supernatural abilities.\n\n| Level 1 | Level 2 | Level 3 |\n| ------------- | ------------- | ------------- |\n| Darkvision range increases to 120 feet.<br>You also know the _Dancing Lights_ cantrip. |  _Faerie Fire_  |  _Darkness_  |",
      lineage: "Drow"
    },
    {
      name: "Elven Lineage",
      description: "You are the recipient of a legacy that grants you supernatural abilities.\n\n| Level 1 | Level 2 | Level 3 |\n| ------------- | ------------- | ------------- |\n| You know the _Prestidigitation_ cantrip.<br>Whenever you finish a Long Rest you can replace that cantrip with any from the Wizard Spell list |  _Detect Magic_  |  _Misty Step_  |",
      lineage: "High Elves"
    },
    {
      name: "Elven Lineage",
      description: "You are the recipient of a legacy that grants you supernatural abilities.\n\n| Level 1 | Level 2 | Level 3 |\n| ------------- | ------------- | ------------- |\n| Your speed increases to 35 feet.<br>You also know the _Druidcraft_ cantrip. |  _Longstrider_  |  _Pass withough Trace_  |",
      lineage: "Wood Elves"
    },
    {
      name: "Otherworldly Presence",
      description: "You know the Thaumaturgy cantrip. When you cast it with this trait, the spell uses the same spellcasting ability you use for your Fiendish Legacy trait."
    }
  ]
};

// rulebook/races/gnome.json
var gnome_default = {
  traits: [
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 60 feet."
    },
    {
      name: "Gnomish Cunning",
      description: "You have Advantage on Intelligence, Wisde n, , and Charisma saving th rows."
    },
    {
      name: "Gnomish Lineage",
      description: "You know the Minor Illusion cantrip. You also always have the Speak with Animals spell prepared and you can cast it without a spell slot a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.",
      lineage: "Forest Gnome"
    },
    {
      name: "Gnomish Lineage",
      description: "You know the Mending and Prestidigitation cantrips. In addition, you can spend 10 minutes casting Prestidigitation to create a Tiny clockwork device (AC 5, 1 HP}, such as a toy, fire starter, or music box. When you create the device, you determine its function by choosing one effect from Prestidigitation; the device produces that effect whenever you or another creature takes a Bonus Action to activate it with a touch. If the chosen effect has options within it, you choose one of those options for the device when you create it. For example, if you choose the spell's ignite-extinguish effect, you determine whether the device ignites or extinguishes fire; the device doesn't do both. You can have three such devices in existence at a time, and each falls apart 8 hours after its creation or when you dismantle it with a touch as a Utilize action.",
      lineage: "Rock Gnome"
    }
  ]
};

// rulebook/races/goliath.json
var goliath_default = {
  traits: [
    {
      name: "Giant Ancestry",
      description: "**Fire's Burn**: When you hit a target with an attack roll and deal damage to it, you can also deal 1dlO Fire damage to that target.",
      lineage: "Fire Giant"
    },
    {
      name: "Giant Ancestry",
      description: "**Frost's Chill**: When you hit a target with an attack roll and deal damage to it, you can also deal 1d6 Cold damage to that target and reduce its Speed by 10 feet until the start of your next turn.",
      lineage: "Frost Giant"
    },
    {
      name: "Giant Ancestry",
      description: "*Hill's Tumble**: When you hit a Large or smaller creature with an attack roll and deal damage to it, you can give that target the Prone condition.",
      lineage: "Hill Giant"
    },
    {
      name: "Giant Ancestry",
      description: "**Stone's Endurance**: When you take damage, you can take a Reaction to roll 1d12. Add your Constitution modifier to the number rolled and reduce the damage by that total.",
      lineage: "Stone Giant"
    },
    {
      name: "Giant Ancestry",
      description: "**Storm's Thunder**: When you take damage from a creature within 60 feet of you, you can take a Reaction to deal 1d8 Thunder damage to that creature.",
      lineage: "Storm Giant"
    },
    {
      name: "Large Form",
      description: "Star ting at character level 5, you can change your size to Large as a Bonus Action if you're in a big enough space. This transformation lasts for 10 minutes or until you end it (no action required). For that duration, you have Advantage on Strength checks, and your Speed increases by 10 feet. Once you use this trait, you can't use it again until you finish a Long Rest."
    },
    {
      name: "Powerful Build",
      description: "You have Advantage on any saving throw you make to end the Grappled condition. You also count as one size larger whe1 determining your carrying capacity."
    }
  ]
};

// rulebook/races/half-orc.json
var half_orc_default = {
  traits: [
    {
      name: "Adrenaline Rush",
      description: "You can take the Dash action as a Bonus Action. When you do so, you gain Temporary Hit Points equal to your Proficiency Bonus.\n  You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest."
    },
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 120 feet."
    },
    {
      name: "Relentless Endurance",
      description: "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest."
    }
  ]
};

// rulebook/races/halfling.json
var halfling_default = {
  traits: [
    {
      name: "Brave",
      description: "You have Advantage on saving throws you make to avoid or end the Frightened condition."
    },
    {
      name: "Halfling Nimbleness",
      description: "You can move through the space of any creature that is a size larger than you, but you can't stop in the same space."
    },
    {
      name: "Luck",
      description: "When you roll a 1 on the d2O of a D2O Test, you can reroll the die, and you must use the new roll."
    },
    {
      name: "Naturally Stealthy",
      description: "You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you."
    }
  ]
};

// rulebook/races/human.json
var human_default = {
  traits: [
    {
      name: "Resourceful",
      description: "You gain Heroic Inspiration whenever you finish a Long Rest."
    },
    {
      name: "Heroic Inspiration",
      description: "You can reroll any die immediately after rolling it, and you must use the new roll. You can never have more than one instance of Heroic Inspiration. If something gives you Heroic Inspiration and you already have it, you can give it to a player character in your group who lacks it."
    },
    {
      name: "Skillful",
      description: "You gain proficiency in one skill of your choice."
    }
  ]
};

// rulebook/races/orc.json
var orc_default = {
  traits: [
    {
      name: "Adrenaline Rush",
      description: "You can take the Dash action as a Bonus Action. When you do so, you gain Temporary Hit Points equal to your Proficiency Bonus.\n  You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest."
    },
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 120 feet."
    },
    {
      name: "Relentless Endurance",
      description: "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest."
    }
  ]
};

// rulebook/races/tiefling.json
var tiefling_default = {
  traits: [
    {
      name: "Darkvision",
      description: "You have Darkvision with a range of 60 feet."
    },
    {
      name: "Fiendish Legacy",
      description: "You are the recipient of a legacy that grants you supernatural abilities.\n\n| Level 1 | Level 2 | Level 3 |\n| ------------- | ------------- | ------------- |\n| You have Resistance to Poison damage.<br>You also know the _Poison Spray_ cantrip. |  _Ray of Sickness_  |  _Hold Person_  |",
      lineage: "Abyssal"
    },
    {
      name: "Fiendish Legacy",
      description: "You are the recipient of a legacy that grants you supernatural abilities.\n\n| Level 1 | Level 2 | Level 3 |\n| ------------- | ------------- | ------------- |\n| You have Resistance to Necrotic damage.<br>You also know the _Chill Touch_ cantrip. |  _False Life_  |  _Ray of Enfeeblement_  |",
      lineage: "Chthonic"
    },
    {
      name: "Fiendish Legacy",
      description: "You are the recipient of a legacy that grants you supernatural abilities.\n\n| Level 1 | Level 2 | Level 3 |\n| ------------- | ------------- | ------------- |\n| You have Resistance to Fire damage.<br>You also know the _Fire Bolt_ cantrip. |  _Hellish Rebuke_  |  _Darkness_  |",
      lineage: "Infernal"
    },
    {
      name: "Otherworldly Presence",
      description: "You know the Thaumaturgy cantrip. When you cast it with this trait, the spell uses the same spellcasting ability you use for your Fiendish Legacy trait."
    }
  ]
};

// rulebook/items/alchemists-supplies.json
var alchemists_supplies_default = {
  name: "Alchemist's Supplies",
  type: "artisans-tool",
  description: "Identify a substance (DC 15), or start a fire (DC 15)",
  weight: 8,
  cost: 50
};

// rulebook/items/bagpipes.json
var bagpipes_default = {
  name: "Bagpipes",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 6,
  cost: 30
};

// rulebook/items/battleaxe.json
var battleaxe_default = {
  name: "Battleaxe",
  type: "weapon",
  description: "Versatile (1d10)",
  weight: 4,
  damage: "1d8 Slashing",
  cost: 10
};

// rulebook/items/blowgun.json
var blowgun_default = {
  name: "Blowgun",
  type: "weapon",
  description: "Ammunition (Range 25/100; Needle), Loading",
  weight: 1,
  damage: "1 Piercing",
  cost: 10
};

// rulebook/items/breastplate.json
var breastplate_default = {
  name: "Breastplate",
  type: "armor",
  description: "14 + Dex modifier (max 2)",
  weight: 20,
  ac: "14",
  cost: 400
};

// rulebook/items/brewers-supplies.json
var brewers_supplies_default = {
  name: "Brewer's Supplies",
  type: "artisans-tool",
  description: "Detect poisoned drink (DC 15), or identify alcohol (DC 10)",
  weight: 9,
  cost: 20
};

// rulebook/items/bulglars-pack.json
var bulglars_pack_default = {
  name: "Burglar's Pack",
  type: "gear",
  description: "",
  weight: 42,
  cost: 16
};

// rulebook/items/calligraphers-supplies.json
var calligraphers_supplies_default = {
  name: "Calligrapher's Supplies",
  type: "artisans-tool",
  description: "Write text with impressive flourishes that guard against forgery (DC 15)",
  weight: 5,
  cost: 10
};

// rulebook/items/carpenters-tools.json
var carpenters_tools_default = {
  name: "Carpenter's Tools",
  type: "artisans-tool",
  description: "Seal or pry open a door or container (DC 20)",
  weight: 6,
  cost: 8
};

// rulebook/items/cartographers-tools.json
var cartographers_tools_default = {
  name: "Cartographer's Tools",
  type: "artisans-tool",
  description: "Draft a map of a small area (DC 15)",
  weight: 6,
  cost: 15
};

// rulebook/items/chain-mail.json
var chain_mail_default = {
  name: "Chain Mail",
  type: "armor",
  description: "16 -- Stealth Disadvantage",
  weight: 55,
  ac: "16",
  cost: 75
};

// rulebook/items/chain-shirt.json
var chain_shirt_default = {
  name: "Chain Shirt",
  type: "armor",
  description: "13 + Dex modifier (max 2)",
  weight: 20,
  ac: "13",
  cost: 50
};

// rulebook/items/club.json
var club_default = {
  name: "Club",
  type: "weapon",
  description: "Light",
  weight: 2,
  damage: "1d4 Bludgeoning",
  cost: 0.1
};

// rulebook/items/cobblers-tools.json
var cobblers_tools_default = {
  name: "Cobbler's Tools",
  type: "artisans-tool",
  description: "Modify footwear to give Advantage on the wearer's next Dexterity (Acrobatics) check (DC 10)",
  weight: 5,
  cost: 5
};

// rulebook/items/cooks-utensils.json
var cooks_utensils_default = {
  name: "Cook's Utensils",
  type: "artisans-tool",
  description: "Improve food's flavor (DC 10), or detect spoiled or poisoned food (DC 15)",
  weight: 8,
  cost: 1
};

// rulebook/items/dagger.json
var dagger_default = {
  name: "Dagger",
  type: "weapon",
  description: "Finesse, Light, Thrown (Range 20/60)",
  weight: 1,
  damage: "1d4 Piercing",
  cost: 2
};

// rulebook/items/dart.json
var dart_default = {
  name: "Dart",
  type: "weapon",
  description: "Finesse, Thrown (Range 20/60)",
  weight: 0.25,
  damage: "1d4 Piercing",
  cost: 0.05
};

// rulebook/items/dice.json
var dice_default = {
  name: "Gaming Set - Dice",
  type: "gaming-set",
  description: "Discern whether someone is cheating (DC 10), or win the game (DC 20)",
  weight: 0,
  cost: 0.1
};

// rulebook/items/disguise-kit.json
var disguise_kit_default = {
  name: "Disguise Kit",
  type: "gear",
  description: "Apply makeup (DC 10)",
  weight: 3,
  cost: 25
};

// rulebook/items/dragonchess.json
var dragonchess_default = {
  name: "Gaming Set - Dragonchess",
  type: "gaming-set",
  description: "Discern whether someone is cheating (DC 10), or win the game (DC 20)",
  weight: 0,
  cost: 1
};

// rulebook/items/drum.json
var drum_default = {
  name: "Drum",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 3,
  cost: 6
};

// rulebook/items/dulcimer.json
var dulcimer_default = {
  name: "Dulcimer",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 10,
  cost: 25
};

// rulebook/items/dungeoneers-pack.json
var dungeoneers_pack_default = {
  name: "Dungeoneer's Pack",
  type: "gear",
  description: "",
  weight: 55,
  cost: 12
};

// rulebook/items/entertainers-pack.json
var entertainers_pack_default = {
  name: "Entertainer's Pack",
  type: "gear",
  description: "",
  weight: 58.5,
  cost: 40
};

// rulebook/items/explorers-pack.json
var explorers_pack_default = {
  name: "Explorer's Pack",
  type: "gear",
  description: "",
  weight: 55,
  cost: 10
};

// rulebook/items/flail.json
var flail_default = {
  name: "Flail",
  type: "weapon",
  description: "",
  weight: 2,
  damage: "1d8 Bludgeoning",
  cost: 10
};

// rulebook/items/flute.json
var flute_default = {
  name: "Flute",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 1,
  cost: 2
};

// rulebook/items/forgery-kit.json
var forgery_kit_default = {
  name: "Forgery Kit",
  type: "gear",
  description: "Mimic 10 or fewer words of someone else's handwriting (DC 15), or duplicate a wax seal (DC 20)",
  weight: 5,
  cost: 15
};

// rulebook/items/glaive.json
var glaive_default = {
  name: "Glaive",
  type: "weapon",
  description: "Heavy, Reach, Two-Handed",
  weight: 6,
  damage: "1d10 Slashing",
  cost: 20
};

// rulebook/items/glassblowers-tools.json
var glassblowers_tools_default = {
  name: "Glassblower's Tools",
  type: "artisans-tool",
  description: "Discern what a glass object held in the past 24 hours (DC 15)",
  weight: 5,
  cost: 30
};

// rulebook/items/greataxe.json
var greataxe_default = {
  name: "Greataxe",
  type: "weapon",
  description: "Heavy, Two-Handed ",
  weight: 7,
  damage: "1d12 Slashing",
  cost: 30
};

// rulebook/items/greatclub.json
var greatclub_default = {
  name: "Greatclub",
  type: "weapon",
  description: "Two-Handed",
  weight: 10,
  damage: "1d8 Bludgeoning",
  cost: 0.2
};

// rulebook/items/greatsword.json
var greatsword_default = {
  name: "Greatsword",
  type: "weapon",
  description: "Heavy, Two-Handed",
  weight: 6,
  damage: "2d6 Slashing",
  cost: 50
};

// rulebook/items/halberd.json
var halberd_default = {
  name: "Halberd",
  type: "weapon",
  description: "Heavy, Reach, Two-Handed",
  weight: 6,
  damage: "1d10 Slashing",
  cost: 20
};

// rulebook/items/half-plate-armor.json
var half_plate_armor_default = {
  name: "Half Plate Armor",
  type: "armor",
  description: "15 + Dex modifier (max 2) -- Stealth Disadvantage",
  weight: 40,
  ac: "15",
  cost: 750
};

// rulebook/items/hand-crossbow.json
var hand_crossbow_default = {
  name: "Hand Crossbow",
  type: "weapon",
  description: "Ammunition (Range 30/120; Bolt), Light, Loading",
  weight: 3,
  damage: "1d6 Piercing",
  cost: 75
};

// rulebook/items/handaxe.json
var handaxe_default = {
  name: "Handaxe",
  type: "weapon",
  description: "Light, Thrown (Range 20/60)",
  weight: 2,
  damage: "1d6 Slashing",
  cost: 5
};

// rulebook/items/heavy-crossbow.json
var heavy_crossbow_default = {
  name: "Heavy Crossbow",
  type: "weapon",
  description: "Ammunition (Range 100/400; Bolt), Heavy, Loading, Two-Handed",
  weight: 18,
  damage: "1d10 Piercing",
  cost: 50
};

// rulebook/items/herbalism-kit.json
var herbalism_kit_default = {
  name: "Herbalism Kit",
  type: "gear",
  description: "Identify a plant (DC 10)",
  weight: 3,
  cost: 5
};

// rulebook/items/hide-armor.json
var hide_armor_default = {
  name: "Hide Armor",
  type: "armor",
  description: "12 + Dex modifier (max 2)",
  weight: 12,
  ac: "12",
  cost: 10
};

// rulebook/items/holy-symbol.json
var holy_symbol_default = {
  name: "Holy Symbol",
  type: "gear",
  description: "",
  weight: 0,
  cost: 0
};

// rulebook/items/horn.json
var horn_default = {
  name: "Horn",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 2,
  cost: 3
};

// rulebook/items/javelin.json
var javelin_default = {
  name: "Javelin",
  type: "weapon",
  description: "Thrown (Range 30/120)",
  weight: 2,
  damage: "1d6 Piercing",
  cost: 0.5
};

// rulebook/items/jewelers-tools.json
var jewelers_tools_default = {
  name: "Jeweler's Tools",
  type: "artisans-tool",
  description: "Discern a gem's value (DC 15)",
  weight: 2,
  cost: 25
};

// rulebook/items/lance.json
var lance_default = {
  name: "Lance",
  type: "weapon",
  description: "Heavy, Reach, Two-Handed (unless mounted)",
  weight: 6,
  damage: "1d10 Piercing",
  cost: 10
};

// rulebook/items/leather-armor.json
var leather_armor_default = {
  name: "Leather Armor",
  type: "armor",
  description: "11 + Dex modifier",
  weight: 10,
  ac: "11",
  cost: 10
};

// rulebook/items/leatherworkers-tools.json
var leatherworkers_tools_default = {
  name: "Leatherworker's Tools",
  type: "artisans-tool",
  description: "Add a design to a leather item (DC 10)",
  weight: 5,
  cost: 5
};

// rulebook/items/light-crossbow.json
var light_crossbow_default = {
  name: "Light Crossbow",
  type: "weapon",
  description: "Ammunition (Range 80/320; Bolt), Loading, Two-Handed",
  weight: 5,
  damage: "1d8 Piercing",
  cost: 25
};

// rulebook/items/light-hammer.json
var light_hammer_default = {
  name: "Light Hammer",
  type: "weapon",
  description: "Light, Thrown (Range 20/60)",
  weight: 2,
  damage: "1d4 Bludgeoning",
  cost: 2
};

// rulebook/items/longbow.json
var longbow_default = {
  name: "Longbow",
  type: "weapon",
  description: "Ammunition (Range 150/600; Arrow), Heavy, Two-Handed",
  weight: 2,
  damage: "1d8 Piercing",
  cost: 50
};

// rulebook/items/longsword.json
var longsword_default = {
  name: "Longsword",
  type: "weapon",
  description: "Versatile (1d10)",
  weight: 3,
  damage: "1d8 Slashing",
  cost: 15
};

// rulebook/items/lute.json
var lute_default = {
  name: "Lute",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 2,
  cost: 35
};

// rulebook/items/lyre.json
var lyre_default = {
  name: "Lyre",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 2,
  cost: 30
};

// rulebook/items/mace.json
var mace_default = {
  name: "Mace",
  type: "weapon",
  description: "Versatile (1d10)",
  weight: 4,
  damage: "1d6 Bludgeoning",
  cost: 5
};

// rulebook/items/masons-tools.json
var masons_tools_default = {
  name: "Mason's Tools",
  type: "artisans-tool",
  description: "Chisel a symbol or hole in stone (DC 10)",
  weight: 8,
  cost: 10
};

// rulebook/items/maul.json
var maul_default = {
  name: "Maul",
  type: "weapon",
  description: "Heavy, Two-Handed",
  weight: 10,
  damage: "2d6 Bludgeoning",
  cost: 10
};

// rulebook/items/morningstar.json
var morningstar_default = {
  name: "Morningstar",
  type: "weapon",
  description: "",
  weight: 4,
  damage: "1d8 Piercing",
  cost: 15
};

// rulebook/items/musket.json
var musket_default = {
  name: "Musket",
  type: "weapon",
  description: "Ammunition (Range 40/120; Bullet), Loading, Two-Handed",
  weight: 10,
  damage: "1d12 Piercing",
  cost: 500
};

// rulebook/items/navigators-tools.json
var navigators_tools_default = {
  name: "Navigator's Tools",
  type: "artisans-tool",
  description: "Plot a course (DC 10), or determine position by stargazing (DC 15)",
  weight: 2,
  cost: 25
};

// rulebook/items/padded-armor.json
var padded_armor_default = {
  name: "Padded Armor",
  type: "armor",
  description: "11 + Dex modifier -- Stealth Disadvantage",
  weight: 8,
  ac: "11",
  cost: 5
};

// rulebook/items/painters-supplies.json
var painters_supplies_default = {
  name: "Painter's Supplies",
  type: "artisans-tool",
  description: "Paint a recognizable image of something you've seen (DC 10)",
  weight: 5,
  cost: 10
};

// rulebook/items/pan-flute.json
var pan_flute_default = {
  name: "Pan Flute",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 2,
  cost: 12
};

// rulebook/items/pike.json
var pike_default = {
  name: "Pike",
  type: "weapon",
  description: "Heavy, Reach, Two-Handed",
  weight: 18,
  damage: "1d10 Piercing",
  cost: 5
};

// rulebook/items/pistol.json
var pistol_default = {
  name: "Pistol",
  type: "weapon",
  description: "Ammunition (Range 30/90; Bullet), Loading",
  weight: 3,
  damage: "1d10 Piercing",
  cost: 250
};

// rulebook/items/plate-armor.json
var plate_armor_default = {
  name: "Plate Armor",
  type: "armor",
  description: "18 -- Stealth Disadvantage",
  weight: 65,
  ac: "18",
  cost: 1500
};

// rulebook/items/playing-cards.json
var playing_cards_default = {
  name: "Gaming Set - Playing Cards",
  type: "gaming-set",
  description: "Discern whether someone is cheating (DC 10), or win the game (DC 20)",
  weight: 0,
  cost: 0.5
};

// rulebook/items/poisoners-kit.json
var poisoners_kit_default = {
  name: "Poisoner's Kit",
  type: "gear",
  description: "Detect a poisoned object (DC 10)",
  weight: 2,
  cost: 50
};

// rulebook/items/potters-tools.json
var potters_tools_default = {
  name: "Potter's Tools",
  type: "artisans-tool",
  description: "Discern what a ceramic object held in the past 24 hours (DC 15)",
  weight: 3,
  cost: 10
};

// rulebook/items/priests-pack.json
var priests_pack_default = {
  name: "Priest's Pack",
  type: "gear",
  description: "",
  weight: 29,
  cost: 33
};

// rulebook/items/quarterstaff.json
var quarterstaff_default = {
  name: "Quarterstaff",
  type: "weapon",
  description: "Versatile (1d8)",
  weight: 4,
  damage: "1d6 Bludgeoning",
  cost: 0.2
};

// rulebook/items/rapier.json
var rapier_default = {
  name: "Rapier",
  type: "weapon",
  description: "Finesse",
  weight: 2,
  damage: "1d8 Piercing",
  cost: 25
};

// rulebook/items/ring-mail.json
var ring_mail_default = {
  name: "Ring Mail",
  type: "armor",
  description: "14 -- Stealth Disadvantage",
  weight: 40,
  ac: "14",
  cost: 30
};

// rulebook/items/scale-mail.json
var scale_mail_default = {
  name: "Scale Mail",
  type: "armor",
  description: "14 + Dex modifier (max 2) -- Stealth Disadvantage",
  weight: 45,
  ac: "14",
  cost: 50
};

// rulebook/items/scholars-pack.json
var scholars_pack_default = {
  name: "Scholar's Pack",
  type: "gear",
  description: "",
  weight: 22,
  cost: 40
};

// rulebook/items/scimitar.json
var scimitar_default = {
  name: "Scimitar",
  type: "weapon",
  description: "Finesse, Light",
  weight: 3,
  damage: "1d6 Slashing",
  cost: 25
};

// rulebook/items/shawm.json
var shawm_default = {
  name: "Shawm",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 1,
  cost: 2
};

// rulebook/items/shield.json
var shield_default = {
  name: "Shield",
  type: "armor",
  description: "+2",
  weight: 6,
  ac: "+2",
  cost: 10
};

// rulebook/items/shortbow.json
var shortbow_default = {
  name: "Shortbow",
  type: "weapon",
  description: "Ammunition (Range 80/320; Arrow), Two-Handed",
  weight: 2,
  damage: "1d6 Piercing",
  cost: 25
};

// rulebook/items/shortsword.json
var shortsword_default = {
  name: "Shortsword",
  type: "weapon",
  description: "Finesse, Light",
  weight: 2,
  damage: "1d6 Piercing",
  cost: 10
};

// rulebook/items/sickle.json
var sickle_default = {
  name: "Sickle",
  type: "weapon",
  description: "Light",
  weight: 2,
  damage: "1d4 Slashing",
  cost: 1
};

// rulebook/items/sling.json
var sling_default = {
  name: "Sling",
  type: "weapon",
  description: "Ammunition (Range 30/120; Bullet)",
  weight: 0,
  damage: "1d4 Bludgeoning",
  cost: 0.1
};

// rulebook/items/smiths-tools.json
var smiths_tools_default = {
  name: "Smith's Tools",
  type: "artisans-tool",
  description: "Pry open a door or container (DC 20)",
  weight: 8,
  cost: 20
};

// rulebook/items/spear.json
var spear_default = {
  name: "Spear",
  type: "weapon",
  description: "Thrown (Range 20/60), Versatile (1d8)",
  weight: 1,
  damage: "1d6 Piercing",
  cost: 1
};

// rulebook/items/spellbook.json
var spellbook_default = {
  name: "Spellbook",
  type: "gear",
  description: "",
  weight: 3,
  cost: 0
};

// rulebook/items/splint-armor.json
var splint_armor_default = {
  name: "Splint Armor",
  type: "Armor",
  description: "17 -- Stealth Disadvantage",
  weight: 60,
  ac: "17",
  cost: 200
};

// rulebook/items/studded-leather-armor.json
var studded_leather_armor_default = {
  name: "Studded Leather Armor",
  type: "armor",
  description: "12 + Dex modifier",
  weight: 13,
  ac: "12",
  cost: 45
};

// rulebook/items/thieves-tools.json
var thieves_tools_default = {
  name: "Thieves' Tools",
  type: "artisans-tool",
  description: "Pick a lock (DC 15), or disarm a trap (DC 15)",
  weight: 1,
  cost: 25
};

// rulebook/items/three-dragon-ante.json
var three_dragon_ante_default = {
  name: "Gaming Set - Three-Dragon Ante",
  type: "gaming-set",
  description: "Discern whether someone is cheating (DC 10), or win the game (DC 20)",
  weight: 0,
  cost: 1
};

// rulebook/items/tinkers-tools.json
var tinkers_tools_default = {
  name: "Tinker's Tools",
  type: "artisans-tool",
  description: "Assemble a Tiny item composed of scrap, which falls apart in 1 minute (DC 20)",
  weight: 10,
  cost: 50
};

// rulebook/items/trident.json
var trident_default = {
  name: "Trident",
  type: "weapon",
  description: "Thrown (Range 20/60), Versatile (1d10)",
  weight: 4,
  damage: "1d8 Piercing",
  cost: 5
};

// rulebook/items/viol.json
var viol_default = {
  name: "Viol",
  type: "musical-instrument",
  description: "Play a known tune (DC 10), or improvise a song (DC 15)",
  weight: 1,
  cost: 30
};

// rulebook/items/war-pick.json
var war_pick_default = {
  name: "War Pick",
  type: "weapon",
  description: "Versatile (1d10)",
  weight: 2,
  damage: "1d8 Piercing",
  cost: 5
};

// rulebook/items/warhammer.json
var warhammer_default = {
  name: "Warhammer",
  type: "weapon",
  description: "Versatile (1d10)",
  weight: 5,
  damage: "1d8 Bludgeoning",
  cost: 15
};

// rulebook/items/weavers-tools.json
var weavers_tools_default = {
  name: "Weaver's Tools",
  type: "artisans-tool",
  description: "Mend a tear in clothing (DC 10), or sew a Tiny design (DC 10)",
  weight: 5,
  cost: 1
};

// rulebook/items/whip.json
var whip_default = {
  name: "Whip",
  type: "weapon",
  description: "Finesse, Reach",
  weight: 3,
  damage: "1d4 Slashing",
  cost: 2
};

// rulebook/items/woodcarvers-tools.json
var woodcarvers_tools_default = {
  name: "Woodcarver's Tools",
  type: "artisans-tool",
  description: "Carve a pattern in wood (DC 10)",
  weight: 5,
  cost: 1
};

// registry.ts
var classRegistry = {
  "barbarian": barbarian_default,
  "bard": bard_default,
  "cleric": cleric_default,
  "druid": druid_default,
  "fighter": fighter_default,
  "monk": monk_default,
  "paladin": paladin_default,
  "ranger": ranger_default,
  "rogue": rogue_default,
  "sorcerer": sorcerer_default,
  "warlock": warlock_default,
  "wizard": wizard_default
};
var subclassRegistry = {
  "barbarian-subclasses": barbarian_subclasses_default,
  "bard-subclasses": bard_subclasses_default,
  "cleric-subclasses": cleric_subclasses_default,
  "druid-subclasses": druid_subclasses_default,
  "fighter-subclasses": fighter_subclasses_default,
  "monk-subclasses": monk_subclasses_default,
  "paladin-subclasses": paladin_subclasses_default,
  "ranger-subclasses.json": ranger_subclasses_json_default,
  "rogue-subclasses": rogue_subclasses_default,
  "sorcerer-subclasses": sorcerer_subclasses_default,
  "warlock-subclasses": warlock_subclasses_default,
  "wizard-subclasses": wizard_subclasses_default
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
  "aasimar": aasimar_default,
  "dragonborn": dragonborn_default,
  "dwarf": dwarf_default,
  "elf": elf_default,
  "gnome": gnome_default,
  "goliath": goliath_default,
  "half-orc": half_orc_default,
  "halfling": halfling_default,
  "human": human_default,
  "orc": orc_default,
  "tiefling": tiefling_default
};
var itemRegistry = {
  "alchemists-supplies": alchemists_supplies_default,
  "bagpipes": bagpipes_default,
  "battleaxe": battleaxe_default,
  "blowgun": blowgun_default,
  "breastplate": breastplate_default,
  "brewers-supplies": brewers_supplies_default,
  "bulglars-pack": bulglars_pack_default,
  "calligraphers-supplies": calligraphers_supplies_default,
  "carpenters-tools": carpenters_tools_default,
  "cartographers-tools": cartographers_tools_default,
  "chain-mail": chain_mail_default,
  "chain-shirt": chain_shirt_default,
  "club": club_default,
  "cobblers-tools": cobblers_tools_default,
  "cooks-utensils": cooks_utensils_default,
  "dagger": dagger_default,
  "dart": dart_default,
  "dice": dice_default,
  "disguise-kit": disguise_kit_default,
  "dragonchess": dragonchess_default,
  "drum": drum_default,
  "dulcimer": dulcimer_default,
  "dungeoneers-pack": dungeoneers_pack_default,
  "entertainers-pack": entertainers_pack_default,
  "explorers-pack": explorers_pack_default,
  "flail": flail_default,
  "flute": flute_default,
  "forgery-kit": forgery_kit_default,
  "glaive": glaive_default,
  "glassblowers-tools": glassblowers_tools_default,
  "greataxe": greataxe_default,
  "greatclub": greatclub_default,
  "greatsword": greatsword_default,
  "halberd": halberd_default,
  "half-plate-armor": half_plate_armor_default,
  "hand-crossbow": hand_crossbow_default,
  "handaxe": handaxe_default,
  "heavy-crossbow": heavy_crossbow_default,
  "herbalism-kit": herbalism_kit_default,
  "hide-armor": hide_armor_default,
  "holy-symbol": holy_symbol_default,
  "horn": horn_default,
  "javelin": javelin_default,
  "jewelers-tools": jewelers_tools_default,
  "lance": lance_default,
  "leather-armor": leather_armor_default,
  "leatherworkers-tools": leatherworkers_tools_default,
  "light-crossbow": light_crossbow_default,
  "light-hammer": light_hammer_default,
  "longbow": longbow_default,
  "longsword": longsword_default,
  "lute": lute_default,
  "lyre": lyre_default,
  "mace": mace_default,
  "masons-tools": masons_tools_default,
  "maul": maul_default,
  "morningstar": morningstar_default,
  "musket": musket_default,
  "navigators-tools": navigators_tools_default,
  "padded-armor": padded_armor_default,
  "painters-supplies": painters_supplies_default,
  "pan-flute": pan_flute_default,
  "pike": pike_default,
  "pistol": pistol_default,
  "plate-armor": plate_armor_default,
  "playing-cards": playing_cards_default,
  "poisoners-kit": poisoners_kit_default,
  "potters-tools": potters_tools_default,
  "priests-pack": priests_pack_default,
  "quarterstaff": quarterstaff_default,
  "rapier": rapier_default,
  "ring-mail": ring_mail_default,
  "scale-mail": scale_mail_default,
  "scholars-pack": scholars_pack_default,
  "scimitar": scimitar_default,
  "shawm": shawm_default,
  "shield": shield_default,
  "shortbow": shortbow_default,
  "shortsword": shortsword_default,
  "sickle": sickle_default,
  "sling": sling_default,
  "smiths-tools": smiths_tools_default,
  "spear": spear_default,
  "spellbook": spellbook_default,
  "splint-armor": splint_armor_default,
  "studded-leather-armor": studded_leather_armor_default,
  "thieves-tools": thieves_tools_default,
  "three-dragon-ante": three_dragon_ante_default,
  "tinkers-tools": tinkers_tools_default,
  "trident": trident_default,
  "viol": viol_default,
  "war-pick": war_pick_default,
  "warhammer": warhammer_default,
  "weavers-tools": weavers_tools_default,
  "whip": whip_default,
  "woodcarvers-tools": woodcarvers_tools_default
};

// data.ts
var import_obsidian = require("obsidian");
function getIgnoreCase(registry, searchKey) {
  if (!registry || !searchKey) return null;
  const normalizedKey = Array.isArray(searchKey) ? searchKey[0] : searchKey;
  if (typeof normalizedKey !== "string") return null;
  const realKey = Object.keys(registry).find((k) => k.toLowerCase() === normalizedKey.toLowerCase());
  return realKey ? registry[realKey] : null;
}
async function readCustomJson(app, fullPath) {
  const adapter = app.vault.adapter;
  if (await adapter.exists(fullPath)) {
    try {
      const fileContent = await adapter.read(fullPath);
      return JSON.parse(fileContent);
    } catch (e) {
      console.error(`D&D Plugin: Failed to parse custom file at ${fullPath}`, e);
      return null;
    }
  }
  return null;
}
async function getCustomMappedName(app, basePath, routerFile, searchKey) {
  const routerPath = (0, import_obsidian.normalizePath)(`${basePath}/${routerFile}`);
  const routerData = await readCustomJson(app, routerPath);
  if (!routerData) return null;
  return getIgnoreCase(routerData, searchKey);
}
async function getClassData(app, settings, className) {
  const fetchNative = () => {
    const classFile = getIgnoreCase(classes_default, className);
    return classFile ? getIgnoreCase(classRegistry, classFile) : null;
  };
  const fetchCustom = async () => {
    if (!settings.customRulebookPath) return null;
    const customFileId = await getCustomMappedName(app, settings.customRulebookPath, "classes.json", className);
    if (!customFileId) return null;
    return await readCustomJson(app, (0, import_obsidian.normalizePath)(`${settings.customRulebookPath}/classes/${customFileId}.json`));
  };
  if (settings.customRulebookPath) {
    if (settings.customRulebookPriority) {
      return await fetchCustom() || fetchNative();
    } else {
      return fetchNative() || await fetchCustom();
    }
  }
  return fetchNative();
}
async function getSubclassData(app, settings, subclassFile, subclassName) {
  const fetchNative = () => {
    const fileData = getIgnoreCase(subclassRegistry, subclassFile);
    return fileData ? getIgnoreCase(fileData, subclassName) : null;
  };
  const fetchCustom = async () => {
    if (!settings.customRulebookPath) return null;
    const fileData = await readCustomJson(app, (0, import_obsidian.normalizePath)(`${settings.customRulebookPath}/classes/${subclassFile}.json`));
    return fileData ? getIgnoreCase(fileData, subclassName) : null;
  };
  if (settings.customRulebookPath) {
    if (settings.customRulebookPriority) {
      return await fetchCustom() || fetchNative();
    } else {
      return fetchNative() || await fetchCustom();
    }
  }
  return fetchNative();
}
async function getBackgroundData(app, settings, backgroundName) {
  const fetchNative = () => {
    return getIgnoreCase(backgrounds_default, backgroundName);
  };
  const fetchCustom = async () => {
    if (!settings.customRulebookPath) return null;
    return await getCustomMappedName(app, settings.customRulebookPath, "backgrounds.json", backgroundName);
  };
  if (settings.customRulebookPath) {
    if (settings.customRulebookPriority) {
      return await fetchCustom() || fetchNative();
    } else {
      return fetchNative() || await fetchCustom();
    }
  }
  return fetchNative();
}
async function getRaceData(app, settings, raceName) {
  const fetchNative = () => {
    const raceId = getIgnoreCase(races_default, raceName);
    return raceId ? getIgnoreCase(raceRegistry, raceId) : null;
  };
  const fetchCustom = async () => {
    if (!settings.customRulebookPath) return null;
    const raceId = await getCustomMappedName(app, settings.customRulebookPath, "races.json", raceName);
    if (!raceId) return null;
    return await readCustomJson(app, (0, import_obsidian.normalizePath)(`${settings.customRulebookPath}/races/${raceId}.json`));
  };
  if (settings.customRulebookPath) {
    if (settings.customRulebookPriority) {
      return await fetchCustom() || fetchNative();
    } else {
      return fetchNative() || await fetchCustom();
    }
  }
  return fetchNative();
}
async function getExtraFeat(app, settings, featName) {
  const safeName = Array.isArray(featName) ? featName[0] : featName;
  if (typeof safeName !== "string") return null;
  const featId = safeName.toLowerCase().replace(/\s+/g, "-");
  const fetchNative = () => getIgnoreCase(featRegistry, featId);
  const fetchCustom = async () => {
    if (!settings.customRulebookPath) return null;
    return await readCustomJson(app, (0, import_obsidian.normalizePath)(`${settings.customRulebookPath}/feats/${featId}.json`));
  };
  if (settings.customRulebookPath) {
    if (settings.customRulebookPriority) {
      return await fetchCustom() || fetchNative();
    } else {
      return fetchNative() || await fetchCustom();
    }
  }
  return fetchNative();
}
async function getItemData(app, settings, itemName) {
  const fetchNative = () => {
    const isAlreadyFilename = Object.values(items_default).includes(itemName);
    const itemId = isAlreadyFilename ? itemName : getIgnoreCase(items_default, itemName);
    return itemId ? getIgnoreCase(itemRegistry, itemId) : null;
  };
  const fetchCustom = async () => {
    if (!settings.customRulebookPath) return null;
    const itemId = await getCustomMappedName(app, settings.customRulebookPath, "items.json", itemName);
    if (!itemId) return null;
    return await readCustomJson(app, (0, import_obsidian.normalizePath)(`${settings.customRulebookPath}/items/${itemId}.json`));
  };
  if (settings.customRulebookPath) {
    if (settings.customRulebookPriority) {
      return await fetchCustom() || fetchNative();
    } else {
      return fetchNative() || await fetchCustom();
    }
  }
  return fetchNative();
}

// main.ts
var DEFAULT_SETTINGS = {
  combineClassSubclass: false,
  sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra Feats"],
  themeChoice: "default",
  customRulebookPath: "",
  customRulebookPriority: false,
  customColors: {
    // ... (Keep all your existing color variables here exactly as they are) ...
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
var DnDFeaturesPlugin = class extends import_obsidian2.Plugin {
  // Add the settings property
  settings;
  async onload() {
    await this.loadSettings();
    this.applyTheme();
    this.addSettingTab(new DnDSettingsTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor(
      "dnd-features",
      this.processDnDFeaturesBlock.bind(this)
    );
    this.registerMarkdownCodeBlockProcessor(
      "dnd-inventory",
      this.processDnDInventoryBlock.bind(this)
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
  // --- Helper: Safely Update Gold Frontmatter ---
  async updateGoldFrontmatter(filePath, type, amount) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof import_obsidian2.TFile) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const key = `dnd_gold_${type}`;
        const current = Number(frontmatter[key]) || 0;
        frontmatter[key] = current + amount;
      });
    }
  }
  // --- Helper: Safely Render Markdown and Fix Spacing ---
  async renderDndMarkdown(text, container, sourcePath, component) {
    if (!text) return;
    const cleanText = text.trim().replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");
    await import_obsidian2.MarkdownRenderer.render(this.app, cleanText, container, sourcePath, component);
    const firstChild = container.firstElementChild;
    if (firstChild && firstChild.tagName.match(/^H[1-6]$/i)) {
      firstChild.style.marginTop = "0";
    }
    const lastChild = container.lastElementChild;
    if (lastChild) {
      lastChild.style.marginBottom = "0";
    }
    const blockElements = container.querySelectorAll("h1, h2, h3, h4, h5, h6, p, ul, ol, li, blockquote, pre, table, hr");
    blockElements.forEach((el) => {
      const htmlEl = el;
      const tag = htmlEl.tagName.toLowerCase();
      htmlEl.style.marginTop = "0";
      htmlEl.style.marginBottom = "0";
      if (["h1", "h2", "h3", "h4", "h5", "h6", "table", "blockquote", "pre", "hr"].includes(tag)) {
        htmlEl.style.marginTop = "0.5em";
        htmlEl.style.marginBottom = "0.5em";
      } else if (tag === "p" && htmlEl.closest("li")) {
        htmlEl.style.display = "inline";
      } else if (tag === "ul" || tag === "ol") {
        htmlEl.style.paddingTop = "0";
        htmlEl.style.marginLeft = "0";
        htmlEl.style.paddingLeft = "0";
      } else if (tag === "li") {
        htmlEl.style.listStyleType = "none";
        htmlEl.style.paddingLeft = "0";
        htmlEl.style.marginLeft = "0";
        htmlEl.style.textIndent = "1.05em";
        htmlEl.style.position = "relative";
        if (!htmlEl.getAttribute("data-custom-bullet")) {
          const bulletSpan = document.createElement("span");
          bulletSpan.innerHTML = "&bull;";
          bulletSpan.style.position = "absolute";
          bulletSpan.style.left = "0";
          bulletSpan.style.textIndent = "0";
          bulletSpan.style.lineHeight = "1";
          bulletSpan.style.top = "-0.175em";
          bulletSpan.style.color = "var(--dnd-text-secondary)";
          bulletSpan.style.fontSize = "2em";
          htmlEl.insertBefore(bulletSpan, htmlEl.firstChild);
          htmlEl.setAttribute("data-custom-bullet", "true");
        }
      }
    });
  }
  async processDnDFeaturesBlock(source, el, ctx) {
    const renderChild = new import_obsidian2.MarkdownRenderChild(el);
    ctx.addChild(renderChild);
    const renderContent = async () => {
      const wrapper = document.createElement("div");
      let blockData;
      try {
        blockData = (0, import_obsidian2.parseYaml)(source);
      } catch (error) {
        wrapper.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
        el.empty();
        el.appendChild(wrapper);
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
      const raceLineage = resolveValue(blockData["race-lineage"]);
      const background = resolveValue(blockData.background);
      const extraFeats = resolveValue(blockData["extra-feats"]);
      const hideRaw = resolveValue(blockData.hide);
      let hiddenFeatures = [];
      if (Array.isArray(hideRaw)) {
        hiddenFeatures = hideRaw.map((name) => String(name).toLowerCase().trim());
      } else if (typeof hideRaw === "string") {
        hiddenFeatures = hideRaw.split(",").map((name) => String(name).toLowerCase().trim());
      }
      const parsedLevel = Number(level) || 0;
      if (Array.isArray(dndClass) && dndClass.length > 1) {
        if (!Array.isArray(classLevels) || classLevels.length !== dndClass.length) {
          const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
          errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
          errorBox.createEl("p", {
            text: `You have multiple classes listed, but the "class-levels" variable is missing or is invalid. Please provide a level for each class.`
          });
          el.empty();
          el.appendChild(wrapper);
          return;
        }
        const totalClassLevels = classLevels.reduce((sum, current) => sum + Number(current), 0);
        if (totalClassLevels !== parsedLevel) {
          const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
          errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
          errorBox.createEl("p", {
            text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${parsedLevel}).`
          });
          el.empty();
          el.appendChild(wrapper);
          return;
        }
      }
      const classArray = Array.isArray(dndClass) ? dndClass : [dndClass];
      const rawSubclassArray = Array.isArray(subclass) ? subclass : subclass ? [subclass] : [];
      const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);
      let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : extraFeats ? [extraFeats] : [];
      if (dndClass) {
        for (let index = 0; index < classArray.length; index++) {
          const className = classArray[index];
          const currentClassLevel = classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index ? Number(classLevels[index]) : Number(level);
          const classData = await getClassData(this.app, this.settings, className);
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
                const subclassData = await getSubclassData(this.app, this.settings, classData.subclassFile, subclassArray[index]);
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
        }
      }
      finalExtraFeats = [...new Set(finalExtraFeats)];
      for (const sectionName of this.settings.sectionOrder) {
        if (sectionName === "Class" && !dndClass) continue;
        if (sectionName === "Subclass" && (!subclass || this.settings.combineClassSubclass || Number(level) < 3)) continue;
        if (sectionName === "Race" && !race) continue;
        if (sectionName === "Background" && !background) continue;
        if (sectionName === "Extra Feats" && finalExtraFeats.length === 0) continue;
        let sectionTitle = `${sectionName} Features:`;
        if (sectionName === "Class" && this.settings.combineClassSubclass && subclass) sectionTitle = "Class & Subclass Features:";
        if (sectionName === "Race") sectionTitle = "Race Traits:";
        if (sectionName === "Background") sectionTitle = "Background Feat:";
        if (sectionName === "Extra Feats") sectionTitle = "Extra Feats:";
        wrapper.createEl("h3", { text: sectionTitle, cls: "dnd-section-header" });
        const sectionWindow = wrapper.createDiv({ cls: "dnd-features-window" });
        const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });
        if (sectionName === "Class") {
          for (let index = 0; index < classArray.length; index++) {
            const className = classArray[index];
            const currentClassLevel = classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index ? Number(classLevels[index]) : Number(level);
            if (classArray.length > 1) {
              sectionDiv.createEl("h4", { text: `${className} Features (Level ${currentClassLevel})`, cls: "dnd-class-header" });
            }
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
        } else if (sectionName === "Subclass") {
          for (let index = 0; index < classArray.length; index++) {
            const className = classArray[index];
            const currentClassLevel = Array.isArray(classLevels) ? classLevels[index] : level;
            const subclassName = subclassArray[index];
            const classData = await getClassData(this.app, this.settings, className);
            if (subclassName && classData && classData.subclassFile) {
              if (classArray.length > 1) {
                sectionDiv.createEl("h4", { text: `${subclassName} Features`, cls: "dnd-class-header" });
              }
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
        } else if (sectionName === "Race") {
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
        } else if (sectionName === "Background") {
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
        } else if (sectionName === "Extra Feats") {
          for (const featId of finalExtraFeats) {
            const safeFeatId = typeof featId === "string" ? featId : String(featId);
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
    renderContent();
    renderChild.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path === ctx.sourcePath) {
          renderContent();
        }
      })
    );
  }
  async processDnDInventoryBlock(source, el, ctx) {
    const renderChild = new import_obsidian2.MarkdownRenderChild(el);
    ctx.addChild(renderChild);
    const renderContent = async () => {
      const wrapper = document.createElement("div");
      let blockData;
      try {
        blockData = (0, import_obsidian2.parseYaml)(source);
      } catch (error) {
        wrapper.createEl("p", { text: "Error: Invalid format in dnd-inventory block.", cls: "dnd-error" });
        el.empty();
        el.appendChild(wrapper);
        return;
      }
      const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
      const frontmatter = fileCache?.frontmatter || {};
      const resolveValue = (val) => {
        if (typeof val === "string" && val.startsWith("frontmatter.")) {
          return frontmatter[val.replace("frontmatter.", "")];
        }
        return val;
      };
      const dndClass = resolveValue(blockData.class);
      const background = resolveValue(blockData.background);
      const classEq = resolveValue(blockData["class-equipment"]);
      const bgEq = resolveValue(blockData["background-equipment"]);
      const weaponSlot = resolveValue(blockData.weapon);
      const weaponDamage = resolveValue(blockData.weapon_damage);
      const armorSlot = resolveValue(blockData.armor);
      const armorAc = resolveValue(blockData.armor_ac);
      const extraItemsRaw = resolveValue(blockData["extra-items"]);
      const classChosenItemsRaw = resolveValue(blockData["class-chosen-items"]);
      const bgChosenItemsRaw = resolveValue(blockData["background-chosen-items"]);
      const sanitizeItem = (val) => {
        if (!val) return null;
        return String(val).toLowerCase().replace(/['"]/g, "").trim().replace(/\s+/g, "-");
      };
      const buildPool = async (rawItems) => {
        const list = Array.isArray(rawItems) ? rawItems : typeof rawItems === "string" ? rawItems.split(",") : rawItems ? [String(rawItems)] : [];
        const pool = [];
        for (const item of list) {
          const safeId = sanitizeItem(item);
          if (!safeId) continue;
          const data = await getItemData(this.app, this.settings, safeId);
          if (data && data.type) {
            pool.push({ id: safeId, type: sanitizeItem(data.type) });
          }
        }
        return pool;
      };
      const classChosenItemsPool = await buildPool(classChosenItemsRaw);
      const bgChosenItemsPool = await buildPool(bgChosenItemsRaw);
      let grantedGold = 0;
      const startingItemCounts = {};
      const extraItemCounts = {};
      const addItemsToPool = (eqData, targetPool, sourcePool) => {
        if (!eqData) return;
        if (eqData.gold) grantedGold += Number(eqData.gold);
        const itemsList = eqData.items ? eqData.items : eqData.gold ? null : eqData;
        if (itemsList) {
          const strictSlots = [];
          const flexibleSlots = [];
          for (const [itemId, qty] of Object.entries(itemsList)) {
            if (itemId.includes("|")) {
              flexibleSlots.push([itemId, Number(qty)]);
            } else {
              strictSlots.push([itemId, Number(qty)]);
            }
          }
          for (const [itemId, qty] of strictSlots) {
            targetPool[itemId] = (targetPool[itemId] || 0) + Number(qty);
          }
          flexibleSlots.sort((a, b) => a[0].split("|").length - b[0].split("|").length);
          for (const [itemId, qty] of flexibleSlots) {
            const acceptedTypes = itemId.split("|").map((t) => sanitizeItem(t));
            let amountNeeded = Number(qty);
            for (let i = 0; i < sourcePool.length && amountNeeded > 0; i++) {
              const poolItem = sourcePool[i];
              if (acceptedTypes.includes(poolItem.type)) {
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
        if (classData?.["starting-equipment"]) addItemsToPool(classData["starting-equipment"][classEq], startingItemCounts, classChosenItemsPool);
      }
      if (background && bgEq) {
        const bgData = await getBackgroundData(this.app, this.settings, background);
        if (bgData?.["starting-equipment"]) {
          addItemsToPool(bgData["starting-equipment"][bgEq], startingItemCounts, bgChosenItemsPool);
        }
      }
      let extraItems = [];
      if (Array.isArray(extraItemsRaw)) {
        extraItems = extraItemsRaw;
      } else if (typeof extraItemsRaw === "string") {
        extraItems = extraItemsRaw.split(",");
      } else if (extraItemsRaw) {
        extraItems = [String(extraItemsRaw)];
      }
      for (const item of extraItems) {
        const safeItem = sanitizeItem(item);
        if (!safeItem) continue;
        extraItemCounts[safeItem] = (extraItemCounts[safeItem] || 0) + 1;
      }
      const consumeItem = (rawItemName) => {
        const safeName = sanitizeItem(rawItemName);
        if (!safeName) return null;
        if (startingItemCounts[safeName] && startingItemCounts[safeName] > 0) {
          startingItemCounts[safeName] -= 1;
        } else if (extraItemCounts[safeName] && extraItemCounts[safeName] > 0) {
          extraItemCounts[safeName] -= 1;
        }
        return String(rawItemName).replace(/['"]/g, "").trim();
      };
      const equippedWeapon = consumeItem(weaponSlot);
      const equippedArmor = consumeItem(armorSlot);
      wrapper.createEl("h3", { text: "Equipment, Wealth & Items:", cls: "dnd-section-header" });
      if (equippedWeapon || equippedArmor) {
        const equipGrid = wrapper.createDiv({
          attr: { style: "display: flex; gap: 10px;" }
        });
        const renderSlot = async (slotLabel, rawItemInput, manualStat, expectedType) => {
          if (!rawItemInput) return;
          const actualName = String(rawItemInput).replace(/['"]/g, "").trim();
          if (actualName.toLowerCase() === "none") return;
          const safeName = sanitizeItem(rawItemInput);
          let data = await getItemData(this.app, this.settings, safeName);
          const isRecognizedType = data && data.type && String(data.type).toLowerCase().includes(expectedType.toLowerCase());
          let displayName = actualName;
          let displayStat = manualStat ? String(manualStat) : "-";
          let displayDesc = "";
          if (isRecognizedType) {
            displayName = data.name || actualName;
            displayStat = expectedType === "Weapon" ? data.damage || "-" : data.ac || "-";
            displayDesc = data.description || "";
          }
          const card = equipGrid.createDiv({
            cls: "dnd-features-window",
            attr: { style: "flex: 1; display: flex; flex-direction: column; padding: 10px; text-align: center; margin: 0; justify-content: center; gap: 6px;" }
          });
          card.createDiv({
            text: displayName.toUpperCase(),
            attr: { style: "font-size: 0.85em; color: var(--dnd-text-secondary); letter-spacing: 1.5px; font-weight: 600;" }
          });
          card.createDiv({
            text: displayStat,
            attr: { style: "font-size: 1.6em; font-weight: bold; color: var(--dnd-text-bright);" }
          });
          if (displayDesc) {
            const noteDiv = card.createDiv({
              attr: { style: "font-size: 0.9em; color: var(--dnd-text-sublabel); line-height: 1.3;" }
            });
            await this.renderDndMarkdown(displayDesc, noteDiv, ctx.sourcePath, renderChild);
            noteDiv.querySelectorAll("*").forEach((childEl) => {
              childEl.style.display = "inline";
              childEl.style.margin = "0";
              childEl.style.padding = "0";
            });
          }
        };
        await renderSlot("Weapon", equippedWeapon, weaponDamage, "Weapon");
        await renderSlot("Armor", equippedArmor, armorAc, "Armor");
      }
      const goldBase = Number(frontmatter["dnd_gold_base"]) || 0;
      const goldAdded = Number(frontmatter["dnd_gold_added"]) || 0;
      const goldSpent = Number(frontmatter["dnd_gold_spent"]) || 0;
      const totalGold = goldBase + goldAdded + grantedGold - goldSpent;
      const wealthWindow = wrapper.createDiv({
        cls: "dnd-features-window",
        attr: { style: "display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 12px 16px;" }
      });
      const wealth = wealthWindow.createEl("span", { attr: { style: "display: flex; align-items: center;" } });
      wealth.createEl("span", { text: "Wealth", cls: "dnd-level-badge", attr: { style: "margin-right: 10px;" } });
      wealth.createEl("strong", { text: `${totalGold} GP`, attr: { style: "font-size: 1.1em; color: var(--dnd-text-bright);" } });
      const amountInput = wealthWindow.createEl("input", { type: "number", value: "1", attr: { style: "text-align: center; background: var(--dnd-bg-darker); border: 1px solid var(--dnd-border-primary); color: var(--dnd-text-bright); border-radius: 4px; padding: 4px; width: 40px;" } });
      const addBtn = wealthWindow.createEl("button", { text: "Add" });
      const subBtn = wealthWindow.createEl("button", { text: "Spend" });
      addBtn.onclick = () => this.updateGoldFrontmatter(ctx.sourcePath, "added", Number(amountInput.value) || 0);
      subBtn.onclick = () => this.updateGoldFrontmatter(ctx.sourcePath, "spent", Number(amountInput.value) || 0);
      const backpackWindow = wrapper.createDiv({ cls: "dnd-features-window" });
      backpackWindow.createEl("h4", { text: "Backpack Contents", cls: "dnd-class-header", attr: { style: "margin: 0 0 10px 0; border-bottom: 1px solid var(--dnd-border-primary); padding-bottom: 8px;" } });
      const renderPool = async (pool, title) => {
        const validItems = Object.entries(pool).filter(([_, qty]) => qty > 0);
        if (validItems.length === 0) return;
        if (title) {
          backpackWindow.createEl("div", { text: title, attr: { style: "margin: 16px 0 8px 0; font-weight: bold; font-size: 0.85em; text-transform: uppercase; color: var(--dnd-text-sublabel); border-bottom: 1px solid var(--dnd-bg-tertiary); padding-bottom: 4px;" } });
        }
        const gridContainer = backpackWindow.createDiv({
          attr: { style: "display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; row-gap: 4px;" }
        });
        for (const [itemId, qty] of validItems) {
          let data = await getItemData(this.app, this.settings, itemId);
          const fallbackName = itemId.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/-/g, " ");
          if (!data) data = { name: fallbackName, description: "" };
          const itemRow = gridContainer.createEl("span", {
            attr: { style: "display: flex; flex-direction: row; align-items: center; width: 100%; padding: 3px 0;" }
          });
          itemRow.createEl("span", { text: `x${qty}`, cls: "dnd-level-badge", attr: { style: "margin: 0 10px 0 0; flex-shrink: 0;" } });
          const hasExtraInfo = !!(data.weight || data.cost);
          const colon = hasExtraInfo ? ": " : "";
          itemRow.createEl("strong", { text: data.name + colon, attr: { style: "color: var(--dnd-text-bright); margin-right: 4px" } });
          const rightSide = itemRow.createEl("span", {
            attr: { style: "color: var(--dnd-text-muted); font-size: 0.9em; white-space: nowrap; text-align: center;" }
          });
          if (data.weight) {
            rightSide.createEl("span", { text: `${data.weight * qty}lbs,  ` });
          }
          if (data.cost) {
            rightSide.createEl("span", { text: `${data.cost}GP` });
          }
        }
      };
      await renderPool(startingItemCounts);
      await renderPool(extraItemCounts, "Extra Items");
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
};
var DnDSettingsTab = class extends import_obsidian2.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "D&D 5.5e Features Settings" });
    new import_obsidian2.Setting(containerEl).setName("Combine Class and Subclass Features").setDesc("If enabled, subclass features will be mixed chronologically into the main class section.").addToggle((toggle) => toggle.setValue(this.plugin.settings.combineClassSubclass).onChange(async (value) => {
      this.plugin.settings.combineClassSubclass = value;
      await this.plugin.saveSettings();
      this.display();
    }));
    containerEl.createEl("h3", { text: "Homebrew & Custom Data", cls: "setting-item-name dnd-settings-header" });
    containerEl.createEl("p", { text: "Add your own custom JSON files to expand or overwrite the native rulebook.", cls: "setting-item-description" });
    new import_obsidian2.Setting(containerEl).setName("Custom Rulebook Folder Path").setDesc('Enter the path to your custom rulebook folder within your vault (e.g., "TTRPG/My Rulebook"). Leave blank to disable.').addText((text) => text.setPlaceholder("Folder path...").setValue(this.plugin.settings.customRulebookPath).onChange(async (value) => {
      this.plugin.settings.customRulebookPath = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Custom Rulebook Priority").setDesc("If enabled, custom homebrew files will completely overwrite native files with the same name. If disabled, native files take priority.").addToggle((toggle) => toggle.setValue(this.plugin.settings.customRulebookPriority).onChange(async (value) => {
      this.plugin.settings.customRulebookPriority = value;
      await this.plugin.saveSettings();
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
    new import_obsidian2.Setting(containerEl).setName("Theme Selection").setDesc("Choose between the default layout colors or create your own custom palette.").addDropdown((drop) => drop.addOption("default", "Default Dark Theme").addOption("custom", "Custom Colors").setValue(this.plugin.settings.themeChoice).onChange(async (value) => {
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
          new import_obsidian2.Setting(containerEl).setName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1)).addColorPicker((color) => color.setValue(this.plugin.settings.customColors[variable]).onChange(async (value) => {
            this.plugin.settings.customColors[variable] = value;
            this.plugin.applyTheme();
            await this.plugin.saveSettings();
          }));
        });
      }
    }
  }
};
