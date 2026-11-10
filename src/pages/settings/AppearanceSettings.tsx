import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { ACCENT_PRESETS, normalizeAccent } from "../../lib/appearance";
import { LOCALE_OPTIONS, resolveLocale, useI18n } from "../../lib/i18n";
import { AccentColorPicker } from "../../components/ui/AccentColorPicker";
import { AxionSelect } from "../../components/ui/AxionSelect";
import { useSettingsStore } from "../../stores/settingsStore";

export function AppearanceSettings() {
  const { t } = useI18n();
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const loading = useSettingsStore((s) => s.loading);

  if (!settings) return null;

  const accent = normalizeAccent(settings.accentColor);
  const isLight = settings.themeMode === "light";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-axion-text">{t("appearanceTitle")}</h1>
        <p className="mt-1 text-sm text-axion-text-muted">{t("appearanceSubtitle")}</p>
      </header>

      <section className="space-y-2">
        <span className="text-xs font-medium text-axion-text-muted">{t("language")}</span>
        <AxionSelect
          value={resolveLocale(settings.locale)}
          onChange={(locale) => void patch({ locale })}
          disabled={loading}
          aria-label={t("language")}
          options={LOCALE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </section>

      <section className="space-y-2">
        <span className="text-xs font-medium text-axion-text-muted">{t("theme")}</span>
        <div className="grid grid-cols-2 gap-2">
          <ThemeChoice
            active={!isLight}
            onClick={() => void patch({ themeMode: "dark" })}
            icon={<Moon size={18} />}
            label={t("themeDark")}
          />
          <ThemeChoice
            active={isLight}
            onClick={() => void patch({ themeMode: "light" })}
            icon={<Sun size={18} />}
            label={t("themeLight")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <span className="text-xs font-medium text-axion-text-muted">{t("accentColor")}</span>
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-axion-text-muted">{t("accentPresets")}</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((p) => {
              const selected = accent.toLowerCase() === p.color.toLowerCase();
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.color}
                  aria-label={p.color}
                  onClick={() => void patch({ accentColor: p.color })}
                  className={`h-9 w-9 rounded-lg border-2 transition hover:scale-105 ${
                    selected ? "border-axion-text" : "border-transparent"
                  }`}
                  style={{ backgroundColor: p.color }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-axion-text-muted">{t("customColor")}</p>
          <AccentColorPicker
            value={accent}
            disabled={loading}
            onChange={(accentColor) => void patch({ accentColor })}
          />
        </div>
      </section>
    </div>
  );
}

function ThemeChoice({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition ${
        active
          ? "border-axion-accent bg-axion-accent/15 text-axion-text"
          : "border-axion-border bg-axion-surface/50 text-axion-text-secondary hover:bg-axion-hover"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
