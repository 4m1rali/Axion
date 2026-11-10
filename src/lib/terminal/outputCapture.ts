export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9:;<=>?]*[!-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "");
}

export type CaptureIdleOptions = {
  idleMs?: number;
  maxMs?: number;
};

export class TerminalOutputCapture {
  private buffer = "";
  private readonly maxChars: number;
  private listeners = new Set<() => void>();

  constructor(maxChars = 160_000) {
    this.maxChars = maxChars;
  }

  push(bytes: Uint8Array): void {
    const chunk = stripAnsi(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    if (!chunk) return;
    this.buffer += chunk;
    if (this.buffer.length > this.maxChars) {
      this.buffer = this.buffer.slice(-this.maxChars);
    }
    for (const listener of this.listeners) listener();
  }

  mark(): number {
    return this.buffer.length;
  }

  slice(from: number): string {
    return this.buffer.slice(from);
  }

  reset(): void {
    this.buffer = "";
  }

  tail(maxChars = 6000): string {
    return this.buffer.slice(-maxChars);
  }

  waitForOutput(fromMark: number, options: CaptureIdleOptions = {}): Promise<string> {
    const idleMs = options.idleMs ?? 550;
    const maxMs = options.maxMs ?? 20_000;

    return new Promise((resolve) => {
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let maxTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (maxTimer) clearTimeout(maxTimer);
        this.listeners.delete(onActivity);
        resolve(this.slice(fromMark).trim());
      };

      const onActivity = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(finish, idleMs);
      };

      this.listeners.add(onActivity);
      maxTimer = setTimeout(finish, maxMs);
      onActivity();
    });
  }
}

export function trimCapturedOutput(raw: string, maxChars = 12_000): string {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length <= maxChars) return text;
  return `…\n${text.slice(-maxChars)}`;
}
