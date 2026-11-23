import { parseYaml } from 'obsidian';
import { FeatPoolEntry, toNormalizedFeatSlug, classChoiceRouterRegistry } from '../data';

// --- Item cost helpers (PP / GP / SP / CP) ---
// Item costs are stored as "<amount> <PP|GP|SP|CP>" (e.g. "50 GP", "1 SP", "5 CP").
// Legacy bare numbers (GP-based, possibly fractional) are converted for backwards compatibility.
export interface ParsedItemCost {
    amount: number;
    unit: "PP" | "GP" | "SP" | "CP";
}

export function parseItemCost(raw: any): ParsedItemCost | null {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.replace(/(?<=\d),(?=\d{3}\b)/g, "").match(/^(\d+(?:\.\d+)?)\s*(pp|gp|sp|cp)?$/i);
    if (!m) return null;
    const amount = Number(m[1]);
    if (!isFinite(amount)) return null;
    if (m[2]) return { amount, unit: m[2].toUpperCase() as ParsedItemCost["unit"] };
    // Legacy: bare number = gold. Express sub-gold values in SP / CP.
    if (amount === 0 || amount >= 1) return { amount, unit: "GP" };
    const sp = Math.round(amount * 10 * 1000) / 1000;
    if (Number.isInteger(sp)) return { amount: sp, unit: "SP" };
    return { amount: Math.round(amount * 100 * 1000) / 1000, unit: "CP" };
}

/** "50 GP" style text, or "" if the cost is missing/unparseable. */
export function formatItemCost(raw: any, compact = false): string {
    const c = parseItemCost(raw);
    if (!c) return "";
    return compact ? `${c.amount}${c.unit}` : `${c.amount} ${c.unit}`;
}

export function hasItemCost(raw: any): boolean {
    const c = parseItemCost(raw);
    return !!c && c.amount > 0;
}

// --- Feat Ability Score Helpers ---
export type AbilityKey = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
export const ALL_ABILITIES: AbilityKey[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

export interface ParsedAbilityImprovement {
    options: AbilityKey[];
    amount: number;
    maxCap: number;
    isChoice: boolean;
}

export interface SpeedModifierBreakdown {
    baseSpeed: number;
    classSpeedBonus: number;
    featSpeedBonus: number;
    customSpeedMod: number;
    totalSpeedMod: number;
    totalSpeed: number;
    breakdown: { source: string; amount: number; active: boolean; reason?: string }[];
}

// --- Shared Spellcasting, Spell Pool & Racial Spell Helpers ---
export interface RaceSpellcastingMetadata {
    spellcastingAbilities: string[];
    spellsPools: string[];
    grantedSpellsByLevel: Record<string, string[]>;
    innateSlugs: Set<string>;
    replaceableCantripPools: string[];
    defaultReplaceableCantrips: Set<string>;
}

/** Normalizes string[], JSON array string, or comma-delimited string into a deduplicated string list. */
export function parseStringArray(raw: any, stripJsonExt = false): string[] {
    if (raw === undefined || raw === null) return [];
    let list: any[] = [];
    if (Array.isArray(raw)) {
        list = raw;
    } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith("<")) return [];
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) list = parsed;
            } catch {
                list = [];
            }
        } else {
            list = trimmed.split(",");
        }
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of list) {
        let val = String(entry ?? "").trim();
        if (!val || val.startsWith("<")) continue;
        if (stripJsonExt) val = val.replace(/\.json$/i, "");
        const norm = val.toLowerCase();
        if (!seen.has(norm)) {
            seen.add(norm);
            out.push(val);
        }
    }
    return out;
}

/** Normalizes feat IDs and display names into comparable slugs (e.g. `"Magic Initiate (Wizard)"` -> `"magic-initiate-wizard"`). */
export function normalizeFeatKey(val: any): string {
    return toNormalizedFeatSlug(val);
}

