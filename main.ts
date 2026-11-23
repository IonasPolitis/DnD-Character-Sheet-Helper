import {
    MarkdownRenderChild,
    MarkdownRenderer,
    MarkdownView,
    Notice,
    Platform,
    Plugin,
    TFile,
    WorkspaceLeaf,
    addIcon,
    normalizePath
} from 'obsidian';
import {
    buildWeaponMasteriesMarkdown,
    getCleanCustomBasePath,
    getItemData,
    getSpellData,
    getWeaponMasteriesMap,
    getWeaponMasteryDescription,
    mergeDictionaries,
    readCustomJson
} from './data';
import { MarkdownNotes, itemsMap } from './registry';
import { generateObsidianThemeColors, resolveObsidianNoteSurfaceVars } from './themes';
import { DM_RIBBON_ICON_SVG, WIZARD_RIBBON_ICON_SVG } from './ribbon-icon';
import { DEFAULT_SETTINGS, DnDPluginSettings, DnDSettingsTab } from './src/settings';
import { sanitizeWeaponSlug } from './src/helpers';
import { NoteModal, DnDCustomNotice } from './src/modals/rest-note-modals';
import { CharacterWizardModal } from './src/modals/wizard-modal';
import { registerCharacterSheetBlocks } from './src/character-sheet';
import {
    collectAutoGrantedFeats,
    collectRaceAutoGrantedFeats,
    extractSingleAutoGrantedFeat,
    extractSpellPoolsFromContent,
    findGrantedSubclass,
    populateFeatureRestTypesForFile,
    resetCharacterRestState,
    resolveBackgroundFeatId,
    resolveCharacterInitiativeModifiers,
    resolveCharacterSpeedModifiers,
    resolveCharacterWeaponMasterySlots,
    resolveClassChoiceRoutersUpToLevel,
    resolveEquippedArmorStats,
    resolveRaceSpellcastingMetadata,
    resolveSpellcastingMetadata,
    resolveUnarmedStrikeDamage,
    resolveUnarmoredDefense
} from './src/character-mechanics';
import {
    DM_TOOLS_VIEW_TYPE,
    DMToolsModal,
    DMToolsSidebarView,
    DMToolsTabId,
    processDnDInitiativeBlock,
    processDnDPartyBlock
} from './src/dm-tools';

export * from './src/helpers';
export type { DnDPluginSettings } from './src/settings';
export { DEFAULT_SETTINGS, DnDSettingsTab } from './src/settings';
export { DnDCustomNotice };

export default class DnDCharacterSheetHelperPlugin extends Plugin {
    settings: DnDPluginSettings = { ...DEFAULT_SETTINGS };
    featureRestTypes: Map<string, "short" | "long"> = new Map();
    activeHeroicInspiration: Set<string> = new Set();
    rulebookRevision: number = 0;
    dmRibbonIconEl: HTMLElement | null = null;
    private lastCustomRulebookFingerprint: string | null = null;
    private isCheckingCustomRulebook = false;
    private lastRulebookCheckTime = 0;

    openDMTools(initialTab: DMToolsTabId = "compendium", forceMode?: "modal" | "sidebar") {
        const platformDefault = Platform.isMobile
            ? (this.settings.defaultDmToolsViewMobile || "modal")
            : (this.settings.defaultDmToolsViewDesktop || "sidebar");
        const mode = forceMode || platformDefault;
        if (mode === "sidebar") {
            void this.activateDMToolsSidebar(initialTab);
        } else {
            new DMToolsModal(this.app, this, initialTab).open();
        }
    }

