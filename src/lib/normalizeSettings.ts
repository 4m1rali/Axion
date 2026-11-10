import type { AppSettings } from "./appSettings";
import { normalizeAccent } from "./appearance";

export function normalizeAppSettings(raw: AppSettings): AppSettings {
  return {
    ...raw,
    accentColor: normalizeAccent(raw.accentColor),
    themeMode: raw.themeMode === "light" ? "light" : "dark",
    locale: raw.locale || "en",
    llmEnabled: raw.llmEnabled ?? false,
    llmProvider: raw.llmProvider?.trim() ? raw.llmProvider : "openai",
    llmApiUrl: raw.llmApiUrl ?? "",
    llmModel: raw.llmModel?.trim() ? raw.llmModel : "gpt-4o-mini",
    llmModelsCache: Array.isArray(raw.llmModelsCache) ? raw.llmModelsCache : [],
  };
}
