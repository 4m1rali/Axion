import { useEffect } from "react";
import { SettingsPageSkeleton } from "../components/loading/PageSkeletons";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { LlmSettings } from "./settings/LlmSettings";
import { SettingsGeneral } from "./settings/SettingsGeneral";
import { SettingsTabs } from "./settings/SettingsTabs";

export function SettingsPage() {
  const tab = useUiStore((s) => s.settingsTab);
  const loading = useSettingsStore((s) => s.loading);
  const settings = useSettingsStore((s) => s.settings);
  const load = useSettingsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !settings) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="hide-scrollbar mx-auto h-full max-w-5xl overflow-y-auto p-4 sm:p-6">
      <SettingsTabs />
      {tab === "general" && <SettingsGeneral />}
      {tab === "appearance" && <AppearanceSettings />}
      {tab === "llm" && <LlmSettings />}
    </div>
  );
}
