import { App, MarkdownRenderChild, TFile, normalizePath } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../../main';
import { parseBlockYaml } from '../helpers';
import { toSlug } from '../../data';
import { abilityModFromScore, collectMarkdownFilesInFolder, formatSignedNumber } from './dm-tools-party';

export interface MonsterTraitEntry {
    name: string;
    desc: string;
    entries?: string[];
    displayAs?: string;
}

export interface DiscoveredMonster {
    id: string;
    name: string;
    sourcePlugin: "the-dm-compendium" | "fantasy-statblocks" | "vault-note" | "srd-builtin";
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
    if (code === "FS") {
        return { code: "FS", short: "Fantasy Statblocks", full: "Fantasy Statblocks Bestiary" };
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

function flattenMonsterEntryNode(node: any): string {
    if (node === undefined || node === null) return "";
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
        return String(node).trim();
    }
    if (Array.isArray(node)) {
        return node.map(flattenMonsterEntryNode).filter(Boolean).join("\n\n");
    }
    if (typeof node === "object") {
        const parts: string[] = [];
        if (typeof node.entry === "string" && node.entry.trim()) {
            parts.push(node.name ? `**${node.name}.** ${node.entry.trim()}` : node.entry.trim());
        } else if (node.name && !Array.isArray(node.entries) && !Array.isArray(node.items)) {
            const body = String(node.text ?? node.desc ?? node.description ?? "").trim();
            parts.push(body ? `**${node.name}.** ${body}` : `**${node.name}**`);
        }
        if (Array.isArray(node.entries)) {
            const inner = node.entries.map(flattenMonsterEntryNode).filter(Boolean).join("\n\n");
            if (inner) parts.push(node.name ? `**${node.name}.** ${inner}` : inner);
        }
        if (Array.isArray(node.items)) {
            const bullets = node.items
                .map((it: any) => {
                    const txt = flattenMonsterEntryNode(it);
                    return txt ? `- ${txt.replace(/\n+/g, " ")}` : "";
                })
                .filter(Boolean)
                .join("\n");
            if (bullets) parts.push(bullets);
        }
        if (Array.isArray(node.rows)) {
            const rowLines = node.rows
                .map((r: any) => Array.isArray(r) ? r.map(flattenMonsterEntryNode).join(" | ") : flattenMonsterEntryNode(r))
                .filter(Boolean)
                .join("\n");
            if (rowLines) parts.push(node.caption ? `**${node.caption}**\n${rowLines}` : rowLines);
        }
        if (parts.length > 0) return parts.join("\n\n");
        const direct = String(node.text ?? node.desc ?? node.description ?? node.special ?? "").trim();
        return direct;
    }
    return "";
}

function normalizeTraitArray(raw: any): MonsterTraitEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: MonsterTraitEntry[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const name = String(item.name || "").trim();
        const entriesArr = Array.isArray(item.entries)
            ? item.entries.map((e: any) => flattenMonsterEntryNode(e)).filter(Boolean)
            : [];
        const desc = entriesArr.length > 0
            ? entriesArr.join("\n\n")
            : flattenMonsterEntryNode(item.desc ?? item.description ?? item.text ?? "");
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

function parseStatScore(rawVal: any, fallback: number = 10): number {
    if (rawVal === undefined || rawVal === null || rawVal === "") return fallback;
    if (typeof rawVal === "number") return Number.isFinite(rawVal) ? rawVal : fallback;
    if (typeof rawVal === "object" && !Array.isArray(rawVal)) {
        return parseStatScore(rawVal.value ?? rawVal.score ?? rawVal.base, fallback);
    }
    const match = String(rawVal).trim().match(/^-?\d+/);
    if (!match) return fallback;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTextListField(rawVal: any): string | undefined {
    if (rawVal === undefined || rawVal === null || rawVal === "") return undefined;
    if (typeof rawVal === "string") {
        const s = rawVal.trim();
        return s || undefined;
    }
    if (Array.isArray(rawVal)) {
        const parts = rawVal
            .map(item => {
                if (typeof item === "string" || typeof item === "number") return String(item).trim();
                if (item && typeof item === "object") {
                    if (item.special) return String(item.special).trim();
                    if (Array.isArray(item.resist)) return item.resist.map((x: any) => String(x).trim()).filter(Boolean).join(", ");
                    if (Array.isArray(item.immune)) return item.immune.map((x: any) => String(x).trim()).filter(Boolean).join(", ");
                    if (Array.isArray(item.vulnerable)) return item.vulnerable.map((x: any) => String(x).trim()).filter(Boolean).join(", ");
                    if (Array.isArray(item.conditionImmune)) return item.conditionImmune.map((x: any) => String(x).trim()).filter(Boolean).join(", ");
                    return flattenMonsterEntryNode(item);
                }
                return "";
            })
            .filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : undefined;
    }
    if (typeof rawVal === "object") {
        const text = flattenMonsterEntryNode(rawVal);
        return text || undefined;
    }
    return String(rawVal).trim() || undefined;
}

function formatSavesOrSkillsField(rawVal: any): string | undefined {
    if (rawVal === undefined || rawVal === null || rawVal === "") return undefined;
    if (typeof rawVal === "string") return rawVal.trim() || undefined;

    const pairs: string[] = [];
    const pushObj = (obj: Record<string, any>) => {
        for (const [k, v] of Object.entries(obj)) {
            if (!k || v === undefined || v === null || v === "") continue;
            const num = Number(String(v).trim().replace(/^\+/, ""));
            const label = k.trim();
            const prettyKey = label.charAt(0).toUpperCase() + label.slice(1);
            pairs.push(Number.isFinite(num) ? `${prettyKey} ${formatSignedNumber(num)}` : `${prettyKey} ${String(v).trim()}`);
        }
    };

    if (Array.isArray(rawVal)) {
        for (const entry of rawVal) {
            if (typeof entry === "string" && entry.trim()) {
                pairs.push(entry.trim());
            } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
                pushObj(entry);
            }
        }
        return pairs.length > 0 ? pairs.join(", ") : undefined;
    }

    if (typeof rawVal === "object") {
        pushObj(rawVal);
        return pairs.length > 0 ? pairs.join(", ") : undefined;
    }

    return String(rawVal).trim() || undefined;
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
        const ab = raw.abilities;
        stats = [
            parseStatScore(ab.str ?? ab.STR ?? ab.strength ?? ab.Strength),
            parseStatScore(ab.dex ?? ab.DEX ?? ab.dexterity ?? ab.Dexterity),
            parseStatScore(ab.con ?? ab.CON ?? ab.constitution ?? ab.Constitution),
            parseStatScore(ab.int ?? ab.INT ?? ab.intelligence ?? ab.Intelligence),
            parseStatScore(ab.wis ?? ab.WIS ?? ab.wisdom ?? ab.Wisdom),
            parseStatScore(ab.cha ?? ab.CHA ?? ab.charisma ?? ab.Charisma)
        ];
    } else if (Array.isArray(raw.stats) && raw.stats.length >= 6) {
        stats = [
            parseStatScore(raw.stats[0]),
            parseStatScore(raw.stats[1]),
            parseStatScore(raw.stats[2]),
            parseStatScore(raw.stats[3]),
            parseStatScore(raw.stats[4]),
            parseStatScore(raw.stats[5])
        ];
    } else if (
        raw.strength !== undefined || raw.str !== undefined || raw.STR !== undefined ||
        raw.dexterity !== undefined || raw.dex !== undefined || raw.DEX !== undefined
    ) {
        stats = [
            parseStatScore(raw.strength ?? raw.Strength ?? raw.str ?? raw.STR),
            parseStatScore(raw.dexterity ?? raw.Dexterity ?? raw.dex ?? raw.DEX),
            parseStatScore(raw.constitution ?? raw.Constitution ?? raw.con ?? raw.CON),
            parseStatScore(raw.intelligence ?? raw.Intelligence ?? raw.int ?? raw.INT),
            parseStatScore(raw.wisdom ?? raw.Wisdom ?? raw.wis ?? raw.WIS),
            parseStatScore(raw.charisma ?? raw.Charisma ?? raw.cha ?? raw.CHA)
        ];
    }

    const dexMod = abilityModFromScore(stats[1]);

    // Armor Class (supports The DM Compendium's `armorClass`, 5e/YAML `ac` / `armor_class`, objects & arrays)
    let acNum = 10;
    let acText = "10";
    const rawAcVal = raw.armorClass ?? raw.ac ?? raw.armor_class;
    if (typeof rawAcVal === "number") {
        acNum = rawAcVal;
        acText = String(rawAcVal);
    } else if (typeof rawAcVal === "string" && rawAcVal.trim()) {
        acText = rawAcVal.trim();
        const m = acText.match(/^(\d+)/) || acText.match(/\d+/);
        acNum = m ? Number(m[0]) : 10;
    } else if (Array.isArray(rawAcVal) && rawAcVal.length > 0) {
        const firstAc = rawAcVal[0];
        if (typeof firstAc === "number") {
            acNum = firstAc;
            acText = String(firstAc);
        } else if (typeof firstAc === "string" && firstAc.trim()) {
            acText = firstAc.trim();
            const m = acText.match(/\d+/);
            acNum = m ? Number(m[0]) : 10;
        } else if (firstAc && typeof firstAc === "object") {
            acNum = Number(firstAc.ac ?? firstAc.value ?? 10) || 10;
            const fromStr = Array.isArray(firstAc.from) ? firstAc.from.join(", ") : (firstAc.condition || firstAc.special || "");
            acText = fromStr ? `${acNum} (${fromStr})` : String(acNum);
        }
    } else if (rawAcVal && typeof rawAcVal === "object") {
        acNum = Number(rawAcVal.ac ?? rawAcVal.value ?? 10) || 10;
        const fromStr = Array.isArray(rawAcVal.from) ? rawAcVal.from.join(", ") : (rawAcVal.special || "");
        acText = fromStr ? `${acNum} (${fromStr})` : String(acNum);
    }

    // Hit Points & Hit Dice (supports numbers, `"66 (12d8 + 12)"`, and `{ average, formula }` objects)
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
    } else if (rawHpVal && typeof rawHpVal === "object" && !Array.isArray(rawHpVal)) {
        const avg = Number(rawHpVal.average ?? rawHpVal.value ?? rawHpVal.hp);
        const formula = rawHpVal.formula ? String(rawHpVal.formula).trim() : (rawHpVal.special ? String(rawHpVal.special).trim() : "");
        if (Number.isFinite(avg) && avg > 0) {
            hpNum = Math.max(1, Math.round(avg));
            hpText = formula ? `${hpNum} (${formula})` : String(hpNum);
            if (!hitDice && formula) hitDice = formula;
        } else if (formula) {
            hpText = formula;
        }
    }

