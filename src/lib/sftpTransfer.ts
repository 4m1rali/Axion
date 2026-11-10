import { Channel, invoke } from "@tauri-apps/api/core";

export type TransferProgress = {
  transferId: string;
  transferred: number;
  total?: number | null;
  done: boolean;
  error?: string | null;
};

export type TransferDirection = "upload" | "download";

export type TransferTask = {
  key: string;
  backendId?: string;
  direction: TransferDirection;
  fileName: string;
  localPath: string;
  remotePath: string;
  transferred: number;
  total: number | null;
  done: boolean;
  error?: string;
  speedBps: number;
  startedAt: number;
  lastTickAt: number;
};

export function fileBaseName(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : path;
}

export function formatSpeed(bps: number): string {
  if (bps <= 0) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bps;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function runTransfer(
  direction: TransferDirection,
  connectionId: string,
  localPath: string,
  remotePath: string,
  fileName: string,
  onAdd: (task: TransferTask) => void,
  onPatch: (key: string, updater: (t: TransferTask) => TransferTask) => void,
): { key: string; promise: Promise<void> } {
  const key = crypto.randomUUID();
  const startedAt = Date.now();
  const base: TransferTask = {
    key,
    direction,
    fileName,
    localPath,
    remotePath,
    transferred: 0,
    total: null,
    done: false,
    speedBps: 0,
    startedAt,
    lastTickAt: startedAt,
  };

  onAdd(base);

  const progress = new Channel<TransferProgress>();
  progress.onmessage = (p) => {
    onPatch(key, (t) => {
      const now = Date.now();
      const elapsed = (now - t.lastTickAt) / 1000;
      const delta = p.transferred - t.transferred;
      const speed = elapsed >= 0.05 ? delta / elapsed : t.speedBps;
      const total = p.total ?? t.total;
      return {
        ...t,
        backendId: p.transferId,
        transferred: p.transferred,
        total,
        done: p.done ? true : t.done,
        error: p.error ?? t.error,
        speedBps: p.done ? 0 : Number.isFinite(speed) ? Math.max(0, speed) : t.speedBps,
        lastTickAt: now,
      };
    });
  };

  const cmd = direction === "upload" ? "sftp_upload" : "sftp_download";
  const promise = invoke(cmd, {
    connectionId,
    localPath,
    remotePath,
    progress,
  })
    .then(() => {
      onPatch(key, (t) =>
        t.done ? t : { ...t, done: true, speedBps: 0, transferred: t.total ?? t.transferred },
      );
    })
    .catch((e) => {
      onPatch(key, (t) => ({
        ...t,
        done: true,
        error: t.error ?? String(e),
        speedBps: 0,
      }));
    });

  return { key, promise };
}

export async function cancelTransfer(backendId: string) {
  await invoke("sftp_cancel", { transferId: backendId });
}
