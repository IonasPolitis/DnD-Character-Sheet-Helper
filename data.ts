import classesMap from './classes.json';
import monkData from './monk.json';
// You will import the rest of your JSON files here as you create them! (e.g., import fighterData from './fighter.json')

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