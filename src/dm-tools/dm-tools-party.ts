import { App, TFile, normalizePath } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    ALL_ABILITIES,
    AbilityKey,
    extractAbilityScores,
    hasValidValue,
    parseJsonArrayProp,
    parseSavingThrows,
    parseStringArray
} from '../helpers';

export const DND_55E_CONDITIONS: readonly string[] = [
    "Blinded",
    "Charmed",
    "Deafened",
    "Exhaustion",
    "Frightened",
    "Grappled",
    "Incapacitated",
    "Invisible",
    "Paralyzed",
    "Petrified",
    "Poisoned",
    "Prone",
    "Restrained",
    "Stunned",
    "Unconscious"
];

export const CANONICAL_SKILL_KEYS: readonly string[] = [
    "acrobatics",
    "animal handling",
    "arcana",
    "athletics",
    "deception",
    "history",
    "insight",
    "intimidation",
    "investigation",
    "medicine",
    "nature",
    "perception",
    "performance",
    "persuasion",
    "religion",
    "sleight of hand",
    "stealth",
    "survival"
];

const CANONICAL_SKILL_SET = new Set<string>(CANONICAL_SKILL_KEYS);

export interface InitiativeCombatant {
    id: string;
    name: string;
    initiative: number;
    initBonus: number;
    dexMod: number;
    hp: number;
    maxHp: number;
    tempHp: number;
    ac: number;
    isPC: boolean;
    conditions: string[];
    concentrating?: boolean;
    sourcePath?: string;
    monsterId?: string;
    notes?: string;
}

export interface InitiativeState {
    round: number;
    activeCombatantId: string | null;
    syncPcHpToFrontmatter: boolean;
    combatants: InitiativeCombatant[];
}

export function createDefaultInitiativeState(): InitiativeState {
    return {
        round: 1,
        activeCombatantId: null,
        syncPcHpToFrontmatter: true,
        combatants: []
    };
}

/**
 * Ensures any loaded or frontmatter-deserialized `InitiativeState` has safe defaults and array/numeric types.
 * Mutates in-place when `raw` is already an object so shared references remain valid.
 */
