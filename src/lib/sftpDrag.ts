import type { SftpFileEntry } from "./sftp";

export const SFTP_DRAG_MIME = "application/x-axion-sftp-entry";

export type SftpDragPayload = {
  side: "local" | "remote";
  path: string;
  name: string;
  isDir: boolean;
};

export function setDragPayload(e: React.DragEvent, entry: SftpFileEntry, side: "local" | "remote") {
  if (entry.isDir) return;
  const payload: SftpDragPayload = {
    side,
    path: entry.path,
    name: entry.name,
    isDir: false,
  };
  e.dataTransfer.setData(SFTP_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = side === "local" ? "copy" : "move";
}

export function readDragPayload(e: React.DragEvent): SftpDragPayload | null {
  const raw = e.dataTransfer.getData(SFTP_DRAG_MIME);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as SftpDragPayload;
    if (p.isDir || !p.path) return null;
    return p;
  } catch {
    return null;
  }
}
