import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TerminalAiComposer, type AiComposerMode } from "./TerminalAiComposer";
import { isLlmCancelledError, llmAbortChat, llmChat } from "../../lib/llm/api";
import { recordLlmRequest, recordLlmUsage } from "../../lib/llm/telemetry";
import { addModelToList, mergeModelLists } from "../../lib/llm/models";
import {
  AGENT_CONTINUE_AFTER_OUTPUT,
  AGENT_CONTINUE_WEAK_OUTPUT,
  AGENT_MAX_STEPS,
  AGENT_SUMMARIZE_AFTER_EXEC,
  buildLlmTurnsFromMessages,
  isWeakCapturedOutput,
} from "../../lib/llm/agentHistory";
import { TerminalAssistantMessage } from "./TerminalAssistantMessage";
import { TerminalExecCard } from "./TerminalExecCard";
import {
  extractAskMenu,
  extractShellCommands,
  formatAssistantMessageForDisplay,
  partitionCommandsByApproval,
} from "../../lib/llm/parseAssistant";
import { sanitizeModelOutput } from "../../lib/llm/sanitizeModel";
import { buildLlmChatMessages } from "../../lib/llm/systemPrompt";
import { resolveLlmApiUrl } from "../../lib/llm/providers";
import { useSettingsStore } from "../../stores/settingsStore";

export type AiChatMessage =
  | { id: string; kind: "user"; text: string }
  | {
      id: string;
      kind: "assistant";
      text: string;
      pendingCommands?: string[];
      approval?: "pending" | "accepted" | "rejected";
    }
  | {
      id: string;
      kind: "exec";
      commands: string[];
      status: "ok" | "error";
      output?: string;
      detail?: string;
    }
  | {
      id: string;
      kind: "ask";
      question: string;
      options: string[];
      selected?: string;
    };

type Props = {
  serverLabel: string;
  connectionId: string;
  terminalReady: boolean;
  getRemoteCwd?: () => string | undefined;
  onRunAgentCommands: (commands: string[]) => Promise<string>;
};

function chatStorageKey(connectionId: string) {
  return `axion-terminal-ai:${connectionId}`;
}

function loadMessages(connectionId: string): AiChatMessage[] {
  try {
    const raw = sessionStorage.getItem(chatStorageKey(connectionId));
    if (!raw) return [];
    return JSON.parse(raw) as AiChatMessage[];
  } catch {
    return [];
  }
}

function saveMessages(connectionId: string, messages: AiChatMessage[]) {
  try {
    sessionStorage.setItem(chatStorageKey(connectionId), JSON.stringify(messages.slice(-80)));
  } catch {
    /* quota */
  }
}

function execBlockSummary(commands: string[]): string {
  if (commands.length === 0) return "";
  if (commands.length === 1) {
    const cmd = commands[0]!;
    return cmd.length > 48 ? `${cmd.slice(0, 48)}…` : cmd;
  }
  const first = commands[0]!;
  const head = first.length > 28 ? `${first.slice(0, 28)}…` : first;
  return `${head} +${commands.length - 1} more`;
}

