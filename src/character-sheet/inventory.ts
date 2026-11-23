import { MarkdownPostProcessorContext, MarkdownRenderChild, Notice } from 'obsidian';
import { getBackgroundData, getClassData, getItemData, getWeaponMasteryDescription } from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    createFrontmatterResolver,
    extractAbilityScores,
    extractFrontmatterKey,
    formatItemCost,
    hasItemCost,
    parseBlockYaml,
    parseJsonArrayProp,
    parseWeaponMasteryState
} from '../helpers';
import { ItemInfoModal } from '../modals/item-modals';

export async function processDnDInventoryBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
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
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid format in dnd-inventory block.", cls: "dnd-error" });
            el.empty();
            el.appendChild(wrapper);
            return;
        }

        const fileCache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        const resolveValue = createFrontmatterResolver(frontmatter);

        const sanitizeItem = (val: any) => {
            if (!val) return null;
            return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        };

        // 1. Resolve Core Variables strictly from the code block (with frontmatter fallbacks for dynamic Monk/Class calculations)
        const dndClass = resolveValue(blockData.class) ?? frontmatter["DnD_class"];
        const subclass = resolveValue(blockData.subclass ?? blockData.Subclass) ?? frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
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

        const statsRecord = extractAbilityScores(frontmatter, blockData, resolveValue);
        const attackStat = String(resolveValue(blockData.attackStat) ?? frontmatter["DnD_attackStat"] ?? "strength");

        const fetchOptions = {
            ...plugin.settings,
            edition: edition ? String(edition) : undefined
        };

        // 2. Calculate Base Granted Gold from Class & Background Starting Equipment
        let grantedGold = 0;
        if (dndClass && classEq) {
            const primaryClass = Array.isArray(dndClass) ? dndClass[0] : dndClass;
            const classData = await getClassData(plugin.app, fetchOptions, primaryClass);
            const eqObj = classData?.startingEquipment?.[classEq];
            if (eqObj?.gold) grantedGold += Number(eqObj.gold) || 0;
        }
        if (background && bgEq) {
            const bgData = await getBackgroundData(plugin.app, fetchOptions, background);
            const eqObj = bgData?.startingEquipment?.[bgEq];
            if (eqObj?.gold) grantedGold += Number(eqObj.gold) || 0;
        }

        // 3. Parse Inventory Arrays strictly from blockData variables
        const parseJsonArray = (raw: any): any[] => parseJsonArrayProp(raw, resolveValue);

        const starterFmKey = extractFrontmatterKey(blockData.starterEquipment, "DnD_starterEquipment");
        const invItemsFmKey = extractFrontmatterKey(blockData.inventoryItems, "DnD_inventoryItems");
        const customItemsFmKey = extractFrontmatterKey(blockData.customItems, "DnD_customItems");
        const wealthAddedFmKey = extractFrontmatterKey(blockData.wealthAdded, "DnD_wealthAdded");
        const wealthSpentFmKey = extractFrontmatterKey(blockData.wealthSpent, "DnD_wealthSpent");

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
                const data = await getItemData(plugin.app, fetchOptions, safeName);
                const isRecognizedType = data && data.type && String(data.type).toLowerCase().includes(expectedType.toLowerCase());

                let displayName = rawItemInput;
                let displayStat = manualStat ? String(manualStat) : "-";
                let displayDesc = "";
                let hasInfoDesc = false;

                if (isRecognizedType) {
                    displayName = data.name || rawItemInput;
                    displayStat = manualStat ? String(manualStat) : (expectedType === "Weapon" ? (data.damage || "-") : (data.ac || "-"));
                    displayDesc = data.description || "";
                    hasInfoDesc = Boolean(data.description && String(data.description).trim());

                    if (expectedType === "Weapon" && data.mastery) {
                        const masteryInfo = await getWeaponMasteryDescription(plugin.app, fetchOptions, data.mastery);
                        if (masteryInfo) {
                            hasInfoDesc = true;
                            const displaySlug = sanitizeItem(displayName) as string;
                            const isMastered = weaponMasteryState.mastered.includes(safeName) || (displaySlug ? weaponMasteryState.mastered.includes(displaySlug) : false);
                            if (isMastered) {
                                const masteryTag = `Mastery: [${masteryInfo.name}](note:weapon-masteries)`;
                                displayDesc = displayDesc ? `${displayDesc}, ${masteryTag}` : masteryTag;
                            }
                        }
                    }
                }

                // Dynamic calculation for "Unarmed Strike" (scalingDice + ability modifier) and "Unarmored Defense" (10 + class modifiers)
                if (expectedType === "Weapon" && (safeName === "unarmed-strike" || safeName === "unarmed-strikes")) {
                    displayStat = await plugin.resolveUnarmedStrikeDamage(dndClass, classLevels, level, statsRecord, attackStat, fetchOptions);
                } else if (expectedType === "Armor" && safeName === "unarmored-defense") {
                    const unarmoredCalc = await plugin.resolveUnarmoredDefense(dndClass, classLevels, level, statsRecord, fetchOptions, subclass);
                    displayStat = String(unarmoredCalc.totalAc);
                }

                const card = equipGrid.createDiv({ cls: "dnd-features-window dnd-equip-card" });

                if (isRecognizedType && hasInfoDesc) {
                    const infoBtn = card.createEl("button", {
                        cls: "dnd-inventory-icon-btn dnd-equip-card-info-btn",
                        attr: { title: "Item Details" }
                    });
                    setSvgIcon(infoBtn, "info");
                    infoBtn.onclick = (e) => {
                        e.stopPropagation();
                        new ItemInfoModal(plugin.app, plugin, data, ctx.sourcePath).open();
                    };
                }

                card.createDiv({ text: displayName.toUpperCase(), cls: "dnd-equip-card-title" });
                card.createDiv({ text: displayStat, cls: "dnd-equip-card-stat" });

                if (displayDesc) {
                    const noteDiv = card.createDiv({ cls: "dnd-equip-card-desc" });
                    await plugin.renderDndMarkdown(displayDesc, noteDiv, ctx.sourcePath, renderChild);
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
                    await plugin.updateWealthFrontmatter(ctx.sourcePath, wealthAddedFmKey, curr.idx, amt);
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
                    await plugin.updateWealthFrontmatter(ctx.sourcePath, wealthSpentFmKey, curr.idx, amt);
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

            const data = await getItemData(plugin.app, fetchOptions, itemId);
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

            const data = await getItemData(plugin.app, fetchOptions, itemId);
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
                    await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                        [starterFmKey]: JSON.stringify(rawStarter)
                    });
                } else if (item.sourceType === "rulebook" && Array.isArray(rawInvItems[item.arrayIndex])) {
                    rawInvItems[item.arrayIndex] = [
                        String(rawInvItems[item.arrayIndex][0]),
                        String(newQty),
                        String(rawInvItems[item.arrayIndex][2] ?? "true")
                    ];
                    await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                        [invItemsFmKey]: JSON.stringify(rawInvItems)
                    });
                } else if (item.sourceType === "custom" && Array.isArray(rawCustomItems[item.arrayIndex])) {
                    const existing = rawCustomItems[item.arrayIndex];
                    rawCustomItems[item.arrayIndex] = [
                        String(existing[0] ?? ""),
                        String(newQty),
                        String(existing[2] ?? "true"),
                        String(existing[3] ?? "0"),
                        String(existing[4] ?? ""),
                        String(existing[5] ?? "Gear"),
                        String(existing[6] ?? "")
                    ];
                    await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
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
                        new ItemInfoModal(plugin.app, plugin, item.rulebookData, ctx.sourcePath).open();
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

        // -----------------------------------------------------------
        // D. CONSUMABLE 1-USE HEROIC INSPIRATION SLIM PANE (In-Memory)
        // -----------------------------------------------------------
        if (plugin.activeHeroicInspiration.has(ctx.sourcePath)) {
            const hiPane = wrapper.createDiv({ cls: "dnd-features-window dnd-heroic-inspiration-pane" });

            const leftSide = hiPane.createDiv({ cls: "dnd-heroic-inspiration-left" });
            leftSide.createEl("span", { text: "✨", cls: "dnd-heroic-inspiration-icon" });
            leftSide.createEl("strong", { text: "Heroic Inspiration", cls: "dnd-heroic-inspiration-title" });

            const hiInfoBtn = leftSide.createEl("button", {
                cls: "dnd-inventory-icon-btn",
                attr: { title: "Heroic Inspiration Details" }
            });
            setSvgIcon(hiInfoBtn, "info");
            hiInfoBtn.onclick = (e) => {
                e.stopPropagation();
                new ItemInfoModal(
                    plugin.app,
                    plugin,
                    {
                        name: "Heroic Inspiration",
                        type: "Rule",
                        description: "You can reroll any die immediately after rolling it, and you must use the new roll. You can never have more than one instance of Heroic Inspiration. If something gives you Heroic Inspiration and you already have it, you can give it to a player character in your group who lacks it."
                    },
                    ctx.sourcePath
                ).open();
            };

            const rightSide = hiPane.createDiv({ cls: "dnd-heroic-inspiration-right" });
            rightSide.createEl("span", { text: "Use:", cls: "dnd-spell-slots-label" });
            const pipsContainer = rightSide.createDiv({ cls: "dnd-spell-slots-pips" });
            const pip = pipsContainer.createDiv({
                cls: "dnd-slot-pip",
                attr: { title: "Tap to expend Heroic Inspiration" }
            });

            pip.addEventListener("pointerdown", (e: PointerEvent) => {
                if (e.button !== 0 && e.pointerType === "mouse") return;
                e.preventDefault();
                e.stopPropagation();
                pip.classList.add("is-used");
                new Notice("Heroic Inspiration used!");
                setTimeout(() => {
                    plugin.setHeroicInspiration(ctx.sourcePath, false);
                }, 180);
            });
        }

        el.empty();
        el.appendChild(wrapper);
        requestAnimationFrame(() => updateWealthGridCols());
    };

    renderContent();

    renderChild.registerEvent(
        plugin.app.metadataCache.on('changed', (file) => {
            if (file.path === ctx.sourcePath && !isUpdatingInventory) renderContent();
        })
    );

    renderChild.registerDomEvent(window, "dnd-heroic-inspiration-changed" as any, (ev: Event) => {
        const detail = (ev as CustomEvent)?.detail;
        if (!detail || detail.sourcePath === ctx.sourcePath) {
            renderContent();
        }
    });
}
