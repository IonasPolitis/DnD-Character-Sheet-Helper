import {
    App,
    ItemView,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    MarkdownView,
    Modal,
    Notice,
    TFile,
    WorkspaceLeaf
} from 'obsidian';
import type DnDCharacterSheetHelperPlugin from './main';
import { DM_RIBBON_ICON_SVG } from './ribbon-icon';
import {
    ALL_ABILITIES,
    AbilityKey,
    formatFeatureOrSlug,
    formatPoolDisplayName,
    parseBlockYaml,
    parseStringArray
} from './main';
import {
    CompendiumSpellEntry,
    getAllCompendiumBackgrounds,
    getAllCompendiumClassChoices,
    getAllCompendiumClasses,
    getAllCompendiumFeats,
    getAllCompendiumItems,
    getAllCompendiumRaces,
    getAllCompendiumRules,
    getAllCompendiumSpells,
    getWeaponMasteriesMap,
    getWeaponMasteryDescription,
    toSlug
} from './data';
import {
    CANONICAL_SKILL_KEYS,
    DND_55E_CONDITIONS,
    InitiativeCombatant,
    InitiativeState,
    PartyMemberSummary,
    abilityModFromScore,
    applyDamageWithTempHp,
    calculateCharacterPassiveSenses,
    createCombatantFromPartyMember,
    createDefaultInitiativeState,
    discoverVaultPartyMembers,
    formatSignedNumber,
    getConfiguredPartyMembers,
    getConfiguredPartyMembersAsync,
    getNextCombatantNames,
    listVaultFolderPaths,
    normalizeInitiativeStateInPlace,
    parseNumericMod,
    removeCombatantsUpdatingTurn,
    resolvePartyMemberLevel,
    rollD20,
    sortInitiativeCombatants
} from './dm-tools-party';
import {
    DM_COMPENDIUM_SOURCES,
    DiscoveredMonster,
    MonsterTraitEntry,
    buildStatblockYaml,
    clearDiscoveredMonstersCache,
    discoverExternalMonsters,
    normalizeMonsterRecord,
    parseCrNumericValue,
    renderStatblockWithFallback,
    resolveDmCompendiumSourceInfo
} from './dm-tools-monsters';

export * from './dm-tools-party';
export * from './dm-tools-monsters';

export const DM_TOOLS_VIEW_TYPE = "dnd-dm-tools-view";

export type DMToolsTabId = "compendium" | "spells" | "initiative" | "party" | "monsters";

async function copyTextToClipboard(text: string, successMessage: string): Promise<void> {
    try {
        if (!navigator?.clipboard?.writeText) {
            throw new Error("Clipboard API unavailable");
        }
        await navigator.clipboard.writeText(text);
        new Notice(successMessage);
    } catch (err) {
        console.warn("DnD Plugin: Failed to copy text to clipboard", err);
        new Notice("Could not copy to clipboard in this environment.");
    }
}

function makeKeyboardClickable(el: HTMLElement, onActivate: (evt: Event) => void): void {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.addEventListener("keydown", (evt: KeyboardEvent) => {
        if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            onActivate(evt);
        }
    });
}

function formatClassLevelFeaturesMarkdown(
    data: Record<string, any>,
    headingLevelPrefix: string = "####"
): { levelSections: string[]; featureNames: string[] } {
    const featureNames: string[] = [];
    const levelSections: string[] = [];
    const subHeadingPrefix = `${headingLevelPrefix}#`;

    const sortedLevels = Object.keys(data || {})
        .filter(k => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));

    for (const lvl of sortedLevels) {
        const lvlObj = data[lvl];
        if (!lvlObj || typeof lvlObj !== "object") continue;
        const feats = Array.isArray(lvlObj.features) ? lvlObj.features : [];
        if (feats.length === 0) continue;
        const lines: string[] = [`${headingLevelPrefix} Level ${lvl}`];
        for (const f of feats) {
            if (!f || typeof f !== "object") continue;
            const fName = String(f.name || "Feature").trim();
            const fDesc = String(f.description || "").trim();
            featureNames.push(fName, fDesc);
            lines.push(`${subHeadingPrefix} ${fName}\n${fDesc}`);
        }
        levelSections.push(lines.join("\n\n"));
    }

    return { levelSections, featureNames };
}

function readNoteInitiativeState(plugin: DnDCharacterSheetHelperPlugin, sourcePath: string): InitiativeState {
    if (!sourcePath) return createDefaultInitiativeState();
    const cache = plugin.app.metadataCache.getCache(sourcePath);
    const fm = cache?.frontmatter || {};
    if (fm["DnD_initiativeState"]) {
        try {
            const rawState = typeof fm["DnD_initiativeState"] === "string"
                ? JSON.parse(fm["DnD_initiativeState"])
                : fm["DnD_initiativeState"];
            if (rawState && typeof rawState === "object" && Array.isArray(rawState.combatants)) {
                return normalizeInitiativeStateInPlace(rawState);
            }
        } catch {
            /* fallback to default */
        }
    }
    return createDefaultInitiativeState();
}

// ============================================================================
// --- POP-UP MODALS: CONDITION RULE INSPECTOR & STATBLOCK PREVIEW ---
// ============================================================================

