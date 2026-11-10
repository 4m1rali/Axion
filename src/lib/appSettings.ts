import { invoke } from "@tauri-apps/api/core";

export type AppSettings = {
  schemaVersion: number;
  accentColor: string;
  uiDensity: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  defaultSshPort: number;
  connectionTimeoutMs: number;
  keepaliveIntervalSecs: number;
  reconnectEnabled: boolean;
  strictHostKey: boolean;
  maxConcurrentTransfers: number;
  transferBufferSize: number;
  defaultDownloadDir: string;
  launchMinimized: boolean;
  minimizeToTray: boolean;
  confirmCloseActive: boolean;
  terminalCommandHistory: boolean;
  terminalCommandHints: boolean;
  themeMode: "dark" | "light";
  locale: string;
  llmEnabled: boolean;
  llmProvider: string;
  llmApiUrl: string;
  llmModel: string;
  llmModelsCache: string[];
};

export async function loadAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await invoke("save_app_settings", { settings });
}
