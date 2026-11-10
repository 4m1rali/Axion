import { invoke } from "@tauri-apps/api/core";
import { Activity, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { MonitorMetricsSkeleton } from "./loading/PageSkeletons";
import { isSessionDeadError } from "../lib/sessionErrors";

export type RemoteServerMetrics = {
  cpuPct: number;
  memUsedKb: number;
  memTotalKb: number;
  diskUsedKb: number;
  diskTotalKb: number;
  diskPct: number;
  load1: number;
  cpus: number;
};

function kbToGiB(kb: number): string {
  if (kb <= 0) return "0";
  return (kb / (1024 * 1024)).toFixed(1);
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function MetricBar({ label, icon, pctValue, hint }: { label: string; icon: React.ReactNode; pctValue: number; hint: string }) {
  return (
    <div className="flex min-w-[7.5rem] flex-1 items-center gap-2">
      <span className="flex shrink-0 items-center gap-1 text-axion-text-muted" title={label}>
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </span>
      <div className="h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded-full bg-axion-bg">
        <div
          className="h-full rounded-full bg-axion-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pctValue))}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums text-axion-text-secondary" title={hint}>
        {pctValue}%
      </span>
    </div>
  );
}

type Props = {
  connectionId: string;
};

const POLL_MS = 5000;

export function TerminalServerMonitor({ connectionId }: Props) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<RemoteServerMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!connectionId) {
      setMetrics(null);
      setError("");
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await invoke<RemoteServerMetrics>("ssh_server_metrics", { connectionId });
        if (!cancelled) {
          setMetrics(data);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connectionId]);

  if (!connectionId) return null;

  const memPct = metrics ? pct(metrics.memUsedKb, metrics.memTotalKb) : 0;
  const loadHint =
    metrics && metrics.cpus > 0
      ? `Load ${metrics.load1.toFixed(2)} on ${metrics.cpus} CPU${metrics.cpus > 1 ? "s" : ""}`
      : "Load average";

  return (
    <footer className="shrink-0 rounded-xl border border-axion-border bg-axion-surface/95 px-3 py-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-axion-text-muted">
          <Activity size={14} className="text-axion-accent" />
          {t("monitorTitle")}
        </span>
        {metrics ? (
          <>
            <MetricBar
              label={t("monitorCpu")}
              icon={<Cpu size={14} />}
              pctValue={metrics.cpuPct}
              hint={`CPU ~${metrics.cpuPct}% (1s sample)`}
            />
            <MetricBar
              label={t("monitorRam")}
              icon={<MemoryStick size={14} />}
              pctValue={memPct}
              hint={`${kbToGiB(metrics.memUsedKb)} / ${kbToGiB(metrics.memTotalKb)} GiB`}
            />
            <MetricBar
              label={t("monitorDisk")}
              icon={<HardDrive size={14} />}
              pctValue={metrics.diskPct}
              hint={`${kbToGiB(metrics.diskUsedKb)} / ${kbToGiB(metrics.diskTotalKb)} GiB on /`}
            />
            <span className="shrink-0 text-xs tabular-nums text-axion-text-secondary" title={loadHint}>
              {loadHint}
            </span>
          </>
        ) : (
          <MonitorMetricsSkeleton />
        )}
        {error && (
          <span
            className={`max-w-[14rem] truncate text-xs sm:max-w-none ${
              isSessionDeadError(error) ? "text-axion-text-muted" : "text-axion-error"
            }`}
            title={error}
          >
            {isSessionDeadError(error) ? t("monitorSessionClosed") : error}
          </span>
        )}
      </div>
    </footer>
  );
}