export class ConditionRuleModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    conditionName: string;
    onRemoveCondition?: () => void;
    renderChild!: MarkdownRenderChild;

    constructor(
        app: App,
        plugin: DnDCharacterSheetHelperPlugin,
        conditionName: string,
        onRemoveCondition?: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.conditionName = conditionName;
        this.onRemoveCondition = onRemoveCondition;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-condition-modal");
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        contentEl.createEl("h3", {
            text: this.conditionName,
            cls: "dnd-section-header dnd-modal-header"
        });

        const rules = await getAllCompendiumRules(this.app, this.plugin.settings);
        const searchLower = this.conditionName.trim().toLowerCase();
        const searchSlug = toSlug(this.conditionName);
        const matched = rules.find(r => r.name.toLowerCase() === searchLower)
            || (searchSlug ? rules.find(r => toSlug(r.name) === searchSlug) : undefined)
            || rules.find(r => r.groupId === "conditions" && r.name.toLowerCase().includes(searchLower))
            || rules.find(r => r.name.toLowerCase().includes(searchLower));

        const body = contentEl.createDiv({ cls: "dnd-condition-modal-body" });
        if (matched && matched.description) {
            await this.plugin.renderDndMarkdown(matched.description, body, "", this.renderChild);
        } else {
            body.createEl("p", {
                text: `No rule description found for "${this.conditionName}".`,
                cls: "dnd-modal-empty-text"
            });
        }

        const footer = contentEl.createDiv({ cls: "dnd-modal-footer" });
        if (this.onRemoveCondition) {
            const removeBtn = footer.createEl("button", {
                text: `Remove "${this.conditionName}"`,
                cls: "dnd-btn-danger"
            });
            removeBtn.onclick = () => {
                this.onRemoveCondition?.();
                this.close();
            };
        }
        const closeBtn = footer.createEl("button", { text: "Close", cls: "mod-cta" });
        closeBtn.onclick = () => this.close();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

export class StatblockPreviewModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    monster: DiscoveredMonster;
    onAddToInitiative?: (monster: DiscoveredMonster, qty: number) => void;
    renderChild!: MarkdownRenderChild;

    constructor(
        app: App,
        plugin: DnDCharacterSheetHelperPlugin,
        monster: DiscoveredMonster,
        onAddToInitiative?: (monster: DiscoveredMonster, qty: number) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.monster = monster;
        this.onAddToInitiative = onAddToInitiative;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-statblock-preview-modal");
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        const body = contentEl.createDiv({ cls: "dnd-statblock-modal-body" });
        await renderStatblockWithFallback(this.app, this.plugin, this.monster, body, "", this.renderChild);

        const footer = contentEl.createDiv({ cls: "dnd-modal-footer" });
        if (this.onAddToInitiative) {
            const addBtn = footer.createEl("button", {
                text: "Add to Initiative",
                cls: "mod-cta"
            });
            addBtn.onclick = () => {
                this.onAddToInitiative?.(this.monster, 1);
                this.close();
            };
        }
        const closeBtn = footer.createEl("button", { text: "Close" });
        closeBtn.onclick = () => this.close();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

// ============================================================================
// --- UNIFIED DM TOOLS WIDGET (Powers Modal, Sidebar View & Code Blocks) ---
// ============================================================================

export type DMToolsHostMode = "modal" | "sidebar" | "embed-initiative" | "embed-party";

export interface CompendiumUnifiedItem {
    id: string;
    category: "rules" | "classes" | "choices" | "races" | "backgrounds" | "feats" | "items";
    categoryLabel: string;
    subFilter: string;
    name: string;
    badge: string;
    searchBlob: string;
    renderMarkdown: () => Promise<string>;
}

const DM_TABS: readonly { id: DMToolsTabId; label: string; icon: string }[] = [
    { id: "compendium", label: "Compendium", icon: "📚" },
    { id: "spells", label: "Spell Browser", icon: "✨" },
    { id: "initiative", label: "Initiative Tracker", icon: "⚔️" },
    { id: "party", label: "Party Dashboard", icon: "🛡️" },
    { id: "monsters", label: "Monsters & Statblocks", icon: "🐉" }
];

export class DMToolsWidget {
    app: App;
    plugin: DnDCharacterSheetHelperPlugin;
    containerEl: HTMLElement;
    renderChild: MarkdownRenderChild;
    hostMode: DMToolsHostMode;
    activeTab: DMToolsTabId;
    sourcePath: string;
    onRequestSwitchHost?: () => void;

    // Embedded block options
    embedFilterFolder?: string;
    embedFilterPlayers?: string[];
    customInitiativeState?: InitiativeState;
    onSaveCustomInitiativeState?: (state: InitiativeState) => Promise<void>;
    onReloadCustomInitiativeState?: () => InitiativeState;

    // Tab 1: Compendium State
    compendiumItems: CompendiumUnifiedItem[] = [];
    compendiumLoaded = false;
    loadedCompendiumRevision = -1;
    compendiumQuery = "";
    compendiumCategory: "all" | CompendiumUnifiedItem["category"] = "all";
    compendiumSubFilter = "all";
    selectedCompendiumId: string | null = null;

    // Tab 2: Spell Browser State
    allSpells: CompendiumSpellEntry[] = [];
    spellsLoaded = false;
    loadedSpellsRevision = -1;
    spellQuery = "";
    spellLevelFilter: string = "all";
    spellPoolFilter: string = "all";
    spellSchoolFilter: string = "all";
    spellConcentrationOnly = false;
    spellRitualOnly = false;
    selectedSpellId: string | null = null;

    // Tab 3: Initiative State
    initAddMode: "pc" | "monster" | "custom" = "pc";
    initMonsterFilterQuery = "";

    // Tab 5: Monsters & Statblocks State
    discoveredMonsters: DiscoveredMonster[] = [];
    monstersMeta: {
        hasDmCompendium: boolean;
        dmCompendiumCount: number;
        vaultStatblockCount: number;
        availableSources: { code: string; short: string; full: string; count: number }[];
    } = { hasDmCompendium: false, dmCompendiumCount: 0, vaultStatblockCount: 0, availableSources: [] };
    monstersLoaded = false;
    monsterQuery = "";
    monsterSourceFilter = "all";
    monsterCrFilter = "all";
    selectedMonsterId: string | null = null;

    // Sidebar Resizable Vertical Split State (default 2/3 upper selection, 1/3 lower preview)
    sidebarSplitPercent = 66.67;

    // Layout & Lifecycle Guards
    bodyContainer!: HTMLElement;
    private listenersRegistered = false;
    private isWidgetUnloaded = false;
    private tabRenderVersion = 0;
    private compendiumPreviewToken = 0;
    private spellPreviewToken = 0;
    private monsterPreviewToken = 0;

    private partySaveTimer: number | null = null;
    private metadataRefreshTimer: number | null = null;
    private compendiumSearchTimer: number | null = null;
    private spellSearchTimer: number | null = null;
    private monsterSearchTimer: number | null = null;
    private partySearchTimer: number | null = null;

    private activePartyRefreshHook: (() => Promise<void>) | null = null;
    private activeInitRefreshHook: ((refreshPartyFromCache: boolean) => Promise<void>) | null = null;

    constructor(options: {
        app: App;
        plugin: DnDCharacterSheetHelperPlugin;
        containerEl: HTMLElement;
        renderChild: MarkdownRenderChild;
        hostMode: DMToolsHostMode;
        initialTab?: DMToolsTabId;
        sourcePath?: string;
        onRequestSwitchHost?: () => void;
        embedFilterFolder?: string;
        embedFilterPlayers?: string[];
        customInitiativeState?: InitiativeState;
        onSaveCustomInitiativeState?: (state: InitiativeState) => Promise<void>;
        onReloadCustomInitiativeState?: () => InitiativeState;
    }) {
        this.app = options.app;
        this.plugin = options.plugin;
        this.containerEl = options.containerEl;
        this.renderChild = options.renderChild;
        this.hostMode = options.hostMode;
        this.activeTab = options.initialTab || "compendium";
        this.sourcePath = options.sourcePath || "";
        this.onRequestSwitchHost = options.onRequestSwitchHost;
        this.embedFilterFolder = options.embedFilterFolder;
        this.embedFilterPlayers = options.embedFilterPlayers;
        this.customInitiativeState = options.customInitiativeState;
        this.onSaveCustomInitiativeState = options.onSaveCustomInitiativeState;
        this.onReloadCustomInitiativeState = options.onReloadCustomInitiativeState;
    }

    private clearTimer(timerId: number | null): null {
        if (timerId !== null && typeof window !== "undefined") {
            window.clearTimeout(timerId);
        }
        return null;
    }

    private clearAllTimers(): void {
        this.partySaveTimer = this.clearTimer(this.partySaveTimer);
        this.metadataRefreshTimer = this.clearTimer(this.metadataRefreshTimer);
        this.compendiumSearchTimer = this.clearTimer(this.compendiumSearchTimer);
        this.spellSearchTimer = this.clearTimer(this.spellSearchTimer);
        this.monsterSearchTimer = this.clearTimer(this.monsterSearchTimer);
        this.partySearchTimer = this.clearTimer(this.partySearchTimer);
    }

    getInitiativeState(): InitiativeState {
        if (this.customInitiativeState) {
            return normalizeInitiativeStateInPlace(this.customInitiativeState);
        }
        if (!this.plugin.settings.savedInitiativeState) {
            this.plugin.settings.savedInitiativeState = createDefaultInitiativeState();
        }
        return normalizeInitiativeStateInPlace(this.plugin.settings.savedInitiativeState);
    }

    async saveInitiativeState(): Promise<void> {
        const state = this.getInitiativeState();
        state.combatants = sortInitiativeCombatants(state.combatants);
        if (state.combatants.length === 0) {
            state.activeCombatantId = null;
        } else if (!state.activeCombatantId || !state.combatants.some(c => c.id === state.activeCombatantId)) {
            state.activeCombatantId = state.combatants[0].id;
        }

        if (this.onSaveCustomInitiativeState && this.customInitiativeState) {
            await this.onSaveCustomInitiativeState(this.customInitiativeState);
        } else {
            await this.plugin.saveSettings();
        }
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("dnd-dm-initiative-updated", {
                detail: {
                    sourceWidget: this,
                    isCustomNoteState: Boolean(this.customInitiativeState),
                    sourcePath: this.sourcePath
                }
            }));
        }
    }

    private registerSyncListenersOnce(): void {
        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        this.renderChild.register(() => {
            this.isWidgetUnloaded = true;
            this.clearAllTimers();
            this.activePartyRefreshHook = null;
            this.activeInitRefreshHook = null;
        });

        const scheduleTabSync = (target: "party" | "initiative", refreshPartyFromCache: boolean) => {
            if (this.isWidgetUnloaded) return;
            this.metadataRefreshTimer = this.clearTimer(this.metadataRefreshTimer);
            this.metadataRefreshTimer = window.setTimeout(() => {
                this.metadataRefreshTimer = null;
                if (this.isWidgetUnloaded) return;
                if (target === "party" && this.activeTab === "party") {
                    if (this.activePartyRefreshHook) {
                        void this.activePartyRefreshHook();
                    } else {
                        void this.renderActiveTab();
                    }
                } else if (target === "initiative" && this.activeTab === "initiative") {
                    if (this.activeInitRefreshHook) {
                        void this.activeInitRefreshHook(refreshPartyFromCache);
                    } else {
                        void this.renderActiveTab();
                    }
                }
            }, 80);
        };

        const onPartyFolderUpdated = (evt: Event) => {
            const detail = (evt as CustomEvent<{ sourceWidget?: DMToolsWidget }>)?.detail;
            if (detail?.sourceWidget === this || this.isWidgetUnloaded) return;
            if (this.activeTab === "party") {
                if (this.activePartyRefreshHook) void this.activePartyRefreshHook();
                else void this.renderActiveTab();
            } else if (this.activeTab === "initiative") {
                if (this.activeInitRefreshHook) void this.activeInitRefreshHook(true);
                else void this.renderActiveTab();
            }
        };

        const onInitiativeUpdated = (evt: Event) => {
            const detail = (evt as CustomEvent<{
                sourceWidget?: DMToolsWidget;
                isCustomNoteState?: boolean;
                sourcePath?: string;
            }>)?.detail;
            if (detail?.sourceWidget === this || this.isWidgetUnloaded) return;
            if (this.activeTab !== "initiative") return;

            const isThisCustom = Boolean(this.customInitiativeState);
            const isEventCustom = Boolean(detail?.isCustomNoteState);
            if (isThisCustom !== isEventCustom) return;
            if (isThisCustom && detail?.sourcePath !== this.sourcePath) return;

            if (isThisCustom && this.onReloadCustomInitiativeState) {
                this.customInitiativeState = this.onReloadCustomInitiativeState();
            }
            if (this.activeInitRefreshHook) {
                void this.activeInitRefreshHook(false);
            } else {
                void this.renderActiveTab();
            }
        };

        const onHeroicInspirationChanged = () => {
            if (this.isWidgetUnloaded || this.activeTab !== "party") return;
            if (this.activePartyRefreshHook) void this.activePartyRefreshHook();
            else void this.renderActiveTab();
        };

        if (typeof window !== "undefined") {
            window.addEventListener("dnd-dm-party-folder-updated", onPartyFolderUpdated);
            window.addEventListener("dnd-dm-initiative-updated", onInitiativeUpdated);
            window.addEventListener("dnd-heroic-inspiration-changed", onHeroicInspirationChanged);
            this.renderChild.register(() => {
                window.removeEventListener("dnd-dm-party-folder-updated", onPartyFolderUpdated);
                window.removeEventListener("dnd-dm-initiative-updated", onInitiativeUpdated);
                window.removeEventListener("dnd-heroic-inspiration-changed", onHeroicInspirationChanged);
            });
        }

        if (typeof this.app?.metadataCache?.on === "function") {
            this.renderChild.registerEvent(
                this.app.metadataCache.on("changed", (file: TFile) => {
                    if (this.isWidgetUnloaded || !file) return;
                    if (this.customInitiativeState && file.path === this.sourcePath && this.onReloadCustomInitiativeState) {
                        this.customInitiativeState = this.onReloadCustomInitiativeState();
                        scheduleTabSync("initiative", true);
                        return;
                    }
                    if (this.activeTab !== "party" && this.activeTab !== "initiative") return;

                    const activeFolder = (this.embedFilterFolder !== undefined
                        ? this.embedFilterFolder
                        : (this.plugin.settings?.partyFolderPath || "")
                    ).trim().toLowerCase().replace(/^\/+|\/+$/g, "");

                    const normPath = file.path.toLowerCase();
                    const matchesFolder = activeFolder === ""
                        ? false
                        : (activeFolder === "/" ? !file.path.includes("/") : normPath.startsWith(activeFolder + "/"));
                    const matchesEmbedPlayer = Boolean(
                        this.embedFilterPlayers?.some(p => {
                            const lp = p.trim().toLowerCase();
                            return lp && (normPath === lp || file.basename.toLowerCase() === lp);
                        })
                    );
                    const matchesCombatant = this.activeTab === "initiative"
                        && this.getInitiativeState().combatants.some(c => c.sourcePath === file.path);

                    if (matchesFolder || matchesEmbedPlayer || matchesCombatant) {
                        scheduleTabSync(this.activeTab, true);
                    }
                })
            );
        }
    }

    async render(): Promise<void> {
        this.isWidgetUnloaded = false;
        this.registerSyncListenersOnce();

        this.containerEl.empty();
        this.containerEl.addClass("dnd-dm-widget", `is-mode-${this.hostMode}`);

        if (this.hostMode === "embed-initiative") {
            this.bodyContainer = this.containerEl.createDiv({ cls: "dnd-dm-body" });
            await this.renderActiveTab();
            return;
        }

        if (this.hostMode === "embed-party") {
            this.bodyContainer = this.containerEl.createDiv({ cls: "dnd-dm-body" });
            await this.renderActiveTab();
            return;
        }

        // Top Header + Mode Switcher (Modal <-> Sidebar)
        const headerBar = this.containerEl.createDiv({ cls: "dnd-dm-header-bar" });
        const titleGroup = headerBar.createDiv({ cls: "dnd-dm-title-group" });
        titleGroup.createEl("h3", {
            text: "Dungeon Master Tools & Compendium",
            cls: "dnd-section-header dnd-dm-title"
        });

        const headerActions = headerBar.createDiv({ cls: "dnd-dm-header-actions" });
        const refreshBtn = headerActions.createEl("button", {
            text: "Refresh",
            cls: "dnd-dm-header-btn",
            attr: { title: "Reload Compendium, Spells, Party & Monsters" }
        });
        refreshBtn.onclick = async () => {
            this.compendiumLoaded = false;
            this.spellsLoaded = false;
            this.monstersLoaded = false;
            clearDiscoveredMonstersCache();
            await this.renderActiveTab();
            new Notice("DM Tools data refreshed!");
        };

        if (this.onRequestSwitchHost) {
            const switchBtn = headerActions.createEl("button", {
                text: this.hostMode === "modal" ? "Dock to Sidebar" : "Open in Modal",
                cls: "dnd-dm-header-btn mod-cta",
                attr: {
                    title: this.hostMode === "modal"
                        ? "Pin DM Tools to the right sidebar so it stays open alongside your notes"
                        : "Expand DM Tools into a large centered modal window"
                }
            });
            switchBtn.onclick = () => this.onRequestSwitchHost?.();
        }

        // Navigation Tabs
        const tabsBar = this.containerEl.createDiv({ cls: "dnd-modal-tabs dnd-dm-tabs" });
        for (const tab of DM_TABS) {
            const btn = tabsBar.createEl("button", {
                text: `${tab.icon} ${tab.label}`,
                cls: `dnd-modal-tab-btn dnd-dm-tab-btn ${this.activeTab === tab.id ? "is-active" : ""}`.trim()
            });
            btn.onclick = async () => {
                this.activeTab = tab.id;
                tabsBar.querySelectorAll(".dnd-dm-tab-btn").forEach((el, idx) => {
                    el.classList.toggle("is-active", DM_TABS[idx]?.id === this.activeTab);
                });
                await this.renderActiveTab();
            };
        }

        this.bodyContainer = this.containerEl.createDiv({ cls: "dnd-dm-body" });
        await this.renderActiveTab();
    }

    async setTab(tab: DMToolsTabId): Promise<void> {
        this.activeTab = tab;
        await this.render();
    }

    async renderActiveTab(): Promise<void> {
        if (!this.bodyContainer || this.isWidgetUnloaded) return;
        const renderToken = ++this.tabRenderVersion;

        this.activePartyRefreshHook = null;
        this.activeInitRefreshHook = null;
        this.compendiumSearchTimer = this.clearTimer(this.compendiumSearchTimer);
        this.spellSearchTimer = this.clearTimer(this.spellSearchTimer);
        this.monsterSearchTimer = this.clearTimer(this.monsterSearchTimer);
        this.partySearchTimer = this.clearTimer(this.partySearchTimer);
        if (this.activeTab !== "party") {
            this.partySaveTimer = this.clearTimer(this.partySaveTimer);
        }

        this.bodyContainer.empty();

        switch (this.activeTab) {
            case "compendium":
                await this.renderCompendiumTab(renderToken);
                break;
            case "spells":
                await this.renderSpellBrowserTab(renderToken);
                break;
            case "initiative":
                await this.renderInitiativeTab(renderToken);
                break;
            case "party":
                await this.renderPartyTab(renderToken);
                break;
            case "monsters":
                await this.renderMonstersTab(renderToken);
                break;
        }
    }

    private isStaleTabRender(renderToken: number): boolean {
        return this.isWidgetUnloaded || renderToken !== this.tabRenderVersion;
    }

    /**
     * Builds the master-detail split layout.
     * - In Modal mode: side-by-side 2-column grid.
     * - In Sidebar mode: vertical split-pane (default 2/3 upper selection area + 1/3 scrollable preview area)
     *   with a draggable horizontal divider handle between them.
     */
    private createMasterDetailSplitLayout(
        root: HTMLElement,
        upperControls: HTMLElement[]
    ): {
        listPane: HTMLElement;
        previewPane: HTMLElement;
        setPreviewActive: (active: boolean) => void;
    } {
        if (this.hostMode !== "sidebar") {
            const splitGrid = root.createDiv({ cls: "dnd-spellbook-body dnd-compendium-grid" });
            const listPane = splitGrid.createDiv({ cls: "dnd-spellbook-list dnd-compendium-list" });
            const previewPane = splitGrid.createDiv({ cls: "dnd-spellbook-preview dnd-compendium-preview" });
            return {
                listPane,
                previewPane,
                setPreviewActive: () => {}
            };
        }

        const splitContainer = root.createDiv({ cls: "dnd-sidebar-split-container" });
        splitContainer.style.setProperty("--dnd-sidebar-split", `${this.sidebarSplitPercent}%`);

        const upperPane = splitContainer.createDiv({ cls: "dnd-sidebar-upper-pane" });
        for (const el of upperControls) {
            upperPane.appendChild(el);
        }
        const listPane = upperPane.createDiv({ cls: "dnd-spellbook-list dnd-compendium-list" });

        const resizer = splitContainer.createDiv({
            cls: "dnd-sidebar-resizer",
            attr: { title: "Drag up or down to resize preview (double-click to reset to 2/3 & 1/3)" }
        });
        resizer.createDiv({ cls: "dnd-sidebar-resizer-grip" });

        const previewPane = splitContainer.createDiv({
            cls: "dnd-spellbook-preview dnd-compendium-preview dnd-sidebar-lower-pane"
        });

        let isDragging = false;
        resizer.addEventListener("pointerdown", (e: PointerEvent) => {
            e.preventDefault();
            isDragging = true;
            resizer.addClass("is-dragging");
            try {
                resizer.setPointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
        });

        resizer.addEventListener("pointermove", (e: PointerEvent) => {
            if (!isDragging) return;
            const rect = splitContainer.getBoundingClientRect();
            if (rect.height <= 40) return;
            const rawPct = ((e.clientY - rect.top) / rect.height) * 100;
            const clamped = Math.max(15, Math.min(85, Math.round(rawPct * 100) / 100));
            this.sidebarSplitPercent = clamped;
            splitContainer.style.setProperty("--dnd-sidebar-split", `${clamped}%`);
        });

        const endDrag = (e: PointerEvent) => {
            if (!isDragging) return;
            isDragging = false;
            resizer.removeClass("is-dragging");
            try {
                if (resizer.hasPointerCapture(e.pointerId)) {
                    resizer.releasePointerCapture(e.pointerId);
                }
            } catch {
                /* ignore */
            }
        };

        resizer.addEventListener("pointerup", endDrag);
        resizer.addEventListener("pointercancel", endDrag);
        resizer.addEventListener("dblclick", () => {
            this.sidebarSplitPercent = 66.67;
            splitContainer.style.setProperty("--dnd-sidebar-split", "66.67%");
        });

        return {
            listPane,
            previewPane,
            setPreviewActive: (active: boolean) => {
                splitContainer.classList.toggle("has-active-preview", active);
            }
        };
    }

    // ========================================================================
    // --- TAB 1: UNIVERSAL COMPENDIUM & RULEBOOK SEARCH ---
    // ========================================================================

    private async ensureCompendiumLoaded(): Promise<void> {
        const currentRev = this.plugin.rulebookRevision ?? 0;
        if (this.compendiumLoaded && this.loadedCompendiumRevision === currentRev) return;

        const settings = this.plugin.settings;
        const items: CompendiumUnifiedItem[] = [];

        // 1. Rules & Conditions
        const rules = await getAllCompendiumRules(this.app, settings);
        for (const rule of rules) {
            items.push({
                id: `rule::${rule.id}`,
                category: "rules",
                categoryLabel: "Rules & Conditions",
                subFilter: rule.groupName || "Core Rules",
                name: rule.name,
                badge: rule.badge || rule.groupName,
                searchBlob: `${rule.name} ${rule.groupName} ${rule.badge || ""} ${rule.description}`.toLowerCase(),
                renderMarkdown: async () => {
                    return `### ${rule.name}\n*${rule.groupName}${rule.badge && rule.badge !== rule.groupName ? ` • ${rule.badge}` : ""}*\n\n---\n\n${rule.description}`;
                }
            });
        }

        // 2. Classes & Subclasses
        const { classes, subclasses } = await getAllCompendiumClasses(this.app, settings);
        for (const cls of classes) {
            const data = cls.data || {};
            const { levelSections, featureNames } = formatClassLevelFeaturesMarkdown(data);

            const profSaves = Array.isArray(data.proficiencySavingThrow)
                ? data.proficiencySavingThrow.map((s: any) => String(s)).join(", ")
                : "";
            const hitDie = data.hitDie ? `d${String(data.hitDie).replace(/^d/i, "")}` : "";

            items.push({
                id: `class::${cls.id}`,
                category: "classes",
                categoryLabel: "Classes & Subclasses",
                subFilter: cls.name,
                name: cls.name,
                badge: "Class",
                searchBlob: `${cls.name} class ${profSaves} ${featureNames.join(" ")}`.toLowerCase(),
                renderMarkdown: async () => {
                    const metaLines: string[] = [];
                    if (hitDie) metaLines.push(`- **Hit Die:** ${hitDie}`);
                    if (profSaves) metaLines.push(`- **Saving Throw Proficiencies:** ${profSaves}`);
                    if (data.spellcastingAbility) metaLines.push(`- **Spellcasting Ability:** ${data.spellcastingAbility}`);
                    const metaBlock = metaLines.length > 0 ? `${metaLines.join("\n")}\n\n---\n\n` : "";
                    return `### ${cls.name} (Core Class)\n\n${metaBlock}${levelSections.join("\n\n---\n\n") || "*No level features listed.*"}`;
                }
            });
        }

        for (const sub of subclasses) {
            const data = sub.data || {};
            const { levelSections, featureNames } = formatClassLevelFeaturesMarkdown(data);

            items.push({
                id: `subclass::${sub.id}`,
                category: "classes",
                categoryLabel: "Classes & Subclasses",
                subFilter: sub.parentClassName,
                name: `${sub.name} (${sub.parentClassName})`,
                badge: `${sub.parentClassName} Subclass`,
                searchBlob: `${sub.name} ${sub.parentClassName} subclass ${featureNames.join(" ")}`.toLowerCase(),
                renderMarkdown: async () => {
                    return `### ${sub.name}\n*${sub.parentClassName} Subclass*\n\n---\n\n${levelSections.join("\n\n---\n\n") || "*No subclass features listed.*"}`;
                }
            });
        }

        // 3. Class Choices (Invocations, Metamagic, Maneuvers, etc.)
        const classChoices = await getAllCompendiumClassChoices(this.app, settings);
        for (const choice of classChoices) {
            items.push({
                id: `choice::${choice.id}`,
                category: "choices",
                categoryLabel: "Class Choices",
                subFilter: choice.category,
                name: choice.name,
                badge: choice.category,
                searchBlob: `${choice.name} ${choice.category} ${choice.prerequisite || ""} ${choice.description}`.toLowerCase(),
                renderMarkdown: async () => {
                    const prereqLine = choice.prerequisite ? `\n*Prerequisite: ${choice.prerequisite}*` : "";
                    return `### ${choice.name}\n**${choice.category}**${prereqLine}\n\n---\n\n${choice.description}`;
                }
            });
        }

        // 4. Races & Lineages
        const races = await getAllCompendiumRaces(this.app, settings);
        for (const race of races) {
            const data = race.data || {};
            const traitLines: string[] = [];
            const searchParts: string[] = [race.name];

            const metaLines: string[] = [];
            if (data.size) metaLines.push(`- **Size:** ${Array.isArray(data.size) ? data.size.join(" or ") : data.size}`);
            if (data.speed) metaLines.push(`- **Speed:** ${data.speed} ft.`);

            const traits = Array.isArray(data.traits)
                ? data.traits
                : (Array.isArray(data.features) ? data.features : []);
            for (const t of traits) {
                if (!t || typeof t !== "object") continue;
                const tName = String(t.name || "Trait").trim();
                const tDesc = String(t.description || "").trim();
                searchParts.push(tName, tDesc);
                traitLines.push(`#### ${tName}\n${tDesc}`);
            }

            if (data.lineages && typeof data.lineages === "object") {
                traitLines.push(`#### Lineages / Subraces`);
                for (const [linName, linObj] of Object.entries(data.lineages)) {
                    searchParts.push(linName);
                    if (linObj && typeof linObj === "object") {
                        const lDesc = String((linObj as any).description || "").trim();
                        const lTraits = Array.isArray((linObj as any).traits) ? (linObj as any).traits : [];
                        const subLines = [`##### ${linName}`];
                        if (lDesc) subLines.push(lDesc);
                        for (const lt of lTraits) {
                            if (lt?.name) {
                                searchParts.push(lt.name, lt.description || "");
                                subLines.push(`- **${lt.name}:** ${lt.description || ""}`);
                            }
                        }
                        traitLines.push(subLines.join("\n"));
                    }
                }
            }

            items.push({
                id: `race::${race.id}`,
                category: "races",
                categoryLabel: "Races & Lineages",
                subFilter: "Species / Race",
                name: race.name,
                badge: data.speed ? `${data.speed} ft.` : "Species",
                searchBlob: searchParts.join(" ").toLowerCase(),
                renderMarkdown: async () => {
                    const metaBlock = metaLines.length > 0 ? `${metaLines.join("\n")}\n\n---\n\n` : "";
                    return `### ${race.name}\n\n${metaBlock}${traitLines.join("\n\n") || String(data.description || "*No traits listed.*")}`;
                }
            });
        }

        // 5. Backgrounds
        const backgrounds = await getAllCompendiumBackgrounds(this.app, settings);
        for (const bg of backgrounds) {
            const data = bg.data || {};
            const skills = Array.isArray(data.skillProficiencies) ? data.skillProficiencies.join(", ") : "";
            const tools = Array.isArray(data.toolProficiencies) ? data.toolProficiencies.join(", ") : (data.toolProficiency || "");
            const abilities = Array.isArray(data.abilityScores) ? data.abilityScores.join(", ") : "";
            const feat = data.feat ? formatFeatureOrSlug(String(data.feat)) : "";
            const desc = String(data.description || "").trim();

            items.push({
                id: `bg::${bg.id}`,
                category: "backgrounds",
                categoryLabel: "Backgrounds",
                subFilter: "Background",
                name: bg.name,
                badge: feat ? `Feat: ${feat}` : "Background",
                searchBlob: `${bg.name} background ${skills} ${tools} ${abilities} ${feat} ${desc}`.toLowerCase(),
                renderMarkdown: async () => {
                    const lines: string[] = [`### ${bg.name}\n*Background*\n\n---`];
                    if (abilities) lines.push(`- **Ability Scores:** ${abilities}`);
                    if (feat) lines.push(`- **Origin Feat:** ${feat}`);
                    if (skills) lines.push(`- **Skill Proficiencies:** ${skills}`);
                    if (tools) lines.push(`- **Tool Proficiency:** ${tools}`);
                    if (desc) lines.push(`\n${desc}`);
                    return lines.join("\n");
                }
            });
        }

        // 6. Feats (single-pass loader in data.ts)
        const allFeats = await getAllCompendiumFeats(this.app, settings);
        for (const fEntry of allFeats) {
            items.push({
                id: `feat::${fEntry.id}`,
                category: "feats",
                categoryLabel: "Feats",
                subFilter: fEntry.category,
                name: fEntry.name,
                badge: fEntry.category,
                searchBlob: `${fEntry.name} ${fEntry.category} ${fEntry.prerequisite || ""} ${fEntry.description}`.toLowerCase(),
                renderMarkdown: async () => {
                    const lines = [`### ${fEntry.name}`, `*${fEntry.category}*`];
                    if (fEntry.prerequisite) lines.push(`*Prerequisite: ${fEntry.prerequisite}*`);
                    lines.push("\n---\n", fEntry.description || "*No description available.*");
                    return lines.join("\n");
                }
            });
        }

        // 7. Equipment Items & Weapon Masteries
        const allItems = await getAllCompendiumItems(this.app, settings);
        for (const item of allItems) {
            const data = item.data || {};
            const itemType = String(data.type || "Equipment").trim();
            const desc = String(data.description || "").trim();
            const dmg = data.damage ? String(data.damage) : "";
            const mastery = data.mastery ? String(data.mastery) : "";

            items.push({
                id: `item::${item.id}`,
                category: "items",
                categoryLabel: "Items & Masteries",
                subFilter: itemType,
                name: item.name,
                badge: dmg ? `${itemType} • ${dmg}` : itemType,
                searchBlob: `${item.name} ${itemType} ${dmg} ${mastery} ${desc}`.toLowerCase(),
                renderMarkdown: async () => {
                    const meta: string[] = [];
                    if (data.type) meta.push(`- **Type:** ${data.type}`);
                    if (data.damage) meta.push(`- **Damage:** ${data.damage}`);
                    if (data.ac) meta.push(`- **Armor Class:** ${data.ac}`);
                    if (data.cost !== undefined) meta.push(`- **Cost:** ${data.cost}`);
                    if (data.weight !== undefined) meta.push(`- **Weight:** ${data.weight} lbs`);
                    if (data.mastery) {
                        const mInfo = await getWeaponMasteryDescription(this.app, settings, data.mastery);
                        if (mInfo) {
                            meta.push(`- **Weapon Mastery (${mInfo.name}):** ${mInfo.description}`);
                        } else {
                            meta.push(`- **Weapon Mastery:** ${data.mastery}`);
                        }
                    }
                    return `### ${item.name}\n\n${meta.join("\n")}\n\n---\n\n${desc || "*Standard equipment item.*"}`;
                }
            });
        }

        // Also include standalone Weapon Mastery entries in "Items & Masteries"
        const masteriesMap = await getWeaponMasteriesMap(this.app, settings);
        for (const [mName, mDesc] of Object.entries(masteriesMap || {})) {
            items.push({
                id: `mastery::${toSlug(mName)}`,
                category: "items",
                categoryLabel: "Items & Masteries",
                subFilter: "Weapon Mastery",
                name: `${mName} (Weapon Mastery)`,
                badge: "Weapon Mastery",
                searchBlob: `${mName} weapon mastery ${mDesc}`.toLowerCase(),
                renderMarkdown: async () => {
                    return `### ${mName}\n*Weapon Mastery Property*\n\n---\n\n${mDesc}`;
                }
            });
        }

        this.compendiumItems = items;
        this.compendiumLoaded = true;
        this.loadedCompendiumRevision = currentRev;
    }

    private async renderCompendiumTab(tabToken: number): Promise<void> {
        await this.ensureCompendiumLoaded();
        if (this.isStaleTabRender(tabToken)) return;

        const root = this.bodyContainer.createDiv({ cls: "dnd-compendium-root" });

        // Top Search & Category Bar
        const controls = root.createDiv({ cls: "dnd-compendium-controls" });
        const searchRow = controls.createDiv({ cls: "dnd-compendium-search-row" });

        const searchInput = searchRow.createEl("input", {
            type: "text",
            placeholder: "Search rules, conditions, classes, subclasses, choices, races, backgrounds, feats, items...",
            value: this.compendiumQuery,
            cls: "dnd-modal-form-input dnd-compendium-search-input"
        });

        const subFilterSelect = searchRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });

        const clearBtn = searchRow.createEl("button", {
            text: "Reset",
            cls: "dnd-dm-small-btn"
        });

        // Category Pills
        const pillsRow = controls.createDiv({ cls: "dnd-compendium-pills" });
        const categories: { id: "all" | CompendiumUnifiedItem["category"]; label: string }[] = [
            { id: "all", label: "All" },
            { id: "rules", label: "Rules & Conditions" },
            { id: "classes", label: "Classes & Subclasses" },
            { id: "choices", label: "Class Choices" },
            { id: "races", label: "Races & Lineages" },
            { id: "backgrounds", label: "Backgrounds" },
            { id: "feats", label: "Feats" },
            { id: "items", label: "Items & Masteries" }
        ];

        const { listPane, previewPane, setPreviewActive } = this.createMasterDetailSplitLayout(root, [controls]);

        const populateSubFilters = () => {
            subFilterSelect.empty();
            subFilterSelect.createEl("option", { text: "All Sub-Categories", value: "all" });
            const relevant = this.compendiumCategory === "all"
                ? this.compendiumItems
                : this.compendiumItems.filter(i => i.category === this.compendiumCategory);
            const subSet = Array.from(new Set(relevant.map(i => i.subFilter).filter(Boolean))).sort();
            for (const sf of subSet) {
                subFilterSelect.createEl("option", { text: sf, value: sf });
            }
            if (!subSet.includes(this.compendiumSubFilter)) {
                this.compendiumSubFilter = "all";
            }
            subFilterSelect.value = this.compendiumSubFilter;
        };

        const renderPreview = async (item: CompendiumUnifiedItem | null) => {
            const pToken = ++this.compendiumPreviewToken;
            if (!item) {
                previewPane.empty();
                setPreviewActive(false);
                previewPane.createEl("p", {
                    text: "Select any rule, class, feat, item, or trait to inspect its full details.",
                    cls: "dnd-modal-preview-empty"
                });
                return;
            }

            const mdText = await item.renderMarkdown();
            if (pToken !== this.compendiumPreviewToken || this.isStaleTabRender(tabToken)) return;

            previewPane.empty();
            setPreviewActive(true);

            const toolbar = previewPane.createDiv({ cls: "dnd-compendium-preview-toolbar" });
            toolbar.createEl("span", {
                text: `${item.categoryLabel} • ${item.badge}`,
                cls: "dnd-level-badge"
            });

            const rightActions = toolbar.createDiv({ cls: "dnd-modal-preview-badges" });
            const copyBtn = rightActions.createEl("button", {
                text: "Copy Markdown",
                cls: "dnd-dm-small-btn"
            });
            copyBtn.onclick = () => {
                void copyTextToClipboard(mdText, `Copied "${item.name}" to clipboard!`);
            };

            if (this.hostMode === "sidebar") {
                const closeBtn = rightActions.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Close preview" }
                });
                closeBtn.onclick = async () => {
                    this.selectedCompendiumId = null;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    await renderPreview(null);
                };
            }

            const contentBox = previewPane.createDiv({ cls: "dnd-compendium-preview-content" });
            await this.plugin.renderDndMarkdown(mdText, contentBox, this.sourcePath, this.renderChild);
        };

        const renderPillsAndList = async () => {
            if (this.isStaleTabRender(tabToken)) return;
            const q = this.compendiumQuery.trim().toLowerCase();

            // Single-pass category count + active category/subfilter filtering
            const counts: Record<string, number> = { all: 0 };
            for (const c of categories) counts[c.id] = 0;

            const filtered: CompendiumUnifiedItem[] = [];
            for (const it of this.compendiumItems) {
                if (q && !it.searchBlob.includes(q)) continue;
                counts.all++;
                counts[it.category] = (counts[it.category] || 0) + 1;
                if (this.compendiumCategory !== "all" && it.category !== this.compendiumCategory) continue;
                if (this.compendiumSubFilter !== "all" && it.subFilter !== this.compendiumSubFilter) continue;
                filtered.push(it);
            }

            pillsRow.empty();
            for (const cat of categories) {
                const pill = pillsRow.createEl("button", {
                    text: `${cat.label} (${counts[cat.id] || 0})`,
                    cls: `dnd-compendium-pill ${this.compendiumCategory === cat.id ? "is-active" : ""}`.trim()
                });
                pill.onclick = async () => {
                    this.compendiumCategory = cat.id;
                    this.compendiumSubFilter = "all";
                    populateSubFilters();
                    await renderPillsAndList();
                };
            }

            listPane.empty();
            if (filtered.length === 0) {
                listPane.createEl("p", {
                    text: "No compendium entries match your search filters.",
                    cls: "dnd-modal-empty-text"
                });
                await renderPreview(null);
                return;
            }

            // Cap visible DOM rows at 200 for instant typing responsiveness
            const displayList = filtered.slice(0, 200);
            if (this.hostMode === "sidebar") {
                if (this.selectedCompendiumId && !displayList.some(i => i.id === this.selectedCompendiumId)) {
                    this.selectedCompendiumId = null;
                }
            } else if (!this.selectedCompendiumId || !displayList.some(i => i.id === this.selectedCompendiumId)) {
                this.selectedCompendiumId = displayList[0].id;
            }

            for (const item of displayList) {
                const isSelected = item.id === this.selectedCompendiumId;
                const row = listPane.createDiv({
                    cls: `dnd-modal-list-row dnd-compendium-row is-clickable ${isSelected ? "is-active" : ""}`.trim()
                });
                const left = row.createDiv({ cls: "dnd-modal-row-left" });
                left.createEl("span", { text: item.name, cls: "dnd-modal-row-name" });
                row.createEl("span", {
                    text: item.badge,
                    cls: "dnd-level-badge dnd-modal-badge-sm"
                });

                const selectRow = async () => {
                    if (this.hostMode === "sidebar" && this.selectedCompendiumId === item.id) {
                        this.selectedCompendiumId = null;
                        row.removeClass("is-active");
                        await renderPreview(null);
                        return;
                    }
                    this.selectedCompendiumId = item.id;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    row.addClass("is-active");
                    await renderPreview(item);
                };
                row.onclick = () => { void selectRow(); };
                makeKeyboardClickable(row, () => { void selectRow(); });
            }

            if (filtered.length > 200) {
                listPane.createEl("div", {
                    text: `Showing top 200 of ${filtered.length} matches. Refine your search query to narrow results.`,
                    cls: "dnd-modal-empty-text"
                });
            }

            const activeItem = this.selectedCompendiumId
                ? (displayList.find(i => i.id === this.selectedCompendiumId) || null)
                : (this.hostMode === "sidebar" ? null : displayList[0]);
            await renderPreview(activeItem);
        };

        populateSubFilters();
        searchInput.oninput = () => {
            this.compendiumQuery = searchInput.value;
            this.compendiumSearchTimer = this.clearTimer(this.compendiumSearchTimer);
            this.compendiumSearchTimer = window.setTimeout(() => {
                this.compendiumSearchTimer = null;
                void renderPillsAndList();
            }, 120);
        };
        subFilterSelect.onchange = () => {
            this.compendiumSubFilter = subFilterSelect.value;
            void renderPillsAndList();
        };
        clearBtn.onclick = () => {
            this.compendiumSearchTimer = this.clearTimer(this.compendiumSearchTimer);
            this.compendiumQuery = "";
            this.compendiumCategory = "all";
            this.compendiumSubFilter = "all";
            searchInput.value = "";
            populateSubFilters();
            void renderPillsAndList();
        };

        await renderPillsAndList();
    }

    // ========================================================================
    // --- TAB 2: UNIVERSAL SPELL BROWSER ---
    // ========================================================================

    private async ensureSpellsLoaded(): Promise<void> {
        const currentRev = this.plugin.rulebookRevision ?? 0;
        if (this.spellsLoaded && this.loadedSpellsRevision === currentRev) return;
        this.allSpells = await getAllCompendiumSpells(this.app, this.plugin.settings);
        this.spellsLoaded = true;
        this.loadedSpellsRevision = currentRev;
    }

    private async renderSpellBrowserTab(tabToken: number): Promise<void> {
        await this.ensureSpellsLoaded();
        if (this.isStaleTabRender(tabToken)) return;

        const root = this.bodyContainer.createDiv({ cls: "dnd-spell-browser-root" });

        const controls = root.createDiv({ cls: "dnd-compendium-controls" });
        const topRow = controls.createDiv({ cls: "dnd-compendium-search-row" });

        const searchInput = topRow.createEl("input", {
            type: "text",
            placeholder: "Search spells by name, school, description, components...",
            value: this.spellQuery,
            cls: "dnd-modal-form-input dnd-compendium-search-input"
        });

        // Pool / Class select
        const allPools = Array.from(new Set(this.allSpells.flatMap(s => s.pools))).sort();
        const poolSelect = topRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        poolSelect.createEl("option", { text: "All Classes / Spell Pools", value: "all" });
        for (const p of allPools) {
            poolSelect.createEl("option", { text: formatPoolDisplayName(p), value: p });
        }
        poolSelect.value = this.spellPoolFilter;

        // School select
        const allSchools = Array.from(new Set(this.allSpells.map(s => s.school).filter(Boolean))).sort();
        const schoolSelect = topRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        schoolSelect.createEl("option", { text: "All Schools", value: "all" });
        for (const sch of allSchools) {
            schoolSelect.createEl("option", { text: sch, value: sch });
        }
        schoolSelect.value = this.spellSchoolFilter;

        // Level & C/R Filter Bar
        const secondRow = controls.createDiv({ cls: "dnd-spell-filter-row" });
        const levelPills = secondRow.createDiv({ cls: "dnd-compendium-pills" });
        const levels = ["all", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

        const flagsGroup = secondRow.createDiv({ cls: "dnd-spell-flag-toggles" });
        const concBtn = flagsGroup.createEl("button", {
            text: "Concentration [C]",
            cls: `dnd-compendium-pill ${this.spellConcentrationOnly ? "is-active" : ""}`.trim()
        });
        const ritualBtn = flagsGroup.createEl("button", {
            text: "Ritual [R]",
            cls: `dnd-compendium-pill ${this.spellRitualOnly ? "is-active" : ""}`.trim()
        });
        const resetBtn = flagsGroup.createEl("button", {
            text: "Reset",
            cls: "dnd-dm-small-btn"
        });

        const { listPane, previewPane, setPreviewActive } = this.createMasterDetailSplitLayout(root, [controls]);

        const renderSpellPreview = async (spell: CompendiumSpellEntry | null) => {
            const pToken = ++this.spellPreviewToken;
            if (pToken !== this.spellPreviewToken || this.isStaleTabRender(tabToken)) return;

            previewPane.empty();
            setPreviewActive(Boolean(spell));
            if (!spell) {
                previewPane.createEl("p", {
                    text: "Select a spell from the list to view its full description.",
                    cls: "dnd-modal-preview-empty"
                });
                return;
            }

            const headerDiv = previewPane.createDiv({ cls: "dnd-modal-preview-header" });
            headerDiv.createEl("h4", { text: spell.name, cls: "dnd-modal-preview-title" });

            const badgesDiv = headerDiv.createDiv({ cls: "dnd-modal-preview-badges" });
            if (spell.concentration) {
                badgesDiv.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
            }
            if (spell.ritual) {
                badgesDiv.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
            }

            const copyBtn = badgesDiv.createEl("button", {
                text: "Copy",
                cls: "dnd-dm-small-btn",
                attr: { title: "Copy Spell Markdown" }
            });
            copyBtn.onclick = () => {
                const lvlLabel = spell.level === 0 ? `${spell.school} Cantrip` : `Level ${spell.level} ${spell.school}`;
                const md = `### ${spell.name}\n*${lvlLabel}*\n- **Casting Time:** ${spell.castingTime}\n- **Range:** ${spell.range}\n- **Components:** ${spell.components.join(", ")}${spell.materials ? ` (${spell.materials})` : ""}\n- **Duration:** ${spell.duration}\n\n${spell.description}`;
                void copyTextToClipboard(md, `Copied "${spell.name}" to clipboard!`);
            };

            if (this.hostMode === "sidebar") {
                const closeBtn = badgesDiv.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Close preview" }
                });
                closeBtn.onclick = async () => {
                    this.selectedSpellId = null;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    await renderSpellPreview(null);
                };
            }

            const lvlText = spell.level === 0 ? `${spell.school} Cantrip` : `Level ${spell.level} ${spell.school}`;
            previewPane.createEl("div", { text: lvlText, cls: "dnd-modal-preview-sub" });

            const metaDiv = previewPane.createDiv({ cls: "dnd-modal-preview-meta" });
            metaDiv.createEl("div", { text: `Casting Time: ${spell.castingTime}` });
            metaDiv.createEl("div", { text: `Range: ${spell.range}` });
            if (spell.components.length > 0) {
                const matStr = spell.materials ? ` (${spell.materials})` : "";
                metaDiv.createEl("div", { text: `Components: ${spell.components.join(", ")}${matStr}` });
            }
            metaDiv.createEl("div", { text: `Duration: ${spell.duration}` });
            if (spell.classes.length > 0) {
                metaDiv.createEl("div", { text: `Classes: ${spell.classes.join(", ")}` });
            } else if (spell.pools.length > 0) {
                metaDiv.createEl("div", { text: `Pools: ${spell.pools.map(p => formatPoolDisplayName(p)).join(", ")}` });
            }

            if (spell.description) {
                const descDiv = previewPane.createDiv({ cls: "dnd-modal-preview-desc" });
                await this.plugin.renderDndMarkdown(spell.description, descDiv, this.sourcePath, this.renderChild);
            }
        };

        const updateSpellView = async () => {
            if (this.isStaleTabRender(tabToken)) return;

            // Render level pills
            levelPills.empty();
            for (const lvl of levels) {
                const label = lvl === "all" ? "All Levels" : (lvl === "0" ? "Cantrips" : `Lvl ${lvl}`);
                const btn = levelPills.createEl("button", {
                    text: label,
                    cls: `dnd-compendium-pill ${this.spellLevelFilter === lvl ? "is-active" : ""}`.trim()
                });
                btn.onclick = () => {
                    this.spellLevelFilter = lvl;
                    void updateSpellView();
                };
            }

            concBtn.classList.toggle("is-active", this.spellConcentrationOnly);
            ritualBtn.classList.toggle("is-active", this.spellRitualOnly);

            const q = this.spellQuery.trim().toLowerCase();
            const matches = this.allSpells.filter(sp => {
                if (this.spellLevelFilter !== "all" && String(sp.level) !== this.spellLevelFilter) return false;
                if (this.spellPoolFilter !== "all" && !sp.pools.includes(this.spellPoolFilter)) return false;
                if (this.spellSchoolFilter !== "all" && sp.school.toLowerCase() !== this.spellSchoolFilter.toLowerCase()) return false;
                if (this.spellConcentrationOnly && !sp.concentration) return false;
                if (this.spellRitualOnly && !sp.ritual) return false;
                if (q) {
                    const hay = `${sp.name} ${sp.school} ${sp.description} ${sp.classes.join(" ")}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });

            listPane.empty();
            listPane.createEl("div", {
                text: `${matches.length} spell${matches.length === 1 ? "" : "s"} found`,
                cls: "dnd-spell-count-banner"
            });

            if (matches.length === 0) {
                listPane.createEl("p", {
                    text: "No spells match your active filters.",
                    cls: "dnd-modal-empty-text"
                });
                await renderSpellPreview(null);
                return;
            }

            const displayList = matches.slice(0, 250);
            if (this.hostMode === "sidebar") {
                if (this.selectedSpellId && !displayList.some(s => s.id === this.selectedSpellId)) {
                    this.selectedSpellId = null;
                }
            } else if (!this.selectedSpellId || !displayList.some(s => s.id === this.selectedSpellId)) {
                this.selectedSpellId = displayList[0].id;
            }

            for (const sp of displayList) {
                const isSelected = sp.id === this.selectedSpellId;
                const row = listPane.createDiv({
                    cls: `dnd-modal-list-row dnd-compendium-row is-clickable ${isSelected ? "is-active" : ""}`.trim()
                });

                const left = row.createDiv({ cls: "dnd-modal-row-left" });
                left.createEl("span", { text: sp.name, cls: "dnd-modal-row-name" });

                const rightBadges = row.createDiv({ cls: "dnd-modal-row-badges" });
                if (sp.concentration) {
                    rightBadges.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
                }
                if (sp.ritual) {
                    rightBadges.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
                }
                rightBadges.createEl("span", {
                    text: sp.level === 0 ? "Cantrip" : `Lvl ${sp.level}`,
                    cls: "dnd-level-badge dnd-modal-badge-sm"
                });

                const selectSpell = async () => {
                    if (this.hostMode === "sidebar" && this.selectedSpellId === sp.id) {
                        this.selectedSpellId = null;
                        row.removeClass("is-active");
                        await renderSpellPreview(null);
                        return;
                    }
                    this.selectedSpellId = sp.id;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    row.addClass("is-active");
                    await renderSpellPreview(sp);
                };
                row.onclick = () => { void selectSpell(); };
                makeKeyboardClickable(row, () => { void selectSpell(); });
            }

            if (matches.length > 250) {
                listPane.createEl("div", {
                    text: `Showing top 250 of ${matches.length} spells. Narrow your search or filters above.`,
                    cls: "dnd-modal-empty-text"
                });
            }

            const currentSpell = this.selectedSpellId
                ? (displayList.find(s => s.id === this.selectedSpellId) || null)
                : (this.hostMode === "sidebar" ? null : displayList[0]);
            await renderSpellPreview(currentSpell);
        };

        searchInput.oninput = () => {
            this.spellQuery = searchInput.value;
            this.spellSearchTimer = this.clearTimer(this.spellSearchTimer);
            this.spellSearchTimer = window.setTimeout(() => {
                this.spellSearchTimer = null;
                void updateSpellView();
            }, 120);
        };
        poolSelect.onchange = () => {
            this.spellPoolFilter = poolSelect.value;
            void updateSpellView();
        };
        schoolSelect.onchange = () => {
            this.spellSchoolFilter = schoolSelect.value;
            void updateSpellView();
        };
        concBtn.onclick = () => {
            this.spellConcentrationOnly = !this.spellConcentrationOnly;
            void updateSpellView();
        };
        ritualBtn.onclick = () => {
            this.spellRitualOnly = !this.spellRitualOnly;
            void updateSpellView();
        };
        resetBtn.onclick = () => {
            this.spellSearchTimer = this.clearTimer(this.spellSearchTimer);
            this.spellQuery = "";
            this.spellLevelFilter = "all";
            this.spellPoolFilter = "all";
            this.spellSchoolFilter = "all";
            this.spellConcentrationOnly = false;
            this.spellRitualOnly = false;
            searchInput.value = "";
            poolSelect.value = "all";
            schoolSelect.value = "all";
            void updateSpellView();
        };

        await updateSpellView();
    }

    // ========================================================================
    // --- TAB 3: AUTO-SORTING INITIATIVE & COMBAT TRACKER ---
    // ========================================================================

    private async syncCombatantHpToSheet(combatant: InitiativeCombatant): Promise<void> {
        const state = this.getInitiativeState();
        if (!state.syncPcHpToFrontmatter || !combatant.isPC || !combatant.sourcePath) return;
        const file = this.app.vault.getAbstractFileByPath(combatant.sourcePath);
        if (!(file instanceof TFile)) return;
        await this.plugin.updateCharacterFrontmatter(combatant.sourcePath, {
            "DnD_currentHealth": combatant.hp,
            "DnD_tempHealth": combatant.tempHp
        });
    }

    private mirrorPartyHpIntoSavedInitiative(sourcePath: string, newHp: number, newTempHp: number): boolean {
        const saved = this.plugin.settings?.savedInitiativeState;
        if (!saved || saved.syncPcHpToFrontmatter === false || !Array.isArray(saved.combatants)) {
            return false;
        }
        let changed = false;
        for (const c of saved.combatants) {
            if (c?.isPC && c.sourcePath === sourcePath) {
                if (c.hp !== newHp || c.tempHp !== newTempHp) {
                    c.hp = newHp;
                    c.tempHp = newTempHp;
                    changed = true;
                }
            }
        }
        return changed;
    }

    private async renderInitiativeTab(tabToken: number): Promise<void> {
        if (!this.monstersLoaded) {
            const res = await discoverExternalMonsters(this.app);
            if (this.isStaleTabRender(tabToken)) return;
            this.discoveredMonsters = res.monsters;
            this.monstersMeta = res;
            this.monstersLoaded = true;
        }

        let partyResult = await getConfiguredPartyMembersAsync(
            this.app,
            this.plugin,
            this.embedFilterFolder,
            this.embedFilterPlayers
        );
        if (this.isStaleTabRender(tabToken)) return;

        const refreshInitPcModifiers = () => {
            const st = this.getInitiativeState();
            if (partyResult.members.length > 0 && st.combatants.length > 0) {
                const pcByPath = new Map(partyResult.members.map(p => [p.sourcePath, p]));
                for (const c of st.combatants) {
                    if (!c.isPC || !c.sourcePath) continue;
                    const freshPc = pcByPath.get(c.sourcePath);
                    if (freshPc) {
                        c.dexMod = freshPc.dexMod;
                        c.initBonus = freshPc.initBonus;
                    }
                }
            }
            st.combatants = sortInitiativeCombatants(st.combatants);
            if (st.combatants.length > 0 && (!st.activeCombatantId || !st.combatants.some(c => c.id === st.activeCombatantId))) {
                st.activeCombatantId = st.combatants[0].id;
            }
            return st;
        };

        let state = refreshInitPcModifiers();

        const root = this.bodyContainer.createDiv({ cls: "dnd-init-root" });

        // 1. Top Round & Turn Control Bar (persistent across incremental updates)
        const topBar = root.createDiv({ cls: "dnd-init-top-bar" });
        const roundGroup = topBar.createDiv({ cls: "dnd-init-round-group" });
        const roundBadgeEl = roundGroup.createEl("span", {
            text: `Round ${state.round || 1}`,
            cls: "dnd-init-round-badge"
        });

        let refreshInitiativeView!: (refreshPartyFromCache?: boolean) => Promise<void>;

        const prevTurnBtn = roundGroup.createEl("button", {
            text: "Prev Turn",
            cls: "dnd-dm-small-btn"
        });
        prevTurnBtn.onclick = async () => {
            state = this.getInitiativeState();
            if (state.combatants.length === 0) return;
            const curIdx = state.combatants.findIndex(c => c.id === state.activeCombatantId);
            if (curIdx <= 0) {
                if ((state.round || 1) <= 1) {
                    state.round = 1;
                    state.activeCombatantId = state.combatants[0].id;
                    return;
                }
                state.round = (state.round || 1) - 1;
                state.activeCombatantId = state.combatants[state.combatants.length - 1].id;
            } else {
                state.activeCombatantId = state.combatants[curIdx - 1].id;
            }
            await this.saveInitiativeState();
            await refreshInitiativeView(false);
        };

        const nextTurnBtn = roundGroup.createEl("button", {
            text: "Next Turn",
            cls: "dnd-dm-small-btn mod-cta"
        });
        nextTurnBtn.onclick = async () => {
            state = this.getInitiativeState();
            if (state.combatants.length === 0) return;
            const curIdx = state.combatants.findIndex(c => c.id === state.activeCombatantId);
            if (curIdx === -1 || curIdx + 1 >= state.combatants.length) {
                state.round = (state.round || 1) + 1;
                state.activeCombatantId = state.combatants[0].id;
            } else {
                state.activeCombatantId = state.combatants[curIdx + 1].id;
            }
            await this.saveInitiativeState();
            await refreshInitiativeView(false);
        };

        const rightActions = topBar.createDiv({ cls: "dnd-init-top-actions" });

        const syncLabel = rightActions.createEl("label", {
            cls: "dnd-init-sync-toggle",
            attr: { title: "Automatically sync PC Hit Points back to their character sheet frontmatter" }
        });
        const syncCheckbox = syncLabel.createEl("input", { type: "checkbox" });
        syncCheckbox.checked = state.syncPcHpToFrontmatter !== false;
        syncLabel.createSpan({ text: "Sync PC HP" });
        syncCheckbox.onchange = async () => {
            state = this.getInitiativeState();
            state.syncPcHpToFrontmatter = syncCheckbox.checked;
            await this.saveInitiativeState();
        };

        const syncPcsBtn = rightActions.createEl("button", {
            text: "Sync PCs",
            cls: "dnd-dm-small-btn",
            attr: { title: "Update active PC combatants' AC, Max HP, HP, Temp HP, and Init Bonus from their character sheets" }
        });
        syncPcsBtn.onclick = async () => {
            partyResult = await getConfiguredPartyMembersAsync(
                this.app,
                this.plugin,
                this.embedFilterFolder,
                this.embedFilterPlayers
            );
            if (this.isStaleTabRender(tabToken)) return;
            state = this.getInitiativeState();
            const pcByPath = new Map(partyResult.members.map(p => [p.sourcePath, p]));
            let syncedCount = 0;
            for (const c of state.combatants) {
                if (!c.isPC || !c.sourcePath) continue;
                const pc = pcByPath.get(c.sourcePath);
                if (!pc) continue;
                c.name = pc.name;
                c.ac = pc.ac;
                c.maxHp = pc.maxHp;
                c.hp = pc.currentHp;
                c.tempHp = pc.tempHp;
                c.dexMod = pc.dexMod;
                c.initBonus = pc.initBonus;
                syncedCount++;
            }
            if (syncedCount > 0) {
                await this.saveInitiativeState();
                await refreshInitiativeView(false);
                new Notice(`Synced ${syncedCount} PC(s) from character sheets!`);
            } else {
                new Notice("No matching PC combatants from your configured Party Folder to sync.");
            }
        };

        const rerollNpcsBtn = rightActions.createEl("button", {
            text: "Re-Roll NPCs",
            cls: "dnd-dm-small-btn",
            attr: { title: "Roll 1d20 + Init Bonus for all non-PC combatants and auto-sort" }
        });
        rerollNpcsBtn.onclick = async () => {
            state = this.getInitiativeState();
            for (const c of state.combatants) {
                if (!c.isPC) {
                    c.initiative = rollD20() + (Number(c.initBonus) || 0);
                }
            }
            await this.saveInitiativeState();
            await refreshInitiativeView(false);
            new Notice("Re-rolled initiative for all NPCs!");
        };

        const clearNpcsBtn = rightActions.createEl("button", {
            text: "Clear NPCs",
            cls: "dnd-dm-small-btn"
        });
        clearNpcsBtn.onclick = async () => {
            state = this.getInitiativeState();
            removeCombatantsUpdatingTurn(state, c => c.isPC);
            await this.saveInitiativeState();
            await refreshInitiativeView(false);
        };

        const resetBtn = rightActions.createEl("button", {
            text: "Reset All",
            cls: "dnd-dm-small-btn dnd-btn-danger"
        });
        resetBtn.onclick = async () => {
            state = this.getInitiativeState();
            state.round = 1;
            state.activeCombatantId = null;
            state.combatants = [];
            await this.saveInitiativeState();
            await refreshInitiativeView(false);
        };

        // 2. Add / Import Combatant Panel (persistent across turn/damage updates; only form row switches on mode pill click)
        const addPanel = root.createDiv({ cls: "dnd-init-add-panel" });
        const modeSwitchRow = addPanel.createDiv({ cls: "dnd-compendium-pills dnd-init-mode-pills" });

        const modes: { id: "pc" | "monster" | "custom"; label: string }[] = [
            { id: "pc", label: "Import Vault PCs" },
            { id: "monster", label: "Add Monster / Statblock" },
            { id: "custom", label: "Custom Combatant" }
        ];

        const addFormRow = addPanel.createDiv({ cls: "dnd-init-add-form" });

        let pcSelectRef: HTMLSelectElement | null = null;
        let importAllBtnRef: HTMLButtonElement | null = null;

        const updatePcSelectControls = () => {
            const { activeFolder: initPartyFolder, members: partyPcs, isConfigured: hasPartyFolder } = partyResult;
            if (pcSelectRef) {
                const prevVal = pcSelectRef.value;
                pcSelectRef.empty();
                if (!hasPartyFolder) {
                    pcSelectRef.createEl("option", { text: "Select a Party Folder in Party Dashboard first...", value: "" });
                } else if (partyPcs.length === 0) {
                    pcSelectRef.createEl("option", { text: `No character sheets found in "${initPartyFolder}"`, value: "" });
                } else {
                    for (const pc of partyPcs) {
                        pcSelectRef.createEl("option", {
                            text: `${pc.name} (Lvl ${pc.level} ${pc.dndClass} • AC ${pc.ac} • HP ${pc.currentHp}/${pc.maxHp} • Init ${formatSignedNumber(pc.initBonus)})`,
                            value: pc.sourcePath
                        });
                    }
                    if (prevVal && partyPcs.some(p => p.sourcePath === prevVal)) {
                        pcSelectRef.value = prevVal;
                    }
                }
            }
            if (importAllBtnRef) {
                importAllBtnRef.setText(hasPartyFolder ? `Import All Party PCs (${partyPcs.length})` : "Import All Party PCs");
                importAllBtnRef.setAttribute(
                    "title",
                    hasPartyFolder
                        ? `Import all party PCs from "${initPartyFolder}" not yet in the tracker and auto-roll their initiative`
                        : "Select a Party Folder in the Party Dashboard tab first"
                );
            }
        };

        const renderAddForm = () => {
            addFormRow.empty();
            pcSelectRef = null;
            importAllBtnRef = null;

            if (this.initAddMode === "pc") {
                const pcSelect = addFormRow.createEl("select", {
                    cls: "dnd-modal-form-input dnd-init-add-select"
                });
                pcSelectRef = pcSelect;

                const manualInitInput = addFormRow.createEl("input", {
                    type: "number",
                    placeholder: "Roll (or auto)",
                    cls: "dnd-modal-form-input dnd-init-num-input",
                    attr: { title: "Enter the player's physical initiative total, or leave blank to auto-roll 1d20 + Init Bonus" }
                });

                const addPcBtn = addFormRow.createEl("button", {
                    text: "+ Add PC",
                    cls: "dnd-dm-small-btn mod-cta"
                });
                const handleAddSinglePc = async () => {
                    const chosen = partyResult.members.find(p => p.sourcePath === pcSelect.value);
                    if (!chosen) return;
                    state = this.getInitiativeState();
                    const manualVal = manualInitInput.value.trim();
                    const hasManual = manualVal !== "" && !isNaN(Number(manualVal));
                    const existing = state.combatants.find(c => c.sourcePath === chosen.sourcePath);

                    if (existing) {
                        if (hasManual) {
                            existing.initiative = Number(manualVal);
                            existing.initBonus = chosen.initBonus;
                            existing.dexMod = chosen.dexMod;
                            manualInitInput.value = "";
                            await this.saveInitiativeState();
                            await refreshInitiativeView(false);
                            new Notice(`Updated initiative for ${chosen.name} to ${existing.initiative}.`);
                        } else {
                            new Notice(`${chosen.name} is already in Initiative. Enter an explicit roll to update or click "Sync PCs" to refresh stats.`);
                        }
                        return;
                    }

                    const rolledTotal = hasManual ? Number(manualVal) : undefined;
                    state.combatants.push(createCombatantFromPartyMember(chosen, rolledTotal));
                    manualInitInput.value = "";
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };
                addPcBtn.onclick = () => { void handleAddSinglePc(); };
                manualInitInput.onkeydown = (evt: KeyboardEvent) => {
                    if (evt.key === "Enter") {
                        evt.preventDefault();
                        void handleAddSinglePc();
                    }
                };

                const importAllBtn = addFormRow.createEl("button", {
                    text: "Import All Party PCs",
                    cls: "dnd-dm-small-btn"
                });
                importAllBtnRef = importAllBtn;
                importAllBtn.onclick = async () => {
                    const { activeFolder: initPartyFolder, members: partyPcs, isConfigured: hasPartyFolder } = partyResult;
                    if (!hasPartyFolder) {
                        new Notice("Select a Party Folder in the Party Dashboard tab first.");
                        return;
                    }
                    if (partyPcs.length === 0) {
                        new Notice(`No character sheet notes found in "${initPartyFolder}".`);
                        return;
                    }
                    state = this.getInitiativeState();
                    let added = 0;
                    for (const pc of partyPcs) {
                        if (state.combatants.some(c => c.sourcePath === pc.sourcePath)) continue;
                        state.combatants.push(createCombatantFromPartyMember(pc));
                        added++;
                    }
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                    new Notice(added > 0 ? `Imported ${added} PC(s) from "${initPartyFolder}" into Initiative!` : "All party PCs from that folder are already in the tracker.");
                };

                updatePcSelectControls();
            } else if (this.initAddMode === "monster") {
                const filterInput = addFormRow.createEl("input", {
                    type: "text",
                    placeholder: `Filter ${this.discoveredMonsters.length} DM Compendium monsters...`,
                    value: this.initMonsterFilterQuery,
                    cls: "dnd-modal-form-input dnd-init-name-input"
                });

                const monSelect = addFormRow.createEl("select", {
                    cls: "dnd-modal-form-input dnd-init-add-select"
                });

                const populateMonsterDropdown = () => {
                    monSelect.empty();
                    const q = this.initMonsterFilterQuery.trim().toLowerCase();
                    const matches = q
                        ? this.discoveredMonsters.filter(m =>
                            m.name.toLowerCase().includes(q)
                            || m.sourceShort.toLowerCase().includes(q)
                            || m.sourceCode.toLowerCase().includes(q)
                            || m.type.toLowerCase().includes(q)
                        )
                        : this.discoveredMonsters;

                    const capped = matches.slice(0, 250);
                    for (const m of capped) {
                        monSelect.createEl("option", {
                            text: `${m.name} (${m.sourceShort} • CR ${m.cr} • AC ${m.ac} • HP ${m.hp} • DEX ${formatSignedNumber(m.dexMod)})`,
                            value: m.id
                        });
                    }
                    if (matches.length > 250) {
                        monSelect.createEl("option", {
                            text: `...and ${matches.length - 250} more (type above to filter)`,
                            value: ""
                        });
                    } else if (matches.length === 0) {
                        monSelect.createEl("option", {
                            text: "No matching monsters found",
                            value: ""
                        });
                    }
                };

                populateMonsterDropdown();
                filterInput.oninput = () => {
                    this.initMonsterFilterQuery = filterInput.value;
                    populateMonsterDropdown();
                };

                const qtyInput = addFormRow.createEl("input", {
                    type: "number",
                    value: "1",
                    cls: "dnd-modal-form-input dnd-init-qty-input",
                    attr: { min: "1", max: "20", title: "Quantity to spawn (e.g. 3 creates Goblin 1, Goblin 2, Goblin 3)" }
                });

                const addMonBtn = addFormRow.createEl("button", {
                    text: "Roll & Add Monster(s)",
                    cls: "dnd-dm-small-btn mod-cta"
                });
                const handleAddMonster = async () => {
                    const chosen = this.discoveredMonsters.find(m => m.id === monSelect.value);
                    if (!chosen) return;
                    const qty = Math.max(1, Math.min(20, Math.round(Number(qtyInput.value) || 1)));
                    this.spawnMonsterIntoInitiative(chosen, qty);
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };
                addMonBtn.onclick = () => { void handleAddMonster(); };
                qtyInput.onkeydown = (evt: KeyboardEvent) => {
                    if (evt.key === "Enter") {
                        evt.preventDefault();
                        void handleAddMonster();
                    }
                };
            } else {
                const nameInput = addFormRow.createEl("input", {
                    type: "text",
                    placeholder: "Combatant Name (e.g. Cultist Leader)",
                    cls: "dnd-modal-form-input dnd-init-name-input"
                });
                const initInput = addFormRow.createEl("input", {
                    type: "number",
                    placeholder: "Init (or auto)",
                    cls: "dnd-modal-form-input dnd-init-num-input",
                    attr: { title: "Initiative total (leave blank to auto-roll 1d20 + Init Bonus)" }
                });
                const modInput = addFormRow.createEl("input", {
                    type: "number",
                    placeholder: "Init Bonus (+0)",
                    cls: "dnd-modal-form-input dnd-init-num-input",
                    attr: { title: "Initiative Modifier / DEX Mod" }
                });
                const hpInput = addFormRow.createEl("input", {
                    type: "number",
                    placeholder: "HP (25)",
                    cls: "dnd-modal-form-input dnd-init-num-input"
                });
                const acInput = addFormRow.createEl("input", {
                    type: "number",
                    placeholder: "AC (14)",
                    cls: "dnd-modal-form-input dnd-init-num-input"
                });
                const qtyInput = addFormRow.createEl("input", {
                    type: "number",
                    value: "1",
                    cls: "dnd-modal-form-input dnd-init-qty-input",
                    attr: { min: "1", max: "20", title: "Quantity" }
                });
                const typeSelect = addFormRow.createEl("select", {
                    cls: "dnd-modal-form-input dnd-init-type-select"
                });
                typeSelect.createEl("option", { text: "NPC / Enemy", value: "npc" });
                typeSelect.createEl("option", { text: "Player / Ally", value: "pc" });

                const addCustomBtn = addFormRow.createEl("button", {
                    text: "+ Add",
                    cls: "dnd-dm-small-btn mod-cta"
                });
                const handleAddCustom = async () => {
                    state = this.getInitiativeState();
                    const baseName = nameInput.value.trim() || "Combatant";
                    const bonus = Math.trunc(Number(modInput.value) || 0);
                    const hp = Math.max(1, Math.round(Number(hpInput.value) || 20));
                    const ac = Math.max(1, Math.round(Number(acInput.value) || 12));
                    const qty = Math.max(1, Math.min(20, Math.round(Number(qtyInput.value) || 1)));
                    const isPC = typeSelect.value === "pc";
                    const manualInit = initInput.value.trim();

                    const names = getNextCombatantNames(state.combatants, baseName, qty);
                    names.forEach((finalName, i) => {
                        const finalInit = manualInit !== "" && !isNaN(Number(manualInit))
                            ? Number(manualInit)
                            : (rollD20() + bonus);
                        state.combatants.push({
                            id: `custom-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                            name: finalName,
                            initiative: finalInit,
                            initBonus: bonus,
                            dexMod: bonus,
                            hp,
                            maxHp: hp,
                            tempHp: 0,
                            ac,
                            isPC,
                            conditions: [],
                            concentrating: false
                        });
                    });

                    nameInput.value = "";
                    initInput.value = "";
                    qtyInput.value = "1";
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };
                addCustomBtn.onclick = () => { void handleAddCustom(); };
                for (const inp of [nameInput, initInput, modInput, hpInput, acInput, qtyInput]) {
                    inp.onkeydown = (evt: KeyboardEvent) => {
                        if (evt.key === "Enter") {
                            evt.preventDefault();
                            void handleAddCustom();
                        }
                    };
                }
            }
        };

        for (const m of modes) {
            const btn = modeSwitchRow.createEl("button", {
                text: m.label,
                cls: `dnd-compendium-pill ${this.initAddMode === m.id ? "is-active" : ""}`.trim()
            });
            btn.onclick = () => {
                if (this.initAddMode === m.id) return;
                this.initAddMode = m.id;
                modeSwitchRow.querySelectorAll(".dnd-compendium-pill").forEach((el, idx) => {
                    el.classList.toggle("is-active", modes[idx]?.id === this.initAddMode);
                });
                renderAddForm();
            };
        }

        // 3. Sorted Combatant Table / Cards
        const listContainer = root.createDiv({ cls: "dnd-init-list" });

        const renderInitiativeList = () => {
            state = this.getInitiativeState();
            roundBadgeEl.setText(`Round ${state.round || 1}`);
            syncCheckbox.checked = state.syncPcHpToFrontmatter !== false;
            listContainer.empty();

            if (state.combatants.length === 0) {
                listContainer.createEl("div", {
                    text: "No combatants in the encounter yet. Import your party PCs, add monsters, or create a custom combatant above!",
                    cls: "dnd-modal-empty-text dnd-init-empty"
                });
                return;
            }

            for (let idx = 0; idx < state.combatants.length; idx++) {
                const c = state.combatants[idx];
                const isActiveTurn = c.id === state.activeCombatantId;
                const isDefeated = !c.isPC && c.hp <= 0;
                const hpPct = c.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((c.hp / c.maxHp) * 100))) : 0;

                const card = listContainer.createDiv({
                    cls: `dnd-init-card ${isActiveTurn ? "is-active-turn" : ""} ${c.isPC ? "is-pc" : "is-npc"} ${isDefeated ? "is-defeated" : ""}`.trim()
                });

                const mainRow = card.createDiv({ cls: "dnd-init-card-main" });

                // Turn Indicator + Editable Initiative Score (Auto-Sorts on change!)
                const initCol = mainRow.createDiv({ cls: "dnd-init-col-score" });
                const turnBtn = initCol.createEl("button", {
                    text: isActiveTurn ? "▶" : String(idx + 1),
                    cls: `dnd-init-turn-indicator ${isActiveTurn ? "is-active" : ""}`.trim(),
                    attr: { title: "Click to set active turn to this combatant" }
                });
                turnBtn.onclick = async () => {
                    state.activeCombatantId = c.id;
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };

                const initScoreInput = initCol.createEl("input", {
                    type: "number",
                    value: String(c.initiative),
                    cls: "dnd-init-score-input",
                    attr: { title: `Initiative Total (Mod: ${formatSignedNumber(c.initBonus)}). Edit to auto-sort.` }
                });
                initScoreInput.onchange = async () => {
                    c.initiative = Number(initScoreInput.value) || 0;
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };

                // Name & Badges Column
                const nameCol = mainRow.createDiv({ cls: "dnd-init-col-name" });
                const nameHeader = nameCol.createDiv({ cls: "dnd-init-name-row" });

                const nameEl = nameHeader.createEl("span", {
                    text: c.name,
                    cls: `dnd-init-name ${c.sourcePath || c.monsterId ? "is-clickable" : ""}`.trim()
                });
                if (c.sourcePath) {
                    nameEl.title = `Open Character Sheet (${c.sourcePath})`;
                    const openSheet = () => {
                        void this.app.workspace.openLinkText(c.sourcePath!, "", false);
                    };
                    nameEl.onclick = openSheet;
                    makeKeyboardClickable(nameEl, openSheet);
                } else if (c.monsterId) {
                    const matchedMonster = this.discoveredMonsters.find(m => m.id === c.monsterId);
                    if (matchedMonster) {
                        nameEl.title = "Click to inspect Creature Statblock";
                        const openStatblock = () => {
                            new StatblockPreviewModal(this.app, this.plugin, matchedMonster).open();
                        };
                        nameEl.onclick = openStatblock;
                        makeKeyboardClickable(nameEl, openStatblock);
                    }
                }

                nameHeader.createEl("span", {
                    text: c.isPC ? "PC" : "NPC",
                    cls: `dnd-level-badge dnd-modal-badge-sm ${c.isPC ? "dnd-badge-pc" : "dnd-badge-npc"}`
                });
                nameHeader.createEl("span", {
                    text: `Init ${formatSignedNumber(c.initBonus)}`,
                    cls: "dnd-init-sub-hint"
                });

                // AC Column
                const acCol = mainRow.createDiv({ cls: "dnd-init-col-ac" });
                acCol.createEl("span", { text: "AC", cls: "dnd-init-field-label" });
                const acInput = acCol.createEl("input", {
                    type: "number",
                    value: String(c.ac),
                    cls: "dnd-init-ac-input"
                });
                acInput.onchange = async () => {
                    c.ac = Math.max(0, Math.round(Number(acInput.value) || 0));
                    await this.saveInitiativeState();
                };

                // HP Bar + Quick Damage/Heal Column
                const hpCol = mainRow.createDiv({ cls: "dnd-init-col-hp" });
                const hpTopRow = hpCol.createDiv({ cls: "dnd-init-hp-top" });

                const hpTrack = hpTopRow.createDiv({ cls: "dnd-init-hp-bar-track" });
                const hpFill = hpTrack.createDiv({
                    cls: `dnd-init-hp-bar-fill ${hpPct <= 25 ? "is-critical" : (hpPct <= 50 ? "is-bloodied" : "")}`.trim()
                });
                hpFill.style.width = `${hpPct}%`;

                const hpInputsWrap = hpTopRow.createDiv({ cls: "dnd-init-hp-inputs" });
                const curHpInput = hpInputsWrap.createEl("input", {
                    type: "number",
                    value: String(c.hp),
                    cls: "dnd-init-hp-input",
                    attr: { title: "Current HP" }
                });
                hpInputsWrap.createSpan({ text: "/" });
                const maxHpInput = hpInputsWrap.createEl("input", {
                    type: "number",
                    value: String(c.maxHp),
                    cls: "dnd-init-hp-input",
                    attr: { title: "Max HP" }
                });

                const tempWrap = hpInputsWrap.createSpan({ cls: "dnd-init-temp-wrap" });
                tempWrap.createSpan({ text: "+Temp" });
                const tempHpInput = tempWrap.createEl("input", {
                    type: "number",
                    value: String(c.tempHp || 0),
                    cls: "dnd-init-temp-input",
                    attr: { title: "Temporary HP" }
                });

                curHpInput.onchange = async () => {
                    c.hp = Math.max(0, Math.round(Number(curHpInput.value) || 0));
                    await this.syncCombatantHpToSheet(c);
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };
                maxHpInput.onchange = async () => {
                    c.maxHp = Math.max(1, Math.round(Number(maxHpInput.value) || 1));
                    if (c.hp > c.maxHp) {
                        c.hp = c.maxHp;
                        await this.syncCombatantHpToSheet(c);
                    }
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };
                tempHpInput.onchange = async () => {
                    c.tempHp = Math.max(0, Math.round(Number(tempHpInput.value) || 0));
                    await this.syncCombatantHpToSheet(c);
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };

                // Quick Delta Damage / Heal controls
                const deltaWrap = hpTopRow.createDiv({ cls: "dnd-init-delta-wrap" });
                const deltaInput = deltaWrap.createEl("input", {
                    type: "number",
                    placeholder: "Dmg/Heal",
                    cls: "dnd-init-delta-input",
                    attr: { min: "1" }
                });
                const dmgBtn = deltaWrap.createEl("button", {
                    text: "- Dmg",
                    cls: "dnd-dm-small-btn dnd-btn-dmg",
                    attr: { title: "Apply Damage (absorbs Temp HP first)" }
                });
                const healBtn = deltaWrap.createEl("button", {
                    text: "+ Heal",
                    cls: "dnd-dm-small-btn dnd-btn-heal",
                    attr: { title: "Apply Healing (up to Max HP)" }
                });

                const applyCombatantDamage = async () => {
                    const dmgVal = Math.max(0, Math.round(Number(deltaInput.value) || 0));
                    if (dmgVal <= 0) return;
                    const res = applyDamageWithTempHp(c.hp, c.tempHp, dmgVal);
                    c.hp = res.newHp;
                    c.tempHp = res.newTempHp;
                    if (c.concentrating && res.hpLost > 0) {
                        const dc = Math.max(10, Math.min(30, Math.floor(res.hpLost / 2)));
                        new Notice(`${c.name} is Concentrating! Roll a DC ${dc} Constitution saving throw.`);
                    }
                    await this.syncCombatantHpToSheet(c);
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };

                const applyCombatantHeal = async () => {
                    const heal = Math.max(0, Math.round(Number(deltaInput.value) || 0));
                    if (heal <= 0) return;
                    c.hp = c.hp >= c.maxHp ? c.hp : Math.min(c.maxHp, c.hp + heal);
                    await this.syncCombatantHpToSheet(c);
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };

                dmgBtn.onclick = () => { void applyCombatantDamage(); };
                healBtn.onclick = () => { void applyCombatantHeal(); };

                // Delete Combatant Column
                const delBtn = mainRow.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Remove combatant from encounter" }
                });
                delBtn.onclick = async () => {
                    removeCombatantsUpdatingTurn(state, item => item.id !== c.id);
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };

                // Second Row: Active Conditions + Concentration + Condition Selector
                const condRow = card.createDiv({ cls: "dnd-init-card-conditions" });
                const activeBadges = condRow.createDiv({ cls: "dnd-init-condition-badges" });

                if (c.concentrating) {
                    const concBadge = activeBadges.createEl("button", {
                        text: "Concentrating ×",
                        cls: "dnd-init-cond-badge is-concentration",
                        attr: { type: "button", title: "Click to inspect Concentration rule or remove" }
                    });
                    concBadge.onclick = () => {
                        new ConditionRuleModal(this.app, this.plugin, "Concentration", async () => {
                            c.concentrating = false;
                            await this.saveInitiativeState();
                            await refreshInitiativeView(false);
                        }).open();
                    };
                }

                for (const cond of c.conditions || []) {
                    const badge = activeBadges.createEl("button", {
                        text: `${cond} ×`,
                        cls: "dnd-init-cond-badge",
                        attr: { type: "button", title: `Click to view 5.5e rule for ${cond} or remove` }
                    });
                    badge.onclick = () => {
                        new ConditionRuleModal(this.app, this.plugin, cond, async () => {
                            c.conditions = (c.conditions || []).filter(x => x !== cond);
                            await this.saveInitiativeState();
                            await refreshInitiativeView(false);
                        }).open();
                    };
                }

                const condSelect = condRow.createEl("select", {
                    cls: "dnd-init-cond-select"
                });
                condSelect.createEl("option", { text: "+ Condition / Concentration", value: "" });
                if (!c.concentrating) {
                    condSelect.createEl("option", { text: "Concentrating", value: "__CONCENTRATING__" });
                }
                for (const condName of DND_55E_CONDITIONS) {
                    if (!(c.conditions || []).includes(condName)) {
                        condSelect.createEl("option", { text: condName, value: condName });
                    }
                }
                condSelect.onchange = async () => {
                    const val = condSelect.value;
                    if (!val) return;
                    if (val === "__CONCENTRATING__") {
                        c.concentrating = true;
                    } else {
                        if (!Array.isArray(c.conditions)) c.conditions = [];
                        if (!c.conditions.includes(val)) c.conditions.push(val);
                    }
                    await this.saveInitiativeState();
                    await refreshInitiativeView(false);
                };
            }
        };

        refreshInitiativeView = async (refreshPartyFromCache: boolean = false) => {
            if (this.isStaleTabRender(tabToken)) return;
            const prevBodyScroll = this.bodyContainer?.scrollTop || 0;

            if (refreshPartyFromCache) {
                const nextParty = await getConfiguredPartyMembersAsync(
                    this.app,
                    this.plugin,
                    this.embedFilterFolder,
                    this.embedFilterPlayers
                );
                if (this.isStaleTabRender(tabToken)) return;
                partyResult = nextParty;
                updatePcSelectControls();
            }

            refreshInitPcModifiers();
            renderInitiativeList();
            if (this.bodyContainer) {
                this.bodyContainer.scrollTop = prevBodyScroll;
            }
        };

        this.activeInitRefreshHook = refreshInitiativeView;
        renderAddForm();
        renderInitiativeList();
    }

    public spawnMonsterIntoInitiative(monster: DiscoveredMonster, qty: number): void {
        const state = this.getInitiativeState();
        const names = getNextCombatantNames(state.combatants, monster.name, qty);

        names.forEach((displayName, i) => {
            state.combatants.push({
                id: `mon-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                name: displayName,
                initiative: rollD20() + monster.dexMod,
                initBonus: monster.dexMod,
                dexMod: monster.dexMod,
                hp: monster.hp,
                maxHp: monster.hp,
                tempHp: 0,
                ac: monster.ac,
                isPC: false,
                conditions: [],
                concentrating: false,
                monsterId: monster.id
            });
        });
    }

    // ========================================================================
    // --- TAB 4: LIVE PARTY DASHBOARD ---
    // ========================================================================

    private async renderPartyTab(tabToken: number): Promise<void> {
        const root = this.bodyContainer.createDiv({ cls: "dnd-party-root" });
        const hasExplicitEmbedFilter = this.embedFilterFolder !== undefined
            || (this.embedFilterPlayers !== undefined && this.embedFilterPlayers.length > 0);
        let partyRenderVersion = 0;

        // Party Folder Input (lets DM type or paste the vault folder containing active party sheets)
        let folderInputRef: HTMLInputElement | null = null;
        if ((this.hostMode === "modal" || this.hostMode === "sidebar") && !hasExplicitEmbedFilter) {
            const folderBar = root.createDiv({ cls: "dnd-compendium-controls dnd-party-folder-bar" });
            const folderRow = folderBar.createDiv({ cls: "dnd-compendium-search-row" });
            folderRow.createEl("span", {
                text: "Party Folder:",
                cls: "dnd-party-folder-label"
            });

            const datalistId = `dnd-party-folders-${Math.random().toString(36).slice(2, 8)}`;
            folderInputRef = folderRow.createEl("input", {
                type: "text",
                placeholder: 'Type or paste folder path (e.g. "Campaign/Party", "/" for root)...',
                value: this.plugin.settings.partyFolderPath || "",
                cls: "dnd-modal-form-input dnd-party-folder-input",
                attr: {
                    list: datalistId,
                    title: 'Enter the vault folder path containing your party\'s character sheets (or "/" for vault root)'
                }
            });
            const dataListEl = folderRow.createEl("datalist", { attr: { id: datalistId } });
            dataListEl.createEl("option", { attr: { value: "/" } });
            for (const fp of listVaultFolderPaths(this.app)) {
                dataListEl.createEl("option", { attr: { value: fp } });
            }
        }

        const partyBody = root.createDiv({ cls: "dnd-party-body" });
        const abilityShort: Record<AbilityKey, string> = {
            strength: "STR",
            dexterity: "DEX",
            constitution: "CON",
            intelligence: "INT",
            wisdom: "WIS",
            charisma: "CHA"
        };

        const renderPartyContent = async () => {
            if (this.isStaleTabRender(tabToken)) return;
            const renderToken = ++partyRenderVersion;
            const {
                activeFolder,
                members: party,
                isConfigured
            } = await getConfiguredPartyMembersAsync(
                this.app,
                this.plugin,
                this.embedFilterFolder,
                this.embedFilterPlayers
            );
            if (renderToken !== partyRenderVersion || this.isStaleTabRender(tabToken)) return;
            partyBody.empty();

            // Top Summary Banner
            const banner = partyBody.createDiv({ cls: "dnd-party-banner" });
            const statsSummary = banner.createDiv({ cls: "dnd-party-banner-stats" });

            const maxPP = party.length > 0 ? Math.max(...party.map(p => p.passivePerception)) : 0;
            const maxPI = party.length > 0 ? Math.max(...party.map(p => p.passiveInvestigation)) : 0;
            const maxPIns = party.length > 0 ? Math.max(...party.map(p => p.passiveInsight)) : 0;

            const addBannerChip = (label: string, val: string) => {
                const chip = statsSummary.createDiv({ cls: "dnd-party-banner-chip" });
                chip.createEl("span", { text: label, cls: "dnd-party-chip-label" });
                chip.createEl("strong", { text: val, cls: "dnd-party-chip-val" });
            };

            addBannerChip("Party Size", String(party.length));
            addBannerChip("Best Passive Perception", String(maxPP));
            addBannerChip("Best Passive Investigation", String(maxPI));
            addBannerChip("Best Passive Insight", String(maxPIns));

            const bannerActions = banner.createDiv({ cls: "dnd-party-banner-actions" });
            const sendToInitBtn = bannerActions.createEl("button", {
                text: "Send Party to Initiative",
                cls: "dnd-dm-small-btn mod-cta"
            });
            sendToInitBtn.onclick = async () => {
                if (!isConfigured) {
                    new Notice("Enter a Party Folder path above first.");
                    return;
                }
                this.partySaveTimer = this.clearTimer(this.partySaveTimer);
                const state = this.getInitiativeState();
                let added = 0;
                for (const pc of party) {
                    if (state.combatants.some(c => c.sourcePath === pc.sourcePath)) continue;
                    state.combatants.push(createCombatantFromPartyMember(pc));
                    added++;
                }
                await this.saveInitiativeState();
                new Notice(added > 0 ? `Added ${added} PC(s) to Initiative Tracker!` : "All party PCs are already in the Initiative Tracker.");
                if (this.hostMode === "modal" || this.hostMode === "sidebar") {
                    await this.setTab("initiative");
                }
            };

            const refreshPartyBtn = bannerActions.createEl("button", {
                text: "Refresh",
                cls: "dnd-dm-small-btn"
            });
            refreshPartyBtn.onclick = () => {
                void renderPartyContent();
            };

            if (party.length === 0) {
                partyBody.createEl("div", {
                    text: !isConfigured
                        ? "Enter your Party Folder path above to display your party's character sheets here and enable automatic whole-party import in the Initiative Tracker."
                        : `No character sheet notes found in "${activeFolder || "/"}". Enter another folder path above or create character sheets in that folder.`,
                    cls: "dnd-modal-empty-text"
                });
                return;
            }

            const grid = partyBody.createDiv({ cls: "dnd-party-grid" });

            for (const pc of party) {
                const card = grid.createDiv({ cls: "dnd-party-card" });

                // Card Header
                const header = card.createDiv({ cls: "dnd-party-card-header" });
                const titleCol = header.createDiv();
                const nameLink = titleCol.createEl("h4", {
                    text: pc.name,
                    cls: "dnd-party-card-name is-clickable",
                    attr: { title: `Click to open ${pc.sourcePath}` }
                });
                const openPcSheet = () => {
                    void this.app.workspace.openLinkText(pc.sourcePath, "", false);
                };
                nameLink.onclick = openPcSheet;
                makeKeyboardClickable(nameLink, openPcSheet);

                const subTitle = `Lvl ${pc.level} • ${pc.race} • ${pc.dndClass}${pc.subclass ? ` (${pc.subclass})` : ""}`;
                titleCol.createEl("div", { text: subTitle, cls: "dnd-party-card-subtitle" });

                // Heroic Inspiration Button
                const hiBtn = header.createEl("button", {
                    text: pc.heroicInspiration ? "Inspired" : "Inspire",
                    cls: `dnd-dm-small-btn dnd-party-hi-btn ${pc.heroicInspiration ? "is-active" : ""}`.trim(),
                    attr: { title: "Toggle Heroic Inspiration for this character" }
                });
                hiBtn.onclick = () => {
                    this.plugin.setHeroicInspiration(pc.sourcePath, !pc.heroicInspiration);
                    void renderPartyContent();
                };

                // HP Bar & Quick Sheet HP Editor
                const hpPct = pc.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((pc.currentHp / pc.maxHp) * 100))) : 0;
                const hpSection = card.createDiv({ cls: "dnd-party-hp-section" });
                const hpLabelRow = hpSection.createDiv({ cls: "dnd-party-hp-label-row" });
                const hpTextStrong = hpLabelRow.createEl("strong", {
                    text: `HP: ${pc.currentHp} / ${pc.maxHp}${pc.tempHp > 0 ? ` (+${pc.tempHp} Temp)` : ""}`
                });

                const quickHpControls = hpLabelRow.createDiv({ cls: "dnd-party-hp-controls" });
                const deltaIn = quickHpControls.createEl("input", {
                    type: "number",
                    placeholder: "±HP",
                    cls: "dnd-init-delta-input"
                });
                const dmgBtn = quickHpControls.createEl("button", {
                    text: "- Dmg",
                    cls: "dnd-dm-small-btn",
                    attr: { title: "Damage character (updates their character sheet note & active initiative)" }
                });
                const healBtn = quickHpControls.createEl("button", {
                    text: "+ Heal",
                    cls: "dnd-dm-small-btn",
                    attr: { title: "Heal character (updates their character sheet note & active initiative)" }
                });

                const hpTrack = hpSection.createDiv({ cls: "dnd-init-hp-bar-track" });
                const hpFill = hpTrack.createDiv({
                    cls: `dnd-init-hp-bar-fill ${hpPct <= 25 ? "is-critical" : (hpPct <= 50 ? "is-bloodied" : "")}`.trim()
                });
                hpFill.style.width = `${hpPct}%`;

                const applyPartyHpVisualUpdate = (nextHp: number, nextTemp: number) => {
                    pc.currentHp = nextHp;
                    pc.tempHp = nextTemp;
                    const nextPct = pc.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((nextHp / pc.maxHp) * 100))) : 0;
                    hpTextStrong.setText(`HP: ${nextHp} / ${pc.maxHp}${nextTemp > 0 ? ` (+${nextTemp} Temp)` : ""}`);
                    hpFill.style.width = `${nextPct}%`;
                    hpFill.className = `dnd-init-hp-bar-fill ${nextPct <= 25 ? "is-critical" : (nextPct <= 50 ? "is-bloodied" : "")}`.trim();
                };

                dmgBtn.onclick = async () => {
                    const dmgVal = Math.max(0, Math.round(Number(deltaIn.value) || 0));
                    if (dmgVal <= 0) return;
                    const { newHp, newTempHp } = applyDamageWithTempHp(pc.currentHp, pc.tempHp, dmgVal);
                    applyPartyHpVisualUpdate(newHp, newTempHp);
                    deltaIn.value = "";
                    const mirrored = this.mirrorPartyHpIntoSavedInitiative(pc.sourcePath, newHp, newTempHp);
                    await this.plugin.updateCharacterFrontmatter(pc.sourcePath, {
                        "DnD_currentHealth": newHp,
                        "DnD_tempHealth": newTempHp
                    });
                    if (mirrored) {
                        await this.plugin.saveSettings();
                        window.dispatchEvent(new CustomEvent("dnd-dm-initiative-updated", {
                            detail: { sourceWidget: this, isCustomNoteState: false }
                        }));
                    }
                };
                healBtn.onclick = async () => {
                    const heal = Math.max(0, Math.round(Number(deltaIn.value) || 0));
                    if (heal <= 0) return;
                    const newHp = pc.currentHp >= pc.maxHp ? pc.currentHp : Math.min(pc.maxHp, pc.currentHp + heal);
                    applyPartyHpVisualUpdate(newHp, pc.tempHp);
                    deltaIn.value = "";
                    const mirrored = this.mirrorPartyHpIntoSavedInitiative(pc.sourcePath, newHp, pc.tempHp);
                    await this.plugin.updateCharacterFrontmatter(pc.sourcePath, {
                        "DnD_currentHealth": newHp
                    });
                    if (mirrored) {
                        await this.plugin.saveSettings();
                        window.dispatchEvent(new CustomEvent("dnd-dm-initiative-updated", {
                            detail: { sourceWidget: this, isCustomNoteState: false }
                        }));
                    }
                };

                // Vitals Strip (AC, Speed, Initiative, Exhaustion)
                const vitalsGrid = card.createDiv({ cls: "dnd-party-vitals-grid" });
                const addVitalBox = (label: string, val: string) => {
                    const box = vitalsGrid.createDiv({ cls: "dnd-party-vital-box" });
                    box.createEl("div", { text: label, cls: "dnd-party-vital-label" });
                    box.createEl("div", { text: val, cls: "dnd-party-vital-val" });
                };
                addVitalBox("AC", String(pc.ac));
                addVitalBox("Speed", `${pc.speed} ft.`);
                addVitalBox("Init", formatSignedNumber(pc.initBonus));
                addVitalBox("Exhaust", `${pc.exhaustion}/6`);

                // Passive Senses Row
                const sensesRow = card.createDiv({ cls: "dnd-party-senses-row" });
                const addSensePill = (label: string, val: number) => {
                    const pill = sensesRow.createDiv({ cls: "dnd-party-sense-pill" });
                    pill.createEl("span", { text: label, cls: "dnd-party-sense-label" });
                    pill.createEl("strong", { text: String(val), cls: "dnd-party-sense-val" });
                };
                addSensePill("Pass. Perc", pc.passivePerception);
                addSensePill("Pass. Inv", pc.passiveInvestigation);
                addSensePill("Pass. Ins", pc.passiveInsight);

                // 6 Ability Modifiers & Saving Throw Proficiency Strip
                const abilRow = card.createDiv({ cls: "dnd-party-abilities-strip" });
                for (const abKey of ALL_ABILITIES) {
                    const score = pc.abilities[abKey] ?? 10;
                    const mod = abilityModFromScore(score);
                    const isSaveProf = pc.savingThrows.includes(abKey);
                    const cell = abilRow.createDiv({
                        cls: `dnd-party-ability-cell ${isSaveProf ? "is-save-proficient" : ""}`.trim(),
                        attr: { title: `${abKey.toUpperCase()}: ${score} (${formatSignedNumber(mod)})${isSaveProf ? " • Saving Throw Proficient" : ""}` }
                    });
                    cell.createEl("div", {
                        text: `${abilityShort[abKey]}${isSaveProf ? "★" : ""}`,
                        cls: "dnd-party-ability-lbl"
                    });
                    cell.createEl("div", {
                        text: formatSignedNumber(mod),
                        cls: "dnd-party-ability-mod"
                    });
                }

                // Languages & Tools Footer
                if (pc.languages.length > 0 || pc.toolProficiencies.length > 0) {
                    const metaFooter = card.createDiv({ cls: "dnd-party-card-footer" });
                    if (pc.languages.length > 0) {
                        metaFooter.createEl("div", {
                            text: `Languages: ${pc.languages.join(", ")}`,
                            cls: "dnd-party-footer-line"
                        });
                    }
                    if (pc.toolProficiencies.length > 0) {
                        metaFooter.createEl("div", {
                            text: `Tools: ${pc.toolProficiencies.join(", ")}`,
                            cls: "dnd-party-footer-line"
                        });
                    }
                }
            }
        };

        if (folderInputRef) {
            const inputEl = folderInputRef;
            const commitFolderPath = async (rerenderBody: boolean) => {
                this.partySaveTimer = this.clearTimer(this.partySaveTimer);
                if (this.isWidgetUnloaded) return;
                this.plugin.settings.partyFolderPath = inputEl.value.trim();
                await this.plugin.saveSettings();
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("dnd-dm-party-folder-updated", { detail: { sourceWidget: this } }));
                }
                if (rerenderBody) await renderPartyContent();
            };

            inputEl.oninput = () => {
                this.plugin.settings.partyFolderPath = inputEl.value.trim();
                this.partySearchTimer = this.clearTimer(this.partySearchTimer);
                this.partySearchTimer = window.setTimeout(() => {
                    this.partySearchTimer = null;
                    void renderPartyContent();
                }, 120);
                this.partySaveTimer = this.clearTimer(this.partySaveTimer);
                this.partySaveTimer = window.setTimeout(() => {
                    this.partySaveTimer = null;
                    void commitFolderPath(false);
                }, 350);
            };
            inputEl.onchange = () => { void commitFolderPath(true); };
            inputEl.onkeydown = (evt: KeyboardEvent) => {
                if (evt.key === "Enter") {
                    evt.preventDefault();
                    void commitFolderPath(true);
                }
            };
        }

        this.activePartyRefreshHook = async () => {
            if (folderInputRef && document.activeElement !== folderInputRef) {
                folderInputRef.value = this.plugin.settings.partyFolderPath || "";
            }
            await renderPartyContent();
        };

        await renderPartyContent();
    }

    // ========================================================================
    // --- TAB 5: MONSTERS & STATBLOCKS (The DM Compendium & Vault Statblocks) ---
    // ========================================================================

    private async ensureMonstersLoaded(forceReload: boolean = false): Promise<void> {
        if (this.monstersLoaded && !forceReload) return;
        const res = await discoverExternalMonsters(this.app, forceReload);
        this.discoveredMonsters = res.monsters;
        this.monstersMeta = res;
        this.monstersLoaded = true;
    }

    private async renderMonstersTab(tabToken: number): Promise<void> {
        await this.ensureMonstersLoaded();
        if (this.isStaleTabRender(tabToken)) return;

        const root = this.bodyContainer.createDiv({ cls: "dnd-monsters-root" });

        // Integration Status Banner (The DM Compendium)
        const statusBanner = root.createDiv({ cls: "dnd-monsters-status-banner" });
        const badgesLeft = statusBanner.createDiv({ cls: "dnd-monsters-status-badges" });

        badgesLeft.createEl("span", {
            text: this.monstersMeta.hasDmCompendium
                ? `The DM Compendium: Connected (${this.monstersMeta.dmCompendiumCount} Statblocks)`
                : "The DM Compendium: Not Detected (Using Built-in Presets)",
            cls: `dnd-level-badge ${this.monstersMeta.hasDmCompendium ? "dnd-badge-connected" : ""}`.trim()
        });
        if (this.monstersMeta.availableSources.length > 0) {
            badgesLeft.createEl("span", {
                text: `Sources: ${this.monstersMeta.availableSources.map(s => s.short).join(", ")}`,
                cls: "dnd-level-badge"
            });
        }
        if (this.monstersMeta.vaultStatblockCount > 0) {
            badgesLeft.createEl("span", {
                text: `Vault Statblocks: ${this.monstersMeta.vaultStatblockCount}`,
                cls: "dnd-level-badge"
            });
        }

        const bannerBtns = statusBanner.createDiv({ cls: "dnd-monsters-status-actions" });
        if (this.monstersMeta.hasDmCompendium) {
            const refreshDbBtn = bannerBtns.createEl("button", {
                text: "Sync DM Compendium DB",
                cls: "dnd-dm-small-btn",
                attr: { title: "Refresh The DM Compendium's cached bestiary from your enabled sources" }
            });
            refreshDbBtn.onclick = async () => {
                const tdcPlugin = (this.app as any).plugins?.plugins?.["the-dm-compendium"];
                if (tdcPlugin && typeof tdcPlugin.refreshCompendiumDatabase === "function") {
                    await tdcPlugin.refreshCompendiumDatabase(true);
                }
                clearDiscoveredMonstersCache();
                this.monstersLoaded = false;
                await this.renderActiveTab();
            };

            const tdcBtn = bannerBtns.createEl("button", {
                text: "Launch DM Compendium Search",
                cls: "dnd-dm-small-btn mod-cta",
                attr: { title: "Trigger The DM Compendium's native search modal" }
            });
            tdcBtn.onclick = () => {
                const cmds = (this.app as any).commands;
                const executed = cmds?.executeCommandById?.("the-dm-compendium:insert-from-compendium")
                    || cmds?.executeCommandById?.("the-dm-compendium:open-compendium");
                if (!executed) {
                    new Notice("Open a Markdown note in Editing view to insert directly from The DM Compendium.");
                }
            };
        }

        const rescanBtn = bannerBtns.createEl("button", {
            text: "Reload Statblocks",
            cls: "dnd-dm-small-btn"
        });
        rescanBtn.onclick = async () => {
            clearDiscoveredMonstersCache();
            this.monstersLoaded = false;
            await this.renderActiveTab();
            new Notice(`Loaded ${this.discoveredMonsters.length} creature statblocks!`);
        };

        // Search & Filter Controls
        const controls = root.createDiv({ cls: "dnd-compendium-controls" });
        const searchRow = controls.createDiv({ cls: "dnd-compendium-search-row" });

        const searchInput = searchRow.createEl("input", {
            type: "text",
            placeholder: `Search ${this.discoveredMonsters.length} creatures by name, type (Undead, Dragon, Fiend...), CR, or source book...`,
            value: this.monsterQuery,
            cls: "dnd-modal-form-input dnd-compendium-search-input"
        });

        const sourceSelect = searchRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        sourceSelect.createEl("option", { text: `All Sources (${this.discoveredMonsters.length})`, value: "all" });
        for (const src of this.monstersMeta.availableSources) {
            sourceSelect.createEl("option", {
                text: `${src.short} — ${src.full} (${src.count})`,
                value: `source::${src.code}`
            });
        }
        if (this.monstersMeta.vaultStatblockCount > 0) {
            sourceSelect.createEl("option", {
                text: `Vault Note Statblocks (${this.monstersMeta.vaultStatblockCount})`,
                value: "plugin::vault-note"
            });
        }
        sourceSelect.value = this.monsterSourceFilter;

        const allCrs = Array.from(new Set(this.discoveredMonsters.map(m => m.cr).filter(Boolean)))
            .sort((a, b) => parseCrNumericValue(a) - parseCrNumericValue(b));
        const crSelect = searchRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        crSelect.createEl("option", { text: "All CRs", value: "all" });
        for (const cr of allCrs) {
            crSelect.createEl("option", { text: `CR ${cr}`, value: cr });
        }
        crSelect.value = this.monsterCrFilter;

        // Split Grid (or 2/3 & 1/3 Resizable Vertical Split in Sidebar)
        const { listPane, previewPane, setPreviewActive } = this.createMasterDetailSplitLayout(root, [statusBanner, controls]);

        const renderMonsterPreview = async (monster: DiscoveredMonster | null) => {
            const pToken = ++this.monsterPreviewToken;
            if (pToken !== this.monsterPreviewToken || this.isStaleTabRender(tabToken)) return;

            previewPane.empty();
            setPreviewActive(Boolean(monster));
            if (!monster) {
                previewPane.createEl("p", {
                    text: "Select a creature to inspect its statblock, send it to the Initiative Tracker, or insert a ```statblock block into your active note.",
                    cls: "dnd-modal-preview-empty"
                });
                return;
            }

            // Action Toolbar
            const toolbar = previewPane.createDiv({ cls: "dnd-compendium-preview-toolbar dnd-monster-toolbar" });
            const spawnGroup = toolbar.createDiv({ cls: "dnd-monster-spawn-group" });
            const qtyInput = spawnGroup.createEl("input", {
                type: "number",
                value: "1",
                cls: "dnd-modal-form-input dnd-init-qty-input",
                attr: { min: "1", max: "20", title: "Quantity to add to Initiative" }
            });
            const addInitBtn = spawnGroup.createEl("button", {
                text: "Add to Initiative",
                cls: "dnd-dm-small-btn mod-cta"
            });
            addInitBtn.onclick = async () => {
                const qty = Math.max(1, Math.min(20, Math.round(Number(qtyInput.value) || 1)));
                this.spawnMonsterIntoInitiative(monster, qty);
                await this.saveInitiativeState();
                new Notice(`Rolled Initiative and added ${qty}x ${monster.name} (${monster.sourceShort}) to the Initiative Tracker!`);
            };

            const rightActions = toolbar.createDiv({ cls: "dnd-modal-preview-badges" });
            const insertBtn = rightActions.createEl("button", {
                text: "Insert statblock in Note",
                cls: "dnd-dm-small-btn"
            });
            insertBtn.onclick = () => {
                const yamlBlock = "```statblock\n" + buildStatblockYaml(monster) + "\n```\n";
                const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (mdView && mdView.editor && mdView.getMode() === "source") {
                    mdView.editor.replaceSelection(yamlBlock);
                    new Notice(`Inserted "${monster.name} (${monster.sourceShort})" statblock into ${mdView.file?.basename || "active note"}!`);
                } else {
                    const reason = mdView && mdView.getMode() !== "source"
                        ? "active note is in Reading view; switch to Editing view to insert directly"
                        : "open a note in Editing view to insert directly";
                    void copyTextToClipboard(yamlBlock, `Copied "${monster.name}" statblock code block to clipboard (${reason}).`);
                }
            };

            if (this.hostMode === "sidebar") {
                const closeBtn = rightActions.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Close preview" }
                });
                closeBtn.onclick = async () => {
                    this.selectedMonsterId = null;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    await renderMonsterPreview(null);
                };
            }

            const statblockWrap = previewPane.createDiv({ cls: "dnd-monster-preview-statblock" });
            await renderStatblockWithFallback(this.app, this.plugin, monster, statblockWrap, this.sourcePath, this.renderChild);
        };

        const updateMonsterList = async () => {
            if (this.isStaleTabRender(tabToken)) return;

            const q = this.monsterQuery.trim().toLowerCase();
            const filtered = this.discoveredMonsters.filter(m => {
                if (this.monsterSourceFilter.startsWith("source::")) {
                    const targetCode = this.monsterSourceFilter.slice("source::".length);
                    if (m.sourceCode !== targetCode) return false;
                } else if (this.monsterSourceFilter.startsWith("plugin::")) {
                    const targetPlugin = this.monsterSourceFilter.slice("plugin::".length);
                    if (m.sourcePlugin !== targetPlugin) return false;
                }
                if (this.monsterCrFilter !== "all" && m.cr !== this.monsterCrFilter) return false;
                if (q) {
                    const hay = `${m.name} ${m.type} ${m.subtype || ""} cr ${m.cr} ${m.sourceShort} ${m.sourceCode} ${m.sourceFull}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });

            listPane.empty();
            listPane.createEl("div", {
                text: `${filtered.length} statblock${filtered.length === 1 ? "" : "s"} matching filters`,
                cls: "dnd-spell-count-banner"
            });

            if (filtered.length === 0) {
                listPane.createEl("p", {
                    text: "No creatures match your filters.",
                    cls: "dnd-modal-empty-text"
                });
                await renderMonsterPreview(null);
                return;
            }

            const displayList = filtered.slice(0, 250);
            if (this.hostMode === "sidebar") {
                if (this.selectedMonsterId && !displayList.some(m => m.id === this.selectedMonsterId)) {
                    this.selectedMonsterId = null;
                }
            } else if (!this.selectedMonsterId || !displayList.some(m => m.id === this.selectedMonsterId)) {
                this.selectedMonsterId = displayList[0].id;
            }

            for (const mon of displayList) {
                const isSelected = mon.id === this.selectedMonsterId;
                const row = listPane.createDiv({
                    cls: `dnd-modal-list-row dnd-compendium-row is-clickable ${isSelected ? "is-active" : ""}`.trim()
                });
                const left = row.createDiv({ cls: "dnd-modal-row-left" });
                left.createEl("span", { text: mon.name, cls: "dnd-modal-row-name" });
                left.createEl("span", {
                    text: `${mon.size} ${mon.type} • AC ${mon.ac} • HP ${mon.hp}`,
                    cls: "dnd-init-sub-hint"
                });

                const rightBadges = row.createDiv({ cls: "dnd-modal-row-badges" });
                if (mon.sourceShort) {
                    rightBadges.createEl("span", {
                        text: mon.sourceShort,
                        cls: "dnd-level-badge dnd-modal-badge-sm",
                        attr: { title: mon.sourceFull }
                    });
                }
                rightBadges.createEl("span", {
                    text: `CR ${mon.cr}`,
                    cls: "dnd-level-badge dnd-modal-badge-sm"
                });

                const selectMonster = async () => {
                    if (this.hostMode === "sidebar" && this.selectedMonsterId === mon.id) {
                        this.selectedMonsterId = null;
                        row.removeClass("is-active");
                        await renderMonsterPreview(null);
                        return;
                    }
                    this.selectedMonsterId = mon.id;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    row.addClass("is-active");
                    await renderMonsterPreview(mon);
                };
                row.onclick = () => { void selectMonster(); };
                makeKeyboardClickable(row, () => { void selectMonster(); });
            }

            if (filtered.length > 250) {
                listPane.createEl("div", {
                    text: `Showing top 250 of ${filtered.length} matches. Use the search bar or source filter above to narrow results.`,
                    cls: "dnd-modal-empty-text"
                });
            }

            const activeMon = this.selectedMonsterId
                ? (displayList.find(m => m.id === this.selectedMonsterId) || null)
                : (this.hostMode === "sidebar" ? null : displayList[0]);
            await renderMonsterPreview(activeMon);
        };

        searchInput.oninput = () => {
            this.monsterQuery = searchInput.value;
            this.monsterSearchTimer = this.clearTimer(this.monsterSearchTimer);
            this.monsterSearchTimer = window.setTimeout(() => {
                this.monsterSearchTimer = null;
                void updateMonsterList();
            }, 120);
        };
        sourceSelect.onchange = () => {
            this.monsterSourceFilter = sourceSelect.value;
            void updateMonsterList();
        };
        crSelect.onchange = () => {
            this.monsterCrFilter = crSelect.value;
            void updateMonsterList();
        };

        await updateMonsterList();
    }
}

// ============================================================================
// --- DM TOOLS MODAL & DOCKABLE SIDEBAR VIEW ---
// ============================================================================

export class DMToolsModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    initialTab: DMToolsTabId;
    renderChild!: MarkdownRenderChild;
    widget!: DMToolsWidget;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, initialTab: DMToolsTabId = "compendium") {
        super(app);
        this.plugin = plugin;
        this.initialTab = initialTab;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-dm-modal", "dnd-spellbook-modal");
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        const activeFile = this.app.workspace.getActiveFile();
        this.widget = new DMToolsWidget({
            app: this.app,
            plugin: this.plugin,
            containerEl: contentEl,
            renderChild: this.renderChild,
            hostMode: "modal",
            initialTab: this.initialTab,
            sourcePath: activeFile?.path || "",
            onRequestSwitchHost: async () => {
                const currentTab = this.widget.activeTab;
                this.close();
                await this.plugin.activateDMToolsSidebar(currentTab);
            }
        });

        await this.widget.render();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

export class DMToolsSidebarView extends ItemView {
    plugin: DnDCharacterSheetHelperPlugin;
    activeTab: DMToolsTabId = "compendium";
    renderChild!: MarkdownRenderChild;
    widget?: DMToolsWidget;

    constructor(leaf: WorkspaceLeaf, plugin: DnDCharacterSheetHelperPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DM_TOOLS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "DnD DM Tools";
    }

    getIcon(): string {
        return DM_RIBBON_ICON_SVG ? "csh-dm-ribbon" : "shield";
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("dnd-dm-sidebar-view");

        this.renderChild = new MarkdownRenderChild(container);
        this.renderChild.load();

        const activeFile = this.app.workspace.getActiveFile();
        this.widget = new DMToolsWidget({
            app: this.app,
            plugin: this.plugin,
            containerEl: container,
            renderChild: this.renderChild,
            hostMode: "sidebar",
            initialTab: this.activeTab,
            sourcePath: activeFile?.path || "",
            onRequestSwitchHost: () => {
                const currentTab = this.widget?.activeTab || this.activeTab;
                new DMToolsModal(this.app, this.plugin, currentTab).open();
            }
        });

        await this.widget.render();
    }

    async setActiveTab(tab: DMToolsTabId) {
        this.activeTab = tab;
        if (this.widget) {
            await this.widget.setTab(tab);
        }
    }

    async onClose() {
        if (this.renderChild) this.renderChild.unload();
    }
}

// ============================================================================
// --- MARKDOWN CODE BLOCK PROCESSORS: ```dnd-initiative & ```dnd-party ---
// ============================================================================

export async function processDnDInitiativeBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    el.empty();
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);

    let parsed: Record<string, any> = {};
    try {
        parsed = parseBlockYaml(source);
    } catch {
        parsed = {};
    }

    const useNoteFrontmatterState = String(parsed.state || "").toLowerCase() === "note";
    let customState: InitiativeState | undefined;
    let onSaveCustom: ((st: InitiativeState) => Promise<void>) | undefined;
    let onReloadCustom: (() => InitiativeState) | undefined;

    if (useNoteFrontmatterState && ctx.sourcePath) {
        customState = readNoteInitiativeState(plugin, ctx.sourcePath);
        onSaveCustom = async (st: InitiativeState) => {
            await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                "DnD_initiativeState": JSON.stringify(st)
            });
        };
        onReloadCustom = () => readNoteInitiativeState(plugin, ctx.sourcePath);
    }

    const filterFolder = typeof parsed.folder === "string" ? parsed.folder.trim() : undefined;
    const filterPlayers = Array.isArray(parsed.players)
        ? parsed.players.map((p: any) => String(p))
        : (typeof parsed.players === "string" ? parseStringArray(parsed.players) : undefined);

    const widget = new DMToolsWidget({
        app: plugin.app,
        plugin,
        containerEl: el,
        renderChild: child,
        hostMode: "embed-initiative",
        initialTab: "initiative",
        sourcePath: ctx.sourcePath,
        embedFilterFolder: filterFolder,
        embedFilterPlayers: filterPlayers,
        customInitiativeState: customState,
        onSaveCustomInitiativeState: onSaveCustom,
        onReloadCustomInitiativeState: onReloadCustom
    });

    await widget.render();
}

export async function processDnDPartyBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    el.empty();
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);

    let parsed: Record<string, any> = {};
    try {
        parsed = parseBlockYaml(source);
    } catch {
        parsed = {};
    }

    const filterFolder = typeof parsed.folder === "string" ? parsed.folder.trim() : undefined;
    const filterPlayers = Array.isArray(parsed.players)
        ? parsed.players.map((p: any) => String(p))
        : (typeof parsed.players === "string" ? parseStringArray(parsed.players) : undefined);

    const widget = new DMToolsWidget({
        app: plugin.app,
        plugin,
        containerEl: el,
        renderChild: child,
        hostMode: "embed-party",
        initialTab: "party",
        sourcePath: ctx.sourcePath,
        embedFilterFolder: filterFolder,
        embedFilterPlayers: filterPlayers
    });

    await widget.render();
}
