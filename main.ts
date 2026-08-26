import { Plugin, MarkdownPostProcessorContext, parseYaml, Notice } from 'obsidian';

export default class DnDFeaturesPlugin extends Plugin {
    
    async onload() {
        // This registers the processor for our specific code block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-features", 
            this.processDnDBlock.bind(this)
        );
    }

    async processDnDBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Parse the user's code block using Obsidian's built-in YAML parser
        let blockData;
        try {
            blockData = parseYaml(source);
        } catch (error) {
            el.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
            return;
        }

        // 2. Fetch the frontmatter for the current active file
        const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        // 3. Helper function to resolve "frontmatter.property" values
        const resolveValue = (val: any) => {
            if (typeof val === 'string' && val.startsWith('frontmatter.')) {
                const key = val.replace('frontmatter.', '');
                return frontmatter[key];
            }
            return val;
        };

        // 4. Resolve all core variables
        const level = resolveValue(blockData.level);
        const dndClass = resolveValue(blockData.class);
        const subclass = resolveValue(blockData.subclass);
        const classLevels = resolveValue(blockData['class-levels']);
        const race = resolveValue(blockData.race);
        const background = resolveValue(blockData.background);
        const extraFeats = resolveValue(blockData['extra-feats']);

        // 5. Validate Multiclassing Levels
        if (Array.isArray(dndClass) && Array.isArray(classLevels)) {
            const totalClassLevels = classLevels.reduce((sum, current) => sum + current, 0);
            if (totalClassLevels !== level) {
                el.createEl("p", { 
                    text: `Error: The sum of class-levels (${totalClassLevels}) does not match the total level (${level}).`, 
                    cls: "dnd-error-text" 
                });
                return;
            }
        }

        // Placeholder for the rendering phase
        el.createEl("h3", { text: "D&D Features Successfully Parsed!" });
    }
}