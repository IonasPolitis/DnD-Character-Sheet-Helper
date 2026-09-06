import { 
    classRegistry, 
    subclassRegistry, 
    featRegistry, 
    raceRegistry,
    itemRegistry,
    ruleRegistry,
    classesMap, 
    backgroundsMap,
    racesMap,
    itemsMap,
    rulesMap,
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
    const adapter = app.vault.adapter;
    if (await adapter.exists(fullPath)) {
        try {
            const fileContent = await adapter.read(fullPath);
            return JSON.parse(fileContent);
        } catch (e) {
            console.error(`D&D Plugin: Failed to parse custom file at ${fullPath}`, e);
            return null;
        }
    }
    return null;
}

// --- Helper: Custom Router Lookup ---
// Reads the custom router file (e.g., classes.json) to find the mapped filename
async function getCustomMappedName(app: App, basePath: string, routerFile: string, searchKey: string) {
    const routerPath = normalizePath(`${basePath}/${routerFile}`);
    const routerData = await readCustomJson(app, routerPath);
    
    if (!routerData) return null;
    return getIgnoreCase(routerData, searchKey);
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
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        const customFileId = await getCustomMappedName(app, basePath, 'classes.json', className);
        if (!customFileId) return null;
        return await readCustomJson(app, normalizePath(`${basePath}/classes/${customFileId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}

// --- Logic for Fetching Subclass Data ---
export async function getSubclassData(app: App, settings: FetchSettings, subclassFile: string, subclassName: string) {
    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const fileData = getIgnoreCase(edData.subclassRegistry, subclassFile);
            return fileData ? getIgnoreCase(fileData, subclassName) : null;
        }
        const fileData = getIgnoreCase(subclassRegistry, subclassFile);
        return fileData ? getIgnoreCase(fileData, subclassName) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        const fileData = await readCustomJson(app, normalizePath(`${basePath}/classes/${subclassFile}.json`));
        return fileData ? getIgnoreCase(fileData, subclassName) : null;
    };

    if (settings.customRulebookPath) {
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
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        return await getCustomMappedName(app, basePath, 'backgrounds.json', backgroundName);
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
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        const raceId = await getCustomMappedName(app, basePath, 'races.json', raceName);
        if (!raceId) return null;
        return await readCustomJson(app, normalizePath(`${basePath}/races/${raceId}.json`));
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
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        return await readCustomJson(app, normalizePath(`${basePath}/feats/${featId}.json`));
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
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        const itemId = await getCustomMappedName(app, basePath, 'items.json', itemName);
        if (!itemId) return null;
        return await readCustomJson(app, normalizePath(`${basePath}/items/${itemId}.json`));
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
        const basePath = settings.edition 
            ? normalizePath(`${settings.customRulebookPath}/#past-editions/${settings.edition}`)
            : settings.customRulebookPath;

        const ruleId = await getCustomMappedName(app, basePath, 'rules.json', rule);
        if (!ruleId) return null;
        return await readCustomJson(app, normalizePath(`${basePath}/rules/${ruleId}.json`));
    };

    if (settings.customRulebookPath) {
        return settings.customRulebookPriority 
            ? (await fetchCustom()) || fetchNative() 
            : fetchNative() || (await fetchCustom());
    }
    return fetchNative();
}