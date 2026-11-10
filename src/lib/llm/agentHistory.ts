export const AGENT_MAX_STEPS = 12;

export const AGENT_CONTINUE_WEAK_OUTPUT =
  "The captured server output was empty or very short. Try different Linux-only commands to obtain the data, or use an ```ask``` block if the user must choose.";

export const AGENT_CONTINUE_AFTER_OUTPUT =
  "Continue from the server output above. If the user's request is satisfied, reply with a short summary only (no ```commands```). If not, output the next ```commands``` block (Linux/POSIX only). If unclear, output ```ask``` with 2–5 bullet options.";

/** After SSH output — user needs a plain-language reply in chat. */
export const AGENT_SUMMARIZE_AFTER_EXEC =
  "The user already sees the raw terminal output in a separate panel. Your next reply MUST be 1–4 sentences in markdown explaining what happened and directly answering their question. Do NOT include a ```commands``` block unless they explicitly asked for another action right now. Do NOT paste the SSH transcript header.";

export type AiChatMessageLike =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | {
      kind: "exec";
      commands: string[];
      status: "ok" | "error";
      output?: string;
      detail?: string;
    }
  | {
      kind: "ask";
      question: string;
      options: string[];
      selected?: string;
    };

export function buildLlmTurnsFromMessages(
  messages: AiChatMessageLike[],
  tailNudge?: string,
): { role: "user" | "assistant"; text: string }[] {
  const history: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of messages) {
    if (m.kind === "user") history.push({ role: "user", text: m.text });
    else if (m.kind === "assistant") history.push({ role: "assistant", text: m.text });
    else if (m.kind === "exec") {
      const cmdList = m.commands.map((c) => `- \`${c}\``).join("\n");
      if (m.output?.trim()) {
        history.push({
          role: "assistant",
          text: `[SSH command output — do not repeat this header in your reply]\nRan:\n${cmdList}\n\n\`\`\`\n${m.output}\n\`\`\``,
        });
      } else if (m.status === "error") {
        history.push({
          role: "assistant",
          text: `[SSH command failed]\n${cmdList}\n\n${m.detail ?? "Unknown error"}`,
        });
      } else {
        history.push({
          role: "assistant",
          text: `[SSH command output empty]\n${cmdList}\n\nRetry with different Linux commands.`,
        });
      }
    } else if (m.kind === "ask") {
      history.push({
        role: "assistant",
        text: `Question for user:\n${m.question}\n\nOptions:\n${m.options.map((o) => `- ${o}`).join("\n")}`,
      });
    }
  }
  if (tailNudge?.trim()) history.push({ role: "user", text: tailNudge.trim() });
  return history;
}

export function isWeakCapturedOutput(output: string | undefined): boolean {
  const t = output?.trim() ?? "";
  return t.length < 12;
}
