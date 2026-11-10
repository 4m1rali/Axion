import { Plus, Play, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TunnelDiagram, type TunnelMappingPreview } from "../components/tunnels/TunnelDiagram";
import { AxionSelect } from "../components/ui/AxionSelect";
import {
  deleteTunnelConfig,
  listActiveTunnels,
  listTunnelConfigs,
  saveTunnelConfig,
  startDynamicTunnel,
  startLocalTunnel,
  stopTunnel,
  type ActiveTunnel,
  type TunnelConfig,
} from "../lib/tunnels";
import { useI18n } from "../lib/i18n";
import { useSessionStore, type ConnectionRow } from "../stores/sessionStore";

const fieldClass =
  "w-full rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm text-axion-text outline-none focus:border-axion-accent";

type PortMappingRow = {
  id: string;
  localPort: string;
  remoteHost: string;
  remotePort: string;
};

type TunnelKind = "Local" | "Dynamic";
type ListenPreset = "127.0.0.1" | "0.0.0.0" | "::";

type Draft = {
  name: string;
  kind: TunnelKind;
  connectionId: string;
  listenPreset: ListenPreset;
  mappings: PortMappingRow[];
  socksPort: string;
  acknowledgePublic: boolean;
};

const newMapping = (local = "", remote = "127.0.0.1", remotePort = ""): PortMappingRow => ({
  id: crypto.randomUUID(),
  localPort: local,
  remoteHost: remote,
  remotePort,
});

const emptyDraft = (): Draft => ({
  name: "",
  kind: "Local",
  connectionId: "",
  listenPreset: "127.0.0.1",
  mappings: [newMapping("1080", "127.0.0.1", "80"), newMapping("3307", "127.0.0.1", "3306")],
  socksPort: "1080",
  acknowledgePublic: false,
});


function connLabel(c: ConnectionRow) {
  return `${c.username}@${c.host}${c.port !== 22 ? `:${c.port}` : ""}`;
}

function parsePort(s: string): number | null {
  const n = Number.parseInt(s.trim(), 10);
  if (n < 1 || n > 65535) return null;
  return n;
}

