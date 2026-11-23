import {
    App,
    ItemView,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    MarkdownRenderer,
    MarkdownView,
    Modal,
    Notice,
    TFile,
    WorkspaceLeaf,
    normalizePath
} from 'obsidian';
import type DnDCharacterSheetHelperPlugin from './main';
import { DM_RIBBON_ICON_SVG } from './ribbon-icon';
import {
    ALL_ABILITIES,
    AbilityKey,
    extractAbilityScores,
    formatFeatureOrSlug,
    formatPoolDisplayName,
    parseBlockYaml,
    parseExtraFeatsList,
    parseJsonArrayProp,
    parseSavingThrows,
    parseStringArray
} from './main';
import {
    CompendiumRuleEntry,
    CompendiumSpellEntry,
    FeatPoolEntry,
    getAllCompendiumBackgrounds,
    getAllCompendiumClassChoices,
    getAllCompendiumClasses,
    getAllCompendiumItems,
    getAllCompendiumRaces,
    getAllCompendiumRules,
    getAllCompendiumSpells,
    getAvailableFeats,
    getExtraFeat,
    getWeaponMasteriesMap,
    getWeaponMasteryDescription,
    toSlug
} from './data';

export const DM_TOOLS_VIEW_TYPE = "dnd-dm-tools-view";

export type DMToolsTabId = "compendium" | "spells" | "initiative" | "party" | "monsters";

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

function rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
}

function formatSignedNumber(n: number): string {
    const val = Number(n) || 0;
    return val >= 0 ? `+${val}` : `${val}`;
}

function abilityModFromScore(score: number): number {
    return Math.floor(((Number(score) || 10) - 10) / 2);
}