/** Parses `DnD_extraFeats` from YAML arrays, JSON strings, or comma-delimited text and deduplicates by feat slug. */
export function parseExtraFeatsList(raw: any): string[] {
    const entries = parseStringArray(raw);
    const seenSlugs = new Set<string>();
    const out: string[] = [];
    for (const entry of entries) {
        const slug = normalizeFeatKey(entry) || entry.toLowerCase();
        if (!slug || seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);
        out.push(entry);
    }
    return out;
}

/** Checks if a resolved frontmatter/YAML value contains non-empty, non-placeholder data. */
export function hasValidValue(val: any): boolean {
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) return val.some(item => hasValidValue(item));
    if (typeof val === "string") {
        const t = val.trim();
        return t !== "" && t !== "[]" && !t.startsWith("<");
    }
    return true;
}

/** Normalizes, flattens, and deduplicates feat IDs across multiple sources, excluding ASI and placeholders. */
export function combineUniqueFeatIds(...sources: any[]): string[] {
    const seenSlugs = new Set<string>();
    const out: string[] = [];
    for (const src of sources) {
        for (const entry of parseExtraFeatsList(src)) {
            const slug = normalizeFeatKey(entry) || entry.toLowerCase();
            if (!slug || slug === "ability-score-improvement" || seenSlugs.has(slug)) continue;
            seenSlugs.add(slug);
            out.push(entry);
        }
    }
    return out;
}

/** Parses an array or JSON-encoded array string (`"[...]"`) into an array, returning `[]` on invalid input. */
export function parseJsonArrayProp(raw: any, resolver?: (val: any) => any): any[] {
    const resolved = resolver ? resolver(raw) : raw;
    if (!resolved) return [];
    if (Array.isArray(resolved)) return resolved;
    if (typeof resolved === "string") {
        const trimmed = resolved.trim();
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
    }
    return [];
}

/** Strips full-line `#` YAML comments and parses a code block's YAML into a non-null object. */
export function parseBlockYaml(source: string): Record<string, any> {
    if (!source || !source.trim()) return {};
    const cleanSource = source.replace(/^[ \t]*#.*$/gm, "");
    return parseYaml(cleanSource) || {};
}

/** Resolves `"frontmatter.<Key>"` or `"{{ frontmatter.<Key> }}"` against `frontmatter` with legacy key fallbacks. */
export function createFrontmatterResolver(frontmatter: Record<string, any>): (val: any) => any {
    return (val: any) => {
        if (typeof val === "string") {
            const trimmed = val.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
            if (trimmed.startsWith("frontmatter.")) {
                const propName = trimmed.replace("frontmatter.", "").trim();
                if (frontmatter[propName] !== undefined) return frontmatter[propName];
                if (propName === "level") return frontmatter["DnD_level"];
                if (propName === "DnD_level") return frontmatter["level"];
                if (propName === "DnD_Subclass") return frontmatter["DnD_subclass"];
                if (propName === "DnD_subclass") return frontmatter["DnD_Subclass"];
                if (propName === "proficiencyBonus" || propName === "proficiency_bonus") return frontmatter["DnD_proficiencyBonus"];
                if (propName === "DnD_proficiencyBonus") return frontmatter["proficiency_bonus"] ?? frontmatter["proficiencyBonus"];
                return undefined;
            }
        }
        return val;
    };
}

/** Extracts `<Key>` if `rawProp` is `"frontmatter.<Key>"` (or wrapped in `{{ }}`), else returns `fallbackKey`. */
export function extractFrontmatterKey(rawProp: any, fallbackKey: string): string {
    if (typeof rawProp === "string") {
        const trimmed = rawProp.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
        if (trimmed.startsWith("frontmatter.")) {
            return trimmed.replace("frontmatter.", "").trim() || fallbackKey;
        }
    }
    return fallbackKey;
}

/** Extracts the 6 core ability scores from `blockData` (if provided) or `frontmatter["DnD_<ability>"]`, defaulting to 10. */
export function extractAbilityScores(
    frontmatter: Record<string, any>,
    blockData?: Record<string, any>,
    resolver?: (val: any) => any
): Record<string, number> {
    const record: Record<string, number> = {};
    for (const stat of ALL_ABILITIES) {
        const blockVal = blockData ? (resolver ? resolver(blockData[stat]) : blockData[stat]) : undefined;
        record[stat] = Number(blockVal ?? frontmatter?.[`DnD_${stat}`]) || 10;
    }
    return record;
}

/** Parses `[ [ ["spell1", "spell2"], "level" ], ... ]` into a cloned `Record<string, string[]>`. */
export function parseSpellTuples(raw: any, resolver?: (val: any) => any): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (raw === undefined || raw === null) return result;
    let parsed = resolver ? resolver(raw) : raw;
    if (typeof parsed === "string") {
        const trimmed = parsed.trim();
        if (trimmed.startsWith("[")) {
            try { parsed = JSON.parse(trimmed); } catch { parsed = []; }
        } else {
            parsed = [];
        }
    }
    if (Array.isArray(parsed)) {
        for (const rawEntry of parsed) {
            const entry = resolver ? resolver(rawEntry) : rawEntry;
            if (Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[0])) {
                const lvlKey = String(entry[1]);
                const deduped: string[] = [];
                for (const s of entry[0]) {
                    const slug = String(s ?? "").trim();
                    if (slug && !deduped.includes(slug)) deduped.push(slug);
                }
                result[lvlKey] = deduped;
            }
        }
    }
    return result;
}

