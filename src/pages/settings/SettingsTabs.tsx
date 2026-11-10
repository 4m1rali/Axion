import { useI18n } from "../../lib/i18n";
import { useUiStore, type SettingsTab } from "../../stores/uiStore";

const tabs: SettingsTab[] = ["general", "appearance", "llm"];

export function SettingsTabs() {
  const active = useUiStore((s) => s.settingsTab);
  const setTab = useUiStore((s) => s.setSettingsTab);
  const { t } = useI18n();

  const label = (tab: SettingsTab) => {
    if (tab === "general") return t("settingsGeneral");
    if (tab === "appearance") return t("settingsAppearance");
    return t("settingsLlm");
  };

  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Settings sections">
      {tabs.map((tab) => {
        const on = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setTab(tab)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              on
                ? "bg-axion-accent text-axion-on-primary"
                : "border border-axion-border bg-axion-surface/50 text-axion-text-secondary hover:bg-axion-hover hover:text-axion-text"
            }`}
          >
            {label(tab)}
          </button>
        );
      })}
    </nav>
  );
}
