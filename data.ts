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

// --- Helper: Case-Insensitive Lookup ---
// This function searches a dictionary for a key, ignoring capitalization and safely handling Obsidian lists.
function getIgnoreCase(registry: Record<string, any>, searchKey: any) {
    // Safety check in case a registry or key is completely missing
    if (!registry || !searchKey) return null;
    
    // Obsidian properties often format single items as lists (arrays). 
    // If searchKey is an array (like ["Orc"]), we extract the first item ("Orc").
    const normalizedKey = Array.isArray(searchKey) ? searchKey[0] : searchKey;
    
    // If it is still not a string after normalizing, abort safely
    if (typeof normalizedKey !== 'string') return null;
    
    // Find a key in the registry where the lowercase versions match perfectly
    const realKey = Object.keys(registry).find(k => k.toLowerCase() === normalizedKey.toLowerCase());
    
    // If we found a match, return the data using the correct case key
    return realKey ? registry[realKey] : null;
}

// Define a quick interface so TypeScript knows what our settings look like
interface FetchSettings { customRulebookPath: string; customRulebookPriority: boolean; edition?: string; }

// --- Helper: Read Custom JSON File ---
async function readCustomJson(app: App, fullPath: string) {
    // Strip any accidental quotes or leading/trailing slashes and normalize the vault path
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
    } else {
        console.warn(`D&D Plugin: Custom Rulebook file not found at vault path: "${cleanPath}"`);
    }
    return null;
}

// --- Helper: Custom Router Lookup ---
// Reads the custom router file (e.g., classes.json, items.json) to find the mapped filename
async function getCustomMappedName(app: App, basePath: string, routerFile: string, searchKey: string) {
    const routerPath = normalizePath(`${basePath}/${routerFile}`);
    const routerData = await readCustomJson(app, routerPath);
    if (!routerData || typeof routerData !== 'object') return null;

    const normalizedKey = Array.isArray(searchKey) ? searchKey[0] : searchKey;
    if (typeof normalizedKey !== 'string') return null;

    // 1. Check if searchKey is already a mapped filename value in the router (just like getItemData does for itemsMap)
    const matchedValue = Object.values(routerData).find(
        v => typeof v === 'string' && v.toLowerCase() === normalizedKey.toLowerCase()
    );
    if (typeof matchedValue === 'string') return matchedValue;

    // 2. Otherwise look up the key by display name (case-insensitive)
    return getIgnoreCase(routerData, normalizedKey);
}

// --- Helper: Merge Native & Custom Router Dictionaries by Priority ---
function mergeDictionaries(nativeObj: any, customObj: any, customPriority: boolean) {
    if (!customObj && !nativeObj) return null;
    if (!customObj) return nativeObj;
    if (!nativeObj) return customObj;
    return customPriority ? { ...nativeObj, ...customObj } : { ...customObj, ...nativeObj };
}

