export interface ColorTheme {
  name: string;
  isDynamic?: boolean;
  colors: {
    colorBgPrimary: string;
    colorBgSecondary: string;
    colorBgTertiary: string;
    colorBgHover: string;
    colorBgDarker: string;
    colorBgGroup: string;
    colorBgProficient: string;

    colorTextPrimary: string;
    colorTextSecondary: string;
    colorTextSublabel: string;
    colorTextBright: string;
    colorTextMuted: string;
    colorTextGroup: string;

    colorBorderPrimary: string;
    colorBorderActive: string;
    colorBorderFocus: string;

    colorAccentTeal: string;
    colorAccentRed: string;
    colorAccentPurple: string;
  };
}

export type ThemeColors = ColorTheme["colors"];

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(c: RgbaColor): string {
  const toHex = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function parseComputedRgbString(raw: string): RgbaColor | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  // Matches "rgb(r, g, b)", "rgba(r, g, b, a)", or CSS Color 4 "rgb(r g b / a)"
  const m = s.match(/^rgba?\(\s*([0-9.]+%?)[,\s]+([0-9.]+%?)[,\s]+([0-9.]+%?)(?:[,/\s]+([0-9.]+%?))?\s*\)$/);
  if (!m) return null;

  const parseChannel = (token: string): number => {
    if (token.endsWith("%")) return (parseFloat(token) / 100) * 255;
    return parseFloat(token);
  };
  let alpha = 1;
  if (m[4] !== undefined) {
    alpha = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  }
  if (!isFinite(alpha)) alpha = 1;
  return {
    r: clampByte(parseChannel(m[1])),
    g: clampByte(parseChannel(m[2])),
    b: clampByte(parseChannel(m[3])),
    a: Math.max(0, Math.min(1, alpha)),
  };
}

