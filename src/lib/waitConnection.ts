import { invoke } from "@tauri-apps/api/core";

type ConnectionRow = { id: string; host: string; port: number; username: string };

export async function waitForSshConnection(
  host: string,
  port: number,
  username: string,
  timeoutMs = 25_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await invoke<ConnectionRow[]>("ssh_list_connections");
    const hit = list.find((c) => c.host === host && c.port === port && c.username === username);
    if (hit) return hit.id;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for SSH session");
}
