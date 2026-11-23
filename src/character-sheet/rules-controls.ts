import { CachedMetadata, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { getRuleData } from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import { createFrontmatterResolver, parseBlockYaml } from '../helpers';
import { EquipItemsModal, InventoryModal } from '../modals/item-modals';
import { LevelUpModal } from '../modals/level-up-modal';
import { ManageCharacterModal } from '../modals/manage-character-modal';
import { SpellbookModal } from '../modals/spellbook-modal';

export async function processDnDRulesBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    // 1. Create a Render Child to manage the lifecycle and reactivity
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    // 2. Wrap our entire rendering logic into a reusable function
    const renderContent = async () => {
        // Create a temporary wrapper to prevent UI flickering while awaiting data
        const wrapper = document.createElement('div');

        // Parse the user's code block using Obsidian's built-in YAML parser
        let blockData: Record<string, any>;
        try {
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid format in dnd-rules block.", cls: "dnd-error" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        // 2. Fetch the frontmatter for the current active file
        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        // 3. Helper function to resolve "frontmatter.property" values
        const resolveValue = createFrontmatterResolver(frontmatter);

        // 4. Resolve all core variables
        const hbRule = resolveValue(blockData.rules);
        const edition = resolveValue(blockData.edition);

        const fetchOptions = {
            ...plugin.settings,
            edition: edition ? String(edition) : undefined
        };

        // 6. Setup the Registry Lookup (Preparation for Data Fetching)
        const rulesArray = Array.isArray(hbRule) ? hbRule : (hbRule ? [hbRule] : []);

        if (rulesArray.length > 0) {
            const sectionWindow = wrapper.createDiv({ cls: "dnd-features-window" });
            const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-rules` });

            for (const ruleKey of rulesArray) {
                const ruleData = await getRuleData(plugin.app, fetchOptions, ruleKey);

                // Check for ruleData.rules
                if (ruleData && ruleData.rules) {
                    const headerName = ruleData.name ? ruleData.name : ruleKey;
                    sectionDiv.createEl("h4", { text: `${headerName}:`, cls: "dnd-class-header" });

                    for (const rule of ruleData.rules) {
                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                        titleContainer.createEl("span", { text: rule.badge ? rule.badge : "Rule", cls: "dnd-level-badge" });
                        titleContainer.createEl("span", { text: rule.name, cls: "dnd-feature-name" });

                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                        await plugin.renderDndMarkdown(rule.description, descDiv, ctx.sourcePath, renderChild);
                    }
                } else {
                    sectionDiv.createEl("p", { text: `Data for rule "${ruleKey}" not found.`, cls: "dnd-error-text" });
                }
            }
        }

        el.empty();
        el.appendChild(wrapper);
    };
    renderContent();
    renderChild.registerEvent(
        plugin.app.metadataCache.on('changed', (file) => {
            if (file.path === ctx.sourcePath) renderContent();
        })
    );
}

export async function processDnDControlsBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    // 1. Parse the YAML options (e.g., align: right-up)
    let blockData: Record<string, any> = {};
    try {
        blockData = parseBlockYaml(source);
    } catch (error) {
        el.empty();
        el.createEl("p", { text: "Error: Invalid YAML in dnd-controls block.", cls: "dnd-error-text" });
        return;
    }

    // 2. Determine Alignment & Line Shifting via CSS Modifier Classes
    const alignClassMap: Record<string, string> = {
        "right": "align-right",
        "center": "align-center",
        "right-up": "align-right-up",
        "right-down": "align-right-down"
    };
    const alignCls = alignClassMap[String(blockData.align || "").toLowerCase()] || "";

    let lastHasSpellcasting: boolean | null = null;

    const renderContent = (updatedCache?: CachedMetadata | null) => {
        // 3. Fetch the frontmatter for the active file to check for spellcasting
        const fileCache = updatedCache ?? plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};
        const rawSpellAbility = frontmatter["DnD_spellcastingAbility"];
        const hasSpellcasting = Boolean(
            rawSpellAbility &&
            String(rawSpellAbility).trim() !== "" &&
            !String(rawSpellAbility).trim().startsWith("<")
        );

        // Avoid unnecessary DOM rebuilds when unrelated frontmatter fields change
        if (lastHasSpellcasting === hasSpellcasting) return;
        lastHasSpellcasting = hasSpellcasting;

        // 4. Create the Button Container
        const container = document.createElement("div");
        container.className = `dnd-controls ${alignCls}`.trim();

        // 5. Create the Buttons
        const addExpBtn = container.createEl("button", { text: "🗡️ Level Up", cls: "mod-cta" });
        addExpBtn.onclick = () => {
            new LevelUpModal(plugin.app, plugin, ctx.sourcePath).open();
        };

        const equipItemsBtn = container.createEl("button", { text: "⚔️ Equip Items" });
        equipItemsBtn.onclick = () => {
            new EquipItemsModal(plugin.app, plugin, ctx.sourcePath).open();
        };

        const inventoryBtn = container.createEl("button", { text: "🎒 Inventory" });
        inventoryBtn.onclick = () => {
            new InventoryModal(plugin.app, plugin, ctx.sourcePath).open();
        };

        const manageCharBtn = container.createEl("button", { text: "⚙️ Manage Character" });
        manageCharBtn.onclick = () => {
            new ManageCharacterModal(plugin.app, plugin, ctx.sourcePath).open();
        };

        // Conditionally render the Spellbook button ONLY if DnD_spellcastingAbility exists in frontmatter
        if (hasSpellcasting) {
            const spellbookBtn = container.createEl("button", { text: "📖 Spellbook" });
            spellbookBtn.onclick = () => {
                new SpellbookModal(plugin.app, plugin, ctx.sourcePath).open();
            };
        }

        el.empty();
        el.appendChild(container);
    };

    renderContent();

    renderChild.registerEvent(
        plugin.app.metadataCache.on("changed", (file, _data, cache) => {
            if (file.path === ctx.sourcePath) {
                renderContent(cache);
            }
        })
    );
}
