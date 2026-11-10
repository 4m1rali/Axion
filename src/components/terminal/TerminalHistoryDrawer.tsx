import { PanelRightClose, PanelRightOpen } from "lucide-react";

type Props = {
  open: boolean;
  commands: string[];
  onToggle: () => void;
  onPick: (command: string) => void;
};

export function TerminalHistoryPanel({
  open,
  commands,
  serverLabel,
  onToggle,
  onPick,
}: Props & { serverLabel?: string }) {
  const uniqueCommands = commands.filter((cmd, i) => commands.indexOf(cmd) === i);

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden rounded-l-xl border border-axion-border bg-axion-elevated shadow-sm transition-[width] duration-200 ease-out ${
        open ? "w-[min(100%,18rem)]" : "w-10"
      }`}
      aria-label="Command history"
    >
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-axion-border px-1.5 py-2">
        {open ? (
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-axion-text-muted">
              Command history
            </h2>
            {serverLabel ? (
              <p className="mt-0.5 truncate text-[10px] text-axion-text-muted/90" title={serverLabel}>
                {serverLabel}
              </p>
            ) : null}
          </div>
        ) : (
          <span className="sr-only">Command history collapsed</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse command history" : "Expand command history"}
          title={open ? "Hide history" : "Show history"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-axion-text-muted transition hover:bg-axion-hover hover:text-axion-text"
        >
          {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>
      {open && (
        <ul className="hide-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
          {commands.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-axion-text-muted">
              Commands you run in Axion on this server appear here.
            </li>
          ) : (
            uniqueCommands.map((cmd) => (
              <li key={cmd}>
                <button
                  type="button"
                  onClick={() => onPick(cmd)}
                  className="block w-full truncate px-3 py-2 text-left font-mono text-[11px] text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text"
                  title={cmd}
                >
                  {cmd}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </aside>
  );
}