// --- Logic for Fetching Core Class Data ---
export async function getClassData(app: App, settings: FetchSettings, className: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const classFile = getIgnoreCase(edData.classesMap, className);
            return classFile ? getIgnoreCase(edData.classRegistry, classFile) : null;
        }
        const classFile = getIgnoreCase(classesMap as Record<string, string>, className);
        return classFile ? getIgnoreCase(classRegistry, classFile) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const customFileId = await getCustomMappedName(app, settings.customRulebookPath, 'classes.json', className);
        if (!customFileId) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/classes/${customFileId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Subclass Data ---
export async function getSubclassData(app: App, settings: FetchSettings, subclassFile: string, subclassName?: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const fileData = getIgnoreCase(edData.subclassRegistry, subclassFile);
            if (!fileData) return null;
            return subclassName ? getIgnoreCase(fileData, subclassName) : fileData;
        }
        const fileData = getIgnoreCase(subclassRegistry, subclassFile);
        if (!fileData) return null;
        return subclassName ? getIgnoreCase(fileData, subclassName) : fileData;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const fileData = await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/classes/${subclassFile}.json`));
        if (!fileData) return null;
        return subclassName ? getIgnoreCase(fileData, subclassName) : fileData;
    };

    if (settings.customRulebookPath) {
        // When fetching the full subclass dictionary for dropdowns (no subclassName), merge both so custom subclasses appear
        if (!subclassName) {
            return mergeDictionaries(fetchNative(), await fetchCustom(), settings.customRulebookPriority);
        }
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Background Data ---
export async function getBackgroundData(app: App, settings: FetchSettings, backgroundName: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            return getIgnoreCase(pastEditionsRegistry[settings.edition].backgroundsMap, backgroundName);
        }
        return getIgnoreCase(backgroundsMap as Record<string, any>, backgroundName);
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        return await getCustomMappedName(app, settings.customRulebookPath, 'backgrounds.json', backgroundName);
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Race Traits ---
export async function getRaceData(app: App, settings: FetchSettings, raceName: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const raceId = getIgnoreCase(edData.racesMap, raceName);
            return raceId ? getIgnoreCase(edData.raceRegistry, raceId) : null;
        }
        const raceId = getIgnoreCase(racesMap as Record<string, string>, raceName);
        return raceId ? getIgnoreCase(raceRegistry, raceId) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const raceId = await getCustomMappedName(app, settings.customRulebookPath, 'races.json', raceName);
        if (!raceId) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/races/${raceId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Extra Feats ---
export async function getExtraFeat(app: App, settings: FetchSettings, featName: string) {
    const safeName = Array.isArray(featName) ? featName[0] : featName;
    if (typeof safeName !== 'string') return null;
    const featId = safeName.toLowerCase().replace(/\s+/g, '-');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            return getIgnoreCase(pastEditionsRegistry[settings.edition].featRegistry, featId);
        }
        return getIgnoreCase(featRegistry, featId);
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/feats/${featId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Item Data ---
export async function getItemData(app: App, settings: FetchSettings, itemName: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const isAlreadyFilename = Object.values(edData.itemsMap).includes(itemName);
            const itemId = isAlreadyFilename ? itemName : getIgnoreCase(edData.itemsMap, itemName);
            return itemId ? getIgnoreCase(edData.itemRegistry, itemId) : null;
        }
        const isAlreadyFilename = Object.values(itemsMap).includes(itemName);
        const itemId = isAlreadyFilename ? itemName : getIgnoreCase(itemsMap as Record<string, string>, itemName);
        return itemId ? getIgnoreCase(itemRegistry, itemId) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const itemId = await getCustomMappedName(app, settings.customRulebookPath, 'items.json', itemName);
        if (!itemId) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/items/${itemId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Rule Data ---
export async function getRuleData(app: App, settings: FetchSettings, rule: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const ruleId = getIgnoreCase(edData.rulesMap, rule);
            return ruleId ? getIgnoreCase(edData.ruleRegistry, ruleId) : null;
        }
        const ruleId = getIgnoreCase(rulesMap as Record<string, string>, rule);
        return ruleId ? getIgnoreCase(ruleRegistry, ruleId) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const ruleId = await getCustomMappedName(app, settings.customRulebookPath, 'rules.json', rule);
        if (!ruleId) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/rules/${ruleId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Helper: Resolve a Spell ID from a Display Name or Key using spellsMap ---
function resolveSpellIdFromMap(mapRegistry: Record<string, any>, targetRegistry: Record<string, any>, searchName: string): string | null {
    const cleanSearch = searchName.trim();
    const slugSearch = cleanSearch.toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-');

    // 1. Direct filename match in spellRegistry (e.g., "eldritch-blast")
    if (getIgnoreCase(targetRegistry, cleanSearch)) return cleanSearch;
    if (getIgnoreCase(targetRegistry, slugSearch)) return slugSearch;

    // 2. Search inside spellsMap routers (where each level "0".."9" maps { "spell-id": "Spell Name" } or { "Spell Name": "spell-id" })
    if (mapRegistry && typeof mapRegistry === 'object') {
        for (const poolData of Object.values(mapRegistry)) {
            if (!poolData || typeof poolData !== 'object') continue;
            for (const levelGroup of Object.values(poolData)) {
                if (!levelGroup || typeof levelGroup !== 'object') continue;
                for (const [key, val] of Object.entries(levelGroup as Record<string, string>)) {
                    if (key.toLowerCase() === cleanSearch.toLowerCase() || key.toLowerCase() === slugSearch) {
                        return key;
                    }
                    if (typeof val === 'string' && val.toLowerCase() === cleanSearch.toLowerCase()) {
                        return key;
                    }
                }
            }
        }
    }
    return null;
}

// --- Logic for Fetching Spell Pool Router Maps (e.g., warlock-spells.json) ---
export async function getSpellsPoolData(app: App, settings: FetchSettings, spellsPoolFile: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const edPool = getIgnoreCase(edData.spellsMap, spellsPoolFile);
            if (edPool) return edPool;
        }
        return getIgnoreCase(spellsMap, spellsPoolFile);
    };

    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/spells/${spellsPoolFile}.json`));
    };

    if (settings.customRulebookPath) {
        const nativePool = fetchNative();
        const customPool = await fetchCustom();
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

    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const slugId = safeName.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-');
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/spells/${slugId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority
            ? (await fetchCustom()) || fetchNative()
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Class Choice Data (Routers & Individual Choices) ---
export async function getClassChoiceData(app: App, settings: FetchSettings, choiceFileName: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]?.classChoiceRegistry) {
            const edChoice = getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRegistry, choiceFileName);
            if (edChoice) return edChoice;
        }
        return getIgnoreCase(classChoiceRegistry, choiceFileName);
    };

    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/classes/classChoices/${choiceFileName}.json`));
    };

    if (settings.customRulebookPath) {
        const nativeData = fetchNative();
        const customData = await fetchCustom();

        // If this file is a Router Map (no "name" or "description" property), merge keys by priority
        const isRouter = (obj: any) => obj && typeof obj === 'object' && !Array.isArray(obj) && obj.name === undefined && obj.description === undefined;
        if (isRouter(nativeData) || isRouter(customData)) {
            return mergeDictionaries(nativeData, customData, settings.customRulebookPriority);
        }

        return settings.customRulebookPriority
            ? customData || nativeData
            : nativeData || customData;
    }
    return fetchNative();
}

// --- Logic for Fetching Feat Category Router Maps (general-feats.json & epic-boon-feats.json) ---
export async function getFeatMapData(app: App, settings: FetchSettings, featMapName: string) {
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

    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/${cleanKey}.json`));
    };

    if (settings.customRulebookPath) {
        return mergeDictionaries(fetchNative(), await fetchCustom(), settings.customRulebookPriority);
    }
    return fetchNative();
}