    // Speed
    let speedStr = "30 ft.";
    if (typeof raw.speed === "string" && raw.speed.trim()) {
        speedStr = raw.speed.trim().replace(/\bwalk\s+/gi, "");
    } else if (raw.speed && typeof raw.speed === "object" && !Array.isArray(raw.speed)) {
        const speedEntries = Object.entries(raw.speed)
            .map(([k, v]) => {
                const valText = (v && typeof v === "object")
                    ? String((v as any).number ?? (v as any).value ?? flattenMonsterEntryNode(v))
                    : String(v);
                return k === "walk" ? `${valText}` : `${k} ${valText}`;
            })
            .filter(Boolean);
        if (speedEntries.length > 0) speedStr = speedEntries.join(", ");
    } else if (Array.isArray(raw.speed)) {
        const joined = formatTextListField(raw.speed);
        if (joined) speedStr = joined;
    }

    // Challenge Rating
    const rawCrVal = raw.challengeRating ?? raw.cr ?? raw.challenge_rating;
    const crStr = (rawCrVal !== undefined && rawCrVal !== null && String(rawCrVal).trim() !== "")
        ? (typeof rawCrVal === "object" ? String((rawCrVal as any).cr ?? "—").trim() : String(rawCrVal).trim())
        : "—";

    const { type, subtype } = splitMonsterTypeAndSubtype(raw.type, raw.subtype);
    const rawSourceVal = Array.isArray(raw.source) ? raw.source[0] : (raw.sourceKey || raw.source);
    const hasExplicitSource = rawSourceVal !== undefined && rawSourceVal !== null && String(rawSourceVal).trim() !== "";
    const srcInfo = resolveDmCompendiumSourceInfo(rawSourceVal);
    let sourceCode = "SRD";
    let sourceShort = fallbackSourceLabel;
    let sourceFull = fallbackSourceLabel;
    let sourceLabel = fallbackSourceLabel;
    if (sourcePlugin === "the-dm-compendium") {
        sourceCode = srcInfo.code;
        sourceShort = srcInfo.short;
        sourceFull = srcInfo.full;
        sourceLabel = srcInfo.short;
    } else if (sourcePlugin === "fantasy-statblocks") {
        sourceCode = hasExplicitSource ? srcInfo.code : "FS";
        sourceShort = hasExplicitSource ? srcInfo.short : "FS";
        sourceFull = hasExplicitSource ? srcInfo.full : fallbackSourceLabel;
        sourceLabel = hasExplicitSource ? srcInfo.short : "FS";
    } else if (sourcePlugin === "vault-note") {
        sourceCode = "VAULT";
    }