/** Serializes `Record<string, string[]>` back to sorted `[ [ ["spell1"], "level" ], ... ]` tuples. */
export function formatSpellTuples(map: Record<string, string[]>): [string[], string][] {
    const output: [string[], string][] = [];
    const sortedLevels = Object.keys(map).sort((a, b) => Number(a) - Number(b));
    for (const lvl of sortedLevels) {
        const spells = map[lvl];
        if (Array.isArray(spells) && spells.length > 0) {
            output.push([[...spells], String(lvl)]);
        }
    }
    return output;
}

/** Merges incoming spells by level into `target` without duplicates; returns true if anything was added. */
export function mergeSpellTuples(target: Record<string, string[]>, incoming: Record<string, string[]>): boolean {
    let changed = false;
    for (const [lvlKey, slugs] of Object.entries(incoming || {})) {
        if (!Array.isArray(slugs) || slugs.length === 0) continue;
        if (!Array.isArray(target[lvlKey])) target[lvlKey] = [];
        for (const slug of slugs) {
            const cleanSlug = String(slug ?? "").trim();
            if (cleanSlug && !target[lvlKey].includes(cleanSlug)) {
                target[lvlKey].push(cleanSlug);
                changed = true;
            }
        }
    }
    return changed;
}

/** Formats a pool filename slug (e.g. `"elf-cantrips"`) into a clean display label (`"Elf Cantrips"`). */
export function formatPoolDisplayName(poolKey: string): string {
    return String(poolKey || "")
        .trim()
        .replace(/\.json$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

// --- Multi-Router Class Choices Helpers ---
// Grouped Frontmatter Schema: [ ["<Router>", [ ["<Choice>", "<Level>"], ... ] ], ... ]
// Backwards-compatible with legacy flat 2-element [ ["<Choice>", "<Level>"] ] and 3-element [ ["<Router>", "<Choice>", "<Level>"] ] arrays.
export function inferRouterForChoiceKey(choiceKey: string): string | null {
    if (!choiceKey) return null;
    const cleanKey = String(choiceKey).trim().toLowerCase();
    for (const [routerName, routerDict] of Object.entries(classChoiceRouterRegistry || {})) {
        if (routerDict && typeof routerDict === "object" && !Array.isArray(routerDict)) {
            if (Object.keys(routerDict).some(k => k.trim().toLowerCase() === cleanKey)) {
                return routerName;
            }
        }
    }
    return null;
}

export function parseClassChoicesByRouter(raw: any): Record<string, [string, string][]> {
    const result: Record<string, [string, string][]> = {};
    let parsed = raw;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.startsWith("[")) {
            try { parsed = JSON.parse(trimmed); } catch { parsed = []; }
        } else {
            parsed = [];
        }
    }
    if (!Array.isArray(parsed)) return result;

    for (const entry of parsed) {
        if (!Array.isArray(entry) || entry.length === 0) continue;

        // Grouped format: [ "<Router>", [ ["<Choice>", "<Level>"], ... ] ]
        if (entry.length === 2 && typeof entry[0] === "string" && Array.isArray(entry[1])) {
            const routerName = String(entry[0]).trim();
            if (!routerName) continue;
            if (!result[routerName]) result[routerName] = [];
            for (const sub of entry[1]) {
                if (Array.isArray(sub) && sub.length >= 2) {
                    const cKey = String(sub[0] ?? "").trim();
                    const cLvl = String(sub[1] ?? "1").trim();
                    if (cKey) result[routerName].push([cKey, cLvl]);
                }
            }
        }
        // Legacy 3-element tuple: [ "<Router>", "<Choice>", "<Level>" ]
        else if (entry.length === 3 && !Array.isArray(entry[1])) {
            const routerName = String(entry[0] ?? "").trim() || inferRouterForChoiceKey(String(entry[1] ?? "")) || "__legacy__";
            const cKey = String(entry[1] ?? "").trim();
            const cLvl = String(entry[2] ?? "1").trim();
            if (cKey) {
                if (!result[routerName]) result[routerName] = [];
                result[routerName].push([cKey, cLvl]);
            }
        }
        // Legacy 2-element tuple: [ "<Choice>", "<Level>" ]
        else if (entry.length === 2 && !Array.isArray(entry[1])) {
            const cKey = String(entry[0] ?? "").trim();
            const cLvl = String(entry[1] ?? "1").trim();
            if (cKey) {
                const routerName = inferRouterForChoiceKey(cKey) || "__legacy__";
                if (!result[routerName]) result[routerName] = [];
                result[routerName].push([cKey, cLvl]);
            }
        }
    }
    return result;
}

