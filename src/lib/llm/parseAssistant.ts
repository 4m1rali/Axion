import { sanitizeModelOutput } from "./sanitizeModel";

const COMMANDS_FENCE = /```commands\s*([\s\S]*?)```/gi;
const SHELL_FENCE = /```(?:(?:bash|sh|shell|linux))\s*([\s\S]*?)```/gi;
const ASK_FENCE = /```ask\s*([\s\S]*?)```/gi;
const LOCAL_FENCE = /```(?:powershell|ps1|cmd|batch|dos)\s*[\s\S]*?```/gi;

export type AskMenu = {
  question: string;
  options: string[];
};

function linesFromBlock(block: string): string[] {
  const commands: string[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    commands.push(trimmed);
  }
  return commands;
}

function collectFromRegex(text: string, regex: RegExp): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(regex)) {
    out.push(...linesFromBlock(match[1] ?? ""));
  }
  return out;
}

const LOCAL_CMD =
  /(?:^|[\s&|])(?:powershell|pwsh|cmd\.exe|New-Item\b|Get-ChildItem|Set-Location|ipconfig|wmic\b)/i;

const NON_LINUX_CMD =
  /(?:^|[\s&|])(?:dir\s|copy\s|move\s|del\s|clip\.exe|explorer\.exe|start\s+http)/i;

/** Drop non-Linux / local-PC commands. */
export function sanitizeRemoteCommands(commands: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cmd of commands) {
    const c = cmd.trim();
    if (!c || seen.has(c)) continue;
    if (LOCAL_CMD.test(c)) continue;
    if (NON_LINUX_CMD.test(c)) continue;
    if (/\/Desktop\/|\/Desktop"|\\Desktop\\|[A-Za-z]:\\/i.test(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function extractAskMenu(text: string): AskMenu | null {
  const re = /```ask\s*([\s\S]*?)```/i;
  const match = re.exec(text);
  if (!match) return null;
  const body = (match[1] ?? "").trim();
  if (!body) return null;

  const questionLines: string[] = [];
  const options: string[] = [];

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet) options.push(bullet[1]!.trim());
    else if (numbered) options.push(numbered[1]!.trim());
    else if (options.length === 0) questionLines.push(line);
    else options.push(line);
  }

  const question = questionLines.join(" ").trim() || "Choose an option";
  if (options.length === 0) return null;
  return { question, options: options.slice(0, 8) };
}

export function extractShellCommands(text: string): string[] {
  const cleaned = sanitizeModelOutput(text);
  let commands = collectFromRegex(cleaned, COMMANDS_FENCE);
  if (commands.length === 0) {
    commands = collectFromRegex(cleaned, SHELL_FENCE);
  }
  return sanitizeRemoteCommands(commands);
}

export function stripCommandFences(text: string): string {
  return text
    .replace(COMMANDS_FENCE, "")
    .replace(SHELL_FENCE, "")
    .replace(ASK_FENCE, "")
    .replace(LOCAL_FENCE, "")
    .trim();
}

const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+/i,
  /\brmdir\b/i,
  /\bunlink\s+/i,
  /\bfind\b[^\n]*(-delete\b|-exec\s+rm\b)/i,
  /\bdd\s+if=/i,
  /\bmkfs\./i,
  />\s*\/dev\/\S+/i,
  /\bchmod\s+(?:-[^\s]+\s+)*[0-7]{3,4}\b.*\b-R\b/i,
  /\bchmod\s+(?:-[^\s]+\s+)*777\b/i,
  /\bchown\s+(?:-[^\s]+\s+)*-R\b/i,
  /\b(shutdown|reboot|poweroff|halt|init\s+0)\b/i,
  /\bkillall\b/i,
  /\bkill\s+-9\b/i,
  /\biptables\b[^\n]*\s(-F|--flush)\b/i,
  /\b(ufw|firewall-cmd)\b[^\n]*\b(disable|reset)\b/i,
  /\b(curl|wget)\b[^\n]*\|\s*(ba)?sh\b/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  /\btruncate\s+-s\s+0\b/i,
  /\buserdel\b/i,
  /\bgroupdel\b/i,
  /\bdrop\s+(database|schema|table)\b/i,
  /\bmv\s+[^\n]+\s+\/dev\/null\b/i,
  /\b(shred|wipefs)\b/i,
  /\bsystemctl\s+(stop|disable|mask)\s+(ssh|sshd|network|dbus|systemd)\b/i,
];

/** Destructive or high-impact — user must accept before SSH runs them (even in Agent mode). */
export function commandNeedsApproval(cmd: string): boolean {
  const c = cmd.trim();
  if (!c) return false;
  return DANGEROUS_COMMAND_PATTERNS.some((re) => re.test(c));
}

export function commandsNeedApproval(commands: string[]): boolean {
  return commands.some(commandNeedsApproval);
}

export function partitionCommandsByApproval(commands: string[]): {
  safe: string[];
  dangerous: string[];
} {
  const safe: string[] = [];
  const dangerous: string[] = [];
  for (const cmd of commands) {
    if (commandNeedsApproval(cmd)) dangerous.push(cmd);
    else safe.push(cmd);
  }
  return { safe, dangerous };
}

/** Markdown shown in chat — keep ```bash``` blocks; hide ```commands``` / ```ask```. */
export function formatAssistantMessageForDisplay(
  raw: string,
  ranCommands: boolean,
  hasAsk = false,
): string {
  let text = sanitizeModelOutput(raw);
  text = text.replace(LOCAL_FENCE, "");
  text = text.replace(COMMANDS_FENCE, "").replace(ASK_FENCE, "");
  text = text
    .replace(/I (still )?(can'?t|cannot) (create|make|access)[\s\S]*?(?=\n\n|$)/gi, "")
    .replace(/I (don'?t|do not) have access[\s\S]*?(?=\n\n|$)/gi, "")
  .replace(/\*\*Windows PowerShell:\*\*[\s\S]*?(?=\n\n\*\*|$)/gi, "")
  .replace(/\*\*Windows CMD:\*\*[\s\S]*?(?=\n\n\*\*|$)/gi, "")
  .replace(/\*\*macOS \/ Linux:\*\*[\s\S]*?(?=\n\n|$)/gi, "")
    .trim();

  if (!text && ranCommands) return "Running on the server.";
  if (!text && hasAsk) return "Choose an option below.";
  if (ranCommands && /copy-paste|your (machine|computer|file system)/i.test(text)) {
    return "Running on the server.";
  }
  return text || raw.trim();
}

/** @deprecated alias */
export function formatAssistantMessage(
  raw: string,
  ranCommands: boolean,
  hasAsk = false,
): string {
  return formatAssistantMessageForDisplay(raw, ranCommands, hasAsk);
}
