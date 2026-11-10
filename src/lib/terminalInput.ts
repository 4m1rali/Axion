import { pushTerminalHistory, readTerminalHistory } from "./terminalHistory";

const COMMON_COMMANDS = [
  "clear",
  "ls",
  "cd",
  "pwd",
  "top",
  "htop",
  "df",
  "nano",
  "vim",
  "apt",
  "systemctl",
  "docker",
  "git",
];

export type TerminalInputOptions = {
  historyEnabled: boolean;
  hintsEnabled: boolean;
  /** Per-server storage key (user@host:port), not ephemeral connection id */
  historyKey: string;
  send: (data: string) => void;
  onHints: (matches: string[]) => void;
  onInlineGhost: (suffix: string) => void;
  onHistoryChange?: (commands: string[]) => void;
};

function hintPool(history: string[]): string[] {
  const seen = new Set(history);
  const extra = COMMON_COMMANDS.filter((c) => !seen.has(c));
  return [...history, ...extra];
}

export type TerminalInputController = {
  handleData: (data: string) => void;
  applyHint: (command: string) => void;
  reset: () => void;
  getHistory: () => string[];
  getGhostSuffix: () => string;
  getLineBuffer: () => string;
};

const ARROW_UP = "\x1b[A";
const ARROW_DOWN = "\x1b[B";

function clearLine(send: (data: string) => void) {
  send("\x15");
}

function applyLine(send: (data: string) => void, line: string) {
  clearLine(send);
  if (line) send(line);
}

function isPrintableChunk(data: string): boolean {
  if (!data || data.startsWith("\x1b")) return false;
  if (data === "\r" || data === "\n" || data === "\x7f" || data === "\b" || data === "\x03") {
    return false;
  }
  return true;
}

/** Prefix matches (most recent history first). */
function prefixMatches(pool: string[], draft: string, limit = 8): string[] {
  if (!draft) return [];
  const lower = draft.toLowerCase();
  return pool.filter((c) => c.toLowerCase().startsWith(lower) && c !== draft).slice(0, limit);
}

export function inlineGhostSuffix(history: string[], draft: string): string {
  const pool = hintPool(history);
  const matches = prefixMatches(pool, draft, 1);
  const best = matches[0];
  if (!best) return "";
  if (best.length <= draft.length) return "";
  if (!best.toLowerCase().startsWith(draft.toLowerCase())) return "";
  return best.slice(draft.length);
}

export function createTerminalInputController(opts: TerminalInputOptions): TerminalInputController {
  let lineBuffer = "";
  let history = readTerminalHistory(opts.historyKey);
  let histIndex = -1;

  const pushGhost = () => {
    if (!opts.hintsEnabled) {
      opts.onInlineGhost("");
      opts.onHints([]);
      return;
    }
    const pool = hintPool(history);
    const matches = prefixMatches(pool, lineBuffer);
    opts.onHints(matches);
    opts.onInlineGhost(inlineGhostSuffix(history, lineBuffer));
  };

  const reset = () => {
    lineBuffer = "";
    histIndex = -1;
    history = readTerminalHistory(opts.historyKey);
    opts.onHints([]);
    opts.onInlineGhost("");
  };

  const applyHint = (command: string) => {
    lineBuffer = command;
    histIndex = -1;
    applyLine(opts.send, command);
    pushGhost();
  };

  const handleData = (data: string) => {
    const passThrough = () => opts.send(data);

    if (data === "\x03") {
      lineBuffer = "";
      histIndex = -1;
      opts.onInlineGhost("");
      opts.onHints([]);
      passThrough();
      return;
    }

    if (data === "\x7f" || data === "\b") {
      lineBuffer = lineBuffer.slice(0, -1);
      histIndex = -1;
      pushGhost();
      passThrough();
      return;
    }

    if (data === "\r" || data === "\n") {
      const cmd = lineBuffer.trim();
      if (cmd && opts.historyEnabled) {
        history = pushTerminalHistory(opts.historyKey, cmd);
        opts.onHistoryChange?.(history);
      }
      lineBuffer = "";
      histIndex = -1;
      opts.onInlineGhost("");
      opts.onHints([]);
      passThrough();
      return;
    }

    if (data === ARROW_UP && opts.historyEnabled) {
      if (history.length === 0) {
        passThrough();
        return;
      }
      if (histIndex < history.length - 1) histIndex += 1;
      const line = history[histIndex] ?? "";
      lineBuffer = line;
      applyLine(opts.send, line);
      pushGhost();
      return;
    }

    if (data === ARROW_DOWN && opts.historyEnabled) {
      if (histIndex <= 0) {
        histIndex = -1;
        lineBuffer = "";
        applyLine(opts.send, "");
        pushGhost();
        return;
      }
      histIndex -= 1;
      const line = history[histIndex] ?? "";
      lineBuffer = line;
      applyLine(opts.send, line);
      pushGhost();
      return;
    }

    if (data === "\t" && opts.hintsEnabled) {
      const suffix = inlineGhostSuffix(history, lineBuffer);
      if (suffix) {
        lineBuffer += suffix;
        opts.send(suffix);
        pushGhost();
        return;
      }
      const matches = prefixMatches(history, lineBuffer, 1);
      if (matches[0]) {
        applyHint(matches[0]);
        return;
      }
      passThrough();
      return;
    }

    if (data === "\x1b[C" || data === "\x1b[D") {
      passThrough();
      return;
    }

    if (isPrintableChunk(data)) {
      lineBuffer += data;
      histIndex = -1;
      pushGhost();
    }

    passThrough();
  };

  return {
    handleData,
    applyHint,
    reset,
    getHistory: () => [...history],
    getGhostSuffix: () => inlineGhostSuffix(history, lineBuffer),
    getLineBuffer: () => lineBuffer,
  };
}
