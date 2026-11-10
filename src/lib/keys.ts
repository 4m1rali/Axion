import { invoke } from "@tauri-apps/api/core";

export type KeyRecord = {
  id: string;
  name: string;
  algorithm: string;
  fingerprintSha256: string;
  publicKeyOpenssh: string;
  hasPassphrase: boolean;
};

export async function listKeys(): Promise<KeyRecord[]> {
  return invoke<KeyRecord[]>("keys_list");
}

export async function deleteKey(id: string): Promise<void> {
  await invoke("keys_delete", { id });
}

export async function importKey(
  name: string,
  material: string,
  passphrase?: string,
): Promise<KeyRecord> {
  return invoke<KeyRecord>("keys_import", { name, material, passphrase: passphrase || null });
}

export async function generateKey(name: string, passphrase?: string): Promise<KeyRecord> {
  return invoke<KeyRecord>("keys_generate", { name, passphrase: passphrase || null });
}

export async function storeKeyPassphrase(id: string, passphrase: string): Promise<void> {
  await invoke("keys_store_passphrase", { id, passphrase });
}
