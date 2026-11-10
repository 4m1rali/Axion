import { invoke } from "@tauri-apps/api/core";
import { connect, type ConnectionProfile } from "./api";
import { authMethodForBackend } from "./quickConnect";
import type { ConnectionRow } from "../stores/sessionStore";

export type ReconnectTarget = {
  host: string;
  port: number;
  username: string;
  profileId?: string;
};

export function targetFromConnection(c: ConnectionRow): ReconnectTarget {
  return { host: c.host, port: c.port, username: c.username };
}

export function findProfileForTarget(
  profiles: ConnectionProfile[],
  target: ReconnectTarget,
): ConnectionProfile | undefined {
  if (target.profileId) {
    const byId = profiles.find((p) => p.id === target.profileId);
    if (byId) return byId;
  }
  return profiles.find(
    (p) => p.host === target.host && p.port === target.port && p.username === target.username,
  );
}

export async function reconnectSshSession(
  target: ReconnectTarget,
  profiles: ConnectionProfile[],
): Promise<string> {
  const profile = findProfileForTarget(profiles, target);

  if (!profile) {
    throw new Error(
      "SSH session closed — add a saved host with stored credentials to reconnect automatically.",
    );
  }

  const outcome = await connect({
    profileId: profile.id,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authMethod: authMethodForBackend(
      profile.authMethod === "publicKey" ? "publickey" : profile.authMethod,
    ),
    rememberPassword: profile.rememberPassword,
    keyRef: profile.keyRef,
    proxyJump: profile.proxyJump,
    transportProxy: profile.transportProxy,
  });

  if (outcome.kind !== "connected") {
    throw new Error("Host key confirmation required — reconnect from Dashboard.");
  }

  await invoke("ssh_list_connections");
  return outcome.connectionId;
}
