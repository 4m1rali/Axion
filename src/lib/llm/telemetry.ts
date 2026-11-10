export type LlmRequestKind = "chat" | "models";

export type LlmRequestStatus = "ok" | "error" | "cancelled";

export type LlmLastRequest = {
  kind: LlmRequestKind;
  at: string;
  apiUrl: string;
  model: string;
  messageCount: number;
  preview: string;
  status: LlmRequestStatus;
  detail?: string;
};

export type LlmTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmTelemetry = {
  lastRequest?: LlmLastRequest;
  lastUsage?: LlmTokenUsage;
};

const STORAGE_KEY = "axion-llm-telemetry";
const CHANGE_EVENT = "axion-llm-telemetry-changed";

export function readLlmTelemetry(): LlmTelemetry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as LlmTelemetry;
  } catch {
    return {};
  }
}

function writeLlmTelemetry(data: LlmTelemetry) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeLlmTelemetry(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function recordLlmRequest(
  request: Omit<LlmLastRequest, "at"> & { at?: string },
  usage?: LlmTokenUsage,
) {
  const prev = readLlmTelemetry();
  writeLlmTelemetry({
    lastRequest: {
      ...request,
      at: request.at ?? new Date().toISOString(),
    },
    lastUsage: usage ?? prev.lastUsage,
  });
}

export function recordLlmUsage(usage: LlmTokenUsage) {
  const prev = readLlmTelemetry();
  writeLlmTelemetry({
    ...prev,
    lastUsage: usage,
  });
}

export function formatLlmWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
