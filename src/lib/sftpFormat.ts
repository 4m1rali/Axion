import type { SftpFileEntry } from "./sftp";

export function formatBytes(size: number): string {
  if (size === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = size;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = i === 0 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 1);
  return `${fixed} ${units[i]}`;
}

export function formatModified(epochSec: number | null | undefined): string {
  if (epochSec == null) return "—";
  const d = new Date(epochSec * 1000);
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fileKind(entry: SftpFileEntry): string {
  if (entry.isDir) return "Folder";
  const dot = entry.name.lastIndexOf(".");
  if (dot <= 0 || dot === entry.name.length - 1) return "File";
  return entry.name.slice(dot + 1).toUpperCase();
}

export function pathSegments(path: string, remote: boolean): string[] {
  if (!path) return remote ? ["/"] : [];
  const norm = remote ? path.replace(/\\/g, "/") : path;
  if (remote) {
    const parts = norm.split("/").filter(Boolean);
    return parts.length ? parts : ["/"];
  }
  const parts = norm.split(/[/\\]/).filter(Boolean);
  return parts;
}

export function parentPath(path: string, remote: boolean): string | null {
  if (remote) {
    const norm = path.replace(/\\/g, "/") || "/";
    if (norm === "/" || norm === "") return null;
    const idx = norm.lastIndexOf("/");
    if (idx <= 0) return "/";
    return norm.slice(0, idx);
  }
  const norm = path.replace(/\//g, "\\");
  const idx = Math.max(norm.lastIndexOf("\\"), norm.lastIndexOf("/"));
  if (idx <= 0) return null;
  return norm.slice(0, idx);
}

export function joinChildPath(parent: string, name: string, remote: boolean): string {
  const safe = name.trim().replace(/[/\\]/g, "");
  if (!safe) return parent;
  if (remote) {
    const base = parent.replace(/\\/g, "/") || "/";
    if (base === "/") return `/${safe}`;
    return `${base.replace(/\/$/, "")}/${safe}`;
  }
  const sep = parent.includes("\\") ? "\\" : parent.includes("/") ? "/" : "\\";
  if (!parent) return safe;
  return `${parent.replace(/[/\\]$/, "")}${sep}${safe}`;
}

export function sortEntries(entries: SftpFileEntry[]): SftpFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
