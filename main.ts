import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, parseYaml, MarkdownRenderChild, MarkdownRenderer, TFile, Modal, Notice, MarkdownView, normalizePath, Platform } from 'obsidian';
import { getClassData, getSubclassData, getBackgroundData, getRaceData, getExtraFeat, getItemData, getRuleData, getSpellData, getSpellsPoolData, getClassChoiceData, getFeatMapData, getWeaponMasteriesMap, getWeaponMasteryDescription, buildWeaponMasteriesMarkdown } from './data';
import { MarkdownNotes, classesMap, racesMap, backgroundsMap, itemsMap } from './registry';
import { THEMES } from './themes';

// --- Item cost helpers (PP / GP / SP / CP) ---
// Item costs are stored as "<amount> <PP|GP|SP|CP>" (e.g. "50 GP", "1 SP", "5 CP").
// Legacy bare numbers (GP-based, possibly fractional) are converted for backwards compatibility.
interface ParsedItemCost { amount: number; unit: "PP" | "GP" | "SP" | "CP"; }

function parseItemCost(raw: any): ParsedItemCost | null {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.replace(/(?<=\d),(?=\d{3}\b)/g, "").match(/^(\d+(?:\.\d+)?)\s*(pp|gp|sp|cp)?$/i);
    if (!m) return null;
    const amount = Number(m[1]);
    if (!isFinite(amount)) return null;
    if (m[2]) return { amount, unit: m[2].toUpperCase() as ParsedItemCost["unit"] };
    // Legacy: bare number = gold. Express sub-gold values in SP / CP.
    if (amount === 0 || amount >= 1) return { amount, unit: "GP" };
    const sp = Math.round(amount * 10 * 1000) / 1000;
    if (Number.isInteger(sp)) return { amount: sp, unit: "SP" };
    return { amount: Math.round(amount * 100 * 1000) / 1000, unit: "CP" };
}

/** "50 GP" style text, or "" if the cost is missing/unparseable. */
function formatItemCost(raw: any, compact = false): string {
    const c = parseItemCost(raw);
    if (!c) return "";
    return compact ? `${c.amount}${c.unit}` : `${c.amount} ${c.unit}`;
}

function hasItemCost(raw: any): boolean {
    const c = parseItemCost(raw);
    return !!c && c.amount > 0;
}

// --- Feat Ability Score Helpers ---
export type AbilityKey = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
export const ALL_ABILITIES: AbilityKey[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

export interface ParsedAbilityImprovement {
    options: AbilityKey[];
    amount: number;
    maxCap: number;
    isChoice: boolean;
}

export interface SpeedModifierBreakdown {
    baseSpeed: number;
    classSpeedBonus: number;
    featSpeedBonus: number;
    customSpeedMod: number;
    totalSpeedMod: number;
    totalSpeed: number;
    breakdown: { source: string; amount: number; active: boolean; reason?: string }[];
}

export function parseFeatAbilityImprovements(featData: any): ParsedAbilityImprovement[] {
    if (!featData || !Array.isArray(featData.improveAbility)) return [];
    const results: ParsedAbilityImprovement[] = [];
    for (const item of featData.improveAbility) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const spec = String(item[0]).toLowerCase().trim();
        const amount = Number(item[1]) || 1;
        const maxCap = item.length >= 3 && !isNaN(Number(item[2])) ? Number(item[2]) : (featData?.category === "Epic Boon" ? 30 : 20);

        let options: AbilityKey[] = [];
        if (spec === "any") {
            options = [...ALL_ABILITIES];
        } else {
            const parts = spec.split("|").map(s => s.trim().toLowerCase());
            options = parts.filter((p): p is AbilityKey => ALL_ABILITIES.includes(p as AbilityKey));
        }

        if (options.length > 0) {
            results.push({
                options,
                amount,
                maxCap,
                isChoice: options.length > 1
            });
        }
    }
    return results;
}

export function formatFeatureOrSlug(slug: string): string {
    return String(slug || "")
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

export function parseSavingThrows(raw: any): AbilityKey[] {
    if (!raw) return [];
    let list: any[] = [];
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            list = Array.isArray(parsed) ? parsed : [raw];
        } catch {
            list = raw.split(",").map(s => s.trim());
        }
    } else if (Array.isArray(raw)) {
        list = raw;
    }
    const results: AbilityKey[] = [];
    for (const item of list) {
        const s = String(item || "").trim().toLowerCase();
        if (ALL_ABILITIES.includes(s as AbilityKey) && !results.includes(s as AbilityKey)) {
            results.push(s as AbilityKey);
        }
    }
    return results;
}

export function parseFeatSavingThrowProficiencies(featData: any, chosenAbility?: AbilityKey): AbilityKey[] {
    if (!featData || !featData.proficiencySavingThrow) return [];
    const raw = featData.proficiencySavingThrow;
    const items = Array.isArray(raw) ? raw : [raw];
    const results: AbilityKey[] = [];

    for (const item of items) {
        const s = String(item || "").trim().toLowerCase();
        if (s === "improvedability" || s === "improveability" || s === "chosen") {
            if (chosenAbility && ALL_ABILITIES.includes(chosenAbility)) {
                if (!results.includes(chosenAbility)) results.push(chosenAbility);
            }
        } else if (ALL_ABILITIES.includes(s as AbilityKey)) {
            if (!results.includes(s as AbilityKey)) results.push(s as AbilityKey);
        }
    }
    return results;
}

// --- Weapon Mastery State Helpers ---
// Structure in frontmatter: DnD_weaponMastery: '[ "<AvailableSlots>", [ "<WeaponSlug>", ... ] ]'
export interface WeaponMasteryState {
    available: number;
    mastered: string[];
}

export function sanitizeWeaponSlug(val: any): string {
    if (!val) return "";
    return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
}

export function parseWeaponMasteryState(raw: any): WeaponMasteryState {
    if (raw === undefined || raw === null || raw === "") {
        return { available: 0, mastered: [] };
    }
    let parsed: any = raw;
    if (typeof parsed === "string") {
        const trimmed = parsed.trim();
        if (trimmed.startsWith("[")) {
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                return { available: 0, mastered: [] };
            }
        } else if (!isNaN(Number(trimmed))) {
            return { available: Math.max(0, Math.floor(Number(trimmed))), mastered: [] };
        } else {
            return { available: 0, mastered: [] };
        }
    }
    if (Array.isArray(parsed)) {
        const rawAvail = parsed[0];
        const available = Math.max(0, Math.floor(Number(String(rawAvail ?? "0").replace(/[^0-9.-]/g, "")) || 0));
        const rawList = Array.isArray(parsed[1]) ? parsed[1] : [];
        const mastered: string[] = [];
        for (const w of rawList) {
            const slug = sanitizeWeaponSlug(w);
            if (slug && slug !== "none" && !mastered.includes(slug)) {
                mastered.push(slug);
            }
        }
        return { available, mastered };
    }
    return { available: 0, mastered: [] };
}

export function serializeWeaponMasteryState(available: number, mastered: string[]): string {
    const cleanAvail = String(Math.max(0, Math.floor(Number(available) || 0)));
    const cleanMastered: string[] = [];
    if (Array.isArray(mastered)) {
        for (const w of mastered) {
            const slug = sanitizeWeaponSlug(w);
            if (slug && slug !== "none" && !cleanMastered.includes(slug)) {
                cleanMastered.push(slug);
            }
        }
    }
    return JSON.stringify([cleanAvail, cleanMastered]);
}

// 1. Define the shape of our settings
interface DnDPluginSettings {
    combineClassSubclass: boolean;
    sectionOrder: string[];
    customRulebookPath: string;
    customRulebookPriority: boolean;

    // Theme Engine Variables
    selectedTheme: string;
    colorBgPrimary: string;
    colorBgSecondary: string;
    colorBgTertiary: string;
    colorBgHover: string;
    colorBgDarker: string;
    colorBgGroup: string;
    colorBgProficient: string;
    colorTextPrimary: string;
    colorTextSecondary: string;
    colorTextSublabel: string;
    colorTextBright: string;
    colorTextMuted: string;
    colorTextGroup: string;
    colorBorderPrimary: string;
    colorBorderActive: string;
    colorBorderFocus: string;
    colorAccentTeal: string;
    colorAccentRed: string;
    colorAccentPurple: string;
}

// 2. Set the default values
const DEFAULT_SETTINGS: DnDPluginSettings = {
    combineClassSubclass: false,
    sectionOrder: ["Class", "Subclass", "Race", "Background", "Extra Feats"],
    customRulebookPath: "",
    customRulebookPriority: false,

    selectedTheme: "default",
    ...THEMES.default.colors // Spread the default colors directly from the library!
}

interface CharacterSheetVariables {
    DnD_level: number;
    DnD_proficiency_bonus: number;
    DnD_race: string[];
    DnD_race_lineage: string;
    DnD_class: string[];
    DnD_class_subclass: string[];
    DnD_class_chosen_items: string;
    DnD_languages: string[];
    DnD_background: string;
    DnD_background_feat: string;
    DnD_background_chosen_items: string;
    DnD_extra_feats: string[];
    DnD_spellcasting_ability: string;
    DnD_maxHealth: number;
    DnD_current_health: number;
    DnD_hit_dice: string;
    DnD_speed: number;
    DnD_strength: number;
    DnD_dexterity: number;
    DnD_constitution: number;
    DnD_intelligence: number;
    DnD_wisdom: number;
    DnD_charisma: number;
    DnD_hide_feature: string[];
    DnD_class_equipment: string;
    DnD_background_equipment: string;
    DnD_weapon: string;
    DnD_weapon_damage: number;
    DnD_armor: string;
    DnD_armorAc: number;
    DnD_armor_ac_bonus: number;
    DnD_armor_ac_mod: number;
    DnD_attack_stat: string;
    DnD_attack_roll_mod: number;
    dnd_gold_added: number;
    dnd_gold_spent: number;
    cssclasses: string;
    obsidianUIMode: string;
}

export default class DnDCharacterSheetHelperPlugin extends Plugin {
    settings: DnDPluginSettings;
    featureRestTypes: Map<string, "short" | "long"> = new Map();

    private touchGuardWindows = new WeakSet<Window>();
    async onload() {
        // --- INITIALIZE PLUGIN & STANDALONE THEME ENGINE ---
        await this.loadSettings();
        this.applyTheme();

        // Register the settings tab we built
        this.addSettingTab(new DnDSettingsTab(this.app, this));

        // Register the processor for our specific code block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-features",
            this.processDnDFeaturesBlock.bind(this)
        );

        // Register the processor for the inventory block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-inventory",
            this.processDnDInventoryBlock.bind(this)
        );

        // Register the processor for the inventory block
        this.registerMarkdownCodeBlockProcessor(
            "dnd-rules",
            this.processDnDRulesBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-controls",
            this.processDnDControlsBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-spells",
            this.processDnDSpellsBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-skills",
            this.processDnDSkillsBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-info",
            this.processDnDInfoBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-abilities",
            this.processDnDAbilitiesBlock.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-health",
            this.processDnDHealthBlock.bind(this)
        );

        // Automatically refresh open character sheets whenever a file inside the Custom Rulebook folder is edited
        const refreshIfCustomRulebookFile = (filePath: string) => {
            const basePath = this.settings.customRulebookPath?.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
            if (!basePath) return;
            const normBase = normalizePath(basePath);
            if (filePath.startsWith(normBase + "/") || filePath === normBase) {
                if (filePath === normalizePath(`${normBase}/weapon-masteries.json`)) {
                    void this.syncWeaponMasteriesMarkdown();
                }
                this.app.workspace.iterateAllLeaves((leaf) => {
                    if (leaf.view instanceof MarkdownView && leaf.view.file) {
                        const activeFile = leaf.view.file;
                        const cache = this.app.metadataCache.getFileCache(activeFile);
                        if (cache) {
                            this.app.metadataCache.trigger('changed', activeFile, '', cache);
                        }
                    }
                });
            }
        };

        this.registerEvent(this.app.vault.on('modify', (file) => refreshIfCustomRulebookFile(file.path)));
        this.registerEvent(this.app.vault.on('create', (file) => refreshIfCustomRulebookFile(file.path)));
        this.registerEvent(this.app.vault.on('delete', (file) => refreshIfCustomRulebookFile(file.path)));

        this.app.workspace.onLayoutReady(() => {
            void this.syncWeaponMasteriesMarkdown();
        });

        this.addCommand({
            id: 'csh-launch-character-wizard',
            name: 'Launch Character Creation Wizard',
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);

                if (!view) {
                    new Notice("Please open a note first to launch the Wizard.");
                    return;
                }

                // Launch our new multi-step wizard!
                new CharacterWizardModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'csh-character-sheet-template',
            name: 'Set Character Sheet Template',
            callback: async () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);

                if (!view) {
                    new Notice("Please open a note first to insert the template.");
                    return;
                }

                try {
                    const currentState = view.getState();
                    if (currentState.mode !== 'source') {
                        currentState.mode = 'source';
                        await view.setState(currentState, { history: false });
                    }
                    setTimeout(async () => {
                        const content = await this.getTemplateContent();

                        if (!content) {
                            const available = Object.keys(MarkdownNotes).join(', ');
                            new Notice(`Template missing! Available files: \${available}`);
                            return;
                        }

                        // Paste the content
                        view.editor.replaceSelection(content);
                    }, 100);

                } catch (error) {
                    console.error("Failed to insert template:", error);
                    new Notice("Error: Could not insert template file.");
                }
            }
        });

        // Main Obsidian window
        this.registerTouchGuard(window);

        // Also support desktop pop-out windows
        this.registerEvent(
            this.app.workspace.on("window-open", (_workspaceWindow, win) => {
                this.registerTouchGuard(win);
            })
        );

        // Keep the rest of your existing onload() code here.

    }

    private registerTouchGuard(win: Window) {
        // Don't register duplicate listeners
        if (this.touchGuardWindows.has(win)) return;
        this.touchGuardWindows.add(win);

        this.registerDomEvent(
            win,
            "pointerup",
            (event: PointerEvent) => {
                // Only apply to finger touches
                if (event.pointerType !== "touch") return;

                const node = event.target as Node | null;

                const el = node?.nodeType === 1
                    ? node as Element
                    : node?.parentElement;

                if (!el) return;

                // Must be in Reading view
                const isReadingView = el.closest(
                    ".markdown-reading-view"
                );

                // Must belong to a note with this CSS class
                const isCharacterSheet = el.closest(
                    ".markdown-preview-view.character-sheet"
                );

                if (!isReadingView || !isCharacterSheet) return;

                // Prevent Obsidian from counting this as a tap
                event.preventDefault();
            },
            { capture: true }
        );
    }

    // Helper functions for Obsidian to read/write settings
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- Helper: Fetch Character Sheet Template with 2-Stage Custom Rulebook Priority ---
    async getTemplateContent(): Promise<string | null> {
        const fetchNative = () => MarkdownNotes['dnd_character_template'] || null;
        const basePath = this.settings.customRulebookPath?.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
        if (!basePath) return fetchNative();

        const fetchCustom = async () => {
            const customPath = normalizePath(`${basePath}/markdown/dnd_character_template.md`);
            if (await this.app.vault.adapter.exists(customPath)) {
                try {
                    return await this.app.vault.adapter.read(customPath);
                } catch (e) {
                    console.error(`Failed to read custom template at ${customPath}`, e);
                }
            }
            return null;
        };

        return this.settings.customRulebookPriority
            ? (await fetchCustom()) ?? fetchNative()
            : fetchNative() ?? (await fetchCustom());
    }

    /**
     * Dynamically rebuilds the in-memory and custom rulebook `weapon-masteries.md`
     * reference note from `weapon-masteries.json` whenever the plugin loads or the
     * Custom Rulebook changes.
     */
    async syncWeaponMasteriesMarkdown(): Promise<void> {
        try {
            const map = await getWeaponMasteriesMap(this.app, this.settings);
            const mdContent = buildWeaponMasteriesMarkdown(map);
            MarkdownNotes["weapon-masteries"] = mdContent;

            const basePath = this.settings.customRulebookPath?.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
            if (!basePath) return;

            const customJsonPath = normalizePath(`${basePath}/weapon-masteries.json`);
            if (await this.app.vault.adapter.exists(customJsonPath)) {
                const mdDirPath = normalizePath(`${basePath}/markdown`);
                if (!(await this.app.vault.adapter.exists(mdDirPath))) {
                    await this.app.vault.adapter.mkdir(mdDirPath);
                }
                const customMdPath = normalizePath(`${mdDirPath}/weapon-masteries.md`);
                let existing = "";
                if (await this.app.vault.adapter.exists(customMdPath)) {
                    existing = await this.app.vault.adapter.read(customMdPath);
                }
                if (existing !== mdContent) {
                    await this.app.vault.adapter.write(customMdPath, mdContent);
                }
            }
        } catch (e) {
            console.error("Failed to sync weapon-masteries.md:", e);
        }
    }

    // --- Theme Engine Logic ---
    private colorCssVars(): [string, string][] {
        return Object.entries(this.settings)
            .filter(([key]) => key.startsWith("color"))
            // Magic Regex: Converts "colorBgPrimary" -> "--dnd-ui-color-bg-primary"
            .map(([key, value]) => [`--dnd-ui-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`, value as string]);
    }

    applyTheme() {
        // 1. Apply to the main Obsidian window
        for (const [name, value] of this.colorCssVars()) {
            document.documentElement.style.setProperty(name, value);
        }

        // 2. Apply to all popped-out windows (if on Desktop)
        if (Platform.isDesktop) {
            this.app.workspace.iterateAllLeaves((leaf) => {
                const windowDoc = leaf.view.containerEl.ownerDocument;
                if (windowDoc) {
                    for (const [name, value] of this.colorCssVars()) {
                        windowDoc.documentElement.style.setProperty(name, value);
                    }
                }
            });
        }
    }

    // --- Helper: Safely Update 4-Currency Wealth Frontmatter ([PP, GP, SP, CP]) ---
    async updateWealthFrontmatter(filePath: string, targetKey: string, currencyIndex: number, amount: number) {
        if (!targetKey || amount <= 0 || currencyIndex < 0 || currencyIndex > 3) return;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, any>) => {
                const key = targetKey;
                let rawArr = frontmatter[key];
                let parsedArr = ["0", "0", "0", "0"];

                if (typeof rawArr === "string" && rawArr.trim().startsWith("[")) {
                    try { rawArr = JSON.parse(rawArr.trim()); } catch { rawArr = null; }
                }
                if (Array.isArray(rawArr)) {
                    for (let i = 0; i < 4; i++) {
                        parsedArr[i] = String(Number(rawArr[i]) || 0);
                    }
                }

                const currentVal = Number(parsedArr[currencyIndex]) || 0;
                parsedArr[currencyIndex] = String(Math.max(0, currentVal + amount));
                frontmatter[key] = JSON.stringify(parsedArr);
            });
        }
    }

    // --- Helper: Safely Update Multiple Frontmatter Variables ---
    async updateCharacterFrontmatter(filePath: string, updates: Record<string, any>) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, any>) => {
                for (const [key, value] of Object.entries(updates)) {
                    frontmatter[key] = value;
                }
            });
        }
    }

    // --- Helper: Safely Render Markdown and Fix Spacing ---
    async renderDndMarkdown(text: string, container: HTMLElement, sourcePath: string, component: MarkdownRenderChild) {
        if (!text) return;

        // 1. Trim trailing newlines AND intercept tab characters!
        const cleanText = text.trim().replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');

        // 2. Render the markdown securely
        await MarkdownRenderer.render(this.app, cleanText, container, sourcePath, component);

        // 2.5 Intercept custom "note:" links to open our pop-up modal!
        container.addEventListener('click', (event) => {
            let target = event.target as HTMLElement;

            const closestLink = target.closest('a');
            if (closestLink) {
                target = closestLink;
            }

            if (target.tagName === 'A') {
                const href = target.getAttribute('href');
                // Listen for your new generic "note:" syntax
                if (href && href.startsWith('note:')) {
                    event.preventDefault(); // Stop Obsidian from navigating away

                    // Extract the filename (e.g., "note:wild-magic-surge" -> "wild-magic-surge")
                    const noteKey = href.replace('note:', '').toLowerCase();

                    // Pass 'this' (the plugin instance) so the Modal can find the plugin folder!
                    new NoteModal(this.app, this, noteKey).open();
                }
            }
        });

        // 3. If a header is the VERY first item in the text, completely remove its top margin!
        const firstChild = container.firstElementChild as HTMLElement;
        if (firstChild && firstChild.tagName.match(/^H[1-6]$/i)) {
            firstChild.style.marginTop = '0';
        }

        // 4. Strip the bottom margin from the very last child to eliminate dead space!
        const lastChild = container.lastElementChild as HTMLElement;
        if (lastChild) {
            lastChild.style.marginBottom = '0';
        }

        // 5. Eliminate the large default Obsidian margins from all block elements
        const blockElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol, li, blockquote, pre, table, hr');
        blockElements.forEach((el: Element) => {
            const htmlEl = el as HTMLElement;
            const tag = htmlEl.tagName.toLowerCase();

            // 1. BASELINE: Zero out vertical margins for every single element by default
            htmlEl.style.marginTop = '0';
            htmlEl.style.marginBottom = '0';

            // 2. EXCEPTIONS: Standard block elements that NEED breathing room
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote', 'pre', 'hr'].includes(tag)) {
                htmlEl.style.marginTop = '0.5em';
                htmlEl.style.marginBottom = '0.5em';
            }
            // 3. LIST PARAGRAPHS: Prevent the paragraph from breaking onto a new line under the bullet
            else if (tag === 'p' && htmlEl.closest('li')) {
                htmlEl.style.display = 'inline';
            }
            // 4. LIST CONTAINERS: Strip hidden padding/margins and flush to the left edge
            else if (tag === 'ul' || tag === 'ol') {
                htmlEl.style.paddingTop = '0';
                htmlEl.style.marginLeft = '0';
                htmlEl.style.paddingLeft = '0'; // Flushed completely left!
            }
            // 5. BULLET POINTS: The Custom Styled Injection
            else if (tag === 'li') {
                // 1. Hide the rigid native bullet
                htmlEl.style.listStyleType = 'none';

                // 2. List's Text
                htmlEl.style.paddingLeft = '0'; // 'paddingLeft' is 0 so wrapped text hits the edge
                htmlEl.style.marginLeft = '0'; // 'textIndent' pushes ONLY the first line inward
                htmlEl.style.textIndent = '1.05em'; // Adjust List Text (text after a bullet-point) placement

                // 3. Set relative positioning so our custom bullet can float inside this space
                htmlEl.style.position = 'relative';

                // 4. Bullet-Point adjustment.
                if (!htmlEl.getAttribute('data-custom-bullet')) {
                    const bulletSpan = document.createElement('span');
                    bulletSpan.innerHTML = '&bull;'; // Standard bullet entity

                    // Style it to match Obsidian's native look perfectly!
                    bulletSpan.style.position = 'absolute';
                    bulletSpan.style.left = '0'; // Adjust bullet-point placement 
                    bulletSpan.style.textIndent = '0'; // Ensure the absolute bullet ignores the text-indent of the parent

                    bulletSpan.style.lineHeight = '1';
                    bulletSpan.style.top = '-0.175em'; // Adjust height position
                    bulletSpan.style.color = 'var(--dnd-ui-color-text-secondary)'; // Adjust colour pallete
                    bulletSpan.style.fontSize = '2em'; // Adjust size

                    htmlEl.insertBefore(bulletSpan, htmlEl.firstChild);
                    htmlEl.setAttribute('data-custom-bullet', 'true');
                }
            }
        });
    }

    // --- Helper: Discover if a class grants a subclass at or before maxLevel ---
    findGrantedSubclass(classData: any, maxLevel: number): string | null {
        if (!classData) return null;
        if (classData.features) {
            for (let lvl = 1; lvl <= maxLevel; lvl++) {
                const levelFeatures = classData.features[lvl.toString()];
                if (Array.isArray(levelFeatures)) {
                    for (const feature of levelFeatures) {
                        const granted = feature.grantedSubclasses ?? feature.grantedSubclass;
                        if (granted && typeof granted === "string") {
                            return granted.trim().replace(/\.json$/i, '');
                        }
                    }
                }
            }
        }
        // Support "subclassFile" at the root of the class JSON (README standard & Custom Rulebook)
        if (classData.subclassFile && typeof classData.subclassFile === "string") {
            return classData.subclassFile.trim().replace(/\.json$/i, '');
        }
        return null;
    }

    // --- Helper: Scan Class Features (Lvl 1..currentLevel) for Hidden "Unarmored Defense" Formula ---
    async resolveUnarmoredDefense(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        statsRecord: Record<string, number>,
        fetchOptions?: any
    ): Promise<{ baseAc: number; acBonus: number; totalAc: number; formula: string }> {
        const options = fetchOptions || this.settings;
        const parsedTotalLevel = Math.max(1, Number(totalLevel) || 1);
        const dexScore = Number(statsRecord.dexterity) || 10;
        const dexMod = Math.floor((dexScore - 10) / 2);

        const classArray = Array.isArray(classInput)
            ? classInput.map(c => String(c || "").trim()).filter(Boolean)
            : (classInput ? [String(classInput).trim()].filter(Boolean) : []);

        const statAbbrMap: Record<string, string> = {
            str: "strength", strength: "strength",
            dex: "dexterity", dexterity: "dexterity",
            con: "constitution", constitution: "constitution",
            int: "intelligence", intelligence: "intelligence",
            wis: "wisdom", wisdom: "wisdom",
            cha: "charisma", charisma: "charisma"
        };

        let foundFormula = "";

        for (let idx = 0; idx < classArray.length; idx++) {
            const className = classArray[idx];
            const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevelsInput) && classLevelsInput.length > idx)
                ? (Number(classLevelsInput[idx]) || 1)
                : parsedTotalLevel;

            const classData = await getClassData(this.app, options, className);
            if (!classData) continue;

            if (classData.features) {
                for (let lvl = 1; lvl <= currentClassLevel; lvl++) {
                    const levelFeatures = classData.features[lvl.toString()];
                    if (Array.isArray(levelFeatures)) {
                        for (const feature of levelFeatures) {
                            if (
                                feature &&
                                feature.hide === true &&
                                String(feature.name || "").trim().toLowerCase() === "unarmored defense" &&
                                feature.description
                            ) {
                                foundFormula = String(feature.description).trim();
                            }
                        }
                    }
                }
            }

            // Legacy fallback if a custom class JSON used root "unarmoredDefense": "wisdom"
            if (!foundFormula && classData.unarmoredDefense) {
                const legacyStat = String(classData.unarmoredDefense).trim().toLowerCase();
                if (statAbbrMap[legacyStat]) {
                    foundFormula = `10+dexterity+${statAbbrMap[legacyStat]}`;
                }
            }

            if (foundFormula) break;
        }

        if (!foundFormula) {
            return {
                baseAc: 10,
                acBonus: dexMod,
                totalAc: 10 + dexMod,
                formula: "10+dexterity"
            };
        }

        // Parse formula tokens (e.g. "10+dexterity+wisdom" or "10+dexterity+constitution")
        let baseAc = 0;
        let hasNumericBase = false;
        let acBonus = 0;

        const parts = foundFormula.split(/([+\-])/).map(t => t.trim()).filter(Boolean);
        let sign = 1;
        for (const part of parts) {
            if (part === "+") {
                sign = 1;
                continue;
            }
            if (part === "-") {
                sign = -1;
                continue;
            }
            const num = Number(part);
            if (!isNaN(num)) {
                baseAc += sign * num;
                hasNumericBase = true;
            } else {
                const cleanKey = part.toLowerCase().replace(/(?:_?modifier|_?mod)$/i, "").trim();
                const fullStat = statAbbrMap[cleanKey];
                if (fullStat) {
                    const score = Number(statsRecord[fullStat]) || 10;
                    const mod = Math.floor((score - 10) / 2);
                    acBonus += sign * mod;
                }
            }
            sign = 1;
        }

        if (!hasNumericBase) baseAc = 10;

        return {
            baseAc,
            acBonus,
            totalAc: baseAc + acBonus,
            formula: foundFormula
        };
    }

    // --- Helper: Calculate Dynamic Damage for "Unarmed Strike" using class scalingDice & Ability Modifiers ---
    async resolveUnarmedStrikeDamage(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        statsRecord: Record<string, number>,
        attackStat?: string,
        fetchOptions?: any
    ): Promise<string> {
        const options = fetchOptions || this.settings;
        const parsedTotalLevel = Math.max(1, Number(totalLevel) || 1);

        const classArray = Array.isArray(classInput)
            ? classInput.map(c => String(c || "").trim()).filter(Boolean)
            : (classInput ? [String(classInput).trim()].filter(Boolean) : []);

        let scalingDie = "";

        for (let idx = 0; idx < classArray.length; idx++) {
            const className = classArray[idx];
            const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevelsInput) && classLevelsInput.length > idx)
                ? Math.max(1, Number(classLevelsInput[idx]) || 1)
                : parsedTotalLevel;

            const classData = await getClassData(this.app, options, className);
            if (classData && Array.isArray(classData.scalingDice) && classData.scalingDice.length > 0) {
                const dieIdx = Math.min(currentClassLevel - 1, classData.scalingDice.length - 1);
                const candidateDie = String(classData.scalingDice[Math.max(0, dieIdx)] || "").trim();
                if (candidateDie) {
                    scalingDie = candidateDie;
                    break;
                }
            }
        }

        const strMod = Math.floor(((Number(statsRecord.strength) || 10) - 10) / 2);
        const dexMod = Math.floor(((Number(statsRecord.dexterity) || 10) - 10) / 2);

        const cleanAtkStat = String(attackStat || "").trim().toLowerCase();
        let chosenMod = strMod;

        if (scalingDie) {
            // Classes with scalingDice (e.g. Monk Martial Arts) use the higher of STR or DEX by default,
            // or a custom attackStat if explicitly set to another ability (e.g. Wisdom)
            if (cleanAtkStat && cleanAtkStat !== "strength" && cleanAtkStat !== "dexterity" && statsRecord[cleanAtkStat] !== undefined) {
                chosenMod = Math.floor(((Number(statsRecord[cleanAtkStat]) || 10) - 10) / 2);
            } else {
                chosenMod = Math.max(strMod, dexMod);
            }
        } else {
            if (cleanAtkStat && statsRecord[cleanAtkStat] !== undefined) {
                chosenMod = Math.floor(((Number(statsRecord[cleanAtkStat]) || 10) - 10) / 2);
            } else {
                chosenMod = strMod;
            }
        }

        const basePart = scalingDie || "1";
        if (chosenMod > 0) {
            return `${basePart} + ${chosenMod} Bludgeoning`;
        } else if (chosenMod < 0) {
            return `${basePart} - ${Math.abs(chosenMod)} Bludgeoning`;
        }
        return `${basePart} Bludgeoning`;
    }

    // --- Helper: Deterministic Speed & Speed Modifier Calculator adhering to D&D 5.5e ---
    async resolveCharacterSpeedModifiers(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        extraFeatsInput: any,
        backgroundFeatInput: any,
        equippedArmor: string,
        baseSpeedInput: number = 30,
        customSpeedModInput: number = 0,
        subclassInput?: any,
        fetchOptions?: any
    ): Promise<SpeedModifierBreakdown> {
        const options = fetchOptions || this.settings;
        const parsedTotalLevel = Math.max(1, Number(totalLevel) || 1);
        const baseSpeed = Math.max(0, Number(baseSpeedInput) || 30);
        const customSpeedMod = Number(customSpeedModInput) || 0;

        const breakdown: { source: string; amount: number; active: boolean; reason?: string }[] = [];

        // 1. Determine Armor State
        const safeArmorName = String(equippedArmor || "").toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        let isUnarmored = true;
        let isHeavyArmor = false;

        if (safeArmorName && safeArmorName !== "none" && safeArmorName !== "unarmored-defense") {
            const armorData = await getItemData(this.app, options, safeArmorName);
            if (armorData && armorData.category) {
                const category = String(armorData.category).toLowerCase();
                if (!category.includes("unarmored") && safeArmorName !== "unarmored-defense") {
                    isUnarmored = false;
                    if (category.includes("heavy")) {
                        isHeavyArmor = true;
                    }
                }
            } else {
                isUnarmored = false;
            }
        }

        // 2. Class & Subclass Speed Bonuses
        const classArray = Array.isArray(classInput)
            ? classInput.map(c => String(c || "").trim()).filter(Boolean)
            : (classInput ? [String(classInput).trim()].filter(Boolean) : []);

        const rawSubclassArray = Array.isArray(subclassInput) ? subclassInput : (subclassInput ? [subclassInput] : []);
        const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

        let classSpeedBonus = 0;

        for (let idx = 0; idx < classArray.length; idx++) {
            const className = classArray[idx];
            const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevelsInput) && classLevelsInput.length > idx)
                ? (Number(classLevelsInput[idx]) || 1)
                : parsedTotalLevel;

            const classData = await getClassData(this.app, options, className);
            if (!classData) continue;

            let subclassData: any = null;
            const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);
            if (grantedSubclassFile && subclassArray[idx]) {
                subclassData = await getSubclassData(this.app, options, grantedSubclassFile, String(subclassArray[idx]));
            }

            // Track highest speedMod by feature name so scaling features replace earlier tiers
            const featuresByName: Record<string, { speedMod: number; displayName: string }> = {};

            for (let lvl = 1; lvl <= currentClassLevel; lvl++) {
                const lvlFeatures = classData.features?.[lvl.toString()];
                if (Array.isArray(lvlFeatures)) {
                    for (const feature of lvlFeatures) {
                        if (feature && feature.speedMod !== undefined && !isNaN(Number(feature.speedMod))) {
                            const featKey = String(feature.name || "Speed Feature").trim().toLowerCase();
                            const val = Number(feature.speedMod);
                            if (!featuresByName[featKey] || val > featuresByName[featKey].speedMod) {
                                featuresByName[featKey] = {
                                    speedMod: val,
                                    displayName: String(feature.name || formatFeatureOrSlug(featKey))
                                };
                            }
                        }
                    }
                }

                if (subclassData) {
                    const subLvlFeatures = subclassData[lvl.toString()];
                    if (Array.isArray(subLvlFeatures)) {
                        for (const feature of subLvlFeatures) {
                            if (feature && feature.speedMod !== undefined && !isNaN(Number(feature.speedMod))) {
                                const featKey = String(feature.name || "Speed Feature").trim().toLowerCase();
                                const val = Number(feature.speedMod);
                                if (!featuresByName[featKey] || val > featuresByName[featKey].speedMod) {
                                    featuresByName[featKey] = {
                                        speedMod: val,
                                        displayName: String(feature.name || formatFeatureOrSlug(featKey))
                                    };
                                }
                            }
                        }
                    }
                }
            }

            for (const [featKey, featInfo] of Object.entries(featuresByName)) {
                let active = true;
                let reason: string | undefined = undefined;

                if (featKey.includes("unarmored movement")) {
                    if (!isUnarmored) {
                        active = false;
                        reason = "Disabled by Armor";
                    }
                } else if (featKey.includes("fast movement") || featKey.includes("roving")) {
                    if (isHeavyArmor) {
                        active = false;
                        reason = "Disabled by Heavy Armor";
                    }
                }

                if (active) {
                    classSpeedBonus += featInfo.speedMod;
                }

                breakdown.push({
                    source: `${featInfo.displayName} (${formatFeatureOrSlug(className)})`,
                    amount: featInfo.speedMod,
                    active,
                    reason
                });
            }
        }

        // 3. Feat Speed Bonuses
        let featSpeedBonus = 0;
        const allFeatIds: string[] = [];
        if (Array.isArray(extraFeatsInput)) {
            allFeatIds.push(...extraFeatsInput.map(String));
        } else if (typeof extraFeatsInput === "string" && extraFeatsInput.trim()) {
            const trimmed = extraFeatsInput.trim();
            if (trimmed.startsWith("[")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) allFeatIds.push(...parsed.map(String));
                } catch {
                    allFeatIds.push(...trimmed.split(",").map(s => s.trim()));
                }
            } else {
                allFeatIds.push(...trimmed.split(",").map(s => s.trim()));
            }
        }

        if (backgroundFeatInput) {
            const bgStr = String(backgroundFeatInput).trim();
            if (bgStr && !bgStr.startsWith("<")) allFeatIds.push(bgStr);
        }

        const uniqueFeatIds = [...new Set(allFeatIds.map(f => f.trim()).filter(f => f && !f.startsWith("<")))];

        for (const featId of uniqueFeatIds) {
            if (featId === "ability-score-improvement") continue;
            const featData = await getExtraFeat(this.app, options, featId);
            if (featData && featData.speedMod !== undefined && !isNaN(Number(featData.speedMod))) {
                const val = Number(featData.speedMod);
                featSpeedBonus += val;
                breakdown.push({
                    source: `${featData.name || formatFeatureOrSlug(featId)} (Feat)`,
                    amount: val,
                    active: true
                });
            }
        }

        // 4. Custom Speed Modifier
        if (customSpeedMod !== 0) {
            breakdown.push({
                source: "Custom / Miscellaneous Modifier",
                amount: customSpeedMod,
                active: true
            });
        }

        const totalSpeedMod = classSpeedBonus + featSpeedBonus + customSpeedMod;
        const totalSpeed = baseSpeed + totalSpeedMod;

        return {
            baseSpeed,
            classSpeedBonus,
            featSpeedBonus,
            customSpeedMod,
            totalSpeedMod,
            totalSpeed,
            breakdown
        };
    }

    /**
     * Resolves a character's total unlocked Weapon Mastery slots from:
     * 1. Class & Subclass features (`"weaponMastery": <number>`). Within a single class,
     *    if multiple unlocked features share the same `name` (e.g. "Weapon Mastery" at
     *    Level 1 with 2, and hidden "Weapon Mastery" at Level 4 with 3), the highest value
     *    replaces earlier tiers for that feature name. Different classes stack additively.
     * 2. Feats (`"weaponMastery": <number>`), including `extraFeats`, `backgroundFeat`,
     *    and auto-granted non-router feats from class/subclass features.
     */
    async resolveCharacterWeaponMasterySlots(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        extraFeatsInput: any,
        backgroundFeatInput: any,
        subclassInput?: any,
        fetchOptions?: any
    ): Promise<{ totalSlots: number; breakdown: { source: string; count: number }[] }> {
        const opts = fetchOptions || this.settings;
        const hasValid = (val: any): boolean => {
            if (val === undefined || val === null) return false;
            const s = String(val).trim();
            return s !== "" && !s.startsWith("<");
        };

        const breakdown: { source: string; count: number }[] = [];
        const classArray = classInput ? (Array.isArray(classInput) ? classInput.filter(hasValid) : (hasValid(classInput) ? [classInput] : [])) : [];
        const rawSubclassArray = subclassInput ? (Array.isArray(subclassInput) ? subclassInput.filter(hasValid) : (hasValid(subclassInput) ? [subclassInput] : [])) : [];
        const autoGrantedFeats: string[] = [];

        for (let idx = 0; idx < classArray.length; idx++) {
            const className = classArray[idx];
            const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevelsInput) && classLevelsInput.length > idx)
                ? Number(classLevelsInput[idx])
                : (Number(totalLevel) || 1);

            const classData = await getClassData(this.app, opts, className);
            if (!classData?.features) continue;

            let subclassData: any = null;
            const subName = rawSubclassArray[idx] || null;
            const grantedSubFile = this.findGrantedSubclass(classData, currentClassLevel);
            if (subName && grantedSubFile) {
                subclassData = await getSubclassData(this.app, opts, grantedSubFile, subName);
            }

            // Track highest weaponMastery count per feature name within this class
            const classFeatureMasteries = new Map<string, { displayName: string; count: number }>();

            for (let lvl = 1; lvl <= currentClassLevel; lvl++) {
                const lvlFeatures: any[] = [
                    ...(classData.features[lvl.toString()] || []),
                    ...(subclassData?.[lvl.toString()] || [])
                ];
                for (const feature of lvlFeatures) {
                    if (!feature) continue;
                    if (feature.weaponMastery !== undefined && !isNaN(Number(feature.weaponMastery))) {
                        const val = Math.max(0, Math.floor(Number(feature.weaponMastery)));
                        const fKey = String(feature.name || `feature-${lvl}`).trim().toLowerCase();
                        const prev = classFeatureMasteries.get(fKey);
                        if (!prev || val >= prev.count) {
                            classFeatureMasteries.set(fKey, {
                                displayName: `${classData.name || className}: ${feature.name || "Weapon Mastery"}`,
                                count: val
                            });
                        }
                    }

                    if (Array.isArray(feature.grantedFeats)) {
                        for (const gf of feature.grantedFeats) {
                            const gfStr = String(gf).trim();
                            if (gfStr && !gfStr.endsWith(".json") && gfStr.toLowerCase() !== "ability-score-improvement") {
                                autoGrantedFeats.push(gfStr);
                            }
                        }
                    }
                }
            }

            for (const entry of classFeatureMasteries.values()) {
                if (entry.count > 0) {
                    breakdown.push({ source: entry.displayName, count: entry.count });
                }
            }
        }

        // Gather all feats (extraFeats + backgroundFeat + auto-granted feats)
        const featList: string[] = [];
        const addFeat = (f: any) => {
            if (!hasValid(f)) return;
            const clean = String(f).trim();
            if (clean && !featList.some(existing => existing.toLowerCase() === clean.toLowerCase())) {
                featList.push(clean);
            }
        };

        if (Array.isArray(extraFeatsInput)) {
            extraFeatsInput.forEach(addFeat);
        } else if (typeof extraFeatsInput === "string" && extraFeatsInput.trim().startsWith("[")) {
            try {
                const parsed = JSON.parse(extraFeatsInput.trim());
                if (Array.isArray(parsed)) parsed.forEach(addFeat);
            } catch {
                addFeat(extraFeatsInput);
            }
        } else {
            addFeat(extraFeatsInput);
        }
        addFeat(backgroundFeatInput);
        autoGrantedFeats.forEach(addFeat);

        for (const featId of featList) {
            const featData = await getExtraFeat(this.app, opts, featId);
            if (!featData) continue;
            if (featData.weaponMastery !== undefined && !isNaN(Number(featData.weaponMastery))) {
                const val = Math.max(0, Math.floor(Number(featData.weaponMastery)));
                if (val > 0) {
                    breakdown.push({
                        source: `${featData.name || formatFeatureOrSlug(featId)} (Feat)`,
                        count: val
                    });
                }
            }
        }

        const totalSlots = breakdown.reduce((sum, item) => sum + item.count, 0);
        return { totalSlots, breakdown };
    }

    async processDnDFeaturesBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Create a Render Child to manage the lifecycle and reactivity
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        let isUpdatingFeatureUses = false;

        // 2. Wrap our entire rendering logic into a reusable function
        const renderContent = async () => {
            // Create a temporary wrapper to prevent UI flickering while awaiting data
            const wrapper = document.createElement('div');

            // Parse the user's code block using Obsidian's built-in YAML parser
            let blockData;
            try {
                blockData = parseYaml(source);
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            // 2. Fetch the frontmatter for the current active file
            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            // 3. Helper function to resolve "frontmatter.property" values
            const resolveValue = (val: any) => {
                if (typeof val === 'string') {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
                    if (trimmed.startsWith('frontmatter.')) {
                        const propName = trimmed.replace('frontmatter.', '').trim();
                        if (frontmatter[propName] !== undefined) return frontmatter[propName];
                        // Fallback for legacy template keys (level <-> DnD_level, DnD_Subclass <-> DnD_subclass, proficiencyBonus <-> DnD_proficiencyBonus)
                        if (propName === 'level') return frontmatter['DnD_level'];
                        if (propName === 'DnD_level') return frontmatter['level'];
                        if (propName === 'DnD_Subclass') return frontmatter['DnD_subclass'];
                        if (propName === 'DnD_subclass') return frontmatter['DnD_Subclass'];
                        if (propName === 'proficiencyBonus' || propName === 'proficiency_bonus') return frontmatter['DnD_proficiencyBonus'];
                        if (propName === 'DnD_proficiencyBonus') return frontmatter['proficiency_bonus'] ?? frontmatter['proficiencyBonus'];
                        return undefined;
                    }
                }
                return val;
            };

            // Helper to check if a resolved frontmatter/YAML value actually contains non-empty data
            const hasValidValue = (val: any): boolean => {
                if (val === undefined || val === null) return false;
                if (Array.isArray(val)) return val.some(item => hasValidValue(item));
                if (typeof val === 'string') {
                    const t = val.trim();
                    return t !== '' && t !== '[]' && !t.startsWith('<');
                }
                return true;
            };

            // 4. Resolve all core variables
            const level = resolveValue(blockData.level) ?? frontmatter['DnD_level'] ?? frontmatter['level'] ?? 1;
            const rawProficiencyBonus = resolveValue(blockData.proficiencyBonus ?? blockData['proficiency_bonus'])
                ?? frontmatter['DnD_proficiencyBonus']
                ?? frontmatter['proficiency_bonus'];
            const rawClass = resolveValue(blockData.class) ?? frontmatter['DnD_class'];
            const rawSubclass = resolveValue(blockData.subclass) ?? frontmatter['DnD_subclass'] ?? frontmatter['DnD_Subclass'];
            const classLevels = resolveValue(blockData['classLevels']) ?? frontmatter['DnD_classLevels'];
            const rawRace = resolveValue(blockData.race) ?? frontmatter['DnD_race'];
            const rawRaceLineage = resolveValue(blockData['raceLineage']) ?? frontmatter['DnD_raceLineage'];
            const rawBackground = resolveValue(blockData.background) ?? frontmatter['DnD_background'];
            const extraFeats = resolveValue(blockData['extraFeats']) ?? frontmatter['DnD_extraFeats'];

            const dndClass = hasValidValue(rawClass) ? rawClass : null;
            const subclass = hasValidValue(rawSubclass) ? rawSubclass : null;
            // Races, like classes, arrive as Obsidian lists (["Orc"]). Unwrap to the first valid
            // string so custom races (not in the bundled racesMap) resolve correctly in data.ts.
            const race = hasValidValue(rawRace)
                ? (Array.isArray(rawRace) ? String(rawRace.find(hasValidValue)).trim() : String(rawRace).trim())
                : null;
            const raceLineage = hasValidValue(rawRaceLineage)
                ? (Array.isArray(rawRaceLineage) ? String(rawRaceLineage.find(hasValidValue)).trim() : String(rawRaceLineage).trim())
                : null;
            const background = hasValidValue(rawBackground) ? rawBackground : null;

            let classChoicesRaw = resolveValue(blockData['classChoices']) ?? frontmatter['DnD_classChoices'];
            if (typeof classChoicesRaw === 'string' && classChoicesRaw.trim().startsWith('[')) {
                try { classChoicesRaw = JSON.parse(classChoicesRaw.trim()); } catch { classChoicesRaw = []; }
            }
            const classChoicesArray = Array.isArray(classChoicesRaw) ? classChoicesRaw : [];
            const hideRaw = resolveValue(blockData.hide) ?? frontmatter['DnD_hideFeature'];
            const edition = resolveValue(blockData.edition);

            const fetchOptions = {
                ...this.settings,
                edition: edition ? String(edition) : undefined
            };

            // Normalize the 'hide' variable into a clean array of lowercased strings
            let hiddenFeatures: string[] = [];
            let parsedHide = hideRaw;
            if (typeof parsedHide === 'string' && parsedHide.trim().startsWith('[')) {
                try { parsedHide = JSON.parse(parsedHide.trim()); } catch { parsedHide = []; }
            }
            if (Array.isArray(parsedHide)) {
                hiddenFeatures = parsedHide.map(name => String(name).toLowerCase().trim()).filter(Boolean);
            } else if (typeof parsedHide === 'string' && parsedHide.trim() !== '') {
                hiddenFeatures = parsedHide.split(',').map(name => String(name).toLowerCase().trim()).filter(Boolean);
            }

            // 5. Validate Multiclassing Levels & Ensure Numbers
            const parsedLevel = Number(level) || 0;
            const parsedProficiencyBonus = (hasValidValue(rawProficiencyBonus) && !isNaN(Number(rawProficiencyBonus)))
                ? Number(rawProficiencyBonus)
                : Math.ceil(1 + ((parsedLevel || 1) / 4));

            // 5.5. Parse featureUses array ([ ["<Feature/Feat-Name>", "UsesAvailable", "UsesUsed"], ... ])
            const rawFeatureUsesProp = blockData.featureUses ?? blockData['feature-uses'];
            let targetFeatureUsesFmKey = "DnD_featureUses";
            if (typeof rawFeatureUsesProp === "string") {
                const trimmedProp = rawFeatureUsesProp.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
                if (trimmedProp.startsWith("frontmatter.")) {
                    targetFeatureUsesFmKey = trimmedProp.replace("frontmatter.", "").trim() || "DnD_featureUses";
                }
            }

            let featureUsesRaw = resolveValue(rawFeatureUsesProp) ?? frontmatter[targetFeatureUsesFmKey];
            if (typeof featureUsesRaw === "string" && featureUsesRaw.trim().startsWith("[")) {
                try { featureUsesRaw = JSON.parse(featureUsesRaw.trim()); } catch { featureUsesRaw = []; }
            }

            const featureUsesState: { name: string; max: number; used: number }[] = [];
            if (Array.isArray(featureUsesRaw)) {
                for (const item of featureUsesRaw) {
                    const tuple = resolveValue(item);
                    if (Array.isArray(tuple) && tuple.length >= 3 && tuple[0]) {
                        const fName = String(tuple[0]).trim();
                        const fMax = Math.max(0, Number(String(tuple[1]).replace(/[^0-9.-]/g, "")) || 0);
                        const fUsed = Math.max(0, Number(String(tuple[2]).replace(/[^0-9.-]/g, "")) || 0);
                        if (fName) {
                            featureUsesState.push({
                                name: fName,
                                max: fMax,
                                used: fMax > 0 ? Math.min(fMax, fUsed) : fUsed
                            });
                        }
                    }
                }
            }

            let featureUsesNeedsSync = false;
            const saveFeatureUsesToFrontmatter = async () => {
                const serialized: [string, string, string][] = featureUsesState.map(entry => [
                    String(entry.name),
                    String(entry.max),
                    String(entry.used)
                ]);
                isUpdatingFeatureUses = true;
                try {
                    await this.updateCharacterFrontmatter(ctx.sourcePath, {
                        [targetFeatureUsesFmKey]: JSON.stringify(serialized)
                    });
                } finally {
                    setTimeout(() => { isUpdatingFeatureUses = false; }, 150);
                }
            };

            // Helper: Evaluate a feature's "uses" formula (supports blockData vars, frontmatter vars, and +, -, *, /)
            // When evaluating inside a Class or Subclass feature, `contextClassLevel` is passed (which already
            // cross-references `classLevels[index]` when multi-classing or falls back to `level`), so `"uses": "level"`
            // in a class JSON automatically uses that specific class's level!
            const evaluateFeatureUses = (rawUses: any, contextClassLevel?: number, contextClassIndex?: number): number => {
                if (Array.isArray(rawUses)) {
                    rawUses = rawUses[0];
                }
                if (rawUses === undefined || rawUses === null || rawUses === "") return 0;
                if (typeof rawUses === "number") return Math.max(0, Math.floor(rawUses));

                const exprStr = String(rawUses).trim();
                if (!exprStr) return 0;

                const resolveVariable = (ident: string): number => {
                    const cleanIdent = ident.trim();
                    if (cleanIdent === "proficiencyBonus" || cleanIdent === "proficiency_bonus" || cleanIdent === "DnD_proficiencyBonus") {
                        return parsedProficiencyBonus;
                    }
                    if (cleanIdent === "level" || cleanIdent === "DnD_level" || cleanIdent === "classLevels" || cleanIdent === "classLevel" || cleanIdent === "DnD_classLevels") {
                        if (contextClassLevel !== undefined) return Number(contextClassLevel) || 0;
                        if (Array.isArray(classLevels) && contextClassIndex !== undefined && classLevels.length > contextClassIndex) {
                            return Number(classLevels[contextClassIndex]) || 0;
                        }
                        return parsedLevel;
                    }

                    const modMatch = cleanIdent.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)(?:_?modifier|_?mod)$/i);
                    if (modMatch) {
                        const statAbbrMap: Record<string, string> = {
                            str: "strength", dex: "dexterity", con: "constitution",
                            int: "intelligence", wis: "wisdom", cha: "charisma"
                        };
                        const baseStat = statAbbrMap[modMatch[1].toLowerCase()] || modMatch[1].toLowerCase();
                        const rawStat = (blockData && (blockData[baseStat] ?? blockData[`DnD_${baseStat}`]) !== undefined)
                            ? resolveValue(blockData[baseStat] ?? blockData[`DnD_${baseStat}`])
                            : (frontmatter[`DnD_${baseStat}`] ?? frontmatter[baseStat]);
                        const score = Number(rawStat) || 10;
                        return Math.max(1, Math.floor((score - 10) / 2));
                    }

                    // 1. Check dnd-features code block variables first
                    if (blockData && blockData[cleanIdent] !== undefined) {
                        const resolved = resolveValue(blockData[cleanIdent]);
                        if (Array.isArray(resolved)) {
                            const picked = (contextClassIndex !== undefined && resolved.length > contextClassIndex)
                                ? resolved[contextClassIndex]
                                : resolved[0];
                            return Number(picked) || 0;
                        }
                        return Number(resolved) || 0;
                    }

                    // 2. Fallback to frontmatter variables (exact name or prefixed with DnD_)
                    const fmCandidate = frontmatter[cleanIdent] !== undefined
                        ? frontmatter[cleanIdent]
                        : frontmatter[`DnD_${cleanIdent}`];
                    if (fmCandidate !== undefined) {
                        if (Array.isArray(fmCandidate)) {
                            const picked = (contextClassIndex !== undefined && fmCandidate.length > contextClassIndex)
                                ? fmCandidate[contextClassIndex]
                                : fmCandidate[0];
                            return Number(picked) || 0;
                        }
                        return Number(fmCandidate) || 0;
                    }

                    return 0;
                };

                // Substitute all variable identifiers (supporting optional "frontmatter." prefix) with numeric values
                const numericExpr = exprStr.replace(/(?:frontmatter\.)?[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
                    const varName = match.startsWith("frontmatter.") ? match.slice("frontmatter.".length) : match;
                    return String(resolveVariable(varName));
                });

                // Tokenize numbers, +, -, *, /, (, )
                const tokens = numericExpr.match(/(\d+(?:\.\d+)?|\.\d+|[+\-*/()])/g);
                if (!tokens || tokens.length === 0) return 0;

                let pos = 0;
                const parseExpr = (): number => {
                    let val = parseTerm();
                    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
                        const op = tokens[pos++];
                        const right = parseTerm();
                        val = op === "+" ? val + right : val - right;
                    }
                    return val;
                };
                const parseTerm = (): number => {
                    let val = parseFactor();
                    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
                        const op = tokens[pos++];
                        const right = parseFactor();
                        val = op === "*" ? val * right : (right !== 0 ? val / right : 0);
                    }
                    return val;
                };
                const parseFactor = (): number => {
                    if (pos >= tokens.length) return 0;
                    const tok = tokens[pos];
                    if (tok === "+") {
                        pos++;
                        return parseFactor();
                    }
                    if (tok === "-") {
                        pos++;
                        return -parseFactor();
                    }
                    if (tok === "(") {
                        pos++;
                        const val = parseExpr();
                        if (pos < tokens.length && tokens[pos] === ")") pos++;
                        return val;
                    }
                    pos++;
                    const num = Number(tok);
                    return isNaN(num) ? 0 : num;
                };

                const result = parseExpr();
                if (!isFinite(result) || isNaN(result)) return 0;
                return Math.max(1, Math.floor(result));
            };

            // Helper: Render interactive Uses pips on the top-right of a feature/feat title bar
            const renderFeatureUses = (
                titleContainer: HTMLElement,
                featureObj: any,
                contextClassLevel?: number,
                contextClassIndex?: number
            ) => {
                if (!featureObj || featureObj.uses === undefined || featureObj.uses === null || featureObj.uses === "") return;
                const usesFormula = Array.isArray(featureObj.uses) ? featureObj.uses[0] : featureObj.uses;
                const restType: "short" | "long" = (Array.isArray(featureObj.uses) && String(featureObj.uses[1] || "").toLowerCase().trim() === "short")
                    ? "short"
                    : "long";
                const maxUses = evaluateFeatureUses(usesFormula, contextClassLevel, contextClassIndex);
                if (maxUses <= 0 || !featureObj.name) return;

                const cleanFeatureName = String(featureObj.name).trim();
                this.featureRestTypes.set(cleanFeatureName.toLowerCase(), restType);
                let stateEntry = featureUsesState.find(
                    e => e.name.toLowerCase() === cleanFeatureName.toLowerCase()
                );
                if (!stateEntry) {
                    stateEntry = { name: cleanFeatureName, max: maxUses, used: 0 };
                    featureUsesState.push(stateEntry);
                    featureUsesNeedsSync = true;
                } else {
                    const clampedUsed = Math.min(maxUses, Math.max(0, stateEntry.used));
                    if (stateEntry.max !== maxUses || stateEntry.used !== clampedUsed) {
                        stateEntry.max = maxUses;
                        stateEntry.used = clampedUsed;
                        featureUsesNeedsSync = true;
                    }
                }

                const usesTracker = titleContainer.createDiv({ cls: "dnd-feature-uses-tracker" });
                usesTracker.createEl("span", {
                    text: "Uses:",
                    cls: "dnd-spell-slots-label"
                });

                const pipsContainer = usesTracker.createDiv({ cls: "dnd-spell-slots-pips" });
                const pipStates: boolean[] = Array.from({ length: maxUses }, (_, idx) => idx < stateEntry!.used);

                const applyPipVisual = (pipEl: HTMLElement, active: boolean) => {
                    pipEl.classList.toggle("is-used", active);
                    pipEl.setAttribute("title", active ? "Tap to restore use" : "Tap to expend use");
                };

                for (let uIdx = 0; uIdx < maxUses; uIdx++) {
                    const pip = pipsContainer.createDiv({
                        cls: `dnd-slot-pip ${pipStates[uIdx] ? "is-used" : ""}`
                    });
                    applyPipVisual(pip, pipStates[uIdx]);

                    pip.addEventListener("pointerdown", async (e: PointerEvent) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        e.stopPropagation();

                        pipStates[uIdx] = !pipStates[uIdx];
                        applyPipVisual(pip, pipStates[uIdx]);

                        const newUsedCount = pipStates.filter(Boolean).length;
                        stateEntry!.used = newUsedCount;

                        await saveFeatureUsesToFrontmatter();
                    });
                }
            };

            if (Array.isArray(dndClass) && dndClass.length > 1) {
                if (!Array.isArray(classLevels) || classLevels.length !== dndClass.length) {
                    const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
                    errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
                    errorBox.createEl("p", {
                        text: `You have multiple classes listed, but the "class-levels" variable is missing or is invalid. Please provide a level for each class.`
                    });
                    el.empty();
                    el.appendChild(wrapper);
                    return;
                }

                const totalClassLevels = classLevels.reduce((sum, current) => sum + Number(current), 0);
                if (totalClassLevels !== parsedLevel) {
                    const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
                    errorBox.createEl("strong", { text: "D&D Features Plugin Error:" });
                    errorBox.createEl("p", {
                        text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${parsedLevel}).`
                    });
                    el.empty();
                    el.appendChild(wrapper);
                    return;
                }
            }

            // 6. Setup the Registry Lookup
            const classArray = dndClass ? (Array.isArray(dndClass) ? dndClass.filter(hasValidValue) : [dndClass]) : [];
            const rawSubclassArray = subclass ? (Array.isArray(subclass) ? subclass.filter(hasValidValue) : [subclass]) : [];
            const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

            // 7. PRE-PASS: Gather all auto-granted feats and determine dynamic subclass level
            let finalExtraFeats = Array.isArray(extraFeats) ? extraFeats.filter(hasValidValue) : (hasValidValue(extraFeats) ? [extraFeats] : []);
            let hasActiveSubclass = false;

            if (classArray.length > 0) {
                for (let index = 0; index < classArray.length; index++) {
                    const className = classArray[index];
                    const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                        ? Number(classLevels[index])
                        : Number(level);

                    const classData = await getClassData(this.app, fetchOptions, className);

                    if (classData && classData.features) {
                        const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);
                        let subclassData: any = null;

                        if (grantedSubclassFile && subclassArray[index]) {
                            subclassData = await getSubclassData(this.app, fetchOptions, grantedSubclassFile, subclassArray[index]);
                            if (subclassData) {
                                const levelKeys = Object.keys(subclassData).map(Number).filter(n => !isNaN(n));
                                const subclassStartLevel = levelKeys.length > 0 ? Math.min(...levelKeys) : 1;
                                if (currentClassLevel >= subclassStartLevel) {
                                    hasActiveSubclass = true;
                                }
                            }
                        }

                        for (let i = 1; i <= currentClassLevel; i++) {
                            const levelFeatures = classData.features[i.toString()];
                            if (levelFeatures) {
                                levelFeatures.forEach((feature: any) => {
                                    if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                        finalExtraFeats.push(...feature.grantedFeats);
                                    }
                                });
                            }

                            if (subclassData) {
                                const subLevelFeatures = subclassData[i.toString()];
                                if (subLevelFeatures) {
                                    subLevelFeatures.forEach((feature: any) => {
                                        if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                            finalExtraFeats.push(...feature.grantedFeats);
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Clean up the gathered feats to remove engine mechanics and router files
            const validFeats: string[] = [];
            for (const featId of finalExtraFeats) {
                if (!hasValidValue(featId) || featId === "ability-score-improvement") continue;

                const routerData = await getFeatMapData(this.app, fetchOptions, String(featId));
                const isRouter = !!routerData;

                if (!isRouter) {
                    validFeats.push(featId);
                }
            }

            finalExtraFeats = [...new Set(validFeats)];

            // Loop through the user's custom section order
            for (const sectionName of this.settings.sectionOrder) {
                if (sectionName === "Class" && classArray.length === 0) continue;
                if (sectionName === "Subclass" && (!subclass || this.settings.combineClassSubclass || !hasActiveSubclass)) continue;
                if (sectionName === "Race" && !race) continue;
                if (sectionName === "Background" && !background) continue;
                if (sectionName === "Extra Feats" && finalExtraFeats.length === 0) continue;

                let sectionTitle = `${sectionName} Features:`;
                if (sectionName === "Class" && this.settings.combineClassSubclass && hasActiveSubclass) sectionTitle = "Class & Subclass Features:";
                if (sectionName === "Race") sectionTitle = "Race Traits:";
                if (sectionName === "Background") sectionTitle = "Background Feat:";
                if (sectionName === "Extra Feats") sectionTitle = "Extra Feats:";

                // Build in a detached container first so we only append the section if it actually has content!
                const sectionWindow = document.createElement('div');
                sectionWindow.className = "dnd-features-window";
                const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });

                // Render Class Section
                if (sectionName === "Class") {
                    for (let index = 0; index < classArray.length; index++) {
                        const className = classArray[index];
                        const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                            ? Number(classLevels[index])
                            : Number(level);

                        const classData = await getClassData(this.app, fetchOptions, className);
                        if (!classData || !classData.features) continue;

                        if (classArray.length > 1) {
                            sectionDiv.createEl("h4", { text: `${className} Features (Level ${currentClassLevel})`, cls: "dnd-class-header" });
                        }

                        for (let i = 1; i <= currentClassLevel; i++) {
                            const levelFeatures = classData.features[i.toString()];

                            if (levelFeatures && levelFeatures.length > 0) {
                                for (const feature of levelFeatures) {
                                    if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                                    renderFeatureUses(titleContainer, feature, currentClassLevel, index);

                                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                    await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                }
                            }

                            for (const choiceTuple of classChoicesArray) {
                                let routerFile = "";
                                let choiceKey = "";
                                let choiceLevel = 0;

                                if (Array.isArray(choiceTuple)) {
                                    if (choiceTuple.length === 3) {
                                        [routerFile, choiceKey, choiceLevel] = choiceTuple;
                                    } else if (choiceTuple.length === 2) {
                                        [choiceKey, choiceLevel] = choiceTuple;
                                    }
                                }

                                if (Number(choiceLevel) === i && choiceKey) {
                                    const featureData = await getClassChoiceData(this.app, fetchOptions, choiceKey);
                                    if (featureData && featureData.name) {
                                        if (featureData.hide === true || (featureData.name && hiddenFeatures.includes(featureData.name.toLowerCase()))) continue;

                                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                        const badgeText = featureData.badge || "Choice";
                                        titleContainer.createEl("span", { text: badgeText, cls: "dnd-level-badge dnd-badge-combined" });
                                        titleContainer.createEl("span", { text: featureData.name, cls: "dnd-feature-name" });
                                        renderFeatureUses(titleContainer, featureData, currentClassLevel, index);

                                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                        await this.renderDndMarkdown(featureData.description, descDiv, ctx.sourcePath, renderChild);
                                    }
                                }
                            }

                            const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);
                            if (this.settings.combineClassSubclass && subclassArray[index] && grantedSubclassFile) {
                                const subclassName = subclassArray[index];
                                const subclassData = await getSubclassData(this.app, fetchOptions, grantedSubclassFile, subclassName);
                                const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;

                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
                                        if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                        titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge dnd-badge-combined" });
                                        titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                                        renderFeatureUses(titleContainer, feature, currentClassLevel, index);

                                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                        await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                    }
                                }
                            }
                        }
                    }
                }

                // Render Subclass Section
                else if (sectionName === "Subclass") {
                    for (let index = 0; index < classArray.length; index++) {
                        const className = classArray[index];
                        const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                            ? Number(classLevels[index])
                            : Number(level);
                        const subclassName = subclassArray[index];

                        const classData = await getClassData(this.app, fetchOptions, className);
                        const grantedSubclassFile = this.findGrantedSubclass(classData, currentClassLevel);

                        if (subclassName && classData && grantedSubclassFile) {
                            const subclassData = await getSubclassData(this.app, fetchOptions, grantedSubclassFile, subclassName);
                            if (!subclassData) continue;

                            if (classArray.length > 1) {
                                sectionDiv.createEl("h4", { text: `${subclassName} Features`, cls: "dnd-class-header" });
                            }

                            for (let i = 1; i <= currentClassLevel; i++) {
                                const subLevelFeatures = subclassData[i.toString()];
                                if (subLevelFeatures && subLevelFeatures.length > 0) {
                                    for (const feature of subLevelFeatures) {
                                        if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                        titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                        titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                                        renderFeatureUses(titleContainer, feature, currentClassLevel, index);

                                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                        await this.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                    }
                                }
                            }
                        }
                    }
                }

                // Render Race Section
                else if (sectionName === "Race") {
                    const raceData = await getRaceData(this.app, fetchOptions, race);

                    if (raceData && raceData.traits) {
                        for (const trait of raceData.traits) {
                            if (trait.hide === true || (trait.name && hiddenFeatures.includes(trait.name.toLowerCase()))) continue;

                            if (trait.lineage) {
                                if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) {
                                    continue;
                                }
                            }

                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            const defaultBadge = trait.lineage ? "Lineage" : "Trait";
                            const badgeClass = trait.lineage ? "dnd-level-badge dnd-badge-combined" : "dnd-level-badge";

                            titleContainer.createEl("span", { text: trait.badge ? trait.badge : defaultBadge, cls: badgeClass });
                            titleContainer.createEl("span", { text: trait.name, cls: "dnd-feature-name" });
                            renderFeatureUses(titleContainer, trait);

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(trait.description, descDiv, ctx.sourcePath, renderChild);
                        }
                    }
                }

                // Render Background Section
                else if (sectionName === "Background") {
                    const bgData = await getBackgroundData(this.app, fetchOptions, background);
                    const featData = bgData && bgData.feat ? await getExtraFeat(this.app, fetchOptions, bgData.feat) : null;

                    if (featData && featData.hide !== true && (!featData.name || !hiddenFeatures.includes(featData.name.toLowerCase()))) {
                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                        titleContainer.createEl("span", { text: "Origin Feat", cls: "dnd-level-badge" });
                        titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });
                        renderFeatureUses(titleContainer, featData);

                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                        await this.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                    }
                }

                // Render Extra Feats Section
                else if (sectionName === "Extra Feats") {
                    for (const featId of finalExtraFeats) {
                        const safeFeatId = typeof featId === 'string' ? featId : String(featId);
                        const featData = await getExtraFeat(this.app, fetchOptions, safeFeatId);

                        if (featData) {
                            if (featData.hide === true || (featData.name && hiddenFeatures.includes(featData.name.toLowerCase()))) continue;

                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            const badgeText = featData.badge ? featData.badge : (featData.category ? featData.category : "Feat");
                            titleContainer.createEl("span", { text: badgeText, cls: "dnd-level-badge" });
                            titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });
                            renderFeatureUses(titleContainer, featData);

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                        }
                    }
                }

                // ONLY append the header and window if at least one feature block was actually rendered!
                if (sectionDiv.querySelector(".dnd-feature-block")) {
                    wrapper.createEl("h3", { text: sectionTitle, cls: "dnd-section-header" });
                    wrapper.appendChild(sectionWindow);
                }
            }
            el.empty();
            el.appendChild(wrapper);

            // Auto-sync DnD_weaponMastery[0] (available slots) in frontmatter from class/subclass/feat JSONs
            const rawWeaponMasteryProp = blockData.weaponMastery ?? blockData['weapon-mastery'];
            let targetWeaponMasteryFmKey = "DnD_weaponMastery";
            if (typeof rawWeaponMasteryProp === "string") {
                const trimmedWmProp = rawWeaponMasteryProp.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
                if (trimmedWmProp.startsWith("frontmatter.")) {
                    targetWeaponMasteryFmKey = trimmedWmProp.replace("frontmatter.", "").trim() || "DnD_weaponMastery";
                }
            }

            const rawWmValue = resolveValue(rawWeaponMasteryProp) ?? frontmatter[targetWeaponMasteryFmKey];
            const currentMasteryState = parseWeaponMasteryState(rawWmValue);
            const bgDataForMastery = background ? await getBackgroundData(this.app, fetchOptions, background) : null;
            const bgFeatForMastery = bgDataForMastery?.feat || frontmatter["DnD_backgroundFeat"];
            const masteryCalc = await this.resolveCharacterWeaponMasterySlots(
                dndClass,
                classLevels,
                parsedLevel,
                finalExtraFeats,
                bgFeatForMastery,
                subclass,
                fetchOptions
            );
            const expectedSerializedMastery = serializeWeaponMasteryState(masteryCalc.totalSlots, currentMasteryState.mastered);
            const weaponMasteryNeedsSync = (
                currentMasteryState.available !== masteryCalc.totalSlots ||
                (rawWmValue !== undefined && String(rawWmValue).trim() !== expectedSerializedMastery && rawWeaponMasteryProp !== undefined)
            );

            if (featureUsesNeedsSync || weaponMasteryNeedsSync) {
                const fmUpdates: Record<string, any> = {};
                if (featureUsesNeedsSync) {
                    const serializedUses: [string, string, string][] = featureUsesState.map(entry => [
                        String(entry.name),
                        String(entry.max),
                        String(entry.used)
                    ]);
                    fmUpdates[targetFeatureUsesFmKey] = JSON.stringify(serializedUses);
                }
                if (weaponMasteryNeedsSync) {
                    fmUpdates[targetWeaponMasteryFmKey] = expectedSerializedMastery;
                }
                isUpdatingFeatureUses = true;
                try {
                    await this.updateCharacterFrontmatter(ctx.sourcePath, fmUpdates);
                } finally {
                    setTimeout(() => { isUpdatingFeatureUses = false; }, 150);
                }
            }
        };

        // 3. Initial Render
        renderContent();

        // 4. Register Event Listener for Frontmatter Changes
        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath && !isUpdatingFeatureUses) {
                    renderContent();
                }
            })
        );
    }

    async processDnDInventoryBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        let isUpdatingInventory = false;
        const expandedEditRows = new Set<string>();
        let activeResizeObservers: ResizeObserver[] = [];

        renderChild.register(() => {
            activeResizeObservers.forEach(obs => obs.disconnect());
        });

        // Helper: Inject clean inline SVG vector icons
        const setSvgIcon = (container: HTMLElement, iconType: "info" | "edit") => {
            if (iconType === "info") {
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            } else {
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
            }
        };

        const renderContent = async () => {
            activeResizeObservers.forEach(obs => obs.disconnect());
            activeResizeObservers = [];

            const wrapper = document.createElement('div');

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    blockData = parseYaml(source) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-inventory block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === 'string') {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
                    if (trimmed.startsWith('frontmatter.')) {
                        return frontmatter[trimmed.replace('frontmatter.', '').trim()];
                    }
                }
                return val;
            };

            const sanitizeItem = (val: any) => {
                if (!val) return null;
                return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
            };

            // 1. Resolve Core Variables strictly from the code block (with frontmatter fallbacks for dynamic Monk/Class calculations)
            const dndClass = resolveValue(blockData.class) ?? frontmatter["DnD_class"];
            const classLevels = resolveValue(blockData.classLevels ?? blockData['class-levels']) ?? frontmatter["DnD_classLevels"];
            const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"] ?? frontmatter["level"]) || 1;
            const background = resolveValue(blockData.background);
            const classEq = resolveValue(blockData.classEquipment ?? blockData['class-equipment']);
            const bgEq = resolveValue(blockData.backgroundEquipment ?? blockData['background-equipment']);
            const weaponSlot = resolveValue(blockData.weapon);
            const weaponDamage = resolveValue(blockData.weaponDamage ?? blockData['weapon_damage']);
            const weaponMasteryRaw = resolveValue(blockData.weaponMastery ?? blockData['weapon-mastery']) ?? frontmatter["DnD_weaponMastery"];
            const weaponMasteryState = parseWeaponMasteryState(weaponMasteryRaw);
            const armorSlot = resolveValue(blockData.armor);
            const armorAc = resolveValue(blockData.armorAc ?? blockData['armor_ac']);
            const edition = resolveValue(blockData.edition);

            const statsRecord: Record<string, number> = {
                strength: Number(resolveValue(blockData.strength) ?? frontmatter["DnD_strength"]) || 10,
                dexterity: Number(resolveValue(blockData.dexterity) ?? frontmatter["DnD_dexterity"]) || 10,
                constitution: Number(resolveValue(blockData.constitution) ?? frontmatter["DnD_constitution"]) || 10,
                intelligence: Number(resolveValue(blockData.intelligence) ?? frontmatter["DnD_intelligence"]) || 10,
                wisdom: Number(resolveValue(blockData.wisdom) ?? frontmatter["DnD_wisdom"]) || 10,
                charisma: Number(resolveValue(blockData.charisma) ?? frontmatter["DnD_charisma"]) || 10
            };
            const attackStat = String(resolveValue(blockData.attackStat) ?? frontmatter["DnD_attackStat"] ?? "strength");

            const fetchOptions = {
                ...this.settings,
                edition: edition ? String(edition) : undefined
            };

            // 2. Calculate Base Granted Gold from Class & Background Starting Equipment
            let grantedGold = 0;
            if (dndClass && classEq) {
                const primaryClass = Array.isArray(dndClass) ? dndClass[0] : dndClass;
                const classData = await getClassData(this.app, fetchOptions, primaryClass);
                const eqObj = classData?.startingEquipment?.[classEq];
                if (eqObj?.gold) grantedGold += Number(eqObj.gold) || 0;
            }
            if (background && bgEq) {
                const bgData = await getBackgroundData(this.app, fetchOptions, background);
                const eqObj = bgData?.startingEquipment?.[bgEq];
                if (eqObj?.gold) grantedGold += Number(eqObj.gold) || 0;
            }

            // 3. Parse Inventory Arrays strictly from blockData variables
            const parseJsonArray = (raw: any): any[] => {
                const resolved = resolveValue(raw);
                if (!resolved) return [];
                if (Array.isArray(resolved)) return resolved;
                if (typeof resolved === 'string' && resolved.trim().startsWith('[')) {
                    try { return JSON.parse(resolved.trim()); } catch { return []; }
                }
                return [];
            };

            // Helper to extract the target frontmatter key if a block property is mapped via "frontmatter.<Key>"
            const getTargetFmKey = (rawProp: any, fallbackKey: string): string => {
                if (typeof rawProp === 'string') {
                    const trimmed = rawProp.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
                    if (trimmed.startsWith('frontmatter.')) {
                        return trimmed.replace('frontmatter.', '').trim();
                    }
                }
                return fallbackKey;
            };

            const starterFmKey = getTargetFmKey(blockData.starterEquipment, "DnD_starterEquipment");
            const invItemsFmKey = getTargetFmKey(blockData.inventoryItems, "DnD_inventoryItems");
            const customItemsFmKey = getTargetFmKey(blockData.customItems, "DnD_customItems");
            const wealthAddedFmKey = getTargetFmKey(blockData.wealthAdded, "DnD_wealthAdded");
            const wealthSpentFmKey = getTargetFmKey(blockData.wealthSpent, "DnD_wealthSpent");

            // Structure: [ ["<item-id>", "<qty>", "<show: true/false>"], ... ]
            const rawStarter = parseJsonArray(blockData.starterEquipment);
            const rawInvItems = parseJsonArray(blockData.inventoryItems);
            // Structure: [ ["<Name>", "<qty>", "<show>", "<weight>", "<cost>", "<type>", "<description>"], ... ]
            const rawCustomItems = parseJsonArray(blockData.customItems);

            wrapper.createEl("h3", { text: "Equipment, Wealth & Items:", cls: "dnd-section-header" });

            // -----------------------------------------------------------
            // A. EQUIPPED WEAPON & ARMOR
            // -----------------------------------------------------------
            const cleanWeapon = weaponSlot ? String(weaponSlot).replace(/['"]/g, '').trim() : "";
            const cleanArmor = armorSlot ? String(armorSlot).replace(/['"]/g, '').trim() : "";
            const hasWeapon = cleanWeapon !== "" && cleanWeapon.toLowerCase() !== "none" && !cleanWeapon.startsWith("<");
            const hasArmor = cleanArmor !== "" && cleanArmor.toLowerCase() !== "none" && !cleanArmor.startsWith("<");

            if (hasWeapon || hasArmor) {
                const equipGrid = wrapper.createDiv({ cls: "dnd-equip-cards-grid" });

                const renderSlot = async (
                    rawItemInput: string,
                    manualStat: any,
                    expectedType: "Weapon" | "Armor"
                ) => {
                    if (!rawItemInput) return;
                    const safeName = sanitizeItem(rawItemInput) as string;
                    const data = await getItemData(this.app, fetchOptions, safeName);
                    const isRecognizedType = data && data.type && String(data.type).toLowerCase().includes(expectedType.toLowerCase());

                    let displayName = rawItemInput;
                    let displayStat = manualStat ? String(manualStat) : "-";
                    let displayDesc = "";

                    if (isRecognizedType) {
                        displayName = data.name || rawItemInput;
                        displayStat = manualStat ? String(manualStat) : (expectedType === "Weapon" ? (data.damage || "-") : (data.ac || "-"));
                        displayDesc = data.description || "";

                        if (expectedType === "Weapon" && data.mastery) {
                            const masteryInfo = await getWeaponMasteryDescription(this.app, fetchOptions, data.mastery);
                            if (masteryInfo) {
                                const displaySlug = sanitizeItem(displayName) as string;
                                const isMastered = weaponMasteryState.mastered.includes(safeName) || (displaySlug ? weaponMasteryState.mastered.includes(displaySlug) : false);
                                const masteryLine = isMastered
                                    ? `**Mastery ([${masteryInfo.name}](note:weapon-masteries))**: ${masteryInfo.description}`
                                    : `Mastery: [${masteryInfo.name}](note:weapon-masteries)`;
                                displayDesc = displayDesc ? `${displayDesc}\n\n${masteryLine}` : masteryLine;
                            }
                        }
                    }

                    // Dynamic calculation for "Unarmed Strike" (scalingDice + ability modifier) and "Unarmored Defense" (10 + class modifiers)
                    if (expectedType === "Weapon" && (safeName === "unarmed-strike" || safeName === "unarmed-strikes")) {
                        displayStat = await this.resolveUnarmedStrikeDamage(dndClass, classLevels, level, statsRecord, attackStat, fetchOptions);
                    } else if (expectedType === "Armor" && safeName === "unarmored-defense") {
                        const unarmoredCalc = await this.resolveUnarmoredDefense(dndClass, classLevels, level, statsRecord, fetchOptions);
                        displayStat = String(unarmoredCalc.totalAc);
                    }

                    const card = equipGrid.createDiv({ cls: "dnd-features-window dnd-equip-card" });
                    card.createDiv({ text: displayName.toUpperCase(), cls: "dnd-equip-card-title" });
                    card.createDiv({ text: displayStat, cls: "dnd-equip-card-stat" });

                    if (displayDesc) {
                        const noteDiv = card.createDiv({ cls: "dnd-equip-card-desc" });
                        await this.renderDndMarkdown(displayDesc, noteDiv, ctx.sourcePath, renderChild);
                    }
                };

                if (hasWeapon) await renderSlot(cleanWeapon, weaponDamage, "Weapon");
                if (hasArmor) await renderSlot(cleanArmor, armorAc, "Armor");
            }

            // -----------------------------------------------------------
            // B. 4-CURRENCY WEALTH ([ "<platinum>", "<gold>", "<silver>", "<copper>" ])
            // -----------------------------------------------------------
            const parseWealthTuple = (raw: any): number[] => {
                const arr = parseJsonArray(raw);
                return [
                    Number(arr[0]) || 0,
                    Number(arr[1]) || 0,
                    Number(arr[2]) || 0,
                    Number(arr[3]) || 0
                ];
            };

            const wealthAdded = parseWealthTuple(blockData.wealthAdded);
            const wealthSpent = parseWealthTuple(blockData.wealthSpent);
            const baseWealth = [0, grantedGold, 0, 0];

            const CURRENCIES = [
                { name: "Platinum", abbr: "PP", idx: 0 },
                { name: "Gold", abbr: "GP", idx: 1 },
                { name: "Silver", abbr: "SP", idx: 2 },
                { name: "Copper", abbr: "CP", idx: 3 }
            ];

            // Single unified outer container for all 4 currencies
            const wealthWindow = wrapper.createDiv({ cls: "dnd-features-window dnd-wealth-window" });
            const wealthGrid = wealthWindow.createDiv({ cls: "dnd-wealth-grid" });

            const updateWealthGridCols = () => {
                const w = wealthGrid.clientWidth;
                if (w <= 0) return;
                wealthGrid.classList.toggle("is-1col", w < 380);
                wealthGrid.classList.toggle("is-2col", w >= 380 && w < 680);
            };
            const wealthObserver = new ResizeObserver(() => updateWealthGridCols());
            wealthObserver.observe(wealthGrid);
            activeResizeObservers.push(wealthObserver);

            for (const curr of CURRENCIES) {
                let currentTotal = baseWealth[curr.idx] + wealthAdded[curr.idx] - wealthSpent[curr.idx];

                const currCard = wealthGrid.createDiv({ cls: "dnd-wealth-cell" });

                const topRow = currCard.createDiv({ cls: "dnd-wealth-top" });
                topRow.createEl("span", { text: curr.name, cls: "dnd-level-badge dnd-wealth-badge" });
                const totalValueEl = topRow.createEl("strong", {
                    text: `${currentTotal} ${curr.abbr}`,
                    cls: "dnd-wealth-total"
                });

                const controlsRow = currCard.createDiv({ cls: "dnd-wealth-controls" });
                const amtInput = controlsRow.createEl("input", {
                    type: "number",
                    value: "1",
                    cls: "dnd-wealth-input",
                    attr: { min: "1" }
                });

                const addBtn = controlsRow.createEl("button", { text: "Add", cls: "dnd-wealth-btn" });
                const spendBtn = controlsRow.createEl("button", { text: "Spend", cls: "dnd-wealth-btn" });

                addBtn.onclick = async () => {
                    const amt = Math.max(0, Number(amtInput.value) || 0);
                    if (amt <= 0) return;
                    currentTotal += amt;
                    totalValueEl.setText(`${currentTotal} ${curr.abbr}`);
                    isUpdatingInventory = true;
                    try {
                        await this.updateWealthFrontmatter(ctx.sourcePath, wealthAddedFmKey, curr.idx, amt);
                    } finally {
                        setTimeout(() => { isUpdatingInventory = false; }, 150);
                    }
                };

                spendBtn.onclick = async () => {
                    const amt = Math.max(0, Number(amtInput.value) || 0);
                    if (amt <= 0) return;
                    currentTotal -= amt;
                    totalValueEl.setText(`${currentTotal} ${curr.abbr}`);
                    isUpdatingInventory = true;
                    try {
                        await this.updateWealthFrontmatter(ctx.sourcePath, wealthSpentFmKey, curr.idx, amt);
                    } finally {
                        setTimeout(() => { isUpdatingInventory = false; }, 150);
                    }
                };
            }

            // -----------------------------------------------------------
            // C. BACKPACK CONTENTS (3-Column Desktop / 1-Column Mobile)
            // -----------------------------------------------------------
            const backpackWindow = wrapper.createDiv({ cls: "dnd-features-window" });

            const backpackHeader = backpackWindow.createDiv({ cls: "dnd-class-header dnd-backpack-header" });
            backpackHeader.createEl("h4", { text: "Backpack Contents", cls: "dnd-backpack-title" });

            const weightTracker = backpackHeader.createEl("span", {
                text: "Weight: 0 lbs",
                cls: "dnd-backpack-weight"
            });

            interface RenderableInventoryItem {
                rowKey: string;
                sourceType: "starter" | "rulebook" | "custom";
                arrayIndex: number;
                idOrName: string;
                displayName: string;
                qty: number;
                show: boolean;
                unitWeight: number;
                costRaw: string;
                rulebookData: any | null;
            }

            const itemsToRender: RenderableInventoryItem[] = [];

            // 1. Gather Starter Equipment
            for (let i = 0; i < rawStarter.length; i++) {
                const entry = rawStarter[i];
                if (!Array.isArray(entry) || entry.length < 2) continue;
                const itemId = String(entry[0]).trim();
                if (!itemId || itemId.startsWith("<")) continue;
                const qty = Math.max(0, Number(entry[1]) || 0);
                const show = entry.length >= 3 ? String(entry[2]).toLowerCase() !== "false" : true;
                if (!show) continue;

                const data = await getItemData(this.app, fetchOptions, itemId);
                const fallbackName = itemId.replace(/\b\w/g, c => c.toUpperCase()).replace(/-/g, ' ');
                itemsToRender.push({
                    rowKey: `starter_${i}_${itemId}`,
                    sourceType: "starter",
                    arrayIndex: i,
                    idOrName: itemId,
                    displayName: data?.name || fallbackName,
                    qty,
                    show,
                    unitWeight: Number(data?.weight) || 0,
                    costRaw: data?.cost !== undefined ? String(data.cost) : "",
                    rulebookData: data || null
                });
            }

            // 2. Gather Added Rulebook / Custom-Rulebook Items
            for (let i = 0; i < rawInvItems.length; i++) {
                const entry = rawInvItems[i];
                if (!Array.isArray(entry) || entry.length < 2) continue;
                const itemId = String(entry[0]).trim();
                if (!itemId || itemId.startsWith("<")) continue;
                const qty = Math.max(0, Number(entry[1]) || 0);
                const show = entry.length >= 3 ? String(entry[2]).toLowerCase() !== "false" : true;
                if (!show) continue;

                const data = await getItemData(this.app, fetchOptions, itemId);
                const fallbackName = itemId.replace(/\b\w/g, c => c.toUpperCase()).replace(/-/g, ' ');
                itemsToRender.push({
                    rowKey: `rulebook_${i}_${itemId}`,
                    sourceType: "rulebook",
                    arrayIndex: i,
                    idOrName: itemId,
                    displayName: data?.name || fallbackName,
                    qty,
                    show,
                    unitWeight: Number(data?.weight) || 0,
                    costRaw: data?.cost !== undefined ? String(data.cost) : "",
                    rulebookData: data || null
                });
            }

            // 3. Gather On-the-Fly Custom UI Items
            for (let i = 0; i < rawCustomItems.length; i++) {
                const entry = rawCustomItems[i];
                if (!Array.isArray(entry) || entry.length < 2) continue;
                const customName = String(entry[0]).trim();
                if (!customName || customName.startsWith("<")) continue;
                const qty = Math.max(0, Number(entry[1]) || 0);
                const show = entry.length >= 3 ? String(entry[2]).toLowerCase() !== "false" : true;
                if (!show) continue;

                const unitWeight = Number(entry[3]) || 0;
                const costRaw = String(entry[4] ?? "").trim();
                const customType = String(entry[5] ?? "Custom").trim() || "Custom";
                const customDesc = String(entry[6] ?? "").trim();

                itemsToRender.push({
                    rowKey: `custom_${i}_${customName}`,
                    sourceType: "custom",
                    arrayIndex: i,
                    idOrName: customName,
                    displayName: customName,
                    qty,
                    show,
                    unitWeight,
                    costRaw,
                    rulebookData: {
                        name: customName,
                        type: customType,
                        weight: unitWeight,
                        cost: costRaw,
                        description: customDesc
                    }
                });
            }

            const recalculateTotalWeight = () => {
                const totalWeight = itemsToRender.reduce((sum, it) => sum + (it.unitWeight * it.qty), 0);
                weightTracker.setText(`Weight: ${totalWeight % 1 === 0 ? totalWeight : totalWeight.toFixed(1)} lbs`);
            };

            const saveItemQuantity = async (item: RenderableInventoryItem, newQty: number) => {
                isUpdatingInventory = true;
                try {
                    if (item.sourceType === "starter" && Array.isArray(rawStarter[item.arrayIndex])) {
                        rawStarter[item.arrayIndex] = [
                            String(rawStarter[item.arrayIndex][0]),
                            String(newQty),
                            String(rawStarter[item.arrayIndex][2] ?? "true")
                        ];
                        await this.updateCharacterFrontmatter(ctx.sourcePath, {
                            [starterFmKey]: JSON.stringify(rawStarter)
                        });
                    } else if (item.sourceType === "rulebook" && Array.isArray(rawInvItems[item.arrayIndex])) {
                        rawInvItems[item.arrayIndex] = [
                            String(rawInvItems[item.arrayIndex][0]),
                            String(newQty),
                            String(rawInvItems[item.arrayIndex][2] ?? "true")
                        ];
                        await this.updateCharacterFrontmatter(ctx.sourcePath, {
                            [invItemsFmKey]: JSON.stringify(rawInvItems)
                        });
                    } else if (item.sourceType === "custom" && Array.isArray(rawCustomItems[item.arrayIndex])) {
                        const existing = rawCustomItems[item.arrayIndex];
                        rawCustomItems[item.arrayIndex] = [
                            String(existing[0] ?? ""),
                            String(newQty),
                            String(existing[2] ?? "true"),
                            String(existing[3] ?? "0"),
                            String(existing[4] ?? "0"),
                            String(existing[5] ?? "Gear"),
                            String(existing[6] ?? "")
                        ];
                        await this.updateCharacterFrontmatter(ctx.sourcePath, {
                            [customItemsFmKey]: JSON.stringify(rawCustomItems)
                        });
                    }
                } finally {
                    setTimeout(() => { isUpdatingInventory = false; }, 150);
                }
            };

            if (itemsToRender.length === 0) {
                backpackWindow.createEl("p", {
                    text: "No visible items in backpack. Click the 🎒 Inventory button to manage or add items!",
                    cls: "dnd-backpack-empty"
                });
            } else {
                const gridContainer = backpackWindow.createDiv({ cls: "dnd-inventory-grid" });

                const updateBackpackCols = () => {
                    const w = gridContainer.clientWidth;
                    if (w <= 0) return;
                    gridContainer.classList.toggle("is-1col", w < 580);
                };
                const bpObserver = new ResizeObserver(() => updateBackpackCols());
                bpObserver.observe(gridContainer);
                activeResizeObservers.push(bpObserver);

                for (const item of itemsToRender) {
                    const itemRow = gridContainer.createDiv({ cls: "dnd-inventory-row" });

                    // Left Group: [xQty] Badge + Name + Weight/Cost
                    const leftGroup = itemRow.createDiv({ cls: "dnd-inventory-left" });

                    const qtyBadge = leftGroup.createEl("span", {
                        text: `x${item.qty}`,
                        cls: "dnd-level-badge dnd-inventory-qty-badge"
                    });

                    const hasStats = item.unitWeight > 0 || hasItemCost(item.costRaw);
                    leftGroup.createEl("strong", {
                        text: item.displayName + (hasStats ? ": " : ""),
                        cls: "dnd-inventory-name"
                    });

                    const statsSpan = leftGroup.createEl("span", { cls: "dnd-inventory-stats" });

                    const updateStatsText = () => {
                        const parts: string[] = [];
                        if (item.unitWeight > 0) {
                            const w = item.unitWeight * item.qty;
                            parts.push(`${w % 1 === 0 ? w : w.toFixed(1)}lbs`);
                        }
                        if (hasItemCost(item.costRaw)) {
                            parts.push(formatItemCost(item.costRaw, true));
                        }
                        statsSpan.setText(parts.join(", "));
                    };
                    updateStatsText();

                    // Right Group: Optional Stepper (- / +) + Info Vector Button + Edit Vector Button
                    const rightActions = itemRow.createDiv({ cls: "dnd-inventory-actions" });

                    const isExpanded = expandedEditRows.has(item.rowKey);
                    const stepperGroup = rightActions.createDiv({
                        cls: `dnd-inventory-stepper ${isExpanded ? "is-open" : ""}`
                    });

                    const minusBtn = stepperGroup.createEl("button", {
                        text: "−",
                        cls: "dnd-inventory-step-btn",
                        attr: { title: "Decrease Quantity" }
                    });

                    const plusBtn = stepperGroup.createEl("button", {
                        text: "+",
                        cls: "dnd-inventory-step-btn",
                        attr: { title: "Increase Quantity" }
                    });

                    minusBtn.addEventListener("pointerdown", async (e: PointerEvent) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (item.qty <= 0) return;
                        item.qty -= 1;
                        qtyBadge.setText(`x${item.qty}`);
                        updateStatsText();
                        recalculateTotalWeight();
                        await saveItemQuantity(item, item.qty);
                    });

                    plusBtn.addEventListener("pointerdown", async (e: PointerEvent) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        e.stopPropagation();
                        item.qty += 1;
                        qtyBadge.setText(`x${item.qty}`);
                        updateStatsText();
                        recalculateTotalWeight();
                        await saveItemQuantity(item, item.qty);
                    });

                    // 1. Info Button (Vector SVG) - For Rulebook items and Custom items with a description
                    if (item.rulebookData && (item.sourceType !== "custom" || Boolean(item.rulebookData.description))) {
                        const infoBtn = rightActions.createEl("button", {
                            cls: "dnd-inventory-icon-btn",
                            attr: { title: "Item Details" }
                        });
                        setSvgIcon(infoBtn, "info");
                        infoBtn.onclick = (e) => {
                            e.stopPropagation();
                            new ItemInfoModal(this.app, this, item.rulebookData, ctx.sourcePath).open();
                        };
                    }

                    // 2. Edit Button (Vector SVG) - Toggles - / + stepper buttons
                    const editBtn = rightActions.createEl("button", {
                        cls: `dnd-inventory-icon-btn ${isExpanded ? "is-active" : ""}`,
                        attr: { title: "Adjust Quantity" }
                    });
                    setSvgIcon(editBtn, "edit");
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        const nowOpen = !stepperGroup.classList.contains("is-open");
                        stepperGroup.classList.toggle("is-open", nowOpen);
                        editBtn.classList.toggle("is-active", nowOpen);
                        if (nowOpen) {
                            expandedEditRows.add(item.rowKey);
                        } else {
                            expandedEditRows.delete(item.rowKey);
                        }
                    };
                }

                requestAnimationFrame(() => updateBackpackCols());
            }

            recalculateTotalWeight();
            el.empty();
            el.appendChild(wrapper);
            requestAnimationFrame(() => updateWealthGridCols());
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath && !isUpdatingInventory) renderContent();
            })
        );
    }

    async processDnDRulesBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Create a Render Child to manage the lifecycle and reactivity
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // 2. Wrap our entire rendering logic into a reusable function
        const renderContent = async () => {
            // Create a temporary wrapper to prevent UI flickering while awaiting data
            const wrapper = document.createElement('div');

            // Parse the user's code block using Obsidian's built-in YAML parser
            let blockData;
            try {
                blockData = parseYaml(source);
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-rules block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
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
            const hbRule = resolveValue(blockData.rules);
            const edition = resolveValue(blockData.edition);

            const fetchOptions = {
                ...this.settings,
                edition: edition ? String(edition) : undefined
            };

            // 6. Setup the Registry Lookup (Preparation for Data Fetching)
            const rulesArray = Array.isArray(hbRule) ? hbRule : (hbRule ? [hbRule] : []);

            if (rulesArray.length > 0) {
                const sectionWindow = wrapper.createDiv({ cls: "dnd-features-window" });
                const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-rules` });

                for (const ruleKey of rulesArray) {
                    const ruleData = await getRuleData(this.app, fetchOptions, ruleKey);

                    // Fix 2: Check for ruleData.rules instead of ruleData.rule
                    if (ruleData && ruleData.rules) {
                        // Use the JSON's main name for the header, or fallback to the key
                        const headerName = ruleData.name ? ruleData.name : ruleKey;
                        sectionDiv.createEl("h4", { text: `${headerName}:`, cls: "dnd-class-header" });

                        for (const rule of ruleData.rules) {
                            const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                            const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                            titleContainer.createEl("span", { text: rule.badge ? rule.badge : "Rule", cls: "dnd-level-badge" });
                            titleContainer.createEl("span", { text: rule.name, cls: "dnd-feature-name" });

                            const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                            await this.renderDndMarkdown(rule.description, descDiv, ctx.sourcePath, renderChild);
                        }
                    } else {
                        sectionDiv.createEl("p", { text: `Data for rule "${ruleKey}" not found.`, cls: "dnd-error-text" });
                    }
                }
            }

            // Fix 3: Actually append the fully built wrapper to Obsidian's element
            el.empty();
            el.appendChild(wrapper);
        };
        renderContent();
        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDControlsBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // 1. Parse the YAML options (e.g., align: right-up)
        let blockData: Record<string, any> = {};
        try {
            if (source.trim()) {
                blockData = parseYaml(source) || {};
            }
        } catch (error) {
            el.createEl("p", { text: "Error: Invalid YAML in dnd-controls block.", cls: "dnd-error-text" });
            return;
        }

        // 2. Fetch the frontmatter for the active file to check for spellcasting
        const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        // 3. Determine Alignment & Line Shifting via CSS Modifier Classes
        const alignClassMap: Record<string, string> = {
            "right": "align-right",
            "center": "align-center",
            "right-up": "align-right-up",
            "right-down": "align-right-down"
        };
        const alignCls = alignClassMap[String(blockData.align || "").toLowerCase()] || "";

        // 4. Create the Button Container
        const container = el.createDiv({
            cls: `dnd-controls ${alignCls}`.trim()
        });

        // 5. Create the Buttons
        const addExpBtn = container.createEl("button", { text: "🗡️ Level Up", cls: "mod-cta" });
        addExpBtn.onclick = () => {
            new LevelUpModal(this.app, this, ctx.sourcePath).open();
        };

        const equipItemsBtn = container.createEl("button", { text: "⚔️ Equip Items" });
        equipItemsBtn.onclick = () => {
            new EquipItemsModal(this.app, this, ctx.sourcePath).open();
        };

        const inventoryBtn = container.createEl("button", { text: "🎒 Inventory" });
        inventoryBtn.onclick = () => {
            new InventoryModal(this.app, this, ctx.sourcePath).open();
        };

        const manageCharBtn = container.createEl("button", { text: "⚙️ Manage Character" });
        manageCharBtn.onclick = () => {
            new ManageCharacterModal(this.app, this, ctx.sourcePath).open();
        };

        // Conditionally render the Spellbook button ONLY if DnD_spellcastingAbility exists in frontmatter
        if (frontmatter["DnD_spellcastingAbility"]) {
            const spellbookBtn = container.createEl("button", { text: "📖 Spellbook" });
            spellbookBtn.onclick = () => {
                new SpellbookModal(this.app, this, ctx.sourcePath).open();
            };
        }
    }

    // Helper: Reads a spell or spell router from the bundled registry (or customRulebookPath)
    async loadSpellFile(fileNameWithoutExt: string): Promise<any | null> {
        return await getSpellData(this.app, this.settings, fileNameWithoutExt);
    }

    async processDnDSpellsBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // Create a single reusable hover tooltip for this block
        const tooltipWindow = document.body.createDiv({
            cls: "dnd-spell-tooltip"
        });
        renderChild.register(() => tooltipWindow.remove());

        let isUpdatingSlots = false;

        const renderContent = async () => {
            const wrapper = document.createElement('div');

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    blockData = parseYaml(source) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid format in dnd-spells block.", cls: "dnd-error" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            // Standard helper: Only reads from frontmatter if the user explicitly writes "frontmatter.<key>"
            const resolveValue = (val: any) => {
                if (typeof val === 'string') {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith('frontmatter.')) {
                        return frontmatter[trimmed.replace('frontmatter.', '')];
                    }
                }
                return val;
            };

            // 1. Resolve spellcastingAbility strictly from the code block variable
            const spellcastingAbility = resolveValue(blockData.spellcastingAbility) || "";

            // --- HIDE-AND-SHOW LOGIC ---
            // If the character has no spellcasting ability, completely abort rendering.
            if (!spellcastingAbility || String(spellcastingAbility).trim().startsWith("<")) {
                el.empty();
                return;
            }

            const spellAbilityKey = String(spellcastingAbility).toLowerCase().trim();
            const abilityScore = Number(resolveValue(blockData[spellAbilityKey]) ?? frontmatter[`DnD_${spellAbilityKey}`]) || 10;
            const abilityMod = Math.floor((abilityScore - 10) / 2);
            const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
            const DnD_proficiency_bonus = Number(
                resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
            ) || Math.ceil(1 + (level / 4));

            const spellSaveDc = 8 + DnD_proficiency_bonus + abilityMod;
            const spellAttackMod = DnD_proficiency_bonus + abilityMod;
            const spellAttackStr = spellAttackMod >= 0 ? `+${spellAttackMod}` : `${spellAttackMod}`;

            // 2. Parse Known & Prepared Spells Tuples strictly from blockData.spells & blockData.preparedSpells
            const parseTuples = (raw: any): Record<string, string[]> => {
                const map: Record<string, string[]> = {};
                if (raw === undefined || raw === null) return map;
                let parsed = resolveValue(raw);
                if (typeof parsed === "string") {
                    const trimmed = parsed.trim();
                    if (trimmed.startsWith("[")) {
                        try { parsed = JSON.parse(trimmed); } catch { parsed = []; }
                    } else {
                        parsed = [];
                    }
                }
                if (Array.isArray(parsed)) {
                    for (const rawEntry of parsed) {
                        const entry = resolveValue(rawEntry);
                        if (Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[0])) {
                            map[String(entry[1])] = entry[0].map((s: any) => String(s));
                        }
                    }
                }
                return map;
            };

            const knownMap = parseTuples(blockData.spells);
            const preparedMap = parseTuples(blockData.preparedSpells);

            const hasAnyPrepared = Object.values(preparedMap).some(list => list.length > 0);
            const showAll = String(blockData.show || "").toLowerCase() === "all" || !hasAnyPrepared;
            const activeMap = showAll ? knownMap : preparedMap;

            // 3. Parse Consolidated 9-Element Spell Slots Array strictly from blockData.spellSlots (or spellsSlots)
            // Structure: [ ["<Spell-Slots>", "<Used-Spell-Slots>"], ... (9 items for Levels 1-9) ]
            const rawSpellSlotsProp = blockData.spellSlots ?? blockData.spellsSlots;
            const parseAllSpellSlots = (rawInput: any): { max: number; used: number }[] => {
                const defaultSlots = Array.from({ length: 9 }, () => ({ max: 0, used: 0 }));
                if (rawInput === undefined || rawInput === null || rawInput === "") return defaultSlots;

                let parsed = resolveValue(rawInput);
                if (typeof parsed === "string") {
                    const trimmed = parsed.trim();
                    if (trimmed.startsWith("[")) {
                        try { parsed = JSON.parse(trimmed); } catch { parsed = []; }
                    } else {
                        return defaultSlots;
                    }
                }

                if (Array.isArray(parsed)) {
                    for (let i = 0; i < 9; i++) {
                        const pair = resolveValue(parsed[i]);
                        if (Array.isArray(pair) && pair.length >= 2) {
                            const max = Number(String(pair[0]).replace(/[^0-9]/g, "")) || 0;
                            const used = Math.min(max, Math.max(0, Number(String(pair[1]).replace(/[^0-9]/g, "")) || 0));
                            defaultSlots[i] = { max, used };
                        }
                    }
                }
                return defaultSlots;
            };

            const slotsArray = parseAllSpellSlots(rawSpellSlotsProp);

            // Determine which frontmatter key to update when clicking a spell slot pip (defaulting to DnD_spellSlots)
            let targetSlotsFmKey = "DnD_spellSlots";
            if (typeof rawSpellSlotsProp === "string" && rawSpellSlotsProp.trim().startsWith("frontmatter.")) {
                targetSlotsFmKey = rawSpellSlotsProp.trim().replace("frontmatter.", "");
            }

            // Gather all levels that either have spells OR have > 0 max spell slots in the 9-element array
            const levelSet = new Set<string>(
                Object.keys(activeMap).filter(lvl => Array.isArray(activeMap[lvl]) && activeMap[lvl].length > 0)
            );
            for (let i = 0; i < 9; i++) {
                if (slotsArray[i].max > 0) {
                    levelSet.add(String(i + 1));
                }
            }

            const sortedLevels = Array.from(levelSet).sort((a, b) => Number(a) - Number(b));

            wrapper.createEl("h3", { text: "Spellbook & Prepared Spells:", cls: "dnd-section-header" });

            if (sortedLevels.length === 0) {
                const emptyWindow = wrapper.createDiv({ cls: "dnd-features-window" });
                emptyWindow.createEl("p", {
                    text: "No spells prepared or added yet. Click the 📖 Spellbook button to manage your spells!",
                    cls: "dnd-spells-empty"
                });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            // 4. Render Outer Container Window
            const spellsWindow = wrapper.createDiv({ cls: "dnd-spells-window" });

            for (const lvl of sortedLevels) {
                const spellKeys = activeMap[lvl] || [];
                const preparedForLevel = preparedMap[lvl] || [];

                const isCantrip = String(lvl).toLowerCase().startsWith("cantrip") || lvl === "0";
                const levelHeaderTitle = isCantrip ? "Cantrips" : `Level ${lvl} Spells`;

                const levelHeader = spellsWindow.createDiv({ cls: "dnd-spells-level-header" });
                levelHeader.createEl("h4", { text: levelHeaderTitle });

                // Render Native Interactive Spell Slot Tracker from the 9-element array
                const slotArrayIdx = Number(lvl) - 1;
                const slotInfo = (!isCantrip && slotArrayIdx >= 0 && slotArrayIdx < 9) ? slotsArray[slotArrayIdx] : { max: 0, used: 0 };
                const maxSlots = slotInfo.max;
                const usedSlots = slotInfo.used;

                if (!isCantrip && maxSlots > 0) {
                    const slotTracker = levelHeader.createDiv({ cls: "dnd-spell-slots-tracker" });
                    slotTracker.createEl("span", {
                        text: `Spell Slots:`,
                        cls: "dnd-spell-slots-label"
                    });

                    const pipsContainer = slotTracker.createDiv({ cls: "dnd-spell-slots-pips" });
                    const pipStates: boolean[] = Array.from({ length: maxSlots }, (_, idx) => idx < usedSlots);

                    const applyPipVisual = (pipEl: HTMLElement, active: boolean) => {
                        pipEl.classList.toggle("is-used", active);
                        pipEl.setAttribute("title", active ? "Tap to restore slot" : "Tap to expend slot");
                    };

                    for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
                        const pip = pipsContainer.createDiv({
                            cls: `dnd-slot-pip ${pipStates[slotIdx] ? "is-used" : ""}`
                        });
                        applyPipVisual(pip, pipStates[slotIdx]);

                        pip.addEventListener("pointerdown", async (e: PointerEvent) => {
                            if (e.button !== 0 && e.pointerType === "mouse") return;
                            e.preventDefault();
                            e.stopPropagation();

                            // 1. Toggle this pip's state and update the UI FIRST (instant response)
                            pipStates[slotIdx] = !pipStates[slotIdx];
                            applyPipVisual(pip, pipStates[slotIdx]);

                            // 2. Count total used slots for this level and update memory
                            const newUsedCount = pipStates.filter(Boolean).length;
                            slotsArray[slotArrayIdx].used = newUsedCount;

                            // 3. Save to frontmatter in the background without rebuilding the DOM
                            isUpdatingSlots = true;
                            const updatedTuples: [string, string][] = slotsArray.map((s, idx) => [
                                String(s.max),
                                idx === slotArrayIdx ? String(newUsedCount) : String(s.used)
                            ]);
                            try {
                                await this.updateCharacterFrontmatter(ctx.sourcePath, {
                                    [targetSlotsFmKey]: JSON.stringify(updatedTuples)
                                });
                            } finally {
                                setTimeout(() => { isUpdatingSlots = false; }, 150);
                            }
                        });
                    }
                }

                // If the character has slots for this level (e.g., for upcasting) but no spells prepared at this level
                if (spellKeys.length === 0) {
                    spellsWindow.createEl("p", {
                        text: `No Level ${lvl} spells currently prepared.`,
                        cls: "dnd-spells-level-empty"
                    });
                    continue;
                }

                // 2-Column Grid (fills top-left to bottom-right just like dnd-inventory)
                const gridContainer = spellsWindow.createDiv({ cls: "dnd-spells-grid" });

                for (const spellKey of spellKeys) {
                    const fallbackName = spellKey.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    const spellData = (await this.loadSpellFile(spellKey)) || {
                        name: fallbackName,
                        level: Number(lvl),
                        school: "",
                        castingTime: "-",
                        range: "-",
                        components: ["-"],
                        duration: "-",
                        description: ""
                    };

                    const isPrepared = preparedForLevel.includes(spellKey);
                    const card = gridContainer.createDiv({
                        cls: `dnd-spell-card ${showAll && isPrepared ? "dnd-spell-card-prepared" : ""}`
                    });

                    // --- A. INTEGRATED CARD HEADER (Name + School & Badges) ---
                    const cardHeader = card.createDiv({ cls: "dnd-spell-card-header" });
                    cardHeader.createEl("span", {
                        text: (spellData.name || fallbackName).toUpperCase(),
                        cls: "dnd-spell-card-title"
                    });

                    const badgeGroup = cardHeader.createDiv({ cls: "dnd-spell-card-badges" });
                    if (spellData.school) {
                        badgeGroup.createEl("span", { text: spellData.school, cls: "dnd-spell-school-label" });
                    }
                    if (spellData.concentration) {
                        badgeGroup.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
                    }
                    if (spellData.ritual) {
                        badgeGroup.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
                    }

                    // --- B. CARD BODY (Left Combat Math Sidebar + Right 2x2 Metadata Grid) ---
                    const cardBody = card.createDiv({ cls: "dnd-spell-card-body" });

                    // Left Sidebar: Save DC & Spell Attack
                    const combatBox = cardBody.createDiv({ cls: "dnd-spell-combat-box" });

                    const dcGroup = combatBox.createDiv({ cls: "dnd-spell-combat-stat" });
                    dcGroup.createEl("div", { text: `DC ${spellSaveDc}`, cls: "dnd-spell-combat-val" });
                    dcGroup.createEl("div", { text: "SPELL DC", cls: "dnd-spell-combat-lbl" });

                    const atkGroup = combatBox.createDiv({ cls: "dnd-spell-combat-stat" });
                    atkGroup.createEl("div", { text: spellAttackStr, cls: "dnd-spell-combat-val" });
                    atkGroup.createEl("div", { text: "SPELL ATK", cls: "dnd-spell-combat-lbl" });

                    // Right 2x2 Grid: Casting Time, Range, Components, Duration
                    const metaGrid = cardBody.createDiv({ cls: "dnd-spell-meta-grid" });

                    const createMetaCell = (label: string, value: string) => {
                        const cell = metaGrid.createDiv({ cls: "dnd-spell-meta-cell" });
                        cell.createEl("div", { text: label, cls: "dnd-spell-meta-label" });
                        cell.createEl("div", { text: value || "-", cls: "dnd-spell-meta-val" });
                    };

                    const compArray = Array.isArray(spellData.components) ? spellData.components.join(", ") : String(spellData.components || "-");
                    const fullComponents = spellData.materials ? `${compArray} (${spellData.materials})` : compArray;

                    createMetaCell("CASTING TIME", spellData.castingTime || "-");
                    createMetaCell("RANGE", spellData.range || "-");
                    createMetaCell("COMPONENTS", fullComponents);
                    createMetaCell("DURATION", spellData.duration || "-");

                    // --- C. COLLAPSIBLE DESCRIPTION DRAWER (Click Card to Toggle) ---
                    if (spellData.description) {
                        const descDrawer = card.createDiv({ cls: "dnd-spell-desc-drawer" });
                        await this.renderDndMarkdown(spellData.description, descDrawer, ctx.sourcePath, renderChild);

                        card.addClass("is-clickable");
                        card.onclick = () => {
                            descDrawer.classList.toggle("is-open");
                        };

                        // --- D. HOVER TOOLTIP ---
                        const X_OFFSET = 12;
                        const Y_OFFSET = 15;

                        card.addEventListener('mouseenter', async (e) => {
                            if (descDrawer.classList.contains("is-open")) return;
                            tooltipWindow.empty();

                            tooltipWindow.createEl("h4", { text: spellData.name || fallbackName, cls: "dnd-spell-tooltip-title" });
                            const subHeader = lvl === "0" ? `${spellData.school || ""} Cantrip` : `Level ${lvl} ${spellData.school || ""}`;
                            tooltipWindow.createEl("div", { text: subHeader.trim().toUpperCase(), cls: "dnd-spell-tooltip-sub" });

                            const tipDesc = tooltipWindow.createDiv({ cls: "dnd-spell-tooltip-desc" });
                            await this.renderDndMarkdown(spellData.description, tipDesc, ctx.sourcePath, renderChild);

                            tooltipWindow.addClass("is-visible");
                            tooltipWindow.style.left = `${e.clientX + X_OFFSET}px`;
                            tooltipWindow.style.top = `${e.clientY + Y_OFFSET}px`;
                        });

                        card.addEventListener('mousemove', (e) => {
                            const xPos = e.clientX + X_OFFSET;
                            const safeX = (xPos + 320 > window.innerWidth) ? e.clientX - 320 - X_OFFSET : xPos;
                            tooltipWindow.style.left = `${safeX}px`;
                            tooltipWindow.style.top = `${e.clientY + Y_OFFSET}px`;
                        });

                        card.addEventListener('mouseleave', () => {
                            tooltipWindow.removeClass("is-visible");
                        });
                    }
                }
            }

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.path === ctx.sourcePath && !isUpdatingSlots) renderContent();
            })
        );
    }

    async processDnDSkillsBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        const SKILLS_DEFINITION = [
            { name: "Acrobatics", ability: "dexterity", abbr: "DEX" },
            { name: "Animal Handling", ability: "wisdom", abbr: "WIS" },
            { name: "Arcana", ability: "intelligence", abbr: "INT" },
            { name: "Athletics", ability: "strength", abbr: "STR" },
            { name: "Deception", ability: "charisma", abbr: "CHA" },
            { name: "History", ability: "intelligence", abbr: "INT" },
            { name: "Insight", ability: "wisdom", abbr: "WIS" },
            { name: "Intimidation", ability: "charisma", abbr: "CHA" },
            { name: "Investigation", ability: "intelligence", abbr: "INT" },
            { name: "Medicine", ability: "wisdom", abbr: "WIS" },
            { name: "Nature", ability: "intelligence", abbr: "INT" },
            { name: "Perception", ability: "wisdom", abbr: "WIS" },
            { name: "Performance", ability: "charisma", abbr: "CHA" },
            { name: "Persuasion", ability: "charisma", abbr: "CHA" },
            { name: "Religion", ability: "intelligence", abbr: "INT" },
            { name: "Sleight of Hand", ability: "dexterity", abbr: "DEX" },
            { name: "Stealth", ability: "dexterity", abbr: "DEX" },
            { name: "Survival", ability: "wisdom", abbr: "WIS" }
        ];

        // Normalizes skill names ("sleight-of-hand", "SleightOfHand", "Sleight of Hand" -> "sleight of hand")
        const normalizeSkillKey = (raw: any): string => {
            if (!raw) return "";
            return String(raw)
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/[-_]/g, " ")
                .toLowerCase()
                .trim();
        };

        const renderContent = async () => {
            const wrapper = document.createElement("div");

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    // Strip YAML comments (like #Class or #Background) before parsing so they never interfere
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-skills block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            // Resolves "frontmatter.Key" or "{{ frontmatter.Key }}"
            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

            // Recursive Universal Parser for Skill Lists
            const parseSkillMap = (rawInput: any, map = new Map<string, string>()): Map<string, string> => {
                if (rawInput === undefined || rawInput === null) return map;

                const resolved = resolveValue(rawInput);
                if (resolved === undefined || resolved === null) return map;

                if (typeof resolved === "string") {
                    const trimmed = resolved.trim();
                    if (!trimmed || trimmed.includes("<chosen")) return map;

                    if (trimmed.startsWith("[")) {
                        try {
                            const parsedJson = JSON.parse(trimmed);
                            return parseSkillMap(parsedJson, map);
                        } catch {
                            const fallbackArr = trimmed.slice(1, -1).split(",");
                            return parseSkillMap(fallbackArr, map);
                        }
                    }

                    if (trimmed.includes(",")) {
                        return parseSkillMap(trimmed.split(","), map);
                    }

                    const skillKey = normalizeSkillKey(trimmed);
                    if (skillKey) map.set(skillKey, "");
                    return map;
                }

                if (Array.isArray(resolved)) {
                    const isTuple =
                        resolved.length === 2 &&
                        typeof resolved[0] === "string" &&
                        !resolved[0].trim().startsWith("[") &&
                        !resolved[0].trim().startsWith("frontmatter.") &&
                        (typeof resolved[1] === "string" || typeof resolved[1] === "number") &&
                        (["class", "background", "extra", "race", "feat"].includes(String(resolved[1]).toLowerCase()) || !isNaN(Number(resolved[1])));

                    if (isTuple) {
                        const skillKey = normalizeSkillKey(resolved[0]);
                        const sourceTag = String(resolved[1]);
                        if (skillKey && !skillKey.includes("<chosen")) {
                            map.set(skillKey, sourceTag);
                        }
                    } else {
                        for (const item of resolved) {
                            parseSkillMap(item, map);
                        }
                    }
                }

                return map;
            };

            // Recursive Universal Parser for Item Bonuses
            const parseBonusesList = (rawInput: any, bonuses: { name: string; target: string; value: number }[] = []): { name: string; target: string; value: number }[] => {
                if (rawInput === undefined || rawInput === null) return bonuses;

                const resolved = resolveValue(rawInput);
                if (resolved === undefined || resolved === null) return bonuses;

                if (typeof resolved === "string") {
                    const trimmed = resolved.trim();
                    if (!trimmed) return bonuses;

                    if (trimmed.startsWith("[")) {
                        try {
                            const parsedJson = JSON.parse(trimmed);
                            return parseBonusesList(parsedJson, bonuses);
                        } catch {
                            return bonuses;
                        }
                    }

                    if (trimmed.includes("|")) {
                        const parts = trimmed.split("|").map(p => p.trim());
                        if (parts.length >= 3) {
                            const name = parts[0];
                            const target = normalizeSkillKey(parts[1]);
                            const value = Number(parts[2].replace("+", "")) || 0;
                            if (name && target && !name.includes("<Item") && value !== 0) {
                                bonuses.push({ name, target, value });
                            }
                        }
                    }
                    return bonuses;
                }

                if (Array.isArray(resolved)) {
                    const isSingleBonusTuple =
                        resolved.length >= 3 &&
                        typeof resolved[0] === "string" &&
                        typeof resolved[1] === "string" &&
                        !Array.isArray(resolved[0]) &&
                        !resolved[0].trim().startsWith("[") &&
                        !resolved[0].trim().startsWith("frontmatter.");

                    if (isSingleBonusTuple) {
                        const name = String(resolved[0]).trim();
                        const target = normalizeSkillKey(resolved[1]);
                        const value = Number(String(resolved[2]).replace("+", "")) || 0;
                        if (name && target && !name.includes("<Item") && value !== 0) {
                            bonuses.push({ name, target, value });
                        }
                    } else {
                        for (const item of resolved) {
                            parseBonusesList(item, bonuses);
                        }
                    }
                    return bonuses;
                }

                if (typeof resolved === "object") {
                    const name = String(resolved.name || "Bonus").trim();
                    const target = normalizeSkillKey(resolved.target || resolved.skill);
                    const value = Number(String(resolved.value ?? resolved.bonus ?? 0).replace("+", "")) || 0;
                    if (target && !name.includes("<Item") && value !== 0) {
                        bonuses.push({ name, target, value });
                    }
                }

                return bonuses;
            };

            // 1. Resolve variables strictly from the code block's YAML properties
            const profMap = parseSkillMap(blockData.proficiencies);
            const expMap = parseSkillMap(blockData.expertise);
            const halfProfMap = parseSkillMap(blockData.half_proficiencies ?? blockData.halfProficiencies);
            const allBonuses = parseBonusesList(blockData.bonuses);

            // 2. Resolve Level & Proficiency Bonus
            const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
            const DnD_proficiency_bonus = Number(
                resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
            ) || Math.ceil(1 + (level / 4));

            // 3. Render the 2-Column Skills Window
            const skillsWindow = wrapper.createDiv({ cls: "dnd-skills-window" });
            const skillsGrid = skillsWindow.createDiv({ cls: "dnd-skills-grid" });

            for (const skillDef of SKILLS_DEFINITION) {
                const skillKey = normalizeSkillKey(skillDef.name);
                const abilityScore = Number(resolveValue(blockData[skillDef.ability]) ?? frontmatter[`DnD_${skillDef.ability}`]) || 10;
                const abilityMod = Math.floor((abilityScore - 10) / 2);

                const hasExpertise = expMap.has(skillKey);
                const hasProficiency = profMap.has(skillKey);
                const hasHalfProf = halfProfMap.has(skillKey);

                let profContribution = 0;
                let rankTier: "none" | "half" | "proficient" | "expertise" = "none";

                if (hasExpertise) {
                    profContribution = DnD_proficiency_bonus * 2;
                    rankTier = "expertise";
                } else if (hasProficiency) {
                    profContribution = DnD_proficiency_bonus;
                    rankTier = "proficient";
                } else if (hasHalfProf) {
                    profContribution = Math.floor(DnD_proficiency_bonus / 2);
                    rankTier = "half";
                }

                const matchingBonuses = allBonuses.filter(b => b.target === skillKey);
                const itemBonusTotal = matchingBonuses.reduce((sum, b) => sum + b.value, 0);

                const totalMod = abilityMod + profContribution + itemBonusTotal;
                const formattedTotal = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;

                const row = skillsGrid.createDiv({
                    cls: `dnd-skill-row ${rankTier !== "none" ? `is-${rankTier}` : ""}`
                });

                const leftSide = row.createDiv({ cls: "dnd-skill-left" });

                leftSide.createEl("span", {
                    cls: "dnd-skill-dot",
                    attr: { title: rankTier !== "none" ? rankTier.charAt(0).toUpperCase() + rankTier.slice(1) : "Not Proficient" }
                });

                leftSide.createEl("span", { text: skillDef.abbr, cls: "dnd-skill-abbr" });
                leftSide.createEl("span", { text: skillDef.name, cls: "dnd-skill-name" });

                const rightSide = row.createDiv({ cls: "dnd-skill-mod" });
                rightSide.setText(formattedTotal);
            }

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDAbilitiesBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        const CORE_ABILITIES = [
            { name: "strength", handle: "STR" },
            { name: "dexterity", handle: "DEX" },
            { name: "constitution", handle: "CON" },
            { name: "intelligence", handle: "INT" },
            { name: "wisdom", handle: "WIS" },
            { name: "charisma", handle: "CHA" }
        ];

        let activeResizeObserver: ResizeObserver | null = null;
        renderChild.register(() => {
            if (activeResizeObserver) activeResizeObserver.disconnect();
        });

        const renderContent = async () => {
            if (activeResizeObserver) {
                activeResizeObserver.disconnect();
                activeResizeObserver = null;
            }

            const wrapper = document.createElement("div");

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-abilities block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

            // 1. Parse Proficiencies (Supports frontmatter.DnD_classProficiencies, YAML lists, and bracket arrays)
            const parseProficiencies = (rawInput: any, set = new Set<string>()): Set<string> => {
                if (rawInput === undefined || rawInput === null) return set;

                const resolved = resolveValue(rawInput);
                if (resolved === undefined || resolved === null) return set;

                if (typeof resolved === "string") {
                    const trimmed = resolved.trim();
                    if (!trimmed || trimmed.includes("<chosen")) return set;

                    if (trimmed.startsWith("[")) {
                        try {
                            return parseProficiencies(JSON.parse(trimmed), set);
                        } catch {
                            return parseProficiencies(trimmed.slice(1, -1).split(","), set);
                        }
                    }

                    if (trimmed.includes(",")) {
                        return parseProficiencies(trimmed.split(","), set);
                    }

                    set.add(trimmed.toLowerCase());
                    return set;
                }

                if (Array.isArray(resolved)) {
                    for (const item of resolved) {
                        parseProficiencies(item, set);
                    }
                }

                return set;
            };

            // 2. Parse Extras: [ ["<ability-name>", "<ability-handle>", "<ability-score>", "<saving-throw>"], ... ]
            const parseExtras = (rawInput: any): { name: string; handle: string; score: number; saveRaw: any }[] => {
                const list: { name: string; handle: string; score: number; saveRaw: any }[] = [];
                if (rawInput === undefined || rawInput === null) return list;

                let resolved = resolveValue(rawInput);
                if (typeof resolved === "string") {
                    const trimmed = resolved.trim();
                    if (trimmed.startsWith("[")) {
                        try {
                            resolved = JSON.parse(trimmed);
                        } catch {
                            resolved = [];
                        }
                    }
                }

                if (Array.isArray(resolved)) {
                    // Support both a 2D array of tuples and a single 1D tuple if someone only wrote one array
                    const tuples = (resolved.length >= 3 && !Array.isArray(resolved[0])) ? [resolved] : resolved;

                    for (const rawTuple of tuples) {
                        const tuple = resolveValue(rawTuple);
                        if (!Array.isArray(tuple) || tuple.length < 3) continue;

                        const name = String(resolveValue(tuple[0]) ?? "").trim();
                        const handle = String(resolveValue(tuple[1]) ?? "").trim();
                        const scoreRaw = resolveValue(tuple[2]);
                        const saveRaw = tuple.length >= 4 ? resolveValue(tuple[3]) : "";

                        // Skip unedited template placeholders like "<ability-name>"
                        if (!name || !handle || name.includes("<ability") || handle.includes("<ability")) continue;

                        const score = Number(scoreRaw);
                        list.push({
                            name,
                            handle: handle.toUpperCase(),
                            score: isNaN(score) ? 10 : score,
                            saveRaw
                        });
                    }
                }

                return list;
            };

            const profSet = parseProficiencies(blockData.proficiencies);
            const extrasList = parseExtras(blockData.extras);

            const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
            const DnD_proficiency_bonus = Number(
                resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
            ) || Math.ceil(1 + (level / 4));

            // 3. Build Unified List of Ability Cards to Render
            interface AbilityCardData {
                name: string;
                handle: string;
                score: number;
                modStr: string;
                saveStr: string;
                isProficient: boolean;
            }

            const cardsToRender: AbilityCardData[] = [];

            // A. Standard 6 Abilities
            for (const abil of CORE_ABILITIES) {
                const rawScore = resolveValue(blockData[abil.name] ?? blockData[abil.handle.toLowerCase()]);
                const score = (rawScore !== undefined && rawScore !== null && rawScore !== "" && !isNaN(Number(rawScore)))
                    ? Number(rawScore)
                    : 10;

                const mod = Math.floor((score - 10) / 2);
                const isProficient = profSet.has(abil.name.toLowerCase()) || profSet.has(abil.handle.toLowerCase());
                const saveVal = mod + (isProficient ? DnD_proficiency_bonus : 0);

                cardsToRender.push({
                    name: abil.name,
                    handle: abil.handle,
                    score,
                    modStr: mod >= 0 ? `+${mod}` : `${mod}`,
                    saveStr: saveVal >= 0 ? `+${saveVal}` : `${saveVal}`,
                    isProficient
                });
            }

            // B. Extra Homebrew Abilities
            for (const extra of extrasList) {
                const mod = Math.floor((extra.score - 10) / 2);
                const nameLower = extra.name.toLowerCase();
                const handleLower = extra.handle.toLowerCase();
                const saveStrRaw = String(extra.saveRaw ?? "").trim();

                let isProficient = profSet.has(nameLower) || profSet.has(handleLower);
                let saveVal = mod + (isProficient ? DnD_proficiency_bonus : 0);

                if (saveStrRaw.toLowerCase() === "proficient" || saveStrRaw.toLowerCase() === "true") {
                    isProficient = true;
                    saveVal = mod + DnD_proficiency_bonus;
                } else if (saveStrRaw !== "" && !saveStrRaw.includes("<saving") && !isNaN(Number(saveStrRaw.replace("+", "")))) {
                    saveVal = Number(saveStrRaw.replace("+", ""));
                }

                cardsToRender.push({
                    name: extra.name,
                    handle: extra.handle,
                    score: extra.score,
                    modStr: mod >= 0 ? `+${mod}` : `${mod}`,
                    saveStr: saveVal >= 0 ? `+${saveVal}` : `${saveVal}`,
                    isProficient
                });
            }

            // 4. Render Responsive Grid Container
            const totalCards = cardsToRender.length;
            const gridEl = wrapper.createDiv({ cls: "dnd-abilities-grid" });
            gridEl.style.gridTemplateColumns = `repeat(${totalCards}, minmax(0, 1fr))`;

            // Dynamically split into 2 equal rows if the note width cannot fit all cards on 1 row
            const updateGridColumns = () => {
                const width = gridEl.clientWidth;
                if (width <= 0) return;

                const MIN_CARD_WIDTH = 105; // Minimum px width before splitting in half
                const GAP_PX = 10;
                const requiredSingleRowWidth = (totalCards * MIN_CARD_WIDTH) + ((totalCards - 1) * GAP_PX);

                if (width < requiredSingleRowWidth && totalCards > 1) {
                    const halfCols = Math.ceil(totalCards / 2);
                    gridEl.style.gridTemplateColumns = `repeat(${halfCols}, minmax(0, 1fr))`;
                } else {
                    gridEl.style.gridTemplateColumns = `repeat(${totalCards}, minmax(0, 1fr))`;
                }
            };

            activeResizeObserver = new ResizeObserver(() => updateGridColumns());
            activeResizeObserver.observe(gridEl);

            // 5. Render Individual Ability Cards
            for (const card of cardsToRender) {
                const cardEl = gridEl.createDiv({
                    cls: `dnd-ability-card ${card.isProficient ? "is-proficient" : ""}`
                });

                const headerEl = cardEl.createDiv({ cls: "dnd-ability-header" });
                headerEl.createEl("span", { text: card.handle, cls: "dnd-ability-abbr" });
                headerEl.createEl("span", { text: String(card.score), cls: "dnd-ability-score" });

                const bodyEl = cardEl.createDiv({ cls: "dnd-ability-body" });
                bodyEl.createEl("div", { text: card.modStr, cls: "dnd-ability-mod" });
                bodyEl.createEl("div", { text: `Saving ${card.saveStr}`, cls: "dnd-ability-save" });
            }

            el.empty();
            el.appendChild(wrapper);
            requestAnimationFrame(() => updateGridColumns());
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDInfoBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        let activeResizeObserver: ResizeObserver | null = null;
        renderChild.register(() => {
            if (activeResizeObserver) activeResizeObserver.disconnect();
        });

        const renderContent = async () => {
            if (activeResizeObserver) {
                activeResizeObserver.disconnect();
                activeResizeObserver = null;
            }

            const wrapper = document.createElement("div");

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-info block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

            // Helper to turn strings, YAML arrays, or JSON strings into a clean display string
            const formatTextValue = (rawVal: any, fallback: string = "-"): string => {
                const resolved = resolveValue(rawVal);
                if (resolved === undefined || resolved === null || resolved === "") return fallback;

                if (Array.isArray(resolved)) {
                    const filtered = resolved
                        .map(item => String(resolveValue(item) ?? "").trim())
                        .filter(item => item !== "" && !item.startsWith("<"));
                    return filtered.length > 0 ? filtered.join(", ") : fallback;
                }

                if (typeof resolved === "string") {
                    const trimmed = resolved.trim();
                    if (!trimmed || trimmed.startsWith("<")) return fallback;
                    if (trimmed.startsWith("[")) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            return formatTextValue(parsed, fallback);
                        } catch {
                            return trimmed;
                        }
                    }
                    return trimmed;
                }

                return String(resolved);
            };

            const formatSigned = (num: number): string => (num >= 0 ? `+${num}` : `${num}`);

            const mode = String(resolveValue(blockData.mode) || "character").toLowerCase().trim();

            interface InfoCardItem {
                label: string;
                value: string;
                sublabel: string;
            }

            const cards: InfoCardItem[] = [];
            let languagesStr = "";

            if (mode === "combat") {
                // --- COMBAT MODE: ARMOR CLASS, INITIATIVE, ATTACK ROLL, SPEED ---
                const dexScore = Number(resolveValue(blockData.dexterity) ?? frontmatter["DnD_dexterity"]) || 10;
                const dexMod = Math.floor((dexScore - 10) / 2);

                // Helper to safely parse numeric modifiers (including strings like "+2" or "-1")
                const parseNumericMod = (rawVal: any, fallback: number = 0): number => {
                    const resolved = resolveValue(rawVal);
                    if (resolved === undefined || resolved === null || resolved === "") return fallback;
                    const cleaned = String(resolved).trim().replace(/^\+/, "");
                    const num = Number(cleaned);
                    return isNaN(num) ? fallback : num;
                };

                // 1. Armor Class
                const rawBaseAc = resolveValue(blockData.armorAc) ?? frontmatter["DnD_armorAc"];
                const hasBaseAc = rawBaseAc !== undefined && rawBaseAc !== null && rawBaseAc !== "";
                const baseAc = hasBaseAc ? parseNumericMod(rawBaseAc, 10) : 10;

                const rawAcBonus = resolveValue(blockData.armorAcBonus) ?? frontmatter["DnD_armorAcBonus"];
                const acBonus = (rawAcBonus !== undefined && rawAcBonus !== null && rawAcBonus !== "")
                    ? parseNumericMod(rawAcBonus, 0)
                    : (hasBaseAc ? 0 : dexMod);

                const acMod = parseNumericMod(blockData.armorAcMod ?? frontmatter["DnD_armorAcMod"], 0);

                const explicitAc = resolveValue(blockData.armorClass ?? blockData.ac);
                const finalAc = (explicitAc !== undefined && explicitAc !== null && explicitAc !== "" && !isNaN(Number(explicitAc)))
                    ? Number(explicitAc)
                    : (baseAc + acBonus + acMod);

                const armorName = formatTextValue(blockData.armor ?? frontmatter["DnD_armor"], "Unarmored");

                cards.push({
                    label: "ARMOR CLASS",
                    value: String(finalAc),
                    sublabel: armorName
                });

                // 2. Initiative
                const explicitInit = resolveValue(blockData.initiative);
                const initVal = (explicitInit !== undefined && explicitInit !== null && explicitInit !== "" && !isNaN(Number(explicitInit)))
                    ? Number(explicitInit)
                    : dexMod;
                const initSublabel = formatTextValue(blockData.initiativeSublabel, "Dexterity Modifier");

                cards.push({
                    label: "INITIATIVE",
                    value: formatSigned(initVal),
                    sublabel: initSublabel
                });

                // 3. Attack Roll (Base Ability Mod + Proficiency Bonus + DnD_attack_roll_mod)
                const attackStatRaw = formatTextValue(blockData.attackStat ?? frontmatter["DnD_attackStat"], "strength").toLowerCase();
                const attackStatScore = Number(resolveValue(blockData[attackStatRaw]) ?? frontmatter[`DnD_${attackStatRaw}`]) || 10;
                const attackStatMod = Math.floor((attackStatScore - 10) / 2);

                const level = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
                const DnD_proficiency_bonus = Number(
                    resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
                ) || Math.ceil(1 + (level / 4));

                const rawIncludeProf = resolveValue(blockData.attackProficiency) ?? frontmatter["DnD_attackProficiency"];
                const includeProf = rawIncludeProf !== undefined && rawIncludeProf !== null && rawIncludeProf !== ""
                    ? String(rawIncludeProf).toLowerCase() !== "false" && Boolean(rawIncludeProf)
                    : true;

                const DnD_attack_roll_mod = parseNumericMod(
                    blockData.attackRollMod ?? blockData.DnD_attack_roll_mod ?? blockData.DnD_attackRollMod ?? frontmatter["DnD_attackRollMod"],
                    0
                );

                const explicitAttack = resolveValue(blockData.attackRoll);
                const totalAttack = (explicitAttack !== undefined && explicitAttack !== null && explicitAttack !== "" && !isNaN(Number(explicitAttack)))
                    ? Number(explicitAttack)
                    : (attackStatMod + (includeProf ? DnD_proficiency_bonus : 0) + DnD_attack_roll_mod);

                const capStatName = attackStatRaw.charAt(0).toUpperCase() + attackStatRaw.slice(1);
                const attackSublabel = formatTextValue(blockData.attackSublabel, `${capStatName} Modifier`);

                cards.push({
                    label: "ATTACK ROLL",
                    value: formatSigned(totalAttack),
                    sublabel: attackSublabel
                });

                // 4. Speed
                const rawSpeed = resolveValue(blockData.speed ?? frontmatter["DnD_speed"]);
                const rawSpeedMod = parseNumericMod(
                    blockData.speedMod ?? blockData.DnD_speed_mod ?? blockData.DnD_speedMod ?? frontmatter["DnD_speedMod"],
                    0
                );
                let speedDisplay = `${30 + rawSpeedMod} feet`;
                if (rawSpeed !== undefined && rawSpeed !== null && String(rawSpeed).trim() !== "") {
                    const sTrim = String(rawSpeed).trim();
                    speedDisplay = !isNaN(Number(sTrim)) ? `${Number(sTrim) + rawSpeedMod} feet` : sTrim;
                }
                const speedSublabel = formatTextValue(blockData.speedSublabel ?? frontmatter["DnD_speedSublabel"], "");

                cards.push({
                    label: "SPEED",
                    value: speedDisplay,
                    sublabel: speedSublabel
                });
            } else {
                // --- CHARACTER MODE: RACE, CLASS, BACKGROUND, LEVEL (+ LANGUAGES) ---
                const raceVal = formatTextValue(blockData.race ?? frontmatter["DnD_race"], "-");
                const raceSub = formatTextValue(blockData.raceLineage ?? blockData.lineage ?? frontmatter["DnD_raceLineage"], "");

                const classVal = formatTextValue(blockData.class ?? frontmatter["DnD_class"], "-");
                const classSub = formatTextValue(blockData.subclass ?? frontmatter["DnD_subclass"], "");

                const bgVal = formatTextValue(blockData.background ?? frontmatter["DnD_background"], "-");
                const bgSub = formatTextValue(blockData.backgroundFeat ?? frontmatter["DnD_backgroundFeat"], "");

                const levelNum = Number(resolveValue(blockData.level) ?? frontmatter["DnD_level"]) || 1;
                const DnD_proficiency_bonus = Number(
                    resolveValue(blockData.DnD_proficiency_bonus ?? blockData.proficiencyBonus ?? blockData.proficiency_bonus) ?? frontmatter["DnD_proficiencyBonus"]
                ) || Math.ceil(1 + (levelNum / 4));
                const levelSub = formatTextValue(blockData.levelSublabel, `${formatSigned(DnD_proficiency_bonus)} Proficiency`);

                cards.push(
                    { label: "RACE", value: raceVal, sublabel: raceSub },
                    { label: "CLASS", value: classVal, sublabel: classSub },
                    { label: "BACKGROUND", value: bgVal, sublabel: bgSub },
                    { label: "LEVEL", value: String(levelNum), sublabel: levelSub }
                );

                languagesStr = formatTextValue(blockData.languages ?? frontmatter["DnD_languages"], "");
            }

            // Render 4-Column Responsive Grid (splits cleanly into 2x2 if narrow)
            const containerEl = wrapper.createDiv({ cls: "dnd-info-container" });
            const gridEl = containerEl.createDiv({ cls: "dnd-info-grid" });

            const updateGridColumns = () => {
                const width = gridEl.clientWidth;
                if (width <= 0) return;

                const MIN_CARD_WIDTH = 155;
                const GAP_PX = 10;
                const requiredWidth = (4 * MIN_CARD_WIDTH) + (3 * GAP_PX);

                gridEl.classList.toggle("is-2col", width < requiredWidth);
            };

            activeResizeObserver = new ResizeObserver(() => updateGridColumns());
            activeResizeObserver.observe(gridEl);

            // Render Cards
            for (const c of cards) {
                const cardEl = gridEl.createDiv({ cls: "dnd-info-card" });
                cardEl.createDiv({ text: c.label, cls: "dnd-info-card-label" });
                cardEl.createDiv({ text: c.value, cls: "dnd-info-card-value" });

                if (c.sublabel) {
                    cardEl.createDiv({ text: c.sublabel, cls: "dnd-info-card-sublabel" });
                }
            }

            // Render Languages Pill Badge in Character Mode
            if (mode === "character" && languagesStr) {
                const langRow = containerEl.createDiv({ cls: "dnd-info-languages-row" });
                const langBadge = langRow.createDiv({ cls: "dnd-info-languages-badge" });
                langBadge.createEl("span", { text: "LANGUAGES", cls: "dnd-info-languages-label" });
                langBadge.createEl("span", { text: languagesStr, cls: "dnd-info-languages-value" });
            }

            el.empty();
            el.appendChild(wrapper);
            requestAnimationFrame(() => updateGridColumns());
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    async processDnDHealthBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const renderChild = new MarkdownRenderChild(el);
        ctx.addChild(renderChild);

        // Persistent session states across frontmatter re-renders
        let tempHp = 0;
        let hitDiceStates: boolean[] = [];
        let manualDeathSavesOpen = false;
        let deathSaveLeft: boolean[] = [false, false, false];
        let deathSaveRight: boolean[] = [false, false, false];

        const renderContent = async () => {
            const wrapper = document.createElement("div");

            let blockData: Record<string, any> = {};
            try {
                if (source.trim()) {
                    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
                    blockData = parseYaml(cleanSource) || {};
                }
            } catch (error) {
                wrapper.createEl("p", { text: "Error: Invalid YAML format in dnd-health block.", cls: "dnd-error-text" });
                el.empty();
                el.appendChild(wrapper);
                return;
            }

            const fileCache = this.app.metadataCache.getCache(ctx.sourcePath);
            const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

            const resolveValue = (val: any) => {
                if (typeof val === "string") {
                    const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
                    if (trimmed.startsWith("frontmatter.")) {
                        return frontmatter[trimmed.replace("frontmatter.", "")];
                    }
                }
                return val;
            };

            // 1. Resolve health (Max HP), hitDice (DnD_hit_dice), and level (DnD_level)
            const rawMaxHealth = resolveValue(blockData.health ?? blockData.maxHealth);
            const maxHealth = (rawMaxHealth !== undefined && rawMaxHealth !== null && rawMaxHealth !== "" && !isNaN(Number(rawMaxHealth)))
                ? Math.max(1, Number(rawMaxHealth))
                : Math.max(1, Number(frontmatter["DnD_maxHealth"]) || 1);

            let rawHitDice = resolveValue(blockData.hitDice ?? blockData.DnD_hit_dice) ?? frontmatter["DnD_hitDice"];
            if (!rawHitDice && frontmatter["DnD_class"]) {
                const primaryClass = Array.isArray(frontmatter["DnD_class"]) ? frontmatter["DnD_class"][0] : frontmatter["DnD_class"];
                const classData = await getClassData(this.app, this.settings, primaryClass);
                if (classData) {
                    rawHitDice = classData.HitDice || classData.hitDice || classData.hit_dice;
                }
            }
            const DnD_hit_dice = String(rawHitDice || "d8").trim().replace(/^<.*>$/, "d8") || "d8";

            const rawLevel = resolveValue(blockData.level ?? blockData.DnD_level);
            const DnD_level = (rawLevel !== undefined && rawLevel !== null && rawLevel !== "" && !isNaN(Number(rawLevel)))
                ? Math.max(1, Number(rawLevel))
                : Math.max(1, Number(frontmatter["DnD_level"]) || 1);

            // Sync hitDiceStates array length with current level
            while (hitDiceStates.length < DnD_level) hitDiceStates.push(false);
            if (hitDiceStates.length > DnD_level) hitDiceStates.length = DnD_level;

            // Resolve DnD_current_health from frontmatter.DnD_currentHealth (or block override)
            let targetCurrentHpKey = "DnD_currentHealth";
            if (typeof blockData.currentHealth === "string" && blockData.currentHealth.trim().startsWith("frontmatter.")) {
                targetCurrentHpKey = blockData.currentHealth.trim().replace("frontmatter.", "");
            }

            const rawCurrentHealth = resolveValue(blockData.currentHealth) ?? frontmatter[targetCurrentHpKey];
            const DnD_current_health = (rawCurrentHealth !== undefined && rawCurrentHealth !== null && rawCurrentHealth !== "" && !isNaN(Number(rawCurrentHealth)))
                ? Math.max(0, Math.min(maxHealth, Number(rawCurrentHealth)))
                : maxHealth;

            // 2. Build Main Health Card Window
            const healthWindow = wrapper.createDiv({ cls: "dnd-health-window" });

            // Header Label
            healthWindow.createDiv({
                text: "HIT POINTS",
                cls: "dnd-health-label"
            });

            // Current / Max HP Numbers (+ Temp HP badge if active)
            const numbersRow = healthWindow.createDiv({ cls: "dnd-health-numbers" });
            numbersRow.createEl("span", {
                text: String(DnD_current_health),
                cls: "dnd-health-current"
            });
            numbersRow.createEl("span", {
                text: ` / ${maxHealth}`,
                cls: "dnd-health-max"
            });

            if (tempHp > 0) {
                numbersRow.createEl("span", {
                    text: ` (+${tempHp} Temp)`,
                    cls: "dnd-health-temp"
                });
            }

            // Progress Bar
            const barTrack = healthWindow.createDiv({ cls: "dnd-health-bar-track" });
            const fillPercent = Math.max(0, Math.min(100, (DnD_current_health / maxHealth) * 100));
            const barFill = barTrack.createDiv({ cls: "dnd-health-bar-fill" });
            barFill.style.width = `${fillPercent}%`;

            // Controls Row: Input + Heal / Damage / Temp HP Buttons
            const controlsRow = healthWindow.createDiv({ cls: "dnd-health-controls" });
            const amountInput = controlsRow.createEl("input", {
                type: "number",
                value: "1",
                cls: "dnd-health-input",
                attr: { min: "1" }
            });

            const healBtn = controlsRow.createEl("button", {
                text: "Heal",
                cls: "dnd-health-btn dnd-health-btn-heal"
            });
            const dmgBtn = controlsRow.createEl("button", {
                text: "Damage",
                cls: "dnd-health-btn dnd-health-btn-damage"
            });
            const tempBtn = controlsRow.createEl("button", {
                text: "Temp HP",
                cls: "dnd-health-btn dnd-health-btn-temp"
            });

            healBtn.onclick = async () => {
                const amt = Math.max(0, Number(amountInput.value) || 0);
                if (amt <= 0) return;
                const newHp = Math.min(maxHealth, DnD_current_health + amt);
                if (newHp > 0) {
                    deathSaveLeft = [false, false, false];
                    deathSaveRight = [false, false, false];
                }
                await this.updateCharacterFrontmatter(ctx.sourcePath, {
                    [targetCurrentHpKey]: newHp
                });
            };

            dmgBtn.onclick = async () => {
                let remainingDmg = Math.max(0, Number(amountInput.value) || 0);
                if (remainingDmg <= 0) return;

                // Deduct from Temp HP first
                if (tempHp > 0) {
                    const absorbed = Math.min(tempHp, remainingDmg);
                    tempHp -= absorbed;
                    remainingDmg -= absorbed;
                }

                const newHp = Math.max(0, DnD_current_health - remainingDmg);
                if (newHp !== DnD_current_health) {
                    await this.updateCharacterFrontmatter(ctx.sourcePath, {
                        [targetCurrentHpKey]: newHp
                    });
                } else {
                    renderContent();
                }
            };

            tempBtn.onclick = () => {
                const amt = Math.max(0, Number(amountInput.value) || 0);
                tempHp = amt;
                renderContent();
            };

            // 3. Hit Dice Section
            healthWindow.createDiv({ cls: "dnd-health-divider" });

            const hitDiceRow = healthWindow.createDiv({ cls: "dnd-health-hitdice-row" });
            hitDiceRow.createEl("span", {
                text: `HIT DICE (${DnD_hit_dice.toUpperCase()})`,
                cls: "dnd-health-hitdice-label"
            });

            const hdPipsContainer = hitDiceRow.createDiv({ cls: "dnd-spell-slots-pips" });
            const applyHdPipVisual = (pipEl: HTMLElement, active: boolean) => {
                pipEl.classList.toggle("is-used", active);
                pipEl.setAttribute("title", active ? "Tap to restore Hit Die" : "Tap to spend Hit Die");
            };

            for (let i = 0; i < DnD_level; i++) {
                const pip = hdPipsContainer.createDiv({
                    cls: `dnd-slot-pip ${hitDiceStates[i] ? "is-used" : ""}`
                });
                applyHdPipVisual(pip, hitDiceStates[i]);

                pip.addEventListener("pointerdown", (e: PointerEvent) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    e.preventDefault();
                    e.stopPropagation();
                    hitDiceStates[i] = !hitDiceStates[i];
                    applyHdPipVisual(pip, hitDiceStates[i]);
                });
            }

            // 4. Death Saves Section (Shows automatically at 0 HP or when manually toggled)
            const showDeathSaves = DnD_current_health <= 0 || manualDeathSavesOpen;
            if (showDeathSaves) {
                healthWindow.createDiv({ cls: "dnd-health-divider" });

                const deathSavesRow = healthWindow.createDiv({ cls: "dnd-health-deathsaves-row" });

                // Left Pips: Failures (--dnd-ui-color-accent-red in styles.css)
                const leftPips = deathSavesRow.createDiv({ cls: "dnd-spell-slots-pips" });
                for (let i = 0; i < 3; i++) {
                    const pip = leftPips.createDiv({
                        cls: `dnd-slot-pip dnd-deathsave-fail ${deathSaveLeft[i] ? "is-used" : ""}`,
                        attr: { title: "Death Save Failure" }
                    });
                    pip.addEventListener("pointerdown", (e: PointerEvent) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        e.stopPropagation();
                        deathSaveLeft[i] = !deathSaveLeft[i];
                        pip.classList.toggle("is-used", deathSaveLeft[i]);
                    });
                }

                deathSavesRow.createEl("span", {
                    text: "💀",
                    cls: "dnd-health-skull"
                });

                // Right Pips: Successes (--dnd-ui-color-accent-teal in styles.css)
                const rightPips = deathSavesRow.createDiv({ cls: "dnd-spell-slots-pips" });
                for (let i = 0; i < 3; i++) {
                    const pip = rightPips.createDiv({
                        cls: `dnd-slot-pip dnd-deathsave-success ${deathSaveRight[i] ? "is-used" : ""}`,
                        attr: { title: "Death Save Success" }
                    });
                    pip.addEventListener("pointerdown", (e: PointerEvent) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        e.stopPropagation();
                        deathSaveRight[i] = !deathSaveRight[i];
                        pip.classList.toggle("is-used", deathSaveRight[i]);
                    });
                }
            }

            // 5. Bottom Action Buttons: Short Rest, Long Rest, Death Saves
            const bottomBar = wrapper.createDiv({ cls: "dnd-health-rest-bar" });

            const shortRestBtn = bottomBar.createEl("button", {
                text: "Short Rest",
                cls: "dnd-health-rest-btn",
                attr: { value: "short-rest" }
            });
            shortRestBtn.onclick = async () => {
                await this.resetCharacterRestState(ctx.sourcePath, "short");
                renderContent();
                window.dispatchEvent(new Event("short-rest"));
                new Notice("Short Rest taken! Short Rest feature uses restored.");
            };

            const longRestBtn = bottomBar.createEl("button", {
                text: "Long Rest",
                cls: "dnd-health-rest-btn",
                attr: { value: "long-rest" }
            });
            longRestBtn.onclick = async () => {
                tempHp = 0;
                hitDiceStates = Array(DnD_level).fill(false);
                manualDeathSavesOpen = false;
                deathSaveLeft = [false, false, false];
                deathSaveRight = [false, false, false];

                await this.resetCharacterRestState(ctx.sourcePath, "long", {
                    [targetCurrentHpKey]: maxHealth
                });
                renderContent();
                window.dispatchEvent(new Event("long-rest"));
                new Notice("Long Rest completed! HP, Hit Dice, Spell Slots, and Feature Uses restored.");
            };

            const deathSavesBtn = bottomBar.createEl("button", {
                text: "Death Saves",
                cls: `dnd-health-rest-btn ${showDeathSaves ? "is-active" : ""}`
            });
            deathSavesBtn.onclick = () => {
                manualDeathSavesOpen = !manualDeathSavesOpen;
                renderContent();
            };

            el.empty();
            el.appendChild(wrapper);
        };

        renderContent();

        renderChild.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path === ctx.sourcePath) renderContent();
            })
        );
    }

    // --- Helper: Ensure feature rest types ("short" | "long") are known for a character file ---
    async populateFeatureRestTypesForFile(sourcePath: string) {
        const fileCache = this.app.metadataCache.getCache(sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};
        const fetchOptions = { ...this.settings };

        const registerFeatureRest = (featureObj: any) => {
            if (!featureObj || !featureObj.name || featureObj.uses === undefined || featureObj.uses === null || featureObj.uses === "") return;
            const cleanName = String(featureObj.name).trim().toLowerCase();
            const restType: "short" | "long" = (Array.isArray(featureObj.uses) && String(featureObj.uses[1] || "").toLowerCase().trim() === "short")
                ? "short"
                : "long";
            this.featureRestTypes.set(cleanName, restType);
        };

        // 1. Classes & Subclasses
        const rawClass = frontmatter["DnD_class"];
        const classArray = rawClass ? (Array.isArray(rawClass) ? rawClass : [rawClass]) : [];
        const rawSubclass = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        const subclassArray = rawSubclass ? (Array.isArray(rawSubclass) ? rawSubclass : [rawSubclass]) : [];
        const extraFeatIds: string[] = [];

        for (let i = 0; i < classArray.length; i++) {
            const className = String(classArray[i] || "").trim();
            if (!className || className.startsWith("<")) continue;
            const classData = await getClassData(this.app, fetchOptions, className);
            if (classData && classData.features) {
                for (const lvlKey of Object.keys(classData.features)) {
                    const feats = classData.features[lvlKey];
                    if (Array.isArray(feats)) {
                        for (const f of feats) {
                            registerFeatureRest(f);
                            if (Array.isArray(f.grantedFeats)) extraFeatIds.push(...f.grantedFeats);
                        }
                    }
                }
                const subName = String(subclassArray[i] || "").trim();
                const grantedSubFile = this.findGrantedSubclass(classData, 20);
                if (subName && !subName.startsWith("<") && grantedSubFile) {
                    const subData = await getSubclassData(this.app, fetchOptions, grantedSubFile, subName);
                    if (subData && typeof subData === "object") {
                        for (const lvlKey of Object.keys(subData)) {
                            const subFeats = subData[lvlKey];
                            if (Array.isArray(subFeats)) {
                                for (const sf of subFeats) {
                                    registerFeatureRest(sf);
                                    if (Array.isArray(sf.grantedFeats)) extraFeatIds.push(...sf.grantedFeats);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Class Choices (Invocations, etc.)
        let classChoicesRaw = frontmatter["DnD_classChoices"];
        if (typeof classChoicesRaw === "string" && classChoicesRaw.trim().startsWith("[")) {
            try { classChoicesRaw = JSON.parse(classChoicesRaw.trim()); } catch { classChoicesRaw = []; }
        }
        if (Array.isArray(classChoicesRaw)) {
            for (const choiceTuple of classChoicesRaw) {
                let choiceKey = "";
                if (Array.isArray(choiceTuple)) {
                    if (choiceTuple.length === 3) choiceKey = choiceTuple[1];
                    else if (choiceTuple.length === 2) choiceKey = choiceTuple[0];
                }
                if (choiceKey) {
                    const choiceData = await getClassChoiceData(this.app, fetchOptions, String(choiceKey));
                    if (choiceData) registerFeatureRest(choiceData);
                }
            }
        }

        // 3. Race Traits
        const rawRace = frontmatter["DnD_race"];
        const raceName = Array.isArray(rawRace) ? rawRace[0] : rawRace;
        if (raceName && typeof raceName === "string" && !raceName.trim().startsWith("<")) {
            const raceData = await getRaceData(this.app, fetchOptions, raceName.trim());
            if (raceData && Array.isArray(raceData.traits)) {
                for (const t of raceData.traits) registerFeatureRest(t);
            }
        }

        // 4. Background Feat
        const rawBg = frontmatter["DnD_background"];
        const bgName = Array.isArray(rawBg) ? rawBg[0] : rawBg;
        if (bgName && typeof bgName === "string" && !bgName.trim().startsWith("<")) {
            const bgData = await getBackgroundData(this.app, fetchOptions, bgName.trim());
            if (bgData && bgData.feat) {
                const bgFeat = await getExtraFeat(this.app, fetchOptions, String(bgData.feat));
                if (bgFeat) registerFeatureRest(bgFeat);
            }
        }

        // 5. Extra Feats
        const rawExtraFeats = frontmatter["DnD_extraFeats"];
        if (Array.isArray(rawExtraFeats)) {
            extraFeatIds.push(...rawExtraFeats.map(String));
        } else if (typeof rawExtraFeats === "string" && rawExtraFeats.trim()) {
            extraFeatIds.push(rawExtraFeats.trim());
        }
        for (const featId of new Set(extraFeatIds)) {
            if (!featId || featId.startsWith("<") || featId === "ability-score-improvement") continue;
            const featData = await getExtraFeat(this.app, fetchOptions, featId);
            if (featData) registerFeatureRest(featData);
        }
    }

    // --- Helper: Reset Short Rest or Long Rest state in frontmatter ---
    async resetCharacterRestState(sourcePath: string, restType: "short" | "long", extraUpdates: Record<string, any> = {}) {
        await this.populateFeatureRestTypesForFile(sourcePath);

        let targetFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(targetFile instanceof TFile)) {
            targetFile = this.app.workspace.getActiveFile();
        }
        if (!(targetFile instanceof TFile)) return;

        await this.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, any>) => {
            for (const [k, v] of Object.entries(extraUpdates)) {
                fm[k] = v;
            }

            if (restType === "long") {
                const slotKey = fm["DnD_spellSlots"] !== undefined ? "DnD_spellSlots" : (fm["DnD_spellsSlots"] !== undefined ? "DnD_spellsSlots" : null);
                if (slotKey) {
                    let rawSlots = fm[slotKey];
                    if (typeof rawSlots === "string" && rawSlots.trim().startsWith("[")) {
                        try { rawSlots = JSON.parse(rawSlots.trim()); } catch { rawSlots = null; }
                    }
                    if (Array.isArray(rawSlots)) {
                        const resetSlots = rawSlots.map((pair: any) => {
                            if (Array.isArray(pair) && pair.length >= 2) {
                                return [String(pair[0]), "0"];
                            }
                            return ["0", "0"];
                        });
                        fm[slotKey] = JSON.stringify(resetSlots);
                    }
                }
            }

            if (fm["DnD_featureUses"] !== undefined) {
                let rawFeatureUses = fm["DnD_featureUses"];
                if (typeof rawFeatureUses === "string" && rawFeatureUses.trim().startsWith("[")) {
                    try { rawFeatureUses = JSON.parse(rawFeatureUses.trim()); } catch { rawFeatureUses = null; }
                }

                if (Array.isArray(rawFeatureUses)) {
                    const updatedFeatureUses = rawFeatureUses
                        .filter((tuple: any) => Array.isArray(tuple) && tuple.length >= 2 && tuple[0])
                        .map((tuple: any) => {
                            const fName = String(tuple[0]).trim();
                            const fMax = String(tuple[1]);
                            const fUsed = String(tuple[2] ?? "0");
                            const featRest = this.featureRestTypes.get(fName.toLowerCase()) || "long";
                            if (restType === "long" || (restType === "short" && featRest === "short")) {
                                return [fName, fMax, "0"];
                            }
                            return [fName, fMax, fUsed];
                        });
                    fm["DnD_featureUses"] = JSON.stringify(updatedFeatureUses);
                }
            }
        });
    }
}

// --- CHARACTER CREATION WIZARD UI ---
class CharacterWizardModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    currentStep: number = 1;
    totalSteps: number = 5; // UPGRADED to 5 steps!

    // Data pools for our dropdowns
    availableClasses: string[] = [];
    availableRaces: string[] = [];
    availableBackgrounds: string[] = [];
    availableItems: { id: string; name: string; type: string }[] = [];
    availableWeapons: { id: string; name: string; damage: string; mastery: string }[] = [];
    availableArmors: { id: string; name: string; ac: string; category: string }[] = [];

    // Expanded storage for all our new choices
    wizardData: Record<string, any> = {
        name: "", level: 1, race: "", raceLineage: "", dndClass: "", subclass: "",
        DnD_spellcasting_ability: "", background: "", classEquipment: "A", backgroundEquipment: "A",
        classChosenItems: [] as string[], backgroundChosenItems: [] as string[],
        weapon: "", weaponDamage: "", armor: "", armorAc: "",
        isWeaponCustom: false, isArmorCustom: false,
        weaponMasteries: [] as string[],
        languages: "", extraFeats: "", speed: 30, maxHealth: 0,
        chosenSkills: [],
        chosenBgSkills: [],
        chosenAbilityBonuses: [],
        classChoices: [], // Stores the dynamic Class Choices [Router, Key, Level, ChoiceIndex]
        expertiseChoices: [],
    };

    // Incremented on every renderStep() call so stale (slower) async renders are discarded
    private renderToken = 0;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        this.contentEl.createEl("h3", { text: "Loading rulebook data...", cls: "dnd-section-header" });
        await this.fetchDropdownData();
        this.renderStep();
    }

    onClose() {
        this.contentEl.empty();
    }

    async fetchDropdownData() {
        const basePath = this.plugin.settings.customRulebookPath?.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
        const priority = this.plugin.settings.customRulebookPriority;

        const readCustomRouter = async (fileName: string): Promise<Record<string, any> | null> => {
            if (!basePath) return null;
            const customPath = normalizePath(`${basePath}/${fileName}`);
            try {
                if (await this.app.vault.adapter.exists(customPath)) {
                    const content = await this.app.vault.adapter.read(customPath);
                    return JSON.parse(content);
                }
            } catch (e) {
                console.error(`Wizard Error: Could not read custom file at ${customPath}`, e);
            }
            return null;
        };

        // For Router Files ({ "<filename>": "<Display Name>" } like classes.json & races.json)
        const getRouterDisplayNames = async (fileName: string, nativeMap: Record<string, any>) => {
            const customMap = await readCustomRouter(fileName);
            const merged = customMap
                ? (priority ? { ...(nativeMap || {}), ...customMap } : { ...customMap, ...(nativeMap || {}) })
                : (nativeMap || {});

            const displayNames = new Set<string>();
            for (const [k, v] of Object.entries(merged)) {
                if (typeof v === "string") {
                    displayNames.add(v.trim());
                } else if (typeof k === "string") {
                    displayNames.add(k.trim());
                }
            }
            if (displayNames.size === 0) {
                console.warn(`Wizard: No data found for ${fileName}.`);
                new Notice(`Warning: Could not load ${fileName}. Dropdown will be empty.`);
            }
            return Array.from(displayNames).sort((a, b) => a.localeCompare(b));
        };

        // For Inline Object Maps ({ "<Display Name>": { ... } } like backgrounds.json)
        const getObjectKeys = async (fileName: string, nativeMap: Record<string, any>) => {
            const customMap = await readCustomRouter(fileName);
            const merged = customMap
                ? (priority ? { ...(nativeMap || {}), ...customMap } : { ...customMap, ...(nativeMap || {}) })
                : (nativeMap || {});

            const keys = Object.keys(merged).sort((a, b) => a.localeCompare(b));
            if (keys.length === 0) {
                console.warn(`Wizard: No data found for ${fileName}.`);
                new Notice(`Warning: Could not load ${fileName}. Dropdown will be empty.`);
            }
            return keys;
        };

        this.availableClasses = await getRouterDisplayNames("classes.json", classesMap);
        this.availableRaces = await getRouterDisplayNames("races.json", racesMap);
        this.availableBackgrounds = await getObjectKeys("backgrounds.json", backgroundsMap);

        // Populate Weapon & Armor pools from native + custom rulebook items.json
        const itemLookupKeys = new Set<string>(Object.keys(itemsMap || {}));
        const customItemsObj = await readCustomRouter("items.json");
        if (customItemsObj && typeof customItemsObj === "object") {
            Object.keys(customItemsObj).forEach(k => itemLookupKeys.add(k));
        }

        const allItemsMap = new Map<string, { id: string; name: string; type: string }>();
        const weaponsMap = new Map<string, { id: string; name: string; damage: string; mastery: string }>();
        const armorsMap = new Map<string, { id: string; name: string; ac: string; category: string }>();

        for (const key of itemLookupKeys) {
            const data = await getItemData(this.app, this.plugin.settings, key);
            if (!data || !data.type) continue;

            const typeLower = String(data.type).toLowerCase().trim().replace(/['"]/g, '').replace(/\s+/g, '-');
            const displayName = String(data.name || key).trim();
            const mapKey = displayName.toLowerCase();

            allItemsMap.set(mapKey, { id: key, name: displayName, type: typeLower });

            if (typeLower.includes("weapon")) {
                const masteryInfo = data.mastery
                    ? await getWeaponMasteryDescription(this.app, this.plugin.settings, data.mastery)
                    : null;
                weaponsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    damage: String(data.damage || ""),
                    mastery: masteryInfo ? masteryInfo.name : ""
                });
            } else if (typeLower.includes("armor")) {
                armorsMap.set(mapKey, { id: key, name: displayName, ac: String(data.ac || "10"), category: String(data.category || "") });
            }
        }

        this.availableItems = Array.from(allItemsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        this.availableWeapons = Array.from(weaponsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        this.availableArmors = Array.from(armorsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    // Main rendering engine for the Wizard
    async renderStep() {
        const { contentEl } = this;
        const token = ++this.renderToken;

        // Build the whole step in a DETACHED container first. The step renderers await
        // rulebook lookups (race/class/subclass data), so emptying contentEl up front would
        // leave the modal blank/collapsed during those awaits — causing the flicker.
        const buildEl = document.createElement("div");

        buildEl.createEl("h2", {
            text: `Character Creation Wizard (Step ${this.currentStep} of ${this.totalSteps})`,
            cls: "dnd-section-header"
        });

        const stepContainer = buildEl.createDiv({ cls: "dnd-features-window" });

        // We MUST await all steps now so dynamic lineages and subclasses can fetch data before rendering
        if (this.currentStep === 1) {
            await this.renderStepOne(stepContainer);
        } else if (this.currentStep === 2) {
            await this.renderStepTwo(stepContainer);
        } else if (this.currentStep === 3) {
            await this.renderStepThree(stepContainer); // NEW Class Options Step
        } else if (this.currentStep === 4) {
            await this.renderStepFour(stepContainer); // Equipment Step
        } else if (this.currentStep === 5) {
            this.renderStepFive(stepContainer); // Finalization Step
        }

        // A newer renderStep() started while we were awaiting — drop this outdated render
        if (token !== this.renderToken) return;

        const navContainer = buildEl.createDiv({ cls: "dnd-wizard-nav" });

        const backBtn = navContainer.createEl("button", { text: "Back" });
        backBtn.disabled = this.currentStep === 1;
        backBtn.onclick = () => {
            if (this.currentStep > 1) {
                this.currentStep--;
                this.renderStep();
            }
        };

        const nextBtn = navContainer.createEl("button", {
            text: this.currentStep === this.totalSteps ? "Finish & Generate" : "Next",
            cls: "mod-cta"
        });

        nextBtn.onclick = async () => {
            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                this.renderStep();
            } else {
                nextBtn.disabled = true;
                try {
                    await this.finishWizard();
                } catch (error) {
                    console.error("Character Wizard: Failed to generate character sheet:", error);
                    new Notice("Error: Could not generate the character sheet. Check the console for details.");
                    nextBtn.disabled = false;
                }
            }
        };

        // Swap the fully-built step in synchronously (no paint in between = no flicker)
        contentEl.empty();
        while (buildEl.firstChild) contentEl.appendChild(buildEl.firstChild);
    }

    async renderStepOne(container: HTMLElement) {
        container.createEl("h3", { text: "Core Details", cls: "dnd-class-header" });

        // Character Name & Level Inputs
        const grid = container.createDiv({ cls: "dnd-form-grid-name-lvl" });

        const nameDiv = grid.createDiv();
        nameDiv.createEl("label", { text: "Character Name: ", cls: "dnd-form-label" });
        const nameInput = nameDiv.createEl("input", { type: "text", value: this.wizardData.name, cls: "dnd-modal-form-input" });
        nameInput.placeholder = "e.g., Din";
        nameInput.onchange = (e) => this.wizardData.name = (e.target as HTMLInputElement).value;

        const levelDiv = grid.createDiv();
        levelDiv.createEl("label", { text: "Level: ", cls: "dnd-form-label" });
        const levelInput = levelDiv.createEl("input", { type: "number", value: String(this.wizardData.level), cls: "dnd-modal-form-input" });
        levelInput.min = "1"; levelInput.max = "20";
        levelInput.onchange = async (e) => {
            this.wizardData.level = Number((e.target as HTMLInputElement).value) || 1;
            await this.renderStep();
        };

        // --- RACE SECTION ---
        const raceDiv = container.createDiv({ cls: "dnd-form-group" });
        raceDiv.createEl("label", { text: "Race: ", cls: "dnd-form-label" });
        const raceSelect = raceDiv.createEl("select", { cls: "dnd-modal-form-input" });
        raceSelect.createEl("option", { text: "-- Select a Race --", value: "" });
        this.availableRaces.forEach(r => raceSelect.createEl("option", { text: r, value: r }));
        raceSelect.value = this.wizardData.race;

        raceSelect.onchange = async (e) => {
            this.wizardData.race = (e.target as HTMLSelectElement).value;
            this.wizardData.raceLineage = "";
            await this.renderStep();
        };

        // Conditional Race Lineage
        if (this.wizardData.race) {
            const raceData = await getRaceData(this.app, this.plugin.settings, this.wizardData.race);
            if (raceData && raceData.traits) {
                const lineages = new Set(raceData.traits.filter((t: any) => t.lineage).map((t: any) => t.lineage));
                if (lineages.size > 0) {
                    const linDiv = container.createDiv({ cls: "dnd-form-subpanel" });
                    linDiv.createEl("label", { text: "Race Lineage: ", cls: "dnd-form-label-sub" });
                    const linSelect = linDiv.createEl("select", { cls: "dnd-modal-form-input" });
                    linSelect.createEl("option", { text: "-- Select a Lineage --", value: "" });
                    Array.from(lineages).forEach((l: any) => linSelect.createEl("option", { text: l, value: l }));
                    linSelect.value = this.wizardData.raceLineage || "";
                    linSelect.onchange = (e) => this.wizardData.raceLineage = (e.target as HTMLSelectElement).value;
                }
            }
        }

        // --- CLASS SECTION ---
        const classDiv = container.createDiv({ cls: "dnd-form-group" });
        classDiv.createEl("label", { text: "Class: ", cls: "dnd-form-label" });
        const classSelect = classDiv.createEl("select", { cls: "dnd-modal-form-input" });
        classSelect.createEl("option", { text: "-- Select a Class --", value: "" });
        this.availableClasses.forEach(c => classSelect.createEl("option", { text: c, value: c }));
        classSelect.value = this.wizardData.dndClass;

        classSelect.onchange = async (e) => {
            this.wizardData.dndClass = (e.target as HTMLSelectElement).value;
            this.wizardData.subclass = "";
            await this.renderStep();
        };

        // Conditional Subclass
        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, Number(this.wizardData.level) || 1);

            if (grantedSubclassFile) {
                const allSubclasses = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile);
                if (allSubclasses && typeof allSubclasses === "object") {
                    const subclassNames = Object.keys(allSubclasses);
                    if (subclassNames.length > 0) {
                        const subDiv = container.createDiv({ cls: "dnd-form-subpanel" });
                        subDiv.createEl("label", { text: "Subclass: ", cls: "dnd-form-label-sub" });
                        const subSelect = subDiv.createEl("select", { cls: "dnd-modal-form-input" });
                        subSelect.createEl("option", { text: "-- Select a Subclass --", value: "" });
                        subclassNames.forEach(s => subSelect.createEl("option", { text: s, value: s }));
                        subSelect.value = this.wizardData.subclass || "";
                        subSelect.onchange = (e) => this.wizardData.subclass = (e.target as HTMLSelectElement).value;
                    }
                }
            } else {
                this.wizardData.subclass = "";
            }
        }

        // --- BACKGROUND SECTION ---
        const bgDiv = container.createDiv({ cls: "dnd-form-group" });
        bgDiv.createEl("label", { text: "Background: ", cls: "dnd-form-label" });
        const bgSelect = bgDiv.createEl("select", { cls: "dnd-modal-form-input" });
        bgSelect.createEl("option", { text: "-- Select a Background --", value: "" });
        this.availableBackgrounds.forEach(b => bgSelect.createEl("option", { text: b, value: b }));
        bgSelect.value = this.wizardData.background || "";

        bgSelect.onchange = async (e) => {
            this.wizardData.background = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };
    }

    async renderStepTwo(container: HTMLElement) {
        container.createEl("h3", { text: "Stats & Abilities", cls: "dnd-class-header" });

        // Fetch both Class and Background JSON exactly ONCE at the top of Step 2!
        let classData: any = null;
        if (this.wizardData.dndClass) {
            classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
        }
        let bgData: any = null;
        if (this.wizardData.background) {
            bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
        }

        // 1. Base Stats Grid
        const statsGrid = container.createDiv({ cls: "dnd-form-grid-3" });
        const stats = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

        stats.forEach(stat => {
            const statKey = stat.toLowerCase();
            if (this.wizardData[statKey] === undefined) this.wizardData[statKey] = 10;

            const statDiv = statsGrid.createDiv();
            statDiv.createEl("label", { text: `${stat}:`, cls: "dnd-form-label-sm" });

            const statInput = statDiv.createEl("input", { type: "number", value: String(this.wizardData[statKey]), cls: "dnd-modal-form-input" });
            statInput.onchange = (e) => {
                this.wizardData[statKey] = Number((e.target as HTMLInputElement).value);
                if (statKey === "constitution") this.renderStep();
            };
        });

        // 2. Health & Speed Controls
        const vitalsGrid = container.createDiv({ cls: "dnd-form-grid-2" });

        const speedDiv = vitalsGrid.createDiv();
        speedDiv.createEl("label", { text: "Speed (ft):", cls: "dnd-form-label-sm" });
        const speedInput = speedDiv.createEl("input", { type: "number", value: String(this.wizardData.speed), cls: "dnd-modal-form-input" });
        speedInput.onchange = (e) => this.wizardData.speed = Number((e.target as HTMLInputElement).value);

        const hpDiv = vitalsGrid.createDiv();
        let hitDieMax = 8;
        const rawWizardHd = classData?.HitDice || classData?.hitDice || classData?.hit_dice || classData?.hitDie || classData?.hit_die;
        if (rawWizardHd) {
            const parsedHitDie = parseInt(String(rawWizardHd).replace(/\D/g, ''));
            if (!isNaN(parsedHitDie) && parsedHitDie > 0) hitDieMax = parsedHitDie;
        }
        const wizardLevel = Math.max(1, Number(this.wizardData.level) || 1);

        hpDiv.createEl("label", { text: `Max Health (Hit Die: d${hitDieMax}):`, cls: "dnd-form-label-sm" });
        const hpWrapper = hpDiv.createDiv({ cls: "dnd-modal-add-bar" });

        const hpInput = hpWrapper.createEl("input", { type: "number", value: String(this.wizardData.maxHealth), cls: "dnd-modal-form-input" });
        hpInput.onchange = (e) => this.wizardData.maxHealth = Number((e.target as HTMLInputElement).value);

        const autoBtnLabel = wizardLevel > 1 ? `Auto (Lvl ${wizardLevel})` : "Auto (Lvl 1)";
        const autoBtnTitle = wizardLevel > 1
            ? `Lvl 1 Max (d${hitDieMax} + CON) + Lvl 2–${wizardLevel} Average`
            : `Max Hit Die (d${hitDieMax}) + CON Modifier`;
        const autoHpBtn = hpWrapper.createEl("button", { text: autoBtnLabel, attr: { title: autoBtnTitle } });
        autoHpBtn.onclick = async () => {
            let totalCon = this.wizardData.constitution || 10;
            if (this.wizardData.chosenAbilityBonuses) {
                totalCon += this.wizardData.chosenAbilityBonuses.filter((b: string) => b.toLowerCase() === "constitution").length;
            }

            const conMod = Math.floor((totalCon - 10) / 2);
            const lvl1Hp = hitDieMax + conMod;
            const avgPerHigherLvl = Math.ceil(hitDieMax / 2) + 1 + conMod;
            this.wizardData.maxHealth = Math.max(1, lvl1Hp + (wizardLevel - 1) * avgPerHigherLvl);
            await this.renderStep();
        };

        // 3. Spellcasting Dropdown
        if (this.wizardData.dndClass) {
            if (classData && classData.spellcastingAbilities && Array.isArray(classData.spellcastingAbilities)) {
                const spellDiv = container.createDiv({ cls: "dnd-form-group" });
                spellDiv.createEl("label", { text: "Primary Spellcasting Ability: ", cls: "dnd-form-label-sub" });
                const spellSelect = spellDiv.createEl("select", { cls: "dnd-modal-form-input" });
                spellSelect.createEl("option", { text: "-- Select Ability --", value: "" });

                classData.spellcastingAbilities.forEach((ability: string) => spellSelect.createEl("option", { text: ability, value: ability }));

                if (classData.spellcastingAbilities.length === 1) {
                    this.wizardData.DnD_spellcasting_ability = classData.spellcastingAbilities[0];
                }

                spellSelect.value = this.wizardData.DnD_spellcasting_ability || "";
                spellSelect.onchange = (e) => this.wizardData.DnD_spellcasting_ability = (e.target as HTMLSelectElement).value;
            }
        }

        // 4. Class Skills Pool (Dynamic Dropdowns)
        if (this.wizardData.dndClass) {
            const sp = classData?.skillsPool;

            if (sp && Array.isArray(sp) && sp.length === 2) {
                const availableSkills = sp[0] as string[];
                const numChoices = sp[1] as number;

                if (availableSkills.length > 0 && numChoices > 0) {
                    const skillsDiv = container.createDiv({ cls: "dnd-form-divider-section" });
                    skillsDiv.createEl("label", { text: `Class Skill Proficiencies (Choose ${numChoices}):`, cls: "dnd-form-label-sub" });

                    if (!this.wizardData.chosenSkills || this.wizardData.chosenSkills.length !== numChoices) {
                        this.wizardData.chosenSkills = new Array(numChoices).fill("");
                    }

                    const skillGrid = skillsDiv.createDiv({ cls: "dnd-form-grid-2" });

                    for (let i = 0; i < numChoices; i++) {
                        const skillSelect = skillGrid.createEl("select", { cls: "dnd-modal-form-input" });
                        skillSelect.createEl("option", { text: `-- Select Skill ${i + 1} --`, value: "" });

                        availableSkills.forEach((skill: string) => {
                            const displaySkill = skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                            skillSelect.createEl("option", { text: displaySkill, value: skill });
                        });

                        skillSelect.value = this.wizardData.chosenSkills[i] || "";
                        skillSelect.onchange = (e) => {
                            this.wizardData.chosenSkills[i] = (e.target as HTMLSelectElement).value;
                        };
                    }
                }
            }
        }

        // 5. Background Ability Score Bonuses
        if (bgData && bgData.abilityBonusPool && Array.isArray(bgData.abilityBonusPool)) {
            const bonusDiv = container.createDiv({ cls: "dnd-form-group" });
            bonusDiv.createEl("label", { text: "Background Ability Bonuses (+3 total):", cls: "dnd-form-label-sub" });

            if (!this.wizardData.chosenAbilityBonuses || this.wizardData.chosenAbilityBonuses.length !== 3) {
                this.wizardData.chosenAbilityBonuses = ["", "", ""];
            }

            const bonusGrid = bonusDiv.createDiv({ cls: "dnd-form-grid-3" });

            for (let i = 0; i < 3; i++) {
                const bonusSelect = bonusGrid.createEl("select", { cls: "dnd-modal-form-input" });
                bonusSelect.createEl("option", { text: `-- +1 Bonus --`, value: "" });

                bgData.abilityBonusPool.forEach((ability: string) => {
                    const displayAbil = ability.charAt(0).toUpperCase() + ability.slice(1);
                    bonusSelect.createEl("option", { text: displayAbil, value: ability });
                });

                bonusSelect.value = this.wizardData.chosenAbilityBonuses[i] || "";
                bonusSelect.onchange = (e) => {
                    this.wizardData.chosenAbilityBonuses[i] = (e.target as HTMLSelectElement).value;
                    if ((e.target as HTMLSelectElement).value.toLowerCase() === "constitution" || this.wizardData.chosenAbilityBonuses.includes("constitution")) {
                        this.renderStep();
                    }
                };
            }
            bonusDiv.createEl("small", { text: "Tip: Assign +1 to three different stats, or +2 to one and +1 to another.", cls: "dnd-form-hint" });
        }

        // 6. Background Skills Pool (Dynamic Dropdowns)
        if (bgData && bgData.skillsPool && Array.isArray(bgData.skillsPool) && bgData.skillsPool.length === 2) {
            const availableBgSkills = bgData.skillsPool[0] as string[];
            const numBgChoices = bgData.skillsPool[1] as number;

            if (availableBgSkills.length > 0 && numBgChoices > 0) {
                const bgSkillsDiv = container.createDiv({ cls: "dnd-form-group" });
                bgSkillsDiv.createEl("label", { text: `Background Skill Proficiencies (Choose ${numBgChoices}):`, cls: "dnd-form-label-sub" });

                if (!this.wizardData.chosenBgSkills || this.wizardData.chosenBgSkills.length !== numBgChoices) {
                    this.wizardData.chosenBgSkills = new Array(numBgChoices).fill("");
                }

                const bgSkillGrid = bgSkillsDiv.createDiv({ cls: "dnd-form-grid-2" });

                for (let i = 0; i < numBgChoices; i++) {
                    const skillSelect = bgSkillGrid.createEl("select", { cls: "dnd-modal-form-input" });
                    skillSelect.createEl("option", { text: `-- Select Skill ${i + 1} --`, value: "" });

                    availableBgSkills.forEach((skill: string) => {
                        const displaySkill = skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                        skillSelect.createEl("option", { text: displaySkill, value: skill });
                    });

                    skillSelect.value = this.wizardData.chosenBgSkills[i] || "";
                    skillSelect.onchange = (e) => {
                        this.wizardData.chosenBgSkills[i] = (e.target as HTMLSelectElement).value;
                    };
                }
            }
        }

        // 7. Automatic Background Skills (Read-Only Display)
        if (bgData && bgData.skills && Array.isArray(bgData.skills) && bgData.skills.length > 0) {
            const autoBgSkillsDiv = container.createDiv({ cls: "dnd-form-group" });
            autoBgSkillsDiv.createEl("label", { text: `Background Granted Skills:`, cls: "dnd-form-label-sub" });

            const autoSkillsText = bgData.skills.map((skill: string) => {
                return skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }).join(', ');

            autoBgSkillsDiv.createEl("div", {
                text: autoSkillsText,
                cls: "dnd-form-readonly-box"
            });
        }
    }

    async renderStepThree(container: HTMLElement) {
        container.createEl("h3", { text: "Class Options", cls: "dnd-class-header" });
        container.createEl("p", { text: "Select your specialized class features.", cls: "dnd-form-hint-block" });

        let hasChoices = false;

        // NEW: Fetch Background Skills so we know what they are proficient in for Expertise!
        let availableProficiencies: string[] = [];
        availableProficiencies.push(...(this.wizardData.chosenSkills || []));
        availableProficiencies.push(...(this.wizardData.chosenBgSkills || []));

        if (this.wizardData.background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgData?.skills) availableProficiencies.push(...bgData.skills);
        }
        // Clean and lowercase the pool for clean dropdowns
        availableProficiencies = [...new Set(availableProficiencies.filter(s => s !== "").map(s => s.toLowerCase()))];

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);

            // NEW: Fetch Subclass data if granted at or before this level!
            let subclassData: any = null;
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, Number(this.wizardData.level) || 1);
            if (this.wizardData.subclass && grantedSubclassFile) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile, this.wizardData.subclass);
            }

            if (classData && classData.features) {
                // INSTEAD of looping 1 to level, we strictly read the JSON payload for the TARGET level!
                // This perfectly matches your JSON design (e.g. Warlock Level 5 explicitly listing 5 invocations).
                let levelFeatures: any[] = [];
                const targetLevel = this.wizardData.level.toString();

                if (classData.features[targetLevel]) {
                    levelFeatures = levelFeatures.concat(classData.features[targetLevel]);
                }
                if (subclassData && subclassData[targetLevel]) {
                    levelFeatures = levelFeatures.concat(subclassData[targetLevel]);
                }

                if (levelFeatures.length > 0) {
                    for (const feature of levelFeatures) {
                        // If this feature has a dynamic Class Choices array in the JSON...
                        if (feature.classChoices && Array.isArray(feature.classChoices)) {
                            hasChoices = true;

                            for (let choiceIndex = 0; choiceIndex < feature.classChoices.length; choiceIndex++) {
                                const routerName = feature.classChoices[choiceIndex];
                                const routerData = await getClassChoiceData(this.app, this.plugin.settings, routerName);

                                if (routerData) {
                                    const choiceDiv = container.createDiv({ cls: "dnd-form-card" });

                                    const displayName = routerName.split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                    choiceDiv.createEl("label", {
                                        text: `Level ${targetLevel}: ${feature.name} (${displayName} ${choiceIndex + 1})`,
                                        cls: "dnd-form-label-bold"
                                    });

                                    const selectEl = choiceDiv.createEl("select", { cls: "dnd-modal-form-input" });
                                    selectEl.createEl("option", { text: `-- Select Option --`, value: "" });

                                    Object.entries(routerData).forEach(([key, val]) => {
                                        selectEl.createEl("option", { text: val as string, value: key });
                                    });

                                    const existingChoice = this.wizardData.classChoices.find((c: any) => c[0] === routerName && c[2] === targetLevel && c[3] === choiceIndex);
                                    if (existingChoice) selectEl.value = existingChoice[1];

                                    selectEl.onchange = (e) => {
                                        const selectedVal = (e.target as HTMLSelectElement).value;
                                        this.wizardData.classChoices = this.wizardData.classChoices.filter((c: any) => !(c[0] === routerName && c[2] === targetLevel && c[3] === choiceIndex));

                                        if (selectedVal) {
                                            this.wizardData.classChoices.push([routerName, selectedVal, targetLevel, choiceIndex]);
                                        }
                                    };
                                }
                            }
                        }

                        // --- EXPERTISE ENGINE (grantedExpertise) ---
                        if (feature.grantedExpertise && Array.isArray(feature.grantedExpertise) && feature.grantedExpertise.length === 2) {
                            hasChoices = true;
                            const expPool = feature.grantedExpertise[0] as string[];
                            const grantedExpertiseCount = feature.grantedExpertise[1] as number;

                            if (grantedExpertiseCount > 0) {
                                const expDiv = container.createDiv({ cls: "dnd-form-card" });
                                expDiv.createEl("label", {
                                    text: `Level ${targetLevel}: ${feature.name} (${grantedExpertiseCount} Choices)`,
                                    cls: "dnd-form-label-bold"
                                });
                                expDiv.createEl("small", {
                                    text: "Select skills you are already proficient in to gain Expertise.",
                                    cls: "dnd-form-hint-block"
                                });

                                let filteredProficiencies = availableProficiencies;
                                if (expPool.length > 0) {
                                    filteredProficiencies = availableProficiencies.filter(skill => expPool.map(s => String(s).toLowerCase()).includes(String(skill).toLowerCase()));
                                }

                                if (!this.wizardData.expertiseChoices || this.wizardData.expertiseChoices.length !== grantedExpertiseCount) {
                                    this.wizardData.expertiseChoices = Array(grantedExpertiseCount).fill(["", targetLevel]);
                                }

                                if (filteredProficiencies.length === 0) {
                                    expDiv.createEl("p", {
                                        text: "You have no eligible skill proficiencies to gain Expertise in. Please go back to Step 2 and select your class/background skills first!",
                                        cls: "dnd-error-text dnd-form-note"
                                    });
                                } else {
                                    for (let e = 0; e < grantedExpertiseCount; e++) {
                                        const selectDiv = expDiv.createDiv({ cls: "dnd-form-slot-row" });
                                        selectDiv.createEl("small", { text: `Choice ${e + 1}:`, cls: "dnd-form-slot-label-sm" });

                                        const selectEl = selectDiv.createEl("select", { cls: "dnd-flex-1" });
                                        selectEl.createEl("option", { text: `-- Select Expertise --`, value: "" });

                                        filteredProficiencies.forEach(skill => {
                                            const displaySkill = skill.replace(/\b\w/g, c => c.toUpperCase());
                                            selectEl.createEl("option", { text: displaySkill, value: skill });
                                        });

                                        if (this.wizardData.expertiseChoices[e]) selectEl.value = this.wizardData.expertiseChoices[e][0];

                                        selectEl.onchange = (evt) => {
                                            const val = (evt.target as HTMLSelectElement).value;
                                            this.wizardData.expertiseChoices[e] = [val, targetLevel];
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!hasChoices) {
            container.createEl("p", {
                text: "No additional class choices available for this level.",
                cls: "dnd-form-note"
            });
        }
    }

    async renderStepFour(container: HTMLElement) {
        // Changed the header text slightly since Background is now in Step 1
        container.createEl("h3", { text: "Equipment & Feats", cls: "dnd-class-header" });

        // Languages & Feats Grid
        const extraGrid = container.createDiv({ cls: "dnd-form-grid-2" });

        const langDiv = extraGrid.createDiv();
        langDiv.createEl("label", { text: "Languages: ", cls: "dnd-form-label-sm" });
        const langInput = langDiv.createEl("input", { type: "text", value: this.wizardData.languages, cls: "dnd-modal-form-input" });
        langInput.placeholder = "Common, Elvish...";
        langInput.onchange = (e) => this.wizardData.languages = (e.target as HTMLInputElement).value;

        const featDiv = extraGrid.createDiv();
        featDiv.createEl("label", { text: "Extra Feats: ", cls: "dnd-form-label-sm" });
        const featInput = featDiv.createEl("input", { type: "text", value: this.wizardData.extraFeats, cls: "dnd-modal-form-input" });
        featInput.placeholder = "Tough, Alert...";
        featInput.onchange = (e) => this.wizardData.extraFeats = (e.target as HTMLInputElement).value;

        // HELPER: Extracts flexible ('|') item choice slots from a startingEquipment option
        interface FlexibleItemSlot {
            acceptedTypes: string[];
            labelText: string;
        }
        const getFlexibleSlots = (equipmentData: any): FlexibleItemSlot[] => {
            const slots: FlexibleItemSlot[] = [];
            if (!equipmentData || !equipmentData.items || typeof equipmentData.items !== "object") {
                return slots;
            }
            for (const [key, rawQty] of Object.entries(equipmentData.items)) {
                if (!key.includes("|")) continue;
                const qty = Math.max(1, Number(rawQty) || 1);
                const acceptedTypes = key
                    .split("|")
                    .map(t => t.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-'))
                    .filter(Boolean);
                if (acceptedTypes.length === 0) continue;

                const formattedTypes = acceptedTypes.map(typeSlug =>
                    typeSlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                ).join(' / ');

                for (let i = 0; i < qty; i++) {
                    const suffix = qty > 1 ? ` #${i + 1}` : "";
                    slots.push({
                        acceptedTypes,
                        labelText: `${formattedTypes}${suffix}`
                    });
                }
            }
            return slots;
        };

        const renderFlexibleItemDropdowns = (
            parentContainer: HTMLElement,
            prefixLabel: string,
            slots: FlexibleItemSlot[],
            dataKey: "classChosenItems" | "backgroundChosenItems"
        ) => {
            if (slots.length === 0) {
                this.wizardData[dataKey] = [];
                return;
            }

            const existingRaw = this.wizardData[dataKey];
            const existingArr: string[] = Array.isArray(existingRaw)
                ? existingRaw.map(v => String(v || ""))
                : (typeof existingRaw === "string" && existingRaw.trim() !== ""
                    ? existingRaw.split(",").map(s => s.trim())
                    : []);

            const normalizedSelections: string[] = new Array(slots.length).fill("");
            const subpanel = parentContainer.createDiv({ cls: "dnd-form-subpanel" });

            slots.forEach((slot, idx) => {
                const matchingItems = this.availableItems.filter(item =>
                    slot.acceptedTypes.includes(item.type)
                );

                subpanel.createEl("label", {
                    text: `${prefixLabel} (${slot.labelText}): `,
                    cls: "dnd-form-label-sub"
                });

                const selectEl = subpanel.createEl("select", { cls: "dnd-modal-form-input" });
                selectEl.createEl("option", { text: `-- Select ${slot.labelText} --`, value: "" });

                matchingItems.forEach(item => {
                    selectEl.createEl("option", { text: item.name, value: item.id });
                });

                const candidate = existingArr[idx] || "";
                const matchedItem = matchingItems.find(
                    item => item.id.toLowerCase() === candidate.toLowerCase() || item.name.toLowerCase() === candidate.toLowerCase()
                );
                if (matchedItem) {
                    selectEl.value = matchedItem.id;
                    normalizedSelections[idx] = matchedItem.id;
                }

                selectEl.onchange = (e) => {
                    normalizedSelections[idx] = (e.target as HTMLSelectElement).value;
                    this.wizardData[dataKey] = [...normalizedSelections];
                };
            });

            this.wizardData[dataKey] = normalizedSelections;
        };

        // --- Class Equipment Section ---
        let classFlexSlots: FlexibleItemSlot[] = [];
        let classEqOptions = ["A", "B"]; // Safe fallback

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (classData?.startingEquipment) {
                // Dynamically fetch A, B, C, etc. directly from the JSON
                classEqOptions = Object.keys(classData.startingEquipment).sort();

                const eqChoice = classEqOptions.includes(this.wizardData.classEquipment)
                    ? this.wizardData.classEquipment
                    : classEqOptions[0];
                if (classData.startingEquipment[eqChoice]) {
                    classFlexSlots = getFlexibleSlots(classData.startingEquipment[eqChoice]);
                }
            }
        }

        const classEqDiv = container.createDiv({ cls: "dnd-form-group" });
        classEqDiv.createEl("label", { text: "Class Starting Equipment Choice: ", cls: "dnd-form-label" });
        const classEqSelect = classEqDiv.createEl("select", { cls: "dnd-modal-form-input" });

        classEqOptions.forEach(opt => {
            classEqSelect.createEl("option", { text: `Choice ${opt}`, value: opt });
        });

        if (!classEqOptions.includes(this.wizardData.classEquipment)) {
            this.wizardData.classEquipment = classEqOptions[0];
        }
        classEqSelect.value = this.wizardData.classEquipment;

        classEqSelect.onchange = async (e) => {
            this.wizardData.classEquipment = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };

        renderFlexibleItemDropdowns(container, "Class Chosen Item", classFlexSlots, "classChosenItems");

        // --- Background Equipment Section ---
        let bgFlexSlots: FlexibleItemSlot[] = [];
        let bgEqOptions = ["A", "B"]; // Safe fallback

        if (this.wizardData.background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgData?.startingEquipment) {
                bgEqOptions = Object.keys(bgData.startingEquipment).sort();

                const eqChoice = bgEqOptions.includes(this.wizardData.backgroundEquipment)
                    ? this.wizardData.backgroundEquipment
                    : bgEqOptions[0];
                if (bgData.startingEquipment[eqChoice]) {
                    bgFlexSlots = getFlexibleSlots(bgData.startingEquipment[eqChoice]);
                }
            }
        }

        const bgEqDiv = container.createDiv({ cls: "dnd-form-group" });
        bgEqDiv.createEl("label", { text: "Background Starting Equipment Choice: ", cls: "dnd-form-label" });
        const bgEqSelect = bgEqDiv.createEl("select", { cls: "dnd-modal-form-input" });

        bgEqOptions.forEach(opt => {
            bgEqSelect.createEl("option", { text: `Choice ${opt}`, value: opt });
        });

        if (!bgEqOptions.includes(this.wizardData.backgroundEquipment)) {
            this.wizardData.backgroundEquipment = bgEqOptions[0];
        }
        bgEqSelect.value = this.wizardData.backgroundEquipment;

        bgEqSelect.onchange = async (e) => {
            this.wizardData.backgroundEquipment = (e.target as HTMLSelectElement).value;
            await this.renderStep();
        };

        renderFlexibleItemDropdowns(container, "Background Chosen Item", bgFlexSlots, "backgroundChosenItems");

        // --- Equipped Items (Weapon & Armor with Custom Toggle) ---
        container.createEl("h4", { text: "Equipped Items", cls: "dnd-wizard-subhead" });

        const createModeToggle = (parentRow: HTMLElement, isCustom: boolean, onToggle: () => void) => {
            const toggleWrap = parentRow.createDiv({
                cls: "dnd-equip-toggle-wrapper",
                attr: { title: "Switch between Rulebook Database and Custom Item" }
            });

            toggleWrap.createEl("span", {
                text: "Custom",
                cls: `dnd-equip-toggle-label ${isCustom ? "is-active" : ""}`
            });

            const switchTrack = toggleWrap.createDiv({
                cls: `dnd-toggle-switch ${isCustom ? "is-active" : ""}`
            });
            switchTrack.createDiv({ cls: "dnd-toggle-knob" });

            toggleWrap.onclick = () => onToggle();
        };

        // 1. WEAPON SECTION
        const bgDataForMastery = this.wizardData.background
            ? await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background)
            : null;
        const wizardMasteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            this.wizardData.dndClass,
            [Number(this.wizardData.level) || 1],
            Number(this.wizardData.level) || 1,
            this.wizardData.extraFeats,
            bgDataForMastery?.feat,
            this.wizardData.subclass,
            this.plugin.settings
        );
        const availableMasterySlots = wizardMasteryCalc.totalSlots;
        if (!Array.isArray(this.wizardData.weaponMasteries)) {
            this.wizardData.weaponMasteries = [];
        }

        const weaponSection = container.createDiv({ cls: "dnd-form-group-lg" });
        const weaponLabelRow = weaponSection.createDiv({ cls: "dnd-flex-between" });
        weaponLabelRow.createEl("label", { text: "Weapon Name:", cls: "dnd-form-label-sub" });
        const viewMasteriesLink = weaponLabelRow.createEl("a", {
            text: "📖 View Weapon Masteries",
            cls: "dnd-note-link dnd-form-hint",
            href: "#"
        });
        viewMasteriesLink.onclick = (e) => {
            e.preventDefault();
            new NoteModal(this.app, this.plugin, "weapon-masteries").open();
        };

        const weaponRow = weaponSection.createDiv({ cls: "dnd-equip-row" });
        const masteryCheckboxContainer = weaponSection.createDiv();

        const renderWizardWeaponMasteryToggle = () => {
            masteryCheckboxContainer.empty();
            if (this.wizardData.isWeaponCustom || !this.wizardData.weapon || this.wizardData.weapon === "None") return;
            const matchedWeapon = this.availableWeapons.find(w => w.name === this.wizardData.weapon);
            if (!matchedWeapon || !matchedWeapon.mastery) return;

            const weaponSlug = sanitizeWeaponSlug(matchedWeapon.id || matchedWeapon.name);
            const currentMastered: string[] = Array.isArray(this.wizardData.weaponMasteries) ? this.wizardData.weaponMasteries : [];
            const isChecked = currentMastered.includes(weaponSlug);
            const usedCount = currentMastered.length;
            const isDisabled = availableMasterySlots <= 0 || (!isChecked && usedCount >= availableMasterySlots);

            const masteryRow = masteryCheckboxContainer.createDiv({ cls: "dnd-form-row" });
            const cb = masteryRow.createEl("input", { type: "checkbox" });
            cb.checked = isChecked && availableMasterySlots > 0;
            cb.disabled = isDisabled;
            cb.onchange = (ev) => {
                const checked = (ev.target as HTMLInputElement).checked;
                let list: string[] = Array.isArray(this.wizardData.weaponMasteries) ? [...this.wizardData.weaponMasteries] : [];
                if (checked) {
                    if (list.length < availableMasterySlots && !list.includes(weaponSlug)) {
                        list.push(weaponSlug);
                    }
                } else {
                    list = list.filter(s => s !== weaponSlug);
                }
                this.wizardData.weaponMasteries = list;
                renderWizardWeaponMasteryToggle();
            };

            const labelText = availableMasterySlots > 0
                ? `Use Weapon Mastery (${matchedWeapon.mastery}) — ${usedCount} / ${availableMasterySlots} Masteries Used`
                : `Use Weapon Mastery (${matchedWeapon.mastery}) — 0 Masteries Available`;
            masteryRow.createEl("label", { text: labelText });
        };

        if (!this.wizardData.isWeaponCustom) {
            const weaponSelect = weaponRow.createEl("select", { cls: "dnd-equip-field" });
            weaponSelect.createEl("option", { text: "-- Select a Weapon --", value: "" });
            weaponSelect.createEl("option", { text: "None (Unarmed)", value: "None" });

            this.availableWeapons.forEach(w => {
                const metaParts = [w.damage, w.mastery].filter(Boolean);
                const metaSuffix = metaParts.length > 0 ? ` (${metaParts.join(", ")})` : "";
                weaponSelect.createEl("option", { text: `${w.name}${metaSuffix}`, value: w.name });
            });

            weaponSelect.value = this.wizardData.weapon || "";
            weaponSelect.onchange = (e) => {
                this.wizardData.weapon = (e.target as HTMLSelectElement).value;
                const matched = this.availableWeapons.find(w => w.name === this.wizardData.weapon);
                if (matched) {
                    this.wizardData.weaponDamage = matched.damage;
                } else if (this.wizardData.weapon === "None" || this.wizardData.weapon === "") {
                    this.wizardData.weaponDamage = "";
                }
                renderWizardWeaponMasteryToggle();
            };
        } else {
            const weaponInput = weaponRow.createEl("input", {
                type: "text",
                value: this.wizardData.weapon === "None" ? "" : (this.wizardData.weapon || ""),
                cls: "dnd-equip-field"
            });
            weaponInput.placeholder = "e.g., Sun Blade";
            weaponInput.oninput = (e) => {
                this.wizardData.weapon = (e.target as HTMLInputElement).value;
            };
        }

        renderWizardWeaponMasteryToggle();

        createModeToggle(weaponRow, Boolean(this.wizardData.isWeaponCustom), () => {
            this.wizardData.isWeaponCustom = !this.wizardData.isWeaponCustom;
            if (!this.wizardData.isWeaponCustom) {
                const matched = this.availableWeapons.find(
                    w => w.name.toLowerCase() === String(this.wizardData.weapon || "").toLowerCase()
                );
                this.wizardData.weapon = matched ? matched.name : "";
                this.wizardData.weaponDamage = matched ? matched.damage : "";
            }
            this.renderStep();
        });

        if (this.wizardData.isWeaponCustom) {
            const weaponSub = weaponSection.createDiv({ cls: "dnd-equip-custom-sub" });
            weaponSub.createEl("label", { text: "Weapon Damage:", cls: "dnd-form-label-sm" });
            const dmgInput = weaponSub.createEl("input", {
                type: "text",
                value: this.wizardData.weaponDamage || "",
                cls: "dnd-equip-field"
            });
            dmgInput.placeholder = "e.g., 1d8 + 2 Radiant";
            dmgInput.oninput = (e) => {
                this.wizardData.weaponDamage = (e.target as HTMLInputElement).value;
            };
        }

        // 2. ARMOR SECTION
        const armorSection = container.createDiv({ cls: "dnd-form-group" });
        armorSection.createEl("label", { text: "Armor Name:", cls: "dnd-form-label-sub" });

        const armorRow = armorSection.createDiv({ cls: "dnd-equip-row" });

        if (!this.wizardData.isArmorCustom) {
            const armorSelect = armorRow.createEl("select", { cls: "dnd-equip-field" });
            armorSelect.createEl("option", { text: "-- Select Armor --", value: "" });
            armorSelect.createEl("option", { text: "None (Unarmored)", value: "None" });

            this.availableArmors.forEach(a => {
                const catLabel = a.category ? `, ${a.category}` : "";
                armorSelect.createEl("option", { text: `${a.name} (AC ${a.ac}${catLabel})`, value: a.name });
            });

            armorSelect.value = this.wizardData.armor || "";
            armorSelect.onchange = (e) => {
                this.wizardData.armor = (e.target as HTMLSelectElement).value;
                const matched = this.availableArmors.find(a => a.name === this.wizardData.armor);
                if (matched) {
                    this.wizardData.armorAc = Number(matched.ac) || 10;
                } else if (this.wizardData.armor === "None" || this.wizardData.armor === "") {
                    this.wizardData.armorAc = 10;
                }
            };
        } else {
            const armorInput = armorRow.createEl("input", {
                type: "text",
                value: this.wizardData.armor === "None" ? "" : (this.wizardData.armor || ""),
                cls: "dnd-equip-field"
            });
            armorInput.placeholder = "e.g., Elven Chain";
            armorInput.oninput = (e) => {
                this.wizardData.armor = (e.target as HTMLInputElement).value;
            };
        }

        createModeToggle(armorRow, Boolean(this.wizardData.isArmorCustom), () => {
            this.wizardData.isArmorCustom = !this.wizardData.isArmorCustom;
            if (!this.wizardData.isArmorCustom) {
                const matched = this.availableArmors.find(
                    a => a.name.toLowerCase() === String(this.wizardData.armor || "").toLowerCase()
                );
                this.wizardData.armor = matched ? matched.name : "";
                this.wizardData.armorAc = matched ? (Number(matched.ac) || 10) : "";
            }
            this.renderStep();
        });

        if (this.wizardData.isArmorCustom) {
            const armorSub = armorSection.createDiv({ cls: "dnd-equip-custom-sub" });
            armorSub.createEl("label", { text: "Armor AC:", cls: "dnd-form-label-sm" });
            const acInput = armorSub.createEl("input", {
                type: "number",
                value: String(this.wizardData.armorAc ?? ""),
                cls: "dnd-equip-field"
            });
            acInput.placeholder = "e.g., 16";
            acInput.oninput = (e) => {
                this.wizardData.armorAc = (e.target as HTMLInputElement).value;
            };
        }
    }

    renderStepFive(container: HTMLElement) {
        container.createEl("h3", { text: "Finalization", cls: "dnd-class-header" });
        container.createEl("p", { text: "Review your choices. Clicking finish will generate the sheet!" });
    }

    async finishWizard() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            new Notice("Error: Please open a note to generate the character sheet.");
            return;
        }

        // 1. Generate unique state keys based on Character Name
        const rawName = this.wizardData.name || "hero";
        const safeName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomId = Math.random().toString(36).substring(2, 6);
        const stateKey = `${safeName}_${randomId}`;

        // 2. Fetch Dynamic Data from Class & Background JSON
        let DnD_hit_dice = "d8";
        let savingThrows: string[] = [];
        let proficiencyBonusArray: any[] | null = null;
        let bgFeat = "";
        let bgDataStore: any = null;
        let unarmoredDefense = "";
        let attackStat = "strength";
        let spellcastingData: any = null;
        let pactMagicData: any = null;
        let initialSpeedMod = 0;
        const wizardLvlNum = Number(this.wizardData.level) || 1;

        if (this.wizardData.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (classData) {
                const hd = classData.HitDice || classData.hitDice || classData.hit_dice || classData.hitDie || classData.hit_die;
                if (hd) DnD_hit_dice = String(hd).trim();

                if (classData.savingThroughProf && Array.isArray(classData.savingThroughProf)) {
                    savingThrows = classData.savingThroughProf;
                }

                if (classData.proficiencyBonus && Array.isArray(classData.proficiencyBonus)) {
                    proficiencyBonusArray = classData.proficiencyBonus;
                }

                // Extract Data-Driven Mechanics
                if (classData.unarmoredDefense) unarmoredDefense = String(classData.unarmoredDefense).toLowerCase().trim();
                if (classData.defaultAttackStat) attackStat = String(classData.defaultAttackStat).toLowerCase().trim();

                // Extract Spellcasting Engine Data
                if (classData.spellcasting) spellcastingData = classData.spellcasting;
                if (classData.pactMagic) pactMagicData = classData.pactMagic;
            }
        }

        if (this.wizardData.background) {
            bgDataStore = await getBackgroundData(this.app, this.plugin.settings, this.wizardData.background);
            if (bgDataStore && bgDataStore.feat) {
                bgFeat = bgDataStore.feat.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            }
        }

        // --- Calculate Final Stats (Base + Background Bonuses + Fixed Feat Bonuses) ---
        const getStatDetails = (statName: string) => {
            const base = this.wizardData[statName] || 10;
            const bonus = this.wizardData.chosenAbilityBonuses
                ? this.wizardData.chosenAbilityBonuses.filter((b: string) => b.toLowerCase() === statName.toLowerCase()).length
                : 0;
            return { base, bonus, final: base + bonus };
        };

        const strStats = getStatDetails("strength");
        const dexStats = getStatDetails("dexterity");
        const conStats = getStatDetails("constitution");
        const intStats = getStatDetails("intelligence");
        const wisStats = getStatDetails("wisdom");
        const chaStats = getStatDetails("charisma");

        // --- Dynamic AC & Unarmed Strike Calculation ---
        const wizardStatsRecord: Record<string, number> = {
            strength: strStats.final,
            dexterity: dexStats.final,
            constitution: conStats.final,
            intelligence: intStats.final,
            wisdom: wisStats.final,
            charisma: chaStats.final
        };

        const wizardExtraFeats = Array.isArray(this.wizardData.extraFeats)
            ? this.wizardData.extraFeats
            : (typeof this.wizardData.extraFeats === "string"
                ? this.wizardData.extraFeats.split(',').map((s: string) => s.trim()).filter((s: string) => s !== "")
                : (this.wizardData.extraFeats ? [this.wizardData.extraFeats] : []));

        for (const fKey of wizardExtraFeats) {
            if (!fKey) continue;
            const fData = await getExtraFeat(this.app, this.plugin.settings, String(fKey));
            if (fData) {
                const improvements = parseFeatAbilityImprovements(fData);
                for (const imp of improvements) {
                    if (!imp.isChoice && imp.options.length === 1) {
                        const targetStat = imp.options[0];
                        const curr = wizardStatsRecord[targetStat] || 10;
                        wizardStatsRecord[targetStat] = Math.min(imp.maxCap, curr + imp.amount);
                    }
                }
            }
        }

        // Resolve Speed Modifier deterministically adhering to D&D 5.5e
        const speedCalc = await this.plugin.resolveCharacterSpeedModifiers(
            this.wizardData.dndClass,
            this.wizardData.classLevels,
            wizardLvlNum,
            wizardExtraFeats,
            bgDataStore?.feat,
            this.wizardData.armor,
            this.wizardData.speed || 30,
            0,
            this.wizardData.subclass,
            this.plugin.settings
        );
        initialSpeedMod = speedCalc.totalSpeedMod;

        // If "Unarmed Strike" was chosen as the weapon, compute its dynamic scaling damage
        const safeWizardWeapon = String(this.wizardData.weapon || "").toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        if (!this.wizardData.isWeaponCustom && (safeWizardWeapon === "unarmed-strike" || safeWizardWeapon === "unarmed-strikes")) {
            this.wizardData.weaponDamage = await this.plugin.resolveUnarmedStrikeDamage(
                this.wizardData.dndClass,
                null,
                Number(this.wizardData.level) || 1,
                wizardStatsRecord,
                attackStat,
                this.plugin.settings
            );
        }

        const dexMod = Math.floor((wizardStatsRecord.dexterity - 10) / 2);
        let armorAcBonus = dexMod;
        let isUnarmored = true;
        const parsedManualAc = parseInt(String(this.wizardData.armorAc));

        if (!this.wizardData.isArmorCustom) {
            if (this.wizardData.armor && this.wizardData.armor.toLowerCase() !== "none") {
                const safeArmorName = this.wizardData.armor.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
                const armorData = await getItemData(this.app, this.plugin.settings, safeArmorName);

                if (armorData && armorData.ac && armorData.category) {
                    const category = String(armorData.category).toLowerCase();
                    if (!category.includes("unarmored") && safeArmorName !== "unarmored-defense") {
                        isUnarmored = false;
                        this.wizardData.armorAc = parseInt(String(armorData.ac));
                        if (category.includes("light")) {
                            armorAcBonus = dexMod;
                        } else if (category.includes("medium")) {
                            armorAcBonus = Math.min(dexMod, 2);
                        } else if (category.includes("heavy")) {
                            armorAcBonus = 0;
                        }
                    }
                }
            }
        } else {
            const cleanCustomArmor = String(this.wizardData.armor || "").trim();
            if (cleanCustomArmor && cleanCustomArmor.toLowerCase() !== "none") {
                isUnarmored = false;
                this.wizardData.armorAc = !isNaN(parsedManualAc) ? parsedManualAc : 10;
                armorAcBonus = 0;
            } else if (!isNaN(parsedManualAc)) {
                isUnarmored = false;
                this.wizardData.armorAc = parsedManualAc;
                armorAcBonus = 0;
            }
        }

        if (isUnarmored) {
            const unarmoredCalc = await this.plugin.resolveUnarmoredDefense(
                this.wizardData.dndClass,
                null,
                Number(this.wizardData.level) || 1,
                wizardStatsRecord,
                this.plugin.settings
            );
            this.wizardData.armorAc = unarmoredCalc.baseAc;
            armorAcBonus = unarmoredCalc.acBonus;
        }

        this.wizardData.armorAcBonus = armorAcBonus;
        this.wizardData.armorAcMod = 0; // Initialize manual modifier strictly to 0

        // 3. Prepare the Template string
        let finalContent = (await this.plugin.getTemplateContent()) || "";
        if (!finalContent) {
            new Notice("Error: Template missing from registry!");
            return;
        }

        // 4. Inject Frontmatter Data
        const lvlIdx = Math.max(0, (Number(this.wizardData.level) || 1) - 1);
        const DnD_proficiency_bonus = (proficiencyBonusArray && proficiencyBonusArray[lvlIdx] !== undefined)
            ? Number(proficiencyBonusArray[lvlIdx]) || Math.ceil(1 + (this.wizardData.level / 4))
            : Math.ceil(1 + (this.wizardData.level / 4));

        const injectYAML = (key: string, value: any) => {
            if (value !== undefined && value !== "") {
                const regex = new RegExp(`^${key}:.*$`, "m");
                if (regex.test(finalContent)) {
                    finalContent = finalContent.replace(regex, `${key}: ${value}`);
                } else {
                    // Safely insert before the CLOSING '---' of the frontmatter block!
                    finalContent = finalContent.replace(/^(---\r?\n[\s\S]*?\r?\n)---/m, `$1${key}: ${value}\n---`);
                }
            }
        };

        const injectListYAML = (key: string, value: any) => {
            if (value !== undefined && value !== null && value !== "") {
                const arr = Array.isArray(value)
                    ? value.map(v => String(v ?? "").trim()).filter(s => s !== "")
                    : (typeof value === "string"
                        ? value.split(',').map(s => s.trim()).filter(s => s !== "")
                        : []);
                if (arr.length === 0) return;
                const listStr = "\n" + arr.map(v => `  - ${v}`).join("\n");
                const regex = new RegExp(`^${key}:.*$`, "m");
                if (regex.test(finalContent)) {
                    finalContent = finalContent.replace(regex, `${key}:${listStr}`);
                } else {
                    // Safely insert before the CLOSING '---' of the frontmatter block!
                    finalContent = finalContent.replace(/^(---\r?\n[\s\S]*?\r?\n)---/m, `$1${key}:${listStr}\n---`);
                }
            }
        };

        // --- Core Single Variables ---
        injectYAML("DnD_id", stateKey);
        finalContent = finalContent.replace(/^level:/m, "DnD_level:");
        finalContent = finalContent.replace(/frontmatter\.level\b/g, "frontmatter.DnD_level");
        finalContent = finalContent.replace(/^proficiency_bonus:/m, "DnD_proficiencyBonus:");
        finalContent = finalContent.replace(/frontmatter\.proficiency_bonus\b/g, "frontmatter.DnD_proficiencyBonus");
        finalContent = finalContent.replace(/^(spellcasting_ability|DnD_spellcasting-ability):/m, "DnD_spellcastingAbility:");
        injectYAML("DnD_level", this.wizardData.level);
        injectYAML("DnD_proficiencyBonus", DnD_proficiency_bonus);
        injectYAML("DnD_raceLineage", this.wizardData.raceLineage);
        injectYAML("DnD_background", this.wizardData.background);
        injectYAML("DnD_backgroundFeat", bgFeat);
        injectYAML("DnD_spellcastingAbility", this.wizardData.DnD_spellcasting_ability);
        injectYAML("DnD_classEquipment", this.wizardData.classEquipment);
        injectYAML("DnD_backgroundEquipment", this.wizardData.backgroundEquipment);
        const finalClassChoices = this.wizardData.classChoices.map((c: any[]) => [String(c[1]), String(c[2])]);
        // Wrapping in single quotes forces Obsidian's UI to accept it as a clean text string!
        injectYAML("DnD_classChoices", `'${JSON.stringify(finalClassChoices)}'`);

        // --- Compile Starting Equipment into DnD_starterEquipment ---
        const sanitizeWizardItem = (val: any) => {
            if (!val) return null;
            return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        };

        const buildWizardItemPool = async (rawItems: any) => {
            const list = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? rawItems.split(',') : (rawItems ? [String(rawItems)] : []));
            const pool: { id: string; type: string }[] = [];
            for (const item of list) {
                const rawStr = String(item || "").trim();
                if (!rawStr) continue;
                const matchedFromPool = this.availableItems.find(
                    it => it.id.toLowerCase() === rawStr.toLowerCase() || it.name.toLowerCase() === rawStr.toLowerCase()
                );
                const resolvedId = matchedFromPool ? matchedFromPool.id : sanitizeWizardItem(rawStr);
                if (!resolvedId) continue;
                const data = await getItemData(this.app, this.plugin.settings, resolvedId);
                if (data && data.type) {
                    pool.push({ id: resolvedId, type: sanitizeWizardItem(data.type) as string });
                }
            }
            return pool;
        };

        const classChosenPool = await buildWizardItemPool(this.wizardData.classChosenItems);
        const bgChosenPool = await buildWizardItemPool(this.wizardData.backgroundChosenItems);
        const starterItemCounts: Record<string, number> = {};

        const collectStartingItems = (eqData: any, sourcePool: { id: string; type: string }[]) => {
            if (!eqData) return;
            const itemsList = eqData.items ? eqData.items : (eqData.gold ? null : eqData);
            if (!itemsList) return;

            const strictSlots: [string, number][] = [];
            const flexibleSlots: [string, number][] = [];

            for (const [itemId, qty] of Object.entries(itemsList)) {
                if (itemId.includes('|')) flexibleSlots.push([itemId, Number(qty)]);
                else strictSlots.push([itemId, Number(qty)]);
            }

            for (const [itemId, qty] of strictSlots) {
                starterItemCounts[itemId] = (starterItemCounts[itemId] || 0) + Number(qty);
            }

            const getCleanAcceptedTypes = (rawKey: string) =>
                rawKey.split('|').map(t => sanitizeWizardItem(t)).filter((t): t is string => Boolean(t));

            flexibleSlots.sort((a, b) => getCleanAcceptedTypes(a[0]).length - getCleanAcceptedTypes(b[0]).length);
            for (const [itemId, qty] of flexibleSlots) {
                const acceptedTypes = getCleanAcceptedTypes(itemId);
                let amountNeeded = Number(qty);
                for (let i = 0; i < sourcePool.length && amountNeeded > 0; i++) {
                    const poolItem = sourcePool[i];
                    if (acceptedTypes.includes(poolItem.type)) {
                        starterItemCounts[poolItem.id] = (starterItemCounts[poolItem.id] || 0) + 1;
                        amountNeeded -= 1;
                        sourcePool.splice(i, 1);
                        i--;
                    }
                }
            }
        };

        if (this.wizardData.dndClass && this.wizardData.classEquipment) {
            const cData = await getClassData(this.app, this.plugin.settings, this.wizardData.dndClass);
            if (cData?.startingEquipment) {
                collectStartingItems(cData.startingEquipment[this.wizardData.classEquipment], classChosenPool);
            }
        }
        if (bgDataStore && this.wizardData.backgroundEquipment && bgDataStore.startingEquipment) {
            collectStartingItems(bgDataStore.startingEquipment[this.wizardData.backgroundEquipment], bgChosenPool);
        }

        const compiledStarterEquipment: [string, string, string][] = Object.entries(starterItemCounts)
            .filter(([_, qty]) => qty > 0)
            .map(([id, qty]) => [String(id), String(qty), "true"]);

        injectYAML("DnD_starterEquipment", `'${JSON.stringify(compiledStarterEquipment)}'`);
        injectYAML("DnD_inventoryItems", `'[]'`);
        injectYAML("DnD_customItems", `'[]'`);
        finalContent = finalContent.replace(
            /^extraItems:.*$/m,
            `starterEquipment: frontmatter.DnD_starterEquipment\ninventoryItems: frontmatter.DnD_inventoryItems\ncustomItems: frontmatter.DnD_customItems\nwealthAdded: frontmatter.DnD_wealthAdded\nwealthSpent: frontmatter.DnD_wealthSpent`
        );
        finalContent = finalContent.replace(/^DnD_spellcasting_ability:/m, "spellcastingAbility:");

        // Upgrade legacy gold frontmatter lines to 4-Currency Wealth arrays
        finalContent = finalContent.replace(/^dnd_gold_added:/m, "DnD_wealthAdded:");
        finalContent = finalContent.replace(/^dnd_gold_spent:/m, "DnD_wealthSpent:");
        injectYAML("DnD_wealthAdded", `'["0","0","0","0"]'`);
        injectYAML("DnD_wealthSpent", `'["0","0","0","0"]'`);

        // Initialize Empty Spells Arrays
        injectYAML("DnD_spells", `'[]'`);
        injectYAML("DnD_preparedSpells", `'[]'`);

        // Dynamically Build Consolidated 9-Element Spell Slots Array: '[["<Spell-Slots>","<Used-Spell-Slots>"], ...]'
        const targetLvl = this.wizardData.level.toString();
        const compiledSpellSlots: [string, string][] = Array.from({ length: 9 }, () => ["0", "0"]);

        if (spellcastingData && spellcastingData[targetLvl] && Array.isArray(spellcastingData[targetLvl].slots)) {
            const slots = spellcastingData[targetLvl].slots;
            for (let i = 0; i < 9; i++) {
                const maxStr = String(Number(slots[i]) || 0);
                compiledSpellSlots[i] = [maxStr, "0"];
            }
        }
        // Clean up any legacy DnD_spellSlots_1..9 lines if they exist in the template, then inject DnD_spellSlots
        finalContent = finalContent.replace(/^DnD_spellSlots_[2-9]:.*\n?/gm, "");
        finalContent = finalContent.replace(/^DnD_spellSlots_1:/m, "DnD_spellSlots:");
        injectYAML("DnD_spellSlots", `'${JSON.stringify(compiledSpellSlots)}'`);

        // --- NEW: EXPERTISE & PROFICIENCY ARRAYS ---
        // Compile the Proficiency Array: [["stealth", "class"], ["history", "background"]]
        let compiledProficiencies: any[] = [];
        (this.wizardData.chosenSkills || []).forEach((s: string) => { if (s) compiledProficiencies.push([String(s), "class"]); });
        (this.wizardData.chosenBgSkills || []).forEach((s: string) => { if (s) compiledProficiencies.push([String(s), "background"]); });
        if (bgDataStore && bgDataStore.skills) {
            bgDataStore.skills.forEach((s: string) => { if (s) compiledProficiencies.push([String(s).toLowerCase(), "background"]); });
        }
        // Wrapping in single quotes prevents Obsidian UI warnings
        injectYAML("DnD_skillProficiencies", `'${JSON.stringify(compiledProficiencies)}'`);

        // Compile Expertise: [["stealth", "1"]] (using strings in arrays)
        const finalExpertise = (this.wizardData.expertiseChoices || [])
            .filter((c: any[]) => c[0] !== "")
            .map((c: any[]) => [String(c[0]), String(c[1])]);
        // Wrapping in single quotes prevents Obsidian UI warnings
        injectYAML("DnD_skillExpertise", `'${JSON.stringify(finalExpertise)}'`);

        // Map Class Saving Throw Proficiencies ("savingThroughProf") into DnD_classProficiencies
        const formattedClassProfs = savingThrows.map((st: string) => String(st).toLowerCase());
        injectYAML("DnD_classProficiencies", `'${JSON.stringify(formattedClassProfs)}'`);

        // --- Core List Variables ---
        injectListYAML("DnD_race", this.wizardData.race);
        injectListYAML("DnD_class", this.wizardData.dndClass);
        injectListYAML("DnD_subclass", this.wizardData.subclass);
        injectListYAML("DnD_languages", this.wizardData.languages);
        injectListYAML("DnD_extraFeats", this.wizardData.extraFeats);
        injectListYAML("DnD_classChosenItems", this.wizardData.classChosenItems);
        injectListYAML("DnD_backgroundChosenItems", this.wizardData.backgroundChosenItems);
        injectYAML("DnD_featureUses", `'[]'`);
        injectYAML("DnD_hideFeature", `'[]'`);

        // --- Equipment & Combat Formula variables ---
        const finalMasteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            this.wizardData.dndClass,
            [Number(this.wizardData.level) || 1],
            Number(this.wizardData.level) || 1,
            this.wizardData.extraFeats,
            bgDataStore?.feat,
            this.wizardData.subclass,
            this.plugin.settings
        );
        const validMastered = Array.isArray(this.wizardData.weaponMasteries)
            ? this.wizardData.weaponMasteries.slice(0, finalMasteryCalc.totalSlots)
            : [];
        const serializedWeaponMastery = serializeWeaponMasteryState(finalMasteryCalc.totalSlots, validMastered);

        injectYAML("DnD_weapon", this.wizardData.weapon);
        injectYAML("DnD_weaponDamage", this.wizardData.weaponDamage);
        injectYAML("DnD_weaponMastery", `'${serializedWeaponMastery}'`);
        injectYAML("DnD_armor", this.wizardData.armor);
        injectYAML("DnD_armorAc", this.wizardData.armorAc);
        injectYAML("DnD_armorAcBonus", this.wizardData.armorAcBonus);
        injectYAML("DnD_armorAcMod", this.wizardData.armorAcMod);
        injectYAML("DnD_attackRollMod", 0);
        injectYAML("DnD_unarmoredDefense", unarmoredDefense);
        injectYAML("DnD_attackStat", attackStat);

        // --- Stat variables ---
        const DnD_current_health = this.wizardData.maxHealth;
        injectYAML("DnD_maxHealth", this.wizardData.maxHealth);
        injectYAML("DnD_currentHealth", DnD_current_health);
        injectYAML("DnD_hitDice", DnD_hit_dice);
        injectYAML("DnD_speed", this.wizardData.speed);
        injectYAML("DnD_speedMod", initialSpeedMod);
        injectYAML("DnD_strength", wizardStatsRecord.strength);
        injectYAML("DnD_dexterity", wizardStatsRecord.dexterity);
        injectYAML("DnD_constitution", wizardStatsRecord.constitution);
        injectYAML("DnD_intelligence", wizardStatsRecord.intelligence);
        injectYAML("DnD_wisdom", wizardStatsRecord.wisdom);
        injectYAML("DnD_charisma", wizardStatsRecord.charisma);

        // --- 5B. PRECISE SKILLS BLOCK REWRITING ---
        const cSkills = compiledProficiencies.filter(p => p[1] === "class").map(p => `  - ${p[0]}`);
        const bSkills = compiledProficiencies.filter(p => p[1] === "background").map(p => `  - ${p[0]}`);

        let profInject = "";
        if (cSkills.length > 0) profInject += `  #Class\n${cSkills.join('\n')}\n`;
        if (bSkills.length > 0) profInject += `  #Background\n${bSkills.join('\n')}\n`;
        if (profInject === "") profInject = "  - <chosen skills>\n";

        // Matches both ```dnd-skills and legacy ```skills if the template uses inline lists
        const profRegex = /(```(?:dnd-)?skills[\s\S]*?proficiencies:\s*\n)([\s\S]*?)(?=\n[ \t]*expertise:)/;
        finalContent = finalContent.replace(profRegex, `$1${profInject}`);

        let expInject = finalExpertise.length > 0
            ? finalExpertise.map((e: any[]) => `  - ${e[0]}`).join('\n') + '\n'
            : "  - <chosen skills>\n";

        const expRegex = /(expertise:\s*\n)([\s\S]*?)(?=\n[ \t]*half_proficiencies:)/;
        finalContent = finalContent.replace(expRegex, `$1${expInject}`);

        // 6. Paste to Editor and Finalize UI State
        try {
            const currentState = view.getState();
            if (currentState.mode !== 'source') {
                currentState.mode = 'source';
                await view.setState(currentState, { history: false });
            }

            setTimeout(async () => {
                view.editor.replaceSelection(finalContent);
                new Notice("Character Sheet Generated Successfully!");

                const newState = view.getState();
                newState.mode = 'preview';
                await view.setState(newState, { history: false });
            }, 100);
        } catch (error) {
            console.error("Failed to insert template:", error);
            new Notice("Error: Could not insert template file.");
        }

        this.close();
    }
}

// --- THE POP-UP UI ---
class NoteModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    noteKey: string;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, noteKey: string) {
        super(app);
        this.plugin = plugin;
        this.noteKey = noteKey;
    }

    async onOpen() {
        const { contentEl, titleEl } = this;

        const formattedTitle = this.noteKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        titleEl.setText(formattedTitle);

        const fetchNativeNote = (): string | null => MarkdownNotes[this.noteKey] || null;

        const fetchCustomNote = async (basePath: string): Promise<string | null> => {
            const mdPath = normalizePath(`${basePath}/markdown/${this.noteKey}.md`);
            if (await this.app.vault.adapter.exists(mdPath)) {
                try {
                    return await this.app.vault.adapter.read(mdPath);
                } catch (e) {
                    console.error(`NoteModal Error: Failed to read custom markdown at ${mdPath}`, e);
                }
            }
            return null;
        };

        // 1st & 2nd STAGE: Resolve Markdown Note with Custom Rulebook Priority
        const customBasePath = this.plugin.settings.customRulebookPath?.trim() || "";
        let fileContent: string | null = null;

        if (!customBasePath) {
            fileContent = fetchNativeNote();
        } else if (this.plugin.settings.customRulebookPriority) {
            fileContent = (await fetchCustomNote(customBasePath)) ?? fetchNativeNote();
        } else {
            fileContent = fetchNativeNote() ?? (await fetchCustomNote(customBasePath));
        }

        if (fileContent) {
            MarkdownRenderer.render(this.app, fileContent, contentEl, "", null as any);
        } else {
            contentEl.createEl("p", {
                text: `Error: Could not find "${this.noteKey}" in the bundled Markdown registry or Custom Rulebook.`,
                cls: "dnd-error-text"
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- Settings Tab UI ---
class DnDSettingsTab extends PluginSettingTab {
    plugin: DnDCharacterSheetHelperPlugin;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Triggers all open Markdown notes to re-render safely when rulebook settings change
    private refreshOpenSheets() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                const file = leaf.view.file;
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache) {
                    this.app.metadataCache.trigger('changed', file, '', cache);
                }
            }
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'D&D 5.5e Features Settings' });

        // Toggle for Combining Class & Subclass
        new Setting(containerEl)
            .setName('Combine Class and Subclass Features')
            .setDesc('If enabled, subclass features will be mixed chronologically into the main class section.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.combineClassSubclass)
                .onChange(async (value) => {
                    this.plugin.settings.combineClassSubclass = value;
                    await this.plugin.saveSettings();
                    this.refreshOpenSheets();
                    this.display();
                }));

        // --- Custom Rulebook Settings ---
        containerEl.createEl('h3', { text: 'Homebrew & Custom Data', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Add your own custom JSON files to expand or overwrite the native rulebook.', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('Custom Rulebook Folder Path')
            .setDesc('Enter the path to your custom rulebook folder within your vault (e.g., "TTRPG/My Rulebook"). Leave blank to disable.')
            .addText(text => text
                .setPlaceholder('Folder path...')
                .setValue(this.plugin.settings.customRulebookPath)
                .onChange(async (value) => {
                    this.plugin.settings.customRulebookPath = value;
                    await this.plugin.saveSettings();
                    await this.plugin.syncWeaponMasteriesMarkdown();
                    this.refreshOpenSheets();
                }));

        new Setting(containerEl)
            .setName('Custom Rulebook Priority')
            .setDesc('If enabled, custom homebrew files will completely overwrite native files with the same name. If disabled, native files take priority.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.customRulebookPriority)
                .onChange(async (value) => {
                    this.plugin.settings.customRulebookPriority = value;
                    await this.plugin.saveSettings();
                    await this.plugin.syncWeaponMasteriesMarkdown();
                    this.refreshOpenSheets();
                }));

        // Draggable List for Section Order
        containerEl.createEl('h3', { text: 'Section Render Order', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Drag and drop the sections below to change their display order. If "Combine Class and Subclass" is enabled, the Subclass block will be hidden.', cls: 'setting-item-description' });

        const listContainer = containerEl.createDiv({ cls: 'dnd-draggable-list' });
        let dragSource: HTMLElement | null = null;

        // Loop through our saved array to build the UI
        this.plugin.settings.sectionOrder.forEach((sectionName) => {
            if (this.plugin.settings.combineClassSubclass && sectionName === 'Subclass') return;

            const item = listContainer.createDiv({ text: sectionName, cls: 'dnd-draggable-item' });
            item.draggable = true;

            item.addEventListener('dragstart', () => {
                dragSource = item;
                item.style.opacity = '0.4';
            });

            item.addEventListener('dragover', (e) => e.preventDefault()); // Required to allow dropping

            item.addEventListener('dragenter', (e) => {
                if (e.target !== dragSource) {
                    (e.target as HTMLElement).style.border = '1px dashed var(--text-accent)';
                }
            });

            item.addEventListener('dragleave', (e) => {
                (e.target as HTMLElement).style.border = '1px solid var(--dnd-ui-color-border-primary)';
            });

            item.addEventListener('drop', async (e) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;

                if (dragSource && dragSource !== target) {
                    // Update the array order in memory
                    const fromIndex = this.plugin.settings.sectionOrder.indexOf(dragSource.innerText);
                    const toIndex = this.plugin.settings.sectionOrder.indexOf(target.innerText);

                    const [movedItem] = this.plugin.settings.sectionOrder.splice(fromIndex, 1);
                    this.plugin.settings.sectionOrder.splice(toIndex, 0, movedItem);

                    // Save and refresh UI
                    await this.plugin.saveSettings();
                    this.refreshOpenSheets();
                    this.display();
                }
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });
        });

        // --- Theme Engine UI ---
        containerEl.createEl('h3', { text: 'Appearance & Theming', cls: 'setting-item-name dnd-settings-header' });
        containerEl.createEl('p', { text: 'Select a preset theme or customize individual colors. Changes apply instantly.', cls: 'setting-item-description' });

        // Build the Theme Dropdown
        const themeDropdown = new Setting(containerEl)
            .setName('Theme Preset')
            .setDesc('Choose a predefined color theme.');

        themeDropdown.addDropdown(drop => {
            Object.entries(THEMES).forEach(([key, theme]) => {
                drop.addOption(key, theme.name);
            });
            drop.setValue(this.plugin.settings.selectedTheme);
            drop.onChange(async (value) => {
                const theme = THEMES[value];
                if (theme) {
                    this.plugin.settings.selectedTheme = value;
                    Object.assign(this.plugin.settings, theme.colors);
                    this.plugin.applyTheme();
                    await this.plugin.saveSettings();
                    this.display();
                }
            });
        });

        // Generate Color Pickers
        const COLOR_GROUPS: { header: string; keys: (keyof DnDPluginSettings)[] }[] = [
            { header: "Background Colors", keys: ["colorBgPrimary", "colorBgSecondary", "colorBgTertiary", "colorBgHover", "colorBgDarker", "colorBgGroup", "colorBgProficient"] },
            { header: "Text Colors", keys: ["colorTextPrimary", "colorTextSecondary", "colorTextSublabel", "colorTextBright", "colorTextMuted", "colorTextGroup"] },
            { header: "Border Colors", keys: ["colorBorderPrimary", "colorBorderActive", "colorBorderFocus"] },
            { header: "Accents", keys: ["colorAccentTeal", "colorAccentRed", "colorAccentPurple"] }
        ];

        COLOR_GROUPS.forEach(group => {
            containerEl.createEl('h4', { text: group.header, cls: 'dnd-settings-subgroup' });

            group.keys.forEach((key) => {
                const readableName = key.replace('color', '').replace(/([A-Z])/g, ' $1').trim();

                new Setting(containerEl)
                    .setName(readableName)
                    .addColorPicker(color => color
                        .setValue(this.plugin.settings[key] as string)
                        .onChange(async (value) => {
                            (this.plugin.settings as any)[key] = value;
                            this.plugin.settings.selectedTheme = "custom";
                            this.plugin.applyTheme();
                            await this.plugin.saveSettings();
                        }));
            });
        });
    }
}

// --- EQUIP ITEMS MODAL ---
class EquipItemsModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    weaponName: string = "";
    weaponDamage: string = "";
    armorName: string = "";
    armorAc: string = "";

    originalWeapon: string = "";
    originalWeaponDamage: string = "";
    originalArmor: string = "";
    originalArmorAc: string = "";

    isWeaponCustom: boolean = false;
    isArmorCustom: boolean = false;

    weaponMasteryState: WeaponMasteryState = { available: 0, mastered: [] };
    originalWeaponMasterySerialized: string = "";

    availableWeapons: { id: string; name: string; damage: string; mastery: string }[] = [];
    availableArmors: { id: string; name: string; ac: string; category: string }[] = [];

    formContainer!: HTMLElement;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Equip Items", cls: "dnd-section-header" });

        // 1. Fetch current loadout from frontmatter
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.originalWeapon = String(frontmatter["DnD_weapon"] ?? "").trim();
        this.originalWeaponDamage = String(frontmatter["DnD_weaponDamage"] ?? "").trim();
        this.originalArmor = String(frontmatter["DnD_armor"] ?? "").trim();
        this.originalArmorAc = frontmatter["DnD_armorAc"] !== undefined ? String(frontmatter["DnD_armorAc"]).trim() : "";

        this.weaponName = this.originalWeapon;
        this.weaponDamage = this.originalWeaponDamage;
        this.armorName = this.originalArmor;
        this.armorAc = this.originalArmorAc;

        this.weaponMasteryState = parseWeaponMasteryState(frontmatter["DnD_weaponMastery"]);
        const bgData = frontmatter["DnD_background"]
            ? await getBackgroundData(this.app, this.plugin.settings, frontmatter["DnD_background"])
            : null;
        const masteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"],
            frontmatter["DnD_classLevels"],
            Number(frontmatter["DnD_level"]) || 1,
            frontmatter["DnD_extraFeats"],
            bgData?.feat || frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings
        );
        this.weaponMasteryState.available = masteryCalc.totalSlots;
        this.originalWeaponMasterySerialized = serializeWeaponMasteryState(
            this.weaponMasteryState.available,
            this.weaponMasteryState.mastered
        );

        // 2. Load available Weapons and Armors from native registry + custom rulebook
        await this.fetchEquipmentPools();

        // 3. Auto-detect whether the currently equipped weapon/armor is a custom item
        if (this.weaponName && this.weaponName.toLowerCase() !== "none") {
            const matchedWeapon = this.availableWeapons.find(
                w => w.name.toLowerCase() === this.weaponName.toLowerCase() || w.id.toLowerCase() === this.weaponName.toLowerCase()
            );
            if (matchedWeapon) {
                this.weaponName = matchedWeapon.name;
                this.isWeaponCustom = false;
            } else {
                this.isWeaponCustom = true;
            }
        }

        if (this.armorName && this.armorName.toLowerCase() !== "none") {
            const matchedArmor = this.availableArmors.find(
                a => a.name.toLowerCase() === this.armorName.toLowerCase() || a.id.toLowerCase() === this.armorName.toLowerCase()
            );
            if (matchedArmor) {
                this.armorName = matchedArmor.name;
                this.isArmorCustom = false;
            } else {
                this.isArmorCustom = true;
            }
        }

        // 4. Create dynamic form container & footer buttons
        this.formContainer = contentEl.createDiv();
        this.renderForm();

        const btnDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnDiv.createEl("button", { text: "Equip Loadout", cls: "mod-cta" });
        confirmBtn.onclick = async () => {
            await this.equipItems();
        };
    }

    async fetchEquipmentPools() {
        const itemLookupKeys = new Set<string>(Object.keys(itemsMap || {}));
        const basePath = this.plugin.settings.customRulebookPath?.trim();

        if (basePath) {
            const customItemsPath = normalizePath(`${basePath}/items.json`);
            try {
                if (await this.app.vault.adapter.exists(customItemsPath)) {
                    const content = await this.app.vault.adapter.read(customItemsPath);
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === "object") {
                        Object.keys(parsed).forEach(k => itemLookupKeys.add(k));
                    }
                }
            } catch (e) {
                console.error(`EquipItemsModal: Could not read custom items.json at ${customItemsPath}`, e);
            }
        }

        const weaponsMap = new Map<string, { id: string; name: string; damage: string; mastery: string }>();
        const armorsMap = new Map<string, { id: string; name: string; ac: string; category: string }>();

        for (const key of itemLookupKeys) {
            const data = await getItemData(this.app, this.plugin.settings, key);
            if (!data || !data.type) continue;

            const typeLower = String(data.type).toLowerCase();
            const displayName = String(data.name || key).trim();
            const mapKey = displayName.toLowerCase();

            if (typeLower.includes("weapon")) {
                const masteryInfo = data.mastery
                    ? await getWeaponMasteryDescription(this.app, this.plugin.settings, data.mastery)
                    : null;
                weaponsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    damage: String(data.damage || ""),
                    mastery: masteryInfo ? masteryInfo.name : ""
                });
            } else if (typeLower.includes("armor")) {
                armorsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    ac: String(data.ac || "10"),
                    category: String(data.category || "")
                });
            }
        }

        this.availableWeapons = Array.from(weaponsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        this.availableArmors = Array.from(armorsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    renderForm() {
        this.formContainer.empty();

        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === "Enter") this.equipItems();
        };

        // Helper to build the themed pill toggle switch on the right of each field
        const createModeToggle = (parentRow: HTMLElement, isCustom: boolean, onToggle: () => void) => {
            const toggleWrap = parentRow.createDiv({
                cls: "dnd-equip-toggle-wrapper",
                attr: { title: "Switch between Rulebook Database and Custom Item" }
            });

            toggleWrap.createEl("span", {
                text: "Custom",
                cls: `dnd-equip-toggle-label ${isCustom ? "is-active" : ""}`
            });

            const switchTrack = toggleWrap.createDiv({
                cls: `dnd-toggle-switch ${isCustom ? "is-active" : ""}`
            });
            switchTrack.createDiv({ cls: "dnd-toggle-knob" });

            toggleWrap.onclick = () => onToggle();
        };

        // ==========================================
        // 1. WEAPON SECTION
        // ==========================================
        const weaponSection = this.formContainer.createDiv({ cls: "dnd-form-group-lg" });
        const weaponLabelRow = weaponSection.createDiv({ cls: "dnd-flex-between" });
        weaponLabelRow.createEl("label", { text: "Weapon Name:", cls: "dnd-form-label-sub" });
        const viewMasteriesLink = weaponLabelRow.createEl("a", {
            text: "📖 View Weapon Masteries",
            cls: "dnd-note-link dnd-form-hint",
            href: "#"
        });
        viewMasteriesLink.onclick = (e) => {
            e.preventDefault();
            new NoteModal(this.app, this.plugin, "weapon-masteries").open();
        };

        const weaponRow = weaponSection.createDiv({ cls: "dnd-equip-row" });
        const masteryCheckboxContainer = weaponSection.createDiv();

        const renderEquipWeaponMasteryToggle = () => {
            masteryCheckboxContainer.empty();
            if (this.isWeaponCustom || !this.weaponName || this.weaponName === "None") return;
            const matchedWeapon = this.availableWeapons.find(w => w.name === this.weaponName);
            if (!matchedWeapon || !matchedWeapon.mastery) return;

            const weaponSlug = sanitizeWeaponSlug(matchedWeapon.id || matchedWeapon.name);
            const availableSlots = this.weaponMasteryState.available;
            const currentMastered = this.weaponMasteryState.mastered;
            const isChecked = currentMastered.includes(weaponSlug);
            const usedCount = currentMastered.length;
            const isDisabled = availableSlots <= 0 || (!isChecked && usedCount >= availableSlots);

            const masteryRow = masteryCheckboxContainer.createDiv({ cls: "dnd-form-row" });
            const cb = masteryRow.createEl("input", { type: "checkbox" });
            cb.checked = isChecked && availableSlots > 0;
            cb.disabled = isDisabled;
            cb.onchange = (ev) => {
                const checked = (ev.target as HTMLInputElement).checked;
                if (checked) {
                    if (this.weaponMasteryState.mastered.length < availableSlots && !this.weaponMasteryState.mastered.includes(weaponSlug)) {
                        this.weaponMasteryState.mastered.push(weaponSlug);
                    }
                } else {
                    this.weaponMasteryState.mastered = this.weaponMasteryState.mastered.filter(s => s !== weaponSlug);
                }
                renderEquipWeaponMasteryToggle();
            };

            const labelText = availableSlots > 0
                ? `Use Weapon Mastery (${matchedWeapon.mastery}) — ${usedCount} / ${availableSlots} Masteries Used`
                : `Use Weapon Mastery (${matchedWeapon.mastery}) — 0 Masteries Available`;
            masteryRow.createEl("label", { text: labelText });
        };

        if (!this.isWeaponCustom) {
            const weaponSelect = weaponRow.createEl("select", { cls: "dnd-equip-field" });
            weaponSelect.createEl("option", { text: "-- Select a Weapon --", value: "" });
            weaponSelect.createEl("option", { text: "None (Unarmed)", value: "None" });

            this.availableWeapons.forEach(w => {
                const metaParts = [w.damage, w.mastery].filter(Boolean);
                const metaSuffix = metaParts.length > 0 ? ` (${metaParts.join(", ")})` : "";
                weaponSelect.createEl("option", { text: `${w.name}${metaSuffix}`, value: w.name });
            });

            weaponSelect.value = this.weaponName;
            weaponSelect.onchange = (e) => {
                this.weaponName = (e.target as HTMLSelectElement).value;
                const matched = this.availableWeapons.find(w => w.name === this.weaponName);
                if (matched) {
                    this.weaponDamage = matched.damage;
                } else if (this.weaponName === "None" || this.weaponName === "") {
                    this.weaponDamage = "";
                }
                renderEquipWeaponMasteryToggle();
            };
        } else {
            const weaponInput = weaponRow.createEl("input", {
                type: "text",
                value: this.weaponName === "None" ? "" : this.weaponName,
                cls: "dnd-equip-field"
            });
            weaponInput.placeholder = "e.g., Sun Blade";
            weaponInput.oninput = (e) => {
                this.weaponName = (e.target as HTMLInputElement).value;
            };
            weaponInput.onkeyup = handleEnter;
        }

        renderEquipWeaponMasteryToggle();

        createModeToggle(weaponRow, this.isWeaponCustom, () => {
            this.isWeaponCustom = !this.isWeaponCustom;
            if (!this.isWeaponCustom) {
                const matched = this.availableWeapons.find(w => w.name.toLowerCase() === this.weaponName.toLowerCase());
                this.weaponName = matched ? matched.name : "";
                this.weaponDamage = matched ? matched.damage : "";
            }
            this.renderForm();
        });

        if (this.isWeaponCustom) {
            const weaponSub = weaponSection.createDiv({ cls: "dnd-equip-custom-sub" });
            weaponSub.createEl("label", { text: "Weapon Damage:", cls: "dnd-form-label-sm" });
            const dmgInput = weaponSub.createEl("input", {
                type: "text",
                value: this.weaponDamage,
                cls: "dnd-equip-field"
            });
            dmgInput.placeholder = "e.g., 1d8 + 2 Radiant";
            dmgInput.oninput = (e) => {
                this.weaponDamage = (e.target as HTMLInputElement).value;
            };
            dmgInput.onkeyup = handleEnter;
        }

        // ==========================================
        // 2. ARMOR SECTION
        // ==========================================
        const armorSection = this.formContainer.createDiv({ cls: "dnd-form-group" });
        armorSection.createEl("label", { text: "Armor Name:", cls: "dnd-form-label-sub" });

        const armorRow = armorSection.createDiv({ cls: "dnd-equip-row" });

        if (!this.isArmorCustom) {
            const armorSelect = armorRow.createEl("select", { cls: "dnd-equip-field" });
            armorSelect.createEl("option", { text: "-- Select Armor --", value: "" });
            armorSelect.createEl("option", { text: "None (Unarmored)", value: "None" });

            this.availableArmors.forEach(a => {
                const catLabel = a.category ? `, ${a.category}` : "";
                armorSelect.createEl("option", { text: `${a.name} (AC ${a.ac}${catLabel})`, value: a.name });
            });

            armorSelect.value = this.armorName;
            armorSelect.onchange = (e) => {
                this.armorName = (e.target as HTMLSelectElement).value;
                const matched = this.availableArmors.find(a => a.name === this.armorName);
                if (matched) {
                    this.armorAc = matched.ac;
                } else if (this.armorName === "None" || this.armorName === "") {
                    this.armorAc = "10";
                }
            };
        } else {
            const armorInput = armorRow.createEl("input", {
                type: "text",
                value: this.armorName === "None" ? "" : this.armorName,
                cls: "dnd-equip-field"
            });
            armorInput.placeholder = "e.g., Elven Chain";
            armorInput.oninput = (e) => {
                this.armorName = (e.target as HTMLInputElement).value;
            };
            armorInput.onkeyup = handleEnter;
        }

        createModeToggle(armorRow, this.isArmorCustom, () => {
            this.isArmorCustom = !this.isArmorCustom;
            if (!this.isArmorCustom) {
                const matched = this.availableArmors.find(a => a.name.toLowerCase() === this.armorName.toLowerCase());
                this.armorName = matched ? matched.name : "";
                this.armorAc = matched ? matched.ac : "10";
            }
            this.renderForm();
        });

        if (this.isArmorCustom) {
            const armorSub = armorSection.createDiv({ cls: "dnd-equip-custom-sub" });
            armorSub.createEl("label", { text: "Armor AC:", cls: "dnd-form-label-sm" });
            const acInput = armorSub.createEl("input", {
                type: "number",
                value: this.armorAc,
                cls: "dnd-equip-field"
            });
            acInput.placeholder = "e.g., 16";
            acInput.oninput = (e) => {
                this.armorAc = (e.target as HTMLInputElement).value;
            };
            acInput.onkeyup = handleEnter;
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    async equipItems() {
        const updates: Record<string, any> = {};
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        const statsRecord: Record<string, number> = {
            strength: Number(frontmatter["DnD_strength"]) || 10,
            dexterity: Number(frontmatter["DnD_dexterity"]) || 10,
            constitution: Number(frontmatter["DnD_constitution"]) || 10,
            intelligence: Number(frontmatter["DnD_intelligence"]) || 10,
            wisdom: Number(frontmatter["DnD_wisdom"]) || 10,
            charisma: Number(frontmatter["DnD_charisma"]) || 10
        };
        const level = Number(frontmatter["DnD_level"]) || 1;
        const dndClass = frontmatter["DnD_class"];
        const classLevels = frontmatter["DnD_classLevels"];
        const attackStat = String(frontmatter["DnD_attackStat"] || "strength");

        // 1. Process Weapon Update
        const weaponChanged = this.weaponName !== this.originalWeapon || (this.isWeaponCustom && this.weaponDamage !== this.originalWeaponDamage);
        if (weaponChanged) {
            if (!this.isWeaponCustom) {
                if (!this.weaponName || this.weaponName.toLowerCase() === "none") {
                    updates["DnD_weapon"] = "None";
                    updates["DnD_weaponDamage"] = "";
                } else {
                    const safeWeaponName = this.weaponName.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
                    const weaponData = await getItemData(this.app, this.plugin.settings, safeWeaponName);
                    updates["DnD_weapon"] = weaponData?.name || this.weaponName;
                    if (safeWeaponName === "unarmed-strike" || safeWeaponName === "unarmed-strikes") {
                        updates["DnD_weaponDamage"] = await this.plugin.resolveUnarmedStrikeDamage(
                            dndClass,
                            classLevels,
                            level,
                            statsRecord,
                            attackStat,
                            this.plugin.settings
                        );
                    } else {
                        updates["DnD_weaponDamage"] = weaponData?.damage || "";
                    }
                }
            } else {
                const cleanCustomWeapon = this.weaponName.trim();
                updates["DnD_weapon"] = cleanCustomWeapon || "None";
                updates["DnD_weaponDamage"] = cleanCustomWeapon ? this.weaponDamage.trim() : "";
            }
        }

        const newWeaponMasterySerialized = serializeWeaponMasteryState(
            this.weaponMasteryState.available,
            this.weaponMasteryState.mastered
        );
        if (newWeaponMasterySerialized !== this.originalWeaponMasterySerialized) {
            updates["DnD_weaponMastery"] = newWeaponMasterySerialized;
        }

        // 2. Process Armor Update
        const armorChanged = this.armorName !== this.originalArmor || (this.isArmorCustom && this.armorAc !== this.originalArmorAc);
        if (armorChanged) {
            const dexMod = Math.floor((statsRecord.dexterity - 10) / 2);
            const unarmoredCalc = await this.plugin.resolveUnarmoredDefense(
                dndClass,
                classLevels,
                level,
                statsRecord,
                this.plugin.settings
            );

            if (!this.isArmorCustom) {
                const safeArmorName = this.armorName.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
                const armorData = (this.armorName && this.armorName.toLowerCase() !== "none")
                    ? await getItemData(this.app, this.plugin.settings, safeArmorName)
                    : null;

                if (armorData && armorData.ac && armorData.category) {
                    const category = String(armorData.category).toLowerCase();
                    if (category.includes("unarmored") || safeArmorName === "unarmored-defense") {
                        updates["DnD_armor"] = armorData.name || "Unarmored Defense";
                        updates["DnD_armorAc"] = unarmoredCalc.baseAc;
                        updates["DnD_armorAcBonus"] = unarmoredCalc.acBonus;
                    } else {
                        const baseAc = parseInt(String(armorData.ac));
                        let armorAcBonus = dexMod;

                        if (category.includes("light")) armorAcBonus = dexMod;
                        else if (category.includes("medium")) armorAcBonus = Math.min(dexMod, 2);
                        else if (category.includes("heavy")) armorAcBonus = 0;

                        updates["DnD_armor"] = armorData.name;
                        updates["DnD_armorAc"] = baseAc;
                        updates["DnD_armorAcBonus"] = armorAcBonus;
                    }
                } else {
                    updates["DnD_armor"] = "None";
                    updates["DnD_armorAc"] = unarmoredCalc.baseAc;
                    updates["DnD_armorAcBonus"] = unarmoredCalc.acBonus;
                }
            } else {
                const cleanCustomArmor = this.armorName.trim();
                const parsedCustomAc = parseInt(this.armorAc);

                if (!cleanCustomArmor || cleanCustomArmor.toLowerCase() === "none") {
                    updates["DnD_armor"] = "None";
                    updates["DnD_armorAc"] = !isNaN(parsedCustomAc) ? parsedCustomAc : unarmoredCalc.baseAc;
                    updates["DnD_armorAcBonus"] = !isNaN(parsedCustomAc) ? 0 : unarmoredCalc.acBonus;
                } else {
                    updates["DnD_armor"] = cleanCustomArmor;
                    updates["DnD_armorAc"] = !isNaN(parsedCustomAc) ? parsedCustomAc : 10;
                    updates["DnD_armorAcBonus"] = 0;
                }
            }

            // Recalculate Speed Modifier in case Unarmored Movement, Fast Movement, or Roving is affected by armor
            const speedCalc = await this.plugin.resolveCharacterSpeedModifiers(
                dndClass,
                classLevels,
                level,
                frontmatter["DnD_extraFeats"],
                frontmatter["DnD_backgroundFeat"],
                updates["DnD_armor"] || this.armorName,
                frontmatter["DnD_speed"],
                frontmatter["DnD_customSpeedMod"],
                frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
                this.plugin.settings
            );
            updates["DnD_speedMod"] = speedCalc.totalSpeedMod;
        }

        if (Object.keys(updates).length > 0) {
            await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);
            new Notice("Loadout equipped successfully!");
        }

        this.close();
    }
}

// --- ITEM INFO POP-UP MODAL ---
class ItemInfoModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    itemData: any;
    sourcePath: string;
    renderChild!: MarkdownRenderChild;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, itemData: any, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.itemData = itemData;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl, titleEl } = this;
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        titleEl.setText(this.itemData?.name || "Item Details");

        const container = contentEl.createDiv({ cls: "dnd-features-window dnd-item-info-window" });

        if (this.itemData?.type) {
            const typeText = String(this.itemData.type).replace(/-/g, ' ').toUpperCase();
            const catText = this.itemData.category ? ` (${String(this.itemData.category).toUpperCase()})` : "";
            container.createDiv({
                text: `${typeText}${catText}`,
                cls: "dnd-item-info-type"
            });
        }

        const statsRow = container.createDiv({ cls: "dnd-item-info-stats" });

        if (this.itemData?.damage) {
            statsRow.createEl("span", { text: `Damage: ${this.itemData.damage}` });
        }
        if (this.itemData?.ac) {
            statsRow.createEl("span", { text: `AC: ${this.itemData.ac}` });
        }
        if (this.itemData?.weight !== undefined && this.itemData?.weight !== "") {
            statsRow.createEl("span", { text: `Weight: ${this.itemData.weight} lbs` });
        }
        const infoCostText = formatItemCost(this.itemData?.cost);
        if (infoCostText) {
            statsRow.createEl("span", { text: `Cost: ${infoCostText}` });
        }

        const masteryInfo = this.itemData?.mastery
            ? await getWeaponMasteryDescription(this.app, this.plugin.settings, this.itemData.mastery)
            : null;
        if (masteryInfo) {
            statsRow.createEl("span", { text: `Mastery: ${masteryInfo.name}` });
        }

        let fullDesc = this.itemData?.description ? String(this.itemData.description) : "";
        if (masteryInfo) {
            const masteryBlock = `**Mastery ([${masteryInfo.name}](note:weapon-masteries))**: ${masteryInfo.description}`;
            fullDesc = fullDesc ? `${fullDesc}\n\n${masteryBlock}` : masteryBlock;
        }

        if (fullDesc) {
            const descDiv = container.createDiv({ cls: "dnd-item-info-desc" });
            await this.plugin.renderDndMarkdown(fullDesc, descDiv, this.sourcePath, this.renderChild);
        } else {
            container.createEl("p", {
                text: "No additional description available for this item.",
                cls: "dnd-item-info-empty"
            });
        }
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

// --- INVENTORY MANAGER MODAL (Rulebook & On-the-Fly Custom Items) ---
class InventoryModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    activeTab: "rulebook" | "custom" = "rulebook";

    // Router pool from native items.json + Custom Rulebook items.json: { "<filename>": "<Display Name>" }
    availableRulebookItems: Record<string, string> = {};

    // Internal State Arrays
    // [id, qty, show]
    starterItems: [string, string, string][] = [];
    // [id, qty, show]
    inventoryItems: [string, string, string][] = [];
    // [name, qty, show, weight, cost, type, description]
    customItems: [string, string, string, string, string, string, string][] = [];
    editingCustomIndex: number | null = null;

    // Cached rulebook metadata for weight/preview calculations
    itemDataCache: Record<string, any> = {};

    trackerContainer!: HTMLElement;
    tabsContainer!: HTMLElement;
    listContainer!: HTMLElement;
    previewContainer!: HTMLElement;
    renderChild!: MarkdownRenderChild;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    private parseArrayProp(raw: any): any[] {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string" && raw.trim().startsWith("[")) {
            try { return JSON.parse(raw.trim()); } catch { return []; }
        }
        return [];
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-spellbook-modal");

        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        contentEl.createEl("h3", { text: "🎒 Inventory Manager", cls: "dnd-section-header dnd-modal-header" });

        // 1. Read Frontmatter
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.starterItems = this.parseArrayProp(frontmatter["DnD_starterEquipment"]).map((e: any) => [
            String(e[0] ?? ""),
            String(Math.max(0, Number(e[1]) || 0)),
            String(e[2] ?? "true")
        ]);

        this.inventoryItems = this.parseArrayProp(frontmatter["DnD_inventoryItems"]).map((e: any) => [
            String(e[0] ?? ""),
            String(Math.max(0, Number(e[1]) || 0)),
            String(e[2] ?? "true")
        ]);

        this.customItems = this.parseArrayProp(frontmatter["DnD_customItems"]).map((e: any) => [
            String(e[0] ?? ""),
            String(Math.max(0, Number(e[1]) || 0)),
            String(e[2] ?? "true"),
            String(Number(e[3]) || 0),
            String(Number(e[4]) || 0),
            String(e[5] ?? "Gear"),
            String(e[6] ?? "")
        ]);

        // 2. Load Merged Rulebook Items Router (items.json)
        await this.loadRulebookItemsPool();

        // Pre-cache item data for starter & inventory items
        const allIds = new Set<string>([
            ...this.starterItems.map(i => i[0]),
            ...this.inventoryItems.map(i => i[0])
        ]);
        for (const id of allIds) {
            if (id) {
                this.itemDataCache[id] = await getItemData(this.app, this.plugin.settings, id);
            }
        }

        // 3. Build Layout Containers
        this.trackerContainer = contentEl.createDiv({ cls: "dnd-modal-tracker" });
        this.tabsContainer = contentEl.createDiv({ cls: "dnd-modal-tabs" });

        const bodyGrid = contentEl.createDiv({ cls: "dnd-spellbook-body" });
        this.listContainer = bodyGrid.createDiv({ cls: "dnd-spellbook-list" });
        this.previewContainer = bodyGrid.createDiv({ cls: "dnd-spellbook-preview" });

        // 4. Footer Buttons
        const footerDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });

        const cancelBtn = footerDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = footerDiv.createEl("button", { text: "Save Inventory", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            await this.saveInventory();
        };

        this.renderTracker();
        this.renderTabs();
        this.renderActiveTab();
    }

    async loadRulebookItemsPool() {
        const basePath = this.plugin.settings.customRulebookPath?.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
        const priority = this.plugin.settings.customRulebookPriority;
        let customMap: Record<string, string> | null = null;

        if (basePath) {
            const customPath = normalizePath(`${basePath}/items.json`);
            try {
                if (await this.app.vault.adapter.exists(customPath)) {
                    const content = await this.app.vault.adapter.read(customPath);
                    customMap = JSON.parse(content);
                }
            } catch (e) {
                console.error(`InventoryModal: Failed to read custom items.json at ${customPath}`, e);
            }
        }

        const nativeMap = (itemsMap as Record<string, string>) || {};
        this.availableRulebookItems = customMap
            ? (priority ? { ...nativeMap, ...customMap } : { ...customMap, ...nativeMap })
            : { ...nativeMap };
    }

    renderTracker() {
        this.trackerContainer.empty();

        let shownCount = 0;
        let totalWeight = 0;

        for (const [id, qtyStr, showStr] of this.starterItems) {
            const qty = Number(qtyStr) || 0;
            const show = showStr.toLowerCase() !== "false";
            if (show) {
                shownCount++;
                const w = Number(this.itemDataCache[id]?.weight) || 0;
                totalWeight += w * qty;
            }
        }
        for (const [id, qtyStr, showStr] of this.inventoryItems) {
            const qty = Number(qtyStr) || 0;
            const show = showStr.toLowerCase() !== "false";
            if (show) {
                shownCount++;
                const w = Number(this.itemDataCache[id]?.weight) || 0;
                totalWeight += w * qty;
            }
        }
        for (const [_, qtyStr, showStr, weightStr] of this.customItems) {
            const qty = Number(qtyStr) || 0;
            const show = showStr.toLowerCase() !== "false";
            if (show) {
                shownCount++;
                const w = Number(weightStr) || 0;
                totalWeight += w * qty;
            }
        }

        const totalEntries = this.starterItems.length + this.inventoryItems.length + this.customItems.length;

        const leftInfo = this.trackerContainer.createDiv();
        leftInfo.createEl("strong", {
            text: `Check items to display them on your Character Sheet`,
            cls: "dnd-modal-tracker-title"
        });

        const rightCounters = this.trackerContainer.createDiv({ cls: "dnd-modal-tracker-counters" });

        const sSpan = rightCounters.createEl("span", { cls: "dnd-modal-tracker-stat" });
        sSpan.createEl("strong", { text: "Shown on Sheet: " });
        sSpan.createSpan({ text: `${shownCount} / ${totalEntries}` });

        const wSpan = rightCounters.createEl("span", { cls: "dnd-modal-tracker-stat" });
        wSpan.createEl("strong", { text: "Visible Weight: " });
        wSpan.createSpan({ text: `${totalWeight % 1 === 0 ? totalWeight : totalWeight.toFixed(1)} lbs` });
    }

    renderTabs() {
        this.tabsContainer.empty();

        const createTab = (id: "rulebook" | "custom", label: string) => {
            const isActive = this.activeTab === id;
            const btn = this.tabsContainer.createEl("button", {
                text: label,
                cls: `dnd-modal-tab-btn ${isActive ? "is-active" : ""}`.trim()
            });
            btn.onclick = () => {
                this.activeTab = id;
                this.renderTabs();
                this.renderActiveTab();
            };
        };

        createTab("rulebook", "🎒 Rulebook & Starter Items");
        createTab("custom", "✨ Custom Items (On-the-Fly)");
    }

    renderActiveTab() {
        this.listContainer.empty();
        this.previewContainer.empty();

        if (this.activeTab === "rulebook") {
            this.renderRulebookTab();
        } else {
            this.renderCustomTab();
        }
    }

    renderRulebookTab() {
        this.previewContainer.createEl("p", {
            text: "Click on any item in your inventory or select one from the dropdown to inspect its details.",
            cls: "dnd-modal-preview-empty"
        });

        // 1. Add Item from Rulebook Bar
        const addBar = this.listContainer.createDiv({ cls: "dnd-modal-add-bar" });

        const selectEl = addBar.createEl("select", { cls: "dnd-modal-add-select" });
        selectEl.createEl("option", { text: "-- Add Item from Rulebook --", value: "" });

        Object.entries(this.availableRulebookItems)
            .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
            .forEach(([fileKey, displayName]) => {
                selectEl.createEl("option", { text: String(displayName), value: fileKey });
            });

        selectEl.onchange = async () => {
            const chosenKey = selectEl.value;
            if (chosenKey) {
                await this.renderItemPreview(chosenKey, this.availableRulebookItems[chosenKey]);
            }
        };

        const addBtn = addBar.createEl("button", { text: "Add Item" });
        addBtn.onclick = async () => {
            const chosenKey = selectEl.value;
            if (!chosenKey) return;

            if (!this.itemDataCache[chosenKey]) {
                this.itemDataCache[chosenKey] = await getItemData(this.app, this.plugin.settings, chosenKey);
            }

            const existing = this.inventoryItems.find(i => i[0] === chosenKey);
            if (existing) {
                existing[1] = String((Number(existing[1]) || 0) + 1);
                existing[2] = "true";
            } else {
                this.inventoryItems.push([chosenKey, "1", "true"]);
            }

            this.renderTracker();
            this.renderRulebookTab();
            await this.renderItemPreview(chosenKey, this.availableRulebookItems[chosenKey]);
        };

        // 2. Render Starter Equipment Section
        if (this.starterItems.length > 0) {
            this.listContainer.createEl("div", {
                text: "STARTER EQUIPMENT",
                cls: "dnd-modal-section-label"
            });

            this.starterItems.forEach((tuple) => {
                this.createModalItemRow(tuple, true);
            });
        }

        // 3. Render Added Rulebook Items Section
        this.listContainer.createEl("div", {
            text: "ADDED RULEBOOK ITEMS",
            cls: "dnd-modal-section-label"
        });

        if (this.inventoryItems.length === 0) {
            this.listContainer.createEl("p", {
                text: "No extra rulebook items added yet.",
                cls: "dnd-modal-empty-text"
            });
        } else {
            this.inventoryItems.forEach((tuple, idx) => {
                this.createModalItemRow(tuple, false, () => {
                    this.inventoryItems.splice(idx, 1);
                    this.renderTracker();
                    this.renderRulebookTab();
                });
            });
        }
    }

    private createModalItemRow(tuple: [string, string, string], isStarter: boolean, onDelete?: () => void) {
        const itemId = tuple[0];
        const qty = Number(tuple[1]) || 0;
        const isShown = tuple[2].toLowerCase() !== "false";
        const data = this.itemDataCache[itemId];
        const displayName = data?.name || this.availableRulebookItems[itemId] || itemId.replace(/\b\w/g, c => c.toUpperCase()).replace(/-/g, ' ');

        const row = this.listContainer.createDiv({
            cls: `dnd-modal-list-row ${isShown ? "is-active" : ""}`.trim()
        });

        const leftGroup = row.createDiv({ cls: "dnd-modal-row-left is-clickable" });

        const showCheckbox = leftGroup.createEl("input", {
            type: "checkbox",
            attr: { title: "Show on Character Sheet" }
        });
        showCheckbox.checked = isShown;
        showCheckbox.onclick = (e) => {
            e.stopPropagation();
            tuple[2] = showCheckbox.checked ? "true" : "false";
            row.classList.toggle("is-active", showCheckbox.checked);
            this.renderTracker();
        };

        if (isStarter) {
            leftGroup.createEl("span", {
                text: "Starter",
                cls: "dnd-level-badge dnd-modal-badge-sm"
            });
        }

        leftGroup.createEl("span", { text: displayName, cls: "dnd-modal-row-name" });

        leftGroup.onclick = async () => {
            await this.renderItemPreview(itemId, displayName);
        };

        const rightGroup = row.createDiv({ cls: "dnd-modal-row-right" });

        const qtyInput = rightGroup.createEl("input", {
            type: "number",
            value: String(qty),
            cls: "dnd-modal-qty-input",
            attr: { min: "0", title: "Quantity (0 stays in inventory)" }
        });
        qtyInput.oninput = () => {
            const val = Math.max(0, Number(qtyInput.value) || 0);
            tuple[1] = String(val);
            this.renderTracker();
        };

        if (!isStarter && onDelete) {
            const delBtn = rightGroup.createEl("button", {
                text: "✕",
                cls: "dnd-modal-del-btn",
                attr: { title: "Remove from Inventory" }
            });
            delBtn.onclick = () => onDelete();
        }
    }

    renderCustomTab() {
        if (this.editingCustomIndex !== null && (this.editingCustomIndex < 0 || this.editingCustomIndex >= this.customItems.length)) {
            this.editingCustomIndex = null;
        }

        const isEditing = this.editingCustomIndex !== null;
        const activeTuple = isEditing ? this.customItems[this.editingCustomIndex!] : null;

        this.previewContainer.empty();

        const headerRow = this.previewContainer.createDiv({ cls: "dnd-modal-preview-header" });
        headerRow.createEl("h4", {
            text: isEditing ? "✏️ Edit Custom Item" : "✨ Create Custom Item",
            cls: "dnd-modal-preview-title"
        });

        if (isEditing) {
            const newBtn = headerRow.createEl("button", {
                text: "+ New Item",
                cls: "dnd-modal-tab-btn"
            });
            newBtn.onclick = () => {
                this.editingCustomIndex = null;
                this.renderCustomTab();
            };
        }

        const formDiv = this.previewContainer.createDiv({ cls: "dnd-modal-form" });

        const nameInput = formDiv.createEl("input", {
            type: "text",
            value: activeTuple ? activeTuple[0] : "",
            placeholder: "Item Name (e.g., Mystery Key)",
            cls: "dnd-modal-form-input"
        });

        const typeInput = formDiv.createEl("input", {
            type: "text",
            value: activeTuple ? (activeTuple[5] || "Custom") : "",
            placeholder: "Type (e.g., Gear, Wondrous Item, Key)",
            cls: "dnd-modal-form-input"
        });

        const rowGrid = formDiv.createDiv({ cls: "dnd-modal-form-grid-3" });

        const qtyInput = rowGrid.createEl("input", {
            type: "number",
            value: activeTuple ? String(Number(activeTuple[1]) || 0) : "1",
            placeholder: "Qty",
            cls: "dnd-modal-form-input",
            attr: { min: "0", title: "Quantity" }
        });
        const weightInput = rowGrid.createEl("input", {
            type: "number",
            value: activeTuple ? String(Number(activeTuple[3]) || 0) : "",
            placeholder: "Weight (lbs)",
            cls: "dnd-modal-form-input",
            attr: { min: "0", step: "0.1", title: "Weight (lbs)" }
        });
        const costInput = rowGrid.createEl("input", {
            type: "text",
            value: activeTuple ? formatItemCost(activeTuple[4]) : "",
            placeholder: "Cost (e.g. 50 GP, 1 SP, 5 CP)",
            cls: "dnd-modal-form-input",
            attr: { title: "Cost with currency: PP, GP, SP or CP (e.g. 50 GP)" }
        });

        const descInput = formDiv.createEl("textarea", {
            placeholder: "Item Description (supports Markdown)...",
            cls: "dnd-modal-form-input dnd-modal-form-textarea"
        });
        descInput.value = activeTuple ? (activeTuple[6] || "") : "";

        if (isEditing && activeTuple) {
            const previewWrap = this.previewContainer.createDiv({ cls: "dnd-modal-preview-desc" });
            const renderLiveDesc = async (mdText: string) => {
                previewWrap.empty();
                if (mdText.trim()) {
                    previewWrap.createEl("div", { text: "DESCRIPTION PREVIEW", cls: "dnd-modal-section-label" });
                    const bodyDiv = previewWrap.createDiv();
                    await this.plugin.renderDndMarkdown(mdText, bodyDiv, this.sourcePath, this.renderChild);
                }
            };
            void renderLiveDesc(activeTuple[6] || "");

            const syncEdits = () => {
                const cleanName = nameInput.value.trim();
                if (cleanName) activeTuple[0] = cleanName;
                activeTuple[1] = String(Math.max(0, Number(qtyInput.value) || 0));
                activeTuple[3] = String(Math.max(0, Number(weightInput.value) || 0));
                activeTuple[4] = formatItemCost(costInput.value);
                activeTuple[5] = typeInput.value.trim() || "Custom";
                activeTuple[6] = descInput.value;
                this.renderTracker();
                this.renderCustomListOnly();
            };

            nameInput.oninput = () => syncEdits();
            typeInput.oninput = () => syncEdits();
            qtyInput.oninput = () => syncEdits();
            weightInput.oninput = () => syncEdits();
            costInput.oninput = () => syncEdits();
            descInput.oninput = () => {
                syncEdits();
                void renderLiveDesc(descInput.value);
            };

            const doneBtn = formDiv.createEl("button", {
                text: "Done Editing",
                cls: "mod-cta"
            });
            doneBtn.onclick = () => {
                syncEdits();
                this.editingCustomIndex = null;
                this.renderCustomTab();
            };
        } else {
            const createBtn = formDiv.createEl("button", {
                text: "Add Custom Item",
                cls: "mod-cta"
            });

            createBtn.onclick = () => {
                const cleanName = nameInput.value.trim();
                if (!cleanName) {
                    new Notice("Please enter a name for the custom item.");
                    return;
                }
                const qty = String(Math.max(0, Number(qtyInput.value) || 0));
                const weight = String(Math.max(0, Number(weightInput.value) || 0));
                const cost = formatItemCost(costInput.value);
                const cleanType = typeInput.value.trim() || "Custom";
                const desc = descInput.value.trim();

                this.customItems.push([cleanName, qty, "true", weight, cost, cleanType, desc]);
                this.renderTracker();
                this.renderCustomTab();
            };
        }

        this.renderCustomListOnly();
    }

    private renderCustomListOnly() {
        this.listContainer.empty();
        this.listContainer.createEl("div", {
            text: "ON-THE-FLY CUSTOM ITEMS",
            cls: "dnd-modal-section-label"
        });

        if (this.customItems.length === 0) {
            this.listContainer.createEl("p", {
                text: "No custom items created yet. Use the form on the right to add one!",
                cls: "dnd-modal-empty-text"
            });
            return;
        }

        this.customItems.forEach((tuple, idx) => {
            const [cName, qtyStr, showStr, weightStr, costStr] = tuple;
            const isShown = showStr.toLowerCase() !== "false";
            const isSelected = this.editingCustomIndex === idx;

            const row = this.listContainer.createDiv({
                cls: `dnd-modal-list-row ${isShown ? "is-active" : ""} ${isSelected ? "is-selected" : ""}`.trim()
            });

            const leftGroup = row.createDiv({ cls: "dnd-modal-row-left is-clickable" });

            const showCheckbox = leftGroup.createEl("input", {
                type: "checkbox",
                attr: { title: "Show on Character Sheet" }
            });
            showCheckbox.checked = isShown;
            showCheckbox.onclick = (e) => {
                e.stopPropagation();
                tuple[2] = showCheckbox.checked ? "true" : "false";
                row.classList.toggle("is-active", showCheckbox.checked);
                this.renderTracker();
            };

            leftGroup.createEl("span", { text: cName, cls: "dnd-modal-row-name" });

            const metaParts: string[] = [];
            if (Number(weightStr) > 0) metaParts.push(`${weightStr}lbs`);
            if (hasItemCost(costStr)) metaParts.push(formatItemCost(costStr, true));
            if (metaParts.length > 0) {
                leftGroup.createEl("small", {
                    text: `(${metaParts.join(", ")})`,
                    cls: "dnd-modal-row-meta"
                });
            }

            leftGroup.onclick = () => {
                this.editingCustomIndex = idx;
                this.renderCustomTab();
            };

            const rightGroup = row.createDiv({ cls: "dnd-modal-row-right" });

            const qInput = rightGroup.createEl("input", {
                type: "number",
                value: String(Number(qtyStr) || 0),
                cls: "dnd-modal-qty-input",
                attr: { min: "0", title: "Quantity (0 stays in inventory)" }
            });
            qInput.oninput = () => {
                tuple[1] = String(Math.max(0, Number(qInput.value) || 0));
                this.renderTracker();
                if (this.editingCustomIndex === idx) {
                    this.renderCustomTab();
                }
            };

            const delBtn = rightGroup.createEl("button", {
                text: "✕",
                cls: "dnd-modal-del-btn",
                attr: { title: "Delete Custom Item" }
            });
            delBtn.onclick = () => {
                this.customItems.splice(idx, 1);
                if (this.editingCustomIndex === idx) {
                    this.editingCustomIndex = null;
                } else if (this.editingCustomIndex !== null && this.editingCustomIndex > idx) {
                    this.editingCustomIndex -= 1;
                }
                this.renderTracker();
                this.renderCustomTab();
            };
        });
    }

    async renderItemPreview(itemKey: string, fallbackName: string) {
        this.previewContainer.empty();
        if (!this.itemDataCache[itemKey]) {
            this.itemDataCache[itemKey] = await getItemData(this.app, this.plugin.settings, itemKey);
        }
        const data = this.itemDataCache[itemKey];

        if (!data) {
            this.previewContainer.createEl("h4", { text: fallbackName, cls: "dnd-modal-preview-title" });
            this.previewContainer.createEl("p", {
                text: `Details file (/rulebook/items/${itemKey}.json) not found.`,
                cls: "dnd-modal-empty-text"
            });
            return;
        }

        this.previewContainer.createEl("h4", { text: data.name || fallbackName, cls: "dnd-modal-preview-title" });
        if (data.type) {
            this.previewContainer.createEl("div", {
                text: String(data.type).toUpperCase(),
                cls: "dnd-modal-preview-sub"
            });
        }

        const metaDiv = this.previewContainer.createDiv({ cls: "dnd-modal-preview-meta" });
        if (data.damage) metaDiv.createEl("div", { text: `Damage: ${data.damage}` });
        if (data.ac) metaDiv.createEl("div", { text: `AC: ${data.ac}` });
        if (data.weight !== undefined) metaDiv.createEl("div", { text: `Weight: ${data.weight} lbs` });
        const previewCostText = formatItemCost(data.cost);
        if (previewCostText) metaDiv.createEl("div", { text: `Cost: ${previewCostText}` });

        const masteryInfo = data.mastery
            ? await getWeaponMasteryDescription(this.app, this.plugin.settings, data.mastery)
            : null;
        if (masteryInfo) {
            metaDiv.createEl("div", { text: `Mastery: ${masteryInfo.name}` });
        }

        let previewDesc = data.description ? String(data.description) : "";
        if (masteryInfo) {
            const masteryBlock = `**Mastery ([${masteryInfo.name}](note:weapon-masteries))**: ${masteryInfo.description}`;
            previewDesc = previewDesc ? `${previewDesc}\n\n${masteryBlock}` : masteryBlock;
        }

        if (previewDesc) {
            const descDiv = this.previewContainer.createDiv({ cls: "dnd-modal-preview-desc" });
            await this.plugin.renderDndMarkdown(previewDesc, descDiv, this.sourcePath, this.renderChild);
        }
    }

    async saveInventory() {
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, {
            "DnD_starterEquipment": JSON.stringify(this.starterItems),
            "DnD_inventoryItems": JSON.stringify(this.inventoryItems),
            "DnD_customItems": JSON.stringify(this.customItems)
        });
        new Notice("Inventory saved!");
        this.close();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

// --- CONSOLIDATED MANAGE CHARACTER MODAL ---
class ManageCharacterModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    // Tab Navigation State
    activeTab: "stats" | "attack" | "ac" | "speed" | "skills" | "items" | "features" = "stats";

    // --- Unified Data State ---
    // 1. Stats State
    currentStats: Record<string, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    // 1b. Saving Throws State
    currentSavingThrows: AbilityKey[] = [];
    // 2. AC State
    currentAcMod: number = 0;
    // 2b. Speed State
    currentSpeed: number = 30;
    currentSpeedMod: number = 0;
    currentCustomSpeedMod: number = 0;
    speedBreakdown: SpeedModifierBreakdown | null = null;
    // 3. Attack State
    currentAttackStat: string = "strength";
    addAttackProficiency: boolean = true;
    extraAttackMod: number = 0;
    weaponMasteryState: WeaponMasteryState = { available: 0, mastered: [] };
    weaponMasteryBreakdown: { source: string; count: number }[] = [];
    availableMasteryWeapons: { id: string; name: string; mastery: string }[] = [];
    // 4. Skills State
    currentExtraSkills: string[] = [];
    baseProficiencies: [string, string][] = [];
    allSkills = [
        "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
        "History", "Insight", "Intimidation", "Investigation", "Medicine",
        "Nature", "Perception", "Performance", "Persuasion", "Religion",
        "Sleight of Hand", "Stealth", "Survival"
    ];
    // 5. Item Bonuses State (Strictly Strings)
    currentSkillBonuses: [string, string, string][] = [];
    // 6. Hidden Features State
    currentHiddenFeatures: string[] = [];
    availableFeaturesToHide: string[] = [];

    contentContainer!: HTMLElement;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl } = this;

        this.modalEl.addClass("dnd-manage-modal", "dnd-spellbook-modal");
        contentEl.createEl("h3", { text: "Manage Character", cls: "dnd-section-header dnd-modal-header" });

        // --- FETCH ALL DATA ONCE ---
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        // Fetch Stats
        const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        statsList.forEach(stat => this.currentStats[stat] = Number(frontmatter[`DnD_${stat}`]) || 10);

        // Fetch Saving Throw Proficiencies
        this.currentSavingThrows = parseSavingThrows(frontmatter["DnD_classProficiencies"]);

        // Fetch AC
        this.currentAcMod = Number(frontmatter["DnD_armorAcMod"]) || 0;

        // Fetch Speed
        this.currentSpeed = frontmatter["DnD_speed"] !== undefined && frontmatter["DnD_speed"] !== "" && !isNaN(Number(frontmatter["DnD_speed"]))
            ? Number(frontmatter["DnD_speed"])
            : 30;
        this.currentSpeedMod = Number(frontmatter["DnD_speedMod"]) || 0;

        // Fetch Speed Breakdown & Custom Modifier adhering to D&D 5.5e
        this.speedBreakdown = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"],
            frontmatter["DnD_classLevels"],
            Number(frontmatter["DnD_level"]) || 1,
            frontmatter["DnD_extraFeats"],
            frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_armor"],
            this.currentSpeed,
            0,
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings
        );
        const autoBonus = (this.speedBreakdown?.classSpeedBonus || 0) + (this.speedBreakdown?.featSpeedBonus || 0);
        if (frontmatter["DnD_customSpeedMod"] !== undefined && frontmatter["DnD_customSpeedMod"] !== null && frontmatter["DnD_customSpeedMod"] !== "") {
            this.currentCustomSpeedMod = Number(frontmatter["DnD_customSpeedMod"]) || 0;
        } else {
            const legacyMod = Number(frontmatter["DnD_speedMod"]) || 0;
            this.currentCustomSpeedMod = legacyMod - autoBonus;
        }
        this.currentSpeedMod = autoBonus + this.currentCustomSpeedMod;

        // Fetch Attack
        this.extraAttackMod = Number(frontmatter["DnD_attackRollMod"]) || 0;
        if (frontmatter["DnD_attackStat"]) {
            this.currentAttackStat = String(frontmatter["DnD_attackStat"]).toLowerCase().trim();
        }

        // Fetch Weapon Mastery State & Available Weapons with Valid Masteries
        this.weaponMasteryState = parseWeaponMasteryState(frontmatter["DnD_weaponMastery"]);
        const bgDataForMastery = frontmatter["DnD_background"]
            ? await getBackgroundData(this.app, this.plugin.settings, frontmatter["DnD_background"])
            : null;
        const masteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"],
            frontmatter["DnD_classLevels"],
            Number(frontmatter["DnD_level"]) || 1,
            frontmatter["DnD_extraFeats"],
            bgDataForMastery?.feat || frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings
        );
        this.weaponMasteryState.available = masteryCalc.totalSlots;
        this.weaponMasteryBreakdown = masteryCalc.breakdown;

        const itemLookupKeys = new Set<string>(Object.keys(itemsMap || {}));
        const basePath = this.plugin.settings.customRulebookPath?.trim();
        if (basePath) {
            const customItemsPath = normalizePath(`${basePath}/items.json`);
            try {
                if (await this.app.vault.adapter.exists(customItemsPath)) {
                    const content = await this.app.vault.adapter.read(customItemsPath);
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === "object") {
                        Object.keys(parsed).forEach(k => itemLookupKeys.add(k));
                    }
                }
            } catch (e) {
                console.error(`ManageCharacterModal: Could not read custom items.json at ${customItemsPath}`, e);
            }
        }
        const masteryWeps: { id: string; name: string; mastery: string }[] = [];
        for (const key of itemLookupKeys) {
            const data = await getItemData(this.app, this.plugin.settings, key);
            if (!data || !data.type || !data.mastery) continue;
            if (!String(data.type).toLowerCase().includes("weapon")) continue;
            const masteryInfo = await getWeaponMasteryDescription(this.app, this.plugin.settings, data.mastery);
            if (!masteryInfo) continue;
            masteryWeps.push({
                id: sanitizeWeaponSlug(key),
                name: String(data.name || key).trim(),
                mastery: masteryInfo.name
            });
        }
        this.availableMasteryWeapons = masteryWeps.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch Skills from Frontmatter Database (Force Strings)
        let profsRaw = frontmatter["DnD_skillProficiencies"] || [];
        if (typeof profsRaw === 'string') {
            try { profsRaw = JSON.parse(profsRaw); } catch { profsRaw = []; }
        }
        profsRaw.forEach((p: any) => {
            if (Array.isArray(p) && p.length > 0) {
                if (String(p[1]) === "extra") this.currentExtraSkills.push(String(p[0]).toLowerCase());
                else this.baseProficiencies.push([String(p[0]).toLowerCase(), String(p[1])]);
            } else if (typeof p === 'string') {
                this.baseProficiencies.push([String(p).toLowerCase(), "class"]); // Safe fallback for 1D arrays
            }
        });

        // Fetch Skill Bonuses from Frontmatter Database (Force Strings)
        let bonusesRaw = frontmatter["DnD_skillBonuses"] || [];
        if (typeof bonusesRaw === 'string') {
            try { bonusesRaw = JSON.parse(bonusesRaw); } catch { bonusesRaw = []; }
        }
        this.currentSkillBonuses = bonusesRaw.map((b: any) => [String(b[0]), String(b[1]), String(b[2])]);

        // Fetch Attack Proficiency toggle from frontmatter (defaults to true)
        this.addAttackProficiency = frontmatter["DnD_attackProficiency"] !== undefined
            ? Boolean(frontmatter["DnD_attackProficiency"])
            : true;

        // Fetch Hidden Features from Frontmatter Database (DnD_hideFeature)
        let hideRaw = frontmatter["DnD_hideFeature"] || [];
        if (typeof hideRaw === "string") {
            const trimmed = hideRaw.trim();
            if (trimmed.startsWith("[")) {
                try { hideRaw = JSON.parse(trimmed); } catch { hideRaw = []; }
            } else if (trimmed !== "") {
                hideRaw = trimmed.split(",").map((s: string) => s.trim());
            } else {
                hideRaw = [];
            }
        }
        if (Array.isArray(hideRaw)) {
            this.currentHiddenFeatures = hideRaw.map((f: any) => String(f).trim()).filter(Boolean);
        }

        await this.fetchAvailableFeatures(frontmatter);

        // --- BUILD TAB HEADER ---
        const tabHeader = contentEl.createDiv({ cls: "dnd-modal-tabs" });

        const createTabBtn = (id: typeof this.activeTab, label: string, icon: string) => {
            const btn = tabHeader.createEl("button", {
                text: `${icon} ${label}`,
                cls: "dnd-modal-tab-btn dnd-manage-tab-btn"
            });
            btn.onclick = () => {
                this.activeTab = id;
                this.renderTabs(tabHeader);
                this.renderContent();
            };
            return btn;
        };

        createTabBtn("stats", "Ability Scores", "🖋️");
        createTabBtn("attack", "Attack Ability", "🎯");
        createTabBtn("ac", "Armor Class Mod", "🛡️");
        createTabBtn("speed", "Speed", "🏃");
        createTabBtn("skills", "Skills", "🔨");
        createTabBtn("items", "Items", "🎒");
        createTabBtn("features", "Hide Features", "📜");

        // --- FIXED CONTENT CONTAINER ---
        this.contentContainer = contentEl.createDiv({ cls: "dnd-manage-content" });

        // --- FOOTER BUTTONS ---
        const btnDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = btnDiv.createEl("button", { text: "Save All Changes", cls: "mod-cta" });
        saveBtn.onclick = async (e) => {
            e.preventDefault();
            await this.saveAllChanges();
        };

        this.renderTabs(tabHeader);
        this.renderContent();
    }

    async fetchAvailableFeatures(frontmatter: Record<string, any>) {
        const discovered = new Set<string>();
        const level = Number(frontmatter["DnD_level"]) || 1;
        const dndClass = frontmatter["DnD_class"];
        const subclass = frontmatter["DnD_subclass"];
        const classLevels = frontmatter["DnD_classLevels"];
        const race = frontmatter["DnD_race"];
        const raceLineage = frontmatter["DnD_raceLineage"];
        const background = frontmatter["DnD_background"];
        const extraFeats = frontmatter["DnD_extraFeats"];

        let classChoicesRaw = frontmatter["DnD_classChoices"];
        if (typeof classChoicesRaw === "string" && classChoicesRaw.trim().startsWith("[")) {
            try { classChoicesRaw = JSON.parse(classChoicesRaw.trim()); } catch { classChoicesRaw = []; }
        }
        const classChoicesArray = Array.isArray(classChoicesRaw) ? classChoicesRaw : [];

        const classArray = Array.isArray(dndClass) ? dndClass : (dndClass ? [dndClass] : []);
        const rawSubclassArray = Array.isArray(subclass) ? subclass : (subclass ? [subclass] : []);
        const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

        let finalExtraFeats = Array.isArray(extraFeats) ? [...extraFeats] : (extraFeats ? [extraFeats] : []);

        // 1. Class, Subclass & Class Choices Features
        for (let index = 0; index < classArray.length; index++) {
            const className = classArray[index];
            const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                ? Number(classLevels[index])
                : level;

            const classData = await getClassData(this.app, this.plugin.settings, className);
            if (!classData || !classData.features) continue;

            let subclassData: any = null;
            let hasActiveSubclass = false;
            const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, currentClassLevel);
            if (grantedSubclassFile && subclassArray[index]) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile, subclassArray[index]);
                if (subclassData) {
                    hasActiveSubclass = true;
                }
            }

            for (let i = 1; i <= currentClassLevel; i++) {
                const levelFeatures = classData.features[i.toString()];
                if (Array.isArray(levelFeatures)) {
                    for (const feature of levelFeatures) {
                        if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                            finalExtraFeats.push(...feature.grantedFeats);
                        }
                        if (feature.hide !== true && feature.name) {
                            discovered.add(String(feature.name).trim());
                        }
                    }
                }

                // Class Choices at this level
                for (const choiceTuple of classChoicesArray) {
                    let choiceKey = "";
                    let choiceLevel = 0;
                    if (Array.isArray(choiceTuple)) {
                        if (choiceTuple.length === 3) [, choiceKey, choiceLevel] = choiceTuple;
                        else if (choiceTuple.length === 2) [choiceKey, choiceLevel] = choiceTuple;
                    }
                    if (Number(choiceLevel) === i && choiceKey) {
                        const featureData = await getClassChoiceData(this.app, this.plugin.settings, choiceKey);
                        if (featureData && featureData.name && featureData.hide !== true) {
                            discovered.add(String(featureData.name).trim());
                        }
                    }
                }

                // Subclass Features at this level
                if (hasActiveSubclass && subclassData) {
                    const subLevelFeatures = subclassData[i.toString()];
                    if (Array.isArray(subLevelFeatures)) {
                        for (const feature of subLevelFeatures) {
                            if (feature.grantedFeats && Array.isArray(feature.grantedFeats)) {
                                finalExtraFeats.push(...feature.grantedFeats);
                            }
                            if (feature.hide !== true && feature.name) {
                                discovered.add(String(feature.name).trim());
                            }
                        }
                    }
                }
            }
        }

        // 2. Race Traits
        if (race) {
            const raceData = await getRaceData(this.app, this.plugin.settings, race);
            if (raceData && Array.isArray(raceData.traits)) {
                for (const trait of raceData.traits) {
                    if (trait.hide === true || !trait.name) continue;
                    if (trait.lineage) {
                        if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) continue;
                    }
                    discovered.add(String(trait.name).trim());
                }
            }
        }

        // 3. Background Feat
        if (background) {
            const bgData = await getBackgroundData(this.app, this.plugin.settings, background);
            const featData = bgData && bgData.feat ? await getExtraFeat(this.app, this.plugin.settings, bgData.feat) : null;
            if (featData && featData.hide !== true && featData.name) {
                discovered.add(String(featData.name).trim());
            }
        }

        // 4. Extra & Granted Feats
        const uniqueFeats = [...new Set(finalExtraFeats)];
        for (const featId of uniqueFeats) {
            if (!featId || featId === "ability-score-improvement") continue;
            const safeFeatId = String(featId);

            const isRouter = !!(await getFeatMapData(this.app, this.plugin.settings, safeFeatId));
            if (isRouter) continue;

            const featData = await getExtraFeat(this.app, this.plugin.settings, safeFeatId);
            if (featData && featData.hide !== true && featData.name) {
                discovered.add(String(featData.name).trim());
            }
        }

        this.availableFeaturesToHide = Array.from(discovered);
    }

    renderTabs(tabHeader: HTMLElement) {
        const buttons = tabHeader.querySelectorAll("button");
        const tabs = ["stats", "attack", "ac", "speed", "skills", "items", "features"];

        buttons.forEach((btn, index) => {
            btn.classList.toggle("is-active", tabs[index] === this.activeTab);
        });
    }

    renderContent() {
        this.contentContainer.empty();

        if (this.activeTab === "stats") {
            this.contentContainer.createEl("h4", { text: "Base Ability Scores", cls: "dnd-manage-section-title" });
            const statsGrid = this.contentContainer.createDiv({ cls: "dnd-form-grid-3" });

            const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
            statsList.forEach(stat => {
                const statDiv = statsGrid.createDiv();
                const displayStat = stat.charAt(0).toUpperCase() + stat.slice(1);
                statDiv.createEl("label", { text: displayStat, cls: "dnd-form-label-sub" });

                const statInput = statDiv.createEl("input", {
                    type: "number",
                    value: String(this.currentStats[stat]),
                    cls: "dnd-modal-form-input"
                });
                statInput.oninput = (e) => this.currentStats[stat] = Number((e.target as HTMLInputElement).value);
            });

            this.contentContainer.createEl("h4", { text: "Saving Throw Proficiencies", cls: "dnd-manage-section-title" });
            const savesGrid = this.contentContainer.createDiv({ cls: "dnd-form-grid-3" });
            (statsList as AbilityKey[]).forEach(stat => {
                const row = savesGrid.createDiv({ cls: "dnd-form-row" });
                const checkbox = row.createEl("input", { type: "checkbox" });
                checkbox.checked = this.currentSavingThrows.includes(stat);
                checkbox.onchange = (e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    if (checked) {
                        if (!this.currentSavingThrows.includes(stat)) this.currentSavingThrows.push(stat);
                    } else {
                        this.currentSavingThrows = this.currentSavingThrows.filter(s => s !== stat);
                    }
                };
                const displayStat = stat.charAt(0).toUpperCase() + stat.slice(1);
                row.createEl("label", { text: displayStat });
            });
        }

        else if (this.activeTab === "attack") {
            this.contentContainer.createEl("h4", { text: "Attack Roll Formula", cls: "dnd-manage-section-title" });

            const statDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            statDiv.createEl("label", { text: "Base Attack Ability:", cls: "dnd-form-label-sub" });
            const selectEl = statDiv.createEl("select", { cls: "dnd-modal-form-input" });
            const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
            stats.forEach(stat => selectEl.createEl("option", { text: stat.charAt(0).toUpperCase() + stat.slice(1), value: stat }));
            selectEl.value = this.currentAttackStat;
            selectEl.onchange = (e) => this.currentAttackStat = (e.target as HTMLSelectElement).value;

            const profDiv = this.contentContainer.createDiv({ cls: "dnd-form-row" });
            const profToggle = profDiv.createEl("input", { type: "checkbox" });
            profToggle.checked = this.addAttackProficiency;
            profToggle.onchange = (e) => this.addAttackProficiency = (e.target as HTMLInputElement).checked;
            profDiv.createEl("label", { text: "Add Proficiency Bonus" });

            const modDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            modDiv.createEl("label", { text: "Extra Modifier (Magic Weapons, Buffs):", cls: "dnd-form-label-sub" });
            const modInput = modDiv.createEl("input", {
                type: "number",
                value: String(this.extraAttackMod),
                cls: "dnd-modal-form-input"
            });
            modInput.oninput = (e) => this.extraAttackMod = Number((e.target as HTMLInputElement).value);

            // Weapon Masteries Management Section
            const masteryHeaderRow = this.contentContainer.createDiv({ cls: "dnd-flex-between dnd-mt-15" });
            masteryHeaderRow.createEl("h4", {
                text: `Weapon Masteries (${this.weaponMasteryState.mastered.length} / ${this.weaponMasteryState.available} Slots Used)`,
                cls: "dnd-manage-section-title"
            });
            const viewMasteriesLink = masteryHeaderRow.createEl("a", {
                text: "📖 View Weapon Masteries",
                cls: "dnd-note-link dnd-form-hint",
                href: "#"
            });
            viewMasteriesLink.onclick = (e) => {
                e.preventDefault();
                new NoteModal(this.app, this.plugin, "weapon-masteries").open();
            };

            if (this.weaponMasteryBreakdown.length > 0) {
                const sourcesText = this.weaponMasteryBreakdown.map(b => `${b.source} (${b.count})`).join(" • ");
                this.contentContainer.createEl("small", {
                    text: `Unlocked from: ${sourcesText}`,
                    cls: "dnd-form-hint"
                });
            }

            const masteryListDiv = this.contentContainer.createDiv({ cls: "dnd-modal-list dnd-form-group" });
            if (this.weaponMasteryState.mastered.length === 0) {
                masteryListDiv.createEl("p", {
                    text: this.weaponMasteryState.available > 0
                        ? "No weapons mastered yet. Select a weapon below to master it."
                        : "Your character does not currently have any unlocked Weapon Mastery slots.",
                    cls: "dnd-modal-empty-text"
                });
            } else {
                this.weaponMasteryState.mastered.forEach((slug) => {
                    const matched = this.availableMasteryWeapons.find(w => w.id === slug || sanitizeWeaponSlug(w.name) === slug);
                    const displayLabel = matched
                        ? `${matched.name} (${matched.mastery})`
                        : formatFeatureOrSlug(slug);

                    const itemRow = masteryListDiv.createDiv({ cls: "dnd-modal-list-item" });
                    itemRow.createEl("span", { text: displayLabel });

                    const removeBtn = itemRow.createEl("button", { text: "✕", cls: "dnd-btn-danger" });
                    removeBtn.onclick = () => {
                        this.weaponMasteryState.mastered = this.weaponMasteryState.mastered.filter(s => s !== slug);
                        this.renderContent();
                    };
                });
            }

            const addMasteryBar = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const masterySelect = addMasteryBar.createEl("select", { cls: "dnd-flex-1" });
            masterySelect.createEl("option", { text: "-- Select Weapon to Master --", value: "" });

            const canAddMore = this.weaponMasteryState.mastered.length < this.weaponMasteryState.available;
            this.availableMasteryWeapons.forEach(w => {
                if (!this.weaponMasteryState.mastered.includes(w.id)) {
                    masterySelect.createEl("option", { text: `${w.name} (${w.mastery})`, value: w.id });
                }
            });
            masterySelect.disabled = !canAddMore;

            const addMasteryBtn = addMasteryBar.createEl("button", { text: "Add Mastery" });
            addMasteryBtn.disabled = !canAddMore;
            addMasteryBtn.onclick = () => {
                const chosenSlug = masterySelect.value;
                if (!chosenSlug) return;
                if (this.weaponMasteryState.mastered.length >= this.weaponMasteryState.available) {
                    new Notice(`You can only master up to ${this.weaponMasteryState.available} weapon(s).`);
                    return;
                }
                if (!this.weaponMasteryState.mastered.includes(chosenSlug)) {
                    this.weaponMasteryState.mastered.push(chosenSlug);
                    this.renderContent();
                }
            };
        }

        else if (this.activeTab === "ac") {
            this.contentContainer.createEl("h4", { text: "Armor Class Adjustments", cls: "dnd-manage-section-title" });

            const inputDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            inputDiv.createEl("label", { text: "Miscellaneous AC Modifier (Shields, Buffs):", cls: "dnd-form-label-sub" });
            const inputEl = inputDiv.createEl("input", {
                type: "number",
                value: String(this.currentAcMod),
                cls: "dnd-modal-form-input"
            });
            inputEl.oninput = (e) => this.currentAcMod = Number((e.target as HTMLInputElement).value);

            this.contentContainer.createEl("p", {
                text: "Note: Your Base AC and Dexterity limits are automatically calculated based on your equipped armor and ability scores.",
                cls: "dnd-form-note"
            });
        }

        else if (this.activeTab === "speed") {
            this.contentContainer.createEl("h4", { text: "Speed Adjustments", cls: "dnd-manage-section-title" });

            const baseSpeedDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            baseSpeedDiv.createEl("label", { text: "Base Walking Speed (ft.):", cls: "dnd-form-label-sub" });
            const baseSpeedInput = baseSpeedDiv.createEl("input", {
                type: "number",
                value: String(this.currentSpeed),
                cls: "dnd-modal-form-input"
            });

            // Feature & Feat Speed Bonuses Card
            const autoBonus = (this.speedBreakdown?.classSpeedBonus || 0) + (this.speedBreakdown?.featSpeedBonus || 0);
            const breakdownCard = this.contentContainer.createDiv({ cls: "dnd-form-card" });
            breakdownCard.createEl("label", { text: "Class & Feat Speed Bonuses (Automatic):", cls: "dnd-form-label-bold" });

            const autoItems = (this.speedBreakdown?.breakdown || []).filter(b => b.source !== "Custom / Miscellaneous Modifier");
            if (autoItems.length === 0) {
                breakdownCard.createEl("p", {
                    text: "No class features or feats currently grant speed bonuses.",
                    cls: "dnd-form-hint"
                });
            } else {
                autoItems.forEach(b => {
                    const row = breakdownCard.createDiv({ cls: "dnd-modal-list-row" });
                    const nameSpan = row.createEl("span", {
                        text: `${b.source}: +${b.amount} ft.`,
                        cls: "dnd-modal-row-name"
                    });
                    if (!b.active) {
                        nameSpan.classList.add("dnd-text-muted");
                        row.createEl("small", {
                            text: b.reason ? `(${b.reason})` : "(Inactive)",
                            cls: "dnd-error-text"
                        });
                    }
                });
            }

            // Custom / Misc Modifier input
            const customSpeedDiv = this.contentContainer.createDiv({ cls: "dnd-form-group" });
            customSpeedDiv.createEl("label", { text: "Miscellaneous / Gear Speed Modifier (Magic Items, Buffs):", cls: "dnd-form-label-sub" });
            const customSpeedInput = customSpeedDiv.createEl("input", {
                type: "number",
                value: String(this.currentCustomSpeedMod),
                cls: "dnd-modal-form-input"
            });

            // Total Speed Preview Display
            const previewCard = this.contentContainer.createDiv({ cls: "dnd-form-card-active" });
            const updatePreview = () => {
                this.currentSpeedMod = autoBonus + this.currentCustomSpeedMod;
                const total = this.currentSpeed + this.currentSpeedMod;
                previewCard.empty();
                previewCard.createEl("strong", {
                    text: `Total Walking Speed: ${total} ft.`
                });
                const modText = this.currentSpeedMod !== 0
                    ? ` (Base ${this.currentSpeed} ft. + ${this.currentSpeedMod > 0 ? '+' : ''}${this.currentSpeedMod} ft. Modifier)`
                    : ` (Base ${this.currentSpeed} ft.)`;
                previewCard.createSpan({ text: modText });
            };

            baseSpeedInput.oninput = (e) => {
                this.currentSpeed = Number((e.target as HTMLInputElement).value) || 0;
                updatePreview();
            };

            customSpeedInput.oninput = (e) => {
                this.currentCustomSpeedMod = Number((e.target as HTMLInputElement).value) || 0;
                updatePreview();
            };

            updatePreview();

            this.contentContainer.createEl("p", {
                text: "Note: In D&D 5.5e, Monk Unarmored Movement scales automatically and replaces earlier tiers. Speedy and other feats stack additively with class speed.",
                cls: "dnd-form-note"
            });
        }

        else if (this.activeTab === "skills") {
            this.contentContainer.createEl("h4", { text: "Additional Skill Proficiencies", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentExtraSkills.length === 0) {
                listDiv.createEl("p", { text: "No extra skills added.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentExtraSkills.forEach((skill, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });
                    row.createEl("span", { text: skill.replace(/\b\w/g, c => c.toUpperCase()), cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = () => {
                        this.currentExtraSkills.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const selectEl = addDiv.createEl("select", { cls: "dnd-modal-add-select" });
            selectEl.createEl("option", { text: "-- Select Skill to Add --", value: "" });

            this.allSkills.forEach(s => {
                const isExtra = this.currentExtraSkills.includes(s.toLowerCase());
                const isBase = this.baseProficiencies.some(p => p[0] === s.toLowerCase());
                if (!isExtra && !isBase) selectEl.createEl("option", { text: s, value: s.toLowerCase() });
            });

            const addBtn = addDiv.createEl("button", { text: "Add Skill" });
            addBtn.onclick = () => {
                if (selectEl.value) {
                    this.currentExtraSkills.push(selectEl.value);
                    this.renderContent();
                }
            };
        }

        else if (this.activeTab === "items") {
            this.contentContainer.createEl("h4", { text: "Skill Bonuses (Magic Items & Gear)", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentSkillBonuses.length === 0) {
                listDiv.createEl("p", { text: "No item bonuses added.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentSkillBonuses.forEach((bonus, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });

                    const name = bonus[0];
                    const skill = bonus[1].replace(/\b\w/g, c => c.toUpperCase());
                    const val = Number(bonus[2]) > 0 ? `+${bonus[2]}` : `${bonus[2]}`;

                    row.createEl("span", { text: `${name}: ${val} to ${skill}`, cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", { text: "✕", cls: "dnd-modal-del-btn" });
                    delBtn.onclick = () => {
                        this.currentSkillBonuses.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const nameInput = addDiv.createEl("input", {
                type: "text",
                cls: "dnd-flex-2",
                attr: { placeholder: "Item Name (e.g. Cloak)" }
            });

            const selectEl = addDiv.createEl("select", { cls: "dnd-flex-2" });
            selectEl.createEl("option", { text: "-- Skill --", value: "" });
            this.allSkills.forEach(s => selectEl.createEl("option", { text: s, value: s.toLowerCase() }));

            const valInput = addDiv.createEl("input", {
                type: "number",
                cls: "dnd-flex-1",
                attr: { placeholder: "+ Val" }
            });

            const addBtn = addDiv.createEl("button", { text: "Add" });
            addBtn.onclick = () => {
                if (nameInput.value && selectEl.value && valInput.value) {
                    this.currentSkillBonuses.push([nameInput.value, selectEl.value, String(valInput.value)]);
                    this.renderContent();
                }
            };
        }

        else if (this.activeTab === "features") {
            this.contentContainer.createEl("h4", { text: "Hidden Character Features", cls: "dnd-manage-section-title" });

            const listDiv = this.contentContainer.createDiv({ cls: "dnd-manage-scroll-list" });
            if (this.currentHiddenFeatures.length === 0) {
                listDiv.createEl("p", { text: "No features are currently hidden.", cls: "dnd-manage-empty-box" });
            } else {
                this.currentHiddenFeatures.forEach((featName, index) => {
                    const row = listDiv.createDiv({ cls: "dnd-modal-list-row" });
                    row.createEl("span", { text: featName, cls: "dnd-modal-row-name" });

                    const delBtn = row.createEl("button", {
                        text: "✕",
                        cls: "dnd-modal-del-btn",
                        attr: { title: "Unhide Feature" }
                    });
                    delBtn.onclick = () => {
                        this.currentHiddenFeatures.splice(index, 1);
                        this.renderContent();
                    };
                });
            }

            const addDiv = this.contentContainer.createDiv({ cls: "dnd-modal-add-bar" });
            const selectEl = addDiv.createEl("select", { cls: "dnd-modal-add-select" });
            selectEl.createEl("option", { text: "-- Select Feature to Hide --", value: "" });

            const hiddenLowerSet = new Set(this.currentHiddenFeatures.map(f => f.toLowerCase().trim()));
            this.availableFeaturesToHide.forEach(featName => {
                if (!hiddenLowerSet.has(featName.toLowerCase().trim())) {
                    selectEl.createEl("option", { text: featName, value: featName });
                }
            });

            const hideBtn = addDiv.createEl("button", { text: "Hide Feature" });
            hideBtn.onclick = () => {
                if (selectEl.value) {
                    this.currentHiddenFeatures.push(selectEl.value);
                    this.renderContent();
                }
            };
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    async saveAllChanges() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        const updates: Record<string, any> = {};

        // 1. Process Stats Update
        Object.entries(this.currentStats).forEach(([stat, value]) => updates[`DnD_${stat}`] = value);

        // 1b. Process Saving Throw Proficiencies
        updates["DnD_classProficiencies"] = JSON.stringify(this.currentSavingThrows);

        // 2. Process Dynamic Armor AC Bonus & Unarmed Strike Damage (based on new Stats & Unarmored Defense!)
        const currentArmor = String(frontmatter["DnD_armor"] || "");
        const currentWeapon = String(frontmatter["DnD_weapon"] || "");
        const level = Number(frontmatter["DnD_level"]) || 1;
        const dndClass = frontmatter["DnD_class"];
        const classLevels = frontmatter["DnD_classLevels"];

        const safeWeaponName = currentWeapon.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        if (safeWeaponName === "unarmed-strike" || safeWeaponName === "unarmed-strikes") {
            updates["DnD_weaponDamage"] = await this.plugin.resolveUnarmedStrikeDamage(
                dndClass,
                classLevels,
                level,
                this.currentStats,
                this.currentAttackStat,
                this.plugin.settings
            );
        }

        const newDexMod = Math.floor((this.currentStats.dexterity - 10) / 2);
        let armorAcBonus = newDexMod;
        let isUnarmored = true;

        if (currentArmor && currentArmor.toLowerCase() !== "none") {
            const safeArmorName = currentArmor.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
            const armorData = await getItemData(this.app, this.plugin.settings, safeArmorName);

            if (armorData && armorData.category) {
                const category = String(armorData.category).toLowerCase();
                if (!category.includes("unarmored") && safeArmorName !== "unarmored-defense") {
                    isUnarmored = false;
                    if (category.includes("light")) armorAcBonus = newDexMod;
                    else if (category.includes("medium")) armorAcBonus = Math.min(newDexMod, 2);
                    else if (category.includes("heavy")) armorAcBonus = 0;
                }
            } else if (Number(frontmatter["DnD_armorAc"]) > 10) {
                isUnarmored = false;
            }
        }

        if (isUnarmored) {
            const unarmoredCalc = await this.plugin.resolveUnarmoredDefense(
                dndClass,
                classLevels,
                level,
                this.currentStats,
                this.plugin.settings
            );
            updates["DnD_armorAc"] = unarmoredCalc.baseAc;
            armorAcBonus = unarmoredCalc.acBonus;
        }

        updates["DnD_armorAcBonus"] = armorAcBonus;
        updates["DnD_armorAcMod"] = this.currentAcMod;
        updates["DnD_speed"] = this.currentSpeed;
        updates["DnD_customSpeedMod"] = this.currentCustomSpeedMod;
        updates["DnD_speedMod"] = this.currentSpeedMod;
        updates["DnD_attackRollMod"] = this.extraAttackMod;
        updates["DnD_attackStat"] = this.currentAttackStat;
        updates["DnD_attackProficiency"] = this.addAttackProficiency;
        updates["DnD_weaponMastery"] = serializeWeaponMasteryState(
            this.weaponMasteryState.available,
            this.weaponMasteryState.mastered
        );

        // 3. Process Skills Database
        const combinedProficiencies = [...this.baseProficiencies];
        this.currentExtraSkills.forEach(s => combinedProficiencies.push([s, "extra"]));
        updates["DnD_skillProficiencies"] = JSON.stringify(combinedProficiencies);

        // 4. Process Item Bonuses Database
        updates["DnD_skillBonuses"] = JSON.stringify(this.currentSkillBonuses);

        // 5. Process Hidden Features Database
        updates["DnD_hideFeature"] = JSON.stringify(this.currentHiddenFeatures);

        // --- EXECUTE FRONTMATTER SAVE ---
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);

        // --- EXECUTE MASS MARKDOWN REPLACEMENT ---
        const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
        if (file instanceof TFile) {
            await this.app.vault.process(file, (content) => {
                let updatedContent = content;

                // B. Update Skills Block (if inline lists are used instead of frontmatter pointers)
                const cSkills = combinedProficiencies.filter(p => p[1] === "class").map(p => `  - ${p[0]}`);
                const bSkills = combinedProficiencies.filter(p => p[1] === "background").map(p => `  - ${p[0]}`);
                const eSkills = combinedProficiencies.filter(p => p[1] === "extra").map(p => `  - ${p[0]}`);

                let bonusInject = "";
                if (this.currentSkillBonuses.length > 0) {
                    bonusInject = this.currentSkillBonuses.map(b =>
                        `  - name: ${b[0]}\n    target: ${b[1]}\n    value: ${b[2]}`
                    ).join('\n') + '\n';
                } else {
                    bonusInject = "  - name: <Item Name>\n    target: <chosen skill>\n    value: <+value>\n";
                }

                const bonusRegex = /(bonuses:\s*\n)([\s\S]*?)(?=\n```)/;
                updatedContent = updatedContent.replace(bonusRegex, `$1${bonusInject}`);

                let profInject = "";
                if (cSkills.length > 0) profInject += `  #Class\n${cSkills.join('\n')}\n`;
                if (bSkills.length > 0) profInject += `  #Background\n${bSkills.join('\n')}\n`;
                if (eSkills.length > 0) profInject += `  #Extra\n${eSkills.join('\n')}\n`;
                if (profInject === "") profInject = "  - <chosen skills>\n";

                const profRegex = /(```(?:dnd-)?skills[\s\S]*?proficiencies:\s*\n)([\s\S]*?)(?=\n[ \t]*expertise:)/;
                updatedContent = updatedContent.replace(profRegex, `$1${profInject}`);

                return updatedContent;
            });
        }

        new Notice("Character updated successfully!");
        this.close();
    }
}

// --- LEVEL UP MODAL ---
class LevelUpModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;
    currentLevel: number = 1;
    newLevel: number = 2;
    currentMaxHealth: number = 0;
    newMaxHealth: number = 0;
    conMod: number = 0;
    dndClass: string = "";
    hitDie: number = 8; // Safe fallback
    currentSubclass: string = "";
    subclassFmKey: string = "DnD_subclass";

    // Dynamic Milestone Container so selecting a Subclass refreshes choices/feats live
    milestonesContainer!: HTMLElement;

    // Data-Driven Granted Feats & ASI Tracking
    grantedFeatsState: {
        featureName: string;
        options: string[];
        chosenOptionType: "asi" | "router" | "feat";
        chosenOptionKey: string;
        chosenFeatKey: string;
        asiStat1: string;
        asiStat2: string;
        abilityChoices: Record<number, AbilityKey>;
        featExpertiseChoices: string[];
    }[] = [];
    currentStats: Record<string, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    originalConMod: number = 0;
    baseMaxHealthChosen: number = 0;
    conHpBonus: number = 0;
    hpInputEl: HTMLInputElement | null = null;
    retroactiveConHpBadge: HTMLElement | null = null;
    speedMilestoneBadge: HTMLElement | null = null;
    weaponMasteryMilestoneBadge: HTMLElement | null = null;
    currentSpeedCalc: SpeedModifierBreakdown | null = null;
    currentMasterySlots: number = 0;

    classChoicesState: { router: string, key: string, level: number, domIndex: number }[] = [];
    // Tracks purely additive Expertise gained at this specific level
    newExpertiseChoices: string[] = [];
    newGrantedExpertiseCount: number = 0;
    expertisePool: string[] = []; // Tracks the allowed JSON pool

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Level Up Character", cls: "dnd-section-header" });

        // 1. Fetch current live data from the active sheet
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.currentLevel = Number(frontmatter["DnD_level"]) || 1;
        this.newLevel = this.currentLevel + 1;

        this.currentMaxHealth = Number(frontmatter["DnD_maxHealth"]) || 0;
        this.newMaxHealth = this.currentMaxHealth;
        this.baseMaxHealthChosen = this.newMaxHealth;
        this.conHpBonus = 0;

        const conScore = Number(frontmatter["DnD_constitution"]) || 10;
        this.conMod = Math.floor((conScore - 10) / 2);
        this.originalConMod = this.conMod;

        // Fetch primary class and existing subclass safely (supporting both DnD_subclass and DnD_Subclass)
        const classVal = frontmatter["DnD_class"];
        this.dndClass = (Array.isArray(classVal) ? classVal[0] : classVal) || "";

        this.subclassFmKey = frontmatter["DnD_subclass"] !== undefined
            ? "DnD_subclass"
            : (frontmatter["DnD_Subclass"] !== undefined ? "DnD_Subclass" : "DnD_subclass");
        const subclassVal = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        this.currentSubclass = (Array.isArray(subclassVal) ? subclassVal[0] : subclassVal) || "";

        const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        statsList.forEach(s => {
            this.currentStats[s] = Number(frontmatter[`DnD_${s}`]) || 10;
        });

        // Fetch current speed breakdown at this.currentLevel for live milestone comparison
        this.currentSpeedCalc = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.currentLevel,
            frontmatter["DnD_extraFeats"],
            frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_armor"],
            frontmatter["DnD_speed"],
            frontmatter["DnD_customSpeedMod"],
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings
        );

        const bgDataForMastery = frontmatter["DnD_background"]
            ? await getBackgroundData(this.app, this.plugin.settings, frontmatter["DnD_background"])
            : null;
        const currentMasteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.currentLevel,
            frontmatter["DnD_extraFeats"],
            bgDataForMastery?.feat || frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"],
            this.plugin.settings
        );
        this.currentMasterySlots = currentMasteryCalc.totalSlots;

        // 2. Fetch the Hit Die from frontmatter (DnD_hitDice) or dynamically from the rulebook JSON
        let classData: any = null;
        if (this.dndClass) {
            classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
        }

        const fmHitDiceRaw = frontmatter["DnD_hitDice"] ?? frontmatter["DnD_hit_dice"] ?? frontmatter["hitDice"];
        const fmHitDiceStr = Array.isArray(fmHitDiceRaw) ? fmHitDiceRaw[0] : fmHitDiceRaw;
        const classHitDiceStr = classData?.HitDice || classData?.hitDice || classData?.hit_dice || classData?.hitDie || classData?.hit_die;
        const resolvedHdStr = (fmHitDiceStr !== undefined && fmHitDiceStr !== null && String(fmHitDiceStr).trim() !== "" && !String(fmHitDiceStr).trim().startsWith("<"))
            ? String(fmHitDiceStr).trim()
            : (classHitDiceStr ? String(classHitDiceStr).trim() : "");

        if (resolvedHdStr) {
            const parsed = parseInt(resolvedHdStr.replace(/\D/g, ''));
            if (!isNaN(parsed) && parsed > 0) this.hitDie = parsed;
        }

        // --- Build UI ---
        contentEl.createEl("p", {
            text: `Advancing from Level ${this.currentLevel} to Level ${this.newLevel}.`,
            cls: "dnd-levelup-intro"
        });
        this.speedMilestoneBadge = contentEl.createDiv({ cls: "dnd-asi-hidden" });
        this.weaponMasteryMilestoneBadge = contentEl.createDiv({ cls: "dnd-asi-hidden" });

        // A. Hit Points Section
        const hpDiv = contentEl.createDiv({ cls: "dnd-form-card" });
        hpDiv.createEl("label", {
            text: `New Max HP (Hit Die: d${this.hitDie}, CON: ${this.conMod > 0 ? '+' : ''}${this.conMod}):`,
            cls: "dnd-form-label-sub"
        });

        const hpInputContainer = hpDiv.createDiv({ cls: "dnd-modal-add-bar" });
        const hpInput = hpInputContainer.createEl("input", {
            type: "number",
            value: String(this.newMaxHealth),
            cls: "dnd-flex-1"
        });
        this.hpInputEl = hpInput;

        const averageHpGain = Math.ceil(this.hitDie / 2) + 1 + this.conMod;
        const avgBtn = hpInputContainer.createEl("button", { text: `Take Average (+${averageHpGain})` });
        avgBtn.onclick = async () => {
            this.baseMaxHealthChosen = this.currentMaxHealth + averageHpGain;
            await this.updateRetroactiveConHp();
        };

        hpInput.addEventListener('input', (e) => {
            const val = Number((e.target as HTMLInputElement).value) || 0;
            this.baseMaxHealthChosen = val - this.conHpBonus;
            this.newMaxHealth = val;
        });

        this.retroactiveConHpBadge = hpDiv.createDiv({ cls: "dnd-asi-hidden" });

        // B. Dynamic Subclass Section
        const targetLevel = this.newLevel.toString();
        let newlyGrantedSubclassFile: string | null = null;
        let grantedSubclassFeatureName = "Subclass";

        const newLevelClassFeatures = classData?.features?.[targetLevel];
        if (Array.isArray(newLevelClassFeatures)) {
            for (const feature of newLevelClassFeatures) {
                if (feature.grantedSubclasses && typeof feature.grantedSubclasses === "string") {
                    newlyGrantedSubclassFile = feature.grantedSubclasses.trim();
                    if (feature.name) grantedSubclassFeatureName = String(feature.name);
                    break;
                }
            }
        }

        if (newlyGrantedSubclassFile) {
            const subDiv = contentEl.createDiv({ cls: "dnd-form-card-active" });
            subDiv.createEl("label", {
                text: `Level ${this.newLevel} ${grantedSubclassFeatureName} (Select Subclass):`,
                cls: "dnd-form-label-bold"
            });

            const subSelect = subDiv.createEl("select", { cls: "dnd-modal-form-input" });
            subSelect.createEl("option", { text: "-- Select a Subclass --", value: "" });

            const allSubclasses = await getSubclassData(this.app, this.plugin.settings, newlyGrantedSubclassFile);
            if (allSubclasses && typeof allSubclasses === "object") {
                Object.keys(allSubclasses).forEach(s => subSelect.createEl("option", { text: s, value: s }));
            }

            subSelect.value = this.currentSubclass || "";
            subSelect.onchange = async (e) => {
                this.currentSubclass = (e.target as HTMLSelectElement).value;
                await this.renderDynamicMilestones(classData, frontmatter);
            };
        }

        // C. Container for Dynamic Class/Subclass Milestones
        this.milestonesContainer = contentEl.createDiv();
        await this.renderDynamicMilestones(classData, frontmatter);

        // D. Finalization Buttons
        const btnDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });
        const cancelBtn = btnDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnDiv.createEl("button", { text: "Complete Level Up", cls: "mod-cta" });
        confirmBtn.onclick = async (e) => {
            e.preventDefault();
            await this.executeLevelUp();
        };
    }

    async updateRetroactiveConHp() {
        let projectedCon = this.currentStats.constitution || 10;

        for (const gfState of this.grantedFeatsState) {
            if (gfState.chosenOptionType === "asi") {
                if (gfState.asiStat1 === "constitution") projectedCon = Math.min(20, projectedCon + 1);
                if (gfState.asiStat2 === "constitution") projectedCon = Math.min(20, projectedCon + 1);
            } else if (gfState.chosenFeatKey) {
                const featData = await getExtraFeat(this.app, this.plugin.settings, gfState.chosenFeatKey);
                if (featData) {
                    const improvements = parseFeatAbilityImprovements(featData);
                    improvements.forEach((imp, idx) => {
                        let targetStat: AbilityKey | null = null;
                        if (!imp.isChoice) {
                            targetStat = imp.options[0];
                        } else if (gfState.abilityChoices[idx]) {
                            targetStat = gfState.abilityChoices[idx];
                        }
                        if (targetStat === "constitution") {
                            projectedCon = Math.min(imp.maxCap, projectedCon + imp.amount);
                        }
                    });
                }
            }
        }

        const newConMod = Math.floor((projectedCon - 10) / 2);
        const modDelta = Math.max(0, newConMod - this.originalConMod);
        this.conHpBonus = modDelta * this.newLevel;

        this.newMaxHealth = this.baseMaxHealthChosen + this.conHpBonus;
        if (this.hpInputEl) {
            this.hpInputEl.value = String(this.newMaxHealth);
        }

        if (this.retroactiveConHpBadge) {
            if (this.conHpBonus > 0) {
                this.retroactiveConHpBadge.className = "dnd-form-hint";
                this.retroactiveConHpBadge.empty();
                this.retroactiveConHpBadge.createEl("strong", {
                    text: `CON Increase Retroactive HP: +${this.conHpBonus} Max HP `
                });
                this.retroactiveConHpBadge.createSpan({
                    text: `(+${modDelta} CON mod × Level ${this.newLevel}) automatically added to Max HP.`
                });
            } else {
                this.retroactiveConHpBadge.className = "dnd-asi-hidden";
                this.retroactiveConHpBadge.empty();
            }
        }
    }

    async updateSpeedMilestoneBadge() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        let existingFeats = frontmatter["DnD_extraFeats"];
        const currentFeats: string[] = Array.isArray(existingFeats)
            ? [...existingFeats]
            : (existingFeats ? [existingFeats] : []);

        for (const gf of this.grantedFeatsState) {
            if (gf.chosenFeatKey && !currentFeats.includes(gf.chosenFeatKey)) {
                currentFeats.push(gf.chosenFeatKey);
            }
        }

        const projectedSpeed = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            currentFeats,
            frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_armor"],
            frontmatter["DnD_speed"],
            frontmatter["DnD_customSpeedMod"],
            this.currentSubclass ? [this.currentSubclass] : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]),
            this.plugin.settings
        );

        if (this.speedMilestoneBadge && this.currentSpeedCalc) {
            if (projectedSpeed.totalSpeed > this.currentSpeedCalc.totalSpeed) {
                const diff = projectedSpeed.totalSpeed - this.currentSpeedCalc.totalSpeed;
                this.speedMilestoneBadge.className = "dnd-form-hint";
                this.speedMilestoneBadge.empty();
                this.speedMilestoneBadge.createEl("strong", { text: `⚡ Speed Increase: ` });
                this.speedMilestoneBadge.createSpan({
                    text: `${this.currentSpeedCalc.totalSpeed} ft. → ${projectedSpeed.totalSpeed} ft. (+${diff} ft.)`
                });
            } else {
                this.speedMilestoneBadge.className = "dnd-asi-hidden";
                this.speedMilestoneBadge.empty();
            }
        }

        const bgDataForMastery = frontmatter["DnD_background"]
            ? await getBackgroundData(this.app, this.plugin.settings, frontmatter["DnD_background"])
            : null;
        const projectedMastery = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            currentFeats,
            bgDataForMastery?.feat || frontmatter["DnD_backgroundFeat"],
            this.currentSubclass ? [this.currentSubclass] : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]),
            this.plugin.settings
        );

        if (this.weaponMasteryMilestoneBadge) {
            if (projectedMastery.totalSlots > this.currentMasterySlots) {
                const diff = projectedMastery.totalSlots - this.currentMasterySlots;
                this.weaponMasteryMilestoneBadge.className = "dnd-form-hint";
                this.weaponMasteryMilestoneBadge.empty();
                this.weaponMasteryMilestoneBadge.createEl("strong", { text: `⚔️ Weapon Mastery Slots: ` });
                this.weaponMasteryMilestoneBadge.createSpan({
                    text: `${this.currentMasterySlots} → ${projectedMastery.totalSlots} (+${diff} Slot${diff > 1 ? 's' : ''} — Manage in Attack Ability tab or Equip Items)`
                });
            } else {
                this.weaponMasteryMilestoneBadge.className = "dnd-asi-hidden";
                this.weaponMasteryMilestoneBadge.empty();
            }
        }
    }

    async renderDynamicMilestones(classData: any, frontmatter: Record<string, any>) {
        this.milestonesContainer.empty();

        this.grantedFeatsState = [];
        this.newGrantedExpertiseCount = 0;
        this.expertisePool = [];
        this.classChoicesState = [];
        this.newExpertiseChoices = [];

        const statsList = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        const slotsByRouter: Record<string, number> = {};
        const grantedFeatMilestones: { featureName: string; grantedFeats: string[] }[] = [];
        const targetLevel = this.newLevel.toString();

        if (classData) {
            let subclassData: any = null;
            const activeSubclassFile = this.plugin.findGrantedSubclass(classData, this.newLevel);
            if (this.currentSubclass && activeSubclassFile) {
                subclassData = await getSubclassData(this.app, this.plugin.settings, activeSubclassFile, this.currentSubclass);
            }

            let levelFeatures: any[] = [];
            if (classData?.features?.[targetLevel]) levelFeatures = levelFeatures.concat(classData.features[targetLevel]);
            if (subclassData?.[targetLevel]) levelFeatures = levelFeatures.concat(subclassData[targetLevel]);

            for (const feature of levelFeatures) {
                if (feature.grantedFeats && Array.isArray(feature.grantedFeats) && feature.grantedFeats.length > 0) {
                    grantedFeatMilestones.push({
                        featureName: feature.name || "Granted Feats",
                        grantedFeats: feature.grantedFeats
                    });
                }

                if (feature.classChoices && Array.isArray(feature.classChoices)) {
                    for (const router of feature.classChoices) {
                        if (!slotsByRouter[router]) slotsByRouter[router] = 0;
                        slotsByRouter[router] += 1;
                    }
                }

                if (feature.grantedExpertise && Array.isArray(feature.grantedExpertise) && feature.grantedExpertise.length === 2) {
                    this.expertisePool = [...new Set([...this.expertisePool, ...feature.grantedExpertise[0]])];
                    this.newGrantedExpertiseCount += feature.grantedExpertise[1] as number;
                }
            }
        }

        // 1. Class Choices Snapshot Engine
        let existingChoicesRaw = frontmatter["DnD_classChoices"] || [];
        if (typeof existingChoicesRaw === 'string') {
            try { existingChoicesRaw = JSON.parse(existingChoicesRaw); } catch { existingChoicesRaw = []; }
        }
        const existingChoices: { router: string | null; key: string; level: number }[] = [];
        for (const c of (Array.isArray(existingChoicesRaw) ? existingChoicesRaw : [])) {
            if (Array.isArray(c) && c.length === 3) {
                existingChoices.push({ router: String(c[0]), key: String(c[1]), level: Number(c[2]) });
            } else if (Array.isArray(c) && c.length === 2) {
                existingChoices.push({ router: null, key: String(c[0]), level: Number(c[1]) });
            }
        }

        for (const [routerName, slotCount] of Object.entries(slotsByRouter)) {
            const routerData = await getClassChoiceData(this.app, this.plugin.settings, routerName);

            if (routerData) {
                const routerDiv = this.milestonesContainer.createDiv({ cls: "dnd-form-card" });
                const displayName = routerName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                routerDiv.createEl("label", { text: `Manage ${displayName} (${slotCount} Slots)`, cls: "dnd-form-label-bold" });
                routerDiv.createEl("small", { text: "Review your choices. If you wish to swap an old choice, select a new one.", cls: "dnd-form-hint-block" });

                const pastChoicesForRouter = existingChoices.filter((c) =>
                    c.router === routerName || (c.router === null && routerData[c.key])
                );

                for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
                    const selectDiv = routerDiv.createDiv({ cls: "dnd-form-slot-row" });

                    let assignedKey = "";
                    let originalLevel = this.newLevel;

                    const pastChoice = pastChoicesForRouter[slotIndex];
                    if (pastChoice) {
                        assignedKey = pastChoice.key;
                        originalLevel = pastChoice.level;
                    }

                    selectDiv.createEl("small", { text: `Lvl ${originalLevel} Slot:`, cls: "dnd-form-slot-label" });

                    const selectEl = selectDiv.createEl("select", { cls: "dnd-form-slot-select" });
                    selectEl.createEl("option", { text: `-- Select Option --`, value: "" });

                    Object.entries(routerData).forEach(([key, val]) => {
                        selectEl.createEl("option", { text: val as string, value: key });
                    });

                    selectEl.value = assignedKey;
                    this.classChoicesState.push({ router: routerName, key: assignedKey, level: originalLevel, domIndex: slotIndex });

                    selectEl.onchange = (e) => {
                        const newVal = (e.target as HTMLSelectElement).value;
                        const stateObj = this.classChoicesState.find(c => c.router === routerName && c.domIndex === slotIndex);
                        if (stateObj) stateObj.key = newVal;
                    };
                }
            }
        }

        // 2. Additive Expertise UI
        if (this.newGrantedExpertiseCount > 0) {
            const expDiv = this.milestonesContainer.createDiv({ cls: "dnd-form-card" });
            expDiv.createEl("label", { text: `New Expertise Granted (${this.newGrantedExpertiseCount} Choices)`, cls: "dnd-form-label-bold" });
            expDiv.createEl("small", { text: "Select from your known proficiencies to gain Expertise.", cls: "dnd-form-hint-block" });

            let existingProfsRaw = frontmatter["DnD_skillProficiencies"] || [];
            if (typeof existingProfsRaw === 'string') try { existingProfsRaw = JSON.parse(existingProfsRaw); } catch { existingProfsRaw = []; }

            let knownSkills: string[] = [];
            (Array.isArray(existingProfsRaw) ? existingProfsRaw : []).forEach((p: any) => {
                if (Array.isArray(p) && p.length > 0) knownSkills.push(p[0]);
                else if (typeof p === 'string') knownSkills.push(p);
            });

            if (this.expertisePool.length > 0) {
                knownSkills = knownSkills.filter((s: string) => this.expertisePool.map(e => String(e).toLowerCase()).includes(String(s).toLowerCase()));
            }

            let existingExpRaw = frontmatter["DnD_skillExpertise"] || [];
            if (typeof existingExpRaw === 'string') try { existingExpRaw = JSON.parse(existingExpRaw); } catch { existingExpRaw = []; }
            const currentExpertise = (Array.isArray(existingExpRaw) ? existingExpRaw : []).map((e: any) => String(e[0]).toLowerCase());

            knownSkills = knownSkills.filter(s => !currentExpertise.includes(String(s).toLowerCase()));
            this.newExpertiseChoices = Array(this.newGrantedExpertiseCount).fill("");

            if (knownSkills.length === 0) {
                expDiv.createEl("p", {
                    text: "You have no eligible skill proficiencies available to gain Expertise in.",
                    cls: "dnd-error-text dnd-form-note"
                });
            } else {
                for (let i = 0; i < this.newGrantedExpertiseCount; i++) {
                    const selectDiv = expDiv.createDiv({ cls: "dnd-form-slot-row" });

                    selectDiv.createEl("small", { text: `Choice ${i + 1}:`, cls: "dnd-form-slot-label-sm" });
                    const selectEl = selectDiv.createEl("select", { cls: "dnd-flex-1" });
                    selectEl.createEl("option", { text: `-- Select Expertise --`, value: "" });

                    knownSkills.forEach((skill: string) => {
                        const displaySkill = skill.replace(/\b\w/g, c => c.toUpperCase());
                        selectEl.createEl("option", { text: displaySkill, value: skill });
                    });

                    selectEl.onchange = (e) => {
                        this.newExpertiseChoices[i] = (e.target as HTMLSelectElement).value;
                    };
                }
            }
        }

        // 3. Render Data-Driven Granted Feats / ASI Milestones
        for (let mIdx = 0; mIdx < grantedFeatMilestones.length; mIdx++) {
            const milestone = grantedFeatMilestones[mIdx];
            const state = {
                featureName: milestone.featureName,
                options: milestone.grantedFeats,
                chosenOptionType: "feat" as "asi" | "router" | "feat",
                chosenOptionKey: "",
                chosenFeatKey: "",
                asiStat1: "",
                asiStat2: "",
                abilityChoices: {} as Record<number, AbilityKey>,
                featExpertiseChoices: [] as string[]
            };
            this.grantedFeatsState.push(state);

            interface ClassifiedOption {
                key: string;
                type: "asi" | "router" | "feat";
                label: string;
                routerMap?: Record<string, string>;
                featData?: any;
            }
            const classifiedOptions: ClassifiedOption[] = [];
            for (const optKey of milestone.grantedFeats) {
                if (optKey === "ability-score-improvement") {
                    classifiedOptions.push({
                        key: optKey,
                        type: "asi",
                        label: "Ability Score Improvement (+2 / +1 & +1)"
                    });
                } else {
                    const routerMap = await getFeatMapData(this.app, this.plugin.settings, optKey);
                    if (routerMap && typeof routerMap === "object") {
                        classifiedOptions.push({
                            key: optKey,
                            type: "router",
                            label: formatFeatureOrSlug(optKey),
                            routerMap
                        });
                    } else {
                        const featData = await getExtraFeat(this.app, this.plugin.settings, optKey);
                        classifiedOptions.push({
                            key: optKey,
                            type: "feat",
                            label: featData?.name || formatFeatureOrSlug(optKey),
                            featData
                        });
                    }
                }
            }

            if (classifiedOptions.length === 0) continue;

            const cardDiv = this.milestonesContainer.createDiv({ cls: "dnd-form-card-active" });
            cardDiv.createEl("label", {
                text: `Level ${this.newLevel} Milestone: ${milestone.featureName}`,
                cls: "dnd-form-label-bold"
            });

            const optionContainer = cardDiv.createDiv();

            const renderImproveAbilitySub = async (targetEl: HTMLElement, featKey: string) => {
                targetEl.empty();
                state.abilityChoices = {};
                state.featExpertiseChoices = [];
                if (!featKey) {
                    await this.updateRetroactiveConHp();
                    return;
                }

                const featData = await getExtraFeat(this.app, this.plugin.settings, featKey);
                if (!featData) {
                    await this.updateRetroactiveConHp();
                    return;
                }

                const improvements = parseFeatAbilityImprovements(featData);
                const hasImprovedAbilitySave = featData.proficiencySavingThrow && (
                    featData.proficiencySavingThrow === "improvedAbility" ||
                    featData.proficiencySavingThrow === "improveAbility" ||
                    featData.proficiencySavingThrow === "chosen" ||
                    (Array.isArray(featData.proficiencySavingThrow) && featData.proficiencySavingThrow.some((s: string) => {
                        const lower = String(s).toLowerCase();
                        return lower === "improvedability" || lower === "improveability" || lower === "chosen";
                    }))
                );

                const existingSavingThrows = hasImprovedAbilitySave
                    ? parseSavingThrows(frontmatter["DnD_classProficiencies"])
                    : [];

                if (improvements.length > 0) {
                    const improveDiv = targetEl.createDiv({ cls: "dnd-form-group" });
                    for (let impIdx = 0; impIdx < improvements.length; impIdx++) {
                        const imp = improvements[impIdx];
                        if (!imp.isChoice) {
                            const stat = imp.options[0];
                            const curr = this.currentStats[stat] || 10;
                            const newVal = Math.min(imp.maxCap, curr + imp.amount);
                            const isCapped = curr >= imp.maxCap;
                            const badge = improveDiv.createDiv({ cls: "dnd-form-hint" });
                            badge.createEl("strong", { text: `+${imp.amount} ${formatFeatureOrSlug(stat)}: ` });
                            badge.createSpan({ text: `Current: ${curr} → New: ${newVal}${isCapped ? ` (Capped at ${imp.maxCap})` : ""}` });
                        } else {
                            const choiceGroup = improveDiv.createDiv({ cls: "dnd-form-group" });
                            choiceGroup.createEl("label", {
                                text: `Choose Ability Score (+${imp.amount}, max ${imp.maxCap}):`,
                                cls: "dnd-form-label-sm"
                            });
                            const selectEl = choiceGroup.createEl("select", { cls: "dnd-modal-form-input" });
                            selectEl.createEl("option", { text: "-- Select an Ability to Improve --", value: "" });
                            imp.options.forEach(ab => {
                                const curr = this.currentStats[ab] || 10;
                                const newVal = Math.min(imp.maxCap, curr + imp.amount);
                                const isCapped = curr >= imp.maxCap;
                                const isAlreadyProficient = hasImprovedAbilitySave && existingSavingThrows.includes(ab);

                                const tags: string[] = [];
                                if (isCapped) tags.push("Maxed");
                                if (isAlreadyProficient) tags.push("Already Proficient");
                                const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : "";

                                const optEl = selectEl.createEl("option", {
                                    text: `${formatFeatureOrSlug(ab)} (${curr} → ${newVal})${tagStr}`,
                                    value: ab
                                });
                                if (isCapped || isAlreadyProficient) optEl.disabled = true;
                            });
                            selectEl.onchange = async (e) => {
                                const val = (e.target as HTMLSelectElement).value as AbilityKey;
                                if (val && ALL_ABILITIES.includes(val)) {
                                    state.abilityChoices[impIdx] = val;
                                } else {
                                    delete state.abilityChoices[impIdx];
                                }
                                await this.updateRetroactiveConHp();
                            };
                        }
                    }

                    if (hasImprovedAbilitySave) {
                        const saveNote = improveDiv.createDiv({ cls: "dnd-form-hint" });
                        saveNote.createEl("small", { text: "Granted Saving Throw: You gain saving throw proficiency in the chosen ability." });
                    }
                }

                // Explicit saving throws from feat not tied to improvedAbility
                const explicitSaves = parseFeatSavingThrowProficiencies(featData);
                if (explicitSaves.length > 0) {
                    const saveDiv = targetEl.createDiv({ cls: "dnd-form-hint" });
                    saveDiv.createEl("strong", { text: "Granted Saving Throw Proficiency: " });
                    saveDiv.createSpan({ text: explicitSaves.map(s => formatFeatureOrSlug(s)).join(', ') });
                }

                // Granted Expertise from feat
                if (featData.grantedExpertise && Array.isArray(featData.grantedExpertise) && featData.grantedExpertise.length === 2) {
                    const featPool: string[] = Array.isArray(featData.grantedExpertise[0]) ? featData.grantedExpertise[0] : [];
                    const featExpCount: number = Number(featData.grantedExpertise[1]) || 0;

                    if (featExpCount > 0) {
                        state.featExpertiseChoices = Array(featExpCount).fill("");

                        const expDiv = targetEl.createDiv({ cls: "dnd-form-group" });
                        expDiv.createEl("label", {
                            text: `Granted Expertise (${featExpCount} ${featExpCount === 1 ? 'Choice' : 'Choices'}):`,
                            cls: "dnd-form-label-sm"
                        });

                        let existingProfsRaw = frontmatter["DnD_skillProficiencies"] || [];
                        if (typeof existingProfsRaw === 'string') {
                            try { existingProfsRaw = JSON.parse(existingProfsRaw); } catch { existingProfsRaw = []; }
                        }

                        let knownSkills: string[] = [];
                        (Array.isArray(existingProfsRaw) ? existingProfsRaw : []).forEach((p: any) => {
                            if (Array.isArray(p) && p.length > 0) knownSkills.push(p[0]);
                            else if (typeof p === 'string') knownSkills.push(p);
                        });

                        if (featPool.length > 0) {
                            const lowerPool = featPool.map(e => String(e).toLowerCase());
                            knownSkills = knownSkills.filter(s => lowerPool.includes(String(s).toLowerCase()));
                        }

                        let existingExpRaw = frontmatter["DnD_skillExpertise"] || [];
                        if (typeof existingExpRaw === 'string') {
                            try { existingExpRaw = JSON.parse(existingExpRaw); } catch { existingExpRaw = []; }
                        }
                        const currentExp = (Array.isArray(existingExpRaw) ? existingExpRaw : []).map((e: any) =>
                            Array.isArray(e) ? String(e[0]).toLowerCase() : String(e).toLowerCase()
                        );

                        knownSkills = knownSkills.filter(s =>
                            !currentExp.includes(String(s).toLowerCase()) &&
                            !this.newExpertiseChoices.map(c => c.toLowerCase()).includes(String(s).toLowerCase())
                        );

                        if (knownSkills.length === 0) {
                            expDiv.createEl("p", {
                                text: "You have no eligible skill proficiencies available to gain Expertise in.",
                                cls: "dnd-error-text dnd-form-note"
                            });
                        } else {
                            for (let i = 0; i < featExpCount; i++) {
                                const row = expDiv.createDiv({ cls: "dnd-form-slot-row" });
                                row.createEl("small", { text: `Choice ${i + 1}:`, cls: "dnd-form-slot-label-sm" });
                                const selectEl = row.createEl("select", { cls: "dnd-flex-1" });
                                selectEl.createEl("option", { text: "-- Select Expertise --", value: "" });

                                knownSkills.forEach(skill => {
                                    selectEl.createEl("option", {
                                        text: skill.replace(/\b\w/g, c => c.toUpperCase()),
                                        value: skill
                                    });
                                });

                                selectEl.onchange = (e) => {
                                    state.featExpertiseChoices[i] = (e.target as HTMLSelectElement).value;
                                };
                            }
                        }
                    }
                }

                await this.updateRetroactiveConHp();
                await this.updateSpeedMilestoneBadge();
            };

            const renderActiveOption = async (opt: ClassifiedOption) => {
                optionContainer.empty();
                state.chosenOptionKey = opt.key;
                state.chosenOptionType = opt.type;
                state.chosenFeatKey = "";
                state.asiStat1 = "";
                state.asiStat2 = "";
                state.abilityChoices = {};
                state.featExpertiseChoices = [];

                if (opt.type === "asi") {
                    const asiContainer = optionContainer.createDiv({ cls: "dnd-form-grid-2" });
                    const statSelect1 = asiContainer.createEl("select", { cls: "dnd-modal-form-input" });
                    const statSelect2 = asiContainer.createEl("select", { cls: "dnd-modal-form-input" });

                    const updateAsiOptions = () => {
                        const val1 = statSelect1.value;
                        const val2 = statSelect2.value;

                        statSelect1.empty();
                        statSelect2.empty();

                        statSelect1.createEl("option", { text: "-- +1 Stat --", value: "" });
                        statSelect2.createEl("option", { text: "-- +1 Stat --", value: "" });

                        statsList.forEach(s => {
                            const base = this.currentStats[s] || 10;

                            const new1 = Math.min(20, base + 1);
                            const capped1 = base >= 20;
                            const label1 = `${formatFeatureOrSlug(s)} (${base} → ${new1})${capped1 ? " (Maxed)" : ""}`;
                            const opt1 = statSelect1.createEl("option", { text: label1, value: s });
                            if (capped1) opt1.disabled = true;

                            const effectiveBase2 = (val1 === s) ? base + 1 : base;
                            const new2 = Math.min(20, effectiveBase2 + 1);
                            const capped2 = effectiveBase2 >= 20;
                            const label2 = `${formatFeatureOrSlug(s)} (${effectiveBase2} → ${new2})${capped2 ? " (Maxed)" : ""}`;
                            const opt2 = statSelect2.createEl("option", { text: label2, value: s });
                            if (capped2) opt2.disabled = true;
                        });

                        statSelect1.value = val1;
                        statSelect2.value = val2;
                    };

                    updateAsiOptions();

                    statSelect1.onchange = async (e) => {
                        state.asiStat1 = (e.target as HTMLSelectElement).value;
                        updateAsiOptions();
                        await this.updateRetroactiveConHp();
                    };
                    statSelect2.onchange = async (e) => {
                        state.asiStat2 = (e.target as HTMLSelectElement).value;
                        updateAsiOptions();
                        await this.updateRetroactiveConHp();
                    };

                    optionContainer.createEl("small", {
                        text: "Constitution increases automatically calculate and apply retroactive Max HP (+1 HP per level) above!",
                        cls: "dnd-form-hint"
                    });
                } else if (opt.type === "router") {
                    const featSelect = optionContainer.createEl("select", { cls: "dnd-modal-form-input dnd-form-group" });
                    featSelect.createEl("option", { text: "-- Select a Feat --", value: "" });
                    if (opt.routerMap) {
                        Object.entries(opt.routerMap).forEach(([key, name]) => {
                            featSelect.createEl("option", { text: name as string, value: key });
                        });
                    }
                    const abilityContainer = optionContainer.createDiv();
                    featSelect.onchange = async (e) => {
                        state.chosenFeatKey = (e.target as HTMLSelectElement).value;
                        await renderImproveAbilitySub(abilityContainer, state.chosenFeatKey);
                        await this.updateSpeedMilestoneBadge();
                    };
                } else if (opt.type === "feat") {
                    state.chosenFeatKey = opt.key;
                    const infoDiv = optionContainer.createDiv({ cls: "dnd-form-group" });
                    infoDiv.createEl("span", {
                        text: `Granted Feat: ${opt.label}`,
                        cls: "dnd-form-label-bold"
                    });
                    const abilityContainer = optionContainer.createDiv();
                    await renderImproveAbilitySub(abilityContainer, state.chosenFeatKey);
                }

                await this.updateRetroactiveConHp();
                await this.updateSpeedMilestoneBadge();
            };

            if (classifiedOptions.length > 1) {
                const choiceSelect = cardDiv.createEl("select", { cls: "dnd-modal-form-input dnd-form-group" });
                classifiedOptions.forEach((opt) => {
                    choiceSelect.createEl("option", { text: opt.label, value: opt.key });
                });
                choiceSelect.onchange = async (e) => {
                    const selectedKey = (e.target as HTMLSelectElement).value;
                    const foundOpt = classifiedOptions.find(o => o.key === selectedKey) || classifiedOptions[0];
                    await renderActiveOption(foundOpt);
                };
                cardDiv.insertBefore(choiceSelect, optionContainer);
                await renderActiveOption(classifiedOptions[0]);
            } else {
                await renderActiveOption(classifiedOptions[0]);
            }
        }

        if (this.classChoicesState.length > 0 || this.newGrantedExpertiseCount > 0) {
            this.milestonesContainer.createEl("p", {
                text: "Note: Please consult the rulebook regarding swapping choices. Generally, you may only replace one existing choice when you gain a level in a class.",
                cls: "dnd-form-note"
            });
        }

        await this.updateSpeedMilestoneBadge();
    }

    onClose() {
        this.contentEl.empty();
    }

    async executeLevelUp() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        let DnD_proficiency_bonus = Math.ceil(1 + (this.newLevel / 4));
        const hpGain = Math.max(0, this.newMaxHealth - this.currentMaxHealth);
        const existingCurrentHp = frontmatter["DnD_currentHealth"] !== undefined
            ? Number(frontmatter["DnD_currentHealth"])
            : this.currentMaxHealth;
        const DnD_current_health = Math.min(this.newMaxHealth, existingCurrentHp + hpGain);

        const updates: Record<string, any> = {
            "DnD_level": this.newLevel,
            "DnD_maxHealth": this.newMaxHealth,
            "DnD_currentHealth": DnD_current_health,
            [this.subclassFmKey]: this.currentSubclass ? [this.currentSubclass] : []
        };

        // Fetch Class JSON for Proficiency Bonus Progression & Spell Slot Progression
        if (this.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData) {
                const lvlIdx = Math.max(0, this.newLevel - 1);
                if (Array.isArray(classData.proficiencyBonus) && classData.proficiencyBonus[lvlIdx] !== undefined) {
                    DnD_proficiency_bonus = Number(classData.proficiencyBonus[lvlIdx]) || DnD_proficiency_bonus;
                }

                if (classData.spellcasting) {
                    const newSpellData = classData.spellcasting[this.newLevel.toString()];
                    if (newSpellData && Array.isArray(newSpellData.slots)) {
                        const slotKey = frontmatter["DnD_spellsSlots"] !== undefined && frontmatter["DnD_spellSlots"] === undefined
                            ? "DnD_spellsSlots"
                            : "DnD_spellSlots";

                        let existingSlots: any = frontmatter[slotKey];
                        if (typeof existingSlots === "string" && existingSlots.trim().startsWith("[")) {
                            try { existingSlots = JSON.parse(existingSlots.trim()); } catch { existingSlots = []; }
                        }
                        if (!Array.isArray(existingSlots)) existingSlots = [];

                        const updatedSlots: [string, string][] = Array.from({ length: 9 }, (_, index) => {
                            const maxStr = String(Number(newSpellData.slots[index]) || 0);
                            let currentUsed = "0";
                            const existingPair = existingSlots[index];
                            if (Array.isArray(existingPair) && existingPair.length >= 2) {
                                currentUsed = String(existingPair[1] || "0");
                            }
                            return [maxStr, currentUsed];
                        });

                        // Save as a JSON string to force Obsidian to keep it as a one-liner!
                        updates[slotKey] = JSON.stringify(updatedSlots);
                    }
                }
            }
        }

        updates["DnD_proficiencyBonus"] = DnD_proficiency_bonus;

        // Snapshot Output: Map down to [Key, Level] strictly as strings (2-part tuple)
        const finalClassChoices = this.classChoicesState
            .filter(c => c.key !== "")
            .map(c => [String(c.key), String(c.level)]);

        if (this.classChoicesState.length > 0) {
            updates["DnD_classChoices"] = JSON.stringify(finalClassChoices);
        }

        // Purely Additive Expertise Output (using strings in arrays)
        let existingExpRaw = frontmatter["DnD_skillExpertise"] || [];
        if (typeof existingExpRaw === 'string') try { existingExpRaw = JSON.parse(existingExpRaw); } catch { existingExpRaw = []; }

        const finalExpertise = (Array.isArray(existingExpRaw) ? existingExpRaw : []).map((e: any) => Array.isArray(e) ? [String(e[0]), String(e[1])] : e);

        this.newExpertiseChoices.forEach(choice => {
            if (choice) {
                finalExpertise.push([String(choice), String(this.newLevel)]);
            }
        });

        this.grantedFeatsState.forEach(gf => {
            if (gf.featExpertiseChoices && Array.isArray(gf.featExpertiseChoices)) {
                gf.featExpertiseChoices.forEach(choice => {
                    if (choice) {
                        finalExpertise.push([String(choice), String(this.newLevel)]);
                    }
                });
            }
        });

        if (finalExpertise.length > 0) updates["DnD_skillExpertise"] = JSON.stringify(finalExpertise);

        // --- Handle Data-Driven Granted Feats / ASI & Recalculate Unarmed Strike / AC Bonus on Level Up ---
        let existingFeats = frontmatter["DnD_extraFeats"];
        if (!Array.isArray(existingFeats)) {
            existingFeats = existingFeats ? [existingFeats] : [];
        }

        for (const gfState of this.grantedFeatsState) {
            if (gfState.chosenOptionType === "asi") {
                if (gfState.asiStat1) this.currentStats[gfState.asiStat1] += 1;
                if (gfState.asiStat2) this.currentStats[gfState.asiStat2] += 1;

                Object.keys(this.currentStats).forEach(s => updates[`DnD_${s}`] = this.currentStats[s]);
            } else if (gfState.chosenFeatKey) {
                existingFeats.push(gfState.chosenFeatKey);
                updates["DnD_extraFeats"] = [...existingFeats];

                const chosenFeatData = await getExtraFeat(this.app, this.plugin.settings, gfState.chosenFeatKey);
                if (chosenFeatData) {
                    const improvements = parseFeatAbilityImprovements(chosenFeatData);
                    improvements.forEach((entry, idx) => {
                        let targetStat: AbilityKey | null = null;
                        if (!entry.isChoice) {
                            targetStat = entry.options[0];
                        } else if (gfState.abilityChoices[idx]) {
                            targetStat = gfState.abilityChoices[idx];
                        }

                        if (targetStat && ALL_ABILITIES.includes(targetStat)) {
                            const currentVal = this.currentStats[targetStat] || 10;
                            const newVal = Math.min(entry.maxCap, currentVal + entry.amount);
                            this.currentStats[targetStat] = newVal;
                            updates[`DnD_${targetStat}`] = newVal;
                        }
                    });
                }
            }
        }

        // Collect saving throw proficiencies from chosen feats
        const currentSaves = parseSavingThrows(frontmatter["DnD_classProficiencies"]);
        let savesUpdated = false;

        for (const gfState of this.grantedFeatsState) {
            if (gfState.chosenFeatKey) {
                const chosenFeatData = await getExtraFeat(this.app, this.plugin.settings, gfState.chosenFeatKey);
                if (chosenFeatData) {
                    const chosenAbilities = Object.values(gfState.abilityChoices);
                    const firstChoice = chosenAbilities[0];
                    const gainedSaves = parseFeatSavingThrowProficiencies(chosenFeatData, firstChoice);
                    for (const save of gainedSaves) {
                        if (!currentSaves.includes(save)) {
                            currentSaves.push(save);
                            savesUpdated = true;
                        }
                    }
                }
            }
        }

        if (savesUpdated) {
            updates["DnD_classProficiencies"] = JSON.stringify(currentSaves);
        }

        // Always recalculate Unarmed Strike damage (in case scalingDice increased at this level or ASI boosted STR/DEX)
        const currentWeapon = String(frontmatter["DnD_weapon"] || "");
        const safeWeaponName = currentWeapon.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        if (safeWeaponName === "unarmed-strike" || safeWeaponName === "unarmed-strikes") {
            updates["DnD_weaponDamage"] = await this.plugin.resolveUnarmedStrikeDamage(
                frontmatter["DnD_class"] || this.dndClass,
                frontmatter["DnD_classLevels"],
                this.newLevel,
                this.currentStats,
                String(frontmatter["DnD_attackStat"] || "strength"),
                this.plugin.settings
            );
        }

        // Recalculate AC Bonus in case Dexterity/Unarmored Defense stat increased or Unarmored Defense was unlocked
        const currentArmor = String(frontmatter["DnD_armor"] || "");
        const newDexMod = Math.floor((this.currentStats.dexterity - 10) / 2);
        let armorAcBonus = newDexMod;
        let isUnarmored = true;

        if (currentArmor && currentArmor.toLowerCase() !== "none") {
            const safeArmorName = currentArmor.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
            const armorData = await getItemData(this.app, this.plugin.settings, safeArmorName);

            if (armorData && armorData.category) {
                const category = String(armorData.category).toLowerCase();
                if (!category.includes("unarmored") && safeArmorName !== "unarmored-defense") {
                    isUnarmored = false;
                    if (category.includes("light")) armorAcBonus = newDexMod;
                    else if (category.includes("medium")) armorAcBonus = Math.min(newDexMod, 2);
                    else if (category.includes("heavy")) armorAcBonus = 0;
                }
            } else if (Number(frontmatter["DnD_armorAc"]) > 10) {
                isUnarmored = false;
            }
        }

        if (isUnarmored) {
            const unarmoredCalc = await this.plugin.resolveUnarmoredDefense(
                frontmatter["DnD_class"] || this.dndClass,
                frontmatter["DnD_classLevels"],
                this.newLevel,
                this.currentStats,
                this.plugin.settings
            );
            updates["DnD_armorAc"] = unarmoredCalc.baseAc;
            armorAcBonus = unarmoredCalc.acBonus;
        }
        updates["DnD_armorAcBonus"] = armorAcBonus;

        // Recalculate deterministic Speed Modifier
        const speedCalc = await this.plugin.resolveCharacterSpeedModifiers(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            existingFeats,
            frontmatter["DnD_backgroundFeat"],
            frontmatter["DnD_armor"],
            frontmatter["DnD_speed"],
            frontmatter["DnD_customSpeedMod"],
            this.currentSubclass ? [this.currentSubclass] : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]),
            this.plugin.settings
        );
        updates["DnD_speedMod"] = speedCalc.totalSpeedMod;

        const bgDataForMastery = frontmatter["DnD_background"]
            ? await getBackgroundData(this.app, this.plugin.settings, frontmatter["DnD_background"])
            : null;
        const masteryCalc = await this.plugin.resolveCharacterWeaponMasterySlots(
            frontmatter["DnD_class"] || this.dndClass,
            frontmatter["DnD_classLevels"],
            this.newLevel,
            existingFeats,
            bgDataForMastery?.feat || frontmatter["DnD_backgroundFeat"],
            this.currentSubclass ? [this.currentSubclass] : (frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"]),
            this.plugin.settings
        );
        const existingMasteryState = parseWeaponMasteryState(frontmatter["DnD_weaponMastery"]);
        updates["DnD_weaponMastery"] = serializeWeaponMasteryState(masteryCalc.totalSlots, existingMasteryState.mastered);

        // 1. Thread-safe Frontmatter Update
        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);

        // 2. Thread-safe Markdown String Update (Expertise in skills block)
        if (finalExpertise.length > 0) {
            const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
            if (file instanceof TFile) {
                await this.app.vault.process(file, (content) => {
                    const expInject = finalExpertise.map((e: any) => `  - ${e[0]}`).join('\n') + '\n';
                    const expRegex = /(expertise:\s*\n)([\s\S]*?)(?=\n[ \t]*half_proficiencies:)/;
                    return content.replace(expRegex, `$1${expInject}`);
                });
            }
        }

        new Notice(`Successfully leveled up to Level ${this.newLevel}!`);
        this.close();
    }
}

// --- SPELLBOOK MODAL ---
class SpellbookModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    dndClass: string = "";
    characterLevel: number = 1;
    spellsPoolFile: string = "";

    // Progression limits from class JSON ("spellcasting" or "pactMagic")
    maxCantrips: number = 0;
    maxPreparedSpells: number = 0;

    // Router data: { "0": { "mage-hand": "Mage Hand" }, "1": { "magic-missile": "Magic Missile" } }
    routerData: Record<string, Record<string, string>> = {};

    // Internal state mapped by string level ("0", "1", ..., "9") -> array of spell keys
    knownSpellsByLevel: Record<string, string[]> = {};
    preparedSpellsByLevel: Record<string, string[]> = {};

    // UI Elements for live re-rendering
    activeLevelTab: string = "0";
    trackerContainer!: HTMLElement;
    tabsContainer!: HTMLElement;
    listContainer!: HTMLElement;
    previewContainer!: HTMLElement;
    renderChild!: MarkdownRenderChild;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    // Helper: Reads a spell or spell router from the bundled registry (or customRulebookPath)
    async loadSpellJson(fileNameWithoutExt: string): Promise<any | null> {
        return await getSpellData(this.app, this.plugin.settings, fileNameWithoutExt);
    }

    // Helper: Parses frontmatter tuple array [ [ ["spell1", "spell2"], "1" ] ] into Record<string, string[]>
    parseSpellTuples(raw: any): Record<string, string[]> {
        const result: Record<string, string[]> = {};
        let parsed = raw;

        if (typeof raw === "string") {
            try { parsed = JSON.parse(raw); } catch { parsed = []; }
        }

        if (Array.isArray(parsed)) {
            for (const entry of parsed) {
                if (Array.isArray(entry) && entry.length === 2) {
                    const [spellsList, lvlKey] = entry;
                    const safeLvl = String(lvlKey);
                    if (Array.isArray(spellsList)) {
                        result[safeLvl] = spellsList.map(s => String(s));
                    }
                }
            }
        }
        return result;
    }

    // Helper: Formats Record<string, string[]> back into [ [ ["spell1", "spell2"], "1" ] ]
    formatSpellTuples(map: Record<string, string[]>): [string[], string][] {
        const output: [string[], string][] = [];
        const sortedLevels = Object.keys(map).sort((a, b) => Number(a) - Number(b));

        for (const lvl of sortedLevels) {
            const spells = map[lvl];
            if (Array.isArray(spells) && spells.length > 0) {
                output.push([spells, String(lvl)]);
            }
        }
        return output;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-spellbook-modal");

        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        contentEl.createEl("h3", { text: "📖 Spellbook Manager", cls: "dnd-section-header dnd-modal-header" });

        // 1. Read Frontmatter
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        this.characterLevel = Number(frontmatter["DnD_level"]) || 1;
        const classVal = frontmatter["DnD_class"];
        this.dndClass = (Array.isArray(classVal) ? classVal[0] : classVal) || "";

        // Parse Known Spells (DnD_spells) and Prepared Spells (DnD_preparedSpells)
        this.knownSpellsByLevel = this.parseSpellTuples(frontmatter["DnD_spells"]);
        this.preparedSpellsByLevel = this.parseSpellTuples(frontmatter["DnD_preparedSpells"]);

        // 2. Fetch Class Data to find "spellsPool" and "spellcasting" / "pactMagic" limits
        if (this.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData) {
                if (classData.spellsPool) {
                    this.spellsPoolFile = String(classData.spellsPool).trim();
                }

                const lvlStr = this.characterLevel.toString();
                const castingTable = classData.spellcasting?.[lvlStr] || classData.pactMagic?.[lvlStr];
                if (castingTable) {
                    this.maxCantrips = Number(castingTable.cantrips) || 0;
                    this.maxPreparedSpells = Number(castingTable.preparedSpells) || 0;
                }
            }
        }

        if (!this.spellsPoolFile) {
            contentEl.createEl("p", {
                text: `No "spellsPool" property found in ${this.dndClass || "class"} JSON. Add "spellsPool": "<router-filename>" to your class JSON to enable the Spellbook.`,
                cls: "dnd-error-text"
            });
            return;
        }

        // 3. Load Spell Pool Router Map from spellsMap (or customRulebookPath)
        const loadedRouter = await getSpellsPoolData(this.app, this.plugin.settings, this.spellsPoolFile);
        if (!loadedRouter || typeof loadedRouter !== "object") {
            contentEl.createEl("p", {
                text: `Could not load spell router file: /rulebook/spells/${this.spellsPoolFile}.json`,
                cls: "dnd-error-text"
            });
            return;
        }
        this.routerData = loadedRouter;

        // Ensure default active tab exists in routerData
        const availableLevels = Object.keys(this.routerData).sort((a, b) => Number(a) - Number(b));
        if (availableLevels.length > 0 && !availableLevels.includes(this.activeLevelTab)) {
            this.activeLevelTab = availableLevels[0];
        }

        // 4. Build Layout Containers
        this.trackerContainer = contentEl.createDiv({ cls: "dnd-modal-tracker" });
        this.tabsContainer = contentEl.createDiv({ cls: "dnd-modal-tabs" });

        const bodyGrid = contentEl.createDiv({ cls: "dnd-spellbook-body" });
        this.listContainer = bodyGrid.createDiv({ cls: "dnd-spellbook-list" });
        this.previewContainer = bodyGrid.createDiv({ cls: "dnd-spellbook-preview" });
        this.renderEmptyPreview();

        // 5. Footer Buttons
        const footerDiv = contentEl.createDiv({ cls: "dnd-modal-footer" });

        const cancelBtn = footerDiv.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = footerDiv.createEl("button", { text: "Save Spellbook", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            await this.saveSpellbook();
        };

        // Initial Render
        this.renderTracker();
        this.renderLevelTabs();
        this.renderSpellList();
    }

    // Counts total prepared cantrips (level "0") and leveled spells ("1"-"9")
    getPreparedCounts(): { cantrips: number; leveled: number } {
        const cantrips = (this.preparedSpellsByLevel["0"] || []).length;
        let leveled = 0;
        for (const [lvl, list] of Object.entries(this.preparedSpellsByLevel)) {
            if (lvl !== "0" && Array.isArray(list)) {
                leveled += list.length;
            }
        }
        return { cantrips, leveled };
    }

    renderTracker() {
        this.trackerContainer.empty();
        const { cantrips, leveled } = this.getPreparedCounts();

        const leftInfo = this.trackerContainer.createDiv();
        leftInfo.createEl("strong", {
            text: `${this.dndClass} (Level ${this.characterLevel})`,
            cls: "dnd-modal-tracker-title"
        });

        const rightCounters = this.trackerContainer.createDiv({ cls: "dnd-modal-tracker-counters" });

        const cantripText = this.maxCantrips > 0 ? `${cantrips} / ${this.maxCantrips}` : `${cantrips}`;
        const prepText = this.maxPreparedSpells > 0 ? `${leveled} / ${this.maxPreparedSpells}` : `${leveled}`;

        const cSpan = rightCounters.createEl("span", { cls: "dnd-modal-tracker-stat" });
        cSpan.createEl("strong", { text: "Cantrips Prepared: " });
        cSpan.createSpan({ text: cantripText });

        const pSpan = rightCounters.createEl("span", { cls: "dnd-modal-tracker-stat" });
        pSpan.createEl("strong", { text: "Spells Prepared: " });
        pSpan.createSpan({ text: prepText });
    }

    renderLevelTabs() {
        this.tabsContainer.empty();
        const availableLevels = Object.keys(this.routerData).sort((a, b) => Number(a) - Number(b));

        for (const lvl of availableLevels) {
            const label = lvl === "0" ? "Cantrips" : `Lvl ${lvl}`;
            const isActive = this.activeLevelTab === lvl;

            const btn = this.tabsContainer.createEl("button", {
                text: label,
                cls: `dnd-modal-tab-btn ${isActive ? "is-active" : ""}`.trim()
            });

            btn.onclick = () => {
                this.activeLevelTab = lvl;
                this.renderLevelTabs();
                this.renderSpellList();
            };
        }
    }

    renderSpellList() {
        this.listContainer.empty();

        const lvl = this.activeLevelTab;
        const levelPool = this.routerData[lvl] || {};

        if (!this.knownSpellsByLevel[lvl]) this.knownSpellsByLevel[lvl] = [];
        if (!this.preparedSpellsByLevel[lvl]) this.preparedSpellsByLevel[lvl] = [];

        const knownList = this.knownSpellsByLevel[lvl];
        const preparedList = this.preparedSpellsByLevel[lvl];

        const addBar = this.listContainer.createDiv({ cls: "dnd-modal-add-bar" });

        const selectEl = addBar.createEl("select", { cls: "dnd-modal-add-select" });
        selectEl.createEl("option", { text: `-- Add ${lvl === "0" ? "Cantrip" : `Level ${lvl} Spell`} --`, value: "" });

        Object.entries(levelPool)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([spellKey, spellName]) => {
                if (!knownList.includes(spellKey)) {
                    selectEl.createEl("option", { text: spellName, value: spellKey });
                }
            });

        selectEl.onchange = async () => {
            const chosenKey = selectEl.value;
            if (chosenKey) {
                await this.renderSpellPreview(chosenKey, levelPool[chosenKey]);
            } else {
                this.renderEmptyPreview();
            }
        };

        const addBtn = addBar.createEl("button", { text: "Add" });
        addBtn.onclick = async () => {
            const chosenKey = selectEl.value;
            if (!chosenKey) return;

            knownList.push(chosenKey);
            this.renderSpellList();
            await this.renderSpellPreview(chosenKey, levelPool[chosenKey]);
        };

        if (knownList.length === 0) {
            this.listContainer.createEl("p", {
                text: `No ${lvl === "0" ? "cantrips" : `level ${lvl} spells`} in your Spellbook yet.`,
                cls: "dnd-modal-empty-text"
            });
            return;
        }

        for (const spellKey of knownList) {
            const displayName = levelPool[spellKey] || spellKey.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            const isPrepared = preparedList.includes(spellKey);

            const row = this.listContainer.createDiv({
                cls: `dnd-modal-list-row ${isPrepared ? "is-active" : ""}`.trim()
            });

            const leftGroup = row.createDiv({ cls: "dnd-modal-row-left is-clickable" });

            const prepCheckbox = leftGroup.createEl("input", {
                type: "checkbox",
                attr: { title: "Toggle Prepared Status" }
            });
            prepCheckbox.checked = isPrepared;

            prepCheckbox.onclick = (e) => {
                e.stopPropagation();
                const { cantrips, leveled } = this.getPreparedCounts();

                if (prepCheckbox.checked) {
                    if (lvl === "0" && this.maxCantrips > 0 && cantrips >= this.maxCantrips) {
                        prepCheckbox.checked = false;
                        new Notice(`Cantrip limit reached (${this.maxCantrips} max). Unprepare a cantrip first!`);
                        return;
                    }
                    if (lvl !== "0" && this.maxPreparedSpells > 0 && leveled >= this.maxPreparedSpells) {
                        prepCheckbox.checked = false;
                        new Notice(`Prepared spells limit reached (${this.maxPreparedSpells} max). Unprepare a spell first!`);
                        return;
                    }
                    if (!preparedList.includes(spellKey)) preparedList.push(spellKey);
                } else {
                    this.preparedSpellsByLevel[lvl] = preparedList.filter(k => k !== spellKey);
                }

                this.renderTracker();
                this.renderSpellList();
            };

            leftGroup.createEl("span", { text: displayName, cls: "dnd-modal-row-name" });
            leftGroup.onclick = async () => {
                await this.renderSpellPreview(spellKey, displayName);
            };

            const delBtn = row.createEl("button", {
                text: "✕",
                cls: "dnd-modal-del-btn",
                attr: { title: "Remove from Spellbook" }
            });
            delBtn.onclick = () => {
                this.knownSpellsByLevel[lvl] = knownList.filter(k => k !== spellKey);
                this.preparedSpellsByLevel[lvl] = this.preparedSpellsByLevel[lvl].filter(k => k !== spellKey);
                this.renderTracker();
                this.renderSpellList();
            };
        }
    }

    renderEmptyPreview() {
        this.previewContainer.empty();
        this.previewContainer.createEl("p", {
            text: "Click on any spell in your Spellbook to inspect its details.",
            cls: "dnd-modal-preview-empty"
        });
    }

    async renderSpellPreview(spellKey: string, fallbackName: string) {
        this.previewContainer.empty();
        const spellData = await this.loadSpellJson(spellKey);

        if (!spellData) {
            this.previewContainer.createEl("h4", { text: fallbackName, cls: "dnd-modal-preview-title" });
            this.previewContainer.createEl("p", {
                text: `Details file (/rulebook/spells/${spellKey}.json) not found.`,
                cls: "dnd-modal-empty-text"
            });
            return;
        }

        const headerDiv = this.previewContainer.createDiv({ cls: "dnd-modal-preview-header" });
        headerDiv.createEl("h4", { text: spellData.name || fallbackName, cls: "dnd-modal-preview-title" });

        const badgesDiv = headerDiv.createDiv({ cls: "dnd-modal-preview-badges" });
        if (spellData.concentration) {
            badgesDiv.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
        }
        if (spellData.ritual) {
            badgesDiv.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
        }

        const lvlText = Number(spellData.level) === 0 ? `${spellData.school || ""} Cantrip` : `Level ${spellData.level} ${spellData.school || ""}`;
        this.previewContainer.createEl("div", {
            text: lvlText.trim(),
            cls: "dnd-modal-preview-sub"
        });

        const metaDiv = this.previewContainer.createDiv({ cls: "dnd-modal-preview-meta" });

        if (spellData.castingTime) metaDiv.createEl("div", { text: `Casting Time: ${spellData.castingTime}` });
        if (spellData.range) metaDiv.createEl("div", { text: `Range: ${spellData.range}` });
        if (spellData.components) {
            const compStr = Array.isArray(spellData.components) ? spellData.components.join(", ") : String(spellData.components);
            const matStr = spellData.materials ? ` (${spellData.materials})` : "";
            metaDiv.createEl("div", { text: `Components: ${compStr}${matStr}` });
        }
        if (spellData.duration) metaDiv.createEl("div", { text: `Duration: ${spellData.duration}` });

        if (spellData.description) {
            const descDiv = this.previewContainer.createDiv({ cls: "dnd-modal-preview-desc" });
            await this.plugin.renderDndMarkdown(spellData.description, descDiv, this.sourcePath, this.renderChild);
        }
    }

    async saveSpellbook() {
        const formattedKnown = this.formatSpellTuples(this.knownSpellsByLevel);
        const formattedPrepared = this.formatSpellTuples(this.preparedSpellsByLevel);

        await this.plugin.updateCharacterFrontmatter(this.sourcePath, {
            "DnD_spells": JSON.stringify(formattedKnown),
            "DnD_preparedSpells": JSON.stringify(formattedPrepared)
        });

        new Notice("Spellbook saved!");
        this.close();
    }

    onClose() {
        if (this.renderChild) {
            this.renderChild.unload();
        }
        this.contentEl.empty();
    }
}

// --- CUSTOM NOTIFICATION UI ---
export class DnDCustomNotice extends Notice {
    constructor(
        title: string,
        message: string,
        iconString: string = "🎲",
        primaryAction?: { text: string; callback: () => void },
        secondaryAction?: { text: string; callback: () => void },
        duration: number = 0
    ) {
        super("", duration);

        const rootEl = (this.noticeEl.closest(".notice") as HTMLElement) || this.noticeEl;
        rootEl.empty();
        rootEl.addClass("dnd-custom-notice");
        rootEl.onclick = (e) => e.stopPropagation();

        const layout = rootEl.createDiv({ cls: "dnd-notice-layout" });

        const iconBox = layout.createDiv({ cls: "dnd-notice-icon" });
        iconBox.innerText = iconString;

        const contentCol = layout.createDiv({ cls: "dnd-notice-content" });
        const headerRow = contentCol.createDiv({ cls: "dnd-notice-header" });

        headerRow.createEl("div", { text: title, cls: "dnd-notice-title" });

        const closeBtn = headerRow.createEl("button", {
            text: "✕",
            cls: "dnd-notice-close",
            attr: { title: "Dismiss" }
        });
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.hide();
        };

        contentCol.createEl("div", { text: message, cls: "dnd-notice-message" });

        if (primaryAction || secondaryAction) {
            const btnRow = contentCol.createDiv({ cls: "dnd-notice-buttons" });

            if (primaryAction) {
                const pBtn = btnRow.createEl("button", {
                    text: primaryAction.text,
                    cls: "mod-cta dnd-notice-btn-primary"
                });
                pBtn.onclick = (e) => {
                    e.stopPropagation();
                    primaryAction.callback();
                    this.hide();
                };
            }

            if (secondaryAction) {
                const sBtn = btnRow.createEl("button", {
                    text: secondaryAction.text,
                    cls: "dnd-notice-btn-secondary"
                });
                sBtn.onclick = (e) => {
                    e.stopPropagation();
                    secondaryAction.callback();
                    this.hide();
                };
            }
        }
    }
}