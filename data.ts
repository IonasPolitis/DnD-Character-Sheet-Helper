// Import everything from our new auto-generated file
import { 
    classRegistry, 
    subclassRegistry, 
    featRegistry, 
    raceRegistry,
    classesMap, 
    backgroundsMap,
    racesMap
} from './registry';

// --- Helper: Case-Insensitive Lookup ---
// This function searches a dictionary for a key, ignoring capitalization.
function getIgnoreCase(registry: Record<string, any>, searchKey: string) {
    if (!searchKey || typeof searchKey !== 'string') return null;
    
    // Find a key in the registry where the lowercase versions match perfectly
    const realKey = Object.keys(registry).find(k => k.toLowerCase() === searchKey.toLowerCase());
    
    // If we found a match, return the data using the correct case key
    return realKey ? registry[realKey] : null;
}

// --- Logic for Fetching Core Class Data ---
export function getClassData(className: string) {
    const classFile = getIgnoreCase(classesMap as Record<string, string>, className);
    if (!classFile) return null;
    
    // Double safety: Ignores capitalization on the actual filename lookup!
    return getIgnoreCase(classRegistry, classFile);
}

// --- Logic for Fetching Subclass Data ---
export function getSubclassData(subclassFile: string, subclassName: string) {
    const fileData = getIgnoreCase(subclassRegistry, subclassFile);
    if (!fileData) return null;
    
    return getIgnoreCase(fileData, subclassName);
}

// --- Logic for Fetching Background Feats ---
export function getBackgroundFeat(backgroundName: string) {
    const featId = getIgnoreCase(backgroundsMap as Record<string, string>, backgroundName);
    if (!featId) return null;
    
    return getIgnoreCase(featRegistry, featId);
}

// --- Logic for Fetching Race Traits ---
export function getRaceData(raceName: string) {
    const raceId = getIgnoreCase(racesMap as Record<string, string>, raceName);
    if (!raceId) return null;
    
    return getIgnoreCase(raceRegistry, raceId);
}

// --- Logic for Fetching Extra Feats ---
export function getExtraFeat(featName: string) {
    return getIgnoreCase(featRegistry, featName);
}