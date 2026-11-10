import { ChevronDown, ChevronRight, TerminalSquare } from "lucide-react";

type Props = {
  commands: string[];
  status: "ok" | "error";
  output?: string;
  detail?: string;
  cwd?: string;
  expanded: boolean;
  summary: string;
  onToggle: () => void;
};

export function TerminalExecCard({
  commands,
  status,
  output,
  detail,
  cwd,
  expanded,
  summary,
  onToggle,
}: Props) {
  const statusLabel = status === "ok" ? "ok" : "failed";

  return (
    <div className="overflow-hidden rounded-lg border border-axion-border/70 bg-[#141414]/90">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.03]"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-axion-text-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-axion-text-muted" />
        )}
        <TerminalSquare size={14} className="shrink-0 text-axion-accent/80" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-axion-text-secondary">
            {cwd ? `${cwd} · ` : ""}
            {summary}
          </p>
        </div>
        <span
          className={`shrink-0 font-mono text-[10px] ${
            status === "ok" ? "text-emerald-400/85" : "text-red-300/85"
          }`}
        >
          {statusLabel}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-axion-border/50">
          <pre className="hide-scrollbar overflow-x-auto px-2.5 py-2 font-mono text-[10px] leading-relaxed text-axion-text-muted">
            {commands.map((c) => `$ ${c}`).join("\n")}
          </pre>
          {output ? (
            <pre className="hide-scrollbar max-h-52 overflow-y-auto whitespace-pre-wrap border-t border-axion-border/40 bg-black/25 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-axion-text-secondary">
              {output}
            </pre>
          ) : status === "ok" ? (
            <p className="border-t border-axion-border/40 px-2.5 py-2 text-[10px] text-axion-text-muted">
              No output captured yet.
            </p>
          ) : null}
          {detail ? (
            <p className="border-t border-axion-border/40 px-2.5 py-1.5 text-[10px] text-red-300/90">{detail}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
