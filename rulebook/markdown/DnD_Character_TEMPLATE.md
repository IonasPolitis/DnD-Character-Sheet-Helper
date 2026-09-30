---
level:
proficiency_bonus:
DnD_race:
DnD_race_lineage:
DnD_class:
DnD_class_subclass:
DnD_class-chosen-items:
DnD_languages:
DnD_background:
DnD_background_feat:
DnD_background-chosen-items:
DnD_extra_feats:
spellcasting_ability:
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
DnD_class-equipment:
DnD_background-equipment:
DnD_weapon:
DnD_weapon_damage:
DnD_armor:
DnD_armor_ac:
dnd_gold_added:
dnd_gold_spent:
cssclasses: character-sheet
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
class-equipment: frontmatter.DnD_class-equipment
class-chosen-items: frontmatter.DnD_class-chosen-items
background: frontmatter.DnD_background
background-equipment: frontmatter.DnD_background-equipment
background-chosen-items: frontmatter.DnD_background-chosen-items
weapon: frontmatter.DnD_weapon
weapon_damage: frontmatter.DnD_weapon_damage
armor: frontmatter.DnD_armor
armor_ac: frontmatter.DnD_armor_ac
extra-items: frontmatter.DnD_extra_items
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
class-levels: frontmatter.DnD_class_levels
subclass: frontmatter.DnD_class_subclass
race: frontmatter.DnD_race
race-lineage: frontmatter.DnD_race_lineage
background: frontmatter.DnD_background
extra-feats: frontmatter.DnD_extra_feats
hide: frontmatter.DnD_hide_feature
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