export function normalizeInitiativeStateInPlace(raw: any): InitiativeState {
    const state: InitiativeState = (raw && typeof raw === "object")
        ? raw
        : createDefaultInitiativeState();

    state.round = Math.max(1, Math.floor(Number(state.round) || 1));
    state.activeCombatantId = typeof state.activeCombatantId === "string" && state.activeCombatantId.trim()
        ? state.activeCombatantId
        : null;
    state.syncPcHpToFrontmatter = state.syncPcHpToFrontmatter !== false;

    if (!Array.isArray(state.combatants)) {
        state.combatants = [];
    } else {
        state.combatants = state.combatants
            .filter((item): item is InitiativeCombatant => Boolean(item && typeof item === "object"))
            .map((c, idx) => {
                const maxHp = Math.max(1, Math.round(Number(c.maxHp) || 1));
                const hp = Math.max(0, Math.round(Number(c.hp) || 0));
                const tempHp = Math.max(0, Math.round(Number(c.tempHp) || 0));
                const ac = Math.max(0, Math.round(Number(c.ac) || 10));
                const dexMod = Math.trunc(Number(c.dexMod) || 0);
                const initBonus = Math.trunc(Number(c.initBonus) ?? dexMod) || 0;
                const initiative = Number.isFinite(Number(c.initiative)) ? Number(c.initiative) : 0;
                const conditions = Array.isArray(c.conditions)
                    ? Array.from(new Set(c.conditions.map(x => String(x || "").trim()).filter(Boolean)))
                    : [];

                return {
                    ...c,
                    id: typeof c.id === "string" && c.id.trim()
                        ? c.id
                        : `cmb-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: String(c.name || "Combatant").trim() || "Combatant",
                    initiative,
                    initBonus,
                    dexMod,
                    hp,
                    maxHp,
                    tempHp,
                    ac,
                    isPC: Boolean(c.isPC),
                    conditions,
                    concentrating: Boolean(c.concentrating)
                };
            });
    }

    return state;
}

/**
 * Sorts combatants descending by `initiative` total, tie-breaking by `dexMod` (then `initBonus`, then `name`).
 */
export function sortInitiativeCombatants(combatants: InitiativeCombatant[]): InitiativeCombatant[] {
    return [...combatants].sort((a, b) => {
        const diffInit = (Number(b.initiative) || 0) - (Number(a.initiative) || 0);
        if (diffInit !== 0) return diffInit;
        const diffDex = (Number(b.dexMod) || 0) - (Number(a.dexMod) || 0);
        if (diffDex !== 0) return diffDex;
        const diffBonus = (Number(b.initBonus) || 0) - (Number(a.initBonus) || 0);
        if (diffBonus !== 0) return diffBonus;
        return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

export function rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
}

export function formatSignedNumber(n: number): string {
    const val = Number(n) || 0;
    return val >= 0 ? `+${val}` : `${val}`;
}

export function abilityModFromScore(score: number): number {
    return Math.floor(((Number(score) || 10) - 10) / 2);
}

export function parseNumericMod(rawVal: any, fallback: number = 0): number {
    if (rawVal === undefined || rawVal === null || rawVal === "") return fallback;
    const trimmed = String(rawVal).trim();
    if (!trimmed || trimmed.startsWith("<")) return fallback;
    const cleaned = trimmed.replace(/^\+/, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : fallback;
}

export function applyDamageWithTempHp(
    hp: number,
    tempHp: number,
    rawDmg: number
): { newHp: number; newTempHp: number; hpLost: number } {
    let remaining = Math.max(0, Math.round(Number(rawDmg) || 0));
    let nextTemp = Math.max(0, Math.round(Number(tempHp) || 0));
    const startHp = Math.max(0, Math.round(Number(hp) || 0));
    if (remaining <= 0) {
        return { newHp: startHp, newTempHp: nextTemp, hpLost: 0 };
    }
    if (nextTemp > 0) {
        const absorbed = Math.min(nextTemp, remaining);
        nextTemp -= absorbed;
        remaining -= absorbed;
    }
    const newHp = Math.max(0, startHp - remaining);
    return {
        newHp,
        newTempHp: nextTemp,
        hpLost: Math.max(0, startHp - newHp)
    };
}

/**
 * Filters `state.combatants` while preserving the turn pointer on the next surviving combatant
 * in sorted turn order (instead of unconditionally jumping back to index 0).
 */
export function removeCombatantsUpdatingTurn(
    state: InitiativeState,
    keepPredicate: (c: InitiativeCombatant) => boolean
): void {
    const oldList = state.combatants || [];
    const oldActiveId = state.activeCombatantId;
    const oldActiveIdx = oldActiveId ? oldList.findIndex(c => c.id === oldActiveId) : -1;

    const kept = oldList.filter(keepPredicate);
    state.combatants = kept;

    if (kept.length === 0) {
        state.activeCombatantId = null;
        return;
    }

    if (oldActiveId && kept.some(c => c.id === oldActiveId)) {
        return;
    }

    if (oldActiveIdx >= 0) {
        for (let i = oldActiveIdx + 1; i < oldList.length; i++) {
            if (keepPredicate(oldList[i])) {
                state.activeCombatantId = oldList[i].id;
                return;
            }
        }
    }

    state.activeCombatantId = kept[0].id;
}

/**
 * Computes unique numbered combatant names (e.g., adding `"Goblin"` when `"Goblin Boss"` exists
 * yields `"Goblin"`, while adding after `"Goblin 1"` and `"Goblin 3"` yields `"Goblin 4"`).
 */
export function getNextCombatantNames(
    existingCombatants: readonly { name: string }[],
    baseName: string,
    qty: number
): string[] {
    const cleanBase = String(baseName || "Combatant").trim() || "Combatant";
    const escaped = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const numberedRe = new RegExp(`^${escaped}\\s+(\\d+)$`, "i");
    const lowerBase = cleanBase.toLowerCase();

    let hasUnnumbered = false;
    let maxSuffix = 0;

    for (const c of existingCombatants || []) {
        const cName = String(c?.name || "").trim();
        if (!cName) continue;
        if (cName.toLowerCase() === lowerBase) {
            hasUnnumbered = true;
            continue;
        }
        const m = numberedRe.exec(cName);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > maxSuffix) {
                maxSuffix = n;
            }
        }
    }

    const safeQty = Math.max(1, Math.min(20, Math.round(Number(qty) || 1)));
    const names: string[] = [];

    if (!hasUnnumbered && maxSuffix === 0 && safeQty === 1) {
        names.push(cleanBase);
        return names;
    }

    const startNum = Math.max(hasUnnumbered ? 1 : 0, maxSuffix) + 1;
    for (let i = 0; i < safeQty; i++) {
        names.push(`${cleanBase} ${startNum + i}`);
    }
    return names;
}

// ============================================================================
// --- PARTY DISCOVERY & PASSIVE SENSES CALCULATOR ---
// ============================================================================

export interface PartyMemberSummary {
    file: TFile;
    sourcePath: string;
    name: string;
    level: number;
    dndClass: string;
    subclass: string;
    race: string;
    background: string;
    currentHp: number;
    maxHp: number;
    tempHp: number;
    ac: number;
    speed: number;
    dexMod: number;
    initBonus: number;
    exhaustion: number;
    heroicInspiration: boolean;
    passivePerception: number;
    passiveInvestigation: number;
    passiveInsight: number;
    savingThrows: AbilityKey[];
    languages: string[];
    toolProficiencies: string[];
    abilities: Record<AbilityKey, number>;
}

export function createCombatantFromPartyMember(
    pc: PartyMemberSummary,
    rolledInit?: number,
    existingCombatant?: Partial<InitiativeCombatant>
): InitiativeCombatant {
    const initiative = rolledInit !== undefined && Number.isFinite(rolledInit)
        ? rolledInit
        : (rollD20() + pc.initBonus);
    return {
        id: existingCombatant?.id || `pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: pc.name,
        initiative,
        initBonus: pc.initBonus,
        dexMod: pc.dexMod,
        hp: pc.currentHp,
        maxHp: pc.maxHp,
        tempHp: pc.tempHp,
        ac: pc.ac,
        isPC: true,
        conditions: Array.isArray(existingCombatant?.conditions) ? [...existingCombatant.conditions] : [],
        concentrating: Boolean(existingCombatant?.concentrating),
        sourcePath: pc.sourcePath
    };
}

function normalizeSkillKey(raw: any): string {
    if (raw === undefined || raw === null) return "";
    return String(raw)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]/g, " ")
        .trim()
        .toLowerCase();
}

function collectSkillSet(raw: any, target: Set<string>): void {
    if (raw === undefined || raw === null) return;
    if (typeof raw === "boolean") return;

    const tupleList = parseJsonArrayProp(raw);
    if (tupleList.length > 0) {
        for (const entry of tupleList) {
            if (Array.isArray(entry) && entry[0]) {
                const norm = normalizeSkillKey(entry[0]);
                if (norm && !norm.includes("<chosen")) target.add(norm);
            } else if (typeof entry === "string") {
                const norm = normalizeSkillKey(entry);
                if (norm && !norm.includes("<chosen")) target.add(norm);
            }
        }
        return;
    }

    for (const s of parseStringArray(raw)) {
        const norm = normalizeSkillKey(s);
        if (norm && !norm.includes("<chosen")) target.add(norm);
    }
}

function isGlobalBooleanFlag(raw: any): boolean {
    return raw === true || (typeof raw === "string" && raw.trim().toLowerCase() === "true");
}

/**
 * Resolves total character level from `DnD_level` or multiclass `DnD_classLevels`.
 */
export function resolvePartyMemberLevel(fm: Record<string, any>): number {
    if (hasValidValue(fm["DnD_level"])) {
        const num = Number(fm["DnD_level"]);
        if (Number.isFinite(num) && num >= 1) return Math.floor(num);
    }
    const rawClassLevels = parseJsonArrayProp(fm["DnD_classLevels"]);
    if (rawClassLevels.length > 0) {
        const sum = rawClassLevels.reduce((acc, v) => acc + (Math.max(0, Number(v) || 0)), 0);
        if (sum >= 1) return Math.floor(sum);
    }
    return 1;
}

/**
 * Calculates 5.5e Passive Perception, Passive Investigation, and Passive Insight
 * from character sheet frontmatter (`10 + AbilityMod + Prof/Exp/HalfProf + SkillItemBonuses`).
 * Supports both canonical (`DnD_skillExpertise`, `DnD_skillHalfProficiencies`, `[itemName, skillKey, amount]`)
 * and legacy (`DnD_expertise`, `DnD_halfProficiency`, `[skillKey, itemName, amount]`) schemas.
 */
export function calculateCharacterPassiveSenses(frontmatter: Record<string, any>): {
    passivePerception: number;
    passiveInvestigation: number;
    passiveInsight: number;
} {
    const level = resolvePartyMemberLevel(frontmatter || {});
    const explicitPb = parseNumericMod(frontmatter?.["DnD_proficiencyBonus"], 0);
    const profBonus = explicitPb > 0 ? explicitPb : (Math.ceil(level / 4) + 1);
    const stats = extractAbilityScores(frontmatter || {});

    const wisMod = abilityModFromScore(stats.wisdom);
    const intMod = abilityModFromScore(stats.intelligence);

    const proficientSkills = new Set<string>();
    collectSkillSet(frontmatter?.["DnD_skillProficiencies"], proficientSkills);

    const expertiseSkills = new Set<string>();
    collectSkillSet(frontmatter?.["DnD_skillExpertise"], expertiseSkills);
    collectSkillSet(frontmatter?.["DnD_expertise"], expertiseSkills);

    const rawSkillHalf = frontmatter?.["DnD_skillHalfProficiencies"];
    const rawLegacyHalf = frontmatter?.["DnD_halfProficiency"];
    const hasGlobalHalfProf = isGlobalBooleanFlag(rawSkillHalf) || isGlobalBooleanFlag(rawLegacyHalf);

    const halfProfSkills = new Set<string>();
    if (!isGlobalBooleanFlag(rawSkillHalf)) collectSkillSet(rawSkillHalf, halfProfSkills);
    if (!isGlobalBooleanFlag(rawLegacyHalf)) collectSkillSet(rawLegacyHalf, halfProfSkills);

    const itemBonusBySkill: Record<string, number> = {};
    const addBonus = (skillKey: string, amount: number) => {
        if (skillKey && amount) {
            itemBonusBySkill[skillKey] = (itemBonusBySkill[skillKey] || 0) + amount;
        }
    };

    const parseBonusesRecursive = (rawInput: any): void => {
        if (rawInput === undefined || rawInput === null) return;
        if (typeof rawInput === "string") {
            const trimmed = rawInput.trim();
            if (!trimmed) return;
            if (trimmed.startsWith("[")) {
                const parsedArr = parseJsonArrayProp(trimmed);
                parseBonusesRecursive(parsedArr);
                return;
            }
            if (trimmed.includes("|")) {
                const parts = trimmed.split("|").map(p => p.trim());
                if (parts.length >= 3 && !parts[0].includes("<Item")) {
                    addBonus(normalizeSkillKey(parts[1]), parseNumericMod(parts[2], 0));
                }
            }
            return;
        }
        if (Array.isArray(rawInput)) {
            if (
                rawInput.length >= 3 &&
                typeof rawInput[0] === "string" &&
                typeof rawInput[1] === "string" &&
                !Array.isArray(rawInput[0]) &&
                !rawInput[0].trim().startsWith("[")
            ) {
                const slot0 = String(rawInput[0]).trim();
                if (!slot0 || slot0.includes("<Item")) return;
                const cand1 = normalizeSkillKey(rawInput[1]);
                const cand0 = normalizeSkillKey(rawInput[0]);
                // Prefer canonical [itemName, targetSkill, value]; fall back to legacy [targetSkill, itemName, value]
                const skillKey = CANONICAL_SKILL_SET.has(cand1)
                    ? cand1
                    : (CANONICAL_SKILL_SET.has(cand0) ? cand0 : cand1);
                addBonus(skillKey, parseNumericMod(rawInput[2], 0));
                return;
            }
            for (const entry of rawInput) {
                parseBonusesRecursive(entry);
            }
            return;
        }
        if (typeof rawInput === "object") {
            const name = String(rawInput.name || "Bonus").trim();
            if (name.includes("<Item")) return;
            const skillKey = normalizeSkillKey(rawInput.target || rawInput.skill);
            const amount = parseNumericMod(rawInput.value ?? rawInput.bonus, 0);
            addBonus(skillKey, amount);
        }
    };

    parseBonusesRecursive(frontmatter?.["DnD_skillBonuses"]);

    const computeForSkill = (skillLower: string, abilityMod: number): number => {
        let profAdd = 0;
        if (expertiseSkills.has(skillLower)) {
            profAdd = profBonus * 2;
        } else if (proficientSkills.has(skillLower)) {
            profAdd = profBonus;
        } else if (hasGlobalHalfProf || halfProfSkills.has(skillLower)) {
            profAdd = Math.floor(profBonus / 2);
        }
        const itemAdd = itemBonusBySkill[skillLower] || 0;
        return 10 + abilityMod + profAdd + itemAdd;
    };

    return {
        passivePerception: computeForSkill("perception", wisMod),
        passiveInvestigation: computeForSkill("investigation", intMod),
        passiveInsight: computeForSkill("insight", wisMod)
    };
}

/**
 * Lists unique, sorted vault folder paths (excluding hidden dot-folders such as `.obsidian`).
 */
export function listVaultFolderPaths(app: App): string[] {
    const paths = new Set<string>();
    const vaultAny = app?.vault as any;
    if (typeof vaultAny?.getAllFolders === "function") {
        for (const f of vaultAny.getAllFolders(false) || []) {
            if (f?.path) paths.add(normalizePath(String(f.path)));
        }
    } else if (typeof vaultAny?.getAllLoadedFiles === "function") {
        for (const f of vaultAny.getAllLoadedFiles() || []) {
            if (f && Array.isArray((f as any).children) && f.path && f.path !== "/") {
                paths.add(normalizePath(String(f.path)));
            }
        }
    }
    if (paths.size === 0 && typeof vaultAny?.getMarkdownFiles === "function") {
        for (const file of vaultAny.getMarkdownFiles() || []) {
            const fp = normalizePath(String(file?.path || ""));
            const idx = fp.lastIndexOf("/");
            if (idx > 0) paths.add(fp.slice(0, idx));
        }
    }
    return Array.from(paths)
        .map(p => p.replace(/^\/+|\/+$/g, ""))
        .filter(p => p && !p.startsWith(".") && !p.includes("/."))
        .sort((a, b) => a.localeCompare(b));
}

/**
 * Resolves the party character sheet list for the configured DM Tools Party Folder
 * (or embedded block overrides), avoiding dumping every vault character note when unset.
 */
export function getConfiguredPartyMembers(
    app: App,
    plugin: DnDCharacterSheetHelperPlugin,
    embedFilterFolder?: string,
    embedFilterPlayers?: string[]
): { activeFolder: string; members: PartyMemberSummary[]; isConfigured: boolean } {
    const hasExplicitEmbedPlayers = Boolean(embedFilterPlayers && embedFilterPlayers.length > 0);
    const activeFolder = embedFilterFolder !== undefined
        ? embedFilterFolder.trim()
        : (plugin.settings?.partyFolderPath || "").trim();

    if (!activeFolder && !hasExplicitEmbedPlayers) {
        return { activeFolder: "", members: [], isConfigured: false };
    }
    return {
        activeFolder,
        members: discoverVaultPartyMembers(
            app,
            plugin,
            activeFolder || undefined,
            hasExplicitEmbedPlayers ? embedFilterPlayers : undefined
        ),
        isConfigured: true
    };
}

/**
 * Resolves the configured party list using the full `dnd-info` (`mode: combat`)
 * Initiative calculation: `dexMod + DnD_initiativeMod` when present, or automatic
 * feat/class/race/custom Initiative modifiers via `plugin.resolveCharacterInitiativeModifiers`.
 */
export async function getConfiguredPartyMembersAsync(
    app: App,
    plugin: DnDCharacterSheetHelperPlugin,
    embedFilterFolder?: string,
    embedFilterPlayers?: string[]
): Promise<{ activeFolder: string; members: PartyMemberSummary[]; isConfigured: boolean }> {
    const result = getConfiguredPartyMembers(app, plugin, embedFilterFolder, embedFilterPlayers);
    if (!result.isConfigured || result.members.length === 0) return result;
    if (typeof plugin?.resolveCharacterInitiativeModifiers !== "function") return result;

    await Promise.all(result.members.map(async (member) => {
        const cache = app.metadataCache.getFileCache(member.file);
        const fm = cache?.frontmatter;
        if (!fm || typeof fm !== "object") return;

        const rawInitMod = fm["DnD_initiativeMod"];
        if (hasValidValue(rawInitMod)) {
            return;
        }

        const profBonus = parseNumericMod(fm["DnD_proficiencyBonus"], 0) || Math.ceil(1 + (member.level / 4));
        const bgFeatForInit = typeof plugin.resolveBackgroundFeatId === "function"
            ? await plugin.resolveBackgroundFeatId(fm["DnD_background"], fm["DnD_backgroundFeat"], plugin.settings)
            : fm["DnD_backgroundFeat"];
        const initCalc = await plugin.resolveCharacterInitiativeModifiers(
            fm["DnD_class"],
            fm["DnD_classLevels"],
            member.level,
            fm["DnD_extraFeats"],
            bgFeatForInit,
            fm["DnD_subclass"] ?? fm["DnD_Subclass"],
            fm["DnD_race"],
            fm["DnD_raceLineage"],
            member.abilities,
            profBonus,
            fm["DnD_customInitiativeMod"],
            plugin.settings
        );
        member.initBonus = member.dexMod + initCalc.totalInitiativeMod;
    }));

    return result;
}

/**
 * Discovers all character sheet notes in the vault (or filtered by folder / player list).
 */
export function discoverVaultPartyMembers(
    app: App,
    plugin: DnDCharacterSheetHelperPlugin,
    filterFolder?: string,
    filterPlayers?: string[]
): PartyMemberSummary[] {
    const files = app.vault.getMarkdownFiles();
    const rawFolder = typeof filterFolder === "string" ? filterFolder.trim() : "";
    const isRootOnly = rawFolder === "/";
    const normFolder = (!isRootOnly && rawFolder)
        ? normalizePath(rawFolder).toLowerCase().replace(/^\/+|\/+$/g, "")
        : "";
    const playerFilterSet = filterPlayers && filterPlayers.length > 0
        ? new Set(filterPlayers.map(p => p.trim().toLowerCase()).filter(Boolean))
        : null;

    const party: PartyMemberSummary[] = [];

    for (const file of files) {
        if (file.basename === "DnD_Character_TEMPLATE") continue;

        const filePathNormalized = normalizePath(file.path);
        if (isRootOnly) {
            if (filePathNormalized.includes("/")) continue;
        } else if (normFolder) {
            if (!filePathNormalized.toLowerCase().startsWith(normFolder + "/")) continue;
        }

        const cache = app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm || typeof fm !== "object") continue;

        const cssClasses = [
            ...parseStringArray(fm["cssclasses"]),
            ...parseStringArray(fm["cssclass"])
        ].map(c => c.toLowerCase());
        const hasCharacterCss = cssClasses.includes("character-sheet");
        const hasDndKeys = hasValidValue(fm["DnD_level"])
            || hasValidValue(fm["DnD_class"])
            || hasValidValue(fm["DnD_maxHealth"]);
        if (!hasCharacterCss && !hasDndKeys) continue;

        const hasAnyCharacterData = hasDndKeys
            || hasValidValue(fm["DnD_name"])
            || hasValidValue(fm["DnD_strength"])
            || hasValidValue(fm["DnD_dexterity"])
            || hasValidValue(fm["DnD_armorAc"])
            || hasValidValue(fm["DnD_armorClass"]);
        if (!hasAnyCharacterData) continue;

        const rawName = fm["DnD_name"] ?? fm["name"];
        const cleanName = (typeof rawName === "string" && rawName.trim() && !rawName.trim().startsWith("<"))
            ? rawName.trim()
            : file.basename;

        if (playerFilterSet) {
            const matchesName = playerFilterSet.has(cleanName.toLowerCase())
                || playerFilterSet.has(file.basename.toLowerCase())
                || playerFilterSet.has(file.path.toLowerCase());
            if (!matchesName) continue;
        }

        const level = resolvePartyMemberLevel(fm);
        const classArr = parseStringArray(fm["DnD_class"]);
        const subclassArr = parseStringArray(fm["DnD_subclass"] ?? fm["DnD_Subclass"]);
        const raceArr = parseStringArray(fm["DnD_race"]);
        const bgArr = parseStringArray(fm["DnD_background"]);

        const abilities = extractAbilityScores(fm);
        const dexMod = abilityModFromScore(abilities.dexterity);
        const conMod = abilityModFromScore(abilities.constitution);

        const maxHp = hasValidValue(fm["DnD_maxHealth"]) && !isNaN(Number(fm["DnD_maxHealth"]))
            ? Math.max(1, Number(fm["DnD_maxHealth"]))
            : Math.max(1, 8 + conMod + (level - 1) * (5 + conMod));
        const currentHp = hasValidValue(fm["DnD_currentHealth"]) && !isNaN(Number(fm["DnD_currentHealth"]))
            ? Number(fm["DnD_currentHealth"])
            : maxHp;
        const tempHp = hasValidValue(fm["DnD_tempHealth"])
            ? Math.max(0, Number(fm["DnD_tempHealth"]) || 0)
            : 0;

        const rawArmorAc = fm["DnD_armorAc"];
        const hasArmorAc = hasValidValue(rawArmorAc);
        const rawArmorAcBonus = fm["DnD_armorAcBonus"];
        const hasArmorAcBonus = hasValidValue(rawArmorAcBonus);
        const rawArmorAcMod = fm["DnD_armorAcMod"];
        const hasArmorAcMod = hasValidValue(rawArmorAcMod);

        let baseAc: number;
        if (hasArmorAc || hasArmorAcBonus || hasArmorAcMod) {
            const armorAcVal = hasArmorAc ? parseNumericMod(rawArmorAc, 10) : 10;
            const armorAcBonusVal = hasArmorAcBonus
                ? parseNumericMod(rawArmorAcBonus, 0)
                : (hasArmorAc ? 0 : dexMod);
            const armorAcModVal = hasArmorAcMod ? parseNumericMod(rawArmorAcMod, 0) : 0;
            baseAc = armorAcVal + armorAcBonusVal + armorAcModVal;
        } else if (hasValidValue(fm["DnD_armorClass"]) && !isNaN(Number(fm["DnD_armorClass"]))) {
            baseAc = Number(fm["DnD_armorClass"]);
        } else {
            baseAc = 10 + dexMod;
        }

        const baseSpeed = hasValidValue(fm["DnD_speed"]) && !isNaN(Number(fm["DnD_speed"]))
            ? Number(fm["DnD_speed"])
            : 30;
        const speedMod = hasValidValue(fm["DnD_speedMod"]) ? parseNumericMod(fm["DnD_speedMod"], 0) : 0;
        const rawInitMod = fm["DnD_initiativeMod"];
        const initMod = hasValidValue(rawInitMod)
            ? parseNumericMod(rawInitMod, 0)
            : (hasValidValue(fm["DnD_customInitiativeMod"]) ? parseNumericMod(fm["DnD_customInitiativeMod"], 0) : 0);
        const exhaustion = hasValidValue(fm["DnD_exhaustion"])
            ? Math.max(0, Math.min(6, Number(fm["DnD_exhaustion"]) || 0))
            : 0;

        const senses = calculateCharacterPassiveSenses(fm);
        const savingThrows = parseSavingThrows(fm["DnD_classProficiencies"]);
        const languages = parseStringArray(fm["DnD_languages"]);
        const toolProficiencies = parseStringArray(fm["DnD_toolProficiencies"]);

        party.push({
            file,
            sourcePath: file.path,
            name: cleanName,
            level,
            dndClass: classArr.join(" / ") || "Adventurer",
            subclass: subclassArr.join(" / "),
            race: raceArr.join(" / ") || "Unknown Race",
            background: bgArr.join(" / "),
            currentHp,
            maxHp,
            tempHp,
            ac: baseAc,
            speed: Math.max(0, baseSpeed + speedMod),
            dexMod,
            initBonus: dexMod + initMod,
            exhaustion,
            heroicInspiration: Boolean(plugin?.activeHeroicInspiration?.has(file.path)),
            passivePerception: senses.passivePerception,
            passiveInvestigation: senses.passiveInvestigation,
            passiveInsight: senses.passiveInsight,
            savingThrows,
            languages,
            toolProficiencies,
            abilities
        });
    }

    return party.sort((a, b) => a.name.localeCompare(b.name));
}
