---
DnD_id:
DnD_level:
DnD_hitDice:
DnD_proficiencyBonus:
DnD_race:
DnD_raceLineage:
DnD_class:
DnD_classLevels:
DnD_subclass:
DnD_classEquipment:
DnD_classProficiencies:
DnD_classChosenItems:
DnD_classChoices:
DnD_spellcastingAbility:
DnD_featureUses:
DnD_languages:
DnD_background:
DnD_backgroundFeat:
DnD_backgroundEquipment:
DnD_backgroundChosenItems:
DnD_extraFeats:
DnD_skillProficiencies:
DnD_skillExpertise:
DnD_skillHalfProficiencies:
DnD_skillBonuses:
DnD_maxHealth:
DnD_currentHealth:
DnD_speed:
DnD_speedSublabel: 
DnD_attackStat:
DnD_attackProficiency:
DnD_strength:
DnD_dexterity:
DnD_constitution:
DnD_intelligence:
DnD_wisdom:
DnD_charisma:
DnD_weapon:
DnD_weaponDamage:
DnD_armor:
DnD_armorAc:
DnD_armorAcBonus:
DnD_armorAcMod:
DnD_attackRollMod:
DnD_starterEquipment:
DnD_inventoryItems:
DnD_customItems:
DnD_spells:
DnD_preparedSpells:
DnD_spellSlots:
DnD_wealthAdded:
DnD_wealthSpent:
DnD_hideFeature:
DnD_featureUses:
cssclasses:
  - character-sheet
obsidianUIMode: preview
---
## Board
```dnd-health
health: frontmatter.DnD_maxHealth
currentHealth: frontmatter.DnD_currentHealth
hitDice: frontmatter.DnD_hitDice
level: frontmatter.DnD_level
```
<font size=5>Info:</font>
```dnd-info
mode: character
level: frontmatter.DnD_level
race: frontmatter.DnD_race
raceLineage: frontmatter.DnD_raceLineage
class: frontmatter.DnD_class
subclass: frontmatter.DnD_subclass
background: frontmatter.DnD_background
backgroundFeat: frontmatter.DnD_backgroundFeat
languages: frontmatter.DnD_languages
```

<font size=5>Stats:</font>
```dnd-abilities
strength: frontmatter.DnD_strength
dexterity: frontmatter.DnD_dexterity
constitution: frontmatter.DnD_constitution
intelligence: frontmatter.DnD_intelligence
wisdom: frontmatter.DnD_wisdom
charisma: frontmatter.DnD_charisma
proficiencies: frontmatter.DnD_classProficiencies
```
---
```dnd-info
mode: combat
armor: frontmatter.DnD_armor
armorAc: frontmatter.DnD_armorAc
armorAcBonus: frontmatter.DnD_armorAcBonus
armorAcMod: frontmatter.DnD_armorAcMod
attackStat: frontmatter.DnD_attackStat
attackRollMod: frontmatter.DnD_attackRollMod
speed: frontmatter.DnD_speed
speedSublabel: frontmatter.DnD_speedSublabel
```
 ---
```dnd-skills
proficiencies: frontmatter.DnD_skillProficiencies
expertise: frontmatter.DnD_skillExpertise
half_proficiencies: frontmatter.DnD_skillHalfProficiencies
bonuses: frontmatter.DnD_skillBonuses
```
---
```dnd-controls
```
---
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
starterEquipment: frontmatter.DnD_starterEquipment
inventoryItems: frontmatter.DnD_inventoryItems
customItems: frontmatter.DnD_customItems
wealthAdded: frontmatter.DnD_wealthAdded
wealthSpent: frontmatter.DnD_wealthSpent
```

```dnd-spells
spellcastingAbility: frontmatter.DnD_spellcastingAbility
spells: frontmatter.DnD_spells
preparedSpells: frontmatter.DnD_preparedSpells
spellSlots: frontmatter.DnD_spellSlots
```

```dnd-features
level: frontmatter.DnD_level
proficiencyBonus: frontmatter.DnD_proficiencyBonus
class: frontmatter.DnD_class
classLevels: frontmatter.DnD_classLevels
subclass: frontmatter.DnD_Subclass
classChoices: frontmatter.DnD_classChoices
race: frontmatter.DnD_race
raceLineage: frontmatter.DnD_raceLineage
background: frontmatter.DnD_background
extraFeats: frontmatter.DnD_extraFeats
featureUses: frontmatter.DnD_featureUses
hide: frontmatter.DnD_hideFeature
```

## Appearance:


## Backstory:
