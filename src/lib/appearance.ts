import type { AppSettings } from "./appSettings";
import { RTL_LOCALES, htmlLangForLocale, resolveLocale } from "./i18n/index";

const DEFAULT_ACCENT = "#80c0e0";

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  const six = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(six)) return null;
  const n = Number.parseInt(six, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

function darkenHex(hex: string, factor: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#4a7288";
  const [r, g, b] = rgb;
  return toHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

export function normalizeAccent(hex: string | undefined): string {
  const rgb = parseHex(hex ?? "");
  if (!rgb) return DEFAULT_ACCENT;
  return toHex(...rgb);
}

export function applyAppearance(settings: Pick<AppSettings, "locale" | "themeMode" | "accentColor">) {
  const root = document.documentElement;
  const theme = settings.themeMode === "light" ? "light" : "dark";
  root.dataset.theme = theme;
  const locale = resolveLocale(settings.locale);
  root.lang = htmlLangForLocale(locale);
  root.dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  const accent = normalizeAccent(settings.accentColor);
  root.style.setProperty("--color-axion-accent", accent);
  root.style.setProperty("--color-axion-primary", accent);
  root.style.setProperty("--color-axion-accent-dark", darkenHex(accent, 0.35));
}

export const ACCENT_PRESETS = [
  { id: "sky", color: "#80C0E0" },
  { id: "mint", color: "#70CFA0" },
  { id: "violet", color: "#A78BFA" },
  { id: "amber", color: "#E5B76B" },
  { id: "rose", color: "#F472B6" },
  { id: "coral", color: "#E47777" },
] as const;
