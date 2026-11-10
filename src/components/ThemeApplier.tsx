import { useEffect } from "react";
import { applyAppearance } from "../lib/appearance";
import { useSettingsStore } from "../stores/settingsStore";

export function ThemeApplier() {
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    if (!settings) return;
    applyAppearance(settings);
  }, [settings?.locale, settings?.themeMode, settings?.accentColor, settings]);

  return null;
}
