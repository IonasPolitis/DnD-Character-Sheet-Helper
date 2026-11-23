import type DnDCharacterSheetHelperPlugin from '../main';
import { processDnDFeaturesBlock } from './character-sheet/features';
import { processDnDInventoryBlock } from './character-sheet/inventory';
import { processDnDRulesBlock, processDnDControlsBlock } from './character-sheet/rules-controls';
import { processDnDSpellsBlock } from './character-sheet/spells';
import { processDnDSkillsBlock } from './character-sheet/skills';
import { processDnDAbilitiesBlock } from './character-sheet/abilities';
import { processDnDInfoBlock } from './character-sheet/info';
import { processDnDHealthBlock } from './character-sheet/health';

export {
    processDnDFeaturesBlock,
    processDnDInventoryBlock,
    processDnDRulesBlock,
    processDnDControlsBlock,
    processDnDSpellsBlock,
    processDnDSkillsBlock,
    processDnDAbilitiesBlock,
    processDnDInfoBlock,
    processDnDHealthBlock
};

export function registerCharacterSheetBlocks(plugin: DnDCharacterSheetHelperPlugin): void {
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-features",
        (source, el, ctx) => processDnDFeaturesBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-inventory",
        (source, el, ctx) => processDnDInventoryBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-rules",
        (source, el, ctx) => processDnDRulesBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-controls",
        (source, el, ctx) => processDnDControlsBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-spells",
        (source, el, ctx) => processDnDSpellsBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-skills",
        (source, el, ctx) => processDnDSkillsBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-info",
        (source, el, ctx) => processDnDInfoBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-abilities",
        (source, el, ctx) => processDnDAbilitiesBlock(plugin, source, el, ctx)
    );
    plugin.registerMarkdownCodeBlockProcessor(
        "dnd-health",
        (source, el, ctx) => processDnDHealthBlock(plugin, source, el, ctx)
    );
}
