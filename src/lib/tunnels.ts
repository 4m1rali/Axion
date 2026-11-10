import { invoke } from "@tauri-apps/api/core";

export type TunnelKind = "Local" | "Remote" | "Dynamic";

export type TunnelConfig = {
  id: string;
  name: string;
  kind: TunnelKind;
  localAddress: string;
  localPort: number;
  destinationAddress?: string;
  destinationPort?: number;
  profileId?: string;
  connectionId?: string;
};

export type ActiveTunnel = {
  id: string;
  connectionId: string;
  kind: string;
  bind: string;
  running: boolean;
  error?: string;
};

export async function listTunnelConfigs(): Promise<TunnelConfig[]> {
  return invoke<TunnelConfig[]>("tunnels_list_configs");
}

export async function saveTunnelConfig(config: TunnelConfig): Promise<TunnelConfig> {
  return invoke<TunnelConfig>("tunnels_save_config", { config });
}

export async function deleteTunnelConfig(id: string): Promise<void> {
  await invoke("tunnels_delete_config", { id });
}

export async function listActiveTunnels(): Promise<ActiveTunnel[]> {
  return invoke<ActiveTunnel[]>("tunnels_list_active");
}

export async function startLocalTunnel(
  connectionId: string,
  localAddress: string,
  localPort: number,
  destinationHost: string,
  destinationPort: number,
  acknowledgePublic: boolean,
): Promise<string> {
  return invoke<string>("tunnel_start_local", {
    connectionId,
    localAddress,
    localPort,
    destinationHost,
    destinationPort,
    acknowledgePublic,
  });
}

export async function startDynamicTunnel(
  connectionId: string,
  localAddress: string,
  localPort: number,
  acknowledgePublic: boolean,
): Promise<string> {
  return invoke<string>("tunnel_start_dynamic", {
    connectionId,
    localAddress,
    localPort,
    acknowledgePublic,
  });
}

export async function stopTunnel(tunnelId: string): Promise<void> {
  await invoke("tunnel_stop", { tunnelId });
}