export function TerminalAiChat({
  serverLabel,
  connectionId,
  terminalReady,
  getRemoteCwd,
  onRunAgentCommands,
}: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadMessages(connectionId));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [composerMode, setComposerMode] = useState<AiComposerMode>("agent");
  const [execExpandOverride, setExecExpandOverride] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const runIdRef = useRef(0);
  const stoppedRef = useRef(false);

  const scrollToBottom = useCallback((instant = true) => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? "auto" : "smooth" });
  }, []);

  const onChatScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 56;
  }, []);

  const llmEnabled = settings?.llmEnabled ?? false;
  const model = settings?.llmModel ?? "";
  const models = settings?.llmModelsCache ?? [];
  const apiUrl = settings
    ? resolveLlmApiUrl(settings.llmProvider ?? "openai", settings.llmApiUrl)
    : "";

  const lastExecId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.kind === "exec") return m.id;
    }
    return null;
  }, [messages]);

  const isExecExpanded = useCallback(
    (id: string) => {
      if (id in execExpandOverride) return execExpandOverride[id]!;
      return id === lastExecId && !busy;
    },
    [busy, execExpandOverride, lastExecId],
  );

  const toggleExecExpanded = useCallback(
    (id: string) => {
      setExecExpandOverride((prev) => {
        const current = id in prev ? prev[id]! : id === lastExecId && !busy;
        return { ...prev, [id]: !current };
      });
    },
    [busy, lastExecId],
  );

  useEffect(() => {
    setMessages(loadMessages(connectionId));
    setExecExpandOverride({});
  }, [connectionId]);

  useEffect(() => {
    saveMessages(connectionId, messages);
  }, [connectionId, messages]);

  useLayoutEffect(() => {
    scrollToBottom(true);
  }, [messages, scrollToBottom]);

  const refreshModels = useCallback(async () => {
    if (!apiUrl || !settings) return;
    setModelsLoading(true);
    try {
      const { llmListModels } = await import("../../lib/llm/api");
      const fetched = await llmListModels(apiUrl);
      const merged = mergeModelLists(fetched, settings.llmModelsCache, [settings.llmModel, model]);
      if (merged.length > 0) await patch({ llmModelsCache: merged });
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "exec",
          commands: [],
          status: "error",
          detail: String(e),
        },
      ]);
    } finally {
      setModelsLoading(false);
    }
  }, [apiUrl, model, patch, settings]);

  const addModel = useCallback(
    async (id: string) => {
      if (!settings) return;
      const merged = addModelToList(settings.llmModelsCache, id);
      await patch({ llmModelsCache: merged, llmModel: id.trim() });
    },
    [patch, settings],
  );

  const runCommands = useCallback(
    async (commands: string[]) => {
      if (!terminalReady) {
        return {
          status: "error" as const,
          detail: "Terminal is not ready yet.",
          output: "",
        };
      }
      try {
        const output = await onRunAgentCommands(commands);
        return { status: "ok" as const, output };
      } catch (e) {
        return { status: "error" as const, detail: String(e), output: "" };
      }
    },
    [onRunAgentCommands, terminalReady],
  );

  const stopAgent = useCallback(() => {
    if (!busy) return;
    stoppedRef.current = true;
    runIdRef.current += 1;
    setBusy(false);
    void llmAbortChat();
    if (settings) {
      recordLlmRequest({
        kind: "chat",
        apiUrl,
        model,
        messageCount: messages.length,
        preview: "—",
        status: "cancelled",
      });
    }
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), kind: "assistant", text: "Stopped." },
    ]);
  }, [apiUrl, busy, messages.length, model, settings]);

  const runAgentPipeline = useCallback(
    async (baseMessages: AiChatMessage[], preview: string, runId: number) => {
      let local = baseMessages;
      let stepNudge: string | undefined;
      let messageCount = 0;
      let steps = 0;

      try {
        const hasKey = await invoke<boolean>("llm_has_api_key");
        if (!hasKey) throw new Error("Add an API key in Settings → LLM.");

        while (steps < AGENT_MAX_STEPS) {
          if (runId !== runIdRef.current || stoppedRef.current) return;

          const history = buildLlmTurnsFromMessages(local, stepNudge);
          stepNudge = undefined;

          const payload = buildLlmChatMessages({
            serverLabel,
            mode: composerMode,
            remoteCwd: getRemoteCwd?.(),
            history,
          });
          messageCount = payload.length;

          const { content: modelRaw, usage } = await llmChat(apiUrl, model, payload);
          if (runId !== runIdRef.current || stoppedRef.current) return;
          const raw = sanitizeModelOutput(modelRaw);

          recordLlmRequest({
            kind: "chat",
            apiUrl,
            model,
            messageCount: payload.length,
            preview: preview.slice(0, 160),
            status: "ok",
          });
          if (usage) recordLlmUsage(usage);

          const ask = extractAskMenu(raw);
          const commands = ask ? [] : extractShellCommands(raw);
          const { safe: safeCommands, dangerous: dangerousCommands } = partitionCommandsByApproval(commands);
          const pendingCommands = dangerousCommands.length > 0 ? dangerousCommands : undefined;
          const approval = pendingCommands?.length ? ("pending" as const) : undefined;
          const willAutoRunSafe = composerMode === "agent" && safeCommands.length > 0;
          const assistantText = formatAssistantMessageForDisplay(
            raw,
            willAutoRunSafe || (composerMode === "agent" && commands.length > 0 && !pendingCommands?.length),
            !!ask,
          );
          const assistantId = crypto.randomUUID();

          local = [
            ...local,
            {
              id: assistantId,
              kind: "assistant" as const,
              text: assistantText,
              pendingCommands,
              approval,
            },
          ];
          setMessages(local);

          if (ask) {
            local = [
              ...local,
              {
                id: crypto.randomUUID(),
                kind: "ask" as const,
                question: ask.question,
                options: ask.options,
              },
            ];
            setMessages(local);
            return;
          }

          if (commands.length === 0) return;

          if (composerMode !== "agent") return;

          let lastOutput: string | undefined;
          let ranExecThisTurn = false;

          if (safeCommands.length > 0) {
            const safeResult = await runCommands(safeCommands);
            if (runId !== runIdRef.current || stoppedRef.current) return;
            lastOutput = safeResult.output;
            ranExecThisTurn = true;
            local = [
              ...local,
              {
                id: crypto.randomUUID(),
                kind: "exec" as const,
                commands: safeCommands,
                status: safeResult.status,
                output: safeResult.output || undefined,
                detail: "detail" in safeResult ? safeResult.detail : undefined,
              },
            ];
            setMessages(local);
            if (safeResult.status === "error") return;
          }

          if (dangerousCommands.length > 0 && !ranExecThisTurn) return;

          steps += 1;
          if (steps >= AGENT_MAX_STEPS) {
            local = [
              ...local,
              {
                id: crypto.randomUUID(),
                kind: "assistant" as const,
                text: "Reached the agent step limit. Tell me if you want me to continue.",
              },
            ];
            setMessages(local);
            return;
          }

          if (ranExecThisTurn) {
            stepNudge =
              dangerousCommands.length > 0
                ? `${AGENT_SUMMARIZE_AFTER_EXEC} (Some destructive commands are still waiting for the user to tap Allow & run — mention that only if relevant.)`
                : isWeakCapturedOutput(lastOutput)
                  ? `${AGENT_SUMMARIZE_AFTER_EXEC}\n\n${AGENT_CONTINUE_WEAK_OUTPUT}`
                  : AGENT_SUMMARIZE_AFTER_EXEC;
            continue;
          }

          stepNudge = isWeakCapturedOutput(lastOutput)
            ? AGENT_CONTINUE_WEAK_OUTPUT
            : AGENT_CONTINUE_AFTER_OUTPUT;
        }
      } catch (e) {
        if (runId !== runIdRef.current || stoppedRef.current || isLlmCancelledError(e)) return;
        recordLlmRequest({
          kind: "chat",
          apiUrl,
          model,
          messageCount,
          preview: preview.slice(0, 160),
          status: "error",
          detail: String(e),
        });
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            kind: "assistant",
            text: `Could not reach the model: ${String(e)}`,
          },
        ]);
      } finally {
        if (runId === runIdRef.current) setBusy(false);
      }
    },
    [apiUrl, composerMode, getRemoteCwd, model, runCommands, serverLabel],
  );

  const runApprovedCommands = useCallback(
    async (assistantId: string, commands: string[]) => {
      if (busy || !commands.length) return;
      stickToBottomRef.current = true;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      stoppedRef.current = false;
      setBusy(true);

      setMessages((prev) =>
        prev.map((m) =>
          m.kind === "assistant" && m.id === assistantId
            ? { ...m, approval: "accepted" as const, pendingCommands: commands }
            : m,
        ),
      );

      const result = await runCommands(commands);
      if (runId !== runIdRef.current || stoppedRef.current) return;

      const execMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        kind: "exec",
        commands,
        status: result.status,
        output: result.output || undefined,
        detail: "detail" in result ? result.detail : undefined,
      };

      setMessages((prev) => {
        const cleared = prev.map((m) =>
          m.kind === "assistant" && m.id === assistantId ? { ...m, pendingCommands: undefined } : m,
        );
        const next = [...cleared, execMsg];
        if (composerMode === "agent" && result.status === "ok") {
          const nudge = isWeakCapturedOutput(result.output)
            ? `${AGENT_SUMMARIZE_AFTER_EXEC}\n\n${AGENT_CONTINUE_WEAK_OUTPUT}`
            : AGENT_SUMMARIZE_AFTER_EXEC;
          void runAgentPipeline(next, nudge, runId);
        } else if (runId === runIdRef.current) {
          setBusy(false);
        }
        return next;
      });
    },
    [busy, composerMode, runAgentPipeline, runCommands],
  );

  const dismissPendingCommands = useCallback((assistantId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === "assistant" && m.id === assistantId
          ? { ...m, approval: "rejected" as const, pendingCommands: undefined }
          : m,
      ),
    );
  }, []);

  const pickAskOption = useCallback(
    async (askId: string, choice: string) => {
      if (busy) return;
      stickToBottomRef.current = true;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      stoppedRef.current = false;
      setBusy(true);

      const picked = messages.map((m) =>
        m.kind === "ask" && m.id === askId ? { ...m, selected: choice } : m,
      );
      const local: AiChatMessage[] = [
        ...picked,
        { id: crypto.randomUUID(), kind: "user", text: choice },
      ];
      setMessages(local);
      await runAgentPipeline(local, choice, runId);
    },
    [busy, messages, runAgentPipeline],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy || !llmEnabled || !settings) return;
    setDraft("");
    stickToBottomRef.current = true;
    const userMsg: AiChatMessage = { id: crypto.randomUUID(), kind: "user", text };
    const local = [...messages, userMsg];
    setMessages(local);
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    stoppedRef.current = false;
    setBusy(true);
    await runAgentPipeline(local, text, runId);
  }, [busy, draft, llmEnabled, messages, runAgentPipeline, settings]);

  if (!llmEnabled) {
    return (
      <h3 className="py-6 text-center text-xs text-axion-text-muted">
        Enable LLM in Settings and add your provider API key to use the assistant.
      </h3>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onChatScroll}
        className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 py-2 pb-1"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs leading-relaxed text-axion-text-muted">
            Ask in plain language — e.g. “create a folder named logs” or “show disk usage”.
          </p>
        ) : (
          messages.map((msg) => {
            if (msg.kind === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[min(100%,22rem)] rounded-2xl bg-axion-surface/55 px-3 py-2 text-xs leading-relaxed text-axion-text">
                    {msg.text}
                  </div>
                </div>
              );
            }
            if (msg.kind === "assistant") {
              return (
                <TerminalAssistantMessage
                  key={msg.id}
                  text={msg.text}
                  pendingCommands={msg.pendingCommands}
                  approval={msg.approval}
                  busy={busy}
                  onAccept={
                    msg.pendingCommands?.length
                      ? () => void runApprovedCommands(msg.id, msg.pendingCommands!)
                      : undefined
                  }
                  onReject={() => dismissPendingCommands(msg.id)}
                />
              );
            }
            if (msg.kind === "ask") {
              return (
                <div
                  key={msg.id}
                  className="rounded-lg border border-axion-accent/35 bg-axion-accent/5 px-2.5 py-2"
                >
                  <p className="text-[11px] font-medium leading-snug text-axion-text">{msg.question}</p>
                  <ul className="mt-2 space-y-1.5">
                    {msg.options.map((opt) => {
                      const picked = msg.selected === opt;
                      return (
                        <li key={opt}>
                          <button
                            type="button"
                            disabled={busy || Boolean(msg.selected)}
                            onClick={() => void pickAskOption(msg.id, opt)}
                            className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                              picked
                                ? "border-axion-accent/50 bg-axion-accent/15 text-axion-text"
                                : msg.selected
                                  ? "border-axion-border/50 bg-axion-bg/20 text-axion-text-muted opacity-60"
                                  : "border-axion-border bg-axion-bg/40 text-axion-text-secondary hover:border-axion-accent/40 hover:bg-axion-hover"
                            }`}
                          >
                            {opt}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }
            const expanded = isExecExpanded(msg.id);
            const summary = execBlockSummary(msg.commands);
            return (
              <TerminalExecCard
                key={msg.id}
                commands={msg.commands}
                status={msg.status}
                output={msg.output}
                detail={msg.detail}
                cwd={getRemoteCwd?.()}
                expanded={expanded}
                summary={summary}
                onToggle={() => toggleExecExpanded(msg.id)}
              />
            );
          })
        )}
        {busy ? (
          <div className="flex items-center gap-2 py-0.5 text-[11px] text-axion-text-muted">
            <Loader2 size={13} className="animate-spin opacity-80" />
            {composerMode === "agent" ? "Working…" : "Thinking…"}
          </div>
        ) : null}
      </div>

      <TerminalAiComposer
        draft={draft}
        busy={busy}
        model={model}
        models={models}
        modelsLoading={modelsLoading}
        mode={composerMode}
        onDraftChange={setDraft}
        onSend={() => void send()}
        onStop={() => stopAgent()}
        onModeChange={setComposerMode}
        onModelSelect={(id) => void patch({ llmModel: id })}
        onAddModel={(id) => void addModel(id)}
        onRefreshModels={() => void refreshModels()}
      />
    </div>
  );
}
