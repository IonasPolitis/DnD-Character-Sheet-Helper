// Import everything from our new auto-generated file
import { 
    classRegistry, 
    subclassRegistry, 
    featRegistry, 
    classesMap, 
    backgroundsMap 
} from './registry';

// --- Logic for Fetching Core Class Data ---
export function getClassData(className: string) {
    const classFile = (classesMap as Record<string, string>)[className];
    if (!classFile) return null;
    
    return classRegistry[classFile];
}

// --- Logic for Fetching Subclass Data ---
export function getSubclassData(subclassFile: string, subclassName: string) {
    const fileData = subclassRegistry[subclassFile];
    if (!fileData) return null;
    
    return fileData[subclassName];
}

// --- Logic for Fetching Background Feats ---
export function getBackgroundFeat(backgroundName: string) {
    const featId = (backgroundsMap as Record<string, string>)[backgroundName];
    if (!featId) return null;
    
    return featRegistry[featId];
}