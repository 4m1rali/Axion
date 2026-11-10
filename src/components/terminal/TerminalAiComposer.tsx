import { ArrowUp, ChevronDown, Infinity, Paperclip, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LlmModelSelector } from "../llm/LlmModelSelector";
import { PopoverPortal, popoverContains } from "../ui/PopoverPortal";

export type AiComposerMode = "agent" | "ask";

type Props = {
  draft: string;
  busy: boolean;
  disabled?: boolean;
  model: string;
  models: string[];
  modelsLoading?: boolean;
  mode: AiComposerMode;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onModeChange: (mode: AiComposerMode) => void;
  onModelSelect: (model: string) => void;
  onAddModel?: (model: string) => void;
  onRefreshModels?: () => void;
};

export function TerminalAiComposer({
  draft,
  busy,
  disabled,
  model,
  models,
  modelsLoading,
  mode,
  onDraftChange,
  onSend,
  onStop,
  onModeChange,
  onModelSelect,
  onAddModel,
  onRefreshModels,
}: Props) {
  const [modeOpen, setModeOpen] = useState(false);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const modePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modeOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (popoverContains(e.target as Node, modeTriggerRef, modePanelRef.current)) return;
      setModeOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [modeOpen]);

  const canSend = !busy && !disabled && draft.trim().length > 0;

  return (
    <div className="shrink-0 px-2 pb-2">
      <div className="flex flex-col rounded-xl border border-axion-border bg-axion-surface/50">
        <textarea
          rows={2}
          value={draft}
          disabled={busy || disabled}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Ask the assistant…"
          className="block max-h-24 min-h-[2.75rem] w-full resize-none bg-transparent px-3 pb-0 pt-2.5 text-xs leading-relaxed text-axion-text outline-none placeholder:text-axion-text-muted disabled:opacity-50"
        />

        <div className="flex min-w-0 items-center gap-1 px-2 pb-2 pt-1">
          <button
            ref={modeTriggerRef}
            type="button"
            disabled={disabled || busy}
            onClick={() => setModeOpen((v) => !v)}
            className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-axion-border bg-axion-bg/40 px-1.5 text-[10px] font-medium text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text disabled:opacity-50"
          >
            <Infinity size={12} className="text-axion-text-muted" />
            <span>{mode === "agent" ? "Agent" : "Ask"}</span>
            <ChevronDown size={12} className="text-axion-text-muted" />
          </button>
          {modeOpen ? (
            <PopoverPortal
              open
              anchorRef={modeTriggerRef}
              panelRef={modePanelRef}
              dropUp
              width={200}
            >
              <div className="py-1">
                {(["agent", "ask"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onModeChange(id);
                      setModeOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[11px] transition hover:bg-axion-hover ${
                      mode === id ? "text-axion-accent" : "text-axion-text"
                    }`}
                  >
                    {id === "agent" ? "Agent" : "Ask"}
                    <span className="mt-0.5 block text-[10px] font-normal text-axion-text-muted">
                      {id === "agent" ? "Runs shell commands" : "Chat only"}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverPortal>
          ) : null}

          <div className="min-w-0 flex-1">
            <LlmModelSelector
              variant="composer"
              dropUp
              model={model}
              models={models}
              loading={modelsLoading}
              disabled={disabled || busy}
              onSelect={onModelSelect}
              onAddModel={onAddModel}
              onRefresh={onRefreshModels}
            />
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled
              title="Attachments coming soon"
              className="flex h-7 w-7 items-center justify-center rounded-full text-axion-text-muted/45"
              aria-hidden
            >
              <Paperclip size={14} />
            </button>

            {busy ? (
              <button
                type="button"
                onClick={() => onStop?.()}
                aria-label="Stop agent"
                title="Stop"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-axion-border bg-axion-bg/60 text-axion-text transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-300"
              >
                <Square size={12} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSend}
                onClick={() => onSend()}
                aria-label="Send message"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                  canSend
                    ? "bg-axion-accent text-axion-on-primary hover:opacity-90"
                    : "border border-axion-border bg-axion-bg/40 text-axion-text-muted"
                }`}
              >
                <ArrowUp size={15} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
