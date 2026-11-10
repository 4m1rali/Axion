import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, Monitor, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProfileBlockSkeleton } from "../../components/loading/PageSkeletons";
import { Skeleton } from "../../components/ui/Skeleton";
import type { ConnectionProfile } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSessionStore } from "../../stores/sessionStore";
import { GITHUB_REPO_URL } from "../../lib/repo";
import { isWindowsOs, useRuntimeOs } from "../../lib/platform";
import { useSettingsStore } from "../../stores/settingsStore";

type SystemIdentity = {
  username: string;
  computerName: string;
  displayName?: string | null;
  profileImageDataUrl?: string | null;
};

function InlineToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-3 whitespace-nowrap">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
          checked ? "bg-axion-accent" : "bg-axion-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-[1.35rem]" : "left-0.5"
          }`}
        />
      </button>
      <span className="truncate text-sm text-axion-text">{label}</span>
    </label>
  );
}

const tileClass = "rounded-xl border border-axion-border bg-axion-surface/70 p-4 sm:p-5";

export function SettingsGeneral() {
  const { t } = useI18n();
  const runtimeOs = useRuntimeOs();
  const profileTitle = isWindowsOs(runtimeOs) ? t("settingsWindowsProfile") : t("settingsSystemProfile");
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const patch = useSettingsStore((s) => s.patch);
  const connections = useSessionStore((s) => s.connections);
  const diagnostics = useSessionStore((s) => s.diagnostics);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [identity, setIdentity] = useState<SystemIdentity | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const refreshMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const list = await invoke<ConnectionProfile[]>("profiles_list");
      setProfiles(list);
      const id = await invoke<SystemIdentity>("system_identity");
      setIdentity(id);
    } catch {
      setIdentity(null);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  const recent = [...diagnostics].reverse().slice(0, 8);

  return (
    <div className="grid min-h-[28rem] grid-cols-5 grid-rows-5 gap-2 sm:gap-2">
      <div className={`${tileClass} col-span-2 row-span-3 flex flex-col justify-between`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-axion-text-muted">
              {profileTitle}
          </p>
          <div className="mt-3">
            {metaLoading ? (
              <ProfileBlockSkeleton />
            ) : (
              <div className="flex items-center gap-3">
                {identity?.profileImageDataUrl ? (
                  <img
                    src={identity.profileImageDataUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl border border-axion-border object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-axion-accent/15 text-axion-accent">
                    <User size={22} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-axion-text">
                    {identity?.displayName?.trim() || identity?.username || "—"}
                  </p>
                  <p className="truncate text-xs text-axion-text-muted">
                    {identity?.username && identity.displayName && identity.displayName !== identity.username
                      ? `@${identity.username} · `
                      : ""}
                    <span className="inline-flex items-center gap-1">
                      <Monitor size={12} className="shrink-0" />
                      {identity?.computerName ?? (runtimeOs === "linux" ? "Linux" : "System")}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-axion-border/60 pt-4">
            <StatItem label={t("settingsSavedHosts")} value={String(profiles.length)} />
            <StatItem label={t("settingsLiveSsh")} value={String(connections.length)} accent />
        </dl>
      </div>

      <div className={`${tileClass} col-span-3 col-start-3 row-span-3 flex min-h-0 flex-col`}>
        <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-axion-text-muted">
          {t("settingsRecentActivity")}
        </p>
        <ul className="hide-scrollbar mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto text-xs">
          {recent.length === 0 ? (
            <li className="py-4 text-axion-text-muted">{t("settingsNoEvents")}</li>
          ) : (
            recent.map((d, i) => (
              <li
                key={`${d.elapsedMs}-${i}`}
                className={`rounded-lg px-2 py-1.5 ${
                  d.level === "Error" ? "bg-axion-error/10 text-axion-error" : "text-axion-text-secondary"
                }`}
              >
                <span className="text-axion-text-muted">[{d.elapsedMs}ms]</span> {d.phase}: {d.message}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className={`${tileClass} col-span-3 row-span-2 row-start-4`}>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-axion-text-muted">
          {t("settingsPreferences")}
        </p>
        {loading && !settings ? (
          <div className="flex flex-wrap gap-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-32" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <InlineToggle
                label={t("settingsCmdHistory")}
              checked={settings?.terminalCommandHistory ?? true}
              disabled={loading || !settings}
              onChange={(v) => void patch({ terminalCommandHistory: v })}
            />
            <InlineToggle
                label={t("settingsCmdHints")}
              checked={settings?.terminalCommandHints ?? true}
              disabled={loading || !settings}
              onChange={(v) => void patch({ terminalCommandHints: v })}
            />
            <InlineToggle
                label={t("settingsAutoReconnect")}
              checked={settings?.reconnectEnabled ?? true}
              disabled={loading || !settings}
              onChange={(v) => void patch({ reconnectEnabled: v })}
            />
          </div>
        )}
      </div>

      <div className={`${tileClass} col-span-2 col-start-4 row-span-2 row-start-4 flex flex-col justify-between`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-axion-text-muted">Axion</p>
          <p className="mt-2 text-sm font-medium text-axion-text">
            {runtimeOs === "linux" ? t("settingsAxionTaglineLinux") : t("settingsAxionTagline")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-axion-text-muted">{t("settingsAxionDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => void openUrl(GITHUB_REPO_URL)}
          className="mt-3 inline-flex items-center gap-2 text-sm text-axion-accent transition hover:underline"
        >
          <Github size={16} />
          {t("settingsGithub")}
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-axion-text-muted">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${accent ? "text-axion-accent" : "text-axion-text"}`}>
        {value}
      </dd>
    </div>
  );
}
