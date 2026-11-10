import type { AiComposerMode } from "../../components/terminal/TerminalAiComposer";
import type { LlmChatMessage } from "./api";
import axionTerminalPrompt from "./axionTerminalPrompt.md?raw";

function sessionBlock(serverLabel: string, mode: AiComposerMode, remoteCwd?: string): string {
  const exec =
    mode === "agent"
      ? "Agent mode ON — ```commands``` runs on SSH; you receive output and may reply with more ```commands``` or ```ask``` until the task is done."
      : "Ask mode ON — show ```commands``` only; user runs manually.";

  const cwdLine = remoteCwd
    ? `Shell cwd: ${remoteCwd} — run commands from here first (use relative paths, \`find .\`, \`ls\`, not \`find /\` unless the user wants the whole disk).`
    : "Shell cwd: unknown — prefer non-destructive discovery; use `pwd` in ```commands``` if you need the path.";

  return ["<session>", `SSH: ${serverLabel}`, cwdLine, exec, "</session>"].join("\n");
}

function systemMessageContent(serverLabel: string, mode: AiComposerMode, remoteCwd?: string): string {
  return `${axionTerminalPrompt.trim()}\n\n${sessionBlock(serverLabel, mode, remoteCwd)}`;
}

export function buildLlmChatMessages(args: {
  serverLabel: string;
  mode: AiComposerMode;
  remoteCwd?: string;
  history: { role: "user" | "assistant"; text: string }[];
}): LlmChatMessage[] {
  const system: LlmChatMessage = {
    role: "system",
    content: systemMessageContent(args.serverLabel, args.mode, args.remoteCwd),
  };

  const turns: LlmChatMessage[] = args.history.map((m) => ({
    role: m.role,
    content: m.text.trim(),
  }));

  return [system, ...turns];
}
