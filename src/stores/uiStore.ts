import { create } from "zustand";

export type AppPage =
  | "dashboard"
  | "connections"
  | "terminal"
  | "sftp"
  | "tunnels"
  | "keys"
  | "settings";

export type SettingsTab = "general" | "appearance" | "llm";

interface UiState {
  page: AppPage;
  settingsTab: SettingsTab;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  setPage: (page: AppPage) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  openSettings: (tab?: SettingsTab) => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  page: "dashboard",
  settingsTab: "general",
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  setPage: (page) => set({ page }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  openSettings: (tab = "general") => set({ page: "settings", settingsTab: tab }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
