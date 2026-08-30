The DnD Character Sheet Helper is an Obsidian Plugin that brings the DnD Rulebook right inside your Digital Character Sheet.

> - Code Blocks have frontmatter support by using the key-word "frontmatter." + a note property's name.
> - All text fields support the markdown format as well.

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
The variable *variable-class-items* as well as *musical-instrument* and *gaming-set* is explained below.
The rest of the variables should be self-explanatory.

## DnD Character Inventory:

a

A Sample of the Code Block looks like this:
````
```dnd-inventory
class: $text$
class-equipment: $text$
<optional>musical-instrument: $text$
<optional>gaming-set: $text$
<optional>variable-class-items: $list$
background: $text$
background-equipment: $text$
<optional>weapon: $text$
<optional>weapon_damage: $text$
<optional>armour: $text$
<optional>armour_ac: $text$
extra-items: $list$
```
````

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
- backgrounds/classes/races/items.json:
```
{
	"<Background/Class/Race/Item_Name>": "<Feat/Class/Race/Item_File_Name>"
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
                "<Item_File_Name>>": <Number>,
                <optional_DnD_musical-instrument>"musical-instrument": <Number>,
                <optional_DnD_gaming-set>"gaming-set": <Number>,
		    <optional_homebrew_variable_item>"<Umbrella_Item>" : <Number>
            }, "gold": <Number>
        },
        "B": { "items": {}, "gold": <Number> }
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
Some classes in DnD give you an item that has variants (like the Gaming Set), and so that the player is able to choose which variant they want to be displayed they can either use the pre-made varibales *musical-instrument* and *gaming-set*, or for Homebrewd items they can use the *variable-class-items* variable with this structure:
[ [<homebrew_item_1>, <variant>], [<homebrew_item_2>, <variant>] ]
For the items in the *variable-class-items* variable to appear in the inventory the "homebrew_item" portion of the the name should be inside the class itself as an item.
The plugin automaticaly searches for items named: "homebrew_item-variant", striping off quotes and spaces from the code block variable so that the text can more easily match the filename.

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
      "type": "<Weapon/Armor/Gear>",
      "description": "<Item's_Description>",
      "weight": <Item's_Weight>,
      <optional>"damage": "<Damage_Dice+Damage_Type>",
	<optional>"ac": "<Armor's_Base_AC>",
      "cost": <Item's_Cost>
}
```