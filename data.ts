import { 
    classRegistry, 
    subclassRegistry, 
    classChoiceRegistry,
    featRegistry, 
    raceRegistry,
    itemRegistry,
    ruleRegistry,
    spellRegistry,
    classesMap, 
    backgroundsMap,
    racesMap,
    itemsMap,
    rulesMap,
    generalFeatsMap,
    epicBoonFeatsMap,
    spellsMap,
    pastEditionsRegistry
} from './registry';

import { App, normalizePath } from 'obsidian';

// --- Helper: Slugify a string for resilient key/filename matching ---
function toSlug(val: string): string {
    return val.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-').replace(/\.json$/i, '');
}

// --- Helper: Case-Insensitive & Slug-Aware Dictionary Lookup ---
function getIgnoreCase(registry: Record<string, any>, searchKey: any) {
    if (!registry || !searchKey) return null;

    const normalizedKey = Array.isArray(searchKey) ? searchKey[0] : searchKey;
    if (typeof normalizedKey !== 'string') return null;

    const cleanSearch = normalizedKey.trim().toLowerCase().replace(/\.json$/i, '');
    const slugSearch = toSlug(normalizedKey);

    // 1. Exact case-insensitive match
    let realKey = Object.keys(registry).find(k => k.trim().toLowerCase() === cleanSearch);

    // 2. Fallback: Slug-normalized match (handles "Alchemist's Supplies" vs "alchemists-supplies")
    if (!realKey && slugSearch) {
        realKey = Object.keys(registry).find(k => toSlug(k) === slugSearch);
    }

    return realKey ? registry[realKey] : null;
}

// --- Helper: Resolve Filename Key from a { "<filename>": "<Display Name>" } Router ---
// Accepts either a human-readable Display Name (e.g. "Gaming Set - Dice", "Blood Hunter")
// or a filename slug (e.g. "dice", "blood-hunter") and returns the router's filename key.
function resolveFileIdFromRouter(routerData: Record<string, any> | null | undefined, searchKey: any): string | null {
    if (!routerData || typeof routerData !== 'object' || !searchKey) return null;

    const rawSearch = Array.isArray(searchKey) ? searchKey[0] : searchKey;
    if (typeof rawSearch !== 'string' || !rawSearch.trim()) return null;

    const cleanSearch = rawSearch.trim().toLowerCase().replace(/\.json$/i, '');
    const slugSearch = toSlug(rawSearch);

    // 1. Check if searchKey matches a filename key directly (e.g. "blood-hunter" or "Blood Hunter" -> "blood-hunter")
    const matchedKey = Object.keys(routerData).find(
        k => k.trim().toLowerCase() === cleanSearch || toSlug(k) === slugSearch
    );
    if (matchedKey) {
        const val = routerData[matchedKey];
        // Backwards-compatibility check: if an older custom file used { "Display Name": "filename" }, return the filename value
        const keyHasSpacesOrCaps = matchedKey !== matchedKey.toLowerCase() || matchedKey.includes(' ');
        const valIsSlug = typeof val === 'string' && val === val.toLowerCase() && !val.includes(' ');
        if (keyHasSpacesOrCaps && valIsSlug) {
            return val.trim().replace(/\.json$/i, '');
        }
        return matchedKey.trim().replace(/\.json$/i, '');
    }

    // 2. Check if searchKey matches a Display Name value (e.g. "Gaming Set - Dice" -> key "dice")
    for (const [key, val] of Object.entries(routerData)) {
        if (typeof val === 'string') {
            if (val.trim().toLowerCase() === cleanSearch || toSlug(val) === slugSearch) {
                return key.trim().replace(/\.json$/i, '');
            }
        }
    }

    return null;
}

// Define the settings interface for data fetching
export interface FetchSettings { customRulebookPath: string; customRulebookPriority: boolean; edition?: string; }

