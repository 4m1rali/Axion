import { invoke } from "@tauri-apps/api/core";

export interface HostKeyInfo {
  host: string;
  port: number;
  fingerprintSha256: string;
  algorithm: string;
  trustState: "Known" | "Unknown" | "Changed";
}

export type ConnectOutcome =
  | { kind: "connected"; connectionId: string }
  | { kind: "hostKey"; pendingId: string; prompt: HostKeyInfo };

export interface TransportProxy {
  type: "http" | "socks4" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "publicKey";
  keyRef?: string;
  rememberPassword: boolean;
  favorite: boolean;
  tunnelIds?: string[];
  lastConnectedAt?: string;
  proxyJump?: string;
  identityFile?: string;
  transportProxy?: TransportProxy;
}

function buildConnectRequest(request: {
  host: string;
  port: number;
  username: string;
  authMethod: string;
  password?: string;
  rememberPassword?: boolean;
  keyRef?: string;
  profileId?: string;
  proxyJump?: string;
  transportProxy?: TransportProxy;
}) {
  return {
    profileId: request.profileId,
    host: request.host,
    port: request.port,
    username: request.username,
    authMethod: request.authMethod,
    password: request.password,
    rememberPassword: request.rememberPassword ?? false,
    keyRef: request.keyRef,
    jumpChain: [],
    proxyJump: request.proxyJump,
    transportProxy: request.transportProxy
      ? {
          type: request.transportProxy.type,
          host: request.transportProxy.host,
          port: request.transportProxy.port,
          username: request.transportProxy.username,
          password: request.transportProxy.password,
        }
      : undefined,
  };
}

/** Matches Rust `ConnectOutcome` serde (`rename_all = "camelCase"`, externally tagged). */
function parseConnectOutcome(result: Record<string, unknown>): ConnectOutcome {
  const connectedRaw = result.connected ?? result.Connected;
  if (connectedRaw && typeof connectedRaw === "object") {
    const payload = connectedRaw as Record<string, unknown>;
    const connectionId = String(payload.connectionId ?? payload.connection_id ?? "");
    if (connectionId) {
      return { kind: "connected", connectionId };
    }
  }

  const hostKeyRaw = result.hostKeyRequired ?? result.HostKeyRequired;
  if (hostKeyRaw && typeof hostKeyRaw === "object") {
    const payload = hostKeyRaw as Record<string, unknown>;
    const pendingId = String(payload.pendingId ?? payload.pending_id ?? "");
    const prompt = payload.prompt as HostKeyInfo;
    if (pendingId && prompt) {
      return { kind: "hostKey", pendingId, prompt };
    }
  }

  throw new Error("unexpected connect response");
}

export async function connect(request: {
  host: string;
  port: number;
  username: string;
  authMethod: string;
  password?: string;
  rememberPassword?: boolean;
  keyRef?: string;
  profileId?: string;
  proxyJump?: string;
  transportProxy?: TransportProxy;
}): Promise<ConnectOutcome> {
  const result = await invoke<Record<string, unknown>>("ssh_connect", {
    request: buildConnectRequest(request),
  });
  return parseConnectOutcome(result);
}

export async function connectSftp(request: {
  host: string;
  port: number;
  username: string;
  authMethod: string;
  password?: string;
  rememberPassword?: boolean;
  keyRef?: string;
  profileId?: string;
  proxyJump?: string;
  transportProxy?: TransportProxy;
}): Promise<ConnectOutcome> {
  const result = await invoke<Record<string, unknown>>("sftp_connect", {
    request: buildConnectRequest(request),
  });
  return parseConnectOutcome(result);
}