export function flattenClassChoices(raw: any): { router: string; key: string; level: number }[] {
    const byRouter = parseClassChoicesByRouter(raw);
    const flat: { router: string; key: string; level: number }[] = [];
    for (const [router, list] of Object.entries(byRouter)) {
        for (const [key, lvl] of list) {
            if (key) {
                flat.push({ router, key, level: Number(lvl) || 1 });
            }
        }
    }
    return flat;
}

export function serializeClassChoicesByRouter(map: Record<string, [string, string][]>): [string, [string, string][]][] {
    const out: [string, [string, string][]][] = [];
    for (const [router, tuples] of Object.entries(map)) {
        if (!router || !Array.isArray(tuples)) continue;
        const cleanTuples = tuples
            .filter(t => Array.isArray(t) && String(t[0] ?? "").trim() !== "")
            .map((t): [string, string] => [String(t[0]).trim(), String(t[1] ?? "1").trim()]);
        if (cleanTuples.length > 0) {
            out.push([router, cleanTuples]);
        }
    }
    return out;
}

export function parseFeatAbilityImprovements(featData: any): ParsedAbilityImprovement[] {
    if (!featData || !Array.isArray(featData.improveAbility)) return [];
    const results: ParsedAbilityImprovement[] = [];
    for (const item of featData.improveAbility) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const spec = String(item[0]).toLowerCase().trim();
        const amount = Number(item[1]) || 1;
        const maxCap = item.length >= 3 && !isNaN(Number(item[2])) ? Number(item[2]) : (featData?.category === "Epic Boon" ? 30 : 20);

        let options: AbilityKey[] = [];
        if (spec === "any") {
            options = [...ALL_ABILITIES];
        } else {
            const parts = spec.split("|").map(s => s.trim().toLowerCase());
            options = parts.filter((p): p is AbilityKey => ALL_ABILITIES.includes(p as AbilityKey));
        }

        if (options.length > 0) {
            results.push({
                options,
                amount,
                maxCap,
                isChoice: options.length > 1
            });
        }
    }
    return results;
}