// --- Helper: Safely normalize the user's Custom Rulebook base path ---
export function getCleanCustomBasePath(settings?: FetchSettings): string {
    if (!settings || !settings.customRulebookPath) return '';
    const trimmed = settings.customRulebookPath.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
    return trimmed ? normalizePath(trimmed) : '';
}

// --- Helper: Read Custom JSON File ---
export async function readCustomJson(app: App, fullPath: string) {
    const cleanPath = normalizePath(fullPath.replace(/^['"]+|['"]+$/g, '').trim());
    const adapter = app.vault.adapter;

    if (await adapter.exists(cleanPath)) {
        try {
            const fileContent = await adapter.read(cleanPath);
            return JSON.parse(fileContent);
        } catch (e) {
            console.error(`D&D Plugin: Failed to parse JSON syntax in custom file at "${cleanPath}"`, e);
            return null;
        }
    }
    return null;
}

// --- Helper: Custom Router Lookup ---
async function getCustomMappedName(app: App, basePath: string, routerFile: string, searchKey: string): Promise<string | null> {
    const routerPath = normalizePath(`${basePath}/${routerFile}`);
    const routerData = await readCustomJson(app, routerPath);
    if (!routerData) return null;
    return resolveFileIdFromRouter(routerData, searchKey);
}

// --- Helper: Execute 2-Stage Priority Lookup ---
async function resolveByPriority<T>(
    settings: FetchSettings,
    fetchNative: () => T | null,
    fetchCustom: (basePath: string) => Promise<T | null>
): Promise<T | null> {
    const basePath = getCleanCustomBasePath(settings);
    // 1st STAGE: Is the Custom Rulebook path field populated?
    if (!basePath) {
        return fetchNative();
    }
    // 2nd STAGE: Check Custom Rulebook Priority toggle
    if (settings.customRulebookPriority) {
        return (await fetchCustom(basePath)) ?? fetchNative();
    } else {
        return fetchNative() ?? (await fetchCustom(basePath));
    }
}

// --- Helper: Merge Native & Custom Router Dictionaries by Priority ---
export function mergeDictionaries(nativeObj: any, customObj: any, customPriority: boolean) {
    if (!customObj && !nativeObj) return null;
    if (!customObj) return { ...nativeObj };
    if (!nativeObj) return { ...customObj };
    return customPriority ? { ...nativeObj, ...customObj } : { ...customObj, ...nativeObj };
}

// --- Logic for Fetching Core Class Data ---
export async function getClassData(app: App, settings: FetchSettings, className: string) {
    if (!className) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const classFile = resolveFileIdFromRouter(edData.classesMap, className) || toSlug(className);
            return classFile ? getIgnoreCase(edData.classRegistry, classFile) : null;
        }
        const classFile = resolveFileIdFromRouter(classesMap as Record<string, string>, className) || toSlug(className);
        return classFile ? getIgnoreCase(classRegistry, classFile) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedId = await getCustomMappedName(app, basePath, 'classes.json', className);
        const fallbackId = resolveFileIdFromRouter(classesMap as Record<string, string>, className) || toSlug(className);
        const candidateIds = Array.from(new Set([mappedId, fallbackId, toSlug(className)].filter(Boolean))) as string[];

        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${basePath}/classes/${id}.json`);
            if (data) return data;
        }
        return null;
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Subclass Data ---
export async function getSubclassData(app: App, settings: FetchSettings, subclassFile: string, subclassName?: string) {
    if (!subclassFile) return null;
    const cleanFile = subclassFile.trim().replace(/\.json$/i, '');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const fileData = getIgnoreCase(edData.subclassRegistry, cleanFile);
            if (!fileData) return null;
            return subclassName ? getIgnoreCase(fileData, subclassName) : fileData;
        }
        const fileData = getIgnoreCase(subclassRegistry, cleanFile);
        if (!fileData) return null;
        return subclassName ? getIgnoreCase(fileData, subclassName) : fileData;
    };

    const fetchCustom = async (basePath: string) => {
        const fileData = await readCustomJson(app, `${basePath}/classes/${cleanFile}.json`);
        if (!fileData) return null;
        return subclassName ? getIgnoreCase(fileData, subclassName) : fileData;
    };

    const basePath = getCleanCustomBasePath(settings);
    // When fetching the full subclass dictionary for dropdowns (no subclassName), merge both by priority
    if (basePath && !subclassName) {
        return mergeDictionaries(fetchNative(), await fetchCustom(basePath), settings.customRulebookPriority);
    }

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Background Data ---
export async function getBackgroundData(app: App, settings: FetchSettings, backgroundName: string) {
    if (!backgroundName) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            return getIgnoreCase(pastEditionsRegistry[settings.edition].backgroundsMap, backgroundName);
        }
        return getIgnoreCase(backgroundsMap as Record<string, any>, backgroundName);
    };

    const fetchCustom = async (basePath: string) => {
        const routerData = await readCustomJson(app, `${basePath}/backgrounds.json`);
        if (!routerData) return null;
        return getIgnoreCase(routerData, backgroundName);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Race Traits ---
export async function getRaceData(app: App, settings: FetchSettings, raceName: string) {
    if (!raceName) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const raceId = resolveFileIdFromRouter(edData.racesMap, raceName) || toSlug(raceName);
            return raceId ? getIgnoreCase(edData.raceRegistry, raceId) : null;
        }
        const raceId = resolveFileIdFromRouter(racesMap as Record<string, string>, raceName) || toSlug(raceName);
        return raceId ? getIgnoreCase(raceRegistry, raceId) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedId = await getCustomMappedName(app, basePath, 'races.json', raceName);
        const fallbackId = resolveFileIdFromRouter(racesMap as Record<string, string>, raceName) || toSlug(raceName);
        const candidateIds = Array.from(new Set([mappedId, fallbackId, toSlug(raceName)].filter(Boolean))) as string[];

        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${basePath}/races/${id}.json`);
            if (data) return data;
        }
        return null;
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Extra Feats ---
export async function getExtraFeat(app: App, settings: FetchSettings, featName: string) {
    const safeName = Array.isArray(featName) ? featName[0] : featName;
    if (typeof safeName !== 'string' || !safeName.trim()) return null;
    const featId = toSlug(safeName);

    const fetchNative = () => {
        const targetRegistry = (settings.edition && pastEditionsRegistry[settings.edition])
            ? pastEditionsRegistry[settings.edition].featRegistry
            : featRegistry;

        const mappedGeneral = resolveFileIdFromRouter(generalFeatsMap, safeName);
        const mappedEpic = resolveFileIdFromRouter(epicBoonFeatsMap, safeName);
        const lookupId = mappedGeneral || mappedEpic || featId;

        const directMatch = getIgnoreCase(targetRegistry, lookupId);
        if (directMatch) return directMatch;

        // Fallback: Match by the "name" property inside the feat JSON
        if (targetRegistry && typeof targetRegistry === 'object') {
            for (const featObj of Object.values(targetRegistry)) {
                if (featObj && typeof featObj === 'object' && featObj.name && toSlug(String(featObj.name)) === featId) {
                    return featObj;
                }
            }
        }
        return null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedFromGeneral = await getCustomMappedName(app, basePath, 'general-feats.json', safeName);
        const mappedFromEpic = await getCustomMappedName(app, basePath, 'epic-boon-feats.json', safeName);
        const nativeMapped = resolveFileIdFromRouter(generalFeatsMap, safeName) || resolveFileIdFromRouter(epicBoonFeatsMap, safeName);
        const candidateIds = Array.from(new Set([mappedFromGeneral, mappedFromEpic, nativeMapped, featId].filter(Boolean))) as string[];

        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${basePath}/feats/${id}.json`);
            if (data) return data;
        }
        return null;
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Item Data ---
export async function getItemData(app: App, settings: FetchSettings, itemName: string) {
    const safeName = Array.isArray(itemName) ? itemName[0] : itemName;
    if (typeof safeName !== 'string' || !safeName.trim()) return null;
    const slugName = toSlug(safeName);

    const resolveNativeItemId = (mapObj: Record<string, string>, regObj: Record<string, any>): string | null => {
        const mapped = resolveFileIdFromRouter(mapObj, safeName);
        if (mapped && getIgnoreCase(regObj, mapped)) return mapped;
        if (getIgnoreCase(regObj, safeName)) return safeName;
        if (getIgnoreCase(regObj, slugName)) return slugName;
        return mapped;
    };

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const itemId = resolveNativeItemId(edData.itemsMap, edData.itemRegistry);
            return itemId ? getIgnoreCase(edData.itemRegistry, itemId) : null;
        }
        const itemId = resolveNativeItemId(itemsMap as Record<string, string>, itemRegistry);
        return itemId ? getIgnoreCase(itemRegistry, itemId) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedId = await getCustomMappedName(app, basePath, 'items.json', safeName);
        const nativeMappedId = resolveFileIdFromRouter(itemsMap as Record<string, string>, safeName);
        const candidateIds = Array.from(new Set([mappedId, nativeMappedId, slugName].filter(Boolean))) as string[];

        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${basePath}/items/${id}.json`);
            if (data) return data;
        }
        return null;
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Rule Data ---
export async function getRuleData(app: App, settings: FetchSettings, rule: string) {
    if (!rule) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const ruleId = resolveFileIdFromRouter(edData.rulesMap, rule) || toSlug(rule);
            return ruleId ? getIgnoreCase(edData.ruleRegistry, ruleId) : null;
        }
        const ruleId = resolveFileIdFromRouter(rulesMap as Record<string, string>, rule) || toSlug(rule);
        return ruleId ? getIgnoreCase(ruleRegistry, ruleId) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedId = await getCustomMappedName(app, basePath, 'rules.json', rule);
        const fallbackId = resolveFileIdFromRouter(rulesMap as Record<string, string>, rule) || toSlug(rule);
        const candidateIds = Array.from(new Set([mappedId, fallbackId, toSlug(rule)].filter(Boolean))) as string[];

        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${basePath}/rules/${id}.json`);
            if (data) return data;
        }
        return null;
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Helper: Resolve a Spell ID from a Display Name or Key using spellsMap ---
function resolveSpellIdFromMap(mapRegistry: Record<string, any>, targetRegistry: Record<string, any>, searchName: string): string | null {
    const cleanSearch = searchName.trim();
    const slugSearch = toSlug(cleanSearch);

    if (getIgnoreCase(targetRegistry, cleanSearch)) return cleanSearch;
    if (getIgnoreCase(targetRegistry, slugSearch)) return slugSearch;

    if (mapRegistry && typeof mapRegistry === 'object') {
        for (const poolData of Object.values(mapRegistry)) {
            if (!poolData || typeof poolData !== 'object') continue;
            for (const levelGroup of Object.values(poolData)) {
                if (!levelGroup || typeof levelGroup !== 'object') continue;
                const foundId = resolveFileIdFromRouter(levelGroup as Record<string, string>, cleanSearch);
                if (foundId) return foundId;
            }
        }
    }
    return null;
}

// --- Logic for Fetching Spell Pool Router Maps (e.g., warlock-spells.json) ---
export async function getSpellsPoolData(app: App, settings: FetchSettings, spellsPoolFile: string) {
    if (!spellsPoolFile) return null;
    const cleanFile = spellsPoolFile.trim().replace(/\.json$/i, '');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const edPool = getIgnoreCase(edData.spellsMap, cleanFile);
            if (edPool) return edPool;
        }
        return getIgnoreCase(spellsMap, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        return (await readCustomJson(app, `${basePath}/spells/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/${cleanFile}.json`));
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const nativePool = fetchNative();
        const customPool = await fetchCustom(basePath);
        if (!customPool || !nativePool) return customPool || nativePool;

        // Merge each spell level ("0".."9") according to Custom Rulebook Priority
        const mergedPool: Record<string, any> = {};
        const allLevels = new Set([...Object.keys(nativePool), ...Object.keys(customPool)]);
        for (const lvl of allLevels) {
            mergedPool[lvl] = mergeDictionaries(nativePool[lvl], customPool[lvl], settings.customRulebookPriority);
        }
        return mergedPool;
    }
    return fetchNative();
}

// --- Logic for Fetching Individual Spell Data ---
export async function getSpellData(app: App, settings: FetchSettings, spellName: string) {
    const safeName = Array.isArray(spellName) ? spellName[0] : spellName;
    if (typeof safeName !== 'string' || !safeName.trim()) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const edSpellId = resolveSpellIdFromMap(edData.spellsMap, edData.spellRegistry, safeName);
            if (edSpellId) {
                const edSpell = getIgnoreCase(edData.spellRegistry, edSpellId);
                if (edSpell) return edSpell;
            }
        }
        const spellId = resolveSpellIdFromMap(spellsMap, spellRegistry, safeName);
        return spellId ? getIgnoreCase(spellRegistry, spellId) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const slugId = toSlug(safeName);
        return await readCustomJson(app, `${basePath}/spells/${slugId}.json`);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Class Choice Data (Routers & Individual Choices) ---
export async function getClassChoiceData(app: App, settings: FetchSettings, choiceFileName: string) {
    if (!choiceFileName) return null;
    const cleanFile = choiceFileName.trim().replace(/\.json$/i, '');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]?.classChoiceRegistry) {
            const edChoice = getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRegistry, cleanFile)
                || getIgnoreCase(pastEditionsRegistry[settings.edition].classRegistry, cleanFile);
            if (edChoice) return edChoice;
        }
        return getIgnoreCase(classChoiceRegistry, cleanFile) || getIgnoreCase(classRegistry, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        return (await readCustomJson(app, `${basePath}/classes/classChoices/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/classes/${cleanFile}.json`));
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const nativeData = fetchNative();
        const customData = await fetchCustom(basePath);

        // If this file is a Router Map (no "name" or "description" property), merge keys by priority
        const isRouter = (obj: any) => obj && typeof obj === 'object' && !Array.isArray(obj) && obj.name === undefined && obj.description === undefined;
        if (isRouter(nativeData) || isRouter(customData)) {
            return mergeDictionaries(nativeData, customData, settings.customRulebookPriority);
        }

        return settings.customRulebookPriority
            ? (customData ?? nativeData)
            : (nativeData ?? customData);
    }
    return fetchNative();
}

// --- Logic for Fetching Feat Category Router Maps (general-feats.json & epic-boon-feats.json) ---
export async function getFeatMapData(app: App, settings: FetchSettings, featMapName: string) {
    if (!featMapName) return null;
    const cleanKey = featMapName.trim().toLowerCase().replace(/\.json$/i, '');
    const featRouters: Record<string, any> = {
        "general-feats": generalFeatsMap,
        "epic-boon-feats": epicBoonFeatsMap
    };

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            if (cleanKey === "general-feats" && edData.generalFeatsMap && Object.keys(edData.generalFeatsMap).length > 0) {
                return edData.generalFeatsMap;
            }
            if (cleanKey === "epic-boon-feats" && edData.epicBoonFeatsMap && Object.keys(edData.epicBoonFeatsMap).length > 0) {
                return edData.epicBoonFeatsMap;
            }
        }
        return featRouters[cleanKey] || null;
    };

    const fetchCustom = async (basePath: string) => {
        return (await readCustomJson(app, `${basePath}/${cleanKey}.json`))
            ?? (await readCustomJson(app, `${basePath}/feats/${cleanKey}.json`));
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        return mergeDictionaries(fetchNative(), await fetchCustom(basePath), settings.customRulebookPriority);
    }
    return fetchNative();
}