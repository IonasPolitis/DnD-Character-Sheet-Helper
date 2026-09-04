# DnD Character Sheet Helper

> [!NOTE]
> The DnD Character Sheet Helper is an Obsidian Plugin that brings the DnD Rulebook 5.5e (2024) right inside your Digital Character Sheet. This is not a replacement for the DnD Player's Handbook, but just a handyy tool that gives you only the information you might need, or you wouldn't remeber on top of your mind, while playing.
(If text has anything written wrong please make an Issue Report on GitHub. I maintaine it myself)

## DnD Character Features:

Given the appropriate variables and values this plugin can give you useful information of your character directly inside your Obsidian Note. It displays all the Action related Features from your Class (with Multi-class support), Subclass, Race Traits, Background Feat and Extra Feats added at your own disposal.

A Sample of the Code Block looks like this:
````markdown
```dnd-features
level: $num$
class: $list$
class-levels: $list$
subclass: $list$
race: $text$
race-lineage: $text$
background: $list$
extra-feats: $list$
hide: $list$
```
````
Any of the variables (except for *level*) can be omitted and only the variables with a value will be used and displayed.

The variable *class-levels* is used when you have multiple classes on your character and the plugin needs to know how many levels does each class have. *The order of the levels should be the same as the class order*.

Write down a Feature's name as in on the screen inside the variable *hide* to hide it from view.

The rest of the variables should be self-explanatory.

> [!TIP]
> Sometimes a class feature may have you select one of many options permenantly. Those specific features have duplicates with each one being one of the options you might choose. You can use the *hide* variable to hide the options you did not choose.

## DnD Character Inventory:

An easy way to manage your character's inventory including. There is a section for managing your Gold, a section for Weapon / Armor, a section for starter items and a section for extra items added in later on.

A Sample of the Code Block looks like this:
````markdown
```dnd-inventory
weapon: $text$
weapon_damage: $text$
armor: $text$
armor_ac: $text$
class: $text$
class-equipment: $text$
class-chosen-items: $list$ <optional>
background: $text$
background-equipment: $text$
background-chosen-items: $list$ <optional>
extra-items: $list$
```
````
Weapons and Amor related varibales are optional and when not set that section will not be made visible.

The Gold section is always visible and will have as base rate the gold provided by the class + background. There after, you can use the `Add` and `Spend` buttons that will change the Gold amount displayed. When using the aforementioned buttons the ammount added/spent will be as  properties inside your character's note that then will be used to calculate the Total Gold you currently have.

The Backpack section is also always visible and wil be automatically populated with the items given to your character from their class and background. If given the choice between items from your class or background you will have to use the *class-chosen-items* and *background-chosen-items*. You can get more information on each item by hovering your cursor over it.

> [!TIP]
> The aforementioned variables are used to select an Artisan's Tool, a Musical Instrument, or a Gaming Set depeding on what's provided by the class or background. For more information on your choices always look through the actual DnD Player's Handbook.

## Rules Block:

A way to add Custom Rules to your Character Sheet.

A Sample of the Code Block looks like this:
````markdown
```dnd-inventory
rules: $list$
```
````
#### Critical Role:
I have also added Critcal Role's Campaign 4 Desperate Measures mechanic as a *"class"*. ItJust thought it was an interesting mechanic and I've used it in my campaigns ever since I found out about it.

## Extra Features:

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
├── feats/
│   └── <add your custom feats>
├── items/
│   └── <add your custom items>
├── races/
│   └── <add your custom races>
├── rules/
│   └── <add your custom rules>
├── backgrounds.json
├── classes.json
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
	"<Class/Race/Item/Rule_Name>": "<Class/Race/Item/Rule_File_Name>"
}
```

- backgrounds.json:
```json
{
      "<Background>": {
            "feat": "<Feat_Given>",
            "starting-equipment": {
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

- class.json:
```json
{
    "class": "<Class_Name>",
    "subclassFile": "<Subclass_File_Name>",
    "starting-equipment": {
        "A": {
            "items": {
                "<Item_File_Name>": 0,
                "<Item_File_Name>": 0,
                "musical-instrument|": 0, // <optional_DnD_item_type>
                "artisans-tool|musical-instrument": 0, // <optional_DnD_multiple_items_w/_type>
		    "<item_type|>" : 0 // <optional_homebrew_item_type>
            }, "gold": 0
        },
        "B": { "items": {}, "gold": 0 }
    },
    "features": {
        "<Level>": [
            {
                "name": "<Feature_Name>",
                "description": "<Feature_Description>",
                "badge": "<Custom_Badge_Text_Inplace_of_Level>", // <optional>
                "grantedFeats": "<Feat_Name>"
            }
        ]
      }
}
```
Sometimes DnD classes or backgrounds offer a choice of an item category (like any Musical Instrument or Artisan's Tool) rather than a specific item. To handle this you can use items' Type instead of a single item's filename

By adding a pipe character (|) to an item key in your class.json or backgrounds.json (e.g: "musical-instrument|": 1 or "artisans-tool|musical-instrument": 1), you tell the plugin to wait for the player's choice. The plugin will automatically scan the player's *class-chosen-items* or *background-chosen-items* variables in their note, find an item whose "type" matches the requirement, and seamlessly add it to their inventory.

The *granted-feat* variables automatically grants the player a certain feat when that level is reached and can be viewd in the "Extra Feats" section.

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
	"description": "<Feat_Description>"
}
```

- race.json:
```json
{
      "traits": [
            {
                  "name": "<Trait_Name>",
                  "description": "<Trait_Description>",
                  "lineage": "Lineage_Name" // <optional>
            }
      ]
}
```
The *lineage* variable in the race.json is a Flag, making it so that this trait will appear if that and the *race-lineage* variable in the code block have the same value, while also swapping out the "Trait" badge for a "Lineage" badge.

- item.json:
```json
{
      "name": "<Item's_name>",
      "type": "<weapon/armor/gear/artisans-tool/musical-instrument/gaming-set>",
      "description": "<Item's_Description>",
      "weight": 0,
      "damage": "<Damage_Dice+Damage_Type>", // <optional>
      "ac": "<Armor's_Base_AC>", // <optional>
      "cost": 0
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

## Acknowledgements:

This plugin was made because of my want to have a comfortable Character Sheet in Obsidian without hassle. I first stumbled upon [hay-kot's Obsidian DnD UI Toolkit](https://github.com/hay-kot/obsidian-dnd-ui-toolkit) and was the inspiration for the color pallete and the reason I started this project, because if it wasn't for his plugin and making it possible to have some of the crutial DnD Character Sheet elements inside an Obsidian Note, I would have never gone through the trouble of making my own plugin to add to it.

I currently use both plugins for my character sheets and have made a Template uploaded in this repo: https://github.com/IonasPolitis/Ionas-Obsidian-DnD-Character-Sheet-Template