export function formatFeatureOrSlug(slug: string): string {
    return String(slug || "")
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

export function parseSavingThrows(raw: any): AbilityKey[] {
    if (!raw) return [];
    let list: any[] = [];
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            list = Array.isArray(parsed) ? parsed : [raw];
        } catch {
            list = raw.split(",").map(s => s.trim());
        }
    } else if (Array.isArray(raw)) {
        list = raw;
    }
    const results: AbilityKey[] = [];
    for (const item of list) {
        const s = String(item || "").trim().toLowerCase();
        if (ALL_ABILITIES.includes(s as AbilityKey) && !results.includes(s as AbilityKey)) {
            results.push(s as AbilityKey);
        }
    }
    return results;
}

export function parseFeatSavingThrowProficiencies(featData: any, chosenAbility?: AbilityKey): AbilityKey[] {
    if (!featData || !featData.proficiencySavingThrow) return [];
    const raw = featData.proficiencySavingThrow;
    const items = Array.isArray(raw) ? raw : [raw];
    const results: AbilityKey[] = [];

    for (const item of items) {
        const s = String(item || "").trim().toLowerCase();
        if (s === "improvedability" || s === "improveability" || s === "chosen") {
            if (chosenAbility && ALL_ABILITIES.includes(chosenAbility)) {
                if (!results.includes(chosenAbility)) results.push(chosenAbility);
            }
        } else if (ALL_ABILITIES.includes(s as AbilityKey)) {
            if (!results.includes(s as AbilityKey)) results.push(s as AbilityKey);
        }
    }
    return results;
}

export interface GrantedFeatMilestoneState {
    featureName: string;
    options: string[];
    chosenOptionType: "asi" | "router" | "feat";
    chosenOptionKey: string;
    chosenFeatKey: string;
    asiStat1: string;
    asiStat2: string;
    abilityChoices: Record<number, AbilityKey>;
    featExpertiseChoices: string[];
}

export function createEmptyGrantedFeatState(featureName: string, options: string[]): GrantedFeatMilestoneState {
    return {
        featureName,
        options: [...options],
        chosenOptionType: "feat",
        chosenOptionKey: "",
        chosenFeatKey: "",
        asiStat1: "",
        asiStat2: "",
        abilityChoices: {},
        featExpertiseChoices: []
    };
}

/** Populates a grouped Feat dropdown (`Origin Feats`, `General Feats`, `Epic Boons`, Homebrew) excluding owned slugs. */
export function populateGroupedFeatSelect(
    selectEl: HTMLSelectElement,
    availableFeats: FeatPoolEntry[],
    excludeFeatSlugs: Set<string>,
    placeholderText: string = "-- Select Feat to Add --"
) {
    selectEl.empty();
    selectEl.createEl("option", { text: placeholderText, value: "" });

    const categoryGroups: Record<string, FeatPoolEntry[]> = {
        "Origin Feats": [],
        "General Feats": [],
        "Epic Boons": [],
        "Other / Homebrew Feats": []
    };
    const categoryBucketMap: Record<string, string> = {
        "origin feat": "Origin Feats",
        "general feat": "General Feats",
        "epic boon": "Epic Boons"
    };

    availableFeats.forEach(feat => {
        if (excludeFeatSlugs.has(normalizeFeatKey(feat.id))) return;
        const bucketKey = categoryBucketMap[feat.category.toLowerCase()] || "Other / Homebrew Feats";
        categoryGroups[bucketKey].push(feat);
    });

    Object.entries(categoryGroups).forEach(([groupLabel, entries]) => {
        if (entries.length === 0) return;
        const optGroup = selectEl.createEl("optgroup", { attr: { label: groupLabel } });
        entries.forEach(feat => {
            optGroup.createEl("option", { text: feat.name, value: feat.id });
        });
    });
}

