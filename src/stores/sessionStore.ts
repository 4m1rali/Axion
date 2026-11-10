import { create } from "zustand";

export interface ConnectionRow {
  id: string;
  host: string;
  port: number;
  username: string;
  connectedAt: string;
}

export interface DiagnosticStep {
  phase: string;
  level: string;
  message: string;
  elapsedMs: number;
  detail?: string;
}

interface SessionState {
  connections: ConnectionRow[];
  diagnostics: DiagnosticStep[];
  setConnections: (connections: ConnectionRow[]) => void;
  pushDiagnostic: (step: DiagnosticStep) => void;
  clearDiagnostics: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  connections: [],
  diagnostics: [],
  setConnections: (connections) => set({ connections }),
  pushDiagnostic: (step) =>
    set((s) => ({ diagnostics: [...s.diagnostics.slice(-120), step] })),
  clearDiagnostics: () => set({ diagnostics: [] }),
}));
