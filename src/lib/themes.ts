// Apparence : clair, sombre ou selon le système. Les anciens thèmes nommés
// (midnight, ocean…) retombent sur « Système ».

export type ThemeId = "system" | "light" | "dark";

export const THEMES: Array<{ id: ThemeId; label: string }> = [
  { id: "system", label: "Système" },
  { id: "light", label: "Clair" },
  { id: "dark", label: "Sombre" },
];

export const DEFAULT_THEME: ThemeId = "system";

export function normalizeTheme(value: string | undefined): ThemeId {
  return value === "light" || value === "dark" ? value : "system";
}

let systemListener: ((event: MediaQueryListEvent) => void) | undefined;

export function applyTheme(themeId: string, density: string) {
  if (typeof document === "undefined") return;
  const theme = normalizeTheme(themeId);
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const paint = (dark: boolean) => {
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  };
  if (systemListener) media.removeEventListener("change", systemListener);
  systemListener = undefined;
  if (theme === "system") {
    systemListener = (event) => paint(event.matches);
    media.addEventListener("change", systemListener);
    paint(media.matches);
  } else {
    paint(theme === "dark");
  }
  root.dataset["theme"] = theme;
  root.dataset["density"] = density === "compact" ? "compact" : "comfortable";
}

/** Appliqué avant l'hydratation (balise <script> du document) pour éviter un flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem("bt-appearance")||"{}");var t=s.theme;var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";r.dataset.density=s.density==="compact"?"compact":"comfortable";}catch(e){}})();`;
