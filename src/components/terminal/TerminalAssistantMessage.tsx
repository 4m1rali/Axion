import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Check, X } from "lucide-react";
import { commandsNeedApproval } from "../../lib/llm/parseAssistant";

type Props = {
  text: string;
  pendingCommands?: string[];
  approval?: "pending" | "accepted" | "rejected";
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
};

const mdComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-axion-text">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-axion-accent underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const inline = !className;
    if (inline) {
      return (
        <code className="rounded bg-axion-surface/70 px-1 py-px font-mono text-[10px] text-axion-text">
          {children}
        </code>
      );
    }
    return (
      <code className={`block font-mono text-[10px] text-axion-text-secondary ${className ?? ""}`}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="hide-scrollbar mb-2 overflow-x-auto rounded-md bg-black/35 px-2 py-1.5 last:mb-0">{children}</pre>
  ),
  h1: ({ children }) => <h3 className="mb-1.5 text-sm font-semibold text-axion-text">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-1 text-[13px] font-semibold text-axion-text">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-1 text-xs font-semibold text-axion-text">{children}</h5>,
};

export function TerminalAssistantMessage({
  text,
  pendingCommands,
  approval,
  busy,
  onAccept,
  onReject,
}: Props) {
  const showApproval = pendingCommands && pendingCommands.length > 0 && approval === "pending";
  const risky = pendingCommands ? commandsNeedApproval(pendingCommands) : false;

  return (
    <article className="min-w-0 py-0.5 pr-0.5">
      {text.trim() ? (
        <div className="assistant-md text-xs leading-relaxed text-axion-text-secondary">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {text}
          </ReactMarkdown>
        </div>
      ) : null}

      {showApproval ? (
        <div className="mt-3 space-y-2 rounded-lg border border-axion-border/70 bg-axion-bg/30 p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-axion-text-muted">
            {risky ? "Permission required" : "Run on server"}
          </p>
          <pre className="hide-scrollbar overflow-x-auto font-mono text-[10px] text-axion-text-muted">
            {pendingCommands.map((c) => `$ ${c}`).join("\n")}
          </pre>
          {risky ? (
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-200/90">
              <AlertTriangle size={12} className="mt-px shrink-0" />
              Destructive or high-impact commands — confirm before running.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <Check size={12} />
              {risky ? "Allow & run" : "Accept & run"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="inline-flex items-center gap-1 rounded-md border border-axion-border px-2.5 py-1 text-[11px] font-medium text-axion-text-secondary transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50"
            >
              <X size={12} />
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {approval === "rejected" ? (
        <p className="mt-1.5 text-[10px] text-axion-text-muted">Commands dismissed.</p>
      ) : null}

      {approval === "accepted" && !showApproval ? (
        <p className="mt-1.5 text-[10px] text-emerald-300/75">Accepted — ran on server.</p>
      ) : null}
    </article>
  );
}
