import { TFile, parseYaml } from 'obsidian';
import {
    getClassData,
    getSubclassData,
    getBackgroundData,
    getRaceData,
    getRacialSpellsData,
    getExtraFeat,
    getItemData,
    getFeatMapData,
    getClassChoiceData
} from '../data';
import type DnDCharacterSheetHelperPlugin from '../main';
import {
    SpeedModifierBreakdown,
    RaceSpellcastingMetadata,
    parseStringArray,
    normalizeFeatKey,
    parseExtraFeatsList,
    hasValidValue,
    combineUniqueFeatIds,
    flattenClassChoices,
    formatFeatureOrSlug,
    parseHitDiceState,
    serializeHitDiceState
} from './helpers';

// --- Helper: Discover if a class grants a subclass at or before maxLevel ---
export function findGrantedSubclass(classData: any, maxLevel: number): string | null {
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

// --- Helper: Scan Class & Subclass Features (Lvl 1..currentLevel) for Hidden "Unarmored Defense" Formula ---
export async function resolveUnarmoredDefense(
    plugin: DnDCharacterSheetHelperPlugin,
    classInput: any,
    classLevelsInput: any,
    totalLevel: number,
    statsRecord: Record<string, number>,
    fetchOptions?: any,
    subclassInput?: any
): Promise<{ baseAc: number; acBonus: number; totalAc: number; formula: string }> {
    const options = fetchOptions || plugin.settings;
    const parsedTotalLevel = Math.max(1, Number(totalLevel) || 1);
    const dexScore = Number(statsRecord.dexterity) || 10;
    const dexMod = Math.floor((dexScore - 10) / 2);

    const classArray = Array.isArray(classInput)
        ? classInput.map(c => String(c || "").trim()).filter(Boolean)
        : (classInput ? [String(classInput).trim()].filter(Boolean) : []);

    const rawSubclassArray = Array.isArray(subclassInput) ? subclassInput : (subclassInput ? [subclassInput] : []);
    const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

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

        const classData = await getClassData(plugin.app, options, className);
        if (!classData) continue;

        let subclassData: any = null;
        const grantedSubclassFile = findGrantedSubclass(classData, currentClassLevel);
        if (grantedSubclassFile && subclassArray[idx]) {
            subclassData = await getSubclassData(plugin.app, options, grantedSubclassFile, String(subclassArray[idx]));
        }

        for (let lvl = 1; lvl <= currentClassLevel; lvl++) {
            const lvlFeatures = classData.features?.[lvl.toString()];
            if (Array.isArray(lvlFeatures)) {
                for (const feature of lvlFeatures) {
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

            if (subclassData) {
                const subLvlFeatures = subclassData[lvl.toString()];
                if (Array.isArray(subLvlFeatures)) {
                    for (const feature of subLvlFeatures) {
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

/**
 * Resolves Base AC (`armorAc`), Dexterity/Unarmored AC Bonus (`armorAcBonus`), and canonical armor name
 * across Rulebook armors (Light, Medium, Heavy, Unarmored Defense), unarmored ("None"), and Custom Armors.
 */
export async function resolveEquippedArmorStats(
    plugin: DnDCharacterSheetHelperPlugin,
    params: {
        armorNameInput: any;
        manualAcInput?: any;
        isCustomMode?: boolean;
        classInput: any;
        classLevelsInput: any;
        totalLevel: number;
        statsRecord: Record<string, number>;
        subclassInput?: any;
        fetchOptions?: any;
    }
): Promise<{ resolvedArmorName: string; armorAc: number; armorAcBonus: number; isUnarmored: boolean }> {
    const opts = params.fetchOptions || plugin.settings;
    const rawArmorStr = String(params.armorNameInput ?? "").trim();
    const cleanArmorLower = rawArmorStr.toLowerCase();
    const hasArmorName = rawArmorStr !== "" && cleanArmorLower !== "none" && !rawArmorStr.startsWith("<");
    const parsedManualAc = parseInt(String(params.manualAcInput ?? ""), 10);
    const dexMod = Math.floor(((Number(params.statsRecord?.dexterity) || 10) - 10) / 2);

    const getUnarmored = () => resolveUnarmoredDefense(
        plugin,
        params.classInput,
        params.classLevelsInput,
        params.totalLevel,
        params.statsRecord,
        opts,
        params.subclassInput
    );

    if (params.isCustomMode) {
        if (hasArmorName) {
            return {
                resolvedArmorName: rawArmorStr,
                armorAc: !isNaN(parsedManualAc) ? parsedManualAc : 10,
                armorAcBonus: 0,
                isUnarmored: false
            };
        }
        if (!isNaN(parsedManualAc)) {
            return {
                resolvedArmorName: "None",
                armorAc: parsedManualAc,
                armorAcBonus: 0,
                isUnarmored: false
            };
        }
        const unarmoredCalc = await getUnarmored();
        return {
            resolvedArmorName: "None",
            armorAc: unarmoredCalc.baseAc,
            armorAcBonus: unarmoredCalc.acBonus,
            isUnarmored: true
        };
    }

    if (hasArmorName) {
        const safeArmorName = rawArmorStr.toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        const armorData = await getItemData(plugin.app, opts, safeArmorName);
        if (armorData && armorData.ac && armorData.category) {
            const category = String(armorData.category).toLowerCase();
            if (category.includes("unarmored") || safeArmorName === "unarmored-defense") {
                const unarmoredCalc = await getUnarmored();
                return {
                    resolvedArmorName: armorData.name || "Unarmored Defense",
                    armorAc: unarmoredCalc.baseAc,
                    armorAcBonus: unarmoredCalc.acBonus,
                    isUnarmored: true
                };
            }
            const baseAc = parseInt(String(armorData.ac), 10);
            let armorAcBonus = dexMod;
            if (category.includes("light")) armorAcBonus = dexMod;
            else if (category.includes("medium")) armorAcBonus = Math.min(dexMod, 2);
            else if (category.includes("heavy")) armorAcBonus = 0;

            return {
                resolvedArmorName: armorData.name || rawArmorStr,
                armorAc: !isNaN(baseAc) ? baseAc : 10,
                armorAcBonus,
                isUnarmored: false
            };
        }

        // Non-empty armor name not found in rulebook (e.g. Custom Armor already equipped on sheet)
        if (params.isCustomMode === undefined) {
            return {
                resolvedArmorName: rawArmorStr,
                armorAc: !isNaN(parsedManualAc) ? parsedManualAc : 10,
                armorAcBonus: 0,
                isUnarmored: false
            };
        }
    }

    const unarmoredCalc = await getUnarmored();
    return {
        resolvedArmorName: "None",
        armorAc: unarmoredCalc.baseAc,
        armorAcBonus: unarmoredCalc.acBonus,
        isUnarmored: true
    };
}

/** Resolves a character's Background Feat ID from `DnD_background` JSON data, falling back to `DnD_backgroundFeat`. */
export async function resolveBackgroundFeatId(
    plugin: DnDCharacterSheetHelperPlugin,
    backgroundInput: any,
    backgroundFeatInput: any,
    fetchOptions?: any
): Promise<any> {
    if (hasValidValue(backgroundInput)) {
        const bgData = await getBackgroundData(plugin.app, fetchOptions || plugin.settings, backgroundInput);
        if (bgData?.feat) return bgData.feat;
    }
    return backgroundFeatInput;
}

// --- Helper: Calculate Dynamic Damage for "Unarmed Strike" using class scalingDice & Ability Modifiers ---
export async function resolveUnarmedStrikeDamage(
    plugin: DnDCharacterSheetHelperPlugin,
    classInput: any,
    classLevelsInput: any,
    totalLevel: number,
    statsRecord: Record<string, number>,
    attackStat?: string,
    fetchOptions?: any
): Promise<string> {
    const options = fetchOptions || plugin.settings;
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

        const classData = await getClassData(plugin.app, options, className);
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

/**
 * Extracts a feat slug from `feature.grantedFeats` only when it is a single
 * unconditional feat (length === 1 and neither ASI nor a feat router).
 * Multi-option arrays (e.g. `["skilled", "origin-feats"]`) represent user choices stored in `DnD_extraFeats`.
 */
export async function extractSingleAutoGrantedFeat(
    plugin: DnDCharacterSheetHelperPlugin,
    grantedFeats: any,
    fetchOptions?: any,
    routerCache?: Map<string, boolean>
): Promise<string | null> {
    if (!Array.isArray(grantedFeats) || grantedFeats.length !== 1) return null;
    const cleanKey = String(grantedFeats[0] ?? "").trim();
    if (!cleanKey || cleanKey.startsWith("<") || cleanKey.toLowerCase().endsWith(".json")) return null;
    const slug = normalizeFeatKey(cleanKey);
    if (!slug || slug === "ability-score-improvement") return null;

    if (routerCache?.has(slug)) {
        return routerCache.get(slug) ? null : cleanKey;
    }
    const routerData = await getFeatMapData(plugin.app, fetchOptions || plugin.settings, cleanKey);
    const isRouter = !!routerData;
    routerCache?.set(slug, isRouter);
    return isRouter ? null : cleanKey;
}

/** Collects single unconditional `grantedFeats` from active Race & Lineage traits. */
export async function collectRaceAutoGrantedFeats(
    plugin: DnDCharacterSheetHelperPlugin,
    raceInput: any,
    raceLineageInput: any,
    fetchOptions?: any,
    routerCache?: Map<string, boolean>
): Promise<string[]> {
    const opts = fetchOptions || plugin.settings;
    const cache = routerCache || new Map<string, boolean>();
    const raceArray = raceInput
        ? (Array.isArray(raceInput) ? raceInput.filter(hasValidValue) : (hasValidValue(raceInput) ? [raceInput] : []))
        : [];
    const lineageClean = hasValidValue(raceLineageInput) ? String(raceLineageInput).trim().toLowerCase() : "";

    const out: string[] = [];
    for (const raceName of raceArray) {
        const raceData = await getRaceData(plugin.app, opts, raceName);
        const raceTraits = raceData?.traits || raceData?.features;
        if (!Array.isArray(raceTraits)) continue;
        for (const trait of raceTraits) {
            if (!trait) continue;
            if (trait.lineage && String(trait.lineage).trim().toLowerCase() !== lineageClean) continue;
            const autoFeat = await extractSingleAutoGrantedFeat(plugin, trait.grantedFeats, opts, cache);
            if (autoFeat && !out.some(f => normalizeFeatKey(f) === normalizeFeatKey(autoFeat))) {
                out.push(autoFeat);
            }
        }
    }
    return out;
}

/** Collects single unconditional `grantedFeats` across Class/Subclass features (1..level) and Race/Lineage traits. */
export async function collectAutoGrantedFeats(
    plugin: DnDCharacterSheetHelperPlugin,
    params: {
        classInput: any;
        classLevelsInput?: any;
        totalLevel: number;
        subclassInput?: any;
        raceInput?: any;
        raceLineageInput?: any;
        fetchOptions?: any;
    }
): Promise<string[]> {
    const opts = params.fetchOptions || plugin.settings;
    const routerCache = new Map<string, boolean>();
    const out: string[] = [];
    const pushUnique = (f: string | null) => {
        if (f && !out.some(existing => normalizeFeatKey(existing) === normalizeFeatKey(f))) {
            out.push(f);
        }
    };

    const classArray = params.classInput
        ? (Array.isArray(params.classInput) ? params.classInput.filter(hasValidValue) : (hasValidValue(params.classInput) ? [params.classInput] : []))
        : [];
    const rawSubclassArray = params.subclassInput
        ? (Array.isArray(params.subclassInput) ? params.subclassInput.filter(hasValidValue) : (hasValidValue(params.subclassInput) ? [params.subclassInput] : []))
        : [];

    for (let idx = 0; idx < classArray.length; idx++) {
        const className = classArray[idx];
        const currentClassLevel = (classArray.length > 1 && Array.isArray(params.classLevelsInput) && params.classLevelsInput.length > idx)
            ? (Number(params.classLevelsInput[idx]) || 1)
            : (Number(params.totalLevel) || 1);

        const classData = await getClassData(plugin.app, opts, className);
        if (!classData?.features) continue;

        let subclassData: any = null;
        const subName = rawSubclassArray[idx] || null;
        const grantedSubFile = findGrantedSubclass(classData, currentClassLevel);
        if (subName && grantedSubFile) {
            subclassData = await getSubclassData(plugin.app, opts, grantedSubFile, subName);
        }

        for (let lvl = 1; lvl <= currentClassLevel; lvl++) {
            const lvlFeatures: any[] = [
                ...(classData.features[lvl.toString()] || []),
                ...(subclassData?.[lvl.toString()] || [])
            ];
            for (const feature of lvlFeatures) {
                if (!feature) continue;
                pushUnique(await extractSingleAutoGrantedFeat(plugin, feature.grantedFeats, opts, routerCache));
            }
        }
    }

    const raceAutoFeats = await collectRaceAutoGrantedFeats(plugin, params.raceInput, params.raceLineageInput, opts, routerCache);
    raceAutoFeats.forEach(pushUnique);
    return out;
}

// --- Helper: Deterministic Speed & Speed Modifier Calculator adhering to D&D 5.5e ---
export async function resolveCharacterSpeedModifiers(
    plugin: DnDCharacterSheetHelperPlugin,
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
): Promise<SpeedModifierBreakdown> {
    const options = fetchOptions || plugin.settings;
    const parsedTotalLevel = Math.max(1, Number(totalLevel) || 1);
    const baseSpeed = Math.max(0, Number(baseSpeedInput) || 30);
    const customSpeedMod = Number(customSpeedModInput) || 0;

    const breakdown: { source: string; amount: number; active: boolean; reason?: string }[] = [];

    // 1. Determine Armor State
    const safeArmorName = String(equippedArmor || "").toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
    let isUnarmored = true;
    let isHeavyArmor = false;

    if (safeArmorName && safeArmorName !== "none" && safeArmorName !== "unarmored-defense") {
        const armorData = await getItemData(plugin.app, options, safeArmorName);
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

        const classData = await getClassData(plugin.app, options, className);
        if (!classData) continue;

        let subclassData: any = null;
        const grantedSubclassFile = findGrantedSubclass(classData, currentClassLevel);
        if (grantedSubclassFile && subclassArray[idx]) {
            subclassData = await getSubclassData(plugin.app, options, grantedSubclassFile, String(subclassArray[idx]));
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
    const autoGrantedForSpeed = await collectAutoGrantedFeats(plugin, {
        classInput,
        classLevelsInput,
        totalLevel: parsedTotalLevel,
        subclassInput,
        raceInput,
        raceLineageInput,
        fetchOptions: options
    });
    const uniqueFeatIds = combineUniqueFeatIds(extraFeatsInput, backgroundFeatInput, autoGrantedForSpeed);

    for (const featId of uniqueFeatIds) {
        const featData = await getExtraFeat(plugin.app, options, featId);
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
 * Resolves a character's total unlocked Weapon Mastery slots from Class/Subclass features and Feats.
 */
export async function resolveCharacterWeaponMasterySlots(
    plugin: DnDCharacterSheetHelperPlugin,
    classInput: any,
    classLevelsInput: any,
    totalLevel: number,
    extraFeatsInput: any,
    backgroundFeatInput: any,
    subclassInput?: any,
    fetchOptions?: any,
    raceInput?: any,
    raceLineageInput?: any
): Promise<{ totalSlots: number; breakdown: { source: string; count: number }[] }> {
    const opts = fetchOptions || plugin.settings;
    const routerCache = new Map<string, boolean>();

    const breakdown: { source: string; count: number }[] = [];
    const classArray = classInput ? (Array.isArray(classInput) ? classInput.filter(hasValidValue) : (hasValidValue(classInput) ? [classInput] : [])) : [];
    const rawSubclassArray = subclassInput ? (Array.isArray(subclassInput) ? subclassInput.filter(hasValidValue) : (hasValidValue(subclassInput) ? [subclassInput] : [])) : [];
    const autoGrantedFeats: string[] = [];

    for (let idx = 0; idx < classArray.length; idx++) {
        const className = classArray[idx];
        const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevelsInput) && classLevelsInput.length > idx)
            ? Number(classLevelsInput[idx])
            : (Number(totalLevel) || 1);

        const classData = await getClassData(plugin.app, opts, className);
        if (!classData?.features) continue;

        let subclassData: any = null;
        const subName = rawSubclassArray[idx] || null;
        const grantedSubFile = findGrantedSubclass(classData, currentClassLevel);
        if (subName && grantedSubFile) {
            subclassData = await getSubclassData(plugin.app, opts, grantedSubFile, subName);
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

                const autoFeat = await extractSingleAutoGrantedFeat(plugin, feature.grantedFeats, opts, routerCache);
                if (autoFeat) autoGrantedFeats.push(autoFeat);
            }
        }

        for (const entry of classFeatureMasteries.values()) {
            if (entry.count > 0) {
                breakdown.push({ source: entry.displayName, count: entry.count });
            }
        }
    }

    const raceAutoFeats = await collectRaceAutoGrantedFeats(plugin, raceInput, raceLineageInput, opts, routerCache);
    autoGrantedFeats.push(...raceAutoFeats);

    // Gather all feats (extraFeats + backgroundFeat + auto-granted feats)
    const featList = combineUniqueFeatIds(extraFeatsInput, backgroundFeatInput, autoGrantedFeats);

    for (const featId of featList) {
        const featData = await getExtraFeat(plugin.app, opts, featId);
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

/**
 * Scans a class and its active subclass from Level 1 up to `maxLevel`, tracking each
 * `classChoices` router independently.
 */
export function resolveClassChoiceRoutersUpToLevel(
    classData: any,
    subclassData: any,
    maxLevel: number
): {
    slotsByRouter: Record<string, { unlockedLevel: number; featureName: string }[]>;
    activeRoutersAtTargetLevel: Set<string>;
} {
    const classSlotsByRouter: Record<string, { unlockedLevel: number; featureName: string }[]> = {};
    const subclassSlotsByRouter: Record<string, { unlockedLevel: number; featureName: string }[]> = {};
    const activeRoutersAtTargetLevel = new Set<string>();

    const processLevelFeatures = (
        featuresAtLevel: any[],
        lvl: number,
        targetMap: Record<string, { unlockedLevel: number; featureName: string }[]>
    ) => {
        if (!Array.isArray(featuresAtLevel)) return;
        const countsAtThisLevel: Record<string, { count: number; featureName: string }> = {};
        for (const feature of featuresAtLevel) {
            if (!feature || !Array.isArray(feature.classChoices)) continue;
            for (const rawRouter of feature.classChoices) {
                const router = String(rawRouter || "").trim();
                if (!router) continue;
                if (!countsAtThisLevel[router]) {
                    countsAtThisLevel[router] = { count: 0, featureName: String(feature.name || router).trim() };
                }
                countsAtThisLevel[router].count += 1;
                if (lvl === maxLevel) {
                    activeRoutersAtTargetLevel.add(router);
                }
            }
        }

        for (const [router, info] of Object.entries(countsAtThisLevel)) {
            const existing = targetMap[router] || [];
            if (info.count > existing.length) {
                const updated = [...existing];
                const toAdd = info.count - existing.length;
                for (let k = 0; k < toAdd; k++) {
                    updated.push({ unlockedLevel: lvl, featureName: info.featureName });
                }
                targetMap[router] = updated;
            } else {
                targetMap[router] = existing.slice(0, info.count);
            }
        }
    };

    for (let lvl = 1; lvl <= maxLevel; lvl++) {
        const lvlKey = lvl.toString();
        if (classData?.features?.[lvlKey]) {
            processLevelFeatures(classData.features[lvlKey], lvl, classSlotsByRouter);
        }
        if (subclassData?.[lvlKey]) {
            processLevelFeatures(subclassData[lvlKey], lvl, subclassSlotsByRouter);
        }
    }

    const slotsByRouter: Record<string, { unlockedLevel: number; featureName: string }[]> = {};
    const allRouters = new Set([...Object.keys(classSlotsByRouter), ...Object.keys(subclassSlotsByRouter)]);
    for (const router of allRouters) {
        slotsByRouter[router] = [
            ...(classSlotsByRouter[router] || []),
            ...(subclassSlotsByRouter[router] || [])
        ];
    }

    return { slotsByRouter, activeRoutersAtTargetLevel };
}

/**
 * Resolves spellcasting abilities, spellsPool router filename, and progression table
 * from classData and/or subclassData (supporting top-level properties and feature-level definitions).
 */
export function resolveSpellcastingMetadata(classData: any, subclassData: any, level?: number): {
    spellcastingAbilities: string[];
    spellsPool: string | null;
    spellcastingTable: Record<string, any> | null;
} {
    let abilities: string[] = [];
    let spellsPool: string | null = null;
    let spellcastingTable: Record<string, any> | null = null;

    // 1. Resolve from classData
    if (classData) {
        if (Array.isArray(classData.spellcastingAbilities) && classData.spellcastingAbilities.length > 0) {
            abilities = [...classData.spellcastingAbilities];
        }
        if (classData.spellsPool) {
            spellsPool = String(classData.spellsPool).trim();
        }
        if (classData.spellcasting || classData.pactMagic) {
            spellcastingTable = classData.spellcasting || classData.pactMagic;
        }
    }

    // 2. Resolve / Fallback to subclassData (top-level properties)
    if (subclassData && typeof subclassData === "object") {
        if (abilities.length === 0 && Array.isArray(subclassData.spellcastingAbilities) && subclassData.spellcastingAbilities.length > 0) {
            abilities = [...subclassData.spellcastingAbilities];
        }
        if (!spellsPool && subclassData.spellsPool) {
            spellsPool = String(subclassData.spellsPool).trim();
        }
        if (!spellcastingTable && (subclassData.spellcasting || subclassData.pactMagic)) {
            spellcastingTable = subclassData.spellcasting || subclassData.pactMagic;
        }

        // 3. Scan features in subclassData (and classData features) for embedded spellcasting configs
        const scanFeatures = (featuresList: any[]) => {
            if (!Array.isArray(featuresList)) return;
            for (const feat of featuresList) {
                if (!feat || typeof feat !== "object") continue;
                if (abilities.length === 0 && Array.isArray(feat.spellcastingAbilities) && feat.spellcastingAbilities.length > 0) {
                    abilities = [...feat.spellcastingAbilities];
                }
                if (!spellsPool && feat.spellsPool) {
                    spellsPool = String(feat.spellsPool).trim();
                }
                if (!spellcastingTable && (feat.spellcasting || feat.pactMagic)) {
                    spellcastingTable = feat.spellcasting || feat.pactMagic;
                }
            }
        };

        const maxLvl = level ?? 20;
        for (let lvl = 1; lvl <= maxLvl; lvl++) {
            const lvlKey = lvl.toString();
            if (subclassData[lvlKey]) scanFeatures(subclassData[lvlKey]);
            if (classData?.features?.[lvlKey]) scanFeatures(classData.features[lvlKey]);
        }
    }

    return {
        spellcastingAbilities: abilities,
        spellsPool: spellsPool ? spellsPool.replace(/\.json$/i, '') : null,
        spellcastingTable
    };
}

/**
 * Resolves spellcasting abilities, extra spell pools (e.g. `elf-cantrips`), and innate spells
 * granted by matching Race / Lineage traits up to `maxLevel`.
 */
export async function resolveRaceSpellcastingMetadata(
    plugin: DnDCharacterSheetHelperPlugin,
    raceData: any,
    raceLineageInput: any,
    maxLevel: number,
    minLevel = 1
): Promise<RaceSpellcastingMetadata> {
    const abilities: string[] = [];
    const pools: string[] = [];
    const grantedSpellsByLevel: Record<string, string[]> = {};
    const innateSlugs = new Set<string>();
    const replaceableCantripPools: string[] = [];
    const defaultReplaceableCantrips = new Set<string>();

    const rawLineage = Array.isArray(raceLineageInput) ? raceLineageInput[0] : raceLineageInput;
    const lineageNorm = typeof rawLineage === "string" ? rawLineage.trim().toLowerCase() : "";

    const traits = raceData?.traits;
    if (!Array.isArray(traits)) {
        return {
            spellcastingAbilities: abilities,
            spellsPools: pools,
            grantedSpellsByLevel,
            innateSlugs,
            replaceableCantripPools,
            defaultReplaceableCantrips
        };
    }

    for (const trait of traits) {
        if (!trait || typeof trait !== "object") continue;

        const traitLineage = typeof trait.lineage === "string" ? trait.lineage.trim() : "";
        const isBaseTrait = !traitLineage;
        if (!isBaseTrait && traitLineage.toLowerCase() !== lineageNorm) continue;

        if (Array.isArray(trait.spellcastingAbilities)) {
            for (const ab of trait.spellcastingAbilities) {
                const cleanAb = String(ab ?? "").trim();
                if (cleanAb && !abilities.some(existing => existing.toLowerCase() === cleanAb.toLowerCase())) {
                    abilities.push(cleanAb);
                }
            }
        }

        let traitPoolClean = "";
        if (trait.spellsPool) {
            traitPoolClean = String(trait.spellsPool).trim().replace(/\.json$/i, "");
            if (traitPoolClean && !pools.some(p => p.toLowerCase() === traitPoolClean.toLowerCase())) {
                pools.push(traitPoolClean);
            }
        }

        if (trait.racialSpells) {
            const racialSpellsData = await getRacialSpellsData(plugin.app, plugin.settings, String(trait.racialSpells));
            if (!racialSpellsData || typeof racialSpellsData !== "object") continue;

            let scopeObj: any = null;
            if (traitLineage) {
                const matchedKey = Object.keys(racialSpellsData).find(
                    k => k.trim().toLowerCase() === traitLineage.toLowerCase()
                );
                if (matchedKey) scopeObj = racialSpellsData[matchedKey];
            } else {
                const baseKey = Object.keys(racialSpellsData).find(
                    k => k.trim().toLowerCase() === "base" || k.trim().toLowerCase() === "default"
                );
                if (baseKey) {
                    scopeObj = racialSpellsData[baseKey];
                } else if (Object.keys(racialSpellsData).some(k => !isNaN(Number(k)))) {
                    scopeObj = racialSpellsData;
                }
            }

            if (!scopeObj || typeof scopeObj !== "object") continue;

            for (const [charLvlStr, spellLevelsObj] of Object.entries(scopeObj)) {
                const unlockLvl = Number(charLvlStr);
                if (isNaN(unlockLvl) || unlockLvl > maxLevel || !spellLevelsObj || typeof spellLevelsObj !== "object") continue;

                for (const [spellLvlKey, spellsDict] of Object.entries(spellLevelsObj as Record<string, any>)) {
                    if (!spellsDict || typeof spellsDict !== "object") continue;
                    const cleanSpellLvl = String(spellLvlKey).trim();
                    for (const rawSlug of Object.keys(spellsDict)) {
                        const slug = String(rawSlug).trim();
                        if (!slug) continue;

                        if (unlockLvl >= 1 && unlockLvl <= maxLevel) {
                            innateSlugs.add(slug);
                            if (traitPoolClean && cleanSpellLvl === "0") {
                                defaultReplaceableCantrips.add(slug);
                                if (!replaceableCantripPools.includes(traitPoolClean)) {
                                    replaceableCantripPools.push(traitPoolClean);
                                }
                            }
                        }

                        if (unlockLvl >= minLevel && unlockLvl <= maxLevel) {
                            if (!grantedSpellsByLevel[cleanSpellLvl]) grantedSpellsByLevel[cleanSpellLvl] = [];
                            if (!grantedSpellsByLevel[cleanSpellLvl].includes(slug)) {
                                grantedSpellsByLevel[cleanSpellLvl].push(slug);
                            }
                        }
                    }
                }
            }
        }
    }

    return {
        spellcastingAbilities: abilities,
        spellsPools: pools,
        grantedSpellsByLevel,
        innateSlugs,
        replaceableCantripPools,
        defaultReplaceableCantrips
    };
}

/**
 * Reads `DnD_spellPools` from frontmatter, falling back to inline `spellPools` declared
 * inside any `dnd-spells` code block for standalone notes.
 */
export function extractSpellPoolsFromContent(content: string, frontmatter: Record<string, any>): string[] {
    const fmPools = parseStringArray(frontmatter?.["DnD_spellPools"], true);
    if (fmPools.length > 0) return fmPools;

    if (!content) return [];
    const blockMatches = content.match(/```dnd-spells\s*\r?\n([\s\S]*?)```/gi);
    if (!blockMatches) return [];

    for (const rawBlock of blockMatches) {
        const inner = rawBlock.replace(/^```dnd-spells\s*\r?\n/i, "").replace(/```$/, "");
        try {
            const parsed = parseYaml(inner);
            if (!parsed || parsed.spellPools === undefined) continue;
            if (typeof parsed.spellPools === "string" && parsed.spellPools.trim().startsWith("frontmatter.")) {
                const key = parsed.spellPools.trim().replace("frontmatter.", "");
                const resolved = parseStringArray(frontmatter?.[key], true);
                if (resolved.length > 0) return resolved;
            } else {
                const inlinePools = parseStringArray(parsed.spellPools, true);
                if (inlinePools.length > 0) return inlinePools;
            }
        } catch {
            // Ignore malformed standalone YAML blocks cleanly
        }
    }
    return [];
}

/**
 * Resolves a character's Initiative modifiers from Class/Subclass features, Race/Lineage traits,
 * Feats, and custom modifiers.
 */
export async function resolveCharacterInitiativeModifiers(
    plugin: DnDCharacterSheetHelperPlugin,
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
): Promise<{
    totalInitiativeMod: number;
    autoBonus: number;
    customInitiativeMod: number;
    breakdown: { source: string; amount: number }[];
}> {
    const opts = fetchOptions || plugin.settings;

    const evaluateInitMod = (rawMod: any): number => {
        if (rawMod === undefined || rawMod === null || rawMod === "") return 0;
        if (typeof rawMod === "number" && !isNaN(rawMod)) return rawMod;
        const cleanedNum = String(rawMod).trim().replace(/^\+/, "");
        if (cleanedNum !== "" && !isNaN(Number(cleanedNum))) {
            return Number(cleanedNum);
        }
        const norm = String(rawMod).trim().toLowerCase().replace(/[\s_-]+/g, "");
        if (norm === "proficiencybonus" || norm === "pb") {
            return Number(proficiencyBonus) || Math.ceil(1 + ((Number(totalLevel) || 1) / 4));
        }
        const abilityMap: Record<string, string> = {
            strength: "strength", str: "strength",
            dexterity: "dexterity", dex: "dexterity",
            constitution: "constitution", con: "constitution",
            intelligence: "intelligence", int: "intelligence",
            wisdom: "wisdom", wis: "wisdom",
            charisma: "charisma", cha: "charisma"
        };
        const matchedAbility = abilityMap[norm];
        if (matchedAbility) {
            const score = Number(statsRecord?.[matchedAbility]) || 10;
            return Math.floor((score - 10) / 2);
        }
        return 0;
    };

    const routerCache = new Map<string, boolean>();
    const breakdown: { source: string; amount: number }[] = [];
    let autoBonus = 0;

    const classArray = classInput ? (Array.isArray(classInput) ? classInput.filter(hasValidValue) : (hasValidValue(classInput) ? [classInput] : [])) : [];
    const rawSubclassArray = subclassInput ? (Array.isArray(subclassInput) ? subclassInput.filter(hasValidValue) : (hasValidValue(subclassInput) ? [subclassInput] : [])) : [];
    const autoGrantedFeats: string[] = [];

    // 1. Class & Subclass Features
    for (let idx = 0; idx < classArray.length; idx++) {
        const className = classArray[idx];
        const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevelsInput) && classLevelsInput.length > idx)
            ? Number(classLevelsInput[idx])
            : (Number(totalLevel) || 1);

        const classData = await getClassData(plugin.app, opts, className);
        if (!classData?.features) continue;

        let subclassData: any = null;
        const subName = rawSubclassArray[idx] || null;
        const grantedSubFile = findGrantedSubclass(classData, currentClassLevel);
        if (subName && grantedSubFile) {
            subclassData = await getSubclassData(plugin.app, opts, grantedSubFile, subName);
        }

        for (let lvl = 1; lvl <= currentClassLevel; lvl++) {
            const lvlFeatures: any[] = [
                ...(classData.features[lvl.toString()] || []),
                ...(subclassData?.[lvl.toString()] || [])
            ];
            for (const feature of lvlFeatures) {
                if (!feature) continue;
                if (feature.initiativeMod !== undefined) {
                    const val = evaluateInitMod(feature.initiativeMod);
                    breakdown.push({
                        source: `${classData.name || className}: ${feature.name || "Feature"}`,
                        amount: val
                    });
                    autoBonus += val;
                }
                const autoFeat = await extractSingleAutoGrantedFeat(plugin, feature.grantedFeats, opts, routerCache);
                if (autoFeat) autoGrantedFeats.push(autoFeat);
            }
        }
    }

    // 2. Race & Lineage Traits
    const raceArray = raceInput ? (Array.isArray(raceInput) ? raceInput.filter(hasValidValue) : (hasValidValue(raceInput) ? [raceInput] : [])) : [];
    const lineageClean = hasValidValue(raceLineageInput) ? String(raceLineageInput).trim().toLowerCase() : "";
    for (const raceName of raceArray) {
        const raceData = await getRaceData(plugin.app, opts, raceName);
        const raceTraits = raceData?.traits || raceData?.features;
        if (!Array.isArray(raceTraits)) continue;
        for (const feature of raceTraits) {
            if (!feature) continue;
            if (feature.lineage && String(feature.lineage).trim().toLowerCase() !== lineageClean) continue;
            if (feature.initiativeMod !== undefined) {
                const val = evaluateInitMod(feature.initiativeMod);
                breakdown.push({
                    source: `${raceData.name || raceName}: ${feature.name || "Trait"}`,
                    amount: val
                });
                autoBonus += val;
            }
            const autoFeat = await extractSingleAutoGrantedFeat(plugin, feature.grantedFeats, opts, routerCache);
            if (autoFeat) autoGrantedFeats.push(autoFeat);
        }
    }

    // 3. Feats (extraFeats + backgroundFeat + auto-granted feats)
    const featList = combineUniqueFeatIds(extraFeatsInput, backgroundFeatInput, autoGrantedFeats);

    for (const featId of featList) {
        const featData = await getExtraFeat(plugin.app, opts, featId);
        if (!featData) continue;
        if (featData.initiativeMod !== undefined) {
            const val = evaluateInitMod(featData.initiativeMod);
            breakdown.push({
                source: `${featData.name || formatFeatureOrSlug(featId)} (Feat)`,
                amount: val
            });
            autoBonus += val;
        }
    }

    const customInitiativeMod = Number(String(customInitiativeModInput ?? 0).trim().replace(/^\+/, "")) || 0;
    const totalInitiativeMod = autoBonus + customInitiativeMod;

    return {
        totalInitiativeMod,
        autoBonus,
        customInitiativeMod,
        breakdown
    };
}

export async function populateFeatureRestTypesForFile(
    plugin: DnDCharacterSheetHelperPlugin,
    sourcePath: string
): Promise<void> {
    const fileCache = plugin.app.metadataCache.getCache(sourcePath);
    const frontmatter: Record<string, any> = fileCache?.frontmatter || {};
    const fetchOptions = { ...plugin.settings };

    const registerFeatureRest = (featureObj: any) => {
        if (!featureObj || !featureObj.name || featureObj.uses === undefined || featureObj.uses === null || featureObj.uses === "") return;
        const cleanName = String(featureObj.name).trim().toLowerCase();
        const restType: "short" | "long" = (Array.isArray(featureObj.uses) && String(featureObj.uses[1] || "").toLowerCase().trim() === "short")
            ? "short"
            : "long";
        plugin.featureRestTypes.set(cleanName, restType);
    };

    // 1. Classes & Subclasses
    const rawClass = frontmatter["DnD_class"];
    const classArray = rawClass ? (Array.isArray(rawClass) ? rawClass : [rawClass]) : [];
    const rawSubclass = frontmatter["DnD_subclass"] ?? frontmatter["DnD_Subclass"];
    const subclassArray = rawSubclass ? (Array.isArray(rawSubclass) ? rawSubclass : [rawSubclass]) : [];
    const extraFeatIds: string[] = [];
    const restRouterCache = new Map<string, boolean>();

    for (let i = 0; i < classArray.length; i++) {
        const className = String(classArray[i] || "").trim();
        if (!className || className.startsWith("<")) continue;
        const classData = await getClassData(plugin.app, fetchOptions, className);
        if (classData && classData.features) {
            for (const lvlKey of Object.keys(classData.features)) {
                const feats = classData.features[lvlKey];
                if (Array.isArray(feats)) {
                    for (const f of feats) {
                        registerFeatureRest(f);
                        const autoFeat = await extractSingleAutoGrantedFeat(plugin, f.grantedFeats, fetchOptions, restRouterCache);
                        if (autoFeat) extraFeatIds.push(autoFeat);
                    }
                }
            }
            const subName = String(subclassArray[i] || "").trim();
            const grantedSubFile = findGrantedSubclass(classData, 20);
            if (subName && !subName.startsWith("<") && grantedSubFile) {
                const subData = await getSubclassData(plugin.app, fetchOptions, grantedSubFile, subName);
                if (subData && typeof subData === "object") {
                    for (const lvlKey of Object.keys(subData)) {
                        const subFeats = subData[lvlKey];
                        if (Array.isArray(subFeats)) {
                            for (const sf of subFeats) {
                                registerFeatureRest(sf);
                                const autoFeat = await extractSingleAutoGrantedFeat(plugin, sf.grantedFeats, fetchOptions, restRouterCache);
                                if (autoFeat) extraFeatIds.push(autoFeat);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Class Choices (Invocations, Blood Curses, etc.)
    const classChoicesFlat = flattenClassChoices(frontmatter["DnD_classChoices"]);
    for (const choiceEntry of classChoicesFlat) {
        if (choiceEntry.key) {
            const choiceData = await getClassChoiceData(plugin.app, fetchOptions, String(choiceEntry.key));
            if (choiceData) registerFeatureRest(choiceData);
        }
    }

    // 3. Race & Lineage Traits
    const rawRace = frontmatter["DnD_race"];
    const raceName = Array.isArray(rawRace) ? rawRace[0] : rawRace;
    const rawRaceLineage = frontmatter["DnD_raceLineage"];
    const cleanRaceLineage = rawRaceLineage && typeof rawRaceLineage === "string" ? rawRaceLineage.trim().toLowerCase() : "";
    if (raceName && typeof raceName === "string" && !raceName.trim().startsWith("<")) {
        const raceData = await getRaceData(plugin.app, fetchOptions, raceName.trim());
        const raceTraits = raceData?.traits || raceData?.features;
        if (raceData && Array.isArray(raceTraits)) {
            for (const t of raceTraits) {
                if (t.lineage && String(t.lineage).trim().toLowerCase() !== cleanRaceLineage) continue;
                registerFeatureRest(t);
                const autoFeat = await extractSingleAutoGrantedFeat(plugin, t.grantedFeats, fetchOptions, restRouterCache);
                if (autoFeat) extraFeatIds.push(autoFeat);
            }
        }
    }

    // 4. Background Feat
    const rawBg = frontmatter["DnD_background"];
    const bgName = Array.isArray(rawBg) ? rawBg[0] : rawBg;
    if (bgName && typeof bgName === "string" && !bgName.trim().startsWith("<")) {
        const bgData = await getBackgroundData(plugin.app, fetchOptions, bgName.trim());
        if (bgData && bgData.feat) {
            const bgFeat = await getExtraFeat(plugin.app, fetchOptions, String(bgData.feat));
            if (bgFeat) registerFeatureRest(bgFeat);
        }
    }

    // 5. Extra Feats
    extraFeatIds.push(...parseExtraFeatsList(frontmatter["DnD_extraFeats"]));
    for (const featId of new Set(extraFeatIds)) {
        if (!featId || featId.startsWith("<") || featId === "ability-score-improvement") continue;
        const featData = await getExtraFeat(plugin.app, fetchOptions, featId);
        if (featData) registerFeatureRest(featData);
    }
}

export async function resetCharacterRestState(
    plugin: DnDCharacterSheetHelperPlugin,
    sourcePath: string,
    restType: "short" | "long",
    extraUpdates: Record<string, any> = {}
): Promise<void> {
    await populateFeatureRestTypesForFile(plugin, sourcePath);

    let targetFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(targetFile instanceof TFile)) {
        targetFile = plugin.app.workspace.getActiveFile();
    }
    if (!(targetFile instanceof TFile)) return;

    await plugin.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, any>) => {
        for (const [k, v] of Object.entries(extraUpdates)) {
            fm[k] = v;
        }

        if (restType === "long") {
            if (extraUpdates["DnD_hitDice"] === undefined && fm["DnD_hitDice"] !== undefined) {
                const lvl = Math.max(1, Math.floor(Number(fm["DnD_level"]) || 1));
                const parsedHd = parseHitDiceState(fm["DnD_hitDice"], "d8", lvl);
                const recovered = Math.max(1, Math.floor(lvl / 2));
                const newSpent = Math.max(0, parsedHd.spent - recovered);
                fm["DnD_hitDice"] = serializeHitDiceState(parsedHd.hitDie, newSpent);
            }
            if (extraUpdates["DnD_exhaustion"] === undefined && fm["DnD_exhaustion"] !== undefined) {
                const curEx = Math.max(0, Math.min(6, Math.floor(Number(fm["DnD_exhaustion"]) || 0)));
                if (curEx > 0) fm["DnD_exhaustion"] = curEx - 1;
            }
            if (extraUpdates["DnD_tempHealth"] === undefined && fm["DnD_tempHealth"] !== undefined && Number(fm["DnD_tempHealth"]) > 0) {
                fm["DnD_tempHealth"] = 0;
            }
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
                        const featRest = plugin.featureRestTypes.get(fName.toLowerCase()) || "long";
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
