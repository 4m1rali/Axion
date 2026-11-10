import { invoke } from "@tauri-apps/api/core";

export type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmChatResult = {
  content: string;
  usage?: LlmTokenUsage;
};

export async function llmHasApiKey(): Promise<boolean> {
  return invoke<boolean>("llm_has_api_key");
}

export async function llmSetApiKey(apiKey: string): Promise<void> {
  await invoke("llm_set_api_key", { apiKey });
}

export async function llmListModels(apiUrl: string): Promise<string[]> {
  return invoke<string[]>("llm_list_models", { apiUrl });
}

export async function llmChat(
  apiUrl: string,
  model: string,
  messages: LlmChatMessage[],
): Promise<LlmChatResult> {
  const result = await invoke<{
    content: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>("llm_chat", {
    apiUrl,
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const u = result.usage;
  const usage: LlmTokenUsage | undefined = u
    ? {
        promptTokens: u.promptTokens ?? u.prompt_tokens,
        completionTokens: u.completionTokens ?? u.completion_tokens,
        totalTokens: u.totalTokens ?? u.total_tokens,
      }
    : undefined;
  return { content: result.content, usage };
}

export async function llmAbortChat(): Promise<void> {
  await invoke("llm_abort_chat");
}

export function isLlmCancelledError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return msg.includes("cancel");
}
