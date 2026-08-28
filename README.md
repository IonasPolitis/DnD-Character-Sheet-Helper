The DnD Character Sheet Helper is an Obsidian Plugin that brings the DnD Rulebook right inside your Digital Character Sheet.

Currently this plugin only shows information for a characters Features, Feats and Traits, but in the future I plan on adding something to help with inventory management as well, especially automatically adding items that you gain from the rulebook.

Given the appropriate variables and values it can give you information useful information of your character directly inside your Obsidian Note from your Class (with Multi-class support), Subclass, Race Traits, Background Feat and Extra Feats added at your own disposal. It has frontmatter support by using the key-word "frontmatter." + a note property's name.

A Sample of the Code Block looks like this:

````
```dnd-features
level: $num$
class: $list$
class-levels: $list$
subclass: $list$
race: $text$
background: $list$
extra-feats: $list$
```
````

Any of the variables (except for *level*) can be omitted and only the variables with a value will be used and displayed.

The variable *class-levels* is used when you have multiple classes on your character and the plugin needs to know how many levels does each class have. *The order of the levels should be the same as the class order*. The rest of the variables should be self-explanatory.

This plugin also supports custom rules by adding the path of your custom Rulebook inside your Obsidian Vault. This is the folder structure used and what the plugin expects:

```
rulebook/
├── classes/
│   └── <add your custom classes & subclasses>
├── feats/
│   └── <add your custom feats>
├── races/
│   └── <add your custom races>
├── backgrounds.json
├── classes.json
└── races.json
```

The backgrounds.json, classes.json and races.json work as router files to the specific feat class, or race JSON is needed for better modularity.

The structure of each JSON file is as follows:
- backgrounds/class/race.json:
```
{
	"<Background/Class/Race_Name>": "<Feat/Class/Race_File_Name>"
}
```

- class.json:
```
{
	"class": "<Class_Name>",
	"subclassFile": "<Subclass_File_Name>",
	"features": {
		"<Level_of_Features_Set>": [
			{
				"name": "<Feature_Title>",
				"description": "<Feature_Description>",
				<optional>"grantedFeats": "<Feat_to_Unlocks>",
				<optional>"badge": "<Custome_Badge_Text>"
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
			"description": "<Trait_Description>"
		}
	]
}
```

All text fields support the markdown format as well.