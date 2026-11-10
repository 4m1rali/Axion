import { History } from "lucide-react";

type Props = {
  onClick: () => void;
  count: number;
  open: boolean;
};

export function TerminalHistoryButton({ onClick, count, open }: Props) {
  return (
    <button
      type="button"
      aria-label="Command history"
      aria-expanded={open}
      title="Command history"
      onClick={onClick}
      className={`absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        open
          ? "border-axion-accent/50 bg-axion-accent/15 text-axion-accent"
          : "border-axion-border/60 bg-axion-surface/90 text-axion-text-muted hover:border-axion-accent/40 hover:text-axion-text"
      }`}
    >
      <History size={16} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-axion-accent px-1 text-[9px] font-semibold text-black">
          {count > 99 ? "99" : count}
        </span>
      )}
    </button>
  );
}