    const savesStr = formatSavesOrSkillsField(raw.savingThrows ?? raw.saves ?? raw.save);
    const skillsStr = formatSavesOrSkillsField(raw.skills ?? raw.skillsaves ?? raw.skill);
    const vulnStr = formatTextListField(raw.damageVulnerabilities ?? raw.damage_vulnerabilities ?? raw.vulnerable);
    const resStr = formatTextListField(raw.damageResistances ?? raw.damage_resistances ?? raw.resist);
    const immStr = formatTextListField(raw.damageImmunities ?? raw.damage_immunities ?? raw.immune);
    const condImmStr = formatTextListField(raw.conditionImmunities ?? raw.condition_immunities ?? raw.conditionImmune);
    const sensesStr = formatTextListField(raw.senses);
    const languagesStr = formatTextListField(raw.languages);
    const rawSize = Array.isArray(raw.size) ? raw.size[0] : raw.size;

    return {
        id: `${sourcePlugin}::${toSlug(sourceCode)}::${toSlug(name)}`,
        name,
        sourcePlugin,
        sourceCode,
        sourceShort,
        sourceFull,
        sourceLabel,
        page: raw.page !== undefined && raw.page !== "" ? raw.page : undefined,
        size: String(rawSize || "Medium").trim(),
        type,
        subtype,
        alignment: formatTextListField(raw.alignment) || "Unaligned",
        ac: acNum,
        acText,
        hp: hpNum,
        hpText,
        hitDice,
        speed: speedStr,
        stats,
        dexMod,
        cr: crStr,
        senses: sensesStr,
        languages: languagesStr,
        saves: savesStr,
        skills: skillsStr,
        vulnerabilities: vulnStr,
        resistances: resStr,
        immunities: immStr,
        conditionImmunities: condImmStr,
        environment: Array.isArray(raw.environment) ? raw.environment.map((e: any) => String(e).trim()).filter(Boolean) : undefined,
        traits: normalizeTraitArray(raw.traits ?? raw.special_abilities ?? raw.trait),
        spellcasting: normalizeTraitArray(raw.spellcasting),
        actions: normalizeTraitArray(raw.actions ?? raw.action),
        bonusActions: normalizeTraitArray(raw.bonusActions ?? raw.bonus_actions ?? raw.bonus),
        reactions: normalizeTraitArray(raw.reactions ?? raw.reaction),
        legendaryActions: normalizeTraitArray(raw.legendaryActions ?? raw.legendary_actions ?? raw.legendary),
        mythicActions: normalizeTraitArray(raw.mythicActions ?? raw.mythic_actions ?? raw.mythic),
        lairActions: normalizeTraitArray(raw.lairActions ?? raw.lair_actions),
        rawYaml
    };
}

