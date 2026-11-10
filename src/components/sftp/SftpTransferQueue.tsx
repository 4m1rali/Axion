import { formatBytes } from "../../lib/sftpFormat";
import { formatSpeed, type TransferTask } from "../../lib/sftpTransfer";

type Props = {
  tasks: TransferTask[];
  onCancel: (task: TransferTask) => void;
  onDismiss: (key: string) => void;
};

function statusLine(t: TransferTask): string {
  const size =
    t.total != null && t.total > 0
      ? `${formatBytes(t.transferred)} / ${formatBytes(t.total)}`
      : formatBytes(t.transferred);
  if (t.error) return `${size} — ${t.error}`;
  if (t.done) return `${size} — Done`;
  const pct =
    t.total && t.total > 0 ? `${Math.min(100, Math.round((t.transferred / t.total) * 100))}% · ` : "";
  const speed = formatSpeed(t.speedBps);
  return `${size} — ${pct}${speed}`;
}

export function SftpTransferQueue({ tasks, onCancel, onDismiss }: Props) {
  if (tasks.length === 0) return null;

  const active = tasks.filter((t) => !t.done);
  const rows = [...active, ...tasks.filter((t) => t.done)];

  return (
    <div className="shrink-0 border-t border-axion-border/50 px-3 py-1.5">
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-axion-text-muted">
        Transfers{active.length > 0 ? ` · ${active.length} active` : ""}
      </p>
      <ul className="hide-scrollbar max-h-24 space-y-0.5 overflow-y-auto">
        {rows.map((t) => {
          const label = t.direction === "upload" ? "Upload" : "Download";
          return (
            <li
              key={t.key}
              className="flex min-w-0 items-baseline justify-between gap-2 text-[10px] leading-snug"
            >
              <p className="min-w-0 flex-1 truncate">
                <span className={t.direction === "upload" ? "text-sky-300" : "text-axion-accent"}>
                  {label}
                </span>{" "}
                <span className="text-sky-300/90">{t.fileName}</span>
                <span className="text-axion-text-muted"> · {statusLine(t)}</span>
              </p>
              {!t.done && t.backendId ? (
                <button
                  type="button"
                  onClick={() => onCancel(t)}
                  className="shrink-0 text-[10px] text-axion-text-muted hover:text-axion-text"
                >
                  cancel
                </button>
              ) : t.done ? (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => onDismiss(t.key)}
                  className="shrink-0 text-[10px] text-axion-text-muted hover:text-axion-text"
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
