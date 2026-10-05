---
level: 
proficiency_bonus:
DnD_race:
DnD_race_lineage: 
DnD_class: 
DnD_classLevels
DnD_Subclass:
DnD_classEquipment: 
DnD_classChosenItems:
DnD_languages:
DnD_background: 
DnD_backgroundFeat: 
DnD_backgroundEquipment: 
DnD_backgroundChosenItems:
DnD_extra_feats:
DnD_spellcastingAbility:
DnD_maxHealth:
DnD_attack:
DnD_speed:
DnD_strength:
DnD_dexterity:
DnD_constitution:
DnD_intelligence:
DnD_wisdom:
DnD_charisma:
DnD_hide_feature:
DnD_weapon:
DnD_weaponDamage:
DnD_armor:
DnD_armorAc:
dnd_gold_added:
dnd_gold_spent:
cssclasses:
  - character-sheet
obsidianUIMode: preview
---

## Board
```healthpoints
state_key: din_health
health: '{{ frontmatter.DnD_maxHealth }}'
hitdice:
  dice: <class_hit_dice>
  value: '{{ frontmatter.level }}'
death_saves: true
```
```event-btns
items:
  - name: Short Rest
    value: short-rest
  - name: Long Rest
    value: long-rest
```
<font size=5>Info:</font>
```stats
items:
- label: Race
  value: '{{ frontmatter.DnD_race }}'
  sublabel: '{{ frontmatter.DnD_race_lineage }}'
- label: Class
  value: '{{ frontmatter.DnD_class }}'
  sublabel: '{{ frontmatter.DnD_class_subclass }}'
- label: Background
  value: '{{ frontmatter.DnD_background }}'
  sublabel:
- label: Level
  value: '{{ frontmatter.level }}'
  sublabel: "+{{ frontmatter.proficiency_bonus }} Proficency"

grid:
  columns: 4
```
```badges
items:
- label: Languages
  value: '{{ frontmatter.DnD_languages }}'
```

<font size=5>Stats:</font>
```ability
abilities:
  strength: '{{ frontmatter.DnD_strength }}'
  dexterity: '{{ frontmatter.DnD_dexterity }}'
  constitution: '{{ frontmatter.DnD_constitution }}'
  intelligence: '{{ frontmatter.DnD_intelligence }}'
  wisdom: '{{ frontmatter.DnD_wisdom }}'
  charisma: '{{ frontmatter.DnD_charisma }}'

proficiencies:
- <chosen ability>
```
---
```stats
items:
  - label: Armor Class
    sublabel: <sublabel>
    value: <same_as_armour_value>
  - label: Initiative
    sublabel: Dexterity Modified
    value: '+{{ modifier abilities.dexterity }}'
  - label: Attack Roll
    sublabel: Strength/Dexterity Modified
    value: '+{{ add (modifier abilities.strength) 2 }}'
  - label: Speed
    sublabel: <sublabel>
    value: "{{ frontmatter.DnD_speed }} feet"
grid:
  columns: 4
```
 ---
```skills
proficiencies:
  #Class
  - <chosen ability>
  #Background
  - <chosen ability>

expertise:
  - <chosen ability>

half_proficiencies:
  - <chosen ability>

bonuses:
  - name: <Item Name>
    target: <chosen ability>
    value: <+value>
```

```dnd-inventory
class: frontmatter.DnD_class
classEquipment: frontmatter.DnD_classEquipment
classChosenItems: frontmatter.DnD_classChosenItems
background: frontmatter.DnD_background
backgroundEquipment: frontmatter.DnD_backgroundEquipment
backgroundChosenItems: frontmatter.DnD_backgroundChosenItems
weapon: frontmatter.DnD_weapon
weaponDamage: frontmatter.DnD_weaponDamage
armor: frontmatter.DnD_armor
armorAc: frontmatter.DnD_armorAc
extraItems: frontmatter.DnD_extraItems
```
<font size=5>**Consumables:**</font>
```consumable
items:
  - label: "Consumable Name"
    state_key: din_consumable
    uses: 1
    reset_on: long-rest
```

```dnd-features
level: frontmatter.level
class: frontmatter.DnD_class
classLevels: frontmatter.DnD_classLevels
subclass: frontmatter.DnD_Subclass
race: frontmatter.DnD_race
raceLineage: frontmatter.DnD_raceLineage
background: frontmatter.DnD_background
extraFeats: frontmatter.DnD_extraFeats
hide: frontmatter.DnD_hideFeature
```

<font size=5>**Abilities:**</font>
```badges
items:
- label: <Ability_Name>
```
```spell-components
casting_time: 1 action
range: 60 feet
components: <Dice Damage>
duration: Instantaneous
```


## Appearance:


## Backstory:


## Stat History:

| A/S | Base | Bonus | Lvl 4 | Lvl 8 | Lvl 12 | Lvl 16 | Lvl 19 |
| --- | :--: | :---: | :---: | :---: | :----: | :----: | :----: |
| STR |  -   | --->  | --->  | --->  |  --->  |  --->  |  --->  |
| DEX |  -   | --->  | --->  | --->  |  --->  |  --->  |  --->  |
| CON |  -   | --->  | --->  | --->  |  --->  |  --->  |  --->  |
| INT |  -   | --->  | --->  | --->  |  --->  |  --->  |  --->  |
| WIS |  -   | --->  | --->  | --->  |  --->  |  --->  |  --->  |
| CHA |  -   | --->  | --->  | --->  |  --->  |  --->  |  --->  |