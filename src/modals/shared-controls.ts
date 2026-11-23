import { App } from 'obsidian';
import { getExtraFeat, getFeatMapData } from '../../data';
import type { DnDPluginSettings } from '../settings';
import {
    ALL_ABILITIES,
    AbilityKey,
    GrantedFeatMilestoneState,
    formatFeatureOrSlug,
    parseFeatAbilityImprovements,
    parseFeatSavingThrowProficiencies,
    sanitizeWeaponSlug
} from '../helpers';

export async function renderGrantedFeatMilestoneCard(opts: {
    app: App;
    settings: DnDPluginSettings;
    parentEl: HTMLElement;
    headerLabel: string;
    cardCls?: string;
    descriptionHint?: string;
    state: GrantedFeatMilestoneState;
    getCurrentStats: () => Record<string, number>;
    existingSavingThrows: AbilityKey[];
    knownSkillsForExpertise: string[];
    getAlreadyUsedExpertise: () => string[];
    onStateChange?: () => void | Promise<void>;
}): Promise<boolean> {
    const {
        app,
        settings,
        parentEl,
        headerLabel,
        cardCls = "dnd-form-card",
        descriptionHint,
        state,
        getCurrentStats,
        existingSavingThrows,
        knownSkillsForExpertise,
        getAlreadyUsedExpertise,
        onStateChange
    } = opts;

    interface ClassifiedOption {
        key: string;
        type: "asi" | "router" | "feat";
        label: string;
        routerMap?: Record<string, string>;
        featData?: any;
    }

    const classifiedOptions: ClassifiedOption[] = [];
    for (const optKey of state.options) {
        if (optKey === "ability-score-improvement") {
            classifiedOptions.push({
                key: optKey,
                type: "asi",
                label: "Ability Score Improvement (+2 / +1 & +1)"
            });
        } else {
            const routerMap = await getFeatMapData(app, settings, optKey);
            if (routerMap && typeof routerMap === "object") {
                classifiedOptions.push({
                    key: optKey,
                    type: "router",
                    label: formatFeatureOrSlug(optKey),
                    routerMap
                });
            } else {
                const featData = await getExtraFeat(app, settings, optKey);
                classifiedOptions.push({
                    key: optKey,
                    type: "feat",
                    label: featData?.name || formatFeatureOrSlug(optKey),
                    featData
                });
            }
        }
    }

    if (classifiedOptions.length === 0) return false;

    const cardDiv = parentEl.createDiv({ cls: cardCls });
    cardDiv.createEl("label", { text: headerLabel, cls: "dnd-form-label-bold" });
    if (descriptionHint && descriptionHint.trim()) {
        cardDiv.createEl("small", { text: descriptionHint.trim(), cls: "dnd-form-hint-block" });
    }

    const optionContainer = cardDiv.createDiv();

    const renderFeatSubControls = async (targetEl: HTMLElement, featKey: string, preserveSubState: boolean) => {
        targetEl.empty();
        if (!preserveSubState) {
            state.abilityChoices = {};
            state.featExpertiseChoices = [];
        }
        if (!featKey) {
            await onStateChange?.();
            return;
        }

        const featData = await getExtraFeat(app, settings, featKey);
        if (!featData) {
            await onStateChange?.();
            return;
        }

        const currentStats = getCurrentStats();
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

        if (improvements.length > 0) {
            const improveDiv = targetEl.createDiv({ cls: "dnd-form-group" });
            for (let impIdx = 0; impIdx < improvements.length; impIdx++) {
                const imp = improvements[impIdx];
                if (!imp.isChoice) {
                    const stat = imp.options[0];
                    const curr = currentStats[stat] || 10;
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
                    const disabledOptions = new Set<AbilityKey>();
                    imp.options.forEach(ab => {
                        const curr = currentStats[ab] || 10;
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
                        if (isCapped || isAlreadyProficient) {
                            optEl.disabled = true;
                            disabledOptions.add(ab);
                        }
                    });
                    if (preserveSubState && state.abilityChoices[impIdx]) {
                        if (disabledOptions.has(state.abilityChoices[impIdx])) {
                            delete state.abilityChoices[impIdx];
                        } else {
                            selectEl.value = state.abilityChoices[impIdx];
                        }
                    }
                    selectEl.onchange = async (e) => {
                        const val = (e.target as HTMLSelectElement).value as AbilityKey;
                        if (val && ALL_ABILITIES.includes(val)) {
                            state.abilityChoices[impIdx] = val;
                        } else {
                            delete state.abilityChoices[impIdx];
                        }
                        await onStateChange?.();
                    };
                }
            }

            if (hasImprovedAbilitySave) {
                const saveNote = improveDiv.createDiv({ cls: "dnd-form-hint" });
                saveNote.createEl("small", { text: "Granted Saving Throw: You gain saving throw proficiency in the chosen ability." });
            }
        }

        const explicitSaves = parseFeatSavingThrowProficiencies(featData);
        if (explicitSaves.length > 0) {
            const saveDiv = targetEl.createDiv({ cls: "dnd-form-hint" });
            saveDiv.createEl("strong", { text: "Granted Saving Throw Proficiency: " });
            saveDiv.createSpan({ text: explicitSaves.map(s => formatFeatureOrSlug(s)).join(', ') });
        }

        if (featData.grantedExpertise && Array.isArray(featData.grantedExpertise) && featData.grantedExpertise.length === 2) {
            const featPool: string[] = Array.isArray(featData.grantedExpertise[0]) ? featData.grantedExpertise[0] : [];
            const featExpCount: number = Number(featData.grantedExpertise[1]) || 0;

            if (featExpCount > 0) {
                if (!preserveSubState || !Array.isArray(state.featExpertiseChoices) || state.featExpertiseChoices.length !== featExpCount) {
                    state.featExpertiseChoices = Array(featExpCount).fill("");
                }

                const expDiv = targetEl.createDiv({ cls: "dnd-form-group" });
                expDiv.createEl("label", {
                    text: `Granted Expertise (${featExpCount} ${featExpCount === 1 ? 'Choice' : 'Choices'}):`,
                    cls: "dnd-form-label-sm"
                });

                let eligibleSkills = [...new Set(knownSkillsForExpertise.map(s => String(s).trim()).filter(Boolean))];
                if (featPool.length > 0) {
                    const lowerPool = featPool.map(e => String(e).toLowerCase());
                    eligibleSkills = eligibleSkills.filter(s => lowerPool.includes(String(s).toLowerCase()));
                }

                const usedSet = new Set(getAlreadyUsedExpertise().map(u => String(u).toLowerCase()));
                eligibleSkills = eligibleSkills.filter(s => !usedSet.has(String(s).toLowerCase()));

                if (eligibleSkills.length === 0) {
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

                        eligibleSkills.forEach(skill => {
                            selectEl.createEl("option", {
                                text: skill.replace(/\b\w/g, c => c.toUpperCase()),
                                value: skill
                            });
                        });

                        if (preserveSubState && state.featExpertiseChoices[i]) {
                            selectEl.value = state.featExpertiseChoices[i];
                        }

                        selectEl.onchange = async (e) => {
                            state.featExpertiseChoices[i] = (e.target as HTMLSelectElement).value;
                            await onStateChange?.();
                        };
                    }
                }
            }
        }

        await onStateChange?.();
    };

    const renderActiveOption = async (opt: ClassifiedOption, preserveState: boolean) => {
        optionContainer.empty();
        state.chosenOptionKey = opt.key;
        state.chosenOptionType = opt.type;
        if (!preserveState) {
            state.chosenFeatKey = "";
            state.asiStat1 = "";
            state.asiStat2 = "";
            state.abilityChoices = {};
            state.featExpertiseChoices = [];
        }

        if (opt.type === "asi") {
            const asiContainer = optionContainer.createDiv({ cls: "dnd-form-grid-2" });
            const statSelect1 = asiContainer.createEl("select", { cls: "dnd-modal-form-input" });
            const statSelect2 = asiContainer.createEl("select", { cls: "dnd-modal-form-input" });

            const updateAsiOptions = () => {
                const currentStats = getCurrentStats();
                let val1 = statSelect1.value || state.asiStat1;
                let val2 = statSelect2.value || state.asiStat2;

                if (val1 && (currentStats[val1] || 10) >= 20) {
                    val1 = "";
                    state.asiStat1 = "";
                }
                if (val2) {
                    const eff2 = (val1 === val2) ? (currentStats[val2] || 10) + 1 : (currentStats[val2] || 10);
                    if (eff2 >= 20) {
                        val2 = "";
                        state.asiStat2 = "";
                    }
                }

                statSelect1.empty();
                statSelect2.empty();

                statSelect1.createEl("option", { text: "-- +1 Stat --", value: "" });
                statSelect2.createEl("option", { text: "-- +1 Stat --", value: "" });

                ALL_ABILITIES.forEach(s => {
                    const base = currentStats[s] || 10;

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

                statSelect1.value = val1 || "";
                statSelect2.value = val2 || "";
            };

            updateAsiOptions();

            statSelect1.onchange = async (e) => {
                state.asiStat1 = (e.target as HTMLSelectElement).value;
                updateAsiOptions();
                await onStateChange?.();
            };
            statSelect2.onchange = async (e) => {
                state.asiStat2 = (e.target as HTMLSelectElement).value;
                updateAsiOptions();
                await onStateChange?.();
            };

            optionContainer.createEl("small", {
                text: "Select two +1 ability increases (or pick the same stat twice for +2, max 20).",
                cls: "dnd-form-hint"
            });
        } else if (opt.type === "router") {
            const featSelect = optionContainer.createEl("select", { cls: "dnd-modal-form-input dnd-form-group" });
            featSelect.createEl("option", { text: `-- Select ${opt.label} --`, value: "" });
            if (opt.routerMap) {
                Object.entries(opt.routerMap).forEach(([key, name]) => {
                    featSelect.createEl("option", { text: String(name), value: key });
                });
            }
            const abilityContainer = optionContainer.createDiv();
            if (preserveState && state.chosenFeatKey) {
                featSelect.value = state.chosenFeatKey;
                await renderFeatSubControls(abilityContainer, state.chosenFeatKey, true);
            }
            featSelect.onchange = async (e) => {
                state.chosenFeatKey = (e.target as HTMLSelectElement).value;
                await renderFeatSubControls(abilityContainer, state.chosenFeatKey, false);
            };
        } else if (opt.type === "feat") {
            state.chosenFeatKey = opt.key;
            const infoDiv = optionContainer.createDiv({ cls: "dnd-form-group" });
            infoDiv.createEl("span", {
                text: `Granted Feat: ${opt.label}`,
                cls: "dnd-form-label-bold"
            });
            const abilityContainer = optionContainer.createDiv();
            await renderFeatSubControls(abilityContainer, state.chosenFeatKey, preserveState);
        }

        await onStateChange?.();
    };

    const matchedSaved = state.chosenOptionKey
        ? classifiedOptions.find(o => o.key === state.chosenOptionKey)
        : undefined;
    const initialOpt = matchedSaved || classifiedOptions[0];
    const shouldPreserve = Boolean(matchedSaved);

    if (classifiedOptions.length > 1) {
        const choiceSelect = cardDiv.createEl("select", { cls: "dnd-modal-form-input dnd-form-group" });
        classifiedOptions.forEach((opt) => {
            choiceSelect.createEl("option", { text: opt.label, value: opt.key });
        });
        choiceSelect.value = initialOpt.key;
        choiceSelect.onchange = async (e) => {
            const selectedKey = (e.target as HTMLSelectElement).value;
            const foundOpt = classifiedOptions.find(o => o.key === selectedKey) || classifiedOptions[0];
            await renderActiveOption(foundOpt, false);
        };
        cardDiv.insertBefore(choiceSelect, optionContainer);
    }

    await renderActiveOption(initialOpt, shouldPreserve);
    return true;
}

/** Shared Weapon & Armor Loadout UI (Rulebook dropdown vs Custom input toggle + Weapon Mastery checkbox) used by Wizard Step 4 and EquipItemsModal. */
export function renderWeaponAndArmorLoadoutControls(opts: {
    parentEl: HTMLElement;
    availableWeapons: { id: string; name: string; damage: string; mastery: string }[];
    availableArmors: { id: string; name: string; ac: string; category: string }[];
    availableMasterySlots: number;
    getMasteredWeapons: () => string[];
    setMasteredWeapons: (list: string[]) => void;
    getWeaponName: () => string;
    setWeaponName: (val: string) => void;
    getWeaponDamage: () => string;
    setWeaponDamage: (val: string) => void;
    getIsWeaponCustom: () => boolean;
    setIsWeaponCustom: (val: boolean) => void;
    getArmorName: () => string;
    setArmorName: (val: string) => void;
    getArmorAc: () => string | number;
    setArmorAc: (val: any) => void;
    getIsArmorCustom: () => boolean;
    setIsArmorCustom: (val: boolean) => void;
    defaultArmorAcOnClear: string | number;
    coerceMatchedArmorAc: (acStr: string) => string | number;
    onViewMasteries: () => void;
    onModeToggleReRender: () => void;
    onInputKeyUp?: (e: KeyboardEvent) => void;
}) {
    const {
        parentEl,
        availableWeapons,
        availableArmors,
        availableMasterySlots,
        getMasteredWeapons,
        setMasteredWeapons,
        getWeaponName,
        setWeaponName,
        getWeaponDamage,
        setWeaponDamage,
        getIsWeaponCustom,
        setIsWeaponCustom,
        getArmorName,
        setArmorName,
        getArmorAc,
        setArmorAc,
        getIsArmorCustom,
        setIsArmorCustom,
        defaultArmorAcOnClear,
        coerceMatchedArmorAc,
        onViewMasteries,
        onModeToggleReRender,
        onInputKeyUp
    } = opts;

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
    const weaponSection = parentEl.createDiv({ cls: "dnd-form-group-lg" });
    const weaponLabelRow = weaponSection.createDiv({ cls: "dnd-flex-between" });
    weaponLabelRow.createEl("label", { text: "Weapon Name:", cls: "dnd-form-label-sub" });
    const viewMasteriesLink = weaponLabelRow.createEl("a", {
        text: "📖 View Weapon Masteries",
        cls: "dnd-note-link dnd-form-hint",
        href: "#"
    });
    viewMasteriesLink.onclick = (e) => {
        e.preventDefault();
        onViewMasteries();
    };

    const weaponRow = weaponSection.createDiv({ cls: "dnd-equip-row" });
    const masteryCheckboxContainer = weaponSection.createDiv();

    const renderWeaponMasteryToggle = () => {
        masteryCheckboxContainer.empty();
        const currWeapon = getWeaponName();
        if (getIsWeaponCustom() || !currWeapon || currWeapon === "None") return;
        const matchedWeapon = availableWeapons.find(w => w.name === currWeapon);
        if (!matchedWeapon || !matchedWeapon.mastery) return;

        const weaponSlug = sanitizeWeaponSlug(matchedWeapon.id || matchedWeapon.name);
        const currentMastered = getMasteredWeapons();
        const isChecked = currentMastered.includes(weaponSlug);
        const usedCount = currentMastered.length;
        const isDisabled = availableMasterySlots <= 0 || (!isChecked && usedCount >= availableMasterySlots);

        const masteryRow = masteryCheckboxContainer.createDiv({ cls: "dnd-form-row" });
        const cb = masteryRow.createEl("input", { type: "checkbox" });
        cb.checked = isChecked && availableMasterySlots > 0;
        cb.disabled = isDisabled;
        cb.onchange = (ev) => {
            const checked = (ev.target as HTMLInputElement).checked;
            let list = [...getMasteredWeapons()];
            if (checked) {
                if (list.length < availableMasterySlots && !list.includes(weaponSlug)) {
                    list.push(weaponSlug);
                }
            } else {
                list = list.filter(s => s !== weaponSlug);
            }
            setMasteredWeapons(list);
            renderWeaponMasteryToggle();
        };

        const labelText = availableMasterySlots > 0
            ? `Use Weapon Mastery (${matchedWeapon.mastery}) — ${usedCount} / ${availableMasterySlots} Masteries Used`
            : `Use Weapon Mastery (${matchedWeapon.mastery}) — 0 Masteries Available`;
        masteryRow.createEl("label", { text: labelText });
    };

    if (!getIsWeaponCustom()) {
        const weaponSelect = weaponRow.createEl("select", { cls: "dnd-equip-field" });
        weaponSelect.createEl("option", { text: "-- Select a Weapon --", value: "" });
        weaponSelect.createEl("option", { text: "None (Unarmed)", value: "None" });

        availableWeapons.forEach(w => {
            const metaParts = [w.damage, w.mastery].filter(Boolean);
            const metaSuffix = metaParts.length > 0 ? ` (${metaParts.join(", ")})` : "";
            weaponSelect.createEl("option", { text: `${w.name}${metaSuffix}`, value: w.name });
        });

        weaponSelect.value = getWeaponName() || "";
        weaponSelect.onchange = (e) => {
            const nextVal = (e.target as HTMLSelectElement).value;
            setWeaponName(nextVal);
            const matched = availableWeapons.find(w => w.name === nextVal);
            if (matched) {
                setWeaponDamage(matched.damage);
            } else if (nextVal === "None" || nextVal === "") {
                setWeaponDamage("");
            }
            renderWeaponMasteryToggle();
        };
    } else {
        const currWeapon = getWeaponName();
        const weaponInput = weaponRow.createEl("input", {
            type: "text",
            value: currWeapon === "None" ? "" : (currWeapon || ""),
            cls: "dnd-equip-field"
        });
        weaponInput.placeholder = "e.g., Sun Blade";
        weaponInput.oninput = (e) => {
            setWeaponName((e.target as HTMLInputElement).value);
        };
        if (onInputKeyUp) weaponInput.onkeyup = onInputKeyUp;
    }

    renderWeaponMasteryToggle();

    createModeToggle(weaponRow, Boolean(getIsWeaponCustom()), () => {
        const nextCustom = !getIsWeaponCustom();
        setIsWeaponCustom(nextCustom);
        if (!nextCustom) {
            const currName = String(getWeaponName() || "").toLowerCase();
            const matched = availableWeapons.find(w => w.name.toLowerCase() === currName);
            setWeaponName(matched ? matched.name : "");
            setWeaponDamage(matched ? matched.damage : "");
        }
        onModeToggleReRender();
    });

    if (getIsWeaponCustom()) {
        const weaponSub = weaponSection.createDiv({ cls: "dnd-equip-custom-sub" });
        weaponSub.createEl("label", { text: "Weapon Damage:", cls: "dnd-form-label-sm" });
        const dmgInput = weaponSub.createEl("input", {
            type: "text",
            value: getWeaponDamage() || "",
            cls: "dnd-equip-field"
        });
        dmgInput.placeholder = "e.g., 1d8 + 2 Radiant";
        dmgInput.oninput = (e) => {
            setWeaponDamage((e.target as HTMLInputElement).value);
        };
        if (onInputKeyUp) dmgInput.onkeyup = onInputKeyUp;
    }

    // 2. ARMOR SECTION
    const armorSection = parentEl.createDiv({ cls: "dnd-form-group" });
    armorSection.createEl("label", { text: "Armor Name:", cls: "dnd-form-label-sub" });

    const armorRow = armorSection.createDiv({ cls: "dnd-equip-row" });

    if (!getIsArmorCustom()) {
        const armorSelect = armorRow.createEl("select", { cls: "dnd-equip-field" });
        armorSelect.createEl("option", { text: "-- Select Armor --", value: "" });
        armorSelect.createEl("option", { text: "None (Unarmored)", value: "None" });

        availableArmors.forEach(a => {
            const catLabel = a.category ? `, ${a.category}` : "";
            armorSelect.createEl("option", { text: `${a.name} (AC ${a.ac}${catLabel})`, value: a.name });
        });

        armorSelect.value = getArmorName() || "";
        armorSelect.onchange = (e) => {
            const nextVal = (e.target as HTMLSelectElement).value;
            setArmorName(nextVal);
            const matched = availableArmors.find(a => a.name === nextVal);
            if (matched) {
                setArmorAc(coerceMatchedArmorAc(matched.ac));
            } else if (nextVal === "None" || nextVal === "") {
                setArmorAc(coerceMatchedArmorAc("10"));
            }
        };
    } else {
        const currArmor = getArmorName();
        const armorInput = armorRow.createEl("input", {
            type: "text",
            value: currArmor === "None" ? "" : (currArmor || ""),
            cls: "dnd-equip-field"
        });
        armorInput.placeholder = "e.g., Elven Chain";
        armorInput.oninput = (e) => {
            setArmorName((e.target as HTMLInputElement).value);
        };
        if (onInputKeyUp) armorInput.onkeyup = onInputKeyUp;
    }

    createModeToggle(armorRow, Boolean(getIsArmorCustom()), () => {
        const nextCustom = !getIsArmorCustom();
        setIsArmorCustom(nextCustom);
        if (!nextCustom) {
            const currName = String(getArmorName() || "").toLowerCase();
            const matched = availableArmors.find(a => a.name.toLowerCase() === currName);
            setArmorName(matched ? matched.name : "");
            setArmorAc(matched ? coerceMatchedArmorAc(matched.ac) : defaultArmorAcOnClear);
        }
        onModeToggleReRender();
    });

    if (getIsArmorCustom()) {
        const armorSub = armorSection.createDiv({ cls: "dnd-equip-custom-sub" });
        armorSub.createEl("label", { text: "Armor AC:", cls: "dnd-form-label-sm" });
        const acInput = armorSub.createEl("input", {
            type: "number",
            value: String(getArmorAc() ?? ""),
            cls: "dnd-equip-field"
        });
        acInput.placeholder = "e.g., 16";
        acInput.oninput = (e) => {
            setArmorAc((e.target as HTMLInputElement).value);
        };
        if (onInputKeyUp) acInput.onkeyup = onInputKeyUp;
    }
}
