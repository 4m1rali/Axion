import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "xterm";
import {
  TerminalSidePanel,
  type SidePanelMode,
} from "../components/terminal/TerminalSidePanel";
import { TerminalServerMonitor } from "../components/TerminalServerMonitor";
import { Skeleton } from "../components/ui/Skeleton";
import {
  mergeLegacyConnectionHistory,
  readTerminalHistory,
  serverHistoryKey,
} from "../lib/terminalHistory";
import { AxionSelect } from "../components/ui/AxionSelect";
import { isSessionDeadError } from "../lib/sessionErrors";
import { createTerminalInputController, type TerminalInputController } from "../lib/terminalInput";
import { TerminalOutputCapture } from "../lib/terminal/outputCapture";
import { parseCwdFromTerminalTail } from "../lib/terminal/terminalCwd";
import { runAgentCommandsWithCapture } from "../lib/terminal/runAgentCommands";
import {
  clampSidePanelWidth,
  loadSidePanelWidth,
  saveSidePanelWidth,
  TERMINAL_SIDE_PANEL_WIDTH_DEFAULT,
} from "../lib/terminal/sidePanelWidth";
import type { ConnectionProfile } from "../lib/api";
import {
  findProfileForTarget,
  reconnectSshSession,
  targetFromConnection,
  type ReconnectTarget,
} from "../lib/sshReconnect";
import { useSessionStore, type ConnectionRow } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import "xterm/css/xterm.css";

function whenTerminalSized(host: HTMLElement, fit: FitAddon, term: Terminal): Promise<void> {
  return new Promise((resolve) => {
    const tryFit = () => {
      fit.fit();
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 8 && h > 8 && term.cols >= 2 && term.rows >= 2) {
        resolve();
        return;
      }
      requestAnimationFrame(tryFit);
    };
    requestAnimationFrame(tryFit);
  });
}

function isReopenShortcut(e: KeyboardEvent) {
  return e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p");
}

