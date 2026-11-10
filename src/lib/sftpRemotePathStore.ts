export const SFTP_DEFAULT_REMOTE_PATH = "/root";

const KEY_PREFIX = "axion.sftp.lastRemotePath:";

function storageKey(connectionId: string): string {
  return `${KEY_PREFIX}${connectionId}`;
}

export function readSavedRemotePath(connectionId: string): string {
  try {
    const raw = localStorage.getItem(storageKey(connectionId));
    if (raw?.startsWith("/")) return raw;
  } catch {
    /* private mode / quota */
  }
  return SFTP_DEFAULT_REMOTE_PATH;
}

export function writeSavedRemotePath(connectionId: string, path: string): void {
  if (!path.startsWith("/")) return;
  try {
    localStorage.setItem(storageKey(connectionId), path);
  } catch {
    /* ignore */
  }
}
