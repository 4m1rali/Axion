const MAX = 300;
const KEY_PREFIX = "axion.terminal.history.v2:";
const LEGACY_PREFIX = "axion.terminal.history.v1:";

export type ServerHistoryTarget = {
  host: string;
  port: number;
  username: string;
};

export function serverHistoryKey(target: ServerHistoryTarget): string {
  const host = target.host.trim().toLowerCase();
  const user = target.username.trim();
  const port = target.port > 0 ? target.port : 22;
  return `${user}@${host}:${port}`;
}

function dedupeNewestFirst(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const cmd = raw.trim();
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    out.push(cmd);
  }
  return out;
}

function readRaw(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeRaw(key: string, commands: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(commands));
  } catch {
    /* quota */
  }
}

export function readTerminalHistory(serverKey: string): string[] {
  if (!serverKey) return [];
  const list = dedupeNewestFirst(readRaw(`${KEY_PREFIX}${serverKey}`));
  return list.slice(0, MAX);
}

export function pushTerminalHistory(serverKey: string, command: string): string[] {
  const trimmed = command.trim();
  if (!serverKey || !trimmed) return readTerminalHistory(serverKey);
  const prev = readTerminalHistory(serverKey).filter((c) => c !== trimmed);
  const next = dedupeNewestFirst([trimmed, ...prev]).slice(0, MAX);
  writeRaw(`${KEY_PREFIX}${serverKey}`, next);
  return next;
}

/** One-time merge from per-session (v1) storage into per-server history. */
export function mergeLegacyConnectionHistory(connectionId: string, serverKey: string): void {
  if (!connectionId || !serverKey) return;
  const legacy = dedupeNewestFirst(readRaw(`${LEGACY_PREFIX}${connectionId}`));
  if (legacy.length === 0) return;
  const current = readTerminalHistory(serverKey);
  const merged = dedupeNewestFirst([...current, ...legacy]).slice(0, MAX);
  writeRaw(`${KEY_PREFIX}${serverKey}`, merged);
  try {
    localStorage.removeItem(`${LEGACY_PREFIX}${connectionId}`);
  } catch {
    /* ignore */
  }
}
