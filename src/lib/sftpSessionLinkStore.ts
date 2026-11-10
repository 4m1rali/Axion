export type SftpSessionLink = {
  connectionId: string;
  profileId?: string;
  host: string;
  port: number;
  username: string;
};

const KEY = "axion.sftp.sessionLink";

export function readSftpSessionLink(): SftpSessionLink | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SftpSessionLink;
    if (p?.host && p.username && typeof p.port === "number") return p;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeSftpSessionLink(link: SftpSessionLink): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    /* ignore */
  }
}