function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const a = fg.a;
  if (a >= 0.999) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  if (a <= 0.001) return { r: bg.r, g: bg.g, b: bg.b, a: 1 };
  return {
    r: clampByte(fg.r * a + bg.r * (1 - a)),
    g: clampByte(fg.g * a + bg.g * (1 - a)),
    b: clampByte(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

function mixRgb(a: RgbaColor, b: RgbaColor, weightB: number): RgbaColor {
  const t = Math.max(0, Math.min(1, weightB));
  return {
    r: clampByte(a.r * (1 - t) + b.r * t),
    g: clampByte(a.g * (1 - t) + b.g * t),
    b: clampByte(a.b * (1 - t) + b.b * t),
    a: 1,
  };
}

function colorDistance(a: RgbaColor, b: RgbaColor): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function relativeLuminance(c: RgbaColor): number {
  const linear = (ch: number) => {
    const s = clampByte(ch) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

function contrastRatio(a: RgbaColor, b: RgbaColor): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureReadableContrast(fg: RgbaColor, bg: RgbaColor, fallbackTarget: RgbaColor, minRatio: number): RgbaColor {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  let current = fg;
  for (let step = 0.15; step <= 1.0; step += 0.15) {
    current = mixRgb(fg, fallbackTarget, step);
    if (contrastRatio(current, bg) >= minRatio) return current;
  }
  return fallbackTarget;
}

const OBSIDIAN_FALLBACK_COLORS: ThemeColors = {
  colorBgPrimary: "#1e1e1e",
  colorBgSecondary: "#262626",
  colorBgTertiary: "#2f2f2f",
  colorBgHover: "#363636",
  colorBgDarker: "#171717",
  colorBgGroup: "#2b2838",
  colorBgProficient: "#262334",

  colorTextPrimary: "#dadada",
  colorTextSecondary: "#a882ff",
  colorTextSublabel: "#9ab2bf",
  colorTextBright: "#ffffff",
  colorTextMuted: "#b3b3b3",
  colorTextGroup: "#a882ff",

  colorBorderPrimary: "#363636",
  colorBorderActive: "#8a5cf5",
  colorBorderFocus: "rgba(138, 92, 245, 0.45)",

  colorAccentTeal: "#53dfdd",
  colorAccentRed: "#fb464c",
  colorAccentPurple: "#a882ff",
};

/**
 * Samples Obsidian's active CSS variables from `doc.body` (supporting Default, Community Themes,
 * Dark/Light modes, Accent overrides, and custom CSS snippets) and resolves them into concrete
 * plugin ThemeColors without creating circular CSS custom property references.
 */
export function generateObsidianThemeColors(doc?: Document): ThemeColors {
  const targetDoc = doc || (typeof document !== "undefined" ? document : undefined);
  const body = targetDoc?.body;
  const win = targetDoc?.defaultView || (typeof window !== "undefined" ? window : undefined);

  if (!targetDoc || !body || !win || typeof targetDoc.createElement !== "function" || typeof win.getComputedStyle !== "function") {
    return { ...OBSIDIAN_FALLBACK_COLORS };
  }

  const probe = targetDoc.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.width = "0";
  probe.style.height = "0";
  body.appendChild(probe);

  try {
    const resolveColor = (cssExpr: string): RgbaColor | null => {
      try {
        probe.style.color = "";
        probe.style.color = cssExpr;
        if (!probe.style.color) return null;
        const computed = win.getComputedStyle(probe).color;
        return parseComputedRgbString(computed);
      } catch {
        return null;
      }
    };

    const pickFirst = (exprs: string[]): RgbaColor | null => {
      for (const expr of exprs) {
        const parsed = resolveColor(expr);
        if (parsed && parsed.a > 0.005) return parsed;
      }
      return null;
    };

    const pickFirstWithAlpha = (exprs: string[]): RgbaColor | null => {
      for (const expr of exprs) {
        const parsed = resolveColor(expr);
        if (parsed) return parsed;
      }
      return null;
    };

    const isLightClass = body.classList.contains("theme-light") && !body.classList.contains("theme-dark");
    const defaultBackdrop: RgbaColor = isLightClass
      ? { r: 255, g: 255, b: 255, a: 1 }
      : { r: 30, g: 30, b: 30, a: 1 };

    // 1. Background Primary
    const rawBgPrimary = pickFirst(["var(--background-primary)", "var(--color-base-00)"]);
    const bgPrimary = rawBgPrimary ? compositeOver(rawBgPrimary, defaultBackdrop) : defaultBackdrop;
    const isLightBg = relativeLuminance(bgPrimary) > 0.45;
    const whiteRgb: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
    const blackRgb: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
    const contrastTargetText: RgbaColor = isLightBg ? blackRgb : whiteRgb;
    const shiftDirectionTarget: RgbaColor = isLightBg ? blackRgb : whiteRgb;

    // 2. Primary Text & Bright Text
    const rawTextNormal = pickFirst(["var(--text-normal)", "var(--color-base-100)"]);
    const textPrimary = rawTextNormal
      ? compositeOver(rawTextNormal, bgPrimary)
      : (isLightBg ? { r: 34, g: 34, b: 34, a: 1 } : { r: 218, g: 218, b: 218, a: 1 });

    const rawTextBright = pickFirst(["var(--h1-color)", "var(--bold-color)"]);
    const candidateBright = rawTextBright ? compositeOver(rawTextBright, bgPrimary) : null;
    const textBright = (candidateBright && colorDistance(candidateBright, textPrimary) >= 12 && contrastRatio(candidateBright, bgPrimary) >= 4.5)
      ? candidateBright
      : mixRgb(textPrimary, contrastTargetText, 0.35);

    // 3. Background Secondary & Tertiary
    const rawBgSecondary = pickFirst(["var(--background-secondary)", "var(--background-primary-alt)", "var(--color-base-20)"]);
    let bgSecondary = rawBgSecondary ? compositeOver(rawBgSecondary, bgPrimary) : mixRgb(bgPrimary, shiftDirectionTarget, 0.05);
    if (colorDistance(bgSecondary, bgPrimary) < 8) {
      const altBg = pickFirst(["var(--background-primary-alt)", "var(--color-base-20)"]);
      const compAlt = altBg ? compositeOver(altBg, bgPrimary) : null;
      bgSecondary = (compAlt && colorDistance(compAlt, bgPrimary) >= 8)
        ? compAlt
        : mixRgb(bgPrimary, shiftDirectionTarget, 0.06);
    }

    const rawBgTertiary = pickFirst(["var(--background-secondary-alt)", "var(--color-base-25)"]);
    let bgTertiary = rawBgTertiary ? compositeOver(rawBgTertiary, bgSecondary) : mixRgb(bgSecondary, shiftDirectionTarget, 0.06);
    if (colorDistance(bgTertiary, bgSecondary) < 8) {
      bgTertiary = mixRgb(bgSecondary, contrastTargetText, 0.07);
    }

    // 4. Hover Background
    const rawBgHover = pickFirstWithAlpha(["var(--background-modifier-hover)", "var(--interactive-hover)"]);
    let bgHover = rawBgHover && rawBgHover.a > 0.01
      ? compositeOver(rawBgHover, bgSecondary)
      : mixRgb(bgSecondary, contrastTargetText, 0.09);
    if (colorDistance(bgHover, bgSecondary) < 6) {
      bgHover = mixRgb(bgSecondary, contrastTargetText, 0.09);
    }

    // 5. Darker / Inset Surface (inputs, previews, stat cells)
    const bgAltRaw = pickFirst(["var(--background-primary-alt)", "var(--color-base-10)"]);
    const formFieldRaw = pickFirstWithAlpha(["var(--background-modifier-form-field)"]);
    const bgAltComp = bgAltRaw ? compositeOver(bgAltRaw, bgPrimary) : null;
    const formFieldComp = formFieldRaw && formFieldRaw.a > 0.02 ? compositeOver(formFieldRaw, bgPrimary) : null;
    let bgDarker = (bgAltComp && colorDistance(bgAltComp, bgPrimary) >= 8)
      ? bgAltComp
      : (formFieldComp && colorDistance(formFieldComp, bgPrimary) >= 6 ? formFieldComp : mixRgb(bgPrimary, blackRgb, isLightBg ? 0.05 : 0.18));

    // 6. Active & Accent Colors from Obsidian
    const rawAccent = pickFirst(["var(--interactive-accent)", "var(--color-accent)", "var(--text-accent)"]);
    const accentRgb = rawAccent ? compositeOver(rawAccent, bgPrimary) : { r: 138, g: 92, b: 245, a: 1 };

    const rawTagBg = pickFirstWithAlpha(["var(--tag-background)"]);
    const bgGroup = (rawTagBg && rawTagBg.a > 0.02)
      ? compositeOver(rawTagBg, bgSecondary)
      : mixRgb(bgSecondary, accentRgb, 0.16);

    const rawSelectedBg = pickFirstWithAlpha(["var(--nav-item-background-selected)", "var(--text-selection)"]);
    let bgProficient = (rawSelectedBg && rawSelectedBg.a > 0.02)
      ? compositeOver(rawSelectedBg, bgPrimary)
      : mixRgb(bgPrimary, accentRgb, 0.14);
    if (colorDistance(bgProficient, bgPrimary) < 7) {
      bgProficient = mixRgb(bgPrimary, accentRgb, 0.14);
    }

    // 7. Muted, Group, Secondary, Sublabel Text
    const rawTextMuted = pickFirst(["var(--text-muted)", "var(--text-faint)", "var(--color-base-70)"]);
    const textMuted = rawTextMuted
      ? ensureReadableContrast(compositeOver(rawTextMuted, bgPrimary), bgPrimary, textPrimary, 3.0)
      : mixRgb(textPrimary, bgPrimary, 0.3);

    const rawTextAccent = pickFirst(["var(--text-accent)", "var(--link-color)", "var(--interactive-accent)"]);
    const textGroupRaw = rawTextAccent ? compositeOver(rawTextAccent, bgSecondary) : accentRgb;
    const textGroup = ensureReadableContrast(textGroupRaw, bgSecondary, textBright, 3.3);

    const rawH4Color = pickFirst(["var(--h4-color)", "var(--h3-color)"]);
    const h4Comp = rawH4Color ? compositeOver(rawH4Color, bgPrimary) : null;
    const textSecondaryRaw = (h4Comp && colorDistance(h4Comp, textPrimary) >= 14)
      ? h4Comp
      : mixRgb(textPrimary, textGroup, 0.55);
    const textSecondary = ensureReadableContrast(textSecondaryRaw, bgSecondary, textPrimary, 3.6);

    // 8. Borders
    const rawBorder = pickFirstWithAlpha(["var(--background-modifier-border)", "var(--divider-color)"]);
    let borderPrimary = (rawBorder && rawBorder.a > 0.02)
      ? compositeOver(rawBorder, bgPrimary)
      : mixRgb(bgPrimary, textPrimary, 0.18);
    if (colorDistance(borderPrimary, bgPrimary) < 8) {
      borderPrimary = mixRgb(bgPrimary, textPrimary, 0.2);
    }

    const rawBorderActive = pickFirst(["var(--interactive-accent)", "var(--background-modifier-border-focus)"]);
    const borderActive = rawBorderActive ? compositeOver(rawBorderActive, bgPrimary) : accentRgb;

    // 9. Semantic Accents (Teal, Red, Purple)
    const rawTeal = pickFirst(["var(--color-cyan)", "var(--color-green)"]);
    const accentTeal = ensureReadableContrast(
      rawTeal ? compositeOver(rawTeal, bgPrimary) : accentRgb,
      bgPrimary,
      textBright,
      3.0
    );

    const rawRed = pickFirst(["var(--color-red)", "var(--text-error)"]);
    const accentRed = ensureReadableContrast(
      rawRed ? compositeOver(rawRed, bgPrimary) : { r: 229, g: 115, b: 115, a: 1 },
      bgPrimary,
      textBright,
      3.0
    );

    const rawPurple = pickFirst(["var(--color-purple)", "var(--color-pink)", "var(--interactive-accent)"]);
    const accentPurple = ensureReadableContrast(
      rawPurple ? compositeOver(rawPurple, bgPrimary) : accentRgb,
      bgPrimary,
      textBright,
      3.0
    );

    const textSublabelRaw = mixRgb(textMuted, accentTeal, 0.3);
    const textSublabel = ensureReadableContrast(textSublabelRaw, bgPrimary, textPrimary, 3.2);

    return {
      colorBgPrimary: rgbToHex(bgPrimary),
      colorBgSecondary: rgbToHex(bgSecondary),
      colorBgTertiary: rgbToHex(bgTertiary),
      colorBgHover: rgbToHex(bgHover),
      colorBgDarker: rgbToHex(bgDarker),
      colorBgGroup: rgbToHex(bgGroup),
      colorBgProficient: rgbToHex(bgProficient),

      colorTextPrimary: rgbToHex(textPrimary),
      colorTextSecondary: rgbToHex(textSecondary),
      colorTextSublabel: rgbToHex(textSublabel),
      colorTextBright: rgbToHex(textBright),
      colorTextMuted: rgbToHex(textMuted),
      colorTextGroup: rgbToHex(textGroup),

      colorBorderPrimary: rgbToHex(borderPrimary),
      colorBorderActive: rgbToHex(borderActive),
      colorBorderFocus: `rgba(${borderActive.r}, ${borderActive.g}, ${borderActive.b}, 0.45)`,

      colorAccentTeal: rgbToHex(accentTeal),
      colorAccentRed: rgbToHex(accentRed),
      colorAccentPurple: rgbToHex(accentPurple),
    };
  } finally {
    probe.remove();
  }
}

export const THEMES: { [key: string]: ColorTheme } = {
  obsidian: {
    name: "Obsidian Theme (Auto)",
    isDynamic: true,
    colors: { ...OBSIDIAN_FALLBACK_COLORS },
  },
  default: {
    name: "Default Dark",
    colors: {
      colorBgPrimary: "#262a36",
      colorBgSecondary: "#323748",
      colorBgTertiary: "#3a4055",
      colorBgHover: "#363b4a",
      colorBgDarker: "#303440",
      colorBgGroup: "#2d334a",
      colorBgProficient: "#2d3343",

      colorTextPrimary: "#e0e0e0",
      colorTextSecondary: "#a0a0d0",
      colorTextSublabel: "#a0c7d0",
      colorTextBright: "#ffffff",
      colorTextMuted: "#b8b8d0",
      colorTextGroup: "#b8c4ff",

      colorBorderPrimary: "#383e54",
      colorBorderActive: "#6d7cba",
      colorBorderFocus: "rgba(109, 124, 186, 0.5)",

      colorAccentTeal: "#64d8cb",
      colorAccentRed: "#e57373",
      colorAccentPurple: "#b39ddb",
    },
  },
  wotc: {
    name: "WOTC/Beyond (Light)",
    colors: {
      colorBgPrimary: "hsl(33, 85%, 95%)",
      colorBgSecondary: "hsl(33, 84%, 90%)",
      colorBgTertiary: "hsl(33, 84%, 85%)",
      colorBgHover: "hsl(33, 84%, 85%)",
      colorBgDarker: "hsl(33, 84%, 80%)",
      colorBgGroup: "hsl(33, 84%, 90%)",
      colorBgProficient: "hsl(36, 100%, 99%)",

      colorTextPrimary: "#000000",
      colorTextSecondary: "#646464",
      colorTextSublabel: "#4f4f4f",
      colorTextBright: "#000000",
      colorTextMuted: "#646464",
      colorTextGroup: "#ba4040",

      colorBorderPrimary: "hsl(30, 100%, 80%)",
      colorBorderActive: "#ba4040",
      colorBorderFocus: "rgba(109, 124, 186, 0.5)",

      colorAccentTeal: "#00c25e",
      colorAccentRed: "#ba4040",
      colorAccentPurple: "#703bbf",
    },
  },

  wotcDark: {
    name: "WOTC/Beyond (Dark)",
    colors: {
      colorBgPrimary: "#1a1a1a",
      colorBgSecondary: "#242424",
      colorBgTertiary: "#2e2e2e",
      colorBgHover: "#2a2a2a",
      colorBgDarker: "#1e1e1e",
      colorBgGroup: "#222222",
      colorBgProficient: "#262626",

      colorTextPrimary: "#d8d0c4",
      colorTextSecondary: "#a09888",
      colorTextSublabel: "#96907c",
      colorTextBright: "#f0e8d8",
      colorTextMuted: "#b0a898",
      colorTextGroup: "#ba4040",

      colorBorderPrimary: "#3a3632",
      colorBorderActive: "#ba4040",
      colorBorderFocus: "rgba(186, 64, 64, 0.5)",

      colorAccentTeal: "#00c25e",
      colorAccentRed: "#ba4040",
      colorAccentPurple: "#703bbf",
    },
  },

  itsDndDark: {
    name: "ITS D&D (Dark)",
    colors: {
      colorBgPrimary: "#1a1e24",
      colorBgSecondary: "#222e31",
      colorBgTertiary: "#2c3836",
      colorBgHover: "#1e3831",
      colorBgDarker: "#0e0f15",
      colorBgGroup: "#1c2f2b",
      colorBgProficient: "#2e4d3c",

      colorTextPrimary: "#dcdedd",
      colorTextSecondary: "#aacac9",
      colorTextSublabel: "#587770",
      colorTextBright: "#ffffff",
      colorTextMuted: "#aacac9",
      colorTextGroup: "#3eb281",

      colorBorderPrimary: "#2b4e41",
      colorBorderActive: "#548b67",
      colorBorderFocus: "rgba(84, 139, 103, 0.5)",

      colorAccentTeal: "#45b480",
      colorAccentRed: "#c93c3c",
      colorAccentPurple: "#cc824c",
    },
  },

  itsDndLight: {
    name: "ITS D&D (Light)",
    colors: {
      colorBgPrimary: "#f8fbff",
      colorBgSecondary: "#f1f5ff",
      colorBgTertiary: "#ecf6f1",
      colorBgHover: "#dfefe6",
      colorBgDarker: "#cbe2d5",
      colorBgGroup: "#ecf6f1",
      colorBgProficient: "#f1f5ff",

      colorTextPrimary: "#697580",
      colorTextSecondary: "#52ad67",
      colorTextSublabel: "#48804e",
      colorTextBright: "#1b2c25",
      colorTextMuted: "#91c1ad",
      colorTextGroup: "#0e934c",

      colorBorderPrimary: "#d6deea",
      colorBorderActive: "#5a8d71",
      colorBorderFocus: "rgba(90, 141, 113, 0.4)",

      colorAccentTeal: "#35be89",
      colorAccentRed: "#c93c3c",
      colorAccentPurple: "#cca04c",
    },
  },

  itsWotcDark: {
    name: "ITS WOTC (Dark)",
    colors: {
      colorBgPrimary: "#1e1e1e",
      colorBgSecondary: "#282828",
      colorBgTertiary: "#323232",
      colorBgHover: "#2c2c2c",
      colorBgDarker: "#181818",
      colorBgGroup: "#242424",
      colorBgProficient: "#2a2a2a",

      colorTextPrimary: "#d3b4a9",
      colorTextSecondary: "#bf5e5e",
      colorTextSublabel: "#a08070",
      colorTextBright: "#ffe0d0",
      colorTextMuted: "#c09880",
      colorTextGroup: "#c14343",

      colorBorderPrimary: "#772d2d",
      colorBorderActive: "#863737",
      colorBorderFocus: "rgba(134, 55, 55, 0.5)",

      colorAccentTeal: "#45b480",
      colorAccentRed: "#c14343",
      colorAccentPurple: "#863737",
    },
  },

  itsWotcLight: {
    name: "ITS WOTC (Light)",
    colors: {
      colorBgPrimary: "#fff9f0",
      colorBgSecondary: "#faf2e9",
      colorBgTertiary: "#f3e6d2",
      colorBgHover: "#f6e3cd",
      colorBgDarker: "#fbe2c5",
      colorBgGroup: "#faf2e9",
      colorBgProficient: "#fff6e4",

      colorTextPrimary: "#412f2f",
      colorTextSecondary: "#681010",
      colorTextSublabel: "#5c1c16",
      colorTextBright: "#2e1010",
      colorTextMuted: "#e2b7a3",
      colorTextGroup: "#c14343",

      colorBorderPrimary: "#fbb457",
      colorBorderActive: "#c75959",
      colorBorderFocus: "rgba(199, 89, 89, 0.4)",

      colorAccentTeal: "#00c25e",
      colorAccentRed: "#c75959",
      colorAccentPurple: "#a35158",
    },
  },

  forest: {
    name: "Forest (Dark)",
    colors: {
      colorBgPrimary: "#1a2420",
      colorBgSecondary: "#223028",
      colorBgTertiary: "#2a3a30",
      colorBgHover: "#263428",
      colorBgDarker: "#1e2a24",
      colorBgGroup: "#203028",
      colorBgProficient: "#243028",

      colorTextPrimary: "#c8dcd0",
      colorTextSecondary: "#82a892",
      colorTextSublabel: "#78a088",
      colorTextBright: "#e0f0e8",
      colorTextMuted: "#98b8a4",
      colorTextGroup: "#6ec490",

      colorBorderPrimary: "#2e4438",
      colorBorderActive: "#4a8a66",
      colorBorderFocus: "rgba(74, 138, 102, 0.5)",

      colorAccentTeal: "#4cd8a0",
      colorAccentRed: "#e07060",
      colorAccentPurple: "#a08cd0",
    },
  },

  parchment: {
    name: "Parchment (Light)",
    colors: {
      colorBgPrimary: "#f5f0e8",
      colorBgSecondary: "#ebe4d8",
      colorBgTertiary: "#e0d8c8",
      colorBgHover: "#e8e0d0",
      colorBgDarker: "#d8d0c0",
      colorBgGroup: "#ede6da",
      colorBgProficient: "#f0eade",

      colorTextPrimary: "#3a3428",
      colorTextSecondary: "#6e6450",
      colorTextSublabel: "#7a7060",
      colorTextBright: "#1a1408",
      colorTextMuted: "#887860",
      colorTextGroup: "#8a5a2a",

      colorBorderPrimary: "#d0c8b4",
      colorBorderActive: "#8a6830",
      colorBorderFocus: "rgba(138, 104, 48, 0.4)",

      colorAccentTeal: "#2a8a60",
      colorAccentRed: "#b04030",
      colorAccentPurple: "#704098",
    },
  },

  forestLight: {
    name: "Forest (Light)",
    colors: {
      colorBgPrimary: "#ecf4ec",
      colorBgSecondary: "#deeade",
      colorBgTertiary: "#d0e0d0",
      colorBgHover: "#d8e6d8",
      colorBgDarker: "#c8dac8",
      colorBgGroup: "#e0ece0",
      colorBgProficient: "#e6f0e6",

      colorTextPrimary: "#1c2c20",
      colorTextSecondary: "#3c5c42",
      colorTextSublabel: "#487050",
      colorTextBright: "#0c1c10",
      colorTextMuted: "#587860",
      colorTextGroup: "#287040",

      colorBorderPrimary: "#b4d0b8",
      colorBorderActive: "#388848",
      colorBorderFocus: "rgba(56, 136, 72, 0.4)",

      colorAccentTeal: "#1c8870",
      colorAccentRed: "#c04840",
      colorAccentPurple: "#7850a8",
    },
  },
};