export function TunnelsPage() {
  const { t, tf } = useI18n();
  const kindOptions = useMemo(
    () => [
      { value: "Local" as const, label: t("tunnelsKindLocal") },
      { value: "Dynamic" as const, label: t("tunnelsKindDynamic") },
    ],
    [t],
  );
  const listenOptions = useMemo(
    () => [
      { value: "127.0.0.1" as const, label: t("tunnelsListenLoopback") },
      { value: "0.0.0.0" as const, label: t("tunnelsListenAll") },
      { value: "::" as const, label: t("tunnelsListenAll6") },
    ],
    [t],
  );
  const connections = useSessionStore((s) => s.connections);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saved, setSaved] = useState<TunnelConfig[]>([]);
  const [active, setActive] = useState<ActiveTunnel[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const refresh = useCallback(async () => {
    const [configs, live] = await Promise.all([listTunnelConfigs(), listActiveTunnels()]);
    setSaved(configs);
    setActive(live);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!draft.connectionId && connections.length > 0) {
      patch({ connectionId: connections[0].id });
    }
  }, [connections, draft.connectionId]);

  const server = useMemo(
    () => connections.find((c) => c.id === draft.connectionId),
    [connections, draft.connectionId],
  );

  const localAddress = draft.listenPreset;

  const diagramMappings: TunnelMappingPreview[] = useMemo(
    () =>
      draft.mappings
        .map((m) => {
          const lp = parsePort(m.localPort);
          const rp = parsePort(m.remotePort);
          if (!lp || !m.remoteHost.trim() || !rp) return null;
          return { localPort: lp, remoteHost: m.remoteHost.trim(), remotePort: rp };
        })
        .filter((x): x is TunnelMappingPreview => x !== null),
    [draft.mappings],
  );

  const validMappingCount = useMemo(() => {
    let n = 0;
    for (const row of draft.mappings) {
      if (parsePort(row.localPort) && parsePort(row.remotePort) && row.remoteHost.trim()) n += 1;
    }
    return n;
  }, [draft.mappings]);

  const socksPortNum = parsePort(draft.socksPort) ?? 0;

  const updateMapping = (id: string, partial: Partial<PortMappingRow>) => {
    setDraft((d) => ({
      ...d,
      mappings: d.mappings.map((m) => (m.id === id ? { ...m, ...partial } : m)),
    }));
  };

  const addMapping = () => {
    setDraft((d) => ({ ...d, mappings: [...d.mappings, newMapping()] }));
  };

  const removeMapping = (id: string) => {
    setDraft((d) => {
      if (d.mappings.length <= 1) return d;
      return { ...d, mappings: d.mappings.filter((m) => m.id !== id) };
    });
  };

  const start = async () => {
    if (!draft.connectionId) {
      setError(t("tunnelsConnectFirst"));
      return;
    }
    const publicBind = localAddress === "0.0.0.0" || localAddress === "::";
    if (publicBind && !draft.acknowledgePublic) {
      setError("Confirm public bind when listening on all interfaces.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const baseLabel = draft.name.trim();

      if (draft.kind === "Dynamic") {
        if (!socksPortNum) {
          setError("Enter a valid SOCKS port (1–65535).");
          setBusy(false);
          return;
        }
        await startDynamicTunnel(
          draft.connectionId,
          localAddress,
          socksPortNum,
          draft.acknowledgePublic,
        );
        await saveTunnelConfig({
          id: "",
          name: baseLabel || `SOCKS ${socksPortNum}`,
          kind: "Dynamic",
          localAddress,
          localPort: socksPortNum,
          connectionId: draft.connectionId,
        });
      } else {
        const seenLocal = new Set<number>();
        let started = 0;
        for (const row of draft.mappings) {
          const lp = parsePort(row.localPort);
          const rp = parsePort(row.remotePort);
          const rh = row.remoteHost.trim();
          if (!lp || !rp || !rh) continue;
          if (seenLocal.has(lp)) {
            setError(`Duplicate local port ${lp}.`);
            setBusy(false);
            return;
          }
          seenLocal.add(lp);
          await startLocalTunnel(
            draft.connectionId,
            localAddress,
            lp,
            rh,
            rp,
            draft.acknowledgePublic,
          );
          const rowLabel = baseLabel || `Local ${lp}`;
          await saveTunnelConfig({
            id: "",
            name:
              draft.mappings.length > 1
                ? `${rowLabel} → ${rh}:${rp}`
                : rowLabel || `Local ${lp} → ${rh}:${rp}`,
            kind: "Local",
            localAddress,
            localPort: lp,
            destinationAddress: rh,
            destinationPort: rp,
            connectionId: draft.connectionId,
          });
          started += 1;
        }
        if (started === 0) {
          setError("Add at least one valid port mapping (local + remote host/port).");
          setBusy(false);
          return;
        }
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeConfig = async (id: string) => {
    await deleteTunnelConfig(id);
    await refresh();
  };

  const stop = async (id: string) => {
    await stopTunnel(id);
    await refresh();
  };

  const startLabel =
    draft.kind === "Dynamic"
      ? t("tunnelsStartTunnel")
      : validMappingCount > 1
        ? tf("tunnelsStartTunnels", { count: validMappingCount })
        : t("tunnelsStartTunnel");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6">
      <header className="shrink-0">
        <h1 className="text-lg font-semibold text-axion-text">{t("tunnelsTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-axion-text-muted">{t("tunnelsDesc")}</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:items-stretch">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-axion-border bg-axion-surface/50 sm:min-h-[18rem]">
          <h2 className="shrink-0 border-b border-axion-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-axion-text-muted sm:px-5">
            {t("tunnelsConfiguration")}
          </h2>

          <div className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs text-axion-text-muted">{t("tunnelsSshSession")}</span>
                <AxionSelect
                  value={draft.connectionId}
                  onChange={(v) => patch({ connectionId: v })}
                  disabled={connections.length === 0}
                  aria-label="SSH session"
                  options={
                    connections.length === 0
                      ? [{ value: "", label: t("tunnelsNoSsh"), disabled: true }]
                      : connections.map((c) => ({ value: c.id, label: connLabel(c) }))
                  }
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-axion-text-muted">{t("tunnelsTunnelType")}</span>
                <AxionSelect
                  value={draft.kind}
                  onChange={(v) => patch({ kind: v })}
                  aria-label="Tunnel type"
                  options={kindOptions}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs text-axion-text-muted">{t("tunnelsListenOn")}</span>
                <AxionSelect
                  value={draft.listenPreset}
                  onChange={(v) => patch({ listenPreset: v })}
                  aria-label="Listen address"
                  options={listenOptions}
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-axion-text-muted">{t("tunnelsGroupLabel")}</span>
                <input
                  className={fieldClass}
                  placeholder={t("tunnelsGroupPlaceholder")}
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>
            </div>

            {draft.kind === "Dynamic" ? (
              <div className="max-w-xs">
                <span className="mb-1 block text-xs text-axion-text-muted">{t("tunnelsSocksPort")}</span>
                <input
                  className={`${fieldClass} font-mono`}
                  inputMode="numeric"
                  value={draft.socksPort}
                  onChange={(e) => patch({ socksPort: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-axion-text-secondary">{t("tunnelsPortMappings")}</span>
                  <button
                    type="button"
                    onClick={addMapping}
                    className="inline-flex items-center gap-1 rounded-lg border border-axion-border px-2 py-1 text-xs text-axion-accent hover:bg-axion-hover"
                  >
                    <Plus size={14} />
                    {t("tunnelsAddPort")}
                  </button>
                </div>
                <div className="space-y-2 pb-1">
                  {draft.mappings.map((row, index) => (
                    <div
                      key={row.id}
                      className="grid gap-2 rounded-lg border border-axion-border/70 bg-axion-bg/40 p-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_auto]"
                    >
                      <div>
                        <span className="mb-0.5 block text-[10px] text-axion-text-muted">{t("tunnelsLocal")}</span>
                        <input
                          className={`${fieldClass} py-1.5 font-mono text-xs`}
                          inputMode="numeric"
                          placeholder="8080"
                          value={row.localPort}
                          onChange={(e) => updateMapping(row.id, { localPort: e.target.value })}
                          aria-label={`Local port row ${index + 1}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="mb-0.5 block text-[10px] text-axion-text-muted">{t("tunnelsRemoteHost")}</span>
                        <input
                          className={`${fieldClass} py-1.5 font-mono text-xs`}
                          placeholder="127.0.0.1"
                          value={row.remoteHost}
                          onChange={(e) => updateMapping(row.id, { remoteHost: e.target.value })}
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-axion-text-muted">{t("tunnelsRemotePort")}</span>
                        <input
                          className={`${fieldClass} py-1.5 font-mono text-xs`}
                          inputMode="numeric"
                          placeholder="80"
                          value={row.remotePort}
                          onChange={(e) => updateMapping(row.id, { remotePort: e.target.value })}
                        />
                      </div>
                      <div className="flex items-end pb-0.5">
                        <button
                          type="button"
                          disabled={draft.mappings.length <= 1}
                          onClick={() => removeMapping(row.id)}
                          className="rounded-lg p-2 text-axion-text-muted hover:bg-axion-hover hover:text-axion-error disabled:opacity-30"
                          aria-label="Remove mapping"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(localAddress === "0.0.0.0" || localAddress === "::") && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-axion-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.acknowledgePublic}
                  onChange={(e) => patch({ acknowledgePublic: e.target.checked })}
                />
                I understand this exposes ports on all network interfaces
              </label>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-axion-border bg-axion-surface/80 px-4 py-3 sm:px-5">
            {error && <p className="text-sm text-axion-error">{error}</p>}
            <button
              type="button"
              disabled={busy || connections.length === 0}
              onClick={() => void start()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-axion-accent py-2.5 text-sm font-medium text-black transition hover:brightness-105 disabled:opacity-50"
            >
              <Play size={16} />
              {startLabel}
            </button>
          </div>
        </section>

        <TunnelDiagram
          className="min-h-0 max-xl:max-h-64"
          kind={draft.kind}
          localAddress={localAddress}
          localPort={draft.kind === "Dynamic" ? socksPortNum : undefined}
          mappings={draft.kind === "Local" ? diagramMappings : undefined}
          serverLabel={server ? connLabel(server) : t("tunnelsSelectSession")}
        />
      </div>

      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-axion-border bg-axion-surface/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-axion-text-muted">{t("tunnelsRunning")}</h2>
          {active.length === 0 ? (
            <p className="mt-2 text-sm text-axion-text-muted">{t("tunnelsNoActive")}</p>
          ) : (
            <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto">
              {active.map((tunnel) => (
                <li
                  key={tunnel.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-axion-text">
                    <span className="text-axion-text-muted">{tunnel.kind}</span>
                    {" · "}
                    {connections.find((c) => c.id === tunnel.connectionId)
                      ? connLabel(connections.find((c) => c.id === tunnel.connectionId)!)
                      : tunnel.connectionId.slice(0, 8)}
                    {tunnel.bind ? ` · ${tunnel.bind}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void stop(tunnel.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-axion-border px-2 py-1 text-xs text-axion-text-secondary hover:bg-axion-hover"
                  >
                    <Square size={12} />
                    {t("tunnelsStop")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-axion-border bg-axion-surface/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-axion-text-muted">{t("tunnelsSaved")}</h2>
          {saved.length === 0 ? (
            <p className="mt-2 text-sm text-axion-text-muted">{t("tunnelsSavedHint")}</p>
          ) : (
            <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto">
              {saved.map((cfg) => (
                <li
                  key={cfg.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-axion-border px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate font-mono text-axion-text-secondary">
                    {cfg.name} — {cfg.localAddress}:{cfg.localPort}
                    {cfg.destinationAddress ? ` → ${cfg.destinationAddress}:${cfg.destinationPort}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeConfig(cfg.id)}
                    className="shrink-0 rounded-lg p-1.5 text-axion-error hover:bg-axion-hover"
                    aria-label="Delete saved tunnel"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