// --- Weapon Mastery State Helpers ---
// Structure in frontmatter: DnD_weaponMastery: '[ "<AvailableSlots>", [ "<WeaponSlug>", ... ] ]'
export interface WeaponMasteryState {
    available: number;
    mastered: string[];
}

export function sanitizeWeaponSlug(val: any): string {
    if (!val) return "";
    return String(val).toLowerCase().replace(/['"]/g, '').trim().replace(/\s+/g, '-');
}

export function parseWeaponMasteryState(raw: any): WeaponMasteryState {
    if (raw === undefined || raw === null || raw === "") {
        return { available: 0, mastered: [] };
    }
    let parsed: any = raw;
    if (typeof parsed === "string") {
        const trimmed = parsed.trim();
        if (trimmed.startsWith("[")) {
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                return { available: 0, mastered: [] };
            }
        } else if (!isNaN(Number(trimmed))) {
            return { available: Math.max(0, Math.floor(Number(trimmed))), mastered: [] };
        } else {
            return { available: 0, mastered: [] };
        }
    }
    if (Array.isArray(parsed)) {
        const rawAvail = parsed[0];
        const available = Math.max(0, Math.floor(Number(String(rawAvail ?? "0").replace(/[^0-9.-]/g, "")) || 0));
        const rawList = Array.isArray(parsed[1]) ? parsed[1] : [];
        const mastered: string[] = [];
        for (const w of rawList) {
            const slug = sanitizeWeaponSlug(w);
            if (slug && slug !== "none" && !mastered.includes(slug)) {
                mastered.push(slug);
            }
        }
        return { available, mastered };
    }
    return { available: 0, mastered: [] };
}

export function serializeWeaponMasteryState(available: number, mastered: string[]): string {
    const cleanAvail = String(Math.max(0, Math.floor(Number(available) || 0)));
    const cleanMastered: string[] = [];
    if (Array.isArray(mastered)) {
        for (const w of mastered) {
            const slug = sanitizeWeaponSlug(w);
            if (slug && slug !== "none" && !cleanMastered.includes(slug)) {
                cleanMastered.push(slug);
            }
        }
    }
    return JSON.stringify([cleanAvail, cleanMastered]);
}

// --- Hit Dice State Helpers ([HitDie, SpentCount]) ---
export function parseHitDiceState(raw: any, fallbackDie: string = "d8", maxLevel: number = 20): { hitDie: string; spent: number } {
    const cleanFallback = String(fallbackDie || "d8").trim().replace(/^<.*>$/, "d8") || "d8";
    let parsed = raw;
    if (typeof parsed === "string" && parsed.trim().startsWith("[")) {
        try { parsed = JSON.parse(parsed.trim()); } catch { parsed = null; }
    }
    if (Array.isArray(parsed)) {
        const rawDie = parsed[0] !== undefined && parsed[0] !== null ? String(parsed[0]).trim() : "";
        const hitDie = (rawDie && !rawDie.startsWith("<")) ? rawDie : cleanFallback;
        const rawSpent = Number(parsed[1]);
        const spent = !isNaN(rawSpent) && rawSpent > 0
            ? Math.max(0, Math.min(maxLevel, Math.floor(rawSpent)))
            : 0;
        return { hitDie, spent };
    }
    if (typeof parsed === "string") {
        const trimmed = parsed.trim();
        const hitDie = (trimmed && !trimmed.startsWith("<")) ? trimmed : cleanFallback;
        return { hitDie, spent: 0 };
    }
    return { hitDie: cleanFallback, spent: 0 };
}

export function serializeHitDiceState(hitDie: string, spent: number): string {
    const cleanDie = String(hitDie || "d8").trim().replace(/^<.*>$/, "d8") || "d8";
    const cleanSpent = Math.max(0, Math.floor(Number(spent) || 0));
    return JSON.stringify([cleanDie, cleanSpent]);
}
