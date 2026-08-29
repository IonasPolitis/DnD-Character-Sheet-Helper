import { 
    classRegistry, 
    subclassRegistry, 
    featRegistry, 
    raceRegistry,
    itemRegistry,
    classesMap, 
    backgroundsMap,
    racesMap,
    itemsMap
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
interface FetchSettings { customRulebookPath: string; customRulebookPriority: boolean; }

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

// --- Logic for Fetching Core Class Data ---// --- Logic for Fetching Core Class Data ---
export async function getClassData(app: App, settings: FetchSettings, className: string) {
    const fetchNative = () => {
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
        if (settings.customRulebookPriority) {
            // Custom Priority ON: Check Custom -> Check Native
            return (await fetchCustom()) || fetchNative();
        } else {
            // Custom Priority OFF: Check Native -> Check Custom
            return fetchNative() || (await fetchCustom());
        }
    }
    // No custom path set: Native only
    return fetchNative();
}

// --- Logic for Fetching Subclass Data ---
export async function getSubclassData(app: App, settings: FetchSettings, subclassFile: string, subclassName: string) {
    const fetchNative = () => {
        const fileData = getIgnoreCase(subclassRegistry, subclassFile);
        return fileData ? getIgnoreCase(fileData, subclassName) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        // Subclasses are stored directly inside the class file
        const fileData = await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/classes/${subclassFile}.json`));
        return fileData ? getIgnoreCase(fileData, subclassName) : null;
    };

    if (settings.customRulebookPath) {
        if (settings.customRulebookPriority) {
            return (await fetchCustom()) || fetchNative();
        } else {
            return fetchNative() || (await fetchCustom());
        }
    }
    return fetchNative();
}

// --- Logic for Fetching Background Feats ---
export async function getBackgroundFeat(app: App, settings: FetchSettings, backgroundName: string) {
    const fetchNative = () => {
        const featId = getIgnoreCase(backgroundsMap as Record<string, string>, backgroundName);
        return featId ? getIgnoreCase(featRegistry, featId) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        const featId = await getCustomMappedName(app, settings.customRulebookPath, 'backgrounds.json', backgroundName);
        if (!featId) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/feats/${featId}.json`));
    };

    if (settings.customRulebookPath) {
        if (settings.customRulebookPriority) {
            return (await fetchCustom()) || fetchNative();
        } else {
            return fetchNative() || (await fetchCustom());
        }
    }
    return fetchNative();
}

// --- Logic for Fetching Race Traits ---
export async function getRaceData(app: App, settings: FetchSettings, raceName: string) {
    const fetchNative = () => {
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
        if (settings.customRulebookPriority) {
            return (await fetchCustom()) || fetchNative();
        } else {
            return fetchNative() || (await fetchCustom());
        }
    }
    return fetchNative();
}

// --- Logic for Fetching Extra Feats ---
export async function getExtraFeat(app: App, settings: FetchSettings, featName: string) {
    const safeName = Array.isArray(featName) ? featName[0] : featName;
    if (typeof safeName !== 'string') return null;

    // Move featId UP so both Native and Custom fetchers can use the slugified name!
    const featId = safeName.toLowerCase().replace(/\s+/g, '-');

    // Bug Fix: fetchNative now correctly searches using featId instead of the raw safeName
    const fetchNative = () => getIgnoreCase(featRegistry, featId);
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        // Feats don't have a router in your structure, so we look them up by formatting the name directly
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/feats/${featId}.json`));
    };

    if (settings.customRulebookPath) {
        if (settings.customRulebookPriority) {
            return (await fetchCustom()) || fetchNative();
        } else {
            return fetchNative() || (await fetchCustom());
        }
    }
    return fetchNative();
}

// --- Logic for Fetching Item Data ---
export async function getItemData(app: App, settings: FetchSettings, itemName: string) {
    const fetchNative = () => {
        // Look up the raw item name in the items.json router to find the exact filename
        const itemId = getIgnoreCase(itemsMap as Record<string, string>, itemName);
        return itemId ? getIgnoreCase(itemRegistry, itemId) : null;
    };
    
    const fetchCustom = async () => {
        if (!settings.customRulebookPath) return null;
        // Use the custom router to find the mapped filename in the user's vault
        const itemId = await getCustomMappedName(app, settings.customRulebookPath, 'items.json', itemName);
        if (!itemId) return null;
        return await readCustomJson(app, normalizePath(`${settings.customRulebookPath}/items/${itemId}.json`));
    };

    if (settings.customRulebookPath) {
        if (settings.customRulebookPriority) {
            // Custom Priority ON: Check Custom -> Check Native
            return (await fetchCustom()) || fetchNative();
        } else {
            // Custom Priority OFF: Check Native -> Check Custom
            return fetchNative() || (await fetchCustom());
        }
    }
    // No custom path set: Native only
    return fetchNative();
}