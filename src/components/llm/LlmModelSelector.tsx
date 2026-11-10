import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PopoverPortal, popoverContains } from "../ui/PopoverPortal";

type Props = {
  model: string;
  models: string[];
  disabled?: boolean;
  onSelect: (model: string) => void;
  onAddModel?: (model: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  variant?: "default" | "composer";
  dropUp?: boolean;
};

function displayModelLabel(id: string): string {
  if (!id) return "Select model";
  const parts = id.split("/");
  return parts[parts.length - 1] ?? id;
}

export function LlmModelSelector({
  model,
  models,
  disabled,
  onSelect,
  onAddModel,
  onRefresh,
  loading,
  variant = "default",
  dropUp = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const allModels = useMemo(() => {
    const base = models.length > 0 ? models : model ? [model] : [];
    if (model && !base.includes(model)) return [...base, model];
    return base;
  }, [models, model]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allModels;
    return allModels.filter((id) => id.toLowerCase().includes(q));
  }, [allModels, query]);

  const addCandidate = query.trim();
  const canAdd =
    Boolean(onAddModel) &&
    addCandidate.length > 0 &&
    !allModels.some((id) => id.toLowerCase() === addCandidate.toLowerCase());

  const usePortal = variant === "composer" || dropUp;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverContains(target, triggerRef, panelRef.current)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const triggerClass =
    variant === "composer"
      ? "flex h-7 w-full min-w-0 max-w-full items-center gap-0.5 rounded-lg border border-axion-border bg-axion-bg/40 px-1.5 text-[10px] font-medium text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text disabled:opacity-50"
      : "flex w-full items-center justify-between gap-2 rounded-lg border border-axion-border bg-axion-bg/80 px-2.5 py-1.5 text-left text-[11px] text-axion-text transition hover:border-axion-accent/40 disabled:opacity-50";

  const listContent = (
    <>
      <div className="shrink-0 border-b border-axion-border p-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-axion-border bg-axion-bg px-2 py-1.5">
            <Search size={14} className="shrink-0 text-axion-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAdd) {
                  e.preventDefault();
                  onAddModel?.(addCandidate);
                  onSelect(addCandidate);
                  setOpen(false);
                  setQuery("");
                }
              }}
              placeholder="Search or type model id"
              className="min-w-0 flex-1 bg-transparent text-xs text-axion-text outline-none placeholder:text-axion-text-muted"
            />
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={loading}
              title="Fetch models from provider"
              className="shrink-0 text-[10px] font-medium text-axion-accent hover:underline disabled:opacity-50"
            >
              {loading ? "…" : "Update"}
            </button>
          ) : null}
        </div>
      </div>
      <ul className="hide-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {canAdd ? (
          <li>
            <button
              type="button"
              onClick={() => {
                onAddModel!(addCandidate);
                onSelect(addCandidate);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-axion-accent transition hover:bg-axion-hover"
            >
              <Plus size={14} className="shrink-0" />
              <span className="min-w-0 truncate">Add “{addCandidate}”</span>
            </button>
          </li>
        ) : null}
        {filtered.length === 0 && !canAdd ? (
          <li className="px-3 py-4 text-center text-xs text-axion-text-muted">
            {allModels.length === 0
              ? "Update to load models, or type a model id above"
              : "No models match"}
          </li>
        ) : (
          filtered.map((id) => {
            const selected = id === model;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-axion-text transition hover:bg-axion-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{id}</span>
                  {selected ? <Check size={14} className="shrink-0 text-axion-accent" /> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );

  return (
    <div className={variant === "composer" ? "relative w-full min-w-0" : "relative w-full"}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">
          {variant === "composer" ? displayModelLabel(model) : model || "Select model"}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-axion-text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && usePortal ? (
        <PopoverPortal open anchorRef={triggerRef} panelRef={panelRef} dropUp={dropUp} width={280}>
          <div className="flex min-h-0 flex-1 flex-col">{listContent}</div>
        </PopoverPortal>
      ) : null}

      {open && !usePortal ? (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 flex max-h-[min(22rem,50vh)] flex-col overflow-hidden rounded-xl border border-axion-border bg-axion-elevated shadow-2xl"
        >
          {listContent}
        </div>
      ) : null}
    </div>
  );
}
