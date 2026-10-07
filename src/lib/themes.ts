export type ThemeDefinition = {
  id: string;
  label: string;
  dark: boolean;
  swatch: [string, string, string];
};

export const THEMES: ThemeDefinition[] = [
  { id: "midnight", label: "Midnight", dark: true, swatch: ["#1b2033", "#7aa2f7", "#9ece6a"] },
  { id: "ocean", label: "Ocean", dark: true, swatch: ["#152736", "#5fd3d8", "#63d69f"] },
  { id: "forest", label: "Forest", dark: true, swatch: ["#16261d", "#6ddc9a", "#c9dd6d"] },
  { id: "sunset", label: "Sunset", dark: true, swatch: ["#2b1a14", "#f4a261", "#e76f51"] },
  { id: "mocha", label: "Mocha", dark: true, swatch: ["#261f18", "#d9b382", "#8fc8a0"] },
  { id: "grape", label: "Grape", dark: true, swatch: ["#221530", "#c78ff0", "#8fa8f0"] },
  { id: "slate", label: "Slate", dark: true, swatch: ["#22252a", "#cfd3d8", "#7fb8c9"] },
  { id: "nord", label: "Nord", dark: true, swatch: ["#3b4252", "#88c0d0", "#a3be8c"] },
  {
    id: "obsidian",
    label: "Obsidian",
    dark: true,
    swatch: ["oklch(0.23 0.0 0)", "oklch(0.76 0.13 200)", "oklch(0.74 0.15 272)"],
  },
  {
    id: "abyss",
    label: "Abysse",
    dark: true,
    swatch: ["oklch(0.23 0.045 250)", "oklch(0.76 0.14 215)", "oklch(0.74 0.15 287)"],
  },
  {
    id: "emeraude",
    label: "Émeraude",
    dark: true,
    swatch: ["oklch(0.23 0.03 165)", "oklch(0.76 0.15 158)", "oklch(0.74 0.15 230)"],
  },
  {
    id: "carmin",
    label: "Carmin",
    dark: true,
    swatch: ["oklch(0.23 0.035 15)", "oklch(0.76 0.17 22)", "oklch(0.74 0.15 94)"],
  },
  {
    id: "amethyste",
    label: "Améthyste",
    dark: true,
    swatch: ["oklch(0.23 0.04 295)", "oklch(0.76 0.16 300)", "oklch(0.74 0.15 12)"],
  },
  {
    id: "sarcelle",
    label: "Sarcelle",
    dark: true,
    swatch: ["oklch(0.23 0.04 195)", "oklch(0.76 0.14 190)", "oklch(0.74 0.15 262)"],
  },
  {
    id: "cuivre",
    label: "Cuivre",
    dark: true,
    swatch: ["oklch(0.23 0.03 45)", "oklch(0.76 0.14 55)", "oklch(0.74 0.15 127)"],
  },
  {
    id: "indigo",
    label: "Indigo",
    dark: true,
    swatch: ["oklch(0.23 0.05 275)", "oklch(0.76 0.16 270)", "oklch(0.74 0.15 342)"],
  },
  {
    id: "olive",
    label: "Olive",
    dark: true,
    swatch: ["oklch(0.23 0.03 115)", "oklch(0.76 0.13 120)", "oklch(0.74 0.15 192)"],
  },
  {
    id: "prune",
    label: "Prune",
    dark: true,
    swatch: ["oklch(0.23 0.04 335)", "oklch(0.76 0.16 340)", "oklch(0.74 0.15 52)"],
  },
  {
    id: "acier",
    label: "Acier",
    dark: true,
    swatch: ["oklch(0.23 0.015 230)", "oklch(0.76 0.09 225)", "oklch(0.74 0.15 297)"],
  },
  {
    id: "espresso",
    label: "Espresso",
    dark: true,
    swatch: ["oklch(0.23 0.025 40)", "oklch(0.76 0.12 70)", "oklch(0.74 0.15 142)"],
  },
  {
    id: "aurore",
    label: "Aurore",
    dark: true,
    swatch: ["oklch(0.23 0.03 210)", "oklch(0.76 0.16 320)", "oklch(0.74 0.15 32)"],
  },
  {
    id: "graphite",
    label: "Graphite",
    dark: true,
    swatch: ["oklch(0.23 0.008 270)", "oklch(0.76 0.12 150)", "oklch(0.74 0.15 222)"],
  },
  {
    id: "cobalt",
    label: "Cobalt",
    dark: true,
    swatch: ["oklch(0.23 0.06 245)", "oklch(0.76 0.17 240)", "oklch(0.74 0.15 312)"],
  },
  {
    id: "jungle",
    label: "Jungle",
    dark: true,
    swatch: ["oklch(0.23 0.04 145)", "oklch(0.76 0.15 135)", "oklch(0.74 0.15 207)"],
  },
  { id: "light", label: "Clair", dark: false, swatch: ["#fbfbfd", "#3a6ff0", "#37b98a"] },
  { id: "rose", label: "Rose", dark: false, swatch: ["#fff7f7", "#d9455f", "#c25ba0"] },
  { id: "sand", label: "Sable", dark: false, swatch: ["#fbf8ef", "#3f7a54", "#c0873f"] },
];

export const DEFAULT_THEME = "midnight";

export function applyTheme(themeId: string, density: string) {
  if (typeof document === "undefined") return;
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]!;
  const root = document.documentElement;
  root.dataset["theme"] = theme.id;
  root.dataset["density"] = density === "compact" ? "compact" : "comfortable";
  root.classList.toggle("dark", theme.dark);
  root.style.colorScheme = theme.dark ? "dark" : "light";
}