export function TerminalPage() {
  const connections = useSessionStore((s) => s.connections);
  const setConnections = useSessionStore((s) => s.setConnections);
  const terminalCommandHistory = useSettingsStore(
    (s) => s.settings?.terminalCommandHistory ?? true,
  );
  const terminalCommandHints = useSettingsStore((s) => s.settings?.terminalCommandHints ?? true);
  const llmEnabled = useSettingsStore((s) => s.settings?.llmEnabled ?? false);
  const appPage = useUiStore((s) => s.page);
  const [connectionId, setConnectionId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [sidePanelWidth, setSidePanelWidth] = useState(loadSidePanelWidth);
  const [sidePanelResizing, setSidePanelResizing] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("history");
  const layoutRowRef = useRef<HTMLDivElement>(null);
  const sidePanelDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [terminalBackendReady, setTerminalBackendReady] = useState(false);
  const activeConn = useMemo(
    () => connections.find((c) => c.id === connectionId),
    [connections, connectionId],
  );
  const historyKey = useMemo(() => {
    if (!activeConn) return "";
    return serverHistoryKey({
      host: activeConn.host,
      port: activeConn.port,
      username: activeConn.username,
    });
  }, [activeConn]);
  const terminalHistoryCommands = useMemo(
    () => (historyKey ? readTerminalHistory(historyKey) : []),
    [historyKey, historyRevision],
  );
  const serverLabel = activeConn
    ? `${activeConn.username}@${activeConn.host}${activeConn.port !== 22 ? `:${activeConn.port}` : ""}`
    : "";
  const [error, setError] = useState("");
  const [sessionDead, setSessionDead] = useState(false);
  const [terminalEpoch, setTerminalEpoch] = useState(0);
  const [reopening, setReopening] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const backendTerminalIdRef = useRef("");
  const reopenBusyRef = useRef(false);
  const reconnectTargetRef = useRef<ReconnectTarget | null>(null);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const autoRecoverRef = useRef(0);

  const refreshConnections = useCallback(async () => {
    const list = await invoke<ConnectionRow[]>("ssh_list_connections");
    setConnections(
      list.map((c) => ({
        id: c.id,
        host: c.host,
        port: c.port,
        username: c.username,
        connectedAt: c.connectedAt,
      })),
    );
    return list;
  }, [setConnections]);

  useEffect(() => {
    void invoke<ConnectionProfile[]>("profiles_list").then(setProfiles).catch(() => undefined);
  }, []);

  useEffect(() => {
    const row = connections.find((c) => c.id === connectionId);
    if (row) reconnectTargetRef.current = targetFromConnection(row);
  }, [connectionId, connections]);

  const trySshReconnect = useCallback(async (): Promise<string | null> => {
    const target = reconnectTargetRef.current;
    if (!target) return null;
    const profile = findProfileForTarget(profiles, target);
    if (profile) {
      reconnectTargetRef.current = { ...target, profileId: profile.id };
    }
    const newId = await reconnectSshSession(target, profiles);
    setConnectionId(newId);
    await refreshConnections();
    setSessionDead(false);
    setError("");
    return newId;
  }, [profiles, refreshConnections]);

  const closeBackendTerminal = useCallback(async (terminalId: string) => {
    if (!terminalId) return;
    try {
      await invoke("terminal_close", { terminalId });
    } catch {
      /* already gone */
    }
  }, []);

  const reopenTerminal = useCallback(async () => {
    if (reopenBusyRef.current) return;
    reopenBusyRef.current = true;
    setReopening(true);
    setError("");

    try {
      if (sessionDead || !connectionId || !connections.some((c) => c.id === connectionId)) {
        await trySshReconnect();
      }
    } catch (e) {
      setSessionDead(true);
      setError(String(e));
      setReopening(false);
      reopenBusyRef.current = false;
      return;
    }

    const oldId = backendTerminalIdRef.current;
    backendTerminalIdRef.current = "";
    await closeBackendTerminal(oldId);

    setSessionDead(false);
    setTerminalEpoch((n) => n + 1);
  }, [
    closeBackendTerminal,
    connectionId,
    connections,
    sessionDead,
    trySshReconnect,
  ]);

  const reopenRef = useRef(reopenTerminal);
  reopenRef.current = reopenTerminal;
  const inputCtrlRef = useRef<TerminalInputController | null>(null);
  const hintPickerRef = useRef<(cmd: string) => void>(() => undefined);
  const runCommandRef = useRef<(cmd: string) => void>(() => undefined);
  const outputCaptureRef = useRef(new TerminalOutputCapture());

  const getRemoteCwd = useCallback(() => {
    return parseCwdFromTerminalTail(outputCaptureRef.current.tail());
  }, []);

  const runAgentCommands = useCallback(async (commands: string[]) => {
    return runAgentCommandsWithCapture(
      commands,
      (cmd) => runCommandRef.current(cmd),
      outputCaptureRef.current,
    );
  }, []);

  const beginSidePanelResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!historyOpen) return;
      e.preventDefault();
      sidePanelDragRef.current = { startX: e.clientX, startW: sidePanelWidth };
      setSidePanelResizing(true);
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const drag = sidePanelDragRef.current;
        if (!drag) return;
        const delta = drag.startX - ev.clientX;
        const containerW = layoutRowRef.current?.clientWidth;
        setSidePanelWidth(clampSidePanelWidth(drag.startW + delta, containerW));
      };

      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        sidePanelDragRef.current = null;
        setSidePanelResizing(false);
        setSidePanelWidth((w) => {
          saveSidePanelWidth(w);
          return w;
        });
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        window.dispatchEvent(new Event("resize"));
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [historyOpen, sidePanelWidth],
  );

  const resetSidePanelWidth = useCallback(() => {
    const containerW = layoutRowRef.current?.clientWidth;
    const w = clampSidePanelWidth(TERMINAL_SIDE_PANEL_WIDTH_DEFAULT, containerW);
    setSidePanelWidth(w);
    saveSidePanelWidth(w);
    window.dispatchEvent(new Event("resize"));
  }, []);

  useEffect(() => {
    if (connections.length > 0 && !connectionId) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections]);

  useEffect(() => {
    setTerminalBackendReady(false);
  }, [connectionId, terminalEpoch]);

  useEffect(() => {
    if (llmEnabled && !terminalCommandHistory) setSidePanelMode("ai");
  }, [llmEnabled, terminalCommandHistory]);

  useEffect(() => {
    if (appPage !== "terminal") return;
    const id = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => window.clearTimeout(id);
  }, [appPage]);

  useEffect(() => {
    if (!connectionId || !historyKey) return;
    mergeLegacyConnectionHistory(connectionId, historyKey);
  }, [connectionId, historyKey, terminalEpoch, historyOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isReopenShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      void reopenRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !connectionId) {
      reopenBusyRef.current = false;
      return;
    }

    let disposed = false;
    host.replaceChildren();

    const term = new Terminal({
      fontFamily: "Consolas, monospace",
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: "#121212",
        foreground: "#f5f5f5",
        cursor: "#80c0e0",
      },
      scrollback: 8000,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(host);

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && isReopenShortcut(e)) {
        e.preventDefault();
        void reopenRef.current();
        return false;
      }
      return true;
    });

    const focusTerm = () => {
      term.focus();
      const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
      textarea?.focus();
    };
    const onHostPointer = () => focusTerm();
    host.addEventListener("mousedown", onHostPointer);
    host.addEventListener("focus", onHostPointer);

    let ghostLen = 0;
    const clearGhost = () => {
      if (ghostLen > 0) {
        term.write("\b".repeat(ghostLen) + "\x1b[K");
        ghostLen = 0;
      }
    };
    const showGhost = (suffix: string) => {
      if (!terminalCommandHints || !suffix) {
        clearGhost();
        return;
      }
      clearGhost();
      term.write(`\x1b[90m${suffix}\x1b[39m`);
      ghostLen = suffix.length;
    };
    const scheduleGhost = (ctrl: TerminalInputController) => {
      if (!terminalCommandHints) return;
      requestAnimationFrame(() => showGhost(ctrl.getGhostSuffix()));
    };

    const output = new Channel<ArrayBuffer | Uint8Array>();
    output.onmessage = (chunk) => {
      if (disposed) return;
      clearGhost();
      const bytes =
        chunk instanceof ArrayBuffer
          ? new Uint8Array(chunk)
          : chunk instanceof Uint8Array
            ? chunk
            : new Uint8Array(chunk as ArrayBuffer);
      term.write(bytes);
      outputCaptureRef.current.push(bytes);
      if (inputCtrlRef.current) scheduleGhost(inputCtrlRef.current);
    };

    const terminalIdRef = { current: "" };
    const pendingInput: string[] = [];

    const sendInput = (id: string, data: string) => {
      const bytes = new TextEncoder().encode(data);
      void invoke("terminal_input", {
        terminalId: id,
        data: Array.from(bytes),
      }).catch((e) => {
        const msg = String(e);
        if (isSessionDeadError(msg)) {
          setSessionDead(true);
          setError(msg);
        }
      });
    };

    const inputCtrl = createTerminalInputController({
      historyEnabled: terminalCommandHistory,
      hintsEnabled: terminalCommandHints,
      historyKey,
      send: (data) => {
        const id = terminalIdRef.current;
        if (!id) return;
        sendInput(id, data);
      },
      onHints: () => {},
      onInlineGhost: (suffix) => {
        if (disposed) return;
        requestAnimationFrame(() => showGhost(suffix));
      },
      onHistoryChange: () => {
        if (!disposed) setHistoryRevision((n) => n + 1);
      },
    });
    inputCtrlRef.current = inputCtrl;
    hintPickerRef.current = inputCtrl.applyHint;
    inputCtrl.reset();

    const dataSub = term.onData((data) => {
      const id = terminalIdRef.current;
      if (!id) {
        pendingInput.push(data);
        return;
      }
      if (terminalCommandHistory || terminalCommandHints) {
        clearGhost();
        inputCtrl.handleData(data);
        scheduleGhost(inputCtrl);
        return;
      }
      sendInput(id, data);
    });

    const boot = async () => {
      try {
        setError("");
        setSessionDead(false);
        await whenTerminalSized(host, fit, term);
        if (disposed) return;
        focusTerm();

        const id = await invoke<string>("terminal_open", {
          connectionId,
          cols: term.cols,
          rows: term.rows,
          output,
        });
        if (disposed) {
          await closeBackendTerminal(id);
          return;
        }
        terminalIdRef.current = id;
        backendTerminalIdRef.current = id;
        outputCaptureRef.current.reset();
        setTerminalBackendReady(true);
        runCommandRef.current = (cmd) => {
          const line = cmd.endsWith("\n") ? cmd : `${cmd}\n`;
          sendInput(id, line);
        };
        setReopening(false);
        reopenBusyRef.current = false;
        focusTerm();
        await invoke("terminal_resize", {
          terminalId: id,
          cols: term.cols,
          rows: term.rows,
        });
        for (const line of pendingInput) {
          if (terminalCommandHistory || terminalCommandHints) {
            inputCtrl.handleData(line);
          } else {
            sendInput(id, line);
          }
        }
        pendingInput.length = 0;
        focusTerm();
      } catch (e) {
        const msg = String(e);
        setSessionDead(true);
        setError(msg);
        setReopening(false);
        reopenBusyRef.current = false;
      }
    };

    void boot();

    const ro = new ResizeObserver(() => {
      fit.fit();
      const id = terminalIdRef.current;
      if (!id || term.cols < 1 || term.rows < 1) return;
      void invoke("terminal_resize", {
        terminalId: id,
        cols: term.cols,
        rows: term.rows,
      });
    });
    ro.observe(host);

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      host.removeEventListener("mousedown", onHostPointer);
      host.removeEventListener("focus", onHostPointer);
      dataSub.dispose();
      const id = terminalIdRef.current || backendTerminalIdRef.current;
      terminalIdRef.current = "";
      if (id && backendTerminalIdRef.current === id) {
        backendTerminalIdRef.current = "";
      }
      void closeBackendTerminal(id);
      inputCtrlRef.current = null;
      runCommandRef.current = () => undefined;
      setTerminalBackendReady(false);
      term.dispose();
      host.replaceChildren();
    };
  }, [
    connectionId,
    terminalEpoch,
    closeBackendTerminal,
    terminalCommandHistory,
    terminalCommandHints,
    historyKey,
  ]);

  useEffect(() => {
    if (!sessionDead || !reconnectTargetRef.current) return;
    const now = Date.now();
    if (now - autoRecoverRef.current < 5000) return;
    autoRecoverRef.current = now;
    setReopening(true);
    void trySshReconnect()
      .then((id) => {
        if (id) setTerminalEpoch((n) => n + 1);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setReopening(false));
  }, [sessionDead, trySshReconnect]);

  const showSidePanel = Boolean(connectionId) && (terminalCommandHistory || llmEnabled);

  const showOverlay = sessionDead || Boolean(error);
  const overlayMessage = error || "SSH session is unavailable.";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <AxionSelect
          value={connectionId || ""}
          onChange={setConnectionId}
          disabled={connections.length === 0}
          aria-label="Active session"
          className="min-w-[14rem]"
          options={
            connections.length === 0
              ? [{ value: "", label: "No active session", disabled: true }]
              : connections.map((c) => ({
                  value: c.id,
                  label: `${c.username}@${c.host}`,
                }))
          }
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        <div
          ref={layoutRowRef}
          className={`flex min-h-0 flex-1 overflow-hidden ${sidePanelResizing ? "select-none" : showSidePanel && historyOpen ? "gap-0" : "gap-2"}`}
        >
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-axion-border bg-[#121212]">
            <div
              key={`term-${connectionId}-${terminalEpoch}`}
              ref={hostRef}
              tabIndex={0}
              className="absolute inset-0 overflow-hidden outline-none"
            />
        {showOverlay && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/90 px-6 text-center">
            {reopening ? (
              <div className="flex w-full max-w-sm flex-col items-center gap-3" aria-busy aria-label="Reconnecting">
                <Skeleton className="h-3 w-52 bg-axion-border/25" />
                <Skeleton className="h-28 w-full rounded-lg bg-axion-border/20" />
                <Skeleton className="h-3 w-40 bg-axion-border/25" />
              </div>
            ) : (
            <p className="max-w-md text-sm text-axion-text-muted">{overlayMessage}</p>
            )}
            {!reopening && (
              <p className="mt-3 text-xs text-axion-text-muted/75">
                Press{" "}
                <kbd className="rounded border border-axion-border/60 bg-axion-surface/80 px-1.5 py-0.5 font-mono text-[10px] text-axion-text-secondary">
                  Ctrl
                </kbd>
                {" + "}
                <kbd className="rounded border border-axion-border/60 bg-axion-surface/80 px-1.5 py-0.5 font-mono text-[10px] text-axion-text-secondary">
                  Shift
                </kbd>
                {" + "}
                <kbd className="rounded border border-axion-border/60 bg-axion-surface/80 px-1.5 py-0.5 font-mono text-[10px] text-axion-text-secondary">
                  P
                </kbd>{" "}
                to reconnect and open a fresh terminal
              </p>
            )}
          </div>
        )}
          </div>
          {showSidePanel && historyOpen ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side panel"
            title="Drag to resize · double-click to reset"
            onPointerDown={beginSidePanelResize}
            onDoubleClick={resetSidePanelWidth}
            className={`relative z-10 -mx-0.5 w-2 shrink-0 cursor-col-resize touch-none ${
              sidePanelResizing ? "bg-axion-accent/30" : "bg-transparent hover:bg-axion-accent/15"
            }`}
          />
        ) : null}
        {showSidePanel && (
          <TerminalSidePanel
            key={connectionId}
            open={historyOpen}
            openWidthPx={sidePanelWidth}
            mode={sidePanelMode}
            onModeChange={setSidePanelMode}
            serverLabel={serverLabel}
            connectionId={connectionId}
            terminalReady={terminalBackendReady && !sessionDead}
            getRemoteCwd={getRemoteCwd}
            commands={terminalHistoryCommands}
            onToggle={() => setHistoryOpen((o) => !o)}
            onPickCommand={(cmd) => hintPickerRef.current(cmd)}
            onRunAgentCommands={runAgentCommands}
            showHistory={terminalCommandHistory}
          />
        )}
        </div>
        <TerminalServerMonitor connectionId={connectionId} />
      </div>
    </div>
  );
}
