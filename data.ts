import { 
    classRegistry, 
    subclassRegistry, 
    classChoiceRegistry,
    classChoiceRouterRegistry,
    featRegistry, 
    featRouterRegistry,
    raceRegistry,
    racialSpellsRegistry,
    itemRegistry,
    ruleRegistry,
    spellRegistry,
    classesMap, 
    backgroundsMap,
    racesMap,
    itemsMap,
    rulesMap,
    weaponMasteriesMap,
    spellsMap,
    pastEditionsRegistry
} from './registry';

export {
    classRegistry,
    subclassRegistry,
    classChoiceRegistry,
    classChoiceRouterRegistry,
    featRegistry,
    featRouterRegistry,
    raceRegistry,
    racialSpellsRegistry,
    itemRegistry,
    ruleRegistry,
    spellRegistry,
    classesMap,
    backgroundsMap,
    racesMap,
    itemsMap,
    rulesMap,
    weaponMasteriesMap,
    spellsMap
};

import { App, normalizePath } from 'obsidian';

// --- Helper: Slugify a string for resilient key/filename matching ---
// Accepts raw frontmatter values too: Obsidian list properties arrive as arrays (e.g. ["Orc"]),
// so we unwrap the first entry instead of crashing on `.trim()` of a non-string.
export function toSlug(val: any): string {
    const raw = Array.isArray(val) ? val[0] : val;
    if (typeof raw !== 'string') return '';
    return raw.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-').replace(/\.json$/i, '');
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
export async function getRaceData(app: App, settings: FetchSettings, raceInput: any) {
    // Normalize Obsidian list properties (["Orc"]) into a single clean string, same as classes
    const rawRace = Array.isArray(raceInput) ? raceInput.find(r => typeof r === 'string' && r.trim()) : raceInput;
    if (typeof rawRace !== 'string' || !rawRace.trim()) return null;
    const raceName = rawRace.trim();

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

// --- Logic for Fetching Racial Spells Router Maps (e.g., elf-spells.json) ---
export async function getRacialSpellsData(app: App, settings: FetchSettings, racialSpellsFile: string) {
    if (!racialSpellsFile || typeof racialSpellsFile !== 'string') return null;
    const cleanFile = racialSpellsFile.trim().replace(/\.json$/i, '');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const edSpells = getIgnoreCase(edData.racialSpellsRegistry, cleanFile);
            if (edSpells) return edSpells;
        }
        return getIgnoreCase(racialSpellsRegistry, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        return (await readCustomJson(app, `${basePath}/races/racialSpells/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/races/${cleanFile}.json`));
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

export function toNormalizedFeatSlug(val: any): string {
    return toSlug(val).replace(/[()]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function isFeatRouterObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (
        obj.name !== undefined ||
        obj.description !== undefined ||
        obj.category !== undefined ||
        obj.uses !== undefined ||
        obj.improveAbility !== undefined ||
        obj.speedMod !== undefined ||
        obj.initiativeMod !== undefined ||
        obj.weaponMastery !== undefined ||
        obj.proficiencySavingThrow !== undefined ||
        obj.grantedExpertise !== undefined
    ) {
        return false;
    }
    return Object.values(obj).every(v => typeof v === 'string');
}

function resolveFileIdFromRouterMap(routers: Record<string, any> | undefined, searchKey: string): string | null {
    if (!routers || typeof routers !== 'object') return null;
    for (const routerDict of Object.values(routers)) {
        const matched = resolveFileIdFromRouter(routerDict, searchKey);
        if (matched) return matched;
    }
    return null;
}

async function listCustomFeatRouters(app: App, basePath: string): Promise<{ id: string; data: Record<string, any> }[]> {
    const out: { id: string; data: Record<string, any> }[] = [];
    const routersDir = normalizePath(`${basePath}/feats/featRouters`);
    try {
        if (await app.vault.adapter.exists(routersDir)) {
            const listed = await app.vault.adapter.list(routersDir);
            for (const filePath of listed.files || []) {
                if (!filePath.toLowerCase().endsWith('.json')) continue;
                const data = await readCustomJson(app, filePath);
                if (isFeatRouterObject(data)) {
                    const fileName = filePath.split('/').pop() || '';
                    out.push({ id: toSlug(fileName), data });
                }
            }
        }
    } catch (e) {
        console.error(`D&D Plugin: Could not list custom feat routers in "${routersDir}"`, e);
    }
    return out;
}

// --- Logic for Fetching Extra Feats ---
export async function getExtraFeat(app: App, settings: FetchSettings, featName: string) {
    const safeName = Array.isArray(featName) ? featName[0] : featName;
    if (typeof safeName !== 'string' || !safeName.trim()) return null;
    const rawStem = safeName.trim().replace(/\.json$/i, '');
    const featId = toSlug(safeName);
    const normSlug = toNormalizedFeatSlug(safeName);

    const fetchNative = () => {
        const edData = (settings.edition && pastEditionsRegistry[settings.edition]) ? pastEditionsRegistry[settings.edition] : null;
        const targetRegistry = edData ? edData.featRegistry : featRegistry;

        const mappedEdRouter = edData
            ? (resolveFileIdFromRouterMap(edData.featRouterRegistry, safeName)
                || resolveFileIdFromRouter(edData.generalFeatsMap, safeName)
                || resolveFileIdFromRouter(edData.epicBoonFeatsMap, safeName))
            : null;
        const mappedNativeRouter = resolveFileIdFromRouterMap(featRouterRegistry, safeName);
        const lookupCandidates = Array.from(new Set([mappedEdRouter, mappedNativeRouter, featId, normSlug].filter(Boolean))) as string[];

        for (const cand of lookupCandidates) {
            const directMatch = getIgnoreCase(targetRegistry, cand);
            if (directMatch) return directMatch;
        }

        // Fallback: Match by the "name" property inside the feat JSON
        if (targetRegistry && typeof targetRegistry === 'object') {
            for (const featObj of Object.values(targetRegistry)) {
                const fRec = featObj as Record<string, any>;
                if (fRec && typeof fRec === 'object' && fRec.name) {
                    const objSlug = toSlug(String(fRec.name));
                    const objNorm = toNormalizedFeatSlug(String(fRec.name));
                    if (objSlug === featId || (normSlug && objNorm === normSlug)) {
                        return fRec;
                    }
                }
            }
        }
        return null;
    };

    const fetchCustom = async (basePath: string) => {
        const customRouters = await listCustomFeatRouters(app, basePath);
        let customRouterMapped: string | null = null;
        for (const r of customRouters) {
            const matched = resolveFileIdFromRouter(r.data, safeName);
            if (matched) {
                customRouterMapped = matched;
                break;
            }
        }
        const nativeMapped = resolveFileIdFromRouterMap(featRouterRegistry, safeName);
        const candidateIds = Array.from(new Set([customRouterMapped, nativeMapped, rawStem, featId, normSlug].filter(Boolean))) as string[];

        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${basePath}/feats/${id}.json`);
            if (data) return data;
        }

        // Fallback: Match by "name" inside <customRulebook>/feats/*.json (parity with native feat & Class lookups)
        const featsDir = normalizePath(`${basePath}/feats`);
        try {
            if (await app.vault.adapter.exists(featsDir)) {
                const listed = await app.vault.adapter.list(featsDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const data = await readCustomJson(app, filePath);
                    if (data && typeof data === 'object' && !Array.isArray(data) && data.name) {
                        const objSlug = toSlug(String(data.name));
                        const objNorm = toNormalizedFeatSlug(String(data.name));
                        if (objSlug === featId || (normSlug && objNorm === normSlug)) {
                            return data;
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`D&D Plugin: Could not scan custom feats in "${featsDir}"`, e);
        }

        return null;
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

export interface FeatPoolEntry {
    id: string;
    name: string;
    category: string;
}

const NON_SELECTABLE_FEAT_IDS = new Set([
    "ability-score-improvement"
]);

// --- Logic for Listing All Selectable Feats (Native + Custom Rulebook) ---
export async function getAvailableFeats(app: App, settings: FetchSettings): Promise<FeatPoolEntry[]> {
    const featsMap = new Map<string, FeatPoolEntry>();
    const excludedIds = new Set<string>(NON_SELECTABLE_FEAT_IDS);
    Object.keys(featRouterRegistry || {}).forEach(k => {
        const s = toSlug(k);
        if (s) excludedIds.add(s);
    });

    const targetRegistry = (settings.edition && pastEditionsRegistry[settings.edition])
        ? pastEditionsRegistry[settings.edition].featRegistry
        : featRegistry;

    if (targetRegistry && typeof targetRegistry === 'object') {
        for (const [rawKey, rawObj] of Object.entries(targetRegistry)) {
            const id = toSlug(rawKey);
            if (!id || excludedIds.has(id)) continue;
            const featObj = rawObj as Record<string, any>;
            if (!featObj || typeof featObj !== 'object' || featObj.hide === true) continue;
            const name = String(featObj.name || rawKey).trim();
            const category = String(featObj.category || "Feat").trim();
            featsMap.set(id, { id, name, category });
        }
    }

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const customRouters = await listCustomFeatRouters(app, basePath);
        customRouters.forEach(r => { if (r.id) excludedIds.add(r.id); });

        const featsDir = normalizePath(`${basePath}/feats`);
        try {
            if (await app.vault.adapter.exists(featsDir)) {
                const listed = await app.vault.adapter.list(featsDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const fileName = filePath.split('/').pop() || '';
                    const id = toSlug(fileName);
                    if (!id || excludedIds.has(id)) continue;

                    const featObj = await readCustomJson(app, filePath);
                    if (!featObj || typeof featObj !== 'object' || Array.isArray(featObj) || isFeatRouterObject(featObj)) continue;

                    if (featObj.hide === true) {
                        if (settings.customRulebookPriority) featsMap.delete(id);
                        continue;
                    }

                    if (settings.customRulebookPriority || !featsMap.has(id)) {
                        const name = String(featObj.name || fileName.replace(/\.json$/i, '')).trim();
                        const category = String(featObj.category || "Custom Feat").trim();
                        featsMap.set(id, { id, name, category });
                    }
                }
            }
        } catch (e) {
            console.error(`D&D Plugin: Could not list custom feats in "${featsDir}"`, e);
        }
    }

    return Array.from(featsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
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
        return (await readCustomJson(app, `${basePath}/spells/spellPools/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/spells/${cleanFile}.json`))
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

// --- Logic for Fetching Class Choice Router Maps (rulebook/classes/classChoices/classRouterFiles/*.json) ---
export async function getClassChoiceRouterData(app: App, settings: FetchSettings, routerFileName: string) {
    if (!routerFileName) return null;
    const cleanFile = routerFileName.trim().replace(/\.json$/i, '');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]?.classChoiceRouterRegistry) {
            const edRouter = getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRouterRegistry, cleanFile)
                || getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRegistry, cleanFile);
            if (edRouter) return edRouter;
        }
        return getIgnoreCase(classChoiceRouterRegistry, cleanFile) || getIgnoreCase(classChoiceRegistry, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        return (await readCustomJson(app, `${basePath}/classes/classChoices/classRouterFiles/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/classes/classChoices/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/classes/${cleanFile}.json`));
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const nativeData = fetchNative();
        const customData = await fetchCustom(basePath);
        return mergeDictionaries(nativeData, customData, settings.customRulebookPriority);
    }
    return fetchNative();
}

// --- Logic for Fetching Individual Class Choice Data (rulebook/classes/classChoices/*.json) ---
export async function getClassChoiceData(app: App, settings: FetchSettings, choiceFileName: string) {
    if (!choiceFileName) return null;
    const cleanFile = choiceFileName.trim().replace(/\.json$/i, '');

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]?.classChoiceRegistry) {
            const edChoice = getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRegistry, cleanFile)
                || getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRouterRegistry, cleanFile)
                || getIgnoreCase(pastEditionsRegistry[settings.edition].classRegistry, cleanFile);
            if (edChoice) return edChoice;
        }
        return getIgnoreCase(classChoiceRegistry, cleanFile)
            || getIgnoreCase(classChoiceRouterRegistry, cleanFile)
            || getIgnoreCase(classRegistry, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        return (await readCustomJson(app, `${basePath}/classes/classChoices/${cleanFile}.json`))
            ?? (await readCustomJson(app, `${basePath}/classes/classChoices/classRouterFiles/${cleanFile}.json`))
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

// --- Logic for Fetching Feat Category Router Maps (rulebook/feats/featRouters/*.json) ---
export async function getFeatMapData(app: App, settings: FetchSettings, featMapName: string) {
    if (!featMapName) return null;
    const cleanKey = featMapName.trim().toLowerCase().replace(/\.json$/i, '');
    const slugKey = toSlug(cleanKey);

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            if (edData.featRouterRegistry) {
                const edRouter = getIgnoreCase(edData.featRouterRegistry, cleanKey)
                    || (slugKey ? getIgnoreCase(edData.featRouterRegistry, slugKey) : null);
                if (edRouter) return edRouter;
            }
            if (cleanKey === "general-feats" && edData.generalFeatsMap && Object.keys(edData.generalFeatsMap).length > 0) {
                return edData.generalFeatsMap;
            }
            if (cleanKey === "epic-boon-feats" && edData.epicBoonFeatsMap && Object.keys(edData.epicBoonFeatsMap).length > 0) {
                return edData.epicBoonFeatsMap;
            }
        }
        return getIgnoreCase(featRouterRegistry, cleanKey)
            || (slugKey ? getIgnoreCase(featRouterRegistry, slugKey) : null)
            || null;
    };

    const fetchCustom = async (basePath: string) => {
        const candidates = Array.from(new Set([cleanKey, slugKey].filter(Boolean)));
        for (const key of candidates) {
            const data = await readCustomJson(app, `${basePath}/feats/featRouters/${key}.json`);
            if (data && isFeatRouterObject(data)) {
                return data;
            }
        }
        return null;
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        return mergeDictionaries(fetchNative(), await fetchCustom(basePath), settings.customRulebookPriority);
    }
    return fetchNative();
}

// --- Logic for Fetching Weapon Masteries Dictionary (weapon-masteries.json) ---
export async function getWeaponMasteriesMap(app: App, settings: FetchSettings): Promise<Record<string, string>> {
    const fetchNative = (): Record<string, string> => (weaponMasteriesMap as Record<string, string>) || {};
    const basePath = getCleanCustomBasePath(settings);
    if (!basePath) {
        return { ...fetchNative() };
    }
    const customData = await readCustomJson(app, `${basePath}/weapon-masteries.json`);
    if (customData && typeof customData === 'object' && !Array.isArray(customData)) {
        return mergeDictionaries(fetchNative(), customData, settings.customRulebookPriority) || {};
    }
    return { ...fetchNative() };
}

// --- Helper: Resolve a single Weapon Mastery property from weapon-masteries.json ---
// Returns null if the mastery is not found in weapon-masteries.json so unrecognized masteries are hidden.
export async function getWeaponMasteryDescription(
    app: App,
    settings: FetchSettings,
    masteryName: any
): Promise<{ name: string; description: string } | null> {
    if (!masteryName || typeof masteryName !== 'string' || !masteryName.trim()) return null;
    const cleanTarget = masteryName.trim().toLowerCase();
    const map = await getWeaponMasteriesMap(app, settings);
    if (!map || typeof map !== 'object') return null;

    for (const [key, desc] of Object.entries(map)) {
        if (key.trim().toLowerCase() === cleanTarget && typeof desc === 'string' && desc.trim() !== '') {
            return { name: key.trim(), description: desc.trim() };
        }
    }
    return null;
}

// --- Helper: Build Markdown Content for weapon-masteries.md from a weapon-masteries.json Dictionary ---
export function buildWeaponMasteriesMarkdown(masteriesMap: Record<string, string>): string {
    const lines = [
        '## WEAPON MASTERY PROPERTIES',
        '---',
        'Each weapon has a Mastery property, which is usable only by a character who has a feature, such as Weapon Mastery, that unlocks the property for the character. The properties are defined below in alphabetical order.'
    ];
    if (masteriesMap && typeof masteriesMap === 'object') {
        Object.keys(masteriesMap)
            .sort((a, b) => a.localeCompare(b))
            .forEach(key => {
                const desc = String(masteriesMap[key] || '').trim();
                if (!desc) return;
                lines.push('');
                lines.push(`#### ${key.toUpperCase()}`);
                lines.push(desc);
            });
    }
    return lines.join('\n') + '\n';
}

// ============================================================================
// --- COMPENDIUM BULK LOADERS (Native Registry + Custom Rulebook Merging) ---
// ============================================================================

export interface CompendiumRuleEntry {
    id: string;
    groupId: string;
    groupName: string;
    name: string;
    badge?: string;
    description: string;
}

/**
 * Loads all Rule groups and individual rules across `ruleRegistry` + Custom Rulebook `rules/*.json`.
 */
export async function getAllCompendiumRules(app: App, settings: FetchSettings): Promise<CompendiumRuleEntry[]> {
    const groupsMap = new Map<string, any>();

    if (ruleRegistry && typeof ruleRegistry === 'object') {
        for (const [key, data] of Object.entries(ruleRegistry)) {
            const id = toSlug(key);
            if (id && data && typeof data === 'object') {
                groupsMap.set(id, data);
            }
        }
    }

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const rulesDir = normalizePath(`${basePath}/rules`);
        try {
            if (await app.vault.adapter.exists(rulesDir)) {
                const listed = await app.vault.adapter.list(rulesDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const fileName = filePath.split('/').pop() || '';
                    const id = toSlug(fileName);
                    if (!id) continue;
                    const customObj = await readCustomJson(app, filePath);
                    if (!customObj || typeof customObj !== 'object') continue;
                    if (settings.customRulebookPriority || !groupsMap.has(id)) {
                        groupsMap.set(id, customObj);
                    }
                }
            }
        } catch (e) {
            console.error(`D&D Plugin: Could not list custom rules in "${rulesDir}"`, e);
        }
    }

    const entries: CompendiumRuleEntry[] = [];
    for (const [groupId, groupData] of groupsMap.entries()) {
        const groupName = String(groupData?.name || groupId).trim();
        const rulesArr = Array.isArray(groupData?.rules) ? groupData.rules : [];
        if (rulesArr.length > 0) {
            for (const ruleItem of rulesArr) {
                if (!ruleItem || typeof ruleItem !== 'object') continue;
                const rName = String(ruleItem.name || '').trim();
                const rDesc = String(ruleItem.description || '').trim();
                if (!rName && !rDesc) continue;
                entries.push({
                    id: `${groupId}::${toSlug(rName || groupName)}`,
                    groupId,
                    groupName,
                    name: rName || groupName,
                    badge: ruleItem.badge ? String(ruleItem.badge).trim() : groupName,
                    description: rDesc
                });
            }
        } else if (groupData?.description) {
            entries.push({
                id: groupId,
                groupId,
                groupName,
                name: groupName,
                badge: groupData.badge ? String(groupData.badge).trim() : "Rule",
                description: String(groupData.description).trim()
            });
        }
    }

    return entries;
}

export interface CompendiumSpellEntry {
    id: string;
    name: string;
    level: number;
    school: string;
    castingTime: string;
    range: string;
    components: string[];
    materials?: string;
    duration: string;
    concentration: boolean;
    ritual: boolean;
    description: string;
    pools: string[];
    classes: string[];
}

/**
 * Loads all spells from `spellRegistry` + Custom Rulebook `spells/*.json`, annotated with their spell pools.
 */
export async function getAllCompendiumSpells(app: App, settings: FetchSettings): Promise<CompendiumSpellEntry[]> {
    const spellsById = new Map<string, any>();

    if (spellRegistry && typeof spellRegistry === 'object') {
        for (const [key, data] of Object.entries(spellRegistry)) {
            const id = toSlug(key);
            if (id && data && typeof data === 'object') {
                spellsById.set(id, data);
            }
        }
    }

    // Build reverse map: spellSlug -> Set of pool names
    const spellPoolsBySlug = new Map<string, Set<string>>();
    const registerPoolDict = (poolKey: string, poolObj: any) => {
        if (!poolObj || typeof poolObj !== 'object') return;
        const cleanPool = poolKey.replace(/\.json$/i, '');
        for (const lvlGroup of Object.values(poolObj)) {
            if (!lvlGroup || typeof lvlGroup !== 'object') continue;
            for (const spellKey of Object.keys(lvlGroup as Record<string, string>)) {
                const sSlug = toSlug(spellKey);
                if (!sSlug) continue;
                if (!spellPoolsBySlug.has(sSlug)) spellPoolsBySlug.set(sSlug, new Set());
                spellPoolsBySlug.get(sSlug)!.add(cleanPool);
            }
        }
    };

    if (spellsMap && typeof spellsMap === 'object') {
        for (const [poolKey, poolObj] of Object.entries(spellsMap)) {
            registerPoolDict(poolKey, poolObj);
        }
    }
    if (racialSpellsRegistry && typeof racialSpellsRegistry === 'object') {
        for (const [poolKey, poolObj] of Object.entries(racialSpellsRegistry)) {
            registerPoolDict(poolKey, poolObj);
        }
    }

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const spellsDir = normalizePath(`${basePath}/spells`);
        try {
            if (await app.vault.adapter.exists(spellsDir)) {
                const listed = await app.vault.adapter.list(spellsDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const fileName = filePath.split('/').pop() || '';
                    const id = toSlug(fileName);
                    if (!id) continue;
                    const customObj = await readCustomJson(app, filePath);
                    if (!customObj || typeof customObj !== 'object' || Array.isArray(customObj)) continue;
                    // Skip router pool files inside /spells if they don't look like a spell object
                    if (customObj.name === undefined && customObj.description === undefined) {
                        registerPoolDict(id, customObj);
                        continue;
                    }
                    if (settings.customRulebookPriority || !spellsById.has(id)) {
                        spellsById.set(id, customObj);
                    }
                }
            }
        } catch (e) {
            console.error(`D&D Plugin: Could not list custom spells in "${spellsDir}"`, e);
        }

        const poolsDir = normalizePath(`${basePath}/spells/spellPools`);
        try {
            if (await app.vault.adapter.exists(poolsDir)) {
                const listed = await app.vault.adapter.list(poolsDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const fileName = filePath.split('/').pop() || '';
                    const id = toSlug(fileName);
                    const poolObj = await readCustomJson(app, filePath);
                    if (id && poolObj) registerPoolDict(id, poolObj);
                }
            }
        } catch {
            /* ignore */
        }
    }

    const result: CompendiumSpellEntry[] = [];
    for (const [id, data] of spellsById.entries()) {
        if (!data || typeof data !== 'object') continue;
        const pools = Array.from(spellPoolsBySlug.get(id) || []);
        const inferredClasses = pools
            .filter(p => p.endsWith('-spells'))
            .map(p => p.replace(/-spells$/i, ''))
            .map(c => c.charAt(0).toUpperCase() + c.slice(1));
        const rawClasses = Array.isArray(data.classes)
            ? data.classes.map((c: any) => String(c).trim()).filter(Boolean)
            : (typeof data.classes === 'string' ? data.classes.split(',').map((c: string) => c.trim()).filter(Boolean) : []);
        const allClasses = Array.from(new Set([...rawClasses, ...inferredClasses]));

        result.push({
            id,
            name: String(data.name || id).trim(),
            level: Number(data.level) || 0,
            school: String(data.school || 'Universal').trim(),
            castingTime: String(data.castingTime || 'Action').trim(),
            range: String(data.range || 'Self').trim(),
            components: Array.isArray(data.components)
                ? data.components.map((c: any) => String(c).trim())
                : (typeof data.components === 'string' ? [data.components] : []),
            materials: data.materials ? String(data.materials).trim() : undefined,
            duration: String(data.duration || 'Instantaneous').trim(),
            concentration: Boolean(data.concentration),
            ritual: Boolean(data.ritual),
            description: String(data.description || '').trim(),
            pools,
            classes: allClasses
        });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loads all Classes and their Subclasses across `classRegistry`/`subclassRegistry` + Custom Rulebook.
 */
export async function getAllCompendiumClasses(app: App, settings: FetchSettings): Promise<{
    classes: { id: string; name: string; data: any }[];
    subclasses: { id: string; name: string; parentClassName: string; subclassFile: string; data: any }[];
}> {
    let mergedClassMap: Record<string, string> = { ...(classesMap as Record<string, string>) };
    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const customClassesRouter = await readCustomJson(app, `${basePath}/classes.json`);
        if (customClassesRouter && typeof customClassesRouter === 'object') {
            mergedClassMap = mergeDictionaries(mergedClassMap, customClassesRouter, settings.customRulebookPriority) || mergedClassMap;
        }
    }

    const classes: { id: string; name: string; data: any }[] = [];
    const subclasses: { id: string; name: string; parentClassName: string; subclassFile: string; data: any }[] = [];
    const seenSubclassFiles = new Set<string>();

    for (const [fileId, displayName] of Object.entries(mergedClassMap)) {
        const cleanId = toSlug(fileId);
        const classData = await getClassData(app, settings, displayName || cleanId);
        if (!classData || typeof classData !== 'object') continue;
        const cName = String(classData.name || displayName || cleanId).trim();
        classes.push({ id: cleanId, name: cName, data: classData });

        // Discover subclass file referenced by any level in the class progression
        let subclassFile = '';
        for (const [lvlKey, lvlObj] of Object.entries(classData)) {
            if (!/^\d+$/.test(lvlKey) || !lvlObj || typeof lvlObj !== 'object') continue;
            if ((lvlObj as any).subclass && typeof (lvlObj as any).subclass === 'string') {
                subclassFile = String((lvlObj as any).subclass).trim().replace(/\.json$/i, '');
                break;
            }
        }
        if (!subclassFile) subclassFile = `${cleanId}-subclasses`;

        if (subclassFile && !seenSubclassFiles.has(subclassFile)) {
            seenSubclassFiles.add(subclassFile);
            const subDict = await getSubclassData(app, settings, subclassFile);
            if (subDict && typeof subDict === 'object') {
                for (const [subKey, subObj] of Object.entries(subDict)) {
                    if (!subObj || typeof subObj !== 'object') continue;
                    const subName = String((subObj as any).name || subKey).trim();
                    subclasses.push({
                        id: `${cleanId}::${toSlug(subKey)}`,
                        name: subName,
                        parentClassName: cName,
                        subclassFile,
                        data: subObj
                    });
                }
            }
        }
    }

    classes.sort((a, b) => a.name.localeCompare(b.name));
    subclasses.sort((a, b) => a.name.localeCompare(b.name));
    return { classes, subclasses };
}

/**
 * Loads all Class Choices (Eldritch Invocations, Metamagic, Maneuvers, etc.) from `classChoiceRegistry` + Custom Rulebook.
 */
export async function getAllCompendiumClassChoices(app: App, settings: FetchSettings): Promise<{
    id: string;
    name: string;
    category: string;
    prerequisite?: string;
    description: string;
    data: any;
}[]> {
    const choicePoolBySlug = new Map<string, string>();
    if (classChoiceRouterRegistry && typeof classChoiceRouterRegistry === 'object') {
        for (const [routerKey, routerDict] of Object.entries(classChoiceRouterRegistry)) {
            if (!routerDict || typeof routerDict !== 'object') continue;
            const poolLabel = routerKey
                .replace(/\.json$/i, '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
            for (const itemKey of Object.keys(routerDict)) {
                choicePoolBySlug.set(toSlug(itemKey), poolLabel);
            }
        }
    }

    const choicesMap = new Map<string, any>();
    if (classChoiceRegistry && typeof classChoiceRegistry === 'object') {
        for (const [key, data] of Object.entries(classChoiceRegistry)) {
            const id = toSlug(key);
            if (id && data && typeof data === 'object' && (data.name !== undefined || data.description !== undefined)) {
                choicesMap.set(id, data);
            }
        }
    }

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const choicesDir = normalizePath(`${basePath}/classes/classChoices`);
        try {
            if (await app.vault.adapter.exists(choicesDir)) {
                const listed = await app.vault.adapter.list(choicesDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const fileName = filePath.split('/').pop() || '';
                    const id = toSlug(fileName);
                    if (!id) continue;
                    const customObj = await readCustomJson(app, filePath);
                    if (!customObj || typeof customObj !== 'object' || Array.isArray(customObj)) continue;
                    if (customObj.name === undefined && customObj.description === undefined) continue;
                    if (settings.customRulebookPriority || !choicesMap.has(id)) {
                        choicesMap.set(id, customObj);
                    }
                }
            }
        } catch {
            /* ignore */
        }
    }

    const out: {
        id: string;
        name: string;
        category: string;
        prerequisite?: string;
        description: string;
        data: any;
    }[] = [];

    for (const [id, data] of choicesMap.entries()) {
        const name = String(data.name || id).trim();
        const category = String(data.category || choicePoolBySlug.get(id) || 'Class Option').trim();
        out.push({
            id,
            name,
            category,
            prerequisite: data.prerequisite ? String(data.prerequisite).trim() : undefined,
            description: String(data.description || '').trim(),
            data
        });
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loads all Races & Lineages across `racesMap`/`raceRegistry` + Custom Rulebook.
 */
export async function getAllCompendiumRaces(app: App, settings: FetchSettings): Promise<{ id: string; name: string; data: any }[]> {
    let mergedRacesMap: Record<string, string> = { ...(racesMap as Record<string, string>) };
    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const customRacesRouter = await readCustomJson(app, `${basePath}/races.json`);
        if (customRacesRouter && typeof customRacesRouter === 'object') {
            mergedRacesMap = mergeDictionaries(mergedRacesMap, customRacesRouter, settings.customRulebookPriority) || mergedRacesMap;
        }
    }

    const races: { id: string; name: string; data: any }[] = [];
    for (const [fileId, displayName] of Object.entries(mergedRacesMap)) {
        const cleanId = toSlug(fileId);
        const raceData = await getRaceData(app, settings, displayName || cleanId);
        if (!raceData || typeof raceData !== 'object') continue;
        races.push({
            id: cleanId,
            name: String(raceData.name || displayName || cleanId).trim(),
            data: raceData
        });
    }

    return races.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loads all Backgrounds across `backgroundsMap` + Custom Rulebook `backgrounds.json`.
 */
export async function getAllCompendiumBackgrounds(app: App, settings: FetchSettings): Promise<{ id: string; name: string; data: any }[]> {
    let mergedBgMap: Record<string, any> = { ...(backgroundsMap as Record<string, any>) };
    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const customBg = await readCustomJson(app, `${basePath}/backgrounds.json`);
        if (customBg && typeof customBg === 'object') {
            mergedBgMap = mergeDictionaries(mergedBgMap, customBg, settings.customRulebookPriority) || mergedBgMap;
        }
    }

    const out: { id: string; name: string; data: any }[] = [];
    for (const [bgName, bgData] of Object.entries(mergedBgMap)) {
        if (!bgData || typeof bgData !== 'object') continue;
        out.push({
            id: toSlug(bgName),
            name: String(bgData.name || bgName).trim(),
            data: bgData
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loads all Equipment Items across `itemRegistry` + Custom Rulebook `items/*.json`.
 */
export async function getAllCompendiumItems(app: App, settings: FetchSettings): Promise<{ id: string; name: string; data: any }[]> {
    const itemsById = new Map<string, any>();
    if (itemRegistry && typeof itemRegistry === 'object') {
        for (const [key, data] of Object.entries(itemRegistry)) {
            const id = toSlug(key);
            if (id && data && typeof data === 'object') {
                itemsById.set(id, data);
            }
        }
    }

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const itemsDir = normalizePath(`${basePath}/items`);
        try {
            if (await app.vault.adapter.exists(itemsDir)) {
                const listed = await app.vault.adapter.list(itemsDir);
                for (const filePath of listed.files || []) {
                    if (!filePath.toLowerCase().endsWith('.json')) continue;
                    const fileName = filePath.split('/').pop() || '';
                    const id = toSlug(fileName);
                    if (!id) continue;
                    const customObj = await readCustomJson(app, filePath);
                    if (!customObj || typeof customObj !== 'object' || Array.isArray(customObj)) continue;
                    if (settings.customRulebookPriority || !itemsById.has(id)) {
                        itemsById.set(id, customObj);
                    }
                }
            }
        } catch {
            /* ignore */
        }
    }

    const out: { id: string; name: string; data: any }[] = [];
    for (const [id, data] of itemsById.entries()) {
        out.push({
            id,
            name: String(data.name || id).trim(),
            data
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
