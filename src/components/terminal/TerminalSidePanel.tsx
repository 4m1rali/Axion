import { Bot, History, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { TerminalAiChat } from "./TerminalAiChat";

export type SidePanelMode = "history" | "ai";

type Props = {
  open: boolean;
  openWidthPx?: number;
  mode: SidePanelMode;
  onModeChange: (mode: SidePanelMode) => void;
  onToggle: () => void;
  serverLabel?: string;
  commands: string[];
  onPickCommand: (command: string) => void;
  connectionId: string;
  terminalReady: boolean;
  getRemoteCwd?: () => string | undefined;
  onRunAgentCommands: (commands: string[]) => Promise<string>;
  showHistory?: boolean;
};

const COLLAPSED_WIDTH_PX = 40;

export function TerminalSidePanel({
  open,
  openWidthPx = 288,
  mode,
  onModeChange,
  onToggle,
  serverLabel,
  commands,
  onPickCommand,
  connectionId,
  terminalReady,
  getRemoteCwd,
  onRunAgentCommands,
  showHistory = true,
}: Props) {
  const llmEnabled = useSettingsStore((s) => s.settings?.llmEnabled ?? false);
  const uniqueCommands = commands.filter((cmd, i) => commands.indexOf(cmd) === i);

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden rounded-xl border border-axion-border bg-axion-surface/50 ${
        open ? "" : "transition-[width] duration-200 ease-out"
      }`}
      style={{ width: open ? openWidthPx : COLLAPSED_WIDTH_PX }}
      aria-label="Terminal side panel"
    >
      <div className="flex shrink-0 flex-col border-b border-axion-border">
        <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
          {open ? (
            <div className="flex min-w-0 flex-1 gap-1 px-0.5">
              {showHistory ? (
                <button
                  type="button"
                  onClick={() => onModeChange("history")}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                    mode === "history"
                      ? "border-axion-accent/50 bg-axion-accent text-axion-on-primary"
                      : "border-axion-border bg-axion-bg/40 text-axion-text-secondary hover:bg-axion-hover hover:text-axion-text"
                  }`}
                >
                  <History size={12} />
                  History
                </button>
              ) : null}
              {llmEnabled ? (
                <button
                  type="button"
                  onClick={() => onModeChange("ai")}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                    mode === "ai"
                      ? "border-axion-accent/50 bg-axion-accent text-axion-on-primary"
                      : "border-axion-border bg-axion-bg/40 text-axion-text-secondary hover:bg-axion-hover hover:text-axion-text"
                  }`}
                >
                  <Bot size={12} />
                  AI
                </button>
              ) : null}
            </div>
          ) : (
            <span className="sr-only">Side panel collapsed</span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "Collapse panel" : "Expand panel"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-axion-text-muted transition hover:bg-axion-hover hover:text-axion-text"
          >
            {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
        {open && mode === "history" && serverLabel ? (
          <p className="truncate px-3 pb-2 text-[10px] text-axion-text-muted/90" title={serverLabel}>
            {serverLabel}
          </p>
        ) : null}
      </div>

      {open && mode === "history" && (
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
                  onClick={() => onPickCommand(cmd)}
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

      {open && mode === "ai" && (
        <TerminalAiChat
          serverLabel={serverLabel ?? "remote server"}
          connectionId={connectionId}
          terminalReady={terminalReady}
          getRemoteCwd={getRemoteCwd}
          onRunAgentCommands={onRunAgentCommands}
        />
      )}
    </aside>
  );
}
