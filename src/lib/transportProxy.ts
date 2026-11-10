import type { TransportProxy } from "./api";

export type TransportProxyDraft = {
  enabled: boolean;
  type: "http" | "socks4" | "socks5";
  host: string;
  port: number;
  username: string;
  password: string;
  resolveDnsLocally: boolean;
};

export function emptyTransportProxyDraft(): TransportProxyDraft {
  return {
    enabled: false,
    type: "socks5",
    host: "127.0.0.1",
    port: 1080,
    username: "",
    password: "",
    resolveDnsLocally: false,
  };
}

export function draftToTransportProxy(d: TransportProxyDraft): TransportProxy | undefined {
  if (!d.enabled || !d.host.trim()) return undefined;
  return {
    type: d.type,
    host: d.host.trim(),
    port: d.port || 1080,
    username: d.username || undefined,
    password: d.password || undefined,
  };
}

export function transportProxyToDraft(tp?: TransportProxy): TransportProxyDraft {
  if (!tp?.type || !tp.host) return emptyTransportProxyDraft();
  return {
    enabled: true,
    type: tp.type,
    host: tp.host,
    port: tp.port ?? 1080,
    username: tp.username ?? "",
    password: tp.password ?? "",
    resolveDnsLocally: false,
  };
}

export function draftFromProfileFields(
  proxyType: "" | "http" | "socks4" | "socks5",
  proxyHost: string,
  proxyPort: number,
  proxyUser: string,
  proxyPass: string,
): TransportProxyDraft {
  if (!proxyType || !proxyHost) return emptyTransportProxyDraft();
  return {
    enabled: true,
    type: proxyType,
    host: proxyHost,
    port: proxyPort,
    username: proxyUser,
    password: proxyPass,
    resolveDnsLocally: false,
  };
}

export function draftToProfileFields(d: TransportProxyDraft): {
  proxyType: "" | "http" | "socks4" | "socks5";
  proxyHost: string;
  proxyPort: number;
  proxyUser: string;
  proxyPass: string;
} {
  if (!d.enabled) {
    return { proxyType: "", proxyHost: "", proxyPort: 1080, proxyUser: "", proxyPass: "" };
  }
  return {
    proxyType: d.type,
    proxyHost: d.host,
    proxyPort: d.port,
    proxyUser: d.username,
    proxyPass: d.password,
  };
}
