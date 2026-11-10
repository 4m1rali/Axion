const PROMPT_LINE = [
  /^[^\s@]+@[^\s:]+:([^#$]+)[$#]\s*$/,
  /^\[[^\]]+@[^\]]+\s+([^\]]+)\][$#]\s*$/,
  /^.*\s+((?:~|\/)[^\s#$]*)[$#]\s*$/,
];

function normalizeCwd(raw: string): string {
  const t = raw.trim().replace(/\x1b/g, "");
  if (!t) return "";
  if (t === "~" || t.startsWith("~/")) return t;
  if (t.startsWith("/")) return t;
  return t;
}

/** Best-effort cwd from recent PTY text (shell prompt). */
export function parseCwdFromTerminalTail(text: string): string | undefined {
  const tail = text.slice(-6000);
  const lines = tail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 24; i--) {
    const line = lines[i]!;
    if (line.length > 280) continue;
    for (const re of PROMPT_LINE) {
      const m = line.match(re);
      if (m?.[1]) {
        const cwd = normalizeCwd(m[1]);
        if (cwd) return cwd;
      }
    }
  }
  return undefined;
}