const SAVE_KEY_MAP: Record<string, string> = {
    str: "strength",
    strength: "strength",
    dex: "dexterity",
    dexterity: "dexterity",
    con: "constitution",
    constitution: "constitution",
    int: "intelligence",
    intelligence: "intelligence",
    wis: "wisdom",
    wisdom: "wisdom",
    cha: "charisma",
    charisma: "charisma"
};

function formatColonSeparatedPairsYaml(rawStr: string | undefined, keyMap: Record<string, string> = {}): string {
    if (!rawStr || !rawStr.trim()) return " []";
    const pairs: [string, string | number][] = [];
    for (const part of rawStr.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        let rawKey = "";
        let rawVal = "";
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx !== -1) {
            rawKey = trimmed.slice(0, colonIdx).trim();
            rawVal = trimmed.slice(colonIdx + 1).trim();
        } else {
            // Also accept space-separated format such as `"Dex +6"` or `"Animal Handling +4"`
            const spaceMatch = trimmed.match(/^([A-Za-z][A-Za-z\s'-]*?)\s+([+-]?\d+)$/);
            if (!spaceMatch) continue;
            rawKey = spaceMatch[1].trim();
            rawVal = spaceMatch[2].trim();
        }
        if (!rawKey || !rawVal) continue;
        const cleanKey = rawKey.toLowerCase();
        const mappedKey = keyMap[cleanKey] ?? cleanKey;
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
 * Generates a `statblock` YAML block compatible with Fantasy Statblocks / "The DM Compendium".
 */
export function buildStatblockYaml(monster: DiscoveredMonster): string {
    if (monster.rawYaml && monster.rawYaml.trim()) {
        return monster.rawYaml.trim();
    }
    const c = (val: any) => (val === undefined || val === null || val === "") ? '""' : JSON.stringify(String(val));
    const j = (val: any) => (typeof val === "number" ? String(val) : c(val));
    const stripHitDiceMod = (hd?: string) => hd ? hd.replace(/\s*[+-]\s*\d+$/, "").trim() : "";
    const safeImageStem = monster.name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "creature";

    const lines: string[] = [
        `layout: Basic 5e Layout`,
        `name: ${c(monster.name)}`,
        `image: [[${safeImageStem}.jpg]]`,
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
        `damage_vulnerabilities: ${c(monster.vulnerabilities || "")}`,
        `damage_resistances: ${c(monster.resistances || "")}`,
        `damage_immunities: ${c(monster.immunities || "")}`,
        `condition_immunities: ${c(monster.conditionImmunities || "")}`,
        `cr: ${c(monster.cr)}`,
        `traits:${formatTraitsBlockYaml(monster.traits)}`,
        `actions:${formatTraitsBlockYaml(monster.actions)}`,
        `bonus_actions:${formatTraitsBlockYaml(monster.bonusActions)}`,
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

interface BestiaryCacheEntry {
    bestiaryPath: string;
    mtime: number;
    size: number;
    includedKey: string;
    monsters: DiscoveredMonster[];
    sourceCounts: [string, number][];
}

let cachedBestiary: BestiaryCacheEntry | null = null;

export function clearDiscoveredMonstersCache(): void {
    cachedBestiary = null;
}

/**
 * Discovers monsters from "The DM Compendium" (`the-dm-compendium/cache/bestiary.json`),
 * optional loaded Fantasy Statblocks bestiary entries (`obsidian-5e-statblocks`),
 * and scoped Markdown notes containing `statblock` code blocks (the active note and an optional configured folder),
 * falling back to built-in presets only when external bestiaries are empty.
 */
export async function discoverExternalMonsters(
    app: App,
    forceReload: boolean = false,
    statblocksFolderPath: string = ""
): Promise<{
    monsters: DiscoveredMonster[];
    hasDmCompendium: boolean;
    dmCompendiumCount: number;
    fantasyStatblocksCount: number;
    vaultStatblockCount: number;
    availableSources: { code: string; short: string; full: string; count: number }[];
}> {
    if (forceReload) {
        clearDiscoveredMonstersCache();
    }

    const pluginsObj = (app as any).plugins;
    const enabledSet: Set<string> | undefined = pluginsObj?.enabledPlugins;
    const tdcPlugin = pluginsObj?.plugins?.["the-dm-compendium"];
    let hasDmCompendium = Boolean(enabledSet?.has?.("the-dm-compendium") || tdcPlugin);

    const discoveredMap = new Map<string, DiscoveredMonster>();
    let dmCompendiumCount = 0;
    const sourceCounts = new Map<string, number>();

    // 1. Primary Source: The DM Compendium (.obsidian/plugins/the-dm-compendium/cache/bestiary.json)
    try {
        if (forceReload && tdcPlugin && typeof tdcPlugin.ensureDatabaseCache === "function") {
            try {
                await tdcPlugin.ensureDatabaseCache();
            } catch {
                /* ignore if offline and cache already exists */
            }
        } else if (!forceReload && !cachedBestiary && tdcPlugin && typeof tdcPlugin.ensureDatabaseCache === "function") {
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
            const includedKey = includedSourcesSet ? Array.from(includedSourcesSet).sort().join(",") : "*";
            const statFn = (app.vault.adapter as any).stat;
            const fileStat = typeof statFn === "function" ? await statFn.call(app.vault.adapter, bestiaryPath) : null;
            const mtime = Number(fileStat?.mtime || 0);
            const size = Number(fileStat?.size || 0);

            if (
                !forceReload &&
                cachedBestiary &&
                cachedBestiary.bestiaryPath === bestiaryPath &&
                cachedBestiary.includedKey === includedKey &&
                (mtime === 0 || (cachedBestiary.mtime === mtime && cachedBestiary.size === size))
            ) {
                for (const mon of cachedBestiary.monsters) {
                    if (!discoveredMap.has(mon.id)) {
                        discoveredMap.set(mon.id, mon);
                        dmCompendiumCount++;
                    }
                }
                for (const [code, cnt] of cachedBestiary.sourceCounts) {
                    sourceCounts.set(code, cnt);
                }
            } else {
                const rawText = await app.vault.adapter.read(bestiaryPath);
                const parsedJson = JSON.parse(rawText);
                const items: any[] = Array.isArray(parsedJson) ? parsedJson : [];
                const parsedMonsters: DiscoveredMonster[] = [];

                for (const item of items) {
                    if (!item || typeof item !== "object" || !item.name) continue;
                    const itemSource = String(item.sourceKey || item.source || "").trim().toUpperCase();
                    if (includedSourcesSet && itemSource && !includedSourcesSet.has(itemSource)) {
                        continue;
                    }
                    const mon = normalizeMonsterRecord(item, "the-dm-compendium", "The DM Compendium");
                    if (mon && !discoveredMap.has(mon.id)) {
                        discoveredMap.set(mon.id, mon);
                        parsedMonsters.push(mon);
                        dmCompendiumCount++;
                        sourceCounts.set(mon.sourceCode, (sourceCounts.get(mon.sourceCode) || 0) + 1);
                    }
                }

                cachedBestiary = {
                    bestiaryPath,
                    mtime,
                    size,
                    includedKey,
                    monsters: parsedMonsters,
                    sourceCounts: Array.from(sourceCounts.entries())
                };
            }
        }
    } catch (e) {
        console.warn("DnD Plugin: Could not read The DM Compendium bestiary cache", e);
    }

    // 2. Secondary Source A: Fantasy Statblocks in-memory bestiary (when plugin is loaded)
    let fantasyStatblocksCount = 0;
    try {
        const fsPlugin = pluginsObj?.plugins?.["obsidian-5e-statblocks"];
        if (fsPlugin) {
            let fsRawEntries: any[] = [];
            if (typeof fsPlugin.getBestiaryCreatures === "function") {
                const res = fsPlugin.getBestiaryCreatures();
                if (Array.isArray(res)) fsRawEntries = res;
                else if (res && typeof res[Symbol.iterator] === "function") fsRawEntries = Array.from(res);
            } else if (fsPlugin.bestiary instanceof Map) {
                fsRawEntries = Array.from(fsPlugin.bestiary.values());
            } else if (Array.isArray(fsPlugin.bestiary)) {
                fsRawEntries = fsPlugin.bestiary;
            } else if (fsPlugin.bestiary && typeof fsPlugin.bestiary[Symbol.iterator] === "function") {
                fsRawEntries = Array.from(fsPlugin.bestiary);
            } else if (Array.isArray(fsPlugin.data?.monsters)) {
                fsRawEntries = fsPlugin.data.monsters;
            }

            for (const item of fsRawEntries) {
                if (!item || typeof item !== "object" || !item.name) continue;
                const mon = normalizeMonsterRecord(item, "fantasy-statblocks", "Fantasy Statblocks Bestiary");
                if (mon && !discoveredMap.has(mon.id)) {
                    discoveredMap.set(mon.id, mon);
                    fantasyStatblocksCount++;
                    sourceCounts.set(mon.sourceCode, (sourceCounts.get(mon.sourceCode) || 0) + 1);
                }
            }
        }
    } catch (e) {
        console.warn("DnD Plugin: Could not read Fantasy Statblocks bestiary", e);
    }

    // 3. Secondary Source B: Scoped Markdown Notes (active .md note + configured Statblocks folder) for ```statblock YAML blocks
    let vaultStatblockCount = 0;
    const scopedMdFiles: TFile[] = [];
    const seenScopedPaths = new Set<string>();
    const pushScopedMdFile = (f: any) => {
        if (f && f.extension === "md" && typeof f.path === "string" && !seenScopedPaths.has(f.path)) {
            seenScopedPaths.add(f.path);
            scopedMdFiles.push(f as TFile);
        }
    };

    const activeFile = app.workspace?.getActiveFile?.();
    pushScopedMdFile(activeFile);

    const trimmedFolder = typeof statblocksFolderPath === "string" ? statblocksFolderPath.trim() : "";
    if (trimmedFolder) {
        for (const f of collectMarkdownFilesInFolder(app, trimmedFolder)) {
            pushScopedMdFile(f);
        }
    }

    const candidateFiles = scopedMdFiles.filter(file => {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache || !Array.isArray(cache.sections)) return true; // Keep unindexed notes & minimal test mocks
        return cache.sections.some(sec => sec.type === "code");
    });

    const statblockRegex = /```statblock[ \t]*\r?\n([\s\S]*?)```/g;
    const CHUNK_SIZE = 25;
    for (let start = 0; start < candidateFiles.length; start += CHUNK_SIZE) {
        const chunk = candidateFiles.slice(start, start + CHUNK_SIZE);
        const contents = await Promise.all(
            chunk.map(async file => {
                try {
                    const content = await app.vault.cachedRead(file);
                    return { file, content };
                } catch {
                    return { file, content: "" };
                }
            })
        );

        for (const { file, content } of contents) {
            if (!content || !content.includes("```statblock")) continue;
            statblockRegex.lastIndex = 0;
            let match: RegExpExecArray | null;
            let blockIdx = 0;
            while ((match = statblockRegex.exec(content)) !== null) {
                const rawYamlBody = match[1];
                const sanitizedYaml = rawYamlBody.replace(/\t/g, "  ");
                try {
                    const parsedYaml = parseBlockYaml(sanitizedYaml);
                    const mon = normalizeMonsterRecord(
                        parsedYaml,
                        "vault-note",
                        `Note: ${file.basename}`,
                        rawYamlBody
                    );
                    if (mon) {
                        const key = `vault-note::${toSlug(file.path)}::${toSlug(mon.name)}${blockIdx > 0 ? `::${blockIdx}` : ""}`;
                        mon.id = key;
                        if (!discoveredMap.has(key)) {
                            discoveredMap.set(key, mon);
                            vaultStatblockCount++;
                        }
                        blockIdx++;
                    }
                } catch {
                    /* ignore malformed YAML block */
                }
            }
        }
    }

    // 4. Only fall back to built-in SRD presets if no external bestiary entries were loaded
    if (dmCompendiumCount === 0 && fantasyStatblocksCount === 0) {
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
        fantasyStatblocksCount,
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
