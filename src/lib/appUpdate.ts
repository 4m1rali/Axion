import { type as osType, type OsType } from "@tauri-apps/plugin-os";

const RELEASES_LATEST = "https://api.github.com/repos/4m1rali/Axion/releases/latest";

type GitHubRelease = {
  tag_name: string;
  body?: string;
  assets?: { name: string; browser_download_url: string }[];
};

export type AppUpdateOffer = {
  version: string;
  notes: string | null;
  setupUrl: string | null;
};

function parseParts(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[.+_-]/)
    .slice(0, 3)
    .map((n) => parseInt(n, 10) || 0);
}

export function isVersionNewer(latest: string, current: string): boolean {
  const a = parseParts(latest);
  const b = parseParts(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function pickReleaseAsset(assets: GitHubRelease["assets"], os: OsType): string | null {
  if (!assets?.length) return null;
  const lower = (n: string) => n.toLowerCase();

  if (os === "linux") {
    return (
      assets.find((a) => lower(a.name).endsWith(".appimage"))?.browser_download_url ??
      assets.find((a) => lower(a.name).endsWith(".deb"))?.browser_download_url ??
      null
    );
  }
  if (os === "macos") {
    return (
      assets.find((a) => lower(a.name).endsWith(".dmg"))?.browser_download_url ??
      assets.find((a) => lower(a.name).endsWith(".app.tar.gz"))?.browser_download_url ??
      null
    );
  }
  return (
    assets.find((a) => /-setup\.exe$/i.test(a.name))?.browser_download_url ??
    assets.find((a) => lower(a.name).endsWith(".exe"))?.browser_download_url ??
    null
  );
}

export async function fetchGitHubUpdate(currentVersion: string): Promise<AppUpdateOffer | null> {
  const res = await fetch(RELEASES_LATEST, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub releases: HTTP ${res.status}`);
  }
  const data = (await res.json()) as GitHubRelease;
  const version = data.tag_name.replace(/^v/i, "");
  if (!isVersionNewer(version, currentVersion)) {
    return null;
  }
  let os: OsType = "windows";
  try {
    os = await osType();
  } catch {
    // dev / restricted capability
  }
  const setupUrl = pickReleaseAsset(data.assets, os);
  return {
    version,
    notes: data.body?.trim() || null,
    setupUrl,
  };
}
