import { useEffect, useState } from "react";
import { type as osType, type OsType } from "@tauri-apps/plugin-os";

export async function runtimeOs(): Promise<OsType | "unknown"> {
  try {
    return await osType();
  } catch {
    return "unknown";
  }
}

export function isWindowsOs(os: OsType | "unknown"): boolean {
  return os === "windows";
}

export function useRuntimeOs(): OsType | "unknown" {
  const [os, setOs] = useState<OsType | "unknown">("unknown");
  useEffect(() => {
    void runtimeOs().then(setOs);
  }, []);
  return os;
}
