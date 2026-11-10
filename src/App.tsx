import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { AppHeader } from "./components/AppHeader";
import { ConnectionsPanel } from "./components/ConnectionsPanel";
import { Sidebar } from "./components/Sidebar";
import { QuickConnectForm } from "./components/QuickConnectForm";
import { SessionPasswordDialog } from "./components/SessionPasswordDialog";
import { connect, type ConnectionProfile, type HostKeyInfo } from "./lib/api";
import {
  authMethodForConnect,
  connectHostLabel,
  isPasswordAuthError,
  needsPasswordPrompt,
} from "./lib/connectAuth";
import { draftToTransportProxy } from "./lib/transportProxy";
import { emptyQuickConnectFields, type QuickConnectFields } from "./lib/quickConnect";
import { waitForSshConnection } from "./lib/waitConnection";
import { useSessionStore } from "./stores/sessionStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import {
  ConnectionsPageSkeleton,
  DashboardPageSkeleton,
  KeysPageSkeleton,
  SettingsPageSkeleton,
  SftpPageSkeleton,
  TerminalPageSkeleton,
  TunnelsPageSkeleton,
} from "./components/loading/PageSkeletons";
import { ButtonLabelSkeleton } from "./components/ui/Skeleton";
import { ThemeApplier } from "./components/ThemeApplier";
import { UpdateChecker } from "./components/UpdateChecker";
import { useI18n } from "./lib/i18n";

