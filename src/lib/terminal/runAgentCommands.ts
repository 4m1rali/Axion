import { trimCapturedOutput, type TerminalOutputCapture } from "./outputCapture";

export async function runAgentCommandsWithCapture(
  commands: string[],
  sendLine: (cmd: string) => void,
  capture: TerminalOutputCapture,
): Promise<string> {
  if (commands.length === 0) return "";

  const startMark = capture.mark();
  for (let i = 0; i < commands.length; i++) {
    sendLine(commands[i]!);
    if (i < commands.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const idleMs = commands.length > 3 ? 900 : 650;
  const maxMs = Math.min(45_000, 8_000 + commands.length * 3_000);
  let raw = await capture.waitForOutput(startMark, { idleMs, maxMs });
  if (!raw.trim()) {
    raw = await capture.waitForOutput(startMark, { idleMs: 1400, maxMs: Math.min(60_000, maxMs + 12_000) });
  }
  return trimCapturedOutput(raw);
}