    async activateDMToolsSidebar(initialTab: DMToolsTabId = "compendium"): Promise<void> {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(DM_TOOLS_VIEW_TYPE);
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: DM_TOOLS_VIEW_TYPE, active: true });
            }
        }
        if (leaf) {
            workspace.revealLeaf(leaf);
            const view = leaf.view;
            if (view instanceof DMToolsSidebarView) {
                await view.setActiveTab(initialTab);
            }
        }
    }

    refreshDmToolsRibbonIcon() {
        if (this.dmRibbonIconEl) {
            this.dmRibbonIconEl.remove();
            this.dmRibbonIconEl = null;
        }
        if (this.settings.showDmToolsRibbon !== false) {
            const dmIconId = DM_RIBBON_ICON_SVG ? 'csh-dm-ribbon' : 'shield';
            this.dmRibbonIconEl = this.addRibbonIcon(dmIconId, 'Open DnD DM Tools & Compendium', () => {
                this.openDMTools("compendium");
            });
            this.dmRibbonIconEl.addClass('csh-dm-ribbon-btn');
        }
    }

    setHeroicInspiration(sourcePath: string, active: boolean) {
        if (active) this.activeHeroicInspiration.add(sourcePath);
        else this.activeHeroicInspiration.delete(sourcePath);
        window.dispatchEvent(new CustomEvent("dnd-heroic-inspiration-changed", { detail: { sourcePath } }));
    }

    resetCustomRulebookWatcherState() {
        this.lastCustomRulebookFingerprint = null;
        this.lastRulebookCheckTime = 0;
    }

    refreshOpenSheets(bumpRevision = true) {
        if (bumpRevision) {
            this.rulebookRevision++;
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

    private async computeCustomRulebookFingerprint(basePath: string): Promise<{ fingerprint: string; masteriesStat: string }> {
        const adapter = this.app.vault.adapter;
        const jsonPaths = new Set<string>();
        const dirsToScan = [
            basePath,
            `${basePath}/feats`,
            `${basePath}/feats/featRouters`,
            `${basePath}/classes`,
            `${basePath}/classes/classChoices`,
            `${basePath}/classes/classChoices/classRouterFiles`,
            `${basePath}/races`,
            `${basePath}/races/racialSpells`,
            `${basePath}/spells`,
            `${basePath}/spells/spellPools`,
            `${basePath}/items`,
            `${basePath}/rules`
        ];

        await Promise.all(dirsToScan.map(async (dir) => {
            const normDir = normalizePath(dir);
            try {
                if (await adapter.exists(normDir)) {
                    const listed = await adapter.list(normDir);
                    for (const filePath of listed.files || []) {
                        if (filePath.toLowerCase().endsWith('.json')) {
                            jsonPaths.add(normalizePath(filePath));
                        }
                    }
                }
            } catch {
                /* Ignore unreadable directories safely */
            }
        }));

        const sortedPaths = Array.from(jsonPaths).sort();
        const stats = await Promise.all(sortedPaths.map(async (p) => {
            try {
                const st = await adapter.stat(p);
                return st ? `${p}:${st.mtime}:${st.size}` : `${p}:present`;
            } catch {
                return `${p}:present`;
            }
        }));

        const wmPath = normalizePath(`${basePath}/weapon-masteries.json`).toLowerCase();
        const masteriesStat = stats.find(entry => entry.toLowerCase().startsWith(`${wmPath}:`)) || "";
        const fingerprint = `${basePath}|${this.settings.customRulebookPriority}|${stats.join('|')}`;
        return { fingerprint, masteriesStat };
    }

    async checkCustomRulebookChanges(triggerRefreshIfChanged = true, force = false): Promise<boolean> {
        if (this.isCheckingCustomRulebook) return false;
        const now = Date.now();
        if (!force && now - this.lastRulebookCheckTime < 1500) return false;

        this.isCheckingCustomRulebook = true;
        this.lastRulebookCheckTime = now;
        try {
            const basePath = getCleanCustomBasePath(this.settings);
            if (!basePath) {
                const hadPrev = this.lastCustomRulebookFingerprint !== null && this.lastCustomRulebookFingerprint !== "";
                this.lastCustomRulebookFingerprint = "";
                if (hadPrev && triggerRefreshIfChanged) {
                    await this.syncWeaponMasteriesMarkdown();
                    this.refreshOpenSheets();
                    return true;
                }
                return false;
            }

            const { fingerprint, masteriesStat } = await this.computeCustomRulebookFingerprint(basePath);
            if (this.lastCustomRulebookFingerprint === null) {
                this.lastCustomRulebookFingerprint = fingerprint;
                return false;
            }

            if (fingerprint !== this.lastCustomRulebookFingerprint) {
                const prevParts = this.lastCustomRulebookFingerprint.split('|');
                const wmPrefix = `${normalizePath(`${basePath}/weapon-masteries.json`).toLowerCase()}:`;
                const prevMasteriesStat = prevParts.find(p => p.toLowerCase().startsWith(wmPrefix)) || "";
                this.lastCustomRulebookFingerprint = fingerprint;

                if (masteriesStat !== prevMasteriesStat) {
                    await this.syncWeaponMasteriesMarkdown();
                }
                if (triggerRefreshIfChanged) {
                    this.refreshOpenSheets();
                }
                return true;
            }
            return false;
        } finally {
            this.isCheckingCustomRulebook = false;
        }
    }

    private touchGuardWindows = new WeakSet<Window>();
    async onload() {
        // --- INITIALIZE PLUGIN & STANDALONE THEME ENGINE ---
        await this.loadSettings();
        this.applyTheme();

        // Register the settings tab we built
        this.addSettingTab(new DnDSettingsTab(this.app, this));

        // Register Character Sheet code block processors (dnd-features, dnd-inventory, etc.)
        registerCharacterSheetBlocks(this);

        // Register custom ribbon icons from wizard-ribbon.png & dm-ribbon.png before registering views
        if (WIZARD_RIBBON_ICON_SVG) {
            addIcon('csh-ribbon', WIZARD_RIBBON_ICON_SVG);
        }
        if (DM_RIBBON_ICON_SVG) {
            addIcon('csh-dm-ribbon', DM_RIBBON_ICON_SVG);
        }

        // Register DM Tools Sidebar View & Embeddable Session Note Blocks (dnd-initiative, dnd-party)
        this.registerView(
            DM_TOOLS_VIEW_TYPE,
            (leaf) => new DMToolsSidebarView(leaf, this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-initiative",
            (source, el, ctx) => processDnDInitiativeBlock(this, source, el, ctx)
        );

        this.registerMarkdownCodeBlockProcessor(
            "dnd-party",
            (source, el, ctx) => processDnDPartyBlock(this, source, el, ctx)
        );

        // Automatically refresh open character sheets whenever a file inside the Custom Rulebook folder is edited
        const refreshIfCustomRulebookFile = (filePath: string, oldPath?: string) => {
            const basePath = getCleanCustomBasePath(this.settings);
            if (!basePath) return;
            const normBaseLower = normalizePath(basePath).toLowerCase();
            const isInsideCustomRulebook = (candidate?: string) => {
                if (!candidate) return false;
                const normLower = normalizePath(candidate).toLowerCase();
                return normLower === normBaseLower || normLower.startsWith(normBaseLower + "/");
            };
            if (!isInsideCustomRulebook(filePath) && !isInsideCustomRulebook(oldPath)) return;

            const generatedMasteriesMdLower = normalizePath(`${basePath}/markdown/weapon-masteries.md`).toLowerCase();
            if (!oldPath && normalizePath(filePath).toLowerCase() === generatedMasteriesMdLower) {
                return;
            }

            if (normalizePath(filePath).toLowerCase() === normalizePath(`${basePath}/weapon-masteries.json`).toLowerCase()) {
                void this.syncWeaponMasteriesMarkdown();
            }
            this.resetCustomRulebookWatcherState();
            this.refreshOpenSheets();
        };

        this.registerEvent(this.app.vault.on('modify', (file) => refreshIfCustomRulebookFile(file.path)));
        this.registerEvent(this.app.vault.on('create', (file) => refreshIfCustomRulebookFile(file.path)));
        this.registerEvent(this.app.vault.on('delete', (file) => refreshIfCustomRulebookFile(file.path)));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => refreshIfCustomRulebookFile(file.path, oldPath)));

        // Fallback watcher for `.json` changes made externally or when Obsidian "Detect all file extensions" is OFF
        this.registerDomEvent(window, 'focus', () => {
            void this.checkCustomRulebookChanges(true);
        });
        this.registerDomEvent(document, 'visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                void this.checkCustomRulebookChanges(true);
            }
        });

        this.app.workspace.onLayoutReady(async () => {
            this.applyTheme();
            await this.syncWeaponMasteriesMarkdown();
            await this.checkCustomRulebookChanges(false, true);
        });

        this.registerEvent(
            this.app.workspace.on('css-change', () => {
                this.applyTheme();
                if (this.settings.selectedTheme === "obsidian") {
                    void this.saveSettings();
                }
            })
        );

        const launchCharacterWizard = () => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);

            if (!view) {
                new Notice("Please open a note first to launch the Wizard.");
                return;
            }

            // Launch our new multi-step wizard!
            new CharacterWizardModal(this.app, this).open();
        };

        // Sidebar ribbon icon to launch Character Wizard
        const ribbonIconEl = this.addRibbonIcon('csh-ribbon', 'Launch Character Creation Wizard', launchCharacterWizard);
        ribbonIconEl.addClass('csh-ribbon-btn');

        this.addCommand({
            id: 'csh-launch-character-wizard',
            name: 'Launch Character Creation Wizard',
            callback: launchCharacterWizard
        });

        // DM Tools & Compendium Ribbon Icon and Commands
        this.refreshDmToolsRibbonIcon();

        this.addCommand({
            id: 'csh-open-dm-tools',
            name: 'Open DM Tools & Compendium',
            callback: () => this.openDMTools("compendium")
        });

        this.addCommand({
            id: 'csh-open-dm-tools-modal',
            name: 'Open DM Tools & Compendium (Modal Window)',
            callback: () => this.openDMTools("compendium", "modal")
        });

        this.addCommand({
            id: 'csh-open-dm-tools-sidebar',
            name: 'Open DM Tools & Compendium (Docked Sidebar)',
            callback: () => this.openDMTools("compendium", "sidebar")
        });

        this.addCommand({
            id: 'csh-open-spell-browser',
            name: 'Open Spell Browser (DM Tools)',
            callback: () => this.openDMTools("spells")
        });

        this.addCommand({
            id: 'csh-open-initiative-tracker',
            name: 'Open Auto-Sorting Initiative Tracker (DM Tools)',
            callback: () => this.openDMTools("initiative")
        });

        this.addCommand({
            id: 'csh-open-party-dashboard',
            name: 'Open Live Party Dashboard (DM Tools)',
            callback: () => this.openDMTools("party")
        });

        this.addCommand({
            id: 'csh-open-monster-statblocks',
            name: 'Open Monster & Statblock Browser (DM Tools)',
            callback: () => this.openDMTools("monsters")
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
                            new Notice(`Template missing! Available files: ${available}`);
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

    // --- Helper: Fetch Bundled or Custom Rulebook Markdown Note with 2-Stage Priority ---
    async getMarkdownNoteContent(noteKey: string): Promise<string | null> {
        const fetchNative = () => MarkdownNotes[noteKey] || null;
        const basePath = getCleanCustomBasePath(this.settings);
        if (!basePath) return fetchNative();

        const fetchCustom = async () => {
            const customPath = normalizePath(`${basePath}/markdown/${noteKey}.md`);
            if (await this.app.vault.adapter.exists(customPath)) {
                try {
                    return await this.app.vault.adapter.read(customPath);
                } catch (e) {
                    console.error(`Failed to read custom markdown at ${customPath}`, e);
                }
            }
            return null;
        };

        return this.settings.customRulebookPriority
            ? (await fetchCustom()) ?? fetchNative()
            : fetchNative() ?? (await fetchCustom());
    }

    // --- Helper: Fetch Character Sheet Template with 2-Stage Custom Rulebook Priority ---
    async getTemplateContent(): Promise<string | null> {
        return this.getMarkdownNoteContent('dnd_character_template');
    }

    // --- Helper: Merge Native & Custom Router JSON Maps by Priority ---
    async loadMergedRouterMap(fileName: string, nativeMap: Record<string, any>): Promise<Record<string, any>> {
        const basePath = getCleanCustomBasePath(this.settings);
        const customMap = basePath ? await readCustomJson(this.app, `${basePath}/${fileName}`) : null;
        return mergeDictionaries(nativeMap || {}, customMap, this.settings.customRulebookPriority) || {};
    }

    // --- Helper: Scan Rulebook & Custom Rulebook Items Catalog Once for Modals ---
    async loadRulebookEquipmentCatalog(): Promise<{
        items: { id: string; name: string; type: string }[];
        weapons: { id: string; name: string; damage: string; mastery: string }[];
        masteryWeapons: { id: string; name: string; mastery: string }[];
        armors: { id: string; name: string; ac: string; category: string }[];
        tools: string[];
    }> {
        const mergedItemsRouter = await this.loadMergedRouterMap("items.json", itemsMap);
        const itemLookupKeys = new Set<string>([
            ...Object.keys(itemsMap || {}),
            ...Object.keys(mergedItemsRouter || {})
        ]);

        const allItemsMap = new Map<string, { id: string; name: string; type: string }>();
        const weaponsMap = new Map<string, { id: string; name: string; damage: string; mastery: string }>();
        const masteryWeps: { id: string; name: string; mastery: string }[] = [];
        const armorsMap = new Map<string, { id: string; name: string; ac: string; category: string }>();
        const toolsSet = new Set<string>();
        const extraToolIds = new Set(["disguise-kit", "forgery-kit", "herbalism-kit", "poisoners-kit", "thieves-tools", "navigators-tools"]);

        for (const key of itemLookupKeys) {
            const data = await getItemData(this.app, this.settings, key);
            if (!data || !data.type) continue;

            const typeLower = String(data.type).toLowerCase().trim().replace(/['"]/g, '').replace(/\s+/g, '-');
            const displayName = String(data.name || key).trim();
            const mapKey = displayName.toLowerCase();

            allItemsMap.set(mapKey, { id: key, name: displayName, type: typeLower });

            if (
                typeLower === "artisans-tool" ||
                typeLower === "musical-instrument" ||
                typeLower === "gaming-set" ||
                extraToolIds.has(String(key).toLowerCase().trim())
            ) {
                toolsSet.add(displayName);
            }

            if (typeLower.includes("weapon")) {
                const masteryInfo = data.mastery
                    ? await getWeaponMasteryDescription(this.app, this.settings, data.mastery)
                    : null;
                weaponsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    damage: String(data.damage || ""),
                    mastery: masteryInfo ? masteryInfo.name : ""
                });
                if (masteryInfo) {
                    masteryWeps.push({
                        id: sanitizeWeaponSlug(key),
                        name: displayName,
                        mastery: masteryInfo.name
                    });
                }
            } else if (typeLower.includes("armor")) {
                armorsMap.set(mapKey, {
                    id: key,
                    name: displayName,
                    ac: String(data.ac || "10"),
                    category: String(data.category || "")
                });
            }
        }

        return {
            items: Array.from(allItemsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            weapons: Array.from(weaponsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            masteryWeapons: masteryWeps.sort((a, b) => a.name.localeCompare(b.name)),
            armors: Array.from(armorsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            tools: Array.from(toolsSet).sort((a, b) => a.localeCompare(b))
        };
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

            const basePath = getCleanCustomBasePath(this.settings);
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

    syncObsidianThemeColors(targetDoc?: Document): boolean {
        if (this.settings.selectedTheme !== "obsidian") return false;
        const resolved = generateObsidianThemeColors(targetDoc);
        Object.assign(this.settings, resolved);
        return true;
    }

    applyTheme() {
        const doc = typeof document !== "undefined" ? document : undefined;
        this.syncObsidianThemeColors(doc);
        const allVars: [string, string][] = [
            ...this.colorCssVars(),
            ...resolveObsidianNoteSurfaceVars(this.settings, doc)
        ];

        if (doc) {
            // 1. Apply to the main Obsidian window
            for (const [name, value] of allVars) {
                doc.documentElement.style.setProperty(name, value);
            }
        }

        // 2. Apply to all popped-out windows (if on Desktop)
        if (Platform.isDesktop && this.app?.workspace) {
            this.app.workspace.iterateAllLeaves((leaf) => {
                const windowDoc = leaf.view.containerEl.ownerDocument;
                if (windowDoc && (!doc || windowDoc !== doc)) {
                    for (const [name, value] of allVars) {
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
                    if (value === undefined) {
                        delete frontmatter[key];
                    } else {
                        frontmatter[key] = value;
                    }
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

    async loadSpellFile(fileNameWithoutExt: string): Promise<any | null> {
        return await getSpellData(this.app, this.settings, fileNameWithoutExt);
    }

    // --- Delegating Character Mechanics Helpers ---
    findGrantedSubclass(classData: any, maxLevel: number): string | null {
        return findGrantedSubclass(classData, maxLevel);
    }

    resolveUnarmoredDefense(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        statsRecord: Record<string, number>,
        fetchOptions?: any,
        subclassInput?: any
    ) {
        return resolveUnarmoredDefense(this, classInput, classLevelsInput, totalLevel, statsRecord, fetchOptions, subclassInput);
    }

    resolveEquippedArmorStats(params: {
        armorNameInput: any;
        manualAcInput?: any;
        isCustomMode?: boolean;
        classInput: any;
        classLevelsInput: any;
        totalLevel: number;
        statsRecord: Record<string, number>;
        subclassInput?: any;
        fetchOptions?: any;
    }) {
        return resolveEquippedArmorStats(this, params);
    }

    resolveBackgroundFeatId(backgroundInput: any, backgroundFeatInput: any, fetchOptions?: any) {
        return resolveBackgroundFeatId(this, backgroundInput, backgroundFeatInput, fetchOptions);
    }

    resolveUnarmedStrikeDamage(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        statsRecord: Record<string, number>,
        attackStat?: string,
        fetchOptions?: any
    ) {
        return resolveUnarmedStrikeDamage(this, classInput, classLevelsInput, totalLevel, statsRecord, attackStat, fetchOptions);
    }

    extractSingleAutoGrantedFeat(grantedFeats: any, fetchOptions?: any, routerCache?: Map<string, boolean>) {
        return extractSingleAutoGrantedFeat(this, grantedFeats, fetchOptions, routerCache);
    }

    collectRaceAutoGrantedFeats(
        raceInput: any,
        raceLineageInput: any,
        fetchOptions?: any,
        routerCache?: Map<string, boolean>
    ) {
        return collectRaceAutoGrantedFeats(this, raceInput, raceLineageInput, fetchOptions, routerCache);
    }

    collectAutoGrantedFeats(params: {
        classInput: any;
        classLevelsInput?: any;
        totalLevel: number;
        subclassInput?: any;
        raceInput?: any;
        raceLineageInput?: any;
        fetchOptions?: any;
    }) {
        return collectAutoGrantedFeats(this, params);
    }

    resolveCharacterSpeedModifiers(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        extraFeatsInput: any,
        backgroundFeatInput: any,
        equippedArmor: string,
        baseSpeedInput: number = 30,
        customSpeedModInput: number = 0,
        subclassInput?: any,
        fetchOptions?: any,
        raceInput?: any,
        raceLineageInput?: any
    ) {
        return resolveCharacterSpeedModifiers(
            this,
            classInput,
            classLevelsInput,
            totalLevel,
            extraFeatsInput,
            backgroundFeatInput,
            equippedArmor,
            baseSpeedInput,
            customSpeedModInput,
            subclassInput,
            fetchOptions,
            raceInput,
            raceLineageInput
        );
    }

    resolveCharacterWeaponMasterySlots(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        extraFeatsInput: any,
        backgroundFeatInput: any,
        subclassInput?: any,
        fetchOptions?: any,
        raceInput?: any,
        raceLineageInput?: any
    ) {
        return resolveCharacterWeaponMasterySlots(
            this,
            classInput,
            classLevelsInput,
            totalLevel,
            extraFeatsInput,
            backgroundFeatInput,
            subclassInput,
            fetchOptions,
            raceInput,
            raceLineageInput
        );
    }

    resolveClassChoiceRoutersUpToLevel(classData: any, subclassData: any, maxLevel: number) {
        return resolveClassChoiceRoutersUpToLevel(classData, subclassData, maxLevel);
    }

    resolveSpellcastingMetadata(classData: any, subclassData: any, level?: number) {
        return resolveSpellcastingMetadata(classData, subclassData, level);
    }

    resolveRaceSpellcastingMetadata(raceData: any, raceLineageInput: any, maxLevel: number, minLevel = 1) {
        return resolveRaceSpellcastingMetadata(this, raceData, raceLineageInput, maxLevel, minLevel);
    }

    extractSpellPoolsFromContent(content: string, frontmatter: Record<string, any>) {
        return extractSpellPoolsFromContent(content, frontmatter);
    }

    resolveCharacterInitiativeModifiers(
        classInput: any,
        classLevelsInput: any,
        totalLevel: number,
        extraFeatsInput: any,
        backgroundFeatInput: any,
        subclassInput: any,
        raceInput: any,
        raceLineageInput: any,
        statsRecord: Record<string, number>,
        proficiencyBonus: number,
        customInitiativeModInput: any,
        fetchOptions?: any
    ) {
        return resolveCharacterInitiativeModifiers(
            this,
            classInput,
            classLevelsInput,
            totalLevel,
            extraFeatsInput,
            backgroundFeatInput,
            subclassInput,
            raceInput,
            raceLineageInput,
            statsRecord,
            proficiencyBonus,
            customInitiativeModInput,
            fetchOptions
        );
    }

    populateFeatureRestTypesForFile(sourcePath: string) {
        return populateFeatureRestTypesForFile(this, sourcePath);
    }

    resetCharacterRestState(sourcePath: string, restType: "short" | "long", extraUpdates: Record<string, any> = {}) {
        return resetCharacterRestState(this, sourcePath, restType, extraUpdates);
    }
}
