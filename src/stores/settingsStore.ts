import { create } from "zustand";
import { type AppSettings, loadAppSettings, saveAppSettings } from "../lib/appSettings";
import { normalizeAppSettings } from "../lib/normalizeSettings";

type SettingsState = {
  settings: AppSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  patch: (partial: Partial<AppSettings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const settings = normalizeAppSettings(await loadAppSettings());
      set({ settings, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  patch: async (partial) => {
    const cur = get().settings;
    if (!cur) return;
    const next = normalizeAppSettings({ ...cur, ...partial });
    set({ settings: next });
    await saveAppSettings(next);
  },
}));
