import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, TransportProxy } from "./api";

export type ProfileDraft = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  proxyJump: string;
  proxyType: "" | "http" | "socks4" | "socks5";
  proxyHost: string;
  proxyPort: number;
  proxyUser: string;
  proxyPass: string;
  rememberPassword: boolean;
  tunnelIds: string[];
};

export function emptyDraft(): ProfileDraft {
  return {
    id: "",
    name: "",
    host: "",
    port: 22,
    username: "root",
    password: "",
    proxyJump: "",
    proxyType: "",
    proxyHost: "",
    proxyPort: 1080,
    proxyUser: "",
    proxyPass: "",
    rememberPassword: true,
    tunnelIds: [],
  };
}

export function draftFromProfile(p: ConnectionProfile, password = ""): ProfileDraft {
  const tp = p.transportProxy;
  return {
    id: p.id,
    name: p.name,
    host: p.host,
    port: p.port,
    username: p.username,
    password,
    proxyJump: p.proxyJump ?? "",
    proxyType: tp?.type ?? "",
    proxyHost: tp?.host ?? "",
    proxyPort: tp?.port ?? 1080,
    proxyUser: tp?.username ?? "",
    proxyPass: tp?.password ?? "",
    rememberPassword: p.rememberPassword,
    tunnelIds: p.tunnelIds ?? [],
  };
}

export function draftToProfile(d: ProfileDraft): ConnectionProfile {
  const transportProxy: TransportProxy | undefined =
    d.proxyType && d.proxyHost
      ? {
          type: d.proxyType,
          host: d.proxyHost,
          port: d.proxyPort,
          username: d.proxyUser || undefined,
          password: d.proxyPass || undefined,
        }
      : undefined;
  return {
    id: d.id,
    name: d.name.trim() || d.host.trim() || "Host",
    host: d.host.trim(),
    port: d.port || 22,
    username: d.username.trim() || "root",
    authMethod: "password",
    rememberPassword: d.rememberPassword,
    favorite: false,
    tunnelIds: d.tunnelIds,
    proxyJump: d.proxyJump.trim() || undefined,
    transportProxy,
  };
}

export async function saveProfileDraft(draft: ProfileDraft): Promise<ConnectionProfile> {
  const saved = await invoke<ConnectionProfile>("profiles_save", {
    profile: draftToProfile(draft),
  });
  if (draft.rememberPassword && draft.password) {
    await invoke("profiles_store_password", {
      profileId: saved.id,
      password: draft.password,
    });
  }
  return saved;
}

export async function deleteProfile(id: string) {
  await invoke("profiles_delete", { id });
}
