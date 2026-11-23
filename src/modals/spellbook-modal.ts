import { App, MarkdownRenderChild, Modal, Notice, TFile } from 'obsidian';
import {
    getClassData,
    getRaceData,
    getSpellData,
    getSpellsPoolData,
    getSubclassData
} from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    formatPoolDisplayName,
    formatSpellTuples,
    parseSpellTuples,
    parseStringArray
} from '../helpers';

// --- SPELLBOOK MODAL ---
export class SpellbookModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;

    dndClass: string = "";
    characterLevel: number = 1;
    spellPoolNames: string[] = [];
    activePoolName: string = "";
    loadedPools: Record<string, Record<string, Record<string, string>>> = {};

    // Progression limits from class JSON ("spellcasting" or "pactMagic")
    maxCantrips: number = 0;
    maxPreparedSpells: number = 0;

    // Active router data: { "0": { "mage-hand": "Mage Hand" }, "1": { "magic-missile": "Magic Missile" } }
    routerData: Record<string, Record<string, string>> = {};

    // Innate racial spells excluded from class preparation caps (5.5e Always Prepared)
    innateRacialSlugs: Set<string> = new Set();
    replaceableCantripPools: string[] = [];
    defaultReplaceableCantrips: Set<string> = new Set();

    // Internal state mapped by string level ("0", "1", ..., "9") -> array of spell keys
    knownSpellsByLevel: Record<string, string[]> = {};
    preparedSpellsByLevel: Record<string, string[]> = {};

    // UI Elements for live re-rendering
    activeLevelTab: string = "0";
    poolBarContainer!: HTMLElement;
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
        this.knownSpellsByLevel = parseSpellTuples(frontmatter["DnD_spells"]);
        this.preparedSpellsByLevel = parseSpellTuples(frontmatter["DnD_preparedSpells"]);

        // 2. Fetch Class/Subclass Data (for limits & fallback pool) + Race Data (for innate spell exclusions & fallback pools)
        let subclassData: any = null;
        let subclassName = "";
        const subclassVal = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
        subclassName = (Array.isArray(subclassVal) ? subclassVal[0] : subclassVal) || "";

        let classSpellsPoolFallback: string | null = null;
        if (this.dndClass) {
            const classData = await getClassData(this.app, this.plugin.settings, this.dndClass);
            if (classData && subclassName) {
                const grantedSubclassFile = this.plugin.findGrantedSubclass(classData, this.characterLevel);
                if (grantedSubclassFile) {
                    subclassData = await getSubclassData(this.app, this.plugin.settings, grantedSubclassFile, subclassName);
                }
            }

            const spellMeta = this.plugin.resolveSpellcastingMetadata(classData, subclassData, this.characterLevel);
            classSpellsPoolFallback = spellMeta.spellsPool;

            const lvlStr = this.characterLevel.toString();
            const castingTable = spellMeta.spellcastingTable?.[lvlStr];
            if (castingTable) {
                this.maxCantrips = Number(castingTable.cantrips) || 0;
                this.maxPreparedSpells = Number(castingTable.preparedSpells) || 0;
            }
        }

        const raceData = frontmatter["DnD_race"]
            ? await getRaceData(this.app, this.plugin.settings, frontmatter["DnD_race"])
            : null;
        const raceMeta = await this.plugin.resolveRaceSpellcastingMetadata(
            raceData,
            frontmatter["DnD_raceLineage"],
            this.characterLevel
        );
        this.innateRacialSlugs = raceMeta.innateSlugs;
        this.replaceableCantripPools = raceMeta.replaceableCantripPools;
        this.defaultReplaceableCantrips = raceMeta.defaultReplaceableCantrips;

        // 3. Resolve Spell Pools (DnD_spellPools frontmatter -> inline dnd-spells block -> Class/Race fallback)
        let candidatePools = parseStringArray(frontmatter["DnD_spellPools"], true);
        if (candidatePools.length === 0) {
            const activeFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
            if (activeFile instanceof TFile) {
                const fileText = await this.app.vault.cachedRead(activeFile);
                candidatePools = this.plugin.extractSpellPoolsFromContent(fileText, frontmatter);
            }
        }
        if (candidatePools.length === 0) {
            candidatePools = parseStringArray([
                ...(classSpellsPoolFallback ? [classSpellsPoolFallback] : []),
                ...raceMeta.spellsPools
            ], true);
        }

        this.loadedPools = {};
        this.spellPoolNames = [];
        for (const poolKey of candidatePools) {
            const loaded = await getSpellsPoolData(this.app, this.plugin.settings, poolKey);
            if (loaded && typeof loaded === "object") {
                this.loadedPools[poolKey] = loaded;
                this.spellPoolNames.push(poolKey);
            }
        }

        const hasAnyExistingSpells = Object.values(this.knownSpellsByLevel).some(arr => arr.length > 0)
            || Object.values(this.preparedSpellsByLevel).some(arr => arr.length > 0);

        if (this.spellPoolNames.length === 0 && !hasAnyExistingSpells) {
            contentEl.createEl("p", {
                text: `No spell pools found. Assign DnD_spellPools in frontmatter (e.g. ["wizard-spells", "elf-cantrips"]) or pick a spellcasting class/race to enable the Spellbook.`,
                cls: "dnd-error-text"
            });
            return;
        }

        this.activePoolName = this.spellPoolNames[0] || "";
        this.routerData = this.activePoolName ? this.loadedPools[this.activePoolName] : {};

        // Ensure default active tab exists across active pool or existing spells
        const availableLevels = this.getAvailableLevels();
        if (availableLevels.length > 0 && !availableLevels.includes(this.activeLevelTab)) {
            this.activeLevelTab = availableLevels[0];
        }

        // 4. Build Layout Containers
        this.poolBarContainer = contentEl.createDiv({ cls: "dnd-spellbook-pool-bar" });
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
        this.renderPoolSelector();
        this.renderTracker();
        this.renderLevelTabs();
        this.renderSpellList();
    }

    getAvailableLevels(): string[] {
        const lvlSet = new Set<string>(Object.keys(this.routerData || {}));
        for (const [lvl, list] of Object.entries(this.knownSpellsByLevel)) {
            if (Array.isArray(list) && list.length > 0) lvlSet.add(lvl);
        }
        for (const [lvl, list] of Object.entries(this.preparedSpellsByLevel)) {
            if (Array.isArray(list) && list.length > 0) lvlSet.add(lvl);
        }
        return Array.from(lvlSet).sort((a, b) => Number(a) - Number(b));
    }

    findSpellDisplayName(lvl: string, spellKey: string): string {
        if (this.routerData?.[lvl]?.[spellKey]) return this.routerData[lvl][spellKey];
        for (const poolObj of Object.values(this.loadedPools)) {
            if (poolObj?.[lvl]?.[spellKey]) return poolObj[lvl][spellKey];
        }
        return spellKey.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    renderPoolSelector() {
        this.poolBarContainer.empty();
        if (this.spellPoolNames.length === 0) return;

        this.poolBarContainer.createEl("label", {
            text: "Spell Pool:",
            cls: "dnd-spellbook-pool-label"
        });
        const selectEl = this.poolBarContainer.createEl("select", {
            cls: "dnd-modal-form-input dnd-spellbook-pool-select"
        });
        for (const poolKey of this.spellPoolNames) {
            selectEl.createEl("option", {
                text: formatPoolDisplayName(poolKey),
                value: poolKey
            });
        }
        selectEl.value = this.activePoolName;
        selectEl.onchange = () => {
            this.activePoolName = selectEl.value;
            this.routerData = this.loadedPools[this.activePoolName] || {};
            const availableLevels = this.getAvailableLevels();
            if (availableLevels.length > 0 && !availableLevels.includes(this.activeLevelTab)) {
                this.activeLevelTab = availableLevels[0];
            }
            this.renderLevelTabs();
            this.renderSpellList();
            this.renderEmptyPreview();
        };
    }

    // Counts prepared cantrips/spells toward class limits, excluding Always-Prepared racial spells
    getPreparedCounts(): {
        cantrips: number;
        leveled: number;
        innateCantrips: number;
        innateLeveled: number;
        excludedKeys: Set<string>;
    } {
        const excludedKeys = new Set<string>();
        const prepCantrips = this.preparedSpellsByLevel["0"] || [];

        for (const slug of this.innateRacialSlugs) {
            excludedKeys.add(slug);
        }

        // If a replaceable racial cantrip (e.g. High Elf Prestidigitation) was swapped out, exempt 1 replacement cantrip from that pool
        const hasDefaultCantripPrepared = prepCantrips.some(s => this.defaultReplaceableCantrips.has(s));
        if (!hasDefaultCantripPrepared && this.defaultReplaceableCantrips.size > 0 && this.replaceableCantripPools.length > 0) {
            const primaryPoolCantrips = this.spellPoolNames.length > 1
                ? (this.loadedPools[this.spellPoolNames[0]]?.["0"] || {})
                : {};
            let candidateNonClass: string | null = null;
            let candidateAny: string | null = null;

            for (const slug of prepCantrips) {
                if (excludedKeys.has(slug)) continue;
                const inRacialPool = this.replaceableCantripPools.some(p => Boolean(this.loadedPools[p]?.["0"]?.[slug]));
                if (!inRacialPool) continue;
                if (!primaryPoolCantrips[slug] && !candidateNonClass) {
                    candidateNonClass = slug;
                }
                if (!candidateAny) candidateAny = slug;
            }
            const swappedSlug = candidateNonClass || candidateAny;
            if (swappedSlug) excludedKeys.add(swappedSlug);
        }

        let cantrips = 0;
        let innateCantrips = 0;
        for (const slug of prepCantrips) {
            if (excludedKeys.has(slug)) innateCantrips++;
            else cantrips++;
        }

        let leveled = 0;
        let innateLeveled = 0;
        for (const [lvl, list] of Object.entries(this.preparedSpellsByLevel)) {
            if (lvl === "0" || !Array.isArray(list)) continue;
            for (const slug of list) {
                if (excludedKeys.has(slug)) innateLeveled++;
                else leveled++;
            }
        }

        return { cantrips, leveled, innateCantrips, innateLeveled, excludedKeys };
    }

    renderTracker() {
        this.trackerContainer.empty();
        const { cantrips, leveled, innateCantrips, innateLeveled } = this.getPreparedCounts();

        const leftInfo = this.trackerContainer.createDiv();
        leftInfo.createEl("strong", {
            text: `${this.dndClass || "Character"} (Level ${this.characterLevel})`,
            cls: "dnd-modal-tracker-title"
        });

        const rightCounters = this.trackerContainer.createDiv({ cls: "dnd-modal-tracker-counters" });

        const baseCantripText = this.maxCantrips > 0 ? `${cantrips} / ${this.maxCantrips}` : `${cantrips}`;
        const cantripText = innateCantrips > 0 ? `${baseCantripText} (+${innateCantrips} innate)` : baseCantripText;
        const basePrepText = this.maxPreparedSpells > 0 ? `${leveled} / ${this.maxPreparedSpells}` : `${leveled}`;
        const prepText = innateLeveled > 0 ? `${basePrepText} (+${innateLeveled} innate)` : basePrepText;

        const cSpan = rightCounters.createEl("span", { cls: "dnd-modal-tracker-stat" });
        cSpan.createEl("strong", { text: "Cantrips Prepared: " });
        cSpan.createSpan({ text: cantripText });

        const pSpan = rightCounters.createEl("span", { cls: "dnd-modal-tracker-stat" });
        pSpan.createEl("strong", { text: "Spells Prepared: " });
        pSpan.createSpan({ text: prepText });
    }

    renderLevelTabs() {
        this.tabsContainer.empty();
        const availableLevels = this.getAvailableLevels();

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

    isSpellExemptFromPrepLimit(
        lvl: string,
        spellKey: string,
        counts: ReturnType<SpellbookModal["getPreparedCounts"]>
    ): boolean {
        if (this.innateRacialSlugs.has(spellKey)) return true;
        if (lvl === "0" && this.defaultReplaceableCantrips.size > 0 && counts.innateCantrips === 0) {
            return this.replaceableCantripPools.some(p => Boolean(this.loadedPools[p]?.["0"]?.[spellKey]));
        }
        return false;
    }

    renderSpellList() {
        this.listContainer.empty();

        const lvl = this.activeLevelTab;
        const levelPool = this.routerData?.[lvl] || {};
        const counts = this.getPreparedCounts();

        if (!this.knownSpellsByLevel[lvl]) this.knownSpellsByLevel[lvl] = [];
        if (!this.preparedSpellsByLevel[lvl]) this.preparedSpellsByLevel[lvl] = [];

        const knownList = this.knownSpellsByLevel[lvl];
        const preparedList = this.preparedSpellsByLevel[lvl];
        const poolEntries = Object.entries(levelPool);

        if (poolEntries.length > 0) {
            const addBar = this.listContainer.createDiv({ cls: "dnd-modal-add-bar" });

            const selectEl = addBar.createEl("select", { cls: "dnd-modal-add-select" });
            selectEl.createEl("option", { text: `-- Add ${lvl === "0" ? "Cantrip" : `Level ${lvl} Spell`} --`, value: "" });

            poolEntries
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
                this.renderTracker();
                this.renderSpellList();
                await this.renderSpellPreview(chosenKey, levelPool[chosenKey]);
            };
        } else if (this.activePoolName) {
            this.listContainer.createEl("p", {
                text: `${formatPoolDisplayName(this.activePoolName)} has no ${lvl === "0" ? "cantrips" : `level ${lvl} spells`} to add.`,
                cls: "dnd-modal-empty-text"
            });
        }

        if (knownList.length === 0) {
            this.listContainer.createEl("p", {
                text: `No ${lvl === "0" ? "cantrips" : `level ${lvl} spells`} in your Spellbook yet.`,
                cls: "dnd-modal-empty-text"
            });
            return;
        }

        for (const spellKey of knownList) {
            const displayName = this.findSpellDisplayName(lvl, spellKey);
            const isPrepared = preparedList.includes(spellKey);
            const isInnate = this.innateRacialSlugs.has(spellKey) || counts.excludedKeys.has(spellKey);

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
                const currentCounts = this.getPreparedCounts();
                const isExempt = this.isSpellExemptFromPrepLimit(lvl, spellKey, currentCounts);

                if (prepCheckbox.checked) {
                    if (!isExempt && lvl === "0" && this.maxCantrips > 0 && currentCounts.cantrips >= this.maxCantrips) {
                        prepCheckbox.checked = false;
                        new Notice(`Cantrip limit reached (${this.maxCantrips} max). Unprepare a cantrip first!`);
                        return;
                    }
                    if (!isExempt && lvl !== "0" && this.maxPreparedSpells > 0 && currentCounts.leveled >= this.maxPreparedSpells) {
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
            const badgesSpan = leftGroup.createSpan({ cls: "dnd-modal-row-badges" });
            if (isInnate) {
                badgesSpan.createEl("span", {
                    text: "Innate",
                    cls: "dnd-level-badge dnd-modal-badge-sm",
                    attr: { title: "Racial / Lineage Spell (Always Prepared)" }
                });
            }
            this.loadSpellJson(spellKey).then((spellData) => {
                if (!spellData || !badgesSpan.isConnected) return;
                if (spellData.concentration) {
                    badgesSpan.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
                }
                if (spellData.ritual) {
                    badgesSpan.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
                }
            });
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
                this.renderLevelTabs();
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
        if (spellData.classes) {
            const classesStr = Array.isArray(spellData.classes) ? spellData.classes.join(", ") : String(spellData.classes);
            if (classesStr.trim()) {
                metaDiv.createEl("div", { text: `Classes: ${classesStr}` });
            }
        }

        if (spellData.description) {
            const descDiv = this.previewContainer.createDiv({ cls: "dnd-modal-preview-desc" });
            await this.plugin.renderDndMarkdown(spellData.description, descDiv, this.sourcePath, this.renderChild);
        }
    }

    async saveSpellbook() {
        const formattedKnown = formatSpellTuples(this.knownSpellsByLevel);
        const formattedPrepared = formatSpellTuples(this.preparedSpellsByLevel);

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