function parseNumericMod(rawVal: any, fallback: number = 0): number {
    if (rawVal === undefined || rawVal === null || rawVal === "") return fallback;
    const cleaned = String(rawVal).trim().replace(/^\+/, "");
    const num = Number(cleaned);
    return isNaN(num) ? fallback : num;
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

/**
 * Calculates 5.5e Passive Perception, Passive Investigation, and Passive Insight
 * from character sheet frontmatter (`10 + AbilityMod + Prof/Exp/HalfProf + SkillItemBonuses`).
 */
export function calculateCharacterPassiveSenses(frontmatter: Record<string, any>): {
    passivePerception: number;
    passiveInvestigation: number;
    passiveInsight: number;
} {
    const level = Math.max(1, Number(frontmatter["DnD_level"]) || 1);
    const profBonus = Math.ceil(level / 4) + 1;
    const stats = extractAbilityScores(frontmatter);

    const wisMod = abilityModFromScore(stats.wisdom);
    const intMod = abilityModFromScore(stats.intelligence);

    const proficientSkills = new Set<string>();
    for (const entry of parseJsonArrayProp(frontmatter["DnD_skillProficiencies"])) {
        if (Array.isArray(entry) && entry[0]) {
            proficientSkills.add(String(entry[0]).trim().toLowerCase());
        } else if (typeof entry === "string" && entry.trim()) {
            proficientSkills.add(entry.trim().toLowerCase());
        }
    }

    const expertiseSkills = new Set<string>(
        parseStringArray(frontmatter["DnD_expertise"]).map(s => s.toLowerCase())
    );
    const halfProfRaw = frontmatter["DnD_halfProficiency"];
    const hasGlobalHalfProf = halfProfRaw === true || String(halfProfRaw).toLowerCase() === "true";
    const halfProfSkills = new Set<string>(
        Array.isArray(halfProfRaw) || (typeof halfProfRaw === "string" && halfProfRaw.trim() !== "true")
            ? parseStringArray(halfProfRaw).map(s => s.toLowerCase())
            : []
    );

    const itemBonusBySkill: Record<string, number> = {};
    for (const bonusTuple of parseJsonArrayProp(frontmatter["DnD_skillBonuses"])) {
        if (Array.isArray(bonusTuple) && bonusTuple.length >= 3) {
            const skillKey = String(bonusTuple[0] || "").trim().toLowerCase();
            const amount = Number(bonusTuple[2]) || 0;
            if (skillKey && amount) {
                itemBonusBySkill[skillKey] = (itemBonusBySkill[skillKey] || 0) + amount;
            }
        }
    }

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

    for (const member of result.members) {
        const cache = app.metadataCache.getFileCache(member.file);
        const fm = cache?.frontmatter;
        if (!fm || typeof fm !== "object") continue;

        const rawInitMod = fm["DnD_initiativeMod"];
        if (rawInitMod !== undefined && rawInitMod !== null && String(rawInitMod).trim() !== "") {
            continue;
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
    }

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
        const hasDndKeys = fm["DnD_level"] !== undefined || fm["DnD_class"] !== undefined || fm["DnD_maxHealth"] !== undefined;
        if (!hasCharacterCss && !hasDndKeys) continue;

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

        const level = Math.max(1, Number(fm["DnD_level"]) || 1);
        const classArr = parseStringArray(fm["DnD_class"]);
        const subclassArr = parseStringArray(fm["DnD_subclass"] ?? fm["DnD_Subclass"]);
        const raceArr = parseStringArray(fm["DnD_race"]);
        const bgArr = parseStringArray(fm["DnD_background"]);

        const abilities = extractAbilityScores(fm);
        const dexMod = abilityModFromScore(abilities.dexterity);
        const conMod = abilityModFromScore(abilities.constitution);

        const maxHp = fm["DnD_maxHealth"] !== undefined && !isNaN(Number(fm["DnD_maxHealth"]))
            ? Math.max(1, Number(fm["DnD_maxHealth"]))
            : Math.max(1, 8 + conMod + (level - 1) * (5 + conMod));
        const currentHp = fm["DnD_currentHealth"] !== undefined && !isNaN(Number(fm["DnD_currentHealth"]))
            ? Number(fm["DnD_currentHealth"])
            : maxHp;
        const tempHp = Math.max(0, Number(fm["DnD_tempHealth"]) || 0);

        const rawArmorAc = fm["DnD_armorAc"];
        const hasArmorAc = rawArmorAc !== undefined && rawArmorAc !== null && String(rawArmorAc).trim() !== "";
        const rawArmorAcBonus = fm["DnD_armorAcBonus"];
        const hasArmorAcBonus = rawArmorAcBonus !== undefined && rawArmorAcBonus !== null && String(rawArmorAcBonus).trim() !== "";
        const rawArmorAcMod = fm["DnD_armorAcMod"];
        const hasArmorAcMod = rawArmorAcMod !== undefined && rawArmorAcMod !== null && String(rawArmorAcMod).trim() !== "";

        let baseAc: number;
        if (hasArmorAc || hasArmorAcBonus || hasArmorAcMod) {
            const armorAcVal = hasArmorAc ? parseNumericMod(rawArmorAc, 10) : 10;
            const armorAcBonusVal = hasArmorAcBonus
                ? parseNumericMod(rawArmorAcBonus, 0)
                : (hasArmorAc ? 0 : dexMod);
            const armorAcModVal = hasArmorAcMod ? parseNumericMod(rawArmorAcMod, 0) : 0;
            baseAc = armorAcVal + armorAcBonusVal + armorAcModVal;
        } else if (fm["DnD_armorClass"] !== undefined && !isNaN(Number(fm["DnD_armorClass"]))) {
            baseAc = Number(fm["DnD_armorClass"]);
        } else {
            baseAc = 10 + dexMod;
        }

        const baseSpeed = fm["DnD_speed"] !== undefined && !isNaN(Number(fm["DnD_speed"]))
            ? Number(fm["DnD_speed"])
            : 30;
        const speedMod = parseNumericMod(fm["DnD_speedMod"], 0);
        const rawInitMod = fm["DnD_initiativeMod"];
        const initMod = (rawInitMod !== undefined && rawInitMod !== null && String(rawInitMod).trim() !== "")
            ? parseNumericMod(rawInitMod, 0)
            : parseNumericMod(fm["DnD_customInitiativeMod"], 0);
        const exhaustion = Math.max(0, Math.min(6, Number(fm["DnD_exhaustion"]) || 0));

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
            heroicInspiration: plugin.activeHeroicInspiration.has(file.path),
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

// ============================================================================
// --- MONSTER & STATBLOCK DISCOVERY ("The DM Compendium" Bestiary + Vault Notes) ---
// ============================================================================

export interface MonsterTraitEntry {
    name: string;
    desc: string;
    entries?: string[];
    displayAs?: string;
}

export interface DiscoveredMonster {
    id: string;
    name: string;
    sourcePlugin: "the-dm-compendium" | "vault-note" | "srd-builtin";
    sourceCode: string;
    sourceShort: string;
    sourceFull: string;
    sourceLabel: string;
    page?: number | string;
    size: string;
    type: string;
    subtype?: string;
    alignment: string;
    ac: number;
    acText: string;
    hp: number;
    hpText?: string;
    hitDice?: string;
    speed: string;
    stats: [number, number, number, number, number, number]; // STR, DEX, CON, INT, WIS, CHA
    dexMod: number;
    cr: string;
    senses?: string;
    languages?: string;
    saves?: string;
    skills?: string;
    vulnerabilities?: string;
    resistances?: string;
    immunities?: string;
    conditionImmunities?: string;
    environment?: string[];
    traits: MonsterTraitEntry[];
    spellcasting: MonsterTraitEntry[];
    actions: MonsterTraitEntry[];
    bonusActions: MonsterTraitEntry[];
    reactions: MonsterTraitEntry[];
    legendaryActions: MonsterTraitEntry[];
    mythicActions: MonsterTraitEntry[];
    lairActions: MonsterTraitEntry[];
    rawYaml?: string;
}

/**
 * Official source book dictionary used by "The DM Compendium" (`the-dm-compendium`).
 */
export const DM_COMPENDIUM_SOURCES: Record<string, { full: string; short: string }> = {
    PHB: { full: "Player's Handbook (2014)", short: "PHB'14" },
    XPHB: { full: "Player's Handbook (2024)", short: "PHB'24" },
    MM: { full: "Monster Manual (2014)", short: "MM'14" },
    XMM: { full: "Monster Manual (2025)", short: "MM'25" },
    DMG: { full: "Dungeon Master's Guide (2014)", short: "DMG'14" },
    XDMG: { full: "Dungeon Master's Guide (2024)", short: "DMG'24" },
    MPMM: { full: "Mordenkainen's Presents: Monsters and Minions", short: "MPMM" },
    TCE: { full: "Tasha's Cauldron of Everything", short: "TCE" },
    XGE: { full: "Xanathar's Guide to Everything", short: "XGE" },
    FTD: { full: "Fizban's Treasury of Dragons", short: "FTD" },
    BGG: { full: "Bigby Presents: Glory of the Giants", short: "BGG" },
    BMT: { full: "The Book of Many Things", short: "BMT" },
    BAM: { full: "Boo's Astral Menagerie", short: "BAM" },
    VGM: { full: "Volo's Guide to Monsters", short: "VGM" },
    MTF: { full: "Mordenkainen's Tome of Foes", short: "MTF" },
    VRGR: { full: "Van Richten's Guide to Ravenloft", short: "VRGR" },
    ERLW: { full: "Eberron: Rising from the Last War", short: "ERLW" },
    EFA: { full: "Eberron: Forge of the Artificer", short: "EFA" },
    EGW: { full: "Explorer's Guide to Wildemount", short: "EGW" },
    GGR: { full: "Guildmasters' Guide to Ravnica", short: "GGR" },
    MOT: { full: "Mythic Odysseys of Theros", short: "MOT" },
    SCC: { full: "Strixhaven: A Curriculum of Chaos", short: "SCC" },
    DSOTDQ: { full: "Dragonlance: Shadow of the Dragon Queen", short: "DSOTDQ" },
    BGDIA: { full: "Baldur's Gate: Descent Into Avernus", short: "BGDIA" },
    COS: { full: "Curse of Strahd", short: "COS" },
    IDROTF: { full: "Icewind Dale: Rime of the Frostmaiden", short: "IDROTF" },
    TOA: { full: "Tomb of Annihilation", short: "TOA" },
    WBTW: { full: "The Wild Beyond the Witchlight", short: "WBTW" },
    WDH: { full: "Waterdeep: Dragon Heist", short: "WDH" },
    WDMM: { full: "Waterdeep: Dungeon of the Mad Mage", short: "WDMM" },
    VEOR: { full: "Vecna: Eve of Ruin", short: "VEOR" },
    QFTIS: { full: "Quests from the Infinite Staircase", short: "QFTIS" },
    PABTSO: { full: "Phandelver and Below: The Shattered Obelisk", short: "PABTSO" },
    SATO: { full: "Sigil and the Outlands", short: "SATO" },
    MPP: { full: "Morte's Planar Parade", short: "MPP" },
    COA: { full: "Chains of Asmodeus", short: "COA" },
    KFTGV: { full: "Keys from the Golden Vault", short: "KFTGV" },
    JTTRC: { full: "Journeys Through the Radiant Citadel", short: "JTTRC" },
    CM: { full: "Candlekeep Mysteries", short: "CM" },
    GOS: { full: "Ghosts of Saltmarsh", short: "GOS" },
    OOTA: { full: "Out of the Abyss", short: "OOTA" },
    POTA: { full: "Princes of the Apocalypse", short: "POTA" },
    SKT: { full: "Storm King's Thunder", short: "SKT" },
    TFTYP: { full: "Tales from the Yawning Portal", short: "TFTYP" },
    LMOP: { full: "Lost Mine of Phandelver", short: "LMOP" },
    DOSI: { full: "Dragons of Stormwreck Isle", short: "DOSI" },
    DIP: { full: "Dragon of Icespire Peak", short: "DIP" },
    ESK: { full: "Essentials Kit", short: "ESK" }
};

export function resolveDmCompendiumSourceInfo(rawSource: any): { code: string; short: string; full: string } {
    const code = String(rawSource || "").trim().toUpperCase();
    if (!code) {
        return { code: "CUSTOM", short: "Custom", full: "Custom / Unknown Source" };
    }
    const found = DM_COMPENDIUM_SOURCES[code];
    if (found) {
        return { code, short: found.short, full: found.full };
    }
    return { code, short: code, full: code };
}

export function parseCrNumericValue(cr: string): number {
    const clean = String(cr || "").trim();
    if (!clean || clean === "—" || clean === "-") return -1;
    if (clean === "1/8") return 0.125;
    if (clean === "1/4") return 0.25;
    if (clean === "1/2") return 0.5;
    const num = Number(clean);
    return Number.isFinite(num) ? num : 999;
}

const BUILTIN_SRD_MONSTERS: DiscoveredMonster[] = [
    {
        id: "srd::goblin-warrior",
        name: "Goblin Warrior",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Small",
        type: "Fey",
        subtype: "Goblinoid",
        alignment: "Chaotic Neutral",
        ac: 15,
        acText: "15 (Leather Armor, Shield)",
        hp: 10,
        hitDice: "3d6",
        speed: "30 ft.",
        stats: [8, 15, 10, 10, 8, 8],
        dexMod: 2,
        cr: "1/4",
        senses: "Darkvision 60 ft., Passive Perception 9",
        languages: "Common, Goblin",
        skills: "Stealth +6",
        traits: [],
        spellcasting: [],
        actions: [
            { name: "Scimitar", desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage." },
            { name: "Shortbow", desc: "Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) Piercing damage, plus 2 (1d4) Piercing damage if the attack roll had Advantage." }
        ],
        bonusActions: [
            { name: "Nimble Escape", desc: "The goblin takes the Disengage or Hide action." }
        ],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::skeleton",
        name: "Skeleton",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Medium",
        type: "Undead",
        alignment: "Lawful Evil",
        ac: 14,
        acText: "14 (Armor Scraps)",
        hp: 13,
        hitDice: "2d8 + 4",
        speed: "30 ft.",
        stats: [10, 16, 15, 6, 8, 5],
        dexMod: 3,
        cr: "1/4",
        senses: "Darkvision 60 ft., Passive Perception 9",
        languages: "Understands languages it knew in life but can't speak",
        vulnerabilities: "Bludgeoning",
        immunities: "Poison",
        conditionImmunities: "Exhaustion, Poisoned",
        traits: [],
        spellcasting: [],
        actions: [
            { name: "Shortsword", desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) Piercing damage." },
            { name: "Shortbow", desc: "Ranged Weapon Attack: +5 to hit, range 80/320 ft., one target. Hit: 6 (1d6 + 3) Piercing damage." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::bandit",
        name: "Bandit",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Medium",
        type: "Humanoid",
        alignment: "Neutral",
        ac: 12,
        acText: "12 (Leather Armor)",
        hp: 11,
        hitDice: "2d8 + 2",
        speed: "30 ft.",
        stats: [11, 12, 12, 10, 10, 10],
        dexMod: 1,
        cr: "1/8",
        senses: "Passive Perception 10",
        languages: "Common, Thieves' Cant",
        traits: [],
        spellcasting: [],
        actions: [
            { name: "Scimitar", desc: "Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) Slashing damage." },
            { name: "Light Crossbow", desc: "Ranged Weapon Attack: +3 to hit, range 80/320 ft., one target. Hit: 5 (1d8 + 1) Piercing damage." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::dire-wolf",
        name: "Dire Wolf",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Large",
        type: "Beast",
        alignment: "Unaligned",
        ac: 14,
        acText: "14 (Natural Armor)",
        hp: 22,
        hitDice: "3d10 + 6",
        speed: "50 ft.",
        stats: [17, 15, 15, 3, 12, 7],
        dexMod: 2,
        cr: "1",
        senses: "Darkvision 60 ft., Passive Perception 15",
        skills: "Perception +5, Stealth +4",
        traits: [
            { name: "Pack Tactics", desc: "The wolf has Advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition." }
        ],
        spellcasting: [],
        actions: [
            { name: "Bite", desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d10 + 3) Piercing damage. If the target is a Large or smaller creature, it has the Prone condition." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::ogre",
        name: "Ogre",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Large",
        type: "Giant",
        alignment: "Chaotic Evil",
        ac: 11,
        acText: "11 (Hide Armor)",
        hp: 68,
        hitDice: "8d10 + 24",
        speed: "40 ft.",
        stats: [19, 8, 16, 5, 7, 7],
        dexMod: -1,
        cr: "2",
        senses: "Darkvision 60 ft., Passive Perception 8",
        languages: "Common, Giant",
        traits: [],
        spellcasting: [],
        actions: [
            { name: "Greatclub", desc: "Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) Bludgeoning damage." },
            { name: "Javelin", desc: "Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 11 (2d6 + 4) Piercing damage." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::owlbear",
        name: "Owlbear",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Large",
        type: "Monstrosity",
        alignment: "Unaligned",
        ac: 13,
        acText: "13 (Natural Armor)",
        hp: 59,
        hitDice: "7d10 + 21",
        speed: "40 ft., Climb 40 ft.",
        stats: [20, 12, 17, 3, 12, 7],
        dexMod: 1,
        cr: "3",
        senses: "Darkvision 60 ft., Passive Perception 15",
        skills: "Perception +5",
        traits: [],
        spellcasting: [],
        actions: [
            { name: "Multiattack", desc: "The owlbear makes two Rend attacks." },
            { name: "Rend", desc: "Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 14 (2d8 + 5) Slashing damage." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::troll",
        name: "Troll",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Large",
        type: "Giant",
        alignment: "Chaotic Evil",
        ac: 15,
        acText: "15 (Natural Armor)",
        hp: 94,
        hitDice: "9d10 + 45",
        speed: "30 ft.",
        stats: [18, 13, 20, 7, 9, 7],
        dexMod: 1,
        cr: "5",
        senses: "Darkvision 60 ft., Passive Perception 13",
        languages: "Giant",
        skills: "Perception +3",
        traits: [
            { name: "Regeneration", desc: "The troll regains 15 Hit Points at the start of each of its turns. If the troll takes Acid or Fire damage, this trait doesn't function on the troll's next turn. The troll dies only if it starts its turn with 0 Hit Points and doesn't regenerate." }
        ],
        spellcasting: [],
        actions: [
            { name: "Multiattack", desc: "The troll makes three Rend attacks." },
            { name: "Rend", desc: "Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 11 (2d6 + 4) Slashing damage." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        mythicActions: [],
        lairActions: []
    },
    {
        id: "srd::adult-red-dragon",
        name: "Adult Red Dragon",
        sourcePlugin: "srd-builtin",
        sourceCode: "SRD",
        sourceShort: "SRD",
        sourceFull: "Built-in SRD Preset",
        sourceLabel: "SRD Preset",
        size: "Huge",
        type: "Dragon",
        subtype: "Chromatic",
        alignment: "Chaotic Evil",
        ac: 19,
        acText: "19 (Natural Armor)",
        hp: 256,
        hitDice: "19d12 + 133",
        speed: "40 ft., Climb 40 ft., Fly 80 ft.",
        stats: [27, 10, 25, 16, 13, 23],
        dexMod: 0,
        cr: "17",
        senses: "Blindsight 60 ft., Darkvision 120 ft., Passive Perception 23",
        languages: "Common, Draconic",
        saves: "Dex +6, Wis +7",
        skills: "Perception +13, Stealth +6",
        immunities: "Fire",
        traits: [
            { name: "Legendary Resistance (3/Day)", desc: "If the dragon fails a saving throw, it can choose to succeed instead." }
        ],
        spellcasting: [],
        actions: [
            { name: "Multiattack", desc: "The dragon makes three Rend attacks. It can replace one attack with a casting of Spellcasting (Scorching Ray)." },
            { name: "Rend", desc: "Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 13 (1d10 + 8) Slashing damage plus 5 (1d10) Fire damage." },
            { name: "Fire Breath (Recharge 5-6)", desc: "Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage." }
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [
            { name: "Commanding Presence", desc: "The dragon uses Spellcasting to cast Command." },
            { name: "Fiery Rays", desc: "The dragon uses Spellcasting to cast Scorching Ray." },
            { name: "Pounce", desc: "The dragon moves up to half its Speed, and it makes one Rend attack." }
        ],
        mythicActions: [],
        lairActions: []
    }
];

function normalizeTraitArray(raw: any): MonsterTraitEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: MonsterTraitEntry[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const name = String(item.name || "").trim();
        const entriesArr = Array.isArray(item.entries)
            ? item.entries.map((e: any) => String(e ?? "").trim()).filter(Boolean)
            : [];
        const desc = entriesArr.length > 0
            ? entriesArr.join("\n\n")
            : String(item.desc ?? item.description ?? item.text ?? "").trim();
        if (name || desc) {
            out.push({
                name: name || "Feature",
                desc,
                entries: entriesArr.length > 0 ? entriesArr : (desc ? [desc] : []),
                displayAs: item.displayAs ? String(item.displayAs) : undefined
            });
        }
    }
    return out;
}

function splitMonsterTypeAndSubtype(rawType: any, explicitSubtype?: any): { type: string; subtype?: string } {
    const str = String(rawType || "Creature").trim();
    if (explicitSubtype && String(explicitSubtype).trim()) {
        return { type: str, subtype: String(explicitSubtype).trim() };
    }
    const m = str.match(/^(.+?)\s*\((.+)\)$/);
    if (m) {
        return { type: m[1].trim(), subtype: m[2].trim() };
    }
    return { type: str };
}

function extractHitDiceFromHpString(hpStr: string): string | undefined {
    const m = String(hpStr || "").match(/\(([^)]+)\)/);
    return m ? m[1].trim() : undefined;
}

export function normalizeMonsterRecord(
    raw: Record<string, any>,
    sourcePlugin: DiscoveredMonster["sourcePlugin"],
    fallbackSourceLabel: string,
    rawYaml?: string
): DiscoveredMonster | null {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim();
    if (!name) return null;

    let stats: [number, number, number, number, number, number] = [10, 10, 10, 10, 10, 10];
    if (raw.abilities && typeof raw.abilities === "object" && !Array.isArray(raw.abilities)) {
        // The DM Compendium bestiary.json schema: { abilities: { str, dex, con, int, wis, cha } }
        stats = [
            Number(raw.abilities.str ?? raw.abilities.strength) || 10,
            Number(raw.abilities.dex ?? raw.abilities.dexterity) || 10,
            Number(raw.abilities.con ?? raw.abilities.constitution) || 10,
            Number(raw.abilities.int ?? raw.abilities.intelligence) || 10,
            Number(raw.abilities.wis ?? raw.abilities.wisdom) || 10,
            Number(raw.abilities.cha ?? raw.abilities.charisma) || 10
        ];
    } else if (Array.isArray(raw.stats) && raw.stats.length >= 6) {
        stats = [
            Number(raw.stats[0]) || 10,
            Number(raw.stats[1]) || 10,
            Number(raw.stats[2]) || 10,
            Number(raw.stats[3]) || 10,
            Number(raw.stats[4]) || 10,
            Number(raw.stats[5]) || 10
        ];
    } else if (raw.strength !== undefined || raw.str !== undefined) {
        stats = [
            Number(raw.strength ?? raw.str) || 10,
            Number(raw.dexterity ?? raw.dex) || 10,
            Number(raw.constitution ?? raw.con) || 10,
            Number(raw.intelligence ?? raw.int) || 10,
            Number(raw.wisdom ?? raw.wis) || 10,
            Number(raw.charisma ?? raw.cha) || 10
        ];
    }

    const dexMod = abilityModFromScore(stats[1]);

    // Armor Class (supports The DM Compendium's `armorClass` as well as `ac`)
    let acNum = 10;
    let acText = "10";
    const rawAcVal = raw.armorClass ?? raw.ac;
    if (typeof rawAcVal === "number") {
        acNum = rawAcVal;
        acText = String(rawAcVal);
    } else if (typeof rawAcVal === "string" && rawAcVal.trim()) {
        acText = rawAcVal.trim();
        const m = acText.match(/^(\d+)/) || acText.match(/\d+/);
        acNum = m ? Number(m[0]) : 10;
    } else if (Array.isArray(raw.armor_class) && raw.armor_class[0]) {
        const firstAc = raw.armor_class[0];
        acNum = Number(firstAc.value ?? firstAc) || 10;
        acText = String(acNum);
    }

    // Hit Points & Hit Dice (supports The DM Compendium's `hitPoints: "66 (12d8 + 12)"` as well as `hp`)
    let hpNum = 10;
    let hpText: string | undefined;
    let hitDice = raw.hit_dice ? String(raw.hit_dice).trim() : undefined;
    const rawHpVal = raw.hitPoints ?? raw.hp ?? raw.hit_points;
    if (typeof rawHpVal === "number") {
        hpNum = Math.max(1, rawHpVal);
        hpText = String(hpNum);
    } else if (typeof rawHpVal === "string" && rawHpVal.trim()) {
        hpText = rawHpVal.trim();
        const m = hpText.match(/^(\d+)/) || hpText.match(/\d+/);
        hpNum = m ? Math.max(1, Number(m[0])) : 10;
        if (!hitDice) {
            hitDice = extractHitDiceFromHpString(hpText);
        }
    }

    // Speed (strip leading "walk " just like The DM Compendium's Ue() helper)
    let speedStr = "30 ft.";
    if (typeof raw.speed === "string" && raw.speed.trim()) {
        speedStr = raw.speed.trim().replace(/\bwalk\s+/gi, "");
    } else if (raw.speed && typeof raw.speed === "object") {
        speedStr = Object.entries(raw.speed)
            .map(([k, v]) => (k === "walk" ? `${v}` : `${k} ${v}`))
            .join(", ");
    }

    // Challenge Rating (supports The DM Compendium's `challengeRating` as well as `cr`)
    const rawCrVal = raw.challengeRating ?? raw.cr ?? raw.challenge_rating;
    const crStr = rawCrVal !== undefined && rawCrVal !== null && String(rawCrVal).trim() !== ""
        ? String(rawCrVal).trim()
        : "—";

    const { type, subtype } = splitMonsterTypeAndSubtype(raw.type, raw.subtype);
    const srcInfo = resolveDmCompendiumSourceInfo(raw.sourceKey || raw.source);
    const sourceCode = sourcePlugin === "the-dm-compendium" ? srcInfo.code : (sourcePlugin === "vault-note" ? "VAULT" : "SRD");
    const sourceShort = sourcePlugin === "the-dm-compendium" ? srcInfo.short : fallbackSourceLabel;
    const sourceFull = sourcePlugin === "the-dm-compendium" ? srcInfo.full : fallbackSourceLabel;
    const sourceLabel = sourcePlugin === "the-dm-compendium" ? srcInfo.short : fallbackSourceLabel;

    const savesStr = raw.savingThrows || raw.saves;
    const skillsStr = raw.skills || (raw.skillsaves ? JSON.stringify(raw.skillsaves) : undefined);
    const resStr = raw.damageResistances ?? raw.damage_resistances;
    const immStr = raw.damageImmunities ?? raw.damage_immunities;
    const condImmStr = raw.conditionImmunities ?? raw.condition_immunities;

    return {
        id: `${sourcePlugin}::${toSlug(sourceCode)}::${toSlug(name)}`,
        name,
        sourcePlugin,
        sourceCode,
        sourceShort,
        sourceFull,
        sourceLabel,
        page: raw.page !== undefined && raw.page !== "" ? raw.page : undefined,
        size: String(raw.size || "Medium").trim(),
        type,
        subtype,
        alignment: String(raw.alignment || "Unaligned").trim(),
        ac: acNum,
        acText,
        hp: hpNum,
        hpText,
        hitDice,
        speed: speedStr,
        stats,
        dexMod,
        cr: crStr,
        senses: raw.senses ? (typeof raw.senses === "string" ? raw.senses.trim() : JSON.stringify(raw.senses)) : undefined,
        languages: raw.languages ? (Array.isArray(raw.languages) ? raw.languages.join(", ") : String(raw.languages).trim()) : undefined,
        saves: savesStr ? (typeof savesStr === "string" ? savesStr.trim() : JSON.stringify(savesStr)) : undefined,
        skills: skillsStr ? (typeof skillsStr === "string" ? skillsStr.trim() : JSON.stringify(skillsStr)) : undefined,
        vulnerabilities: raw.damage_vulnerabilities ? String(raw.damage_vulnerabilities).trim() : undefined,
        resistances: resStr ? String(resStr).trim() : undefined,
        immunities: immStr ? String(immStr).trim() : undefined,
        conditionImmunities: condImmStr ? String(condImmStr).trim() : undefined,
        environment: Array.isArray(raw.environment) ? raw.environment.map((e: any) => String(e).trim()).filter(Boolean) : undefined,
        traits: normalizeTraitArray(raw.traits ?? raw.special_abilities),
        spellcasting: normalizeTraitArray(raw.spellcasting),
        actions: normalizeTraitArray(raw.actions),
        bonusActions: normalizeTraitArray(raw.bonusActions ?? raw.bonus_actions),
        reactions: normalizeTraitArray(raw.reactions),
        legendaryActions: normalizeTraitArray(raw.legendaryActions ?? raw.legendary_actions),
        mythicActions: normalizeTraitArray(raw.mythicActions ?? raw.mythic_actions),
        lairActions: normalizeTraitArray(raw.lairActions ?? raw.lair_actions),
        rawYaml
    };
}

const SAVE_KEY_MAP: Record<string, string> = {
    str: "strength",
    dex: "dexterity",
    con: "constitution",
    int: "intelligence",
    wis: "wisdom",
    cha: "charisma"
};

function formatColonSeparatedPairsYaml(rawStr: string | undefined, keyMap: Record<string, string> = {}): string {
    if (!rawStr || !rawStr.trim()) return " []";
    const pairs: [string, string | number][] = [];
    for (const part of rawStr.split(",")) {
        const [k, ...rest] = part.split(":");
        if (!k || rest.length === 0) continue;
        const cleanKey = k.trim().toLowerCase();
        const mappedKey = keyMap[cleanKey] ?? cleanKey;
        const rawVal = rest.join(":").trim();
        const numVal = Number(rawVal.replace(/^\+/, ""));
        pairs.push([mappedKey, Number.isFinite(numVal) ? numVal : rawVal]);
    }
    if (pairs.length === 0) return " []";
    return "\n" + pairs.map(([k, v]) => `  - ${k}: ${v}`).join("\n");
}

function formatIndentedMultilineYaml(text: string, indentSpaces: number): string {
    const pad = " ".repeat(indentSpaces);
    return ` |-\n${String(text || "").split(/\r?\n/).map(line => `${pad}${line}`).join("\n")}`;
}

function formatTraitsBlockYaml(entries: MonsterTraitEntry[]): string {
    if (!entries || entries.length === 0) return " []";
    return "\n" + entries.map(item => {
        const cName = JSON.stringify(String(item.name || ""));
        const joined = (item.entries && item.entries.length > 0)
            ? item.entries.map(e => e.trim()).filter(Boolean).join("\n\n")
            : String(item.desc || "").trim();
        return `  - name: ${cName}\n    desc:${formatIndentedMultilineYaml(joined, 6)}`;
    }).join("\n");
}

function formatSpellcastingYaml(spellEntries: MonsterTraitEntry[]): string {
    if (!spellEntries || spellEntries.length === 0) return " []";
    const flatLines = spellEntries.flatMap(entry => {
        const list = (entry.entries && entry.entries.length > 0 ? entry.entries : [entry.desc])
            .map(s => String(s || "").trim())
            .filter(Boolean);
        if (entry.name && entry.name !== "Spellcasting") {
            return [`${entry.name}. ${list[0] ?? ""}`.trim(), ...list.slice(1)];
        }
        return list;
    });
    if (flatLines.length === 0) return " []";
    return "\n" + flatLines.map(line => `  -${formatIndentedMultilineYaml(line, 4)}`).join("\n");
}

/**
 * Generates a `statblock` YAML block matching "The DM Compendium"'s `P.prototype.format` specification.
 */
export function buildStatblockYaml(monster: DiscoveredMonster): string {
    if (monster.rawYaml && monster.rawYaml.trim()) {
        return monster.rawYaml.trim();
    }
    const c = (val: any) => (val === undefined || val === null || val === "") ? '""' : JSON.stringify(String(val));
    const j = (val: any) => (typeof val === "number" ? String(val) : c(val));
    const stripHitDiceMod = (hd?: string) => hd ? hd.replace(/\s*[+-]\s*\d+$/, "").trim() : "";

    const lines: string[] = [
        `layout: Basic 5e Layout`,
        `name: ${c(monster.name)}`,
        `image: [[${monster.name}.jpg]]`,
        `size: ${c(monster.size)}`,
        `type: ${c(monster.type)}`,
        `subtype: ${c(monster.subtype || "")}`,
        `alignment: ${c(monster.alignment)}`,
        `ac: ${j(monster.ac)}`,
        `hp: ${j(monster.hp)}`,
        `hit_dice: ${c(stripHitDiceMod(monster.hitDice))}`,
        `speed: ${c(monster.speed)}`,
        `stats: [${monster.stats.join(", ")}]`,
        `saves:${formatColonSeparatedPairsYaml(monster.saves, SAVE_KEY_MAP)}`,
        `skillsaves:${formatColonSeparatedPairsYaml(monster.skills)}`,
        `senses: ${c(monster.senses || "")}`,
        `languages: ${c(monster.languages || "")}`,
        `damage_resistances: ${c(monster.resistances || "")}`,
        `damage_immunities: ${c(monster.immunities || "")}`,
        `condition_immunities: ${c(monster.conditionImmunities || "")}`,
        `cr: ${c(monster.cr)}`,
        `traits:${formatTraitsBlockYaml(monster.traits)}`,
        `actions:${formatTraitsBlockYaml([...(monster.actions || []), ...(monster.bonusActions || [])])}`,
        `reactions:${formatTraitsBlockYaml(monster.reactions)}`,
        `legendary_actions:${formatTraitsBlockYaml(monster.legendaryActions)}`,
        `mythic_actions:${formatTraitsBlockYaml(monster.mythicActions)}`,
        `lair_actions:${formatTraitsBlockYaml(monster.lairActions)}`,
        `spells:${formatSpellcastingYaml(monster.spellcasting)}`,
        `source: ${c(monster.sourceShort || monster.sourceLabel)}`,
        `page: ${j(monster.page ?? "")}`
    ];

    return lines.join("\n");
}

/**
 * Discovers monsters directly from "The DM Compendium" (`the-dm-compendium/cache/bestiary.json`),
 * plus any custom `statblock` blocks in vault notes (falling back to built-in presets only if The DM Compendium is not available).
 */
export async function discoverExternalMonsters(app: App): Promise<{
    monsters: DiscoveredMonster[];
    hasDmCompendium: boolean;
    dmCompendiumCount: number;
    vaultStatblockCount: number;
    availableSources: { code: string; short: string; full: string; count: number }[];
}> {
    const pluginsObj = (app as any).plugins;
    const enabledSet: Set<string> | undefined = pluginsObj?.enabledPlugins;
    const tdcPlugin = pluginsObj?.plugins?.["the-dm-compendium"];
    let hasDmCompendium = Boolean(enabledSet?.has?.("the-dm-compendium") || tdcPlugin);

    const discoveredMap = new Map<string, DiscoveredMonster>();
    let dmCompendiumCount = 0;
    const sourceCounts = new Map<string, number>();

    // 1. Primary Source: The DM Compendium (.obsidian/plugins/the-dm-compendium/cache/bestiary.json)
    try {
        if (tdcPlugin && typeof tdcPlugin.ensureDatabaseCache === "function") {
            try {
                await tdcPlugin.ensureDatabaseCache();
            } catch {
                /* ignore if offline and cache already exists */
            }
        }

        const configDir = app.vault?.configDir || ".obsidian";
        const tdcDir = normalizePath(`${configDir}/plugins/the-dm-compendium`);
        const bestiaryPath = normalizePath(`${tdcDir}/cache/bestiary.json`);
        const settingsPath = normalizePath(`${tdcDir}/data.json`);

        // Resolve includedSources from active plugin instance or data.json
        let includedSourcesSet: Set<string> | null = null;
        if (Array.isArray(tdcPlugin?.compendiumSettings?.includedSources) && tdcPlugin.compendiumSettings.includedSources.length > 0) {
            includedSourcesSet = new Set(
                tdcPlugin.compendiumSettings.includedSources.map((s: any) => String(s).trim().toUpperCase())
            );
        } else if (await app.vault.adapter.exists(settingsPath)) {
            try {
                const rawSettings = JSON.parse(await app.vault.adapter.read(settingsPath));
                if (Array.isArray(rawSettings?.includedSources) && rawSettings.includedSources.length > 0) {
                    includedSourcesSet = new Set(
                        rawSettings.includedSources.map((s: any) => String(s).trim().toUpperCase())
                    );
                }
            } catch {
                /* ignore */
            }
        }

        if (await app.vault.adapter.exists(bestiaryPath)) {
            hasDmCompendium = true;
            const rawText = await app.vault.adapter.read(bestiaryPath);
            const parsedJson = JSON.parse(rawText);
            const items: any[] = Array.isArray(parsedJson) ? parsedJson : [];

            for (const item of items) {
                if (!item || typeof item !== "object" || !item.name) continue;
                const itemSource = String(item.sourceKey || item.source || "").trim().toUpperCase();
                if (includedSourcesSet && itemSource && !includedSourcesSet.has(itemSource)) {
                    continue;
                }
                const mon = normalizeMonsterRecord(item, "the-dm-compendium", "The DM Compendium");
                if (mon && !discoveredMap.has(mon.id)) {
                    discoveredMap.set(mon.id, mon);
                    dmCompendiumCount++;
                    sourceCounts.set(mon.sourceCode, (sourceCounts.get(mon.sourceCode) || 0) + 1);
                }
            }
        }
    } catch (e) {
        console.warn("DnD Plugin: Could not read The DM Compendium bestiary cache", e);
    }

    // 2. Secondary Source: Scan Active Note (and up to 60 recently modified vault notes) for ```statblock YAML blocks
    let vaultStatblockCount = 0;
    const activeFile = app.workspace.getActiveFile();
    const mdFiles = (app.vault.getMarkdownFiles() || [])
        .slice()
        .sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
        .slice(0, 60);
    if (activeFile && !mdFiles.some(f => f.path === activeFile.path)) {
        mdFiles.unshift(activeFile);
    }

    const statblockRegex = /```statblock[ \t]*\r?\n([\s\S]*?)```/g;
    for (const file of mdFiles) {
        try {
            const content = await app.vault.cachedRead(file);
            if (!content.includes("```statblock")) continue;
            statblockRegex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = statblockRegex.exec(content)) !== null) {
                const yamlBody = match[1];
                try {
                    const parsedYaml = parseBlockYaml(yamlBody);
                    const mon = normalizeMonsterRecord(
                        parsedYaml,
                        "vault-note",
                        `Note: ${file.basename}`,
                        yamlBody
                    );
                    if (mon) {
                        const key = `vault-note::${toSlug(mon.name)}`;
                        mon.id = key;
                        if (!discoveredMap.has(key)) {
                            discoveredMap.set(key, mon);
                            vaultStatblockCount++;
                        }
                    }
                } catch {
                    /* ignore malformed YAML block */
                }
            }
        } catch {
            /* ignore unreadable file */
        }
    }

    // 3. Only fall back to built-in SRD presets if The DM Compendium cache had 0 monsters
    if (dmCompendiumCount === 0) {
        for (const preset of BUILTIN_SRD_MONSTERS) {
            if (!discoveredMap.has(preset.id)) {
                discoveredMap.set(preset.id, preset);
            }
        }
    }

    const availableSources = Array.from(sourceCounts.entries())
        .map(([code, count]) => {
            const info = resolveDmCompendiumSourceInfo(code);
            return { code, short: info.short, full: info.full, count };
        })
        .sort((a, b) => b.count - a.count || a.full.localeCompare(b.full));

    const monsters = Array.from(discoveredMap.values()).sort(
        (a, b) => a.name.localeCompare(b.name) || a.sourceShort.localeCompare(b.sourceShort)
    );
    return {
        monsters,
        hasDmCompendium,
        dmCompendiumCount,
        vaultStatblockCount,
        availableSources
    };
}

/**
 * Renders a creature statblock card directly from The DM Compendium's statblock data.
 */
export async function renderStatblockWithFallback(
    app: App,
    plugin: DnDCharacterSheetHelperPlugin,
    monster: DiscoveredMonster,
    containerEl: HTMLElement,
    sourcePath: string,
    component: MarkdownRenderChild
): Promise<void> {
    containerEl.empty();

    const card = containerEl.createDiv({ cls: "dnd-statblock-card" });

    const header = card.createDiv({ cls: "dnd-statblock-header" });
    const titleRow = header.createDiv({ cls: "dnd-statblock-title-row" });
    titleRow.createEl("h3", { text: monster.name, cls: "dnd-statblock-name" });

    const badgesRight = titleRow.createDiv({ cls: "dnd-modal-row-badges" });
    if (monster.sourceShort) {
        const pageSuffix = monster.page ? `, p. ${monster.page}` : "";
        badgesRight.createEl("span", {
            text: `${monster.sourceShort}${pageSuffix}`,
            cls: "dnd-level-badge dnd-modal-badge-sm",
            attr: { title: monster.sourceFull }
        });
    }
    badgesRight.createEl("span", { text: `CR ${monster.cr}`, cls: "dnd-level-badge dnd-statblock-cr-badge" });

    const typeSub = `${monster.size} ${monster.type}${monster.subtype ? ` (${monster.subtype})` : ""}, ${monster.alignment}`;
    header.createEl("div", { text: typeSub, cls: "dnd-statblock-sub" });

    card.createDiv({ cls: "dnd-statblock-rule" });

    const vitals = card.createDiv({ cls: "dnd-statblock-vitals" });
    const addVital = (target: HTMLElement, label: string, val: string) => {
        const row = target.createDiv({ cls: "dnd-statblock-vital-row" });
        row.createEl("strong", { text: `${label} ` });
        row.createSpan({ text: val });
    };
    addVital(vitals, "Armor Class", monster.acText || String(monster.ac));
    addVital(vitals, "Hit Points", monster.hpText || `${monster.hp}${monster.hitDice ? ` (${monster.hitDice})` : ""}`);
    addVital(vitals, "Speed", `${monster.speed} (Initiative ${formatSignedNumber(monster.dexMod)})`);

    card.createDiv({ cls: "dnd-statblock-rule" });

    const abilityLabels = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    const abilitiesGrid = card.createDiv({ cls: "dnd-statblock-abilities" });
    abilityLabels.forEach((lbl, idx) => {
        const score = monster.stats[idx] ?? 10;
        const mod = abilityModFromScore(score);
        const cell = abilitiesGrid.createDiv({ cls: "dnd-statblock-ability-cell" });
        cell.createEl("div", { text: lbl, cls: "dnd-statblock-ability-label" });
        cell.createEl("div", { text: `${score} (${formatSignedNumber(mod)})`, cls: "dnd-statblock-ability-val" });
    });

    card.createDiv({ cls: "dnd-statblock-rule" });

    const details = card.createDiv({ cls: "dnd-statblock-details" });
    if (monster.saves) addVital(details, "Saving Throws", monster.saves);
    if (monster.skills) addVital(details, "Skills", monster.skills);
    if (monster.vulnerabilities) addVital(details, "Vulnerabilities", monster.vulnerabilities);
    if (monster.resistances) addVital(details, "Resistances", monster.resistances);
    if (monster.immunities) addVital(details, "Immunities", monster.immunities);
    if (monster.conditionImmunities) addVital(details, "Condition Immunities", monster.conditionImmunities);
    if (monster.senses) addVital(details, "Senses", monster.senses);
    if (monster.languages) addVital(details, "Languages", monster.languages);
    if (monster.environment && monster.environment.length > 0) {
        addVital(details, "Environment", monster.environment.join(", "));
    }

    const renderSection = async (heading: string, entries: MonsterTraitEntry[]) => {
        if (!entries || entries.length === 0) return;
        card.createEl("h4", { text: heading, cls: "dnd-statblock-section-title" });
        for (const entry of entries) {
            const block = card.createDiv({ cls: "dnd-statblock-trait" });
            const md = `***${entry.name}.*** ${entry.desc}`;
            await plugin.renderDndMarkdown(md, block, sourcePath, component);
        }
    };

    await renderSection("Traits", monster.traits);
    await renderSection("Spellcasting", monster.spellcasting);
    await renderSection("Actions", monster.actions);
    await renderSection("Bonus Actions", monster.bonusActions);
    await renderSection("Reactions", monster.reactions);
    await renderSection("Legendary Actions", monster.legendaryActions);
    await renderSection("Mythic Actions", monster.mythicActions);
    await renderSection("Lair Actions", monster.lairActions);
}

// ============================================================================
// --- POP-UP MODALS: CONDITION RULE INSPECTOR & STATBLOCK PREVIEW ---
// ============================================================================

export class ConditionRuleModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    conditionName: string;
    onRemoveCondition?: () => void;
    renderChild!: MarkdownRenderChild;

    constructor(
        app: App,
        plugin: DnDCharacterSheetHelperPlugin,
        conditionName: string,
        onRemoveCondition?: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.conditionName = conditionName;
        this.onRemoveCondition = onRemoveCondition;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-condition-modal");
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        contentEl.createEl("h3", {
            text: this.conditionName,
            cls: "dnd-section-header dnd-modal-header"
        });

        const rules = await getAllCompendiumRules(this.app, this.plugin.settings);
        const searchLower = this.conditionName.trim().toLowerCase();
        const matched = rules.find(r => r.name.toLowerCase() === searchLower)
            || rules.find(r => r.name.toLowerCase().includes(searchLower));

        const body = contentEl.createDiv({ cls: "dnd-condition-modal-body" });
        if (matched && matched.description) {
            await this.plugin.renderDndMarkdown(matched.description, body, "", this.renderChild);
        } else {
            body.createEl("p", {
                text: `No rule description found for "${this.conditionName}".`,
                cls: "dnd-modal-empty-text"
            });
        }

        const footer = contentEl.createDiv({ cls: "dnd-modal-footer" });
        if (this.onRemoveCondition) {
            const removeBtn = footer.createEl("button", {
                text: `Remove "${this.conditionName}"`,
                cls: "dnd-btn-danger"
            });
            removeBtn.onclick = () => {
                this.onRemoveCondition?.();
                this.close();
            };
        }
        const closeBtn = footer.createEl("button", { text: "Close", cls: "mod-cta" });
        closeBtn.onclick = () => this.close();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

export class StatblockPreviewModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    monster: DiscoveredMonster;
    onAddToInitiative?: (monster: DiscoveredMonster, qty: number) => void;
    renderChild!: MarkdownRenderChild;

    constructor(
        app: App,
        plugin: DnDCharacterSheetHelperPlugin,
        monster: DiscoveredMonster,
        onAddToInitiative?: (monster: DiscoveredMonster, qty: number) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.monster = monster;
        this.onAddToInitiative = onAddToInitiative;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-statblock-preview-modal");
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        const body = contentEl.createDiv({ cls: "dnd-statblock-modal-body" });
        await renderStatblockWithFallback(this.app, this.plugin, this.monster, body, "", this.renderChild);

        const footer = contentEl.createDiv({ cls: "dnd-modal-footer" });
        if (this.onAddToInitiative) {
            const addBtn = footer.createEl("button", {
                text: "Add to Initiative",
                cls: "mod-cta"
            });
            addBtn.onclick = () => {
                this.onAddToInitiative?.(this.monster, 1);
                this.close();
            };
        }
        const closeBtn = footer.createEl("button", { text: "Close" });
        closeBtn.onclick = () => this.close();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

// ============================================================================
// --- UNIFIED DM TOOLS WIDGET (Powers Modal, Sidebar View & Code Blocks) ---
// ============================================================================

export type DMToolsHostMode = "modal" | "sidebar" | "embed-initiative" | "embed-party";

export interface CompendiumUnifiedItem {
    id: string;
    category: "rules" | "classes" | "choices" | "races" | "backgrounds" | "feats" | "items";
    categoryLabel: string;
    subFilter: string;
    name: string;
    badge: string;
    searchBlob: string;
    renderMarkdown: () => Promise<string>;
}

const DM_TABS: readonly { id: DMToolsTabId; label: string; icon: string }[] = [
    { id: "compendium", label: "Compendium", icon: "📚" },
    { id: "spells", label: "Spell Browser", icon: "✨" },
    { id: "initiative", label: "Initiative Tracker", icon: "⚔️" },
    { id: "party", label: "Party Dashboard", icon: "🛡️" },
    { id: "monsters", label: "Monsters & Statblocks", icon: "🐉" }
];

export class DMToolsWidget {
    app: App;
    plugin: DnDCharacterSheetHelperPlugin;
    containerEl: HTMLElement;
    renderChild: MarkdownRenderChild;
    hostMode: DMToolsHostMode;
    activeTab: DMToolsTabId;
    sourcePath: string;
    onRequestSwitchHost?: () => void;

    // Embedded block options
    embedFilterFolder?: string;
    embedFilterPlayers?: string[];
    customInitiativeState?: InitiativeState;
    onSaveCustomInitiativeState?: (state: InitiativeState) => Promise<void>;

    // Tab 1: Compendium State
    compendiumItems: CompendiumUnifiedItem[] = [];
    compendiumLoaded = false;
    compendiumQuery = "";
    compendiumCategory: "all" | CompendiumUnifiedItem["category"] = "all";
    compendiumSubFilter = "all";
    selectedCompendiumId: string | null = null;

    // Tab 2: Spell Browser State
    allSpells: CompendiumSpellEntry[] = [];
    spellsLoaded = false;
    spellQuery = "";
    spellLevelFilter: string = "all";
    spellPoolFilter: string = "all";
    spellSchoolFilter: string = "all";
    spellConcentrationOnly = false;
    spellRitualOnly = false;
    selectedSpellId: string | null = null;

    // Tab 3: Initiative State
    initAddMode: "pc" | "monster" | "custom" = "pc";
    initMonsterFilterQuery = "";

    // Tab 5: Monsters & Statblocks State
    discoveredMonsters: DiscoveredMonster[] = [];
    monstersMeta: {
        hasDmCompendium: boolean;
        dmCompendiumCount: number;
        vaultStatblockCount: number;
        availableSources: { code: string; short: string; full: string; count: number }[];
    } = { hasDmCompendium: false, dmCompendiumCount: 0, vaultStatblockCount: 0, availableSources: [] };
    monstersLoaded = false;
    monsterQuery = "";
    monsterSourceFilter = "all";
    monsterCrFilter = "all";
    selectedMonsterId: string | null = null;

    // Sidebar Resizable Vertical Split State (default 2/3 upper selection, 1/3 lower preview)
    sidebarSplitPercent = 66.67;

    // Layout Containers
    bodyContainer!: HTMLElement;
    private partyFolderListenerRegistered = false;

    constructor(options: {
        app: App;
        plugin: DnDCharacterSheetHelperPlugin;
        containerEl: HTMLElement;
        renderChild: MarkdownRenderChild;
        hostMode: DMToolsHostMode;
        initialTab?: DMToolsTabId;
        sourcePath?: string;
        onRequestSwitchHost?: () => void;
        embedFilterFolder?: string;
        embedFilterPlayers?: string[];
        customInitiativeState?: InitiativeState;
        onSaveCustomInitiativeState?: (state: InitiativeState) => Promise<void>;
    }) {
        this.app = options.app;
        this.plugin = options.plugin;
        this.containerEl = options.containerEl;
        this.renderChild = options.renderChild;
        this.hostMode = options.hostMode;
        this.activeTab = options.initialTab || "compendium";
        this.sourcePath = options.sourcePath || "";
        this.onRequestSwitchHost = options.onRequestSwitchHost;
        this.embedFilterFolder = options.embedFilterFolder;
        this.embedFilterPlayers = options.embedFilterPlayers;
        this.customInitiativeState = options.customInitiativeState;
        this.onSaveCustomInitiativeState = options.onSaveCustomInitiativeState;
    }

    getInitiativeState(): InitiativeState {
        if (this.customInitiativeState) return this.customInitiativeState;
        if (!this.plugin.settings.savedInitiativeState) {
            this.plugin.settings.savedInitiativeState = createDefaultInitiativeState();
        }
        return this.plugin.settings.savedInitiativeState;
    }

    async saveInitiativeState(): Promise<void> {
        const state = this.getInitiativeState();
        state.combatants = sortInitiativeCombatants(state.combatants);
        if (state.combatants.length === 0) {
            state.activeCombatantId = null;
        } else if (!state.activeCombatantId || !state.combatants.some(c => c.id === state.activeCombatantId)) {
            state.activeCombatantId = state.combatants[0].id;
        }

        if (this.onSaveCustomInitiativeState && this.customInitiativeState) {
            await this.onSaveCustomInitiativeState(this.customInitiativeState);
        } else {
            await this.plugin.saveSettings();
        }
        window.dispatchEvent(new CustomEvent("dnd-dm-initiative-updated"));
    }

    async render(): Promise<void> {
        if (!this.partyFolderListenerRegistered) {
            this.partyFolderListenerRegistered = true;
            const onPartyFolderUpdated = (evt: Event) => {
                const detail = (evt as CustomEvent<{ sourceWidget?: DMToolsWidget }>)?.detail;
                if (detail?.sourceWidget === this) return;
                if (this.activeTab === "party" || this.activeTab === "initiative") {
                    void this.renderActiveTab();
                }
            };
            window.addEventListener("dnd-dm-party-folder-updated", onPartyFolderUpdated);
            this.renderChild.register(() => {
                window.removeEventListener("dnd-dm-party-folder-updated", onPartyFolderUpdated);
            });
        }

        this.containerEl.empty();
        this.containerEl.addClass("dnd-dm-widget", `is-mode-${this.hostMode}`);

        if (this.hostMode === "embed-initiative") {
            this.bodyContainer = this.containerEl.createDiv({ cls: "dnd-dm-body" });
            await this.renderInitiativeTab();
            return;
        }

        if (this.hostMode === "embed-party") {
            this.bodyContainer = this.containerEl.createDiv({ cls: "dnd-dm-body" });
            await this.renderPartyTab();
            return;
        }

        // Top Header + Mode Switcher (Modal <-> Sidebar)
        const headerBar = this.containerEl.createDiv({ cls: "dnd-dm-header-bar" });
        const titleGroup = headerBar.createDiv({ cls: "dnd-dm-title-group" });
        titleGroup.createEl("h3", {
            text: "Dungeon Master Tools & Compendium",
            cls: "dnd-section-header dnd-dm-title"
        });

        const headerActions = headerBar.createDiv({ cls: "dnd-dm-header-actions" });
        const refreshBtn = headerActions.createEl("button", {
            text: "Refresh",
            cls: "dnd-dm-header-btn",
            attr: { title: "Reload Compendium, Spells, Party & Monsters" }
        });
        refreshBtn.onclick = async () => {
            this.compendiumLoaded = false;
            this.spellsLoaded = false;
            this.monstersLoaded = false;
            await this.renderActiveTab();
            new Notice("DM Tools data refreshed!");
        };

        if (this.onRequestSwitchHost) {
            const switchBtn = headerActions.createEl("button", {
                text: this.hostMode === "modal" ? "Dock to Sidebar" : "Open in Modal",
                cls: "dnd-dm-header-btn mod-cta",
                attr: {
                    title: this.hostMode === "modal"
                        ? "Pin DM Tools to the right sidebar so it stays open alongside your notes"
                        : "Expand DM Tools into a large centered modal window"
                }
            });
            switchBtn.onclick = () => this.onRequestSwitchHost?.();
        }

        // Navigation Tabs
        const tabsBar = this.containerEl.createDiv({ cls: "dnd-modal-tabs dnd-dm-tabs" });
        for (const tab of DM_TABS) {
            const btn = tabsBar.createEl("button", {
                text: `${tab.icon} ${tab.label}`,
                cls: `dnd-modal-tab-btn dnd-dm-tab-btn ${this.activeTab === tab.id ? "is-active" : ""}`.trim()
            });
            btn.onclick = async () => {
                this.activeTab = tab.id;
                tabsBar.querySelectorAll(".dnd-dm-tab-btn").forEach((el, idx) => {
                    el.classList.toggle("is-active", DM_TABS[idx]?.id === this.activeTab);
                });
                await this.renderActiveTab();
            };
        }

        this.bodyContainer = this.containerEl.createDiv({ cls: "dnd-dm-body" });
        await this.renderActiveTab();
    }

    async setTab(tab: DMToolsTabId): Promise<void> {
        this.activeTab = tab;
        await this.render();
    }

    async renderActiveTab(): Promise<void> {
        if (!this.bodyContainer) return;
        this.bodyContainer.empty();

        switch (this.activeTab) {
            case "compendium":
                await this.renderCompendiumTab();
                break;
            case "spells":
                await this.renderSpellBrowserTab();
                break;
            case "initiative":
                await this.renderInitiativeTab();
                break;
            case "party":
                await this.renderPartyTab();
                break;
            case "monsters":
                await this.renderMonstersTab();
                break;
        }
    }

    /**
     * Builds the master-detail split layout.
     * - In Modal mode: side-by-side 2-column grid.
     * - In Sidebar mode: vertical split-pane (default 2/3 upper selection area + 1/3 scrollable preview area)
     *   with a draggable horizontal divider handle between them.
     */
    private createMasterDetailSplitLayout(
        root: HTMLElement,
        upperControls: HTMLElement[]
    ): {
        listPane: HTMLElement;
        previewPane: HTMLElement;
        setPreviewActive: (active: boolean) => void;
    } {
        if (this.hostMode !== "sidebar") {
            const splitGrid = root.createDiv({ cls: "dnd-spellbook-body dnd-compendium-grid" });
            const listPane = splitGrid.createDiv({ cls: "dnd-spellbook-list dnd-compendium-list" });
            const previewPane = splitGrid.createDiv({ cls: "dnd-spellbook-preview dnd-compendium-preview" });
            return {
                listPane,
                previewPane,
                setPreviewActive: () => {}
            };
        }

        const splitContainer = root.createDiv({ cls: "dnd-sidebar-split-container" });
        splitContainer.style.setProperty("--dnd-sidebar-split", `${this.sidebarSplitPercent}%`);

        const upperPane = splitContainer.createDiv({ cls: "dnd-sidebar-upper-pane" });
        for (const el of upperControls) {
            upperPane.appendChild(el);
        }
        const listPane = upperPane.createDiv({ cls: "dnd-spellbook-list dnd-compendium-list" });

        const resizer = splitContainer.createDiv({
            cls: "dnd-sidebar-resizer",
            attr: { title: "Drag up or down to resize preview (double-click to reset to 2/3 & 1/3)" }
        });
        resizer.createDiv({ cls: "dnd-sidebar-resizer-grip" });

        const previewPane = splitContainer.createDiv({
            cls: "dnd-spellbook-preview dnd-compendium-preview dnd-sidebar-lower-pane"
        });

        let isDragging = false;
        resizer.addEventListener("pointerdown", (e: PointerEvent) => {
            e.preventDefault();
            isDragging = true;
            resizer.addClass("is-dragging");
            try {
                resizer.setPointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
        });

        resizer.addEventListener("pointermove", (e: PointerEvent) => {
            if (!isDragging) return;
            const rect = splitContainer.getBoundingClientRect();
            if (rect.height <= 40) return;
            const rawPct = ((e.clientY - rect.top) / rect.height) * 100;
            const clamped = Math.max(15, Math.min(85, Math.round(rawPct * 100) / 100));
            this.sidebarSplitPercent = clamped;
            splitContainer.style.setProperty("--dnd-sidebar-split", `${clamped}%`);
        });

        const endDrag = (e: PointerEvent) => {
            if (!isDragging) return;
            isDragging = false;
            resizer.removeClass("is-dragging");
            try {
                if (resizer.hasPointerCapture(e.pointerId)) {
                    resizer.releasePointerCapture(e.pointerId);
                }
            } catch {
                /* ignore */
            }
        };

        resizer.addEventListener("pointerup", endDrag);
        resizer.addEventListener("pointercancel", endDrag);
        resizer.addEventListener("dblclick", () => {
            this.sidebarSplitPercent = 66.67;
            splitContainer.style.setProperty("--dnd-sidebar-split", "66.67%");
        });

        return {
            listPane,
            previewPane,
            setPreviewActive: (active: boolean) => {
                splitContainer.classList.toggle("has-active-preview", active);
            }
        };
    }

    // ========================================================================
    // --- TAB 1: UNIVERSAL COMPENDIUM & RULEBOOK SEARCH ---
    // ========================================================================

    private async ensureCompendiumLoaded(): Promise<void> {
        if (this.compendiumLoaded) return;
        const settings = this.plugin.settings;
        const items: CompendiumUnifiedItem[] = [];

        // 1. Rules & Conditions
        const rules = await getAllCompendiumRules(this.app, settings);
        for (const rule of rules) {
            items.push({
                id: `rule::${rule.id}`,
                category: "rules",
                categoryLabel: "Rules & Conditions",
                subFilter: rule.groupName || "Core Rules",
                name: rule.name,
                badge: rule.badge || rule.groupName,
                searchBlob: `${rule.name} ${rule.groupName} ${rule.badge || ""} ${rule.description}`.toLowerCase(),
                renderMarkdown: async () => {
                    return `### ${rule.name}\n*${rule.groupName}${rule.badge && rule.badge !== rule.groupName ? ` • ${rule.badge}` : ""}*\n\n---\n\n${rule.description}`;
                }
            });
        }

        // 2. Classes & Subclasses
        const { classes, subclasses } = await getAllCompendiumClasses(this.app, settings);
        for (const cls of classes) {
            const data = cls.data || {};
            const featureNames: string[] = [];
            const levelSections: string[] = [];

            const sortedLevels = Object.keys(data)
                .filter(k => /^\d+$/.test(k))
                .sort((a, b) => Number(a) - Number(b));

            for (const lvl of sortedLevels) {
                const lvlObj = data[lvl];
                if (!lvlObj || typeof lvlObj !== "object") continue;
                const feats = Array.isArray(lvlObj.features) ? lvlObj.features : [];
                if (feats.length === 0) continue;
                const lines: string[] = [`#### Level ${lvl}`];
                for (const f of feats) {
                    if (!f || typeof f !== "object") continue;
                    const fName = String(f.name || "Feature").trim();
                    const fDesc = String(f.description || "").trim();
                    featureNames.push(fName, fDesc);
                    lines.push(`##### ${fName}\n${fDesc}`);
                }
                levelSections.push(lines.join("\n\n"));
            }

            const profSaves = Array.isArray(data.proficiencySavingThrow)
                ? data.proficiencySavingThrow.map((s: any) => String(s)).join(", ")
                : "";
            const hitDie = data.hitDie ? `d${String(data.hitDie).replace(/^d/i, "")}` : "";

            items.push({
                id: `class::${cls.id}`,
                category: "classes",
                categoryLabel: "Classes & Subclasses",
                subFilter: cls.name,
                name: cls.name,
                badge: "Class",
                searchBlob: `${cls.name} class ${profSaves} ${featureNames.join(" ")}`.toLowerCase(),
                renderMarkdown: async () => {
                    const metaLines: string[] = [];
                    if (hitDie) metaLines.push(`- **Hit Die:** ${hitDie}`);
                    if (profSaves) metaLines.push(`- **Saving Throw Proficiencies:** ${profSaves}`);
                    if (data.spellcastingAbility) metaLines.push(`- **Spellcasting Ability:** ${data.spellcastingAbility}`);
                    const metaBlock = metaLines.length > 0 ? `${metaLines.join("\n")}\n\n---\n\n` : "";
                    return `### ${cls.name} (Core Class)\n\n${metaBlock}${levelSections.join("\n\n---\n\n") || "*No level features listed.*"}`;
                }
            });
        }

        for (const sub of subclasses) {
            const data = sub.data || {};
            const featureNames: string[] = [];
            const levelSections: string[] = [];

            const sortedLevels = Object.keys(data)
                .filter(k => /^\d+$/.test(k))
                .sort((a, b) => Number(a) - Number(b));

            for (const lvl of sortedLevels) {
                const lvlObj = data[lvl];
                if (!lvlObj || typeof lvlObj !== "object") continue;
                const feats = Array.isArray(lvlObj.features) ? lvlObj.features : [];
                if (feats.length === 0) continue;
                const lines: string[] = [`#### Level ${lvl}`];
                for (const f of feats) {
                    if (!f || typeof f !== "object") continue;
                    const fName = String(f.name || "Feature").trim();
                    const fDesc = String(f.description || "").trim();
                    featureNames.push(fName, fDesc);
                    lines.push(`##### ${fName}\n${fDesc}`);
                }
                levelSections.push(lines.join("\n\n"));
            }

            items.push({
                id: `subclass::${sub.id}`,
                category: "classes",
                categoryLabel: "Classes & Subclasses",
                subFilter: sub.parentClassName,
                name: `${sub.name} (${sub.parentClassName})`,
                badge: `${sub.parentClassName} Subclass`,
                searchBlob: `${sub.name} ${sub.parentClassName} subclass ${featureNames.join(" ")}`.toLowerCase(),
                renderMarkdown: async () => {
                    return `### ${sub.name}\n*${sub.parentClassName} Subclass*\n\n---\n\n${levelSections.join("\n\n---\n\n") || "*No subclass features listed.*"}`;
                }
            });
        }

        // 3. Class Choices (Invocations, Metamagic, Maneuvers, etc.)
        const classChoices = await getAllCompendiumClassChoices(this.app, settings);
        for (const choice of classChoices) {
            items.push({
                id: `choice::${choice.id}`,
                category: "choices",
                categoryLabel: "Class Choices",
                subFilter: choice.category,
                name: choice.name,
                badge: choice.category,
                searchBlob: `${choice.name} ${choice.category} ${choice.prerequisite || ""} ${choice.description}`.toLowerCase(),
                renderMarkdown: async () => {
                    const prereqLine = choice.prerequisite ? `\n*Prerequisite: ${choice.prerequisite}*` : "";
                    return `### ${choice.name}\n**${choice.category}**${prereqLine}\n\n---\n\n${choice.description}`;
                }
            });
        }

        // 4. Races & Lineages
        const races = await getAllCompendiumRaces(this.app, settings);
        for (const race of races) {
            const data = race.data || {};
            const traitLines: string[] = [];
            const searchParts: string[] = [race.name];

            const metaLines: string[] = [];
            if (data.size) metaLines.push(`- **Size:** ${Array.isArray(data.size) ? data.size.join(" or ") : data.size}`);
            if (data.speed) metaLines.push(`- **Speed:** ${data.speed} ft.`);

            const traits = Array.isArray(data.traits)
                ? data.traits
                : (Array.isArray(data.features) ? data.features : []);
            for (const t of traits) {
                if (!t || typeof t !== "object") continue;
                const tName = String(t.name || "Trait").trim();
                const tDesc = String(t.description || "").trim();
                searchParts.push(tName, tDesc);
                traitLines.push(`#### ${tName}\n${tDesc}`);
            }

            if (data.lineages && typeof data.lineages === "object") {
                traitLines.push(`#### Lineages / Subraces`);
                for (const [linName, linObj] of Object.entries(data.lineages)) {
                    searchParts.push(linName);
                    if (linObj && typeof linObj === "object") {
                        const lDesc = String((linObj as any).description || "").trim();
                        const lTraits = Array.isArray((linObj as any).traits) ? (linObj as any).traits : [];
                        const subLines = [`##### ${linName}`];
                        if (lDesc) subLines.push(lDesc);
                        for (const lt of lTraits) {
                            if (lt?.name) {
                                searchParts.push(lt.name, lt.description || "");
                                subLines.push(`- **${lt.name}:** ${lt.description || ""}`);
                            }
                        }
                        traitLines.push(subLines.join("\n"));
                    }
                }
            }

            items.push({
                id: `race::${race.id}`,
                category: "races",
                categoryLabel: "Races & Lineages",
                subFilter: "Species / Race",
                name: race.name,
                badge: data.speed ? `${data.speed} ft.` : "Species",
                searchBlob: searchParts.join(" ").toLowerCase(),
                renderMarkdown: async () => {
                    const metaBlock = metaLines.length > 0 ? `${metaLines.join("\n")}\n\n---\n\n` : "";
                    return `### ${race.name}\n\n${metaBlock}${traitLines.join("\n\n") || String(data.description || "*No traits listed.*")}`;
                }
            });
        }

        // 5. Backgrounds
        const backgrounds = await getAllCompendiumBackgrounds(this.app, settings);
        for (const bg of backgrounds) {
            const data = bg.data || {};
            const skills = Array.isArray(data.skillProficiencies) ? data.skillProficiencies.join(", ") : "";
            const tools = Array.isArray(data.toolProficiencies) ? data.toolProficiencies.join(", ") : (data.toolProficiency || "");
            const abilities = Array.isArray(data.abilityScores) ? data.abilityScores.join(", ") : "";
            const feat = data.feat ? formatFeatureOrSlug(String(data.feat)) : "";
            const desc = String(data.description || "").trim();

            items.push({
                id: `bg::${bg.id}`,
                category: "backgrounds",
                categoryLabel: "Backgrounds",
                subFilter: "Background",
                name: bg.name,
                badge: feat ? `Feat: ${feat}` : "Background",
                searchBlob: `${bg.name} background ${skills} ${tools} ${abilities} ${feat} ${desc}`.toLowerCase(),
                renderMarkdown: async () => {
                    const lines: string[] = [`### ${bg.name}\n*Background*\n\n---`];
                    if (abilities) lines.push(`- **Ability Scores:** ${abilities}`);
                    if (feat) lines.push(`- **Origin Feat:** ${feat}`);
                    if (skills) lines.push(`- **Skill Proficiencies:** ${skills}`);
                    if (tools) lines.push(`- **Tool Proficiency:** ${tools}`);
                    if (desc) lines.push(`\n${desc}`);
                    return lines.join("\n");
                }
            });
        }

        // 6. Feats
        const availFeats: FeatPoolEntry[] = await getAvailableFeats(this.app, settings);
        for (const fEntry of availFeats) {
            const featData = await getExtraFeat(this.app, settings, fEntry.id);
            const desc = String(featData?.description || "").trim();
            const cat = String(featData?.category || fEntry.category || "Feat").trim();
            const prereq = featData?.prerequisite ? String(featData.prerequisite).trim() : "";

            items.push({
                id: `feat::${fEntry.id}`,
                category: "feats",
                categoryLabel: "Feats",
                subFilter: cat,
                name: fEntry.name,
                badge: cat,
                searchBlob: `${fEntry.name} ${cat} ${prereq} ${desc}`.toLowerCase(),
                renderMarkdown: async () => {
                    const lines = [`### ${fEntry.name}`, `*${cat}*`];
                    if (prereq) lines.push(`*Prerequisite: ${prereq}*`);
                    lines.push("\n---\n", desc || "*No description available.*");
                    return lines.join("\n");
                }
            });
        }

        // 7. Equipment Items & Weapon Masteries
        const allItems = await getAllCompendiumItems(this.app, settings);
        for (const item of allItems) {
            const data = item.data || {};
            const itemType = String(data.type || "Equipment").trim();
            const desc = String(data.description || "").trim();
            const dmg = data.damage ? String(data.damage) : "";
            const mastery = data.mastery ? String(data.mastery) : "";

            items.push({
                id: `item::${item.id}`,
                category: "items",
                categoryLabel: "Items & Masteries",
                subFilter: itemType,
                name: item.name,
                badge: dmg ? `${itemType} • ${dmg}` : itemType,
                searchBlob: `${item.name} ${itemType} ${dmg} ${mastery} ${desc}`.toLowerCase(),
                renderMarkdown: async () => {
                    const meta: string[] = [];
                    if (data.type) meta.push(`- **Type:** ${data.type}`);
                    if (data.damage) meta.push(`- **Damage:** ${data.damage}`);
                    if (data.ac) meta.push(`- **Armor Class:** ${data.ac}`);
                    if (data.cost !== undefined) meta.push(`- **Cost:** ${data.cost}`);
                    if (data.weight !== undefined) meta.push(`- **Weight:** ${data.weight} lbs`);
                    if (data.mastery) {
                        const mInfo = await getWeaponMasteryDescription(this.app, settings, data.mastery);
                        if (mInfo) {
                            meta.push(`- **Weapon Mastery (${mInfo.name}):** ${mInfo.description}`);
                        } else {
                            meta.push(`- **Weapon Mastery:** ${data.mastery}`);
                        }
                    }
                    return `### ${item.name}\n\n${meta.join("\n")}\n\n---\n\n${desc || "*Standard equipment item.*"}`;
                }
            });
        }

        // Also include standalone Weapon Mastery entries in "Items & Masteries"
        const masteriesMap = await getWeaponMasteriesMap(this.app, settings);
        for (const [mName, mDesc] of Object.entries(masteriesMap || {})) {
            items.push({
                id: `mastery::${toSlug(mName)}`,
                category: "items",
                categoryLabel: "Items & Masteries",
                subFilter: "Weapon Mastery",
                name: `${mName} (Weapon Mastery)`,
                badge: "Weapon Mastery",
                searchBlob: `${mName} weapon mastery ${mDesc}`.toLowerCase(),
                renderMarkdown: async () => {
                    return `### ${mName}\n*Weapon Mastery Property*\n\n---\n\n${mDesc}`;
                }
            });
        }

        this.compendiumItems = items;
        this.compendiumLoaded = true;
    }

    private async renderCompendiumTab(): Promise<void> {
        await this.ensureCompendiumLoaded();
        const root = this.bodyContainer.createDiv({ cls: "dnd-compendium-root" });

        // Top Search & Category Bar
        const controls = root.createDiv({ cls: "dnd-compendium-controls" });
        const searchRow = controls.createDiv({ cls: "dnd-compendium-search-row" });

        const searchInput = searchRow.createEl("input", {
            type: "text",
            placeholder: "Search rules, conditions, classes, subclasses, choices, races, backgrounds, feats, items...",
            value: this.compendiumQuery,
            cls: "dnd-modal-form-input dnd-compendium-search-input"
        });

        const subFilterSelect = searchRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });

        const clearBtn = searchRow.createEl("button", {
            text: "Reset",
            cls: "dnd-dm-small-btn"
        });

        // Category Pills
        const pillsRow = controls.createDiv({ cls: "dnd-compendium-pills" });
        const categories: { id: "all" | CompendiumUnifiedItem["category"]; label: string }[] = [
            { id: "all", label: "All" },
            { id: "rules", label: "Rules & Conditions" },
            { id: "classes", label: "Classes & Subclasses" },
            { id: "choices", label: "Class Choices" },
            { id: "races", label: "Races & Lineages" },
            { id: "backgrounds", label: "Backgrounds" },
            { id: "feats", label: "Feats" },
            { id: "items", label: "Items & Masteries" }
        ];

        // Master-Detail Grid (or 2/3 & 1/3 Resizable Vertical Split in Sidebar)
        const { listPane, previewPane, setPreviewActive } = this.createMasterDetailSplitLayout(root, [controls]);

        const populateSubFilters = () => {
            subFilterSelect.empty();
            subFilterSelect.createEl("option", { text: "All Sub-Categories", value: "all" });
            const relevant = this.compendiumCategory === "all"
                ? this.compendiumItems
                : this.compendiumItems.filter(i => i.category === this.compendiumCategory);
            const subSet = Array.from(new Set(relevant.map(i => i.subFilter).filter(Boolean))).sort();
            for (const sf of subSet) {
                subFilterSelect.createEl("option", { text: sf, value: sf });
            }
            if (!subSet.includes(this.compendiumSubFilter)) {
                this.compendiumSubFilter = "all";
            }
            subFilterSelect.value = this.compendiumSubFilter;
        };

        const renderPreview = async (item: CompendiumUnifiedItem | null) => {
            previewPane.empty();
            setPreviewActive(Boolean(item));
            if (!item) {
                previewPane.createEl("p", {
                    text: "Select any rule, class, feat, item, or trait to inspect its full details.",
                    cls: "dnd-modal-preview-empty"
                });
                return;
            }

            const toolbar = previewPane.createDiv({ cls: "dnd-compendium-preview-toolbar" });
            toolbar.createEl("span", {
                text: `${item.categoryLabel} • ${item.badge}`,
                cls: "dnd-level-badge"
            });

            const rightActions = toolbar.createDiv({ cls: "dnd-modal-preview-badges" });
            const copyBtn = rightActions.createEl("button", {
                text: "Copy Markdown",
                cls: "dnd-dm-small-btn"
            });
            const mdText = await item.renderMarkdown();
            copyBtn.onclick = async () => {
                await navigator.clipboard.writeText(mdText);
                new Notice(`Copied "${item.name}" to clipboard!`);
            };

            if (this.hostMode === "sidebar") {
                const closeBtn = rightActions.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Close preview" }
                });
                closeBtn.onclick = async () => {
                    this.selectedCompendiumId = null;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    await renderPreview(null);
                };
            }

            const contentBox = previewPane.createDiv({ cls: "dnd-compendium-preview-content" });
            await this.plugin.renderDndMarkdown(mdText, contentBox, this.sourcePath, this.renderChild);
        };

        const renderPillsAndList = async () => {
            const q = this.compendiumQuery.trim().toLowerCase();

            // Update pill counts
            pillsRow.empty();
            for (const cat of categories) {
                const count = this.compendiumItems.filter(it => {
                    if (cat.id !== "all" && it.category !== cat.id) return false;
                    if (q && !it.searchBlob.includes(q)) return false;
                    return true;
                }).length;

                const pill = pillsRow.createEl("button", {
                    text: `${cat.label} (${count})`,
                    cls: `dnd-compendium-pill ${this.compendiumCategory === cat.id ? "is-active" : ""}`.trim()
                });
                pill.onclick = async () => {
                    this.compendiumCategory = cat.id;
                    this.compendiumSubFilter = "all";
                    populateSubFilters();
                    await renderPillsAndList();
                };
            }

            // Filter list
            const filtered = this.compendiumItems.filter(it => {
                if (this.compendiumCategory !== "all" && it.category !== this.compendiumCategory) return false;
                if (this.compendiumSubFilter !== "all" && it.subFilter !== this.compendiumSubFilter) return false;
                if (q && !it.searchBlob.includes(q)) return false;
                return true;
            });

            listPane.empty();
            if (filtered.length === 0) {
                listPane.createEl("p", {
                    text: "No compendium entries match your search filters.",
                    cls: "dnd-modal-empty-text"
                });
                await renderPreview(null);
                return;
            }

            // Cap visible DOM rows at 200 for instant typing responsiveness
            const displayList = filtered.slice(0, 200);
            if (this.hostMode === "sidebar") {
                if (this.selectedCompendiumId && !displayList.some(i => i.id === this.selectedCompendiumId)) {
                    this.selectedCompendiumId = null;
                }
            } else if (!this.selectedCompendiumId || !displayList.some(i => i.id === this.selectedCompendiumId)) {
                this.selectedCompendiumId = displayList[0].id;
            }

            for (const item of displayList) {
                const isSelected = item.id === this.selectedCompendiumId;
                const row = listPane.createDiv({
                    cls: `dnd-modal-list-row dnd-compendium-row is-clickable ${isSelected ? "is-active" : ""}`.trim()
                });
                const left = row.createDiv({ cls: "dnd-modal-row-left" });
                left.createEl("span", { text: item.name, cls: "dnd-modal-row-name" });
                row.createEl("span", {
                    text: item.badge,
                    cls: "dnd-level-badge dnd-modal-badge-sm"
                });

                row.onclick = async () => {
                    if (this.hostMode === "sidebar" && this.selectedCompendiumId === item.id) {
                        this.selectedCompendiumId = null;
                        row.removeClass("is-active");
                        await renderPreview(null);
                        return;
                    }
                    this.selectedCompendiumId = item.id;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    row.addClass("is-active");
                    await renderPreview(item);
                };
            }

            if (filtered.length > 200) {
                listPane.createEl("div", {
                    text: `Showing top 200 of ${filtered.length} matches. Refine your search query to narrow results.`,
                    cls: "dnd-modal-empty-text"
                });
            }

            const activeItem = this.selectedCompendiumId
                ? (displayList.find(i => i.id === this.selectedCompendiumId) || null)
                : (this.hostMode === "sidebar" ? null : displayList[0]);
            await renderPreview(activeItem);
        };

        populateSubFilters();
        searchInput.oninput = () => {
            this.compendiumQuery = searchInput.value;
            void renderPillsAndList();
        };
        subFilterSelect.onchange = () => {
            this.compendiumSubFilter = subFilterSelect.value;
            void renderPillsAndList();
        };
        clearBtn.onclick = () => {
            this.compendiumQuery = "";
            this.compendiumCategory = "all";
            this.compendiumSubFilter = "all";
            searchInput.value = "";
            populateSubFilters();
            void renderPillsAndList();
        };

        await renderPillsAndList();
    }

    // ========================================================================
    // --- TAB 2: UNIVERSAL SPELL BROWSER ---
    // ========================================================================

    private async ensureSpellsLoaded(): Promise<void> {
        if (this.spellsLoaded) return;
        this.allSpells = await getAllCompendiumSpells(this.app, this.plugin.settings);
        this.spellsLoaded = true;
    }

    private async renderSpellBrowserTab(): Promise<void> {
        await this.ensureSpellsLoaded();
        const root = this.bodyContainer.createDiv({ cls: "dnd-spell-browser-root" });

        const controls = root.createDiv({ cls: "dnd-compendium-controls" });
        const topRow = controls.createDiv({ cls: "dnd-compendium-search-row" });

        const searchInput = topRow.createEl("input", {
            type: "text",
            placeholder: "Search spells by name, school, description, components...",
            value: this.spellQuery,
            cls: "dnd-modal-form-input dnd-compendium-search-input"
        });

        // Pool / Class select
        const allPools = Array.from(new Set(this.allSpells.flatMap(s => s.pools))).sort();
        const poolSelect = topRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        poolSelect.createEl("option", { text: "All Classes / Spell Pools", value: "all" });
        for (const p of allPools) {
            poolSelect.createEl("option", { text: formatPoolDisplayName(p), value: p });
        }
        poolSelect.value = this.spellPoolFilter;

        // School select
        const allSchools = Array.from(new Set(this.allSpells.map(s => s.school).filter(Boolean))).sort();
        const schoolSelect = topRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        schoolSelect.createEl("option", { text: "All Schools", value: "all" });
        for (const sch of allSchools) {
            schoolSelect.createEl("option", { text: sch, value: sch });
        }
        schoolSelect.value = this.spellSchoolFilter;

        // Level & C/R Filter Bar
        const secondRow = controls.createDiv({ cls: "dnd-spell-filter-row" });
        const levelPills = secondRow.createDiv({ cls: "dnd-compendium-pills" });
        const levels = ["all", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

        const flagsGroup = secondRow.createDiv({ cls: "dnd-spell-flag-toggles" });
        const concBtn = flagsGroup.createEl("button", {
            text: "Concentration [C]",
            cls: `dnd-compendium-pill ${this.spellConcentrationOnly ? "is-active" : ""}`.trim()
        });
        const ritualBtn = flagsGroup.createEl("button", {
            text: "Ritual [R]",
            cls: `dnd-compendium-pill ${this.spellRitualOnly ? "is-active" : ""}`.trim()
        });
        const resetBtn = flagsGroup.createEl("button", {
            text: "Reset",
            cls: "dnd-dm-small-btn"
        });

        const { listPane, previewPane, setPreviewActive } = this.createMasterDetailSplitLayout(root, [controls]);

        const renderSpellPreview = async (spell: CompendiumSpellEntry | null) => {
            previewPane.empty();
            setPreviewActive(Boolean(spell));
            if (!spell) {
                previewPane.createEl("p", {
                    text: "Select a spell from the list to view its full description.",
                    cls: "dnd-modal-preview-empty"
                });
                return;
            }

            const headerDiv = previewPane.createDiv({ cls: "dnd-modal-preview-header" });
            headerDiv.createEl("h4", { text: spell.name, cls: "dnd-modal-preview-title" });

            const badgesDiv = headerDiv.createDiv({ cls: "dnd-modal-preview-badges" });
            if (spell.concentration) {
                badgesDiv.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
            }
            if (spell.ritual) {
                badgesDiv.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
            }

            const copyBtn = badgesDiv.createEl("button", {
                text: "Copy",
                cls: "dnd-dm-small-btn",
                attr: { title: "Copy Spell Markdown" }
            });
            copyBtn.onclick = async () => {
                const lvlLabel = spell.level === 0 ? `${spell.school} Cantrip` : `Level ${spell.level} ${spell.school}`;
                const md = `### ${spell.name}\n*${lvlLabel}*\n- **Casting Time:** ${spell.castingTime}\n- **Range:** ${spell.range}\n- **Components:** ${spell.components.join(", ")}${spell.materials ? ` (${spell.materials})` : ""}\n- **Duration:** ${spell.duration}\n\n${spell.description}`;
                await navigator.clipboard.writeText(md);
                new Notice(`Copied "${spell.name}" to clipboard!`);
            };

            if (this.hostMode === "sidebar") {
                const closeBtn = badgesDiv.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Close preview" }
                });
                closeBtn.onclick = async () => {
                    this.selectedSpellId = null;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    await renderSpellPreview(null);
                };
            }

            const lvlText = spell.level === 0 ? `${spell.school} Cantrip` : `Level ${spell.level} ${spell.school}`;
            previewPane.createEl("div", { text: lvlText, cls: "dnd-modal-preview-sub" });

            const metaDiv = previewPane.createDiv({ cls: "dnd-modal-preview-meta" });
            metaDiv.createEl("div", { text: `Casting Time: ${spell.castingTime}` });
            metaDiv.createEl("div", { text: `Range: ${spell.range}` });
            if (spell.components.length > 0) {
                const matStr = spell.materials ? ` (${spell.materials})` : "";
                metaDiv.createEl("div", { text: `Components: ${spell.components.join(", ")}${matStr}` });
            }
            metaDiv.createEl("div", { text: `Duration: ${spell.duration}` });
            if (spell.classes.length > 0) {
                metaDiv.createEl("div", { text: `Classes: ${spell.classes.join(", ")}` });
            } else if (spell.pools.length > 0) {
                metaDiv.createEl("div", { text: `Pools: ${spell.pools.map(p => formatPoolDisplayName(p)).join(", ")}` });
            }

            if (spell.description) {
                const descDiv = previewPane.createDiv({ cls: "dnd-modal-preview-desc" });
                await this.plugin.renderDndMarkdown(spell.description, descDiv, this.sourcePath, this.renderChild);
            }
        };

        const updateSpellView = async () => {
            // Render level pills
            levelPills.empty();
            for (const lvl of levels) {
                const label = lvl === "all" ? "All Levels" : (lvl === "0" ? "Cantrips" : `Lvl ${lvl}`);
                const btn = levelPills.createEl("button", {
                    text: label,
                    cls: `dnd-compendium-pill ${this.spellLevelFilter === lvl ? "is-active" : ""}`.trim()
                });
                btn.onclick = () => {
                    this.spellLevelFilter = lvl;
                    void updateSpellView();
                };
            }

            concBtn.classList.toggle("is-active", this.spellConcentrationOnly);
            ritualBtn.classList.toggle("is-active", this.spellRitualOnly);

            const q = this.spellQuery.trim().toLowerCase();
            const matches = this.allSpells.filter(sp => {
                if (this.spellLevelFilter !== "all" && String(sp.level) !== this.spellLevelFilter) return false;
                if (this.spellPoolFilter !== "all" && !sp.pools.includes(this.spellPoolFilter)) return false;
                if (this.spellSchoolFilter !== "all" && sp.school.toLowerCase() !== this.spellSchoolFilter.toLowerCase()) return false;
                if (this.spellConcentrationOnly && !sp.concentration) return false;
                if (this.spellRitualOnly && !sp.ritual) return false;
                if (q) {
                    const hay = `${sp.name} ${sp.school} ${sp.description} ${sp.classes.join(" ")}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });

            listPane.empty();
            listPane.createEl("div", {
                text: `${matches.length} spell${matches.length === 1 ? "" : "s"} found`,
                cls: "dnd-spell-count-banner"
            });

            if (matches.length === 0) {
                listPane.createEl("p", {
                    text: "No spells match your active filters.",
                    cls: "dnd-modal-empty-text"
                });
                await renderSpellPreview(null);
                return;
            }

            if (this.hostMode === "sidebar") {
                if (this.selectedSpellId && !matches.some(s => s.id === this.selectedSpellId)) {
                    this.selectedSpellId = null;
                }
            } else if (!this.selectedSpellId || !matches.some(s => s.id === this.selectedSpellId)) {
                this.selectedSpellId = matches[0].id;
            }

            for (const sp of matches) {
                const isSelected = sp.id === this.selectedSpellId;
                const row = listPane.createDiv({
                    cls: `dnd-modal-list-row dnd-compendium-row is-clickable ${isSelected ? "is-active" : ""}`.trim()
                });

                const left = row.createDiv({ cls: "dnd-modal-row-left" });
                left.createEl("span", { text: sp.name, cls: "dnd-modal-row-name" });

                const rightBadges = row.createDiv({ cls: "dnd-modal-row-badges" });
                if (sp.concentration) {
                    rightBadges.createEl("span", { text: "C", cls: "dnd-level-badge dnd-spell-badge-sm", attr: { title: "Concentration" } });
                }
                if (sp.ritual) {
                    rightBadges.createEl("span", { text: "R", cls: "dnd-level-badge dnd-badge-combined dnd-spell-badge-sm", attr: { title: "Ritual" } });
                }
                rightBadges.createEl("span", {
                    text: sp.level === 0 ? "Cantrip" : `Lvl ${sp.level}`,
                    cls: "dnd-level-badge dnd-modal-badge-sm"
                });

                row.onclick = async () => {
                    if (this.hostMode === "sidebar" && this.selectedSpellId === sp.id) {
                        this.selectedSpellId = null;
                        row.removeClass("is-active");
                        await renderSpellPreview(null);
                        return;
                    }
                    this.selectedSpellId = sp.id;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    row.addClass("is-active");
                    await renderSpellPreview(sp);
                };
            }

            const currentSpell = this.selectedSpellId
                ? (matches.find(s => s.id === this.selectedSpellId) || null)
                : (this.hostMode === "sidebar" ? null : matches[0]);
            await renderSpellPreview(currentSpell);
        };

        searchInput.oninput = () => {
            this.spellQuery = searchInput.value;
            void updateSpellView();
        };
        poolSelect.onchange = () => {
            this.spellPoolFilter = poolSelect.value;
            void updateSpellView();
        };
        schoolSelect.onchange = () => {
            this.spellSchoolFilter = schoolSelect.value;
            void updateSpellView();
        };
        concBtn.onclick = () => {
            this.spellConcentrationOnly = !this.spellConcentrationOnly;
            void updateSpellView();
        };
        ritualBtn.onclick = () => {
            this.spellRitualOnly = !this.spellRitualOnly;
            void updateSpellView();
        };
        resetBtn.onclick = () => {
            this.spellQuery = "";
            this.spellLevelFilter = "all";
            this.spellPoolFilter = "all";
            this.spellSchoolFilter = "all";
            this.spellConcentrationOnly = false;
            this.spellRitualOnly = false;
            searchInput.value = "";
            poolSelect.value = "all";
            schoolSelect.value = "all";
            void updateSpellView();
        };

        await updateSpellView();
    }

    // ========================================================================
    // --- TAB 3: AUTO-SORTING INITIATIVE & COMBAT TRACKER ---
    // ========================================================================

    private async syncCombatantHpToSheet(combatant: InitiativeCombatant): Promise<void> {
        const state = this.getInitiativeState();
        if (!state.syncPcHpToFrontmatter || !combatant.isPC || !combatant.sourcePath) return;
        const file = this.app.vault.getAbstractFileByPath(combatant.sourcePath);
        if (!(file instanceof TFile)) return;
        await this.plugin.updateCharacterFrontmatter(combatant.sourcePath, {
            "DnD_currentHealth": combatant.hp,
            "DnD_tempHealth": combatant.tempHp
        });
    }

    private async renderInitiativeTab(): Promise<void> {
        if (!this.monstersLoaded) {
            const res = await discoverExternalMonsters(this.app);
            this.discoveredMonsters = res.monsters;
            this.monstersMeta = res;
            this.monstersLoaded = true;
        }

        const {
            activeFolder: initPartyFolder,
            members: partyPcs,
            isConfigured: hasPartyFolder
        } = await getConfiguredPartyMembersAsync(this.app, this.plugin, this.embedFilterFolder, this.embedFilterPlayers);

        const state = this.getInitiativeState();
        if (partyPcs.length > 0 && state.combatants.length > 0) {
            const pcByPath = new Map(partyPcs.map(p => [p.sourcePath, p]));
            for (const c of state.combatants) {
                if (!c.isPC || !c.sourcePath) continue;
                const freshPc = pcByPath.get(c.sourcePath);
                if (freshPc) {
                    c.dexMod = freshPc.dexMod;
                    c.initBonus = freshPc.initBonus;
                }
            }
        }
        state.combatants = sortInitiativeCombatants(state.combatants);
        if (state.combatants.length > 0 && (!state.activeCombatantId || !state.combatants.some(c => c.id === state.activeCombatantId))) {
            state.activeCombatantId = state.combatants[0].id;
        }

        const root = this.bodyContainer.createDiv({ cls: "dnd-init-root" });

        // 1. Top Round & Turn Control Bar
        const topBar = root.createDiv({ cls: "dnd-init-top-bar" });
        const roundGroup = topBar.createDiv({ cls: "dnd-init-round-group" });
        roundGroup.createEl("span", {
            text: `Round ${state.round || 1}`,
            cls: "dnd-init-round-badge"
        });

        const prevTurnBtn = roundGroup.createEl("button", {
            text: "Prev Turn",
            cls: "dnd-dm-small-btn"
        });
        prevTurnBtn.onclick = async () => {
            if (state.combatants.length === 0) return;
            const curIdx = state.combatants.findIndex(c => c.id === state.activeCombatantId);
            if (curIdx <= 0) {
                state.round = Math.max(1, (state.round || 1) - 1);
                state.activeCombatantId = state.combatants[state.combatants.length - 1].id;
            } else {
                state.activeCombatantId = state.combatants[curIdx - 1].id;
            }
            await this.saveInitiativeState();
            await this.renderActiveTab();
        };

        const nextTurnBtn = roundGroup.createEl("button", {
            text: "Next Turn",
            cls: "dnd-dm-small-btn mod-cta"
        });
        nextTurnBtn.onclick = async () => {
            if (state.combatants.length === 0) return;
            const curIdx = state.combatants.findIndex(c => c.id === state.activeCombatantId);
            if (curIdx === -1 || curIdx + 1 >= state.combatants.length) {
                state.round = (state.round || 1) + 1;
                state.activeCombatantId = state.combatants[0].id;
            } else {
                state.activeCombatantId = state.combatants[curIdx + 1].id;
            }
            await this.saveInitiativeState();
            await this.renderActiveTab();
        };

        const rightActions = topBar.createDiv({ cls: "dnd-init-top-actions" });

        const syncLabel = rightActions.createEl("label", {
            cls: "dnd-init-sync-toggle",
            attr: { title: "Automatically sync PC Hit Points back to their character sheet frontmatter" }
        });
        const syncCheckbox = syncLabel.createEl("input", { type: "checkbox" });
        syncCheckbox.checked = state.syncPcHpToFrontmatter !== false;
        syncLabel.createSpan({ text: "Sync PC HP" });
        syncCheckbox.onchange = async () => {
            state.syncPcHpToFrontmatter = syncCheckbox.checked;
            await this.saveInitiativeState();
        };

        const rerollNpcsBtn = rightActions.createEl("button", {
            text: "Re-Roll NPCs",
            cls: "dnd-dm-small-btn",
            attr: { title: "Roll 1d20 + Init Bonus for all non-PC combatants and auto-sort" }
        });
        rerollNpcsBtn.onclick = async () => {
            for (const c of state.combatants) {
                if (!c.isPC) {
                    c.initiative = rollD20() + (Number(c.initBonus) || 0);
                }
            }
            await this.saveInitiativeState();
            await this.renderActiveTab();
            new Notice("Re-rolled initiative for all NPCs!");
        };

        const clearNpcsBtn = rightActions.createEl("button", {
            text: "Clear NPCs",
            cls: "dnd-dm-small-btn"
        });
        clearNpcsBtn.onclick = async () => {
            state.combatants = state.combatants.filter(c => c.isPC);
            await this.saveInitiativeState();
            await this.renderActiveTab();
        };

        const resetBtn = rightActions.createEl("button", {
            text: "Reset All",
            cls: "dnd-dm-small-btn dnd-btn-danger"
        });
        resetBtn.onclick = async () => {
            state.round = 1;
            state.activeCombatantId = null;
            state.combatants = [];
            await this.saveInitiativeState();
            await this.renderActiveTab();
        };

        // 2. Add / Import Combatant Panel (3 Modes: Vault PCs | Monster / Statblock | Custom)
        const addPanel = root.createDiv({ cls: "dnd-init-add-panel" });
        const modeSwitchRow = addPanel.createDiv({ cls: "dnd-compendium-pills dnd-init-mode-pills" });

        const modes: { id: "pc" | "monster" | "custom"; label: string }[] = [
            { id: "pc", label: "Import Vault PCs" },
            { id: "monster", label: "Add Monster / Statblock" },
            { id: "custom", label: "Custom Combatant" }
        ];
        for (const m of modes) {
            const btn = modeSwitchRow.createEl("button", {
                text: m.label,
                cls: `dnd-compendium-pill ${this.initAddMode === m.id ? "is-active" : ""}`.trim()
            });
            btn.onclick = async () => {
                this.initAddMode = m.id;
                await this.renderActiveTab();
            };
        }

        const addFormRow = addPanel.createDiv({ cls: "dnd-init-add-form" });

        if (this.initAddMode === "pc") {
            const pcSelect = addFormRow.createEl("select", {
                cls: "dnd-modal-form-input dnd-init-add-select"
            });
            if (!hasPartyFolder) {
                pcSelect.createEl("option", { text: "Select a Party Folder in Party Dashboard first...", value: "" });
            } else if (partyPcs.length === 0) {
                pcSelect.createEl("option", { text: `No character sheets found in "${initPartyFolder}"`, value: "" });
            } else {
                for (const pc of partyPcs) {
                    pcSelect.createEl("option", {
                        text: `${pc.name} (Lvl ${pc.level} ${pc.dndClass} • AC ${pc.ac} • HP ${pc.currentHp}/${pc.maxHp} • Init ${formatSignedNumber(pc.initBonus)})`,
                        value: pc.sourcePath
                    });
                }
            }

            const manualInitInput = addFormRow.createEl("input", {
                type: "number",
                placeholder: "Roll (or auto)",
                cls: "dnd-modal-form-input dnd-init-num-input",
                attr: { title: "Enter the player's physical initiative total, or leave blank to auto-roll 1d20 + Init Bonus" }
            });

            const addPcBtn = addFormRow.createEl("button", {
                text: "+ Add PC",
                cls: "dnd-dm-small-btn mod-cta"
            });
            addPcBtn.onclick = async () => {
                const chosen = partyPcs.find(p => p.sourcePath === pcSelect.value);
                if (!chosen) return;
                const manualVal = manualInitInput.value.trim();
                const rolledTotal = manualVal !== "" && !isNaN(Number(manualVal))
                    ? Number(manualVal)
                    : (rollD20() + chosen.initBonus);

                const existingIdx = state.combatants.findIndex(c => c.sourcePath === chosen.sourcePath);
                const newEntry: InitiativeCombatant = {
                    id: existingIdx >= 0 ? state.combatants[existingIdx].id : `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: chosen.name,
                    initiative: rolledTotal,
                    initBonus: chosen.initBonus,
                    dexMod: chosen.dexMod,
                    hp: chosen.currentHp,
                    maxHp: chosen.maxHp,
                    tempHp: chosen.tempHp,
                    ac: chosen.ac,
                    isPC: true,
                    conditions: existingIdx >= 0 ? state.combatants[existingIdx].conditions : [],
                    concentrating: existingIdx >= 0 ? state.combatants[existingIdx].concentrating : false,
                    sourcePath: chosen.sourcePath
                };

                if (existingIdx >= 0) {
                    state.combatants[existingIdx] = newEntry;
                } else {
                    state.combatants.push(newEntry);
                }
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            const importAllBtn = addFormRow.createEl("button", {
                text: hasPartyFolder ? `Import All Party PCs (${partyPcs.length})` : "Import All Party PCs",
                cls: "dnd-dm-small-btn",
                attr: {
                    title: hasPartyFolder
                        ? `Import all party PCs from "${initPartyFolder}" not yet in the tracker and auto-roll their initiative`
                        : "Select a Party Folder in the Party Dashboard tab first"
                }
            });
            importAllBtn.onclick = async () => {
                if (!hasPartyFolder) {
                    new Notice("Select a Party Folder in the Party Dashboard tab first.");
                    return;
                }
                if (partyPcs.length === 0) {
                    new Notice(`No character sheet notes found in "${initPartyFolder}".`);
                    return;
                }
                let added = 0;
                for (const pc of partyPcs) {
                    if (state.combatants.some(c => c.sourcePath === pc.sourcePath)) continue;
                    state.combatants.push({
                        id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        name: pc.name,
                        initiative: rollD20() + pc.initBonus,
                        initBonus: pc.initBonus,
                        dexMod: pc.dexMod,
                        hp: pc.currentHp,
                        maxHp: pc.maxHp,
                        tempHp: pc.tempHp,
                        ac: pc.ac,
                        isPC: true,
                        conditions: [],
                        concentrating: false,
                        sourcePath: pc.sourcePath
                    });
                    added++;
                }
                await this.saveInitiativeState();
                await this.renderActiveTab();
                new Notice(added > 0 ? `Imported ${added} PC(s) from "${initPartyFolder}" into Initiative!` : "All party PCs from that folder are already in the tracker.");
            };
        } else if (this.initAddMode === "monster") {
            const filterInput = addFormRow.createEl("input", {
                type: "text",
                placeholder: `Filter ${this.discoveredMonsters.length} DM Compendium monsters...`,
                value: this.initMonsterFilterQuery,
                cls: "dnd-modal-form-input dnd-init-name-input"
            });

            const monSelect = addFormRow.createEl("select", {
                cls: "dnd-modal-form-input dnd-init-add-select"
            });

            const populateMonsterDropdown = () => {
                monSelect.empty();
                const q = this.initMonsterFilterQuery.trim().toLowerCase();
                const matches = q
                    ? this.discoveredMonsters.filter(m =>
                        m.name.toLowerCase().includes(q)
                        || m.sourceShort.toLowerCase().includes(q)
                        || m.sourceCode.toLowerCase().includes(q)
                        || m.type.toLowerCase().includes(q)
                    )
                    : this.discoveredMonsters;

                const capped = matches.slice(0, 250);
                for (const m of capped) {
                    monSelect.createEl("option", {
                        text: `${m.name} (${m.sourceShort} • CR ${m.cr} • AC ${m.ac} • HP ${m.hp} • DEX ${formatSignedNumber(m.dexMod)})`,
                        value: m.id
                    });
                }
                if (matches.length > 250) {
                    monSelect.createEl("option", {
                        text: `...and ${matches.length - 250} more (type above to filter)`,
                        value: ""
                    });
                } else if (matches.length === 0) {
                    monSelect.createEl("option", {
                        text: "No matching monsters found",
                        value: ""
                    });
                }
            };

            populateMonsterDropdown();
            filterInput.oninput = () => {
                this.initMonsterFilterQuery = filterInput.value;
                populateMonsterDropdown();
            };

            const qtyInput = addFormRow.createEl("input", {
                type: "number",
                value: "1",
                cls: "dnd-modal-form-input dnd-init-qty-input",
                attr: { min: "1", max: "20", title: "Quantity to spawn (e.g. 3 creates Goblin 1, Goblin 2, Goblin 3)" }
            });

            const addMonBtn = addFormRow.createEl("button", {
                text: "Roll & Add Monster(s)",
                cls: "dnd-dm-small-btn mod-cta"
            });
            addMonBtn.onclick = async () => {
                const chosen = this.discoveredMonsters.find(m => m.id === monSelect.value);
                if (!chosen) return;
                const qty = Math.max(1, Math.min(20, Number(qtyInput.value) || 1));
                this.spawnMonsterIntoInitiative(chosen, qty);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };
        } else {
            const nameInput = addFormRow.createEl("input", {
                type: "text",
                placeholder: "Combatant Name (e.g. Cultist Leader)",
                cls: "dnd-modal-form-input dnd-init-name-input"
            });
            const initInput = addFormRow.createEl("input", {
                type: "number",
                placeholder: "Init (or auto)",
                cls: "dnd-modal-form-input dnd-init-num-input",
                attr: { title: "Initiative total (leave blank to auto-roll 1d20 + Init Bonus)" }
            });
            const modInput = addFormRow.createEl("input", {
                type: "number",
                placeholder: "Init Bonus (+0)",
                cls: "dnd-modal-form-input dnd-init-num-input",
                attr: { title: "Initiative Modifier / DEX Mod" }
            });
            const hpInput = addFormRow.createEl("input", {
                type: "number",
                placeholder: "HP (25)",
                cls: "dnd-modal-form-input dnd-init-num-input"
            });
            const acInput = addFormRow.createEl("input", {
                type: "number",
                placeholder: "AC (14)",
                cls: "dnd-modal-form-input dnd-init-num-input"
            });
            const qtyInput = addFormRow.createEl("input", {
                type: "number",
                value: "1",
                cls: "dnd-modal-form-input dnd-init-qty-input",
                attr: { min: "1", max: "20", title: "Quantity" }
            });
            const typeSelect = addFormRow.createEl("select", {
                cls: "dnd-modal-form-input dnd-init-type-select"
            });
            typeSelect.createEl("option", { text: "NPC / Enemy", value: "npc" });
            typeSelect.createEl("option", { text: "Player / Ally", value: "pc" });

            const addCustomBtn = addFormRow.createEl("button", {
                text: "+ Add",
                cls: "dnd-dm-small-btn mod-cta"
            });
            addCustomBtn.onclick = async () => {
                const baseName = nameInput.value.trim() || "Combatant";
                const bonus = Number(modInput.value) || 0;
                const hp = Math.max(1, Number(hpInput.value) || 20);
                const ac = Math.max(1, Number(acInput.value) || 12);
                const qty = Math.max(1, Math.min(20, Number(qtyInput.value) || 1));
                const isPC = typeSelect.value === "pc";
                const manualInit = initInput.value.trim();

                for (let i = 1; i <= qty; i++) {
                    const finalName = qty > 1 ? `${baseName} ${i}` : baseName;
                    const finalInit = manualInit !== "" && !isNaN(Number(manualInit))
                        ? Number(manualInit)
                        : (rollD20() + bonus);
                    state.combatants.push({
                        id: `custom-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                        name: finalName,
                        initiative: finalInit,
                        initBonus: bonus,
                        dexMod: bonus,
                        hp,
                        maxHp: hp,
                        tempHp: 0,
                        ac,
                        isPC,
                        conditions: [],
                        concentrating: false
                    });
                }

                await this.saveInitiativeState();
                await this.renderActiveTab();
            };
        }

        // 3. Sorted Combatant Table / Cards
        const listContainer = root.createDiv({ cls: "dnd-init-list" });
        if (state.combatants.length === 0) {
            listContainer.createEl("div", {
                text: "No combatants in the encounter yet. Import your party PCs, add monsters, or create a custom combatant above!",
                cls: "dnd-modal-empty-text dnd-init-empty"
            });
            return;
        }

        for (let idx = 0; idx < state.combatants.length; idx++) {
            const c = state.combatants[idx];
            const isActiveTurn = c.id === state.activeCombatantId;
            const isDefeated = !c.isPC && c.hp <= 0;
            const hpPct = c.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((c.hp / c.maxHp) * 100))) : 0;

            const card = listContainer.createDiv({
                cls: `dnd-init-card ${isActiveTurn ? "is-active-turn" : ""} ${c.isPC ? "is-pc" : "is-npc"} ${isDefeated ? "is-defeated" : ""}`.trim()
            });

            const mainRow = card.createDiv({ cls: "dnd-init-card-main" });

            // Turn Indicator + Editable Initiative Score (Auto-Sorts on change!)
            const initCol = mainRow.createDiv({ cls: "dnd-init-col-score" });
            const turnBtn = initCol.createEl("button", {
                text: isActiveTurn ? "▶" : String(idx + 1),
                cls: `dnd-init-turn-indicator ${isActiveTurn ? "is-active" : ""}`.trim(),
                attr: { title: "Click to set active turn to this combatant" }
            });
            turnBtn.onclick = async () => {
                state.activeCombatantId = c.id;
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            const initScoreInput = initCol.createEl("input", {
                type: "number",
                value: String(c.initiative),
                cls: "dnd-init-score-input",
                attr: { title: `Initiative Total (Mod: ${formatSignedNumber(c.initBonus)}). Edit to auto-sort.` }
            });
            initScoreInput.onchange = async () => {
                c.initiative = Number(initScoreInput.value) || 0;
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            // Name & Badges Column
            const nameCol = mainRow.createDiv({ cls: "dnd-init-col-name" });
            const nameHeader = nameCol.createDiv({ cls: "dnd-init-name-row" });

            const nameEl = nameHeader.createEl("span", {
                text: c.name,
                cls: `dnd-init-name ${c.sourcePath || c.monsterId ? "is-clickable" : ""}`.trim()
            });
            if (c.sourcePath) {
                nameEl.title = `Open Character Sheet (${c.sourcePath})`;
                nameEl.onclick = async () => {
                    await this.app.workspace.openLinkText(c.sourcePath!, "", false);
                };
            } else if (c.monsterId) {
                const matchedMonster = this.discoveredMonsters.find(m => m.id === c.monsterId);
                if (matchedMonster) {
                    nameEl.title = "Click to inspect Creature Statblock";
                    nameEl.onclick = () => {
                        new StatblockPreviewModal(this.app, this.plugin, matchedMonster).open();
                    };
                }
            }

            nameHeader.createEl("span", {
                text: c.isPC ? "PC" : "NPC",
                cls: `dnd-level-badge dnd-modal-badge-sm ${c.isPC ? "dnd-badge-pc" : "dnd-badge-npc"}`
            });
            nameHeader.createEl("span", {
                text: `Init ${formatSignedNumber(c.initBonus)}`,
                cls: "dnd-init-sub-hint"
            });

            // AC Column
            const acCol = mainRow.createDiv({ cls: "dnd-init-col-ac" });
            acCol.createEl("span", { text: "AC", cls: "dnd-init-field-label" });
            const acInput = acCol.createEl("input", {
                type: "number",
                value: String(c.ac),
                cls: "dnd-init-ac-input"
            });
            acInput.onchange = async () => {
                c.ac = Math.max(0, Number(acInput.value) || 0);
                await this.saveInitiativeState();
            };

            // HP Bar + Quick Damage/Heal Column
            const hpCol = mainRow.createDiv({ cls: "dnd-init-col-hp" });
            const hpTopRow = hpCol.createDiv({ cls: "dnd-init-hp-top" });

            const hpTrack = hpTopRow.createDiv({ cls: "dnd-init-hp-bar-track" });
            const hpFill = hpTrack.createDiv({
                cls: `dnd-init-hp-bar-fill ${hpPct <= 25 ? "is-critical" : (hpPct <= 50 ? "is-bloodied" : "")}`.trim()
            });
            hpFill.style.width = `${hpPct}%`;

            const hpInputsWrap = hpTopRow.createDiv({ cls: "dnd-init-hp-inputs" });
            const curHpInput = hpInputsWrap.createEl("input", {
                type: "number",
                value: String(c.hp),
                cls: "dnd-init-hp-input",
                attr: { title: "Current HP" }
            });
            hpInputsWrap.createSpan({ text: "/" });
            const maxHpInput = hpInputsWrap.createEl("input", {
                type: "number",
                value: String(c.maxHp),
                cls: "dnd-init-hp-input",
                attr: { title: "Max HP" }
            });

            const tempWrap = hpInputsWrap.createSpan({ cls: "dnd-init-temp-wrap" });
            tempWrap.createSpan({ text: "+Temp" });
            const tempHpInput = tempWrap.createEl("input", {
                type: "number",
                value: String(c.tempHp || 0),
                cls: "dnd-init-temp-input",
                attr: { title: "Temporary HP" }
            });

            curHpInput.onchange = async () => {
                c.hp = Math.max(0, Number(curHpInput.value) || 0);
                await this.syncCombatantHpToSheet(c);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };
            maxHpInput.onchange = async () => {
                c.maxHp = Math.max(1, Number(maxHpInput.value) || 1);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };
            tempHpInput.onchange = async () => {
                c.tempHp = Math.max(0, Number(tempHpInput.value) || 0);
                await this.syncCombatantHpToSheet(c);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            // Quick Delta Damage / Heal controls
            const deltaWrap = hpTopRow.createDiv({ cls: "dnd-init-delta-wrap" });
            const deltaInput = deltaWrap.createEl("input", {
                type: "number",
                placeholder: "Dmg/Heal",
                cls: "dnd-init-delta-input",
                attr: { min: "1" }
            });
            const dmgBtn = deltaWrap.createEl("button", {
                text: "- Dmg",
                cls: "dnd-dm-small-btn dnd-btn-dmg",
                attr: { title: "Apply Damage (absorbs Temp HP first)" }
            });
            const healBtn = deltaWrap.createEl("button", {
                text: "+ Heal",
                cls: "dnd-dm-small-btn dnd-btn-heal",
                attr: { title: "Apply Healing (up to Max HP)" }
            });

            dmgBtn.onclick = async () => {
                let dmg = Math.max(0, Number(deltaInput.value) || 0);
                if (dmg <= 0) return;
                if (c.tempHp > 0) {
                    const absorbed = Math.min(c.tempHp, dmg);
                    c.tempHp -= absorbed;
                    dmg -= absorbed;
                }
                const oldHp = c.hp;
                c.hp = Math.max(0, c.hp - dmg);
                if (c.concentrating && c.hp < oldHp) {
                    const totalTaken = oldHp - c.hp;
                    const dc = Math.max(10, Math.min(30, Math.floor(totalTaken / 2)));
                    new Notice(`${c.name} is Concentrating! Roll a DC ${dc} Constitution saving throw.`);
                }
                await this.syncCombatantHpToSheet(c);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            healBtn.onclick = async () => {
                const heal = Math.max(0, Number(deltaInput.value) || 0);
                if (heal <= 0) return;
                c.hp = Math.min(c.maxHp, c.hp + heal);
                await this.syncCombatantHpToSheet(c);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            // Delete Combatant Column
            const delBtn = mainRow.createEl("button", {
                text: "✕",
                cls: "dnd-modal-del-btn",
                attr: { title: "Remove combatant from encounter" }
            });
            delBtn.onclick = async () => {
                state.combatants = state.combatants.filter(item => item.id !== c.id);
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };

            // Second Row: Active Conditions + Concentration + Condition Selector
            const condRow = card.createDiv({ cls: "dnd-init-card-conditions" });
            const activeBadges = condRow.createDiv({ cls: "dnd-init-condition-badges" });

            if (c.concentrating) {
                const concBadge = activeBadges.createEl("span", {
                    text: "Concentrating ×",
                    cls: "dnd-init-cond-badge is-concentration",
                    attr: { title: "Click to inspect Concentration rule or remove" }
                });
                concBadge.onclick = () => {
                    new ConditionRuleModal(this.app, this.plugin, "Concentration", async () => {
                        c.concentrating = false;
                        await this.saveInitiativeState();
                        await this.renderActiveTab();
                    }).open();
                };
            }

            for (const cond of c.conditions || []) {
                const badge = activeBadges.createEl("span", {
                    text: `${cond} ×`,
                    cls: "dnd-init-cond-badge",
                    attr: { title: `Click to view 5.5e rule for ${cond} or remove` }
                });
                badge.onclick = () => {
                    new ConditionRuleModal(this.app, this.plugin, cond, async () => {
                        c.conditions = (c.conditions || []).filter(x => x !== cond);
                        await this.saveInitiativeState();
                        await this.renderActiveTab();
                    }).open();
                };
            }

            const condSelect = condRow.createEl("select", {
                cls: "dnd-init-cond-select"
            });
            condSelect.createEl("option", { text: "+ Condition / Concentration", value: "" });
            if (!c.concentrating) {
                condSelect.createEl("option", { text: "Concentrating", value: "__CONCENTRATING__" });
            }
            for (const condName of DND_55E_CONDITIONS) {
                if (!(c.conditions || []).includes(condName)) {
                    condSelect.createEl("option", { text: condName, value: condName });
                }
            }
            condSelect.onchange = async () => {
                const val = condSelect.value;
                if (!val) return;
                if (val === "__CONCENTRATING__") {
                    c.concentrating = true;
                } else {
                    if (!Array.isArray(c.conditions)) c.conditions = [];
                    if (!c.conditions.includes(val)) c.conditions.push(val);
                }
                await this.saveInitiativeState();
                await this.renderActiveTab();
            };
        }
    }

    public spawnMonsterIntoInitiative(monster: DiscoveredMonster, qty: number): void {
        const state = this.getInitiativeState();
        const existingSameCount = state.combatants.filter(c => c.name.startsWith(monster.name)).length;

        for (let i = 1; i <= qty; i++) {
            const num = existingSameCount + i;
            const displayName = (qty > 1 || existingSameCount > 0) ? `${monster.name} ${num}` : monster.name;
            state.combatants.push({
                id: `mon-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                name: displayName,
                initiative: rollD20() + monster.dexMod,
                initBonus: monster.dexMod,
                dexMod: monster.dexMod,
                hp: monster.hp,
                maxHp: monster.hp,
                tempHp: 0,
                ac: monster.ac,
                isPC: false,
                conditions: [],
                concentrating: false,
                monsterId: monster.id
            });
        }
    }

    // ========================================================================
    // --- TAB 4: LIVE PARTY DASHBOARD ---
    // ========================================================================

    private async renderPartyTab(): Promise<void> {
        const root = this.bodyContainer.createDiv({ cls: "dnd-party-root" });
        const hasExplicitEmbedFilter = this.embedFilterFolder !== undefined
            || (this.embedFilterPlayers !== undefined && this.embedFilterPlayers.length > 0);
        let saveTimer: number | null = null;
        let partyRenderVersion = 0;
        let renderPartyContent!: () => Promise<void>;

        // Party Folder Input (lets DM type or paste the vault folder containing active party sheets)
        if ((this.hostMode === "modal" || this.hostMode === "sidebar") && !hasExplicitEmbedFilter) {
            const folderBar = root.createDiv({ cls: "dnd-compendium-controls dnd-party-folder-bar" });
            const folderRow = folderBar.createDiv({ cls: "dnd-compendium-search-row" });
            folderRow.createEl("span", {
                text: "Party Folder:",
                cls: "dnd-party-folder-label"
            });

            const datalistId = `dnd-party-folders-${Math.random().toString(36).slice(2, 8)}`;
            const folderInput = folderRow.createEl("input", {
                type: "text",
                placeholder: 'Type or paste folder path (e.g. "Campaign/Party", "/" for root)...',
                value: this.plugin.settings.partyFolderPath || "",
                cls: "dnd-modal-form-input dnd-party-folder-input",
                attr: {
                    list: datalistId,
                    title: 'Enter the vault folder path containing your party\'s character sheets (or "/" for vault root)'
                }
            });
            const dataListEl = folderRow.createEl("datalist", { attr: { id: datalistId } });
            dataListEl.createEl("option", { attr: { value: "/" } });
            for (const fp of listVaultFolderPaths(this.app)) {
                dataListEl.createEl("option", { attr: { value: fp } });
            }

            const commitFolderPath = async (rerenderBody: boolean) => {
                if (saveTimer !== null) {
                    window.clearTimeout(saveTimer);
                    saveTimer = null;
                }
                this.plugin.settings.partyFolderPath = folderInput.value.trim();
                await this.plugin.saveSettings();
                window.dispatchEvent(new CustomEvent("dnd-dm-party-folder-updated", { detail: { sourceWidget: this } }));
                if (rerenderBody) await renderPartyContent();
            };

            folderInput.oninput = () => {
                this.plugin.settings.partyFolderPath = folderInput.value.trim();
                void renderPartyContent();
                if (saveTimer !== null) window.clearTimeout(saveTimer);
                saveTimer = window.setTimeout(() => { void commitFolderPath(false); }, 350);
            };
            folderInput.onchange = () => { void commitFolderPath(true); };
            folderInput.onkeydown = (evt: KeyboardEvent) => {
                if (evt.key === "Enter") {
                    evt.preventDefault();
                    void commitFolderPath(true);
                }
            };
        }

        const partyBody = root.createDiv({ cls: "dnd-party-body" });
        const abilityShort: Record<AbilityKey, string> = {
            strength: "STR",
            dexterity: "DEX",
            constitution: "CON",
            intelligence: "INT",
            wisdom: "WIS",
            charisma: "CHA"
        };

        renderPartyContent = async () => {
            const renderToken = ++partyRenderVersion;
            const {
                activeFolder,
                members: party,
                isConfigured
            } = await getConfiguredPartyMembersAsync(this.app, this.plugin, this.embedFilterFolder, this.embedFilterPlayers);
            if (renderToken !== partyRenderVersion) return;
            partyBody.empty();

            // Top Summary Banner
            const banner = partyBody.createDiv({ cls: "dnd-party-banner" });
            const statsSummary = banner.createDiv({ cls: "dnd-party-banner-stats" });

            const maxPP = party.length > 0 ? Math.max(...party.map(p => p.passivePerception)) : 0;
            const maxPI = party.length > 0 ? Math.max(...party.map(p => p.passiveInvestigation)) : 0;
            const maxPIns = party.length > 0 ? Math.max(...party.map(p => p.passiveInsight)) : 0;

            const addBannerChip = (label: string, val: string) => {
                const chip = statsSummary.createDiv({ cls: "dnd-party-banner-chip" });
                chip.createEl("span", { text: label, cls: "dnd-party-chip-label" });
                chip.createEl("strong", { text: val, cls: "dnd-party-chip-val" });
            };

            addBannerChip("Party Size", String(party.length));
            addBannerChip("Best Passive Perception", String(maxPP));
            addBannerChip("Best Passive Investigation", String(maxPI));
            addBannerChip("Best Passive Insight", String(maxPIns));

            const bannerActions = banner.createDiv({ cls: "dnd-party-banner-actions" });
            const sendToInitBtn = bannerActions.createEl("button", {
                text: "Send Party to Initiative",
                cls: "dnd-dm-small-btn mod-cta"
            });
            sendToInitBtn.onclick = async () => {
                if (!isConfigured) {
                    new Notice("Enter a Party Folder path above first.");
                    return;
                }
                if (saveTimer !== null) {
                    window.clearTimeout(saveTimer);
                    saveTimer = null;
                }
                const state = this.getInitiativeState();
                let added = 0;
                for (const pc of party) {
                    if (state.combatants.some(c => c.sourcePath === pc.sourcePath)) continue;
                    state.combatants.push({
                        id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        name: pc.name,
                        initiative: rollD20() + pc.initBonus,
                        initBonus: pc.initBonus,
                        dexMod: pc.dexMod,
                        hp: pc.currentHp,
                        maxHp: pc.maxHp,
                        tempHp: pc.tempHp,
                        ac: pc.ac,
                        isPC: true,
                        conditions: [],
                        concentrating: false,
                        sourcePath: pc.sourcePath
                    });
                    added++;
                }
                await this.saveInitiativeState();
                new Notice(added > 0 ? `Added ${added} PC(s) to Initiative Tracker!` : "All party PCs are already in the Initiative Tracker.");
                if (this.hostMode === "modal" || this.hostMode === "sidebar") {
                    await this.setTab("initiative");
                }
            };

            const refreshPartyBtn = bannerActions.createEl("button", {
                text: "Refresh",
                cls: "dnd-dm-small-btn"
            });
            refreshPartyBtn.onclick = () => {
                renderPartyContent();
            };

            if (party.length === 0) {
                partyBody.createEl("div", {
                    text: !isConfigured
                        ? "Enter your Party Folder path above to display your party's character sheets here and enable automatic whole-party import in the Initiative Tracker."
                        : `No character sheet notes found in "${activeFolder || "/"}". Enter another folder path above or create character sheets in that folder.`,
                    cls: "dnd-modal-empty-text"
                });
                return;
            }

            const grid = partyBody.createDiv({ cls: "dnd-party-grid" });

            for (const pc of party) {
                const card = grid.createDiv({ cls: "dnd-party-card" });

                // Card Header
                const header = card.createDiv({ cls: "dnd-party-card-header" });
                const titleCol = header.createDiv();
                const nameLink = titleCol.createEl("h4", {
                    text: pc.name,
                    cls: "dnd-party-card-name is-clickable",
                    attr: { title: `Click to open ${pc.sourcePath}` }
                });
                nameLink.onclick = async () => {
                    await this.app.workspace.openLinkText(pc.sourcePath, "", false);
                };

                const subTitle = `Lvl ${pc.level} • ${pc.race} • ${pc.dndClass}${pc.subclass ? ` (${pc.subclass})` : ""}`;
                titleCol.createEl("div", { text: subTitle, cls: "dnd-party-card-subtitle" });

                // Heroic Inspiration Button
                const hiBtn = header.createEl("button", {
                    text: pc.heroicInspiration ? "Inspired" : "Inspire",
                    cls: `dnd-dm-small-btn dnd-party-hi-btn ${pc.heroicInspiration ? "is-active" : ""}`.trim(),
                    attr: { title: "Toggle Heroic Inspiration for this character" }
                });
                hiBtn.onclick = () => {
                    this.plugin.setHeroicInspiration(pc.sourcePath, !pc.heroicInspiration);
                    renderPartyContent();
                };

                // HP Bar & Quick Sheet HP Editor
                const hpPct = pc.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((pc.currentHp / pc.maxHp) * 100))) : 0;
                const hpSection = card.createDiv({ cls: "dnd-party-hp-section" });
                const hpLabelRow = hpSection.createDiv({ cls: "dnd-party-hp-label-row" });
                hpLabelRow.createEl("strong", {
                    text: `HP: ${pc.currentHp} / ${pc.maxHp}${pc.tempHp > 0 ? ` (+${pc.tempHp} Temp)` : ""}`
                });

                const quickHpControls = hpLabelRow.createDiv({ cls: "dnd-party-hp-controls" });
                const deltaIn = quickHpControls.createEl("input", {
                    type: "number",
                    placeholder: "±HP",
                    cls: "dnd-init-delta-input"
                });
                const dmgBtn = quickHpControls.createEl("button", {
                    text: "- Dmg",
                    cls: "dnd-dm-small-btn",
                    attr: { title: "Damage character (updates their character sheet note)" }
                });
                const healBtn = quickHpControls.createEl("button", {
                    text: "+ Heal",
                    cls: "dnd-dm-small-btn",
                    attr: { title: "Heal character (updates their character sheet note)" }
                });

                dmgBtn.onclick = async () => {
                    let dmg = Math.max(0, Number(deltaIn.value) || 0);
                    if (dmg <= 0) return;
                    let newTemp = pc.tempHp;
                    if (newTemp > 0) {
                        const absorbed = Math.min(newTemp, dmg);
                        newTemp -= absorbed;
                        dmg -= absorbed;
                    }
                    const newHp = Math.max(0, pc.currentHp - dmg);
                    await this.plugin.updateCharacterFrontmatter(pc.sourcePath, {
                        "DnD_currentHealth": newHp,
                        "DnD_tempHealth": newTemp
                    });
                    setTimeout(() => renderPartyContent(), 120);
                };
                healBtn.onclick = async () => {
                    const heal = Math.max(0, Number(deltaIn.value) || 0);
                    if (heal <= 0) return;
                    const newHp = Math.min(pc.maxHp, pc.currentHp + heal);
                    await this.plugin.updateCharacterFrontmatter(pc.sourcePath, {
                        "DnD_currentHealth": newHp
                    });
                    setTimeout(() => renderPartyContent(), 120);
                };

                const hpTrack = hpSection.createDiv({ cls: "dnd-init-hp-bar-track" });
                const hpFill = hpTrack.createDiv({
                    cls: `dnd-init-hp-bar-fill ${hpPct <= 25 ? "is-critical" : (hpPct <= 50 ? "is-bloodied" : "")}`.trim()
                });
                hpFill.style.width = `${hpPct}%`;

                // Vitals Strip (AC, Speed, Initiative, Exhaustion)
                const vitalsGrid = card.createDiv({ cls: "dnd-party-vitals-grid" });
                const addVitalBox = (label: string, val: string) => {
                    const box = vitalsGrid.createDiv({ cls: "dnd-party-vital-box" });
                    box.createEl("div", { text: label, cls: "dnd-party-vital-label" });
                    box.createEl("div", { text: val, cls: "dnd-party-vital-val" });
                };
                addVitalBox("AC", String(pc.ac));
                addVitalBox("Speed", `${pc.speed} ft.`);
                addVitalBox("Init", formatSignedNumber(pc.initBonus));
                addVitalBox("Exhaust", `${pc.exhaustion}/6`);

                // Passive Senses Row
                const sensesRow = card.createDiv({ cls: "dnd-party-senses-row" });
                const addSensePill = (label: string, val: number) => {
                    const pill = sensesRow.createDiv({ cls: "dnd-party-sense-pill" });
                    pill.createEl("span", { text: label, cls: "dnd-party-sense-label" });
                    pill.createEl("strong", { text: String(val), cls: "dnd-party-sense-val" });
                };
                addSensePill("Pass. Perc", pc.passivePerception);
                addSensePill("Pass. Inv", pc.passiveInvestigation);
                addSensePill("Pass. Ins", pc.passiveInsight);

                // 6 Ability Modifiers & Saving Throw Proficiency Strip
                const abilRow = card.createDiv({ cls: "dnd-party-abilities-strip" });
                for (const abKey of ALL_ABILITIES) {
                    const score = pc.abilities[abKey] ?? 10;
                    const mod = abilityModFromScore(score);
                    const isSaveProf = pc.savingThrows.includes(abKey);
                    const cell = abilRow.createDiv({
                        cls: `dnd-party-ability-cell ${isSaveProf ? "is-save-proficient" : ""}`.trim(),
                        attr: { title: `${abKey.toUpperCase()}: ${score} (${formatSignedNumber(mod)})${isSaveProf ? " • Saving Throw Proficient" : ""}` }
                    });
                    cell.createEl("div", {
                        text: `${abilityShort[abKey]}${isSaveProf ? "★" : ""}`,
                        cls: "dnd-party-ability-lbl"
                    });
                    cell.createEl("div", {
                        text: formatSignedNumber(mod),
                        cls: "dnd-party-ability-mod"
                    });
                }

                // Languages & Tools Footer
                if (pc.languages.length > 0 || pc.toolProficiencies.length > 0) {
                    const metaFooter = card.createDiv({ cls: "dnd-party-card-footer" });
                    if (pc.languages.length > 0) {
                        metaFooter.createEl("div", {
                            text: `Languages: ${pc.languages.join(", ")}`,
                            cls: "dnd-party-footer-line"
                        });
                    }
                    if (pc.toolProficiencies.length > 0) {
                        metaFooter.createEl("div", {
                            text: `Tools: ${pc.toolProficiencies.join(", ")}`,
                            cls: "dnd-party-footer-line"
                        });
                    }
                }
            }
        };

        await renderPartyContent();
    }

    // ========================================================================
    // --- TAB 5: MONSTERS & STATBLOCKS (The DM Compendium & Fantasy Statblocks Bridge) ---
    // ========================================================================

    private async ensureMonstersLoaded(): Promise<void> {
        if (this.monstersLoaded) return;
        const res = await discoverExternalMonsters(this.app);
        this.discoveredMonsters = res.monsters;
        this.monstersMeta = res;
        this.monstersLoaded = true;
    }

    private async renderMonstersTab(): Promise<void> {
        await this.ensureMonstersLoaded();
        const root = this.bodyContainer.createDiv({ cls: "dnd-monsters-root" });

        // Integration Status Banner (The DM Compendium)
        const statusBanner = root.createDiv({ cls: "dnd-monsters-status-banner" });
        const badgesLeft = statusBanner.createDiv({ cls: "dnd-monsters-status-badges" });

        badgesLeft.createEl("span", {
            text: this.monstersMeta.hasDmCompendium
                ? `The DM Compendium: Connected (${this.monstersMeta.dmCompendiumCount} Statblocks)`
                : "The DM Compendium: Not Detected (Using Built-in Presets)",
            cls: `dnd-level-badge ${this.monstersMeta.hasDmCompendium ? "dnd-badge-connected" : ""}`.trim()
        });
        if (this.monstersMeta.availableSources.length > 0) {
            badgesLeft.createEl("span", {
                text: `Sources: ${this.monstersMeta.availableSources.map(s => s.short).join(", ")}`,
                cls: "dnd-level-badge"
            });
        }
        if (this.monstersMeta.vaultStatblockCount > 0) {
            badgesLeft.createEl("span", {
                text: `Vault Statblocks: ${this.monstersMeta.vaultStatblockCount}`,
                cls: "dnd-level-badge"
            });
        }

        const bannerBtns = statusBanner.createDiv({ cls: "dnd-monsters-status-actions" });
        if (this.monstersMeta.hasDmCompendium) {
            const refreshDbBtn = bannerBtns.createEl("button", {
                text: "Sync DM Compendium DB",
                cls: "dnd-dm-small-btn",
                attr: { title: "Refresh The DM Compendium's cached bestiary from your enabled sources" }
            });
            refreshDbBtn.onclick = async () => {
                const tdcPlugin = (this.app as any).plugins?.plugins?.["the-dm-compendium"];
                if (tdcPlugin && typeof tdcPlugin.refreshCompendiumDatabase === "function") {
                    await tdcPlugin.refreshCompendiumDatabase(true);
                }
                this.monstersLoaded = false;
                await this.renderActiveTab();
            };

            const tdcBtn = bannerBtns.createEl("button", {
                text: "Launch DM Compendium Search",
                cls: "dnd-dm-small-btn mod-cta",
                attr: { title: "Trigger The DM Compendium's native search modal" }
            });
            tdcBtn.onclick = () => {
                const cmds = (this.app as any).commands;
                const executed = cmds?.executeCommandById?.("the-dm-compendium:insert-from-compendium")
                    || cmds?.executeCommandById?.("the-dm-compendium:open-compendium");
                if (!executed) {
                    new Notice("Open a Markdown note in Editing view to insert directly from The DM Compendium.");
                }
            };
        }

        const rescanBtn = bannerBtns.createEl("button", {
            text: "Reload Statblocks",
            cls: "dnd-dm-small-btn"
        });
        rescanBtn.onclick = async () => {
            this.monstersLoaded = false;
            await this.renderActiveTab();
            new Notice(`Loaded ${this.discoveredMonsters.length} creature statblocks!`);
        };

        // Search & Filter Controls
        const controls = root.createDiv({ cls: "dnd-compendium-controls" });
        const searchRow = controls.createDiv({ cls: "dnd-compendium-search-row" });

        const searchInput = searchRow.createEl("input", {
            type: "text",
            placeholder: `Search ${this.discoveredMonsters.length} creatures by name, type (Undead, Dragon, Fiend...), CR, or source book...`,
            value: this.monsterQuery,
            cls: "dnd-modal-form-input dnd-compendium-search-input"
        });

        const sourceSelect = searchRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        sourceSelect.createEl("option", { text: `All Sources (${this.discoveredMonsters.length})`, value: "all" });
        for (const src of this.monstersMeta.availableSources) {
            sourceSelect.createEl("option", {
                text: `${src.short} — ${src.full} (${src.count})`,
                value: `source::${src.code}`
            });
        }
        if (this.monstersMeta.vaultStatblockCount > 0) {
            sourceSelect.createEl("option", {
                text: `Vault Note Statblocks (${this.monstersMeta.vaultStatblockCount})`,
                value: "plugin::vault-note"
            });
        }
        sourceSelect.value = this.monsterSourceFilter;

        const allCrs = Array.from(new Set(this.discoveredMonsters.map(m => m.cr).filter(Boolean)))
            .sort((a, b) => parseCrNumericValue(a) - parseCrNumericValue(b));
        const crSelect = searchRow.createEl("select", {
            cls: "dnd-modal-form-input dnd-compendium-subfilter-select"
        });
        crSelect.createEl("option", { text: "All CRs", value: "all" });
        for (const cr of allCrs) {
            crSelect.createEl("option", { text: `CR ${cr}`, value: cr });
        }
        crSelect.value = this.monsterCrFilter;

        // Split Grid (or 2/3 & 1/3 Resizable Vertical Split in Sidebar)
        const { listPane, previewPane, setPreviewActive } = this.createMasterDetailSplitLayout(root, [statusBanner, controls]);

        const renderMonsterPreview = async (monster: DiscoveredMonster | null) => {
            previewPane.empty();
            setPreviewActive(Boolean(monster));
            if (!monster) {
                previewPane.createEl("p", {
                    text: "Select a creature to inspect its statblock, send it to the Initiative Tracker, or insert a ```statblock block into your active note.",
                    cls: "dnd-modal-preview-empty"
                });
                return;
            }

            // Action Toolbar
            const toolbar = previewPane.createDiv({ cls: "dnd-compendium-preview-toolbar dnd-monster-toolbar" });
            const spawnGroup = toolbar.createDiv({ cls: "dnd-monster-spawn-group" });
            const qtyInput = spawnGroup.createEl("input", {
                type: "number",
                value: "1",
                cls: "dnd-modal-form-input dnd-init-qty-input",
                attr: { min: "1", max: "20", title: "Quantity to add to Initiative" }
            });
            const addInitBtn = spawnGroup.createEl("button", {
                text: "Add to Initiative",
                cls: "dnd-dm-small-btn mod-cta"
            });
            addInitBtn.onclick = async () => {
                const qty = Math.max(1, Math.min(20, Number(qtyInput.value) || 1));
                this.spawnMonsterIntoInitiative(monster, qty);
                await this.saveInitiativeState();
                new Notice(`Rolled Initiative and added ${qty}x ${monster.name} (${monster.sourceShort}) to the Initiative Tracker!`);
            };

            const rightActions = toolbar.createDiv({ cls: "dnd-modal-preview-badges" });
            const insertBtn = rightActions.createEl("button", {
                text: "Insert statblock in Note",
                cls: "dnd-dm-small-btn"
            });
            insertBtn.onclick = async () => {
                const yamlBlock = "```statblock\n" + buildStatblockYaml(monster) + "\n```\n";
                const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (mdView && mdView.editor) {
                    mdView.editor.replaceSelection(yamlBlock);
                    new Notice(`Inserted "${monster.name} (${monster.sourceShort})" statblock into ${mdView.file?.basename || "active note"}!`);
                } else {
                    await navigator.clipboard.writeText(yamlBlock);
                    new Notice(`Copied "${monster.name}" statblock code block to clipboard (open a note in Editing view to insert directly).`);
                }
            };

            if (this.hostMode === "sidebar") {
                const closeBtn = rightActions.createEl("button", {
                    text: "✕",
                    cls: "dnd-modal-del-btn",
                    attr: { title: "Close preview" }
                });
                closeBtn.onclick = async () => {
                    this.selectedMonsterId = null;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    await renderMonsterPreview(null);
                };
            }

            const statblockWrap = previewPane.createDiv({ cls: "dnd-monster-preview-statblock" });
            await renderStatblockWithFallback(this.app, this.plugin, monster, statblockWrap, this.sourcePath, this.renderChild);
        };

        const updateMonsterList = async () => {
            const q = this.monsterQuery.trim().toLowerCase();
            const filtered = this.discoveredMonsters.filter(m => {
                if (this.monsterSourceFilter.startsWith("source::")) {
                    const targetCode = this.monsterSourceFilter.slice("source::".length);
                    if (m.sourceCode !== targetCode) return false;
                } else if (this.monsterSourceFilter.startsWith("plugin::")) {
                    const targetPlugin = this.monsterSourceFilter.slice("plugin::".length);
                    if (m.sourcePlugin !== targetPlugin) return false;
                }
                if (this.monsterCrFilter !== "all" && m.cr !== this.monsterCrFilter) return false;
                if (q) {
                    const hay = `${m.name} ${m.type} ${m.subtype || ""} cr ${m.cr} ${m.sourceShort} ${m.sourceCode} ${m.sourceFull}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });

            listPane.empty();
            listPane.createEl("div", {
                text: `${filtered.length} statblock${filtered.length === 1 ? "" : "s"} matching filters`,
                cls: "dnd-spell-count-banner"
            });

            if (filtered.length === 0) {
                listPane.createEl("p", {
                    text: "No creatures match your filters.",
                    cls: "dnd-modal-empty-text"
                });
                await renderMonsterPreview(null);
                return;
            }

            const displayList = filtered.slice(0, 250);
            if (this.hostMode === "sidebar") {
                if (this.selectedMonsterId && !displayList.some(m => m.id === this.selectedMonsterId)) {
                    this.selectedMonsterId = null;
                }
            } else if (!this.selectedMonsterId || !displayList.some(m => m.id === this.selectedMonsterId)) {
                this.selectedMonsterId = displayList[0].id;
            }

            for (const mon of displayList) {
                const isSelected = mon.id === this.selectedMonsterId;
                const row = listPane.createDiv({
                    cls: `dnd-modal-list-row dnd-compendium-row is-clickable ${isSelected ? "is-active" : ""}`.trim()
                });
                const left = row.createDiv({ cls: "dnd-modal-row-left" });
                left.createEl("span", { text: mon.name, cls: "dnd-modal-row-name" });
                left.createEl("span", {
                    text: `${mon.size} ${mon.type} • AC ${mon.ac} • HP ${mon.hp}`,
                    cls: "dnd-init-sub-hint"
                });

                const rightBadges = row.createDiv({ cls: "dnd-modal-row-badges" });
                if (mon.sourceShort) {
                    rightBadges.createEl("span", {
                        text: mon.sourceShort,
                        cls: "dnd-level-badge dnd-modal-badge-sm",
                        attr: { title: mon.sourceFull }
                    });
                }
                rightBadges.createEl("span", {
                    text: `CR ${mon.cr}`,
                    cls: "dnd-level-badge dnd-modal-badge-sm"
                });

                row.onclick = async () => {
                    if (this.hostMode === "sidebar" && this.selectedMonsterId === mon.id) {
                        this.selectedMonsterId = null;
                        row.removeClass("is-active");
                        await renderMonsterPreview(null);
                        return;
                    }
                    this.selectedMonsterId = mon.id;
                    listPane.querySelectorAll(".dnd-compendium-row").forEach(el => el.removeClass("is-active"));
                    row.addClass("is-active");
                    await renderMonsterPreview(mon);
                };
            }

            if (filtered.length > 250) {
                listPane.createEl("div", {
                    text: `Showing top 250 of ${filtered.length} matches. Use the search bar or source filter above to narrow results.`,
                    cls: "dnd-modal-empty-text"
                });
            }

            const activeMon = this.selectedMonsterId
                ? (displayList.find(m => m.id === this.selectedMonsterId) || null)
                : (this.hostMode === "sidebar" ? null : displayList[0]);
            await renderMonsterPreview(activeMon);
        };

        searchInput.oninput = () => {
            this.monsterQuery = searchInput.value;
            void updateMonsterList();
        };
        sourceSelect.onchange = () => {
            this.monsterSourceFilter = sourceSelect.value;
            void updateMonsterList();
        };
        crSelect.onchange = () => {
            this.monsterCrFilter = crSelect.value;
            void updateMonsterList();
        };

        await updateMonsterList();
    }
}

// ============================================================================
// --- DM TOOLS MODAL & DOCKABLE SIDEBAR VIEW ---
// ============================================================================

export class DMToolsModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    initialTab: DMToolsTabId;
    renderChild!: MarkdownRenderChild;
    widget!: DMToolsWidget;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, initialTab: DMToolsTabId = "compendium") {
        super(app);
        this.plugin = plugin;
        this.initialTab = initialTab;
    }

    async onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("dnd-dm-modal", "dnd-spellbook-modal");
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        const activeFile = this.app.workspace.getActiveFile();
        this.widget = new DMToolsWidget({
            app: this.app,
            plugin: this.plugin,
            containerEl: contentEl,
            renderChild: this.renderChild,
            hostMode: "modal",
            initialTab: this.initialTab,
            sourcePath: activeFile?.path || "",
            onRequestSwitchHost: async () => {
                const currentTab = this.widget.activeTab;
                this.close();
                await this.plugin.activateDMToolsSidebar(currentTab);
            }
        });

        await this.widget.render();
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

export class DMToolsSidebarView extends ItemView {
    plugin: DnDCharacterSheetHelperPlugin;
    activeTab: DMToolsTabId = "compendium";
    renderChild!: MarkdownRenderChild;
    widget?: DMToolsWidget;

    constructor(leaf: WorkspaceLeaf, plugin: DnDCharacterSheetHelperPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DM_TOOLS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "DnD DM Tools";
    }

    getIcon(): string {
        return DM_RIBBON_ICON_SVG ? "csh-dm-ribbon" : "shield";
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("dnd-dm-sidebar-view");

        this.renderChild = new MarkdownRenderChild(container);
        this.renderChild.load();

        const activeFile = this.app.workspace.getActiveFile();
        this.widget = new DMToolsWidget({
            app: this.app,
            plugin: this.plugin,
            containerEl: container,
            renderChild: this.renderChild,
            hostMode: "sidebar",
            initialTab: this.activeTab,
            sourcePath: activeFile?.path || "",
            onRequestSwitchHost: () => {
                const currentTab = this.widget?.activeTab || this.activeTab;
                new DMToolsModal(this.app, this.plugin, currentTab).open();
            }
        });

        await this.widget.render();
    }

    async setActiveTab(tab: DMToolsTabId) {
        this.activeTab = tab;
        if (this.widget) {
            await this.widget.setTab(tab);
        }
    }

    async onClose() {
        if (this.renderChild) this.renderChild.unload();
    }
}

// ============================================================================
// --- MARKDOWN CODE BLOCK PROCESSORS: ```dnd-initiative & ```dnd-party ---
// ============================================================================

export async function processDnDInitiativeBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    el.empty();
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);

    let parsed: Record<string, any> = {};
    try {
        parsed = parseBlockYaml(source);
    } catch {
        parsed = {};
    }

    const useNoteFrontmatterState = String(parsed.state || "").toLowerCase() === "note";
    let customState: InitiativeState | undefined;
    let onSaveCustom: ((st: InitiativeState) => Promise<void>) | undefined;

    if (useNoteFrontmatterState && ctx.sourcePath) {
        const cache = plugin.app.metadataCache.getCache(ctx.sourcePath);
        const fm = cache?.frontmatter || {};
        if (fm["DnD_initiativeState"]) {
            try {
                const rawState = typeof fm["DnD_initiativeState"] === "string"
                    ? JSON.parse(fm["DnD_initiativeState"])
                    : fm["DnD_initiativeState"];
                if (rawState && typeof rawState === "object" && Array.isArray(rawState.combatants)) {
                    customState = rawState as InitiativeState;
                }
            } catch {
                /* fallback to default */
            }
        }
        if (!customState) {
            customState = createDefaultInitiativeState();
        }
        onSaveCustom = async (st: InitiativeState) => {
            await plugin.updateCharacterFrontmatter(ctx.sourcePath, {
                "DnD_initiativeState": JSON.stringify(st)
            });
        };
    }

    const filterFolder = typeof parsed.folder === "string" ? parsed.folder.trim() : undefined;
    const filterPlayers = Array.isArray(parsed.players)
        ? parsed.players.map((p: any) => String(p))
        : (typeof parsed.players === "string" ? parseStringArray(parsed.players) : undefined);

    const widget = new DMToolsWidget({
        app: plugin.app,
        plugin,
        containerEl: el,
        renderChild: child,
        hostMode: "embed-initiative",
        initialTab: "initiative",
        sourcePath: ctx.sourcePath,
        embedFilterFolder: filterFolder,
        embedFilterPlayers: filterPlayers,
        customInitiativeState: customState,
        onSaveCustomInitiativeState: onSaveCustom
    });

    await widget.render();
}

export async function processDnDPartyBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    el.empty();
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);

    let parsed: Record<string, any> = {};
    try {
        parsed = parseBlockYaml(source);
    } catch {
        parsed = {};
    }

    const filterFolder = typeof parsed.folder === "string" ? parsed.folder.trim() : undefined;
    const filterPlayers = Array.isArray(parsed.players)
        ? parsed.players.map((p: any) => String(p))
        : (typeof parsed.players === "string" ? parseStringArray(parsed.players) : undefined);

    const widget = new DMToolsWidget({
        app: plugin.app,
        plugin,
        containerEl: el,
        renderChild: child,
        hostMode: "embed-party",
        initialTab: "party",
        sourcePath: ctx.sourcePath,
        embedFilterFolder: filterFolder,
        embedFilterPlayers: filterPlayers
    });

    await widget.render();
}
