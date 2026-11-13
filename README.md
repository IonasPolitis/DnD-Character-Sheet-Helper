# DnD Character Sheet Helper

> [!NOTE]
> DnD Character Sheet Helper is an Obsidian Plugin that brings the DnD Rulebook 5.5e (2024) right inside your Digital Character Sheet. This is not a replacement for the DnD Player's Handbook, but just a handy tool that gives you the information you might need, or you wouldn't remember on top of your mind, while playing.

> [!NOTE]
> **Player Self-Policing & Modularity:**
> Due to the openness and modularity of this plugin, the decision was made to let players choose whatever they want without creating unnecessary filtering, restrictions, and extra overhead and complexity on the plugin's logic and database files. The user of this plugin should use the provided warnings and lack of information given in certain areas as a reminder to always read through the *Player's Handbook* if they need to make a choice that they do not know the implications of or don't have the contents of the option they are about to choose at the top of their heads. Again, this is not a replacement for the *Player's Handbook*, just a simple and easy way to create, manage, and view a player's Character Sheet.
> 
> (I'll also remind that the files are not supposed to be super complex, but easily created with the templates given below in case a user wants to make their own Custom Rulebook with Homebrewed Classes, etc.)

> If there are any races or classes you want me to add to this plugin, make a feature request on GitHub.

> (If any text has been written wrong please make an Issue Report on GitHub. I maintain it myself)


## DnD Wizard:

You can us the Character Creation Wizard command on an open note and create your new DnD Character Sheet, just fill all the availabe fields and options in the wizard and your Character Sheet will be created for you; just be sure to stick to the rules of the Player's Handbook and read throug it to know which options you want to choose.
Everything will be placed in appropriate frontmatter variuables (file properties) that then can be fetched by the rest of the code blocks in the Character Sheet Template provided by the creation wizard.

## For creating a Character Sheet on your own, you may use one, or all of the code blocks below to assist you into managing your chracter:

### DnD Healthbar:

A Health-bar widget with integrated Hit Dice, Saving Throws, and the ability to add Temporary Hit Points.

A Sample of the Code Block looks like this:
````makrdown
```dnd-health
health: $num$
currentHealth: $num$
hitDice: $string$
level: $num$
```
````

### DnD Information:

There are two modes to this plugin, one of them shows information related to your character and anothe one on combat, with each one having different variables that you may need to fill in.

A Sample of the Code Block looks like this:
````markdown
```dnd-info
mode: character
race: $array$
raceLineage: $array$
class: $array$
subclass: $array$
background: $string$
backgroundFeat: $string$
level: $num$
languages: $array$
```
````
or this:
````markdown
```dnd-info
mode: combat
armor: $string$
armorAc: $num$
armorAcBonus: $num$
armorAcMod: $num$
attackStat: $string$
attackRollMod: $num$
speed: $num$
speedMod: $num$
speedSublabel: $string$
```
````

### DnD Ability Scores:

An Ability Scores widget that displays Scores, Modifiers, Saving Throw Proficiencies, and supports Homebrew Abilities with the `extras` variable.

A Sample of the Code Block looks like this:
````markdown
```dnd-abilities
strength: $num$
dexterity: $num$
constitution: $num$
intelligence: $num$
wisdom: $num$
charisma: $num$
proficiencies: $array$
extras: $array$ //optional
```
````
The `extras` variables allows you to add your own homebrew abilities right besides the standard DnD ones and follows this structure:
[ [ "<"Ability-Name">", "<"Ability-Abbreviation">", "<"Ability-Score">", "<"Saving-Throw-Modifier">"], [<"second Ability">], [<"third Ability">] ]

### DnD Skills:

A Simple widget that displays your character's skills, proficienies, half-proficiencies and experties on those skills, with support for bonuses on certain items.

A Sample of the Code Block looks like this:
````markdown
```dnd-skills
proficiencies: $array$
expertise: $array$
half_proficiencies: $array$
bonuses: $array$
```
````
The `proficiencies` variable array structure looks like this: `[ ["<Skill>", "<class/background/extra>"] ]`, to distinguish to the rest of the plugin the origins of that proficiency. The `bonuses` variable holds bonuses that items may grant and the structure is as follows: `[["<Item-Name>","<Skill>>","<Value-to-Add>"]]`

### DnD Controls:

This is an array of buttons that control various parts of the character sheet, mainly changing frontmatter (file properties) values that then correspond to changes in the character sheet. The buttons are: Level Up, Equip Items, Inventory, Manage Character, and Spellbook (which will only appear if the `DnD_spellcastingAbility` frontmatter variable is populated).

A Sample of the Code Block looks like this:
````markdown
```dnd-controls
align: right/center/right-up/right-down // <optional>
```
````


### DnD Character Features:

Given the appropriate variables and values this plugin can give you useful information of your character directly inside your Obsidian Note. It displays all the Action related Features from your Class (with Multi-class support), Subclass, Race Traits, Background Feat and Extra Feats added at your own disposal.

A Sample of the Code Block looks like this:
````markdown
```dnd-features
level: $num$
class: $array$
classLevels: $array$
subclass: $array$
classChoices: $array$
race: $string$
raceLineage: $string$
background: $array$
extraFeats: $array$
featureUses: $array$
hide: $array$
```
````
Any of the variables (except for `level`) can be omitted and only the variables with a value will be used and displayed. Sections with no features to display (such as `subclass` before your class unlocks one) will automatically hide themselves.

The variable `classLevels` is used when you have multiple classes on your character and the plugin needs to know how many levels each class has. *The order of the levels should be the same as the class order*.

The variable `classChoices` stores class-specific feature selections (such as Warlock Eldritch Invocations, Fighter Fighting Styles, or Sorcerer Metamagic) using the structure: `[ ["<Choice-Filename>", "<Level-Gained>"], ... ]`.

Write down a Feature's name as it appears on the screen inside the variable `hide` (or manage it via the **Manage Character** button) to hide it from view.

The variable `featureUses` savesthe state of the checkboxes on each Class or Subclass Feature, Race Trait and Feat of the character wit this structure: `[ [ "<Feature's-Name>", "<Available-Uses>", "<Expended-Uses>"], ... ]`

> [!TIP]
> Sometimes a class feature may have you select one of many options permenantly. Those specific features have duplicates with each one being one of the options you might choose. You can use the *hide* variable to hide the options you did not choose.

### DnD Spells:

A Widget that uses a certain array strcuture to display DnD spells on your Obsidian Note. 

A Sample of the Code Block looks like this:
````markdown
```dnd-spells
spellcastingAbility: $string$
spells: $array$
preparedSpells: $array$
spellSlots: $array$
```
````
The *spells* and *preparedSpells* variabel has this certain structure: `[ [["<Cantrip-1>", "<Cantrip-2>"],"0"], [["<Level-1-Spell>", "<Level-2-Spell>"],"1"] ]`, while *spellSlots* follows this strcuture: `[ ["<Max-Slots>", "<Used-Slots>"], ... ]`

### DnD Character Inventory:

An easy way to manage your character's inventory including. There is a section for managing your Gold, a section for Weapon / Armor, a section for starter items and a section for extra items added in later on.

A Sample of the Code Block looks like this:
````markdown
```dnd-inventory
weapon: $string$
weaponDamage: $string$
armor: $string$
armorAc: $string$
class: $string$
classEquipment: $string$
classChosenItems: $array$ <optional>
background: $string$
backgroundEquipment: $string$
backgroundChosenItems: $array$ <optional>
starterEquipment: $array$
inventoryItems: $array$
customItems: $array$
wealthAdded:
wealthSpent:
```
````
Weapons and Amor related varibales are optional and when not set that section will not be made visible.

The Gold section is always visible and will have as base rate the gold provided by the class + background. There after, you can use the `Add` and `Spend` buttons that will change the Gold amount displayed. When using the aforementioned buttons the ammount added/spent will be as  properties inside your character's note that then will be used to calculate the Total Gold you currently have.

The Backpack section is also always visible and wil be automatically populated with the items given to your character from their class and background. If given the choice between items from your class or background you will have to use the *class-chosen-items* and *background-chosen-items*. You can get more information on each item by hovering your cursor over it.

*starterEquipment*/*inventoryItems* structure: `[ ["<item-filename>", "<quantity>", "<show: true/false>"], ... ]`
*customItems* structure: `[ ["<Name>", "<quantity>", "<show: true/false>", "<weight>", "<cost>", "<type>", "<description>"], ... ]`
*customItems* `<cost>` is written with its currency, e.g. `"50 GP"`, `"5 SP"`, `"2 PP"` or `"5 CP"` (a bare number is treated as GP).

> [!TIP]
> The aforementioned variables are used to select an Artisan's Tool, a Musical Instrument, or a Gaming Set depeding on what's provided by the class or background. For more information on your choices always look through the actual DnD Player's Handbook.

### Rules Block:

A way to add Custom Rules to your Character Sheet.

A Sample of the Code Block looks like this:
````markdown
```dnd-rules
rules: $array$
```
````
#### Critical Role:
I have also added Critcal Role's Campaign 4 *Desperate Measures* mechanic. I just thought it was an interesting mechanic and I've used it in my campaigns ever since I found out about it. To use it you just add `Desperate Measures` into the Rules Block

### Extra Features:

 - Code Blocks have frontmatter support by using the key-word "frontmatter." + a note property's name.

#### Settings Menu:

 - Class & Subclass combination toggle

 - Custom Rulebook folder path inside your Obsidian Vault for Homebrewed DnD.
 > There's also a toggle to have the Custom Rulebook be prioritied

 - Theme Engine
 > Not anything special, just some basic custom color pallete pane for you to change any color to your liking.

## Homebrew:

This plugin also supports custom rules by adding the path of your custom Rulebook that is inside your Obsidian Vault. This is the folder structure used and what the plugin expects:

```
rulebook/
├── classes/
│   └── <add your custom classes & subclasses>
├────── classChoices/
│       └── <add your custom class choices>
├── feats/
│   └── <add your custom feats>
├── items/
│   └── <add your custom items>
├── markdown/
│   └── <add your custom markdown>
├── races/
│   └── <add your custom races>
├── rules/
│   └── <add your custom rules>
├── spells/
│   └── <add your custom spells>
├── backgrounds.json
├── classes.json
├── epic-boon-feats.json
├── general-feats.json
├── items.json
├── races.json
└── rules.json
```

The backgrounds.json, classes.json and races.json work as router files to the specific feat, class, or race JSON is needed for better modularity.

> [!TIP]
> All text fields support the markdown format with some custom spacing so that information can more easily fit inside the UI. Use `\n` for line-break and `\t` for tabs as normal.

The structure of each JSON file is as follows:
- classes/races/items/rules.json:
```json
{
	"<Class/Race/Item/Rule/Feat/Spell_Filename>": "<Class/Race/Item/Rule/Feat/Spell_Display_Name>"
}
```

- backgrounds.json:
```json
{
      "<Background>": {
            "feat": "<Feat_Given>",
            "abilityBonusPool": ["<List_of_Abilities>"],
            "skills": ["<List_of_Skills>"],
            "startingEquipment": {
                  "A": {
                        "items": {
                              "<item>": 0,
                              "<type+|>": 0
                        }, "gold": 0
                  },
                  "B": { "items": {}, "gold": 0 }
            }
      }
}
```

- spells-list.json:
```json
{
  "<Spell-Slot-Level>": {
    "<Filename>": "<Spell-Name>",
  }
}
```
Cantrips are on "Level 0" and the rest of the Spell Levels are as normal.

- class.json:
```json
{
      "class": "<Class_Name>",
      "hitDice": "<Hit_Dice>",
      "savingThroughProf": ["<List_of_Abilities>"],
      "proficiencyBonus": ["<Level_1_Bonus>", "..."], // <optional>
      "scalingDice": ["<Level_1_Die>", "..."], // <optional>
      "skillsPool": [["<List_of_Skills>"], <Number_of_Skills_that_can_be_chosen> ],
      "startingEquipment": {
            "A": {
                  "items": {
                  "<Item-File-Name>": 0,
                  "<Item-File-Name>": 0,
                  "musical-instrument|": 0, // <optional_DnD_item_type>
                  "artisans-tool|musical-instrument": 0, // <optional_DnD_multiple_items_w/_type>
                  "<item_type|>" : 0 // <optional_homebrew_item_type>
                  }, "gold": 0
            },
            "B": { "items": {}, "gold": 0 }
      },
      "spellcastingAbilities": [ "<Spellcasting-Ability>" ], // <optional>
      "spellsPool": "<Spells-List-Filename>", // <optional>
      "spellcasting": {
            "<Level>": { "cantrips": <num>, "preparedSpells": <num>, "slots": [0, 0, 0, 0, 0, 0, 0, 0, 0] }
      }, // <optional>
      "features": {
            "<Level>": [
                  {
                        "name": "<Feature_Name>",
                        "description": "<Feature_Description>",
                        "badge": "<Custom_Badge_Text_Inplace_of_Level>", // <optional>
                        "classChoices": ["<Choice-Router-Filename>"], // <optional>
                        "grantedExpertise": [["<Skills-Pool>"], <num>], // <optional>
                        "grantedSubclasses": "<Subclasses-Filename>", // <optional>
                        "grantedFeats": ["<ability-score-improvement>", "<Feat_Name>", "<Feat_Router_Filename>"], // <optional>
                        "uses": ["<Number-of-Uses>", "<short/long>" ], // <optional>
                        "speedMod": <num>, // <optional>
                        "hide": true // <optional>
                  }
            ]
      }
}
```
Sometimes DnD classes or backgrounds offer a choice of an item category (like any Musical Instrument or Artisan's Tool) rather than a specific item. To handle this you can use items' Type instead of a single item's filename

By adding a pipe character (|) to an item key in your class.json or backgrounds.json (e.g: "musical-instrument|": 1 or "artisans-tool|musical-instrument": 1), you tell the plugin to wait for the player's choice. The plugin will automatically scan the player's `class-chosen-items` or `background-chosen-items` variables in their note, find an item whose "type" matches the requirement, and seamlessly add it to their inventory.

The `grantedSubclases` variable grants the player the Sublcasses that are included in the json file entered and are given to the player on the level it is placed at.

The `grantedFeats` variable gives the player feat choices or automatic feats when that level is reached. The array can contain:
- Specific feat filenames (e.g. `"actor"`, `"alert"`): directly grants the feat if only one is listed, or offers a choice between them.
- Router filenames (e.g. `"general-feats"`, `"epic-boon-feats"`): provides a secondary dropdown allowing the player to pick any feat within that category.
- `"ability-score-improvement"`: triggers the standard Ability Score Improvement milestone (+2 to one stat or +1 to two stats) in the Level Up modal.

The `uses` variable sets how many uses this feature has, and when used checkboxes will appear at the top right of that feature's line acording to the value it was set. For the amount of uses it accepts single numbers and in string it accepts math (+, -,, *, /) and will also automatically imput the value of a core DnD ability.

The `scalingDice` array stores level-scaling dice for a class (such as a Monk's Martial Arts die) and is used when the **Unarmed Strike** weapon is equipped.

To give a class a custom **Unarmored Defense** AC calculation, include a hidden feature named `"Unarmored Defense"` (`"hide": true`) at the level it is unlocked with its `"description"` set to the AC formula (for example, `"10+dexterity+wisdom"` for Monk or `"10+dexterity+constitution"` for Barbarian).

The `speedMod` variable on a class/subclass feature or feat sets `DnD_speedMod` when that level or feat is gained, adding to the character's base `speed` in `dnd-info` (`mode: combat`).

- $class-subclasses.json:
```json
{
      "<Subclass_Name>": {
            "<Level>": [
                  {
                        "name": "<Feature_Name>",
                        "description": "<Feature_Description>"
                  }
            ]
      }
}
```

- feat.json:
```json
{
	"name": "<Feat_Name>",
	"description": "<Feat_Description>",
      "uses": ["<Number-of-Uses>", "<short/long>" ], // <optional>
      "speedMod": <num>, // <optional>
      "improveAbility": [ [ "<Ability-to-Improve>", <value>, <maxCap> ], ... ], // <optional>
      "proficiencySavingThrow": "<improvedAbility | Ability-Name | Array>", // <optional>
      "grantedExpertise": [ [ "<skill_pool>" ], <count> ] // <optional>
}
```

The `improveAbility` array defines ability score increases granted by this feat. It accepts 3-element tuples `[ [ "<Ability-to-Improve>", <value>, <maxCap> ], ... ]`:
- `<Ability-to-Improve>`: lowercase ability name (e.g. `"strength"`), multiple choice joined with `|` (e.g. `"strength|dexterity"` or `"intelligence|wisdom|charisma"`), or `"any"`.
- `<value>`: integer bonus to add (typically `1`).
- `<maxCap>`: maximum score cap for the ability (typically `20` for General Feats or `30` for Epic Boons).

The `proficiencySavingThrow` property grants saving throw proficiency. It accepts `"improvedAbility"` (automatically grants proficiency in whichever ability was chosen in `improveAbility`, disabling abilities the character is already proficient in during Level Up), an explicit ability string (e.g. `"constitution"`), or an array of mixed entries (e.g. `["improvedAbility", "wisdom"]`).

The `grantedExpertise` property grants expertise in skill proficiencies. It accepts a 2-element tuple `[ [ "<skill_pool>" ], <count> ]` (e.g. `[[], 1]` allows choosing 1 skill from any currently known skill proficiency lacking expertise).

The `uses` variable sets how many uses this feature has, and when used checkboxes will appear at the top right of that feature's line acording to the value it was set. For the amount of uses it accepts single numbers and in string it accepts math (+, -,, *, /) and will also automatically imput the value of a core DnD ability.

- race.json:
```json
{
      "traits": [
            {
                  "name": "<Trait_Name>",
                  "description": "<Trait_Description>",
                  "lineage": "Lineage_Name", // <optional>
                  "uses": ["<Number-of-Uses>", "<short/long>" ] // <optional>
            }
      ]
}
```
The `lineage` variable in the race.json is a Flag, making it so that this trait will appear if that and the *race-lineage* variable in the code block have the same value, while also swapping out the "Trait" badge for a "Lineage" badge.

The `uses` variable sets how many uses this feature has, and when used checkboxes will appear at the top right of that feature's line acording to the value it was set. For the amount of uses it accepts single numbers and in string it accepts math (+, -,, *, /) and will also automatically imput the value of a core DnD ability.

- item.json:
```json
{
      "name": "<Item's_name>",
      "type": "<weapon/armor/gear/artisans-tool/musical-instrument/gaming-set>",
      "description": "<Item's_Description>",
      "weight": 0,
      "damage": "<Damage_Dice+Damage_Type>", // <optional>
      "ac": "<Armor's_Base_AC>", // <optional>
      "category": "<Light/Medium/Heavy>",
      "cost": "<Amount> <PP/GP/SP/CP>" // e.g. "50 GP", "5 SP", "5 CP"
}
```

- spell.json:
```json
{
      "name": "<Name>",      
      "level": <1/2/3>,
      "school": "<Abjuration/Transmutation>",
      "castingTime": "<Action/Bonus Action>",
      "range": "<X feet/Self>",
      "components": ["V", "S", "M"],
      "materials": "<Material Description>",
      "duration": "<Instantaneous/1 hour>",
      "concentration": false,
      "ritual": false,
      "classes": "<Classes-that-can-Cast>",
      "description": "<Description>"
}
```

- rule.json:
```json
{
    "name": "Desperate Measures",
    "rules": [
            {
                "name": "<Rule_Section_Name>",
                "description": "<Rule_Section_Description>",
                "badge": "<Custom_Badge_Text>" // <optional>
            }
    ]
}
```

### Markdown:

If you place some special markdown files inside the markdown folder, you can embed them right into the code block's text with this file link: `[<Anchor-Text>](note:<Markdown-Filname>)`

## Acknowledgements:

This plugin was made because of my want to have a comfortable Character Sheet in Obsidian without hassle. I first stumbled upon [hay-kot's Obsidian DnD UI Toolkit](https://github.com/hay-kot/obsidian-dnd-ui-toolkit) and was the inspiration for the color pallete and the reason I started this project, because if it wasn't for his plugin and making it possible to have some of the crucial DnD Character Sheet elements inside an Obsidian Note, I would have never gone through the trouble of making my own plugin to expand upon it.
