export type LlmProviderId = "openai" | "openrouter" | "groq" | "custom";

export type LlmProviderPreset = {
  id: LlmProviderId;
  label: string;
  apiUrl: string;
  defaultModel: string;
};

export const LLM_PROVIDERS: LlmProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    apiUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
  },
  {
    id: "groq",
    label: "Groq",
    apiUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    apiUrl: "",
    defaultModel: "gpt-4o-mini",
  },
];

export function providerById(id: string): LlmProviderPreset {
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0]!;
}

export function resolveLlmApiUrl(providerId: string, customUrl: string): string {
  const preset = providerById(providerId);
  if (preset.id === "custom") {
    return customUrl.trim() || "https://api.openai.com/v1";
  }
  return preset.apiUrl;
}
