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

// --- Helper: Safely unwrap the first non-empty string from a string or YAML list ---
function unwrapFirstString(val: any): string {
    if (Array.isArray(val)) {
        for (const item of val) {
            const nested = unwrapFirstString(item);
            if (nested) return nested;
        }
        return '';
    }
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return String(val).trim();
    return '';
}

// --- Helper: Strip trailing parenthetical qualifiers like "Actor (Level 4+, Charisma 13+)" -> "Actor" ---
function stripParens(val: string): string {
    return val.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

// --- Helper: Slugify a string for resilient key/filename matching ---
// Accepts raw frontmatter values too: Obsidian list properties arrive as arrays (e.g. ["Orc"]),
// so we unwrap the first entry instead of crashing on `.trim()` of a non-string.
function toSlug(val: any): string {
    const raw = unwrapFirstString(val);
    if (!raw) return '';
    return raw
        .toLowerCase()
        .replace(/['’"]/g, '')
        .replace(/\.json$/i, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// --- Helper: Case-Insensitive & Slug-Aware Dictionary Lookup ---
function getIgnoreCase(registry: Record<string, any>, searchKey: any) {
    if (!registry || typeof registry !== 'object' || !searchKey) return null;

    const normalizedKey = unwrapFirstString(searchKey);
    if (!normalizedKey) return null;

    const cleanSearch = normalizedKey.toLowerCase().replace(/\.json$/i, '');
    const slugSearch = toSlug(normalizedKey);
    const strippedSlug = toSlug(stripParens(normalizedKey));

    // 1. Exact case-insensitive match
    let realKey = Object.keys(registry).find(k => k.trim().toLowerCase().replace(/\.json$/i, '') === cleanSearch);

    // 2. Fallback: Slug-normalized match (handles "Alchemist's Supplies" vs "alchemists-supplies" vs "alchemists_supplies")
    if (!realKey && slugSearch) {
        realKey = Object.keys(registry).find(k => toSlug(k) === slugSearch);
    }

    // 3. Fallback: Parenthetical-stripped slug match
    if (!realKey && strippedSlug) {
        realKey = Object.keys(registry).find(k => toSlug(stripParens(k)) === strippedSlug);
    }

    return realKey ? registry[realKey] : null;
}

// --- Helper: Extract all candidate file IDs from a { "<filename>": "<Display Name>" } (or reversed) Router ---
function resolveCandidatesFromRouter(routerData: Record<string, any> | null | undefined, searchKey: any): string[] {
    if (!routerData || typeof routerData !== 'object' || !searchKey) return [];

    const rawSearch = unwrapFirstString(searchKey);
    if (!rawSearch) return [];

    const cleanSearch = rawSearch.toLowerCase().replace(/\.json$/i, '');
    const slugSearch = toSlug(rawSearch);
    const strippedSearch = stripParens(rawSearch).toLowerCase().replace(/\.json$/i, '');
    const strippedSlug = toSlug(stripParens(rawSearch));

    const candidates: string[] = [];
    const addCandidate = (c: any) => {
        if (typeof c !== 'string') return;
        const trimmed = c.trim().replace(/\.json$/i, '');
        if (!trimmed) return;
        if (!candidates.includes(trimmed)) candidates.push(trimmed);
        const slug = toSlug(trimmed);
        if (slug && !candidates.includes(slug)) candidates.push(slug);
    };

    const matchesTarget = (str: string): boolean => {
        const clean = str.trim().toLowerCase().replace(/\.json$/i, '');
        const slug = toSlug(str);
        const noParensClean = stripParens(str).toLowerCase().replace(/\.json$/i, '');
        const noParensSlug = toSlug(stripParens(str));
        return (
            clean === cleanSearch ||
            (Boolean(slugSearch) && slug === slugSearch) ||
            (Boolean(strippedSearch) && noParensClean === strippedSearch) ||
            (Boolean(strippedSlug) && noParensSlug === strippedSlug)
        );
    };

    for (const [key, val] of Object.entries(routerData)) {
        const keyMatches = matchesTarget(key);
        const valMatches = typeof val === 'string' && matchesTarget(val);

        if (keyMatches || valMatches) {
            if (typeof val === 'string') {
                const keyLooksLikeDisplay = key !== key.toLowerCase() || key.includes(' ');
                const valLooksLikeFile = !val.includes(' ');
                if (keyLooksLikeDisplay && valLooksLikeFile) {
                    addCandidate(val);
                    addCandidate(key);
                } else {
                    addCandidate(key);
                    addCandidate(val);
                }
            } else {
                addCandidate(key);
            }
        }
    }

    return candidates;
}

// --- Helper: Resolve Primary Filename Key from a { "<filename>": "<Display Name>" } Router ---
function resolveFileIdFromRouter(routerData: Record<string, any> | null | undefined, searchKey: any): string | null {
    const candidates = resolveCandidatesFromRouter(routerData, searchKey);
    return candidates.length > 0 ? candidates[0] : null;
}

// Define the settings interface for data fetching
export interface FetchSettings { customRulebookPath: string; customRulebookPriority: boolean; edition?: string; }

// --- Helper: Safely normalize the user's Custom Rulebook base path ---
export function getCleanCustomBasePath(settings?: FetchSettings): string {
    if (!settings || !settings.customRulebookPath) return '';
    const trimmed = settings.customRulebookPath.replace(/^['"]+|['"]+$/g, '').trim().replace(/^\/+|\/+$/g, '');
    return trimmed ? normalizePath(trimmed) : '';
}

// --- Helper: Tolerant JSON parser for user-authored Custom Rulebook files ---
// Supports standard JSON as well as README template conventions (// and /* */ comments,
// trailing commas before } or ], UTF-8 BOM, and raw tabs/newlines inside strings).
export function parseCustomJsonText(fileContent: string): any {
    const cleanText = fileContent.replace(/^\uFEFF/, '');
    try {
        return JSON.parse(cleanText);
    } catch {
        // Sanitize comments, unescaped control chars inside strings, and trailing commas
        let sanitized = '';
        let inString = false;
        let escaped = false;
        const len = cleanText.length;

        for (let i = 0; i < len; i++) {
            const ch = cleanText[i];
            const next = i + 1 < len ? cleanText[i + 1] : '';

            if (!inString) {
                if (ch === '/' && next === '/') {
                    i += 2;
                    while (i < len && cleanText[i] !== '\n') i++;
                    if (i < len) sanitized += '\n';
                    continue;
                }
                if (ch === '/' && next === '*') {
                    i += 2;
                    while (i + 1 < len && !(cleanText[i] === '*' && cleanText[i + 1] === '/')) i++;
                    i += 1;
                    continue;
                }
                if (ch === '"') {
                    inString = true;
                }
                sanitized += ch;
            } else {
                if (escaped) {
                    escaped = false;
                    sanitized += ch;
                } else if (ch === '\\') {
                    escaped = true;
                    sanitized += ch;
                } else if (ch === '"') {
                    inString = false;
                    sanitized += ch;
                } else if (ch === '\t') {
                    sanitized += '\\t';
                } else if (ch === '\n') {
                    sanitized += '\\n';
                } else if (ch === '\r') {
                    continue;
                } else {
                    sanitized += ch;
                }
            }
        }

        sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(sanitized);
    }
}

// --- Helper: Read Custom JSON File (with case-insensitive vault path fallback) ---
export async function readCustomJson(app: App, fullPath: string) {
    const cleanPath = normalizePath(fullPath.replace(/^['"]+|['"]+$/g, '').trim());
    const adapter = app.vault.adapter;

    let targetPath: string | null = null;
    if (await adapter.exists(cleanPath)) {
        targetPath = cleanPath;
    } else if (app.vault && typeof app.vault.getFiles === 'function') {
        const lowerClean = cleanPath.toLowerCase();
        const matchedFile = app.vault.getFiles().find(f => f.path.toLowerCase() === lowerClean);
        if (matchedFile) {
            targetPath = matchedFile.path;
        }
    }

    if (targetPath) {
        try {
            const fileContent = await adapter.read(targetPath);
            return parseCustomJsonText(fileContent);
        } catch (e) {
            console.error(`D&D Plugin: Failed to parse JSON syntax in custom file at "${targetPath}"`, e);
            return null;
        }
    }
    return null;
}

// --- Helper: Custom Router Lookup (returns all candidate file IDs) ---
async function getCustomMappedCandidates(app: App, basePath: string, routerFile: string, searchKey: any): Promise<string[]> {
    const routerPath = normalizePath(`${basePath}/${routerFile}`);
    const routerData = await readCustomJson(app, routerPath);
    if (!routerData) return [];
    return resolveCandidatesFromRouter(routerData, searchKey);
}

// --- Helper: Build deduplicated candidate list from routers + raw search term ---
function buildCandidateIds(searchKey: any, ...candidateLists: (string | null | undefined | string[])[]): string[] {
    const result: string[] = [];
    const pushId = (val: any) => {
        if (!val) return;
        if (Array.isArray(val)) {
            val.forEach(pushId);
            return;
        }
        if (typeof val !== 'string') return;
        const clean = val.trim().replace(/\.json$/i, '');
        if (clean && !result.includes(clean)) result.push(clean);
        const slug = toSlug(clean);
        if (slug && !result.includes(slug)) result.push(slug);
    };

    candidateLists.forEach(pushId);
    const rawStr = unwrapFirstString(searchKey);
    if (rawStr) {
        pushId(rawStr);
        pushId(stripParens(rawStr));
    }
    return result;
}

// --- Helper: Scan a Custom Rulebook subfolder by filename (case/slug-insensitive) or internal JSON property ---
async function findCustomJsonInFolder(
    app: App,
    basePath: string,
    subfolders: string | string[],
    candidateIds: string[],
    internalNameFields: string[] = [],
    validator?: (data: any) => boolean
): Promise<any | null> {
    if (!basePath || candidateIds.length === 0) return null;

    const isValid = (data: any): boolean => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        return validator ? validator(data) : true;
    };

    const folderList = Array.isArray(subfolders) ? subfolders : [subfolders];
    const adapter = app.vault.adapter;

    // 1. Fast path: Direct file path check for each folder and candidate ID
    for (const folder of folderList) {
        const prefix = folder ? `${basePath}/${folder}` : basePath;
        for (const id of candidateIds) {
            const data = await readCustomJson(app, `${prefix}/${id}.json`);
            if (isValid(data)) return data;
        }
    }

    // 2. Collect all .json files in the target custom subfolders
    const jsonPaths = new Set<string>();
    const targetFolderPrefixes = folderList.map(f => normalizePath(f ? `${basePath}/${f}` : basePath).toLowerCase());

    if (app.vault && typeof app.vault.getFiles === 'function') {
        for (const file of app.vault.getFiles()) {
            if (!file.path.toLowerCase().endsWith('.json')) continue;
            const parentPath = file.parent ? normalizePath(file.parent.path).toLowerCase() : '';
            if (targetFolderPrefixes.includes(parentPath)) {
                jsonPaths.add(file.path);
            }
        }
    }

    for (const folder of folderList) {
        const dirPath = normalizePath(folder ? `${basePath}/${folder}` : basePath);
        try {
            if (await adapter.exists(dirPath) && typeof (adapter as any).list === 'function') {
                const listed = await (adapter as any).list(dirPath);
                if (listed && Array.isArray(listed.files)) {
                    for (const fPath of listed.files) {
                        if (typeof fPath === 'string' && fPath.toLowerCase().endsWith('.json')) {
                            jsonPaths.add(normalizePath(fPath));
                        }
                    }
                }
            }
        } catch {
            // Ignore adapter.list errors and rely on vault file list
        }
    }

    if (jsonPaths.size === 0) return null;

    const lowerCandidates = new Set(candidateIds.map(c => c.toLowerCase()));
    const slugCandidates = new Set(candidateIds.map(c => toSlug(c)).filter(Boolean));

    // 3. Match by filename (case-insensitive or slug-insensitive)
    for (const filePath of jsonPaths) {
        const fileName = (filePath.split('/').pop() || '').replace(/\.json$/i, '');
        if (lowerCandidates.has(fileName.toLowerCase()) || slugCandidates.has(toSlug(fileName))) {
            const data = await readCustomJson(app, filePath);
            if (isValid(data)) return data;
        }
    }

    // 4. Match by internal name property inside the JSON (e.g. "class", "race", "name", "feat")
    if (internalNameFields.length > 0) {
        const lowerFieldSet = new Set(internalNameFields.map(f => f.toLowerCase()));
        for (const filePath of jsonPaths) {
            const data = await readCustomJson(app, filePath);
            if (!isValid(data)) continue;

            for (const [k, v] of Object.entries(data)) {
                if (!lowerFieldSet.has(k.toLowerCase()) || typeof v !== 'string') continue;
                const cleanVal = v.trim();
                if (
                    lowerCandidates.has(cleanVal.toLowerCase()) ||
                    lowerCandidates.has(stripParens(cleanVal).toLowerCase()) ||
                    slugCandidates.has(toSlug(cleanVal)) ||
                    slugCandidates.has(toSlug(stripParens(cleanVal)))
                ) {
                    return data;
                }
            }
        }
    }

    return null;
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
export async function getClassData(app: App, settings: FetchSettings, className: any) {
    const cleanClassName = unwrapFirstString(className);
    if (!cleanClassName) return null;

    const isClassObj = (d: any) => Boolean(
        d && typeof d === 'object' && !Array.isArray(d) &&
        (d.features !== undefined || d.Features !== undefined || d.class !== undefined || d.Class !== undefined || d.hitDice !== undefined || d.HitDice !== undefined)
    );

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const classFile = resolveFileIdFromRouter(edData.classesMap, cleanClassName) || toSlug(cleanClassName);
            return classFile ? getIgnoreCase(edData.classRegistry, classFile) : null;
        }
        const classFile = resolveFileIdFromRouter(classesMap as Record<string, string>, cleanClassName) || toSlug(cleanClassName);
        return classFile ? getIgnoreCase(classRegistry, classFile) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedIds = await getCustomMappedCandidates(app, basePath, 'classes.json', cleanClassName);
        const nativeIds = resolveCandidatesFromRouter(classesMap as Record<string, string>, cleanClassName);
        const candidateIds = buildCandidateIds(cleanClassName, mappedIds, nativeIds);

        return await findCustomJsonInFolder(app, basePath, ['classes', ''], candidateIds, ['class', 'name'], isClassObj);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Subclass Data ---
export async function getSubclassData(app: App, settings: FetchSettings, subclassFile: any, subclassName?: any) {
    const cleanFile = unwrapFirstString(subclassFile).replace(/\.json$/i, '');
    if (!cleanFile) return null;
    const cleanSubName = unwrapFirstString(subclassName);

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const fileData = getIgnoreCase(edData.subclassRegistry, cleanFile);
            if (!fileData) return null;
            return cleanSubName ? getIgnoreCase(fileData, cleanSubName) : fileData;
        }
        const fileData = getIgnoreCase(subclassRegistry, cleanFile);
        if (!fileData) return null;
        return cleanSubName ? getIgnoreCase(fileData, cleanSubName) : fileData;
    };

    const fetchCustom = async (basePath: string) => {
        const candidateIds = buildCandidateIds(cleanFile);
        const fileData = await findCustomJsonInFolder(
            app,
            basePath,
            ['classes', 'classes/subclasses', 'subclasses', ''],
            candidateIds,
            [],
            (d) => d && typeof d === 'object' && !Array.isArray(d)
        );
        if (!fileData) return null;
        return cleanSubName ? getIgnoreCase(fileData, cleanSubName) : fileData;
    };

    const basePath = getCleanCustomBasePath(settings);
    // When fetching the full subclass dictionary for dropdowns (no subclassName), merge both by priority
    if (basePath && !cleanSubName) {
        return mergeDictionaries(fetchNative(), await fetchCustom(basePath), settings.customRulebookPriority);
    }

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Background Data ---
export async function getBackgroundData(app: App, settings: FetchSettings, backgroundInput: any) {
    const backgroundName = unwrapFirstString(backgroundInput);
    if (!backgroundName) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            return getIgnoreCase(pastEditionsRegistry[settings.edition].backgroundsMap, backgroundName);
        }
        return getIgnoreCase(backgroundsMap as Record<string, any>, backgroundName);
    };

    const fetchCustom = async (basePath: string) => {
        const routerData = await readCustomJson(app, `${basePath}/backgrounds.json`);
        if (routerData && typeof routerData === 'object') {
            let matched = getIgnoreCase(routerData, backgroundName);

            // Also check if a background object in backgrounds.json has a matching internal "name" / "background" property,
            // or if backgrounds.json was written as a { "<filename>": "<Display Name>" } router
            if (!matched) {
                const candidateIds = buildCandidateIds(backgroundName);
                const lowerSet = new Set(candidateIds.map(c => c.toLowerCase()));
                const slugSet = new Set(candidateIds.map(c => toSlug(c)).filter(Boolean));

                for (const [k, v] of Object.entries(routerData)) {
                    if (v && typeof v === 'object' && !Array.isArray(v)) {
                        const internalName = unwrapFirstString((v as any).name ?? (v as any).background);
                        if (internalName && (lowerSet.has(internalName.toLowerCase()) || slugSet.has(toSlug(internalName)))) {
                            matched = v;
                            break;
                        }
                    } else if (typeof v === 'string') {
                        if (lowerSet.has(v.trim().toLowerCase()) || slugSet.has(toSlug(v))) {
                            matched = k;
                            break;
                        }
                    }
                }
            }

            if (matched) {
                if (typeof matched === 'object' && !Array.isArray(matched)) {
                    return matched;
                }
                if (typeof matched === 'string') {
                    // Could be a filename in backgrounds/ OR a direct feat reference
                    const bgFileCandidates = buildCandidateIds(matched, backgroundName);
                    const fromBgFolder = await findCustomJsonInFolder(
                        app,
                        basePath,
                        ['backgrounds'],
                        bgFileCandidates,
                        ['name', 'background'],
                        (d) => d && typeof d === 'object' && !Array.isArray(d)
                    );
                    if (fromBgFolder) return fromBgFolder;
                    return { feat: matched.trim() };
                }
            }
        }

        // Fallback: Check if the user placed individual background JSON files in `${basePath}/backgrounds/`
        const candidateIds = buildCandidateIds(backgroundName);
        return await findCustomJsonInFolder(
            app,
            basePath,
            ['backgrounds'],
            candidateIds,
            ['name', 'background'],
            (d) => d && typeof d === 'object' && !Array.isArray(d) && (d.feat !== undefined || d.originFeat !== undefined || d.skills !== undefined || d.abilityBonusPool !== undefined)
        );
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Race Traits ---
export async function getRaceData(app: App, settings: FetchSettings, raceInput: any) {
    const raceName = unwrapFirstString(raceInput);
    if (!raceName) return null;

    const isRaceObj = (d: any) => Boolean(
        d && typeof d === 'object' && !Array.isArray(d) &&
        (d.traits !== undefined || d.Traits !== undefined || d.features !== undefined || d.Features !== undefined || d.race !== undefined || d.Race !== undefined)
    );

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
        const mappedIds = await getCustomMappedCandidates(app, basePath, 'races.json', raceName);
        const nativeIds = resolveCandidatesFromRouter(racesMap as Record<string, string>, raceName);
        const candidateIds = buildCandidateIds(raceName, mappedIds, nativeIds);

        return await findCustomJsonInFolder(app, basePath, ['races', ''], candidateIds, ['race', 'name'], isRaceObj);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Extra & Origin Feats ---
export async function getExtraFeat(app: App, settings: FetchSettings, featName: any) {
    // Support inline feat objects directly (e.g., if embedded inside a custom backgrounds.json)
    if (featName && typeof featName === 'object' && !Array.isArray(featName) && (featName.name || featName.description)) {
        return featName;
    }

    const safeName = unwrapFirstString(featName);
    if (!safeName) return null;
    const featId = toSlug(safeName);
    const strippedFeatId = toSlug(stripParens(safeName));

    const isFeatObj = (d: any) => Boolean(
        d && typeof d === 'object' && !Array.isArray(d) &&
        (d.name !== undefined || d.Name !== undefined || d.description !== undefined || d.Description !== undefined)
    );

    const fetchNative = () => {
        const targetRegistry = (settings.edition && pastEditionsRegistry[settings.edition])
            ? pastEditionsRegistry[settings.edition].featRegistry
            : featRegistry;

        const mappedGeneral = resolveFileIdFromRouter(generalFeatsMap, safeName);
        const mappedEpic = resolveFileIdFromRouter(epicBoonFeatsMap, safeName);
        const lookupId = mappedGeneral || mappedEpic || featId;

        const directMatch = getIgnoreCase(targetRegistry, lookupId) || getIgnoreCase(targetRegistry, safeName);
        if (directMatch) return directMatch;

        // Fallback: Match by the "name" property inside the feat JSON
        if (targetRegistry && typeof targetRegistry === 'object') {
            for (const featObj of Object.values(targetRegistry)) {
                if (featObj && typeof featObj === 'object' && featObj.name) {
                    const objSlug = toSlug(String(featObj.name));
                    const objStrippedSlug = toSlug(stripParens(String(featObj.name)));
                    if (objSlug === featId || (strippedFeatId && (objSlug === strippedFeatId || objStrippedSlug === strippedFeatId))) {
                        return featObj;
                    }
                }
            }
        }
        return null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedFromGeneral = await getCustomMappedCandidates(app, basePath, 'general-feats.json', safeName);
        const mappedFromEpic = await getCustomMappedCandidates(app, basePath, 'epic-boon-feats.json', safeName);
        const mappedFromOrigin = await getCustomMappedCandidates(app, basePath, 'origin-feats.json', safeName);
        const mappedFromFeats = await getCustomMappedCandidates(app, basePath, 'feats.json', safeName);
        const nativeMapped = [
            ...resolveCandidatesFromRouter(generalFeatsMap, safeName),
            ...resolveCandidatesFromRouter(epicBoonFeatsMap, safeName)
        ];

        const candidateIds = buildCandidateIds(
            safeName,
            mappedFromGeneral,
            mappedFromEpic,
            mappedFromOrigin,
            mappedFromFeats,
            nativeMapped
        );

        return await findCustomJsonInFolder(app, basePath, ['feats', ''], candidateIds, ['name', 'feat'], isFeatObj);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Item Data ---
export async function getItemData(app: App, settings: FetchSettings, itemName: any) {
    const safeName = unwrapFirstString(itemName);
    if (!safeName) return null;
    const slugName = toSlug(safeName);

    const isItemObj = (d: any) => Boolean(
        d && typeof d === 'object' && !Array.isArray(d) &&
        (d.name !== undefined || d.type !== undefined || d.description !== undefined || d.damage !== undefined || d.ac !== undefined)
    );

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
        const mappedIds = await getCustomMappedCandidates(app, basePath, 'items.json', safeName);
        const nativeIds = resolveCandidatesFromRouter(itemsMap as Record<string, string>, safeName);
        const candidateIds = buildCandidateIds(safeName, mappedIds, nativeIds);

        return await findCustomJsonInFolder(app, basePath, ['items', ''], candidateIds, ['name'], isItemObj);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Rule Data ---
export async function getRuleData(app: App, settings: FetchSettings, rule: any) {
    const cleanRule = unwrapFirstString(rule);
    if (!cleanRule) return null;

    const isRuleObj = (d: any) => Boolean(
        d && typeof d === 'object' && !Array.isArray(d) &&
        (d.rules !== undefined || d.name !== undefined || d.description !== undefined)
    );

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const ruleId = resolveFileIdFromRouter(edData.rulesMap, cleanRule) || toSlug(cleanRule);
            return ruleId ? getIgnoreCase(edData.ruleRegistry, ruleId) : null;
        }
        const ruleId = resolveFileIdFromRouter(rulesMap as Record<string, string>, cleanRule) || toSlug(cleanRule);
        return ruleId ? getIgnoreCase(ruleRegistry, ruleId) : null;
    };

    const fetchCustom = async (basePath: string) => {
        const mappedIds = await getCustomMappedCandidates(app, basePath, 'rules.json', cleanRule);
        const nativeIds = resolveCandidatesFromRouter(rulesMap as Record<string, string>, cleanRule);
        const candidateIds = buildCandidateIds(cleanRule, mappedIds, nativeIds);

        return await findCustomJsonInFolder(app, basePath, ['rules', ''], candidateIds, ['name'], isRuleObj);
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
export async function getSpellsPoolData(app: App, settings: FetchSettings, spellsPoolFile: any) {
    const cleanFile = unwrapFirstString(spellsPoolFile).replace(/\.json$/i, '');
    if (!cleanFile) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]) {
            const edData = pastEditionsRegistry[settings.edition];
            const edPool = getIgnoreCase(edData.spellsMap, cleanFile);
            if (edPool) return edPool;
        }
        return getIgnoreCase(spellsMap, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        const candidateIds = buildCandidateIds(cleanFile);
        return await findCustomJsonInFolder(
            app,
            basePath,
            ['spells', ''],
            candidateIds,
            [],
            (d) => d && typeof d === 'object' && !Array.isArray(d) && d.name === undefined && d.description === undefined
        );
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
export async function getSpellData(app: App, settings: FetchSettings, spellName: any) {
    const safeName = unwrapFirstString(spellName);
    if (!safeName) return null;

    const isSpellObj = (d: any) => Boolean(
        d && typeof d === 'object' && !Array.isArray(d) &&
        (d.name !== undefined || d.description !== undefined || d.level !== undefined || d.school !== undefined)
    );

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
        const candidateIds = buildCandidateIds(safeName);
        return await findCustomJsonInFolder(app, basePath, ['spells', ''], candidateIds, ['name'], isSpellObj);
    };

    return resolveByPriority(settings, fetchNative, fetchCustom);
}

// --- Logic for Fetching Class Choice Data (Routers & Individual Choices) ---
export async function getClassChoiceData(app: App, settings: FetchSettings, choiceFileName: any) {
    const cleanFile = unwrapFirstString(choiceFileName).replace(/\.json$/i, '');
    if (!cleanFile) return null;

    const fetchNative = () => {
        if (settings.edition && pastEditionsRegistry[settings.edition]?.classChoiceRegistry) {
            const edChoice = getIgnoreCase(pastEditionsRegistry[settings.edition].classChoiceRegistry, cleanFile)
                || getIgnoreCase(pastEditionsRegistry[settings.edition].classRegistry, cleanFile);
            if (edChoice) return edChoice;
        }
        return getIgnoreCase(classChoiceRegistry, cleanFile) || getIgnoreCase(classRegistry, cleanFile);
    };

    const fetchCustom = async (basePath: string) => {
        const candidateIds = buildCandidateIds(cleanFile);
        return await findCustomJsonInFolder(
            app,
            basePath,
            ['classes/classChoices', 'classes'],
            candidateIds,
            ['name']
        );
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        const nativeData = fetchNative();
        const customData = await fetchCustom(basePath);

        // If this file is a Router Map (no "name" or "description" property), merge keys by priority
        const isRouter = (obj: any) => obj && typeof obj === 'object' && !Array.isArray(obj) && obj.name === undefined && obj.description === undefined;
        if (isRouter(nativeData) || isRouter(customData)) {
            return mergeDictionaries(
                isRouter(nativeData) ? nativeData : null,
                isRouter(customData) ? customData : null,
                settings.customRulebookPriority
            );
        }

        return settings.customRulebookPriority
            ? (customData ?? nativeData)
            : (nativeData ?? customData);
    }
    return fetchNative();
}

// --- Logic for Fetching Feat Category Router Maps (general-feats.json & epic-boon-feats.json) ---
export async function getFeatMapData(app: App, settings: FetchSettings, featMapName: any) {
    const rawName = unwrapFirstString(featMapName);
    if (!rawName) return null;
    const cleanKey = rawName.toLowerCase().replace(/\.json$/i, '');
    const featRouters: Record<string, any> = {
        "general-feats": generalFeatsMap,
        "epic-boon-feats": epicBoonFeatsMap
    };

    const isRouterMap = (obj: any) => Boolean(
        obj && typeof obj === 'object' && !Array.isArray(obj) &&
        obj.name === undefined && obj.Name === undefined &&
        obj.description === undefined && obj.Description === undefined
    );

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
        const rootCandidate = await readCustomJson(app, `${basePath}/${cleanKey}.json`);
        if (isRouterMap(rootCandidate)) return rootCandidate;

        const subCandidate = await readCustomJson(app, `${basePath}/feats/${cleanKey}.json`);
        if (isRouterMap(subCandidate)) return subCandidate;

        return null;
    };

    const basePath = getCleanCustomBasePath(settings);
    if (basePath) {
        return mergeDictionaries(fetchNative(), await fetchCustom(basePath), settings.customRulebookPriority);
    }
    return fetchNative();
}