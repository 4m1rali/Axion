import { useCallback, useMemo } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { en, type MessageKey, type Messages } from "./en";
import { tFmt } from "./helpers";
import fa from "./strings/fa.json";
import zh from "./strings/zh.json";
import ru from "./strings/ru.json";
import ja from "./strings/ja.json";
import ko from "./strings/ko.json";
import ar from "./strings/ar.json";
import afg from "./strings/afg.json";

export type { MessageKey, Messages } from "./en";
export { tFmt, tAuthMethod, tElevation } from "./helpers";

export type AppLocale = "en" | "zh" | "fa" | "ru" | "ja" | "ko" | "afg" | "ar";

export const LOCALE_OPTIONS: { value: AppLocale; label: string }[] = [
  { value: "en", label: "English (ENG)" },
  { value: "zh", label: "中文 (CH)" },
  { value: "fa", label: "فارسی (Persian)" },
  { value: "ru", label: "Русский (Ru)" },
  { value: "ja", label: "日本語 (Japan)" },
  { value: "ko", label: "한국어 (Korea)" },
  { value: "afg", label: "پښتو (AFG)" },
  { value: "ar", label: "العربية (Arabic)" },
];

export const RTL_LOCALES = new Set<AppLocale>(["fa", "ar", "afg"]);

const KNOWN = new Set<string>(LOCALE_OPTIONS.map((o) => o.value));

function asMessages(m: Record<string, string>): Messages {
  return m as Messages;
}

function pickCatalog(loc: AppLocale): Messages {
  switch (loc) {
    case "zh":
      return asMessages(zh);
    case "fa":
      return asMessages(fa);
    case "ru":
      return asMessages(ru);
    case "ja":
      return asMessages(ja);
    case "ko":
      return asMessages(ko);
    case "ar":
      return asMessages(ar);
    case "afg":
      return asMessages(afg);
    default:
      return en;
  }
}

const catalogs: Record<AppLocale, Messages> = {
  en,
  zh: pickCatalog("zh"),
  fa: pickCatalog("fa"),
  ru: pickCatalog("ru"),
  ja: pickCatalog("ja"),
  ko: pickCatalog("ko"),
  ar: pickCatalog("ar"),
  afg: pickCatalog("afg"),
};

export function resolveLocale(raw: string | undefined): AppLocale {
  if (raw && KNOWN.has(raw)) return raw as AppLocale;
  return "en";
}

export function htmlLangForLocale(locale: AppLocale): string {
  switch (locale) {
    case "zh":
      return "zh-Hans";
    case "afg":
      return "ps-AF";
    default:
      return locale;
  }
}

export function tForLocale(locale: string | undefined, key: MessageKey): string {
  const loc = resolveLocale(locale);
  return catalogs[loc][key] ?? catalogs.en[key];
}

export function useI18n() {
  const locale = useSettingsStore((s) => s.settings?.locale);
  const resolved = resolveLocale(locale);
  const t = useCallback((key: MessageKey) => tForLocale(locale, key), [locale]);
  const tf = useCallback(
    (key: MessageKey, vars: Record<string, string | number>) => tFmt(tForLocale(locale, key), vars),
    [locale],
  );
  return useMemo(() => ({ locale: resolved, t, tf }), [resolved, t, tf]);
}

/** Non-React: read current locale from settings store. */
export function translateNow(key: MessageKey): string {
  return tForLocale(useSettingsStore.getState().settings?.locale, key);
}
