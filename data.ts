// --- Upper Routers ---
import classesMap from './rulebook/classes.json';

// --- Class Data ---
import monkData from './rulebook/classes/monk.json';
import monkSubclassesData from './rulebook/classes/monk-subclasses.json';

// --- (Future Imports will go here) ---
// import racesMap from './rulebook/races.json';
// import backgroundsMap from './rulebook/backgrounds.json';
// import luckyFeatData from './rulebook/feats/lucky.json';

// We map the string from classes.json to the actual imported JSON object
const classDataRegistry: Record<string, any> = {
    "monk": monkData,
    // "fighter": fighterData,
};

export function getClassData(className: string) {
    // 1. Find the internal ID from classes.json (e.g., "Monk" -> "monk")
    const internalId = (classesMap as Record<string, string>)[className];
    
    if (!internalId) return null;

    // 2. Return the actual data object
    return classDataRegistry[internalId];
}

// Map the router string from the class JSON to the actual subclass file
const subclassDataRegistry: Record<string, any> = {
    "monk-subclasses": monkSubclassesData,
};

export function getSubclassData(subclassFile: string, subclassName: string) {
    const fileData = subclassDataRegistry[subclassFile];
    if (!fileData) return null;
    
    // Return the specific subclass object (e.g., "Warrior of Mercy")
    return fileData[subclassName];
}