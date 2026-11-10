type Props = {
  matches: string[];
  onPick: (command: string) => void;
};

export function TerminalCommandHints({ matches, onPick }: Props) {
  if (matches.length === 0) return null;

  return (
    <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-1.5 rounded-lg border border-axion-border/70 bg-axion-elevated/95 px-2 py-1.5 shadow-lg backdrop-blur-sm">
      <span className="w-full text-[10px] font-medium uppercase tracking-wide text-axion-text-muted">
        Suggestions · Tab for first
      </span>
      {matches.map((cmd) => (
        <button
          key={cmd}
          type="button"
          onClick={() => onPick(cmd)}
          className="max-w-full truncate rounded-md border border-axion-border/50 bg-axion-surface px-2 py-1 text-left font-mono text-[11px] text-axion-text-secondary transition hover:border-axion-accent/40 hover:text-axion-text"
          title={cmd}
        >
          {cmd}
        </button>
      ))}
    </div>
  );
}
