export interface ColorTheme {
  name: string;
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

export const THEMES: { [key: string]: ColorTheme } = {
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