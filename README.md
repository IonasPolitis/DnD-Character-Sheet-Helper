The DnD Character Sheet Helper is an Obsidian Plugin that brings the DnD Rulebook right inside your Digital Character Sheet.

> Code Blocks have frontmatter support by using the key-word "frontmatter." + a note property's name.
> All text fields support the markdown format as well.

## DnD Character Features:

Given the appropriate variables and values this plugin can give you useful information of your character directly inside your Obsidian Note. It displays all the Action related Features from your Class (with Multi-class support), Subclass, Race Traits, Background Feat and Extra Feats added at your own disposal.

A Sample of the Code Block looks like this:
````
```dnd-features
level: $num$
class: $list$
class-levels: $list$
subclass: $list$
race: $text$
race-lineage: $text$
background: $list$
extra-feats: $list$
```
````
Any of the variables (except for *level*) can be omitted and only the variables with a value will be used and displayed.
The variable *class-levels* is used when you have multiple classes on your character and the plugin needs to know how many levels does each class have. *The order of the levels should be the same as the class order*.
The rest of the variables should be self-explanatory.

## DnD Character Inventory:

An easy way to manage your character's inventory including. There is a section for managing your Gold, a section for Weapon / Armor, a section for starter items and a section for extra items added in later on.

A Sample of the Code Block looks like this:
````
```dnd-inventory
<optional>weapon: $text$
<optional>weapon_damage: $text$
<optional>armor: $text$
<optional>armor_ac: $text$
class: $text$
class-equipment: $text$
<optional>class-chosen-items: $list$
background: $text$
background-equipment: $text$
<optional>background-chosen-items: $list$
extra-items: $list$
```
````
The variable *class-chosen-items* is used to select an Artisan's Tool, a Musical Instrument, or a Gaming Set depeding on what's provided by the class. Same goes for the *background-chosen-items*.

## Settinsg Menu:

 - Class & Subclass combination toggle

 - Custom Rulebook folder path inside your Obsidian Vault for Homebrewed DnD.
 > > There's also a toggle to have the Custom Rulebook be prioritied

 - Theme Engine
 > > Not anything special, just some basic custom color pallete pane for you to change any color to your liking.

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
├── backgrounds.json
├── classes.json
├── ietms.json
└── races.json
```

The backgrounds.json, classes.json and races.json work as router files to the specific feat, class, or race JSON is needed for better modularity.

The structure of each JSON file is as follows:
- classes/races/items.json:
```
{
	"<Background/Class/Race/Item_Name>": "<Feat/Class/Race/Item_File_Name>"
}
```

- backgrounds.json:
```
{
      "<Background>": {
            "feat": "<Feat_Given>",
            "starting-equipment": {
                  "A": {
                        "items": {
                              "<item>": <Quantity>,
                              "<type+|>": <Quantity>
                        }, "gold": <Quantity>
                  },
                  "B": { "items": {}, "gold": <Quantity> }
            }
      }
}
```

- class.json:
```
{
    "class": "<Class_Name>>",
    "subclassFile": "<Subclass_File_Name>",
    "starting-equipment": {
        "A": {
            "items": {
                "<Item_File_Name>>": <Quantity>,
                <optional_DnD_item_type>"musical-instrument|": <Quantity>,
                <optional_DnD_multiple_items_w/_type>"artisans-tool|musical-instrument": <Quantity>,
		    <optional_homebrew_variable_item_type>"<varaint_item_that_has_that_type>" : <Quantity>
            }, "gold": <Quantity>
        },
        "B": { "items": {}, "gold": <Quantity> }
    },
    "features": {
        "<Level>": [
            {
                "name": "<Feature_Name>",
                "description": "<Feature_Description>"
            }
        ]
      }
}
```
Some classes in DnD give you an item that has variants (like the Gaming Set), and so that the player is able to choose which variant they want to be displayed they can either use the *class-chosen-items* variable that accepts the items that have the item type mentioned in the class.json.

For the items in the *class-chosen-items* variable to appear in the inventory the "homebrew_item" should have the type that is mentioed in the class. When using an item Type you should add the "|" character at the end to activate this functionality, and you can also use it as a divider to there after add second type that may be accepted.

- $class-subclass.json:
```
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
```
{
	"name": "<Feat_Name>",
	"description": "<Feat_Description>"
}
```

- race.json:
```
{
      "traits": [
            {
                  "name": "<Trait_Name>",
                  "description": "<Trait_Description>",
                  <optional>"lineage": "Lineage_Name"
            }
      ]
}
```
The *lineage* variable in the race.json is a Flag, making it so that this trait will appear if that and the *race-lineage* variable in the code block have the same value, while also swapping out the "Trait" badge for a "Lineage" badge.

- item.json:
```
{
      "name": "<Item's_name>",
      "type": "<weapon/armor/gear/artisans-tool/musical-instrument/gaming-set>",
      "description": "<Item's_Description>",
      "weight": <Item's_Weight>,
      <optional>"damage": "<Damage_Dice+Damage_Type>",
      <optional>"ac": "<Armor's_Base_AC>",
      "cost": <Item's_Cost>
}
```