const TerminalPage = lazy(() =>
  import("./pages/TerminalPage").then((m) => ({ default: m.TerminalPage })),
);
const SftpPage = lazy(() => import("./pages/SftpPage").then((m) => ({ default: m.SftpPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const TunnelsPage = lazy(() => import("./pages/TunnelsPage").then((m) => ({ default: m.TunnelsPage })));
const KeysPage = lazy(() => import("./pages/KeysPage").then((m) => ({ default: m.KeysPage })));

export default function App() {
  const { t, tf } = useI18n();
  const page = useUiStore((s) => s.page);
  const paletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setPalette = useUiStore((s) => s.setCommandPaletteOpen);
  const setConnections = useSessionStore((s) => s.setConnections);
  const pushDiagnostic = useSessionStore((s) => s.pushDiagnostic);
  const diagnostics = useSessionStore((s) => s.diagnostics);
  const clearDiagnostics = useSessionStore((s) => s.clearDiagnostics);
  const loadSettings = useSettingsStore((s) => s.load);

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [profilesReady, setProfilesReady] = useState(false);
  const [quickConnect, setQuickConnect] = useState<QuickConnectFields>(emptyQuickConnectFields());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [hostKey, setHostKey] = useState<{
    pendingId: string;
    prompt: HostKeyInfo;
    profile?: ConnectionProfile;
    password?: string;
  } | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    hostLabel: string;
    profile?: ConnectionProfile;
    rejected: boolean;
  } | null>(null);
  const [sessionPassword, setSessionPassword] = useState("");

  const refreshProfiles = useCallback(async () => {
    const list = await invoke<ConnectionProfile[]>("profiles_list");
    setProfiles(list);
    setProfilesReady(true);
  }, []);

  const refreshConnections = useCallback(async () => {
    const list = await invoke<{ id: string; host: string; port: number; username: string; connectedAt: string }[]>(
      "ssh_list_connections",
    );
    setConnections(
      list.map((c) => ({
        id: c.id,
        host: c.host,
        port: c.port,
        username: c.username,
        connectedAt: c.connectedAt,
      })),
    );
  }, [setConnections]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    refreshProfiles();
    refreshConnections();
    const unsubs = [
      listen("connection://status", () => refreshConnections()),
      listen("connection://ready", () => refreshConnections()),
      listen<{ step: { phase: string; level: string; message: string; elapsedMs: number; detail?: string } }>(
        "ssh://diagnostics",
        (event) => {
          pushDiagnostic(event.payload.step);
        },
      ),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, [pushDiagnostic, refreshConnections, refreshProfiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  const runConnect = async (profile?: ConnectionProfile, profilePassword?: string) => {
    const host = profile?.host ?? quickConnect.host;
    const port = profile?.port ?? quickConnect.port;
    const username = profile?.username ?? quickConnect.username;
    const password = profilePassword?.trim() || quickConnect.password.trim() || undefined;

    setConnecting(true);
    setError("");
    clearDiagnostics();
    try {
      const outcome = await connect({
        profileId: profile?.id,
        host,
        port,
        username,
        authMethod: authMethodForConnect(profile, quickConnect),
        password,
        rememberPassword: profile?.rememberPassword ?? quickConnect.rememberPassword,
        keyRef: profile?.keyRef,
        proxyJump: profile?.proxyJump ?? (quickConnect.proxyJump || undefined),
        transportProxy: profile?.transportProxy ?? draftToTransportProxy(quickConnect.transportProxy),
      });
      if (outcome.kind === "hostKey") {
        setHostKey({
          pendingId: outcome.pendingId,
          prompt: outcome.prompt,
          profile,
          password,
        });
      } else {
        await refreshConnections();
        useUiStore.getState().setPage("terminal");
      }
    } catch (e) {
      const msg = String(e);
      if (isPasswordAuthError(msg)) {
        setPasswordPrompt({
          hostLabel: connectHostLabel(host, port, username),
          profile,
          rejected: msg.toLowerCase().includes("authentication failed"),
        });
        setSessionPassword("");
        setError("");
      } else {
        setError(msg);
      }
    } finally {
      setConnecting(false);
    }
  };

  const requestConnect = (profile?: ConnectionProfile, profilePassword?: string) => {
    if (needsPasswordPrompt(profile, quickConnect, profilePassword)) {
      const host = profile?.host ?? quickConnect.host;
      const port = profile?.port ?? quickConnect.port;
      const username = profile?.username ?? quickConnect.username;
      setPasswordPrompt({ hostLabel: connectHostLabel(host, port, username), profile, rejected: false });
      setSessionPassword("");
      setError("");
      return;
    }
    void runConnect(profile, profilePassword);
  };

  const submitSessionPassword = () => {
    if (!passwordPrompt || !sessionPassword.trim()) return;
    const profile = passwordPrompt.profile;
    setPasswordPrompt(null);
    const pwd = sessionPassword;
    setSessionPassword("");
    void runConnect(profile, pwd);
  };

  const resolveHostKey = async (accept: boolean) => {
    if (!hostKey) return;
    const { profile, password } = hostKey;
    const host = profile?.host ?? quickConnect.host;
    const port = profile?.port ?? quickConnect.port;
    const username = profile?.username ?? quickConnect.username;
    try {
      setConnecting(true);
      await invoke("ssh_resolve_host_key", { pendingId: hostKey.pendingId, accept });
      if (!accept) {
        setError(t("hostKeyRejected"));
        return;
      }
      try {
        await waitForSshConnection(host, port, username);
        await refreshConnections();
        useUiStore.getState().setPage("terminal");
      } catch {
        if (needsPasswordPrompt(profile, quickConnect, password)) {
          setPasswordPrompt({
            hostLabel: connectHostLabel(host, port, username),
            profile,
            rejected: false,
          });
          setSessionPassword("");
        } else {
          setError("Authentication failed after trusting host key");
        }
      }
    } catch (e) {
      const msg = String(e);
      if (isPasswordAuthError(msg)) {
        setPasswordPrompt({
          hostLabel: connectHostLabel(host, port, username),
          profile,
          rejected: true,
        });
        setSessionPassword("");
      } else {
        setError(msg);
      }
    } finally {
      setConnecting(false);
      setHostKey(null);
    }
  };

  return (
    <div className="flex h-full bg-axion-bg">
      <ThemeApplier />
      <UpdateChecker />
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main
            className={`min-h-0 min-w-0 flex-1 ${
              page === "connections" ||
              page === "sftp" ||
              page === "terminal" ||
              page === "tunnels" ||
              page === "keys"
                ? "overflow-hidden p-0"
                : page === "settings"
                  ? "hide-scrollbar overflow-y-auto p-0"
                  : "hide-scrollbar overflow-y-auto p-6"
            }`}
          >
          {page === "dashboard" && !profilesReady && <DashboardPageSkeleton />}
          {page === "dashboard" && profilesReady && (
            <div className="mx-auto max-w-5xl space-y-6">
              <section className="rounded-xl border border-axion-border bg-axion-surface/50 p-5 sm:p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-axion-text">{t("quickConnectTitle")}</h2>
                  <p className="mt-1 text-sm text-axion-text-secondary">
                    {t("quickConnectDesc")}{" "}
                    <kbd className="rounded border border-axion-border bg-axion-bg px-1.5 py-0.5 text-[10px] text-axion-text-muted">
                      {t("quickConnectEnter")}
                    </kbd>{" "}
                    {t("quickConnectDescEnd")}
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!connecting && quickConnect.host.trim()) requestConnect();
                  }}
                >
                  <QuickConnectForm value={quickConnect} onChange={setQuickConnect} />
                  <div className="mt-5 flex flex-col gap-2 border-t border-axion-border/50 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-axion-text-muted">
                      {t("quickConnectSavedHosts")}{" "}
                      <span className="text-axion-text-secondary">{t("navConnections")}</span>.
                    </p>
                    <button
                      type="submit"
                      disabled={connecting || !quickConnect.host.trim() || !quickConnect.username.trim()}
                      className="w-full rounded-lg bg-axion-accent px-5 py-2.5 text-sm font-medium text-black transition hover:brightness-105 disabled:opacity-50 sm:w-auto"
                      aria-busy={connecting}
                    >
                      {connecting ? <ButtonLabelSkeleton variant={0} onAccent /> : t("commonConnect")}
                    </button>
                  </div>
                </form>
                {error && <p className="mt-3 text-sm text-axion-error">{error}</p>}
              </section>
              <section className="rounded-xl border border-axion-border bg-axion-surface/50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-axion-text">{t("sshDiagnostics")}</h3>
                  <button type="button" onClick={clearDiagnostics} className="text-xs text-axion-text-muted">
                    {t("commonClear")}
                  </button>
                </div>
                <ul className="hide-scrollbar max-h-48 space-y-1 overflow-y-auto text-xs text-axion-text-secondary">
                  {diagnostics.length === 0 && <li>{t("noConnectionTrace")}</li>}
                  {diagnostics.map((d, i) => (
                    <li key={`${d.elapsedMs}-${i}`} className={d.level === "Error" ? "text-axion-error" : ""}>
                      [{d.elapsedMs}ms] {d.phase}: {d.message}
                      {d.detail ? ` — ${d.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {page === "connections" && !profilesReady && <ConnectionsPageSkeleton />}
          {page === "connections" && profilesReady && (
            <ConnectionsPanel
              profiles={profiles}
              onRefresh={refreshProfiles}
              onConnect={(p, pwd) => requestConnect(p, pwd)}
              connecting={connecting}
              error={error}
            />
          )}

          {(page === "terminal" || page === "sftp") && (
            <div className="relative h-full min-h-0 w-full">
              <div
                className={`absolute inset-0 flex min-h-0 flex-col ${
                  page === "terminal"
                    ? "z-10"
                    : "pointer-events-none invisible"
                }`}
                aria-hidden={page !== "terminal"}
              >
                <Suspense fallback={<TerminalPageSkeleton />}>
                  <TerminalPage />
                </Suspense>
              </div>
              <div
                className={`absolute inset-0 flex min-h-0 flex-col ${
                  page === "sftp" ? "z-10" : "pointer-events-none invisible"
                }`}
                aria-hidden={page !== "sftp"}
              >
                <Suspense fallback={<SftpPageSkeleton />}>
                  <SftpPage />
                </Suspense>
              </div>
            </div>
          )}
          {page === "tunnels" && (
            <Suspense fallback={<TunnelsPageSkeleton />}>
              <TunnelsPage />
            </Suspense>
          )}
          {page === "keys" && (
            <Suspense fallback={<KeysPageSkeleton />}>
              <KeysPage />
            </Suspense>
          )}
          {page === "settings" && (
            <Suspense fallback={<SettingsPageSkeleton />}>
              <SettingsPage />
            </Suspense>
          )}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPalette(false)} />
      {hostKey && (
        <HostKeyModal
          prompt={hostKey.prompt}
          onAccept={() => resolveHostKey(true)}
          onReject={() => resolveHostKey(false)}
          t={t}
        />
      )}
      {passwordPrompt && (
        <SessionPasswordDialog
          hostLabel={passwordPrompt.hostLabel}
          subtitle={
            passwordPrompt.rejected
              ? tf("pwdRejected", { host: passwordPrompt.hostLabel })
              : undefined
          }
          password={sessionPassword}
          onPasswordChange={setSessionPassword}
          connecting={connecting}
          onCancel={() => {
            setPasswordPrompt(null);
            setSessionPassword("");
          }}
          onSubmit={submitSessionPassword}
        />
      )}
    </div>
  );
}

function HostKeyModal({
  prompt,
  onAccept,
  onReject,
  t,
}: {
  prompt: HostKeyInfo;
  onAccept: () => void;
  onReject: () => void;
  t: (key: import("./lib/i18n/en").MessageKey) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-axion-border bg-axion-elevated p-5">
        <h3 className="text-lg font-semibold text-axion-warning">{t("verifyHostKey")}</h3>
        <p className="mt-2 text-sm text-axion-text-secondary">
          {prompt.host}:{prompt.port} — {prompt.trustState}
        </p>
        <p className="mt-2 font-mono text-xs text-axion-text">{prompt.fingerprintSha256}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onReject} className="rounded-lg px-3 py-2 text-sm text-axion-text-secondary">
            {t("hostKeyReject")}
          </button>
          <button type="button" onClick={onAccept} className="rounded-lg bg-axion-accent px-3 py-2 text-sm font-medium text-black">
            {t("trustContinue")}
          </button>
        </div>
      </div>
    </div>
  );
}
