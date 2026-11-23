import { App, MarkdownRenderChild, Modal, Notice } from 'obsidian';
import { getBackgroundData, getItemData, getWeaponMasteryDescription } from '../../data';
import { itemsMap } from '../../registry';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    WeaponMasteryState,
    extractAbilityScores,
    formatItemCost,
    hasItemCost,
    parseJsonArrayProp,
    parseWeaponMasteryState,
    serializeWeaponMasteryState
} from '../helpers';
import { NoteModal } from './rest-note-modals';
import { renderWeaponAndArmorLoadoutControls } from './shared-controls';

export class EquipItemsModal extends Modal {
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
            this.plugin.settings,
            frontmatter["DnD_race"],
            frontmatter["DnD_raceLineage"]
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
        const catalog = await this.plugin.loadRulebookEquipmentCatalog();
        this.availableWeapons = catalog.weapons;
        this.availableArmors = catalog.armors;
    }

    renderForm() {
        this.formContainer.empty();

        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === "Enter") this.equipItems();
        };

        renderWeaponAndArmorLoadoutControls({
            parentEl: this.formContainer,
            availableWeapons: this.availableWeapons,
            availableArmors: this.availableArmors,
            availableMasterySlots: this.weaponMasteryState.available,
            getMasteredWeapons: () => this.weaponMasteryState.mastered,
            setMasteredWeapons: (list) => { this.weaponMasteryState.mastered = list; },
            getWeaponName: () => this.weaponName,
            setWeaponName: (val) => { this.weaponName = val; },
            getWeaponDamage: () => this.weaponDamage,
            setWeaponDamage: (val) => { this.weaponDamage = val; },
            getIsWeaponCustom: () => this.isWeaponCustom,
            setIsWeaponCustom: (val) => { this.isWeaponCustom = val; },
            getArmorName: () => this.armorName,
            setArmorName: (val) => { this.armorName = val; },
            getArmorAc: () => this.armorAc,
            setArmorAc: (val) => { this.armorAc = String(val ?? ""); },
            getIsArmorCustom: () => this.isArmorCustom,
            setIsArmorCustom: (val) => { this.isArmorCustom = val; },
            defaultArmorAcOnClear: "10",
            coerceMatchedArmorAc: (acStr) => acStr,
            onViewMasteries: () => new NoteModal(this.app, this.plugin, "weapon-masteries").open(),
            onModeToggleReRender: () => this.renderForm(),
            onInputKeyUp: handleEnter
        });
    }

    onClose() {
        this.contentEl.empty();
    }

    async equipItems() {
        const updates: Record<string, any> = {};
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter = fileCache?.frontmatter || {};

        const statsRecord = extractAbilityScores(frontmatter);
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
            const subclassVal = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
            const armorStats = await this.plugin.resolveEquippedArmorStats({
                armorNameInput: this.armorName,
                manualAcInput: this.armorAc,
                isCustomMode: this.isArmorCustom,
                classInput: dndClass,
                classLevelsInput: classLevels,
                totalLevel: level,
                statsRecord,
                subclassInput: subclassVal,
                fetchOptions: this.plugin.settings
            });
            updates["DnD_armor"] = armorStats.resolvedArmorName;
            updates["DnD_armorAc"] = armorStats.armorAc;
            updates["DnD_armorAcBonus"] = armorStats.armorAcBonus;

            // Recalculate Speed Modifier in case Unarmored Movement, Fast Movement, or Roving is affected by armor
            const bgFeatForSpeed = await this.plugin.resolveBackgroundFeatId(
                frontmatter["DnD_background"],
                frontmatter["DnD_backgroundFeat"],
                this.plugin.settings
            );
            const speedCalc = await this.plugin.resolveCharacterSpeedModifiers(
                dndClass,
                classLevels,
                level,
                frontmatter["DnD_extraFeats"],
                bgFeatForSpeed,
                updates["DnD_armor"] || this.armorName,
                frontmatter["DnD_speed"],
                frontmatter["DnD_customSpeedMod"],
                subclassVal,
                this.plugin.settings,
                frontmatter["DnD_race"],
                frontmatter["DnD_raceLineage"]
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
export class ItemInfoModal extends Modal {
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
export class InventoryModal extends Modal {
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
        return parseJsonArrayProp(raw);
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
            formatItemCost(e[4]),
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

        const hiBtn = footerDiv.createEl("button", {
            text: this.plugin.activeHeroicInspiration.has(this.sourcePath)
                ? "✨ Heroic Inspiration: ON"
                : "Grant Heroic Inspiration",
            cls: this.plugin.activeHeroicInspiration.has(this.sourcePath) ? "is-active" : ""
        });
        hiBtn.onclick = () => {
            const nextState = !this.plugin.activeHeroicInspiration.has(this.sourcePath);
            this.plugin.setHeroicInspiration(this.sourcePath, nextState);
            hiBtn.setText(nextState ? "✨ Heroic Inspiration: ON" : "Grant Heroic Inspiration");
            hiBtn.classList.toggle("is-active", nextState);
            new Notice(nextState ? "Heroic Inspiration added to Inventory!" : "Heroic Inspiration removed.");
        };

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
        this.availableRulebookItems = await this.plugin.loadMergedRouterMap("items.json", itemsMap);
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
