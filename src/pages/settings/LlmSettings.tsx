import { Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AxionSelect } from "../../components/ui/AxionSelect";
import { useI18n } from "../../lib/i18n";
import { llmHasApiKey, llmListModels, llmSetApiKey } from "../../lib/llm/api";
import { addModelToList, mergeModelLists } from "../../lib/llm/models";
import {
  formatLlmWhen,
  readLlmTelemetry,
  recordLlmRequest,
  subscribeLlmTelemetry,
  type LlmTelemetry,
} from "../../lib/llm/telemetry";
import { LLM_PROVIDERS, providerById, resolveLlmApiUrl } from "../../lib/llm/providers";
import { useSettingsStore } from "../../stores/settingsStore";

const fieldClass =
  "w-full rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm text-axion-text outline-none focus:border-axion-accent";

const panelClass =
  "flex min-h-0 flex-col overflow-hidden rounded-xl border border-axion-border bg-axion-bg/35 p-3";

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-axion-text-muted">
      {children}
    </h2>
  );
}

export function LlmSettings() {
  const { t } = useI18n();
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const loading = useSettingsStore((s) => s.loading);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [telemetry, setTelemetry] = useState<LlmTelemetry>(() => readLlmTelemetry());
  const [modelQuery, setModelQuery] = useState("");

  useEffect(() => {
    void llmHasApiKey().then(setHasKey);
  }, [settings?.llmEnabled]);

  useEffect(() => subscribeLlmTelemetry(() => setTelemetry(readLlmTelemetry())), []);

  const apiUrl = settings ? resolveLlmApiUrl(settings.llmProvider, settings.llmApiUrl) : "";

  const refreshModels = useCallback(async () => {
    if (!settings?.llmEnabled) return;
    setModelsLoading(true);
    setModelsError("");
    try {
      const fetched = await llmListModels(apiUrl);
      const merged = mergeModelLists(fetched, settings.llmModelsCache, [settings.llmModel]);
      await patch({ llmModelsCache: merged });
      recordLlmRequest({
        kind: "models",
        apiUrl,
        model: settings.llmModel,
        messageCount: 0,
        preview: `GET /models · ${merged.length} models`,
        status: "ok",
      });
    } catch (e) {
      setModelsError(String(e));
      recordLlmRequest({
        kind: "models",
        apiUrl,
        model: settings.llmModel,
        messageCount: 0,
        preview: "GET /models",
        status: "error",
        detail: String(e),
      });
    } finally {
      setModelsLoading(false);
    }
  }, [apiUrl, patch, settings]);

  const addModel = useCallback(
    async (id: string) => {
      if (!settings) return;
      const merged = addModelToList(settings.llmModelsCache, id);
      await patch({ llmModelsCache: merged, llmModel: id.trim() });
    },
    [patch, settings],
  );

  useEffect(() => {
    if (!settings?.llmEnabled || !hasKey || settings.llmModelsCache.length > 0) return;
    void refreshModels();
  }, [hasKey, refreshModels, settings?.llmEnabled, settings?.llmModelsCache.length]);

  const saveApiKey = async () => {
    await llmSetApiKey(apiKeyDraft);
    setApiKeyDraft("");
    setHasKey(await llmHasApiKey());
  };

  const modelList = useMemo(() => {
    if (!settings) return [];
    return settings.llmModelsCache.length > 0
      ? settings.llmModelsCache
      : settings.llmModel
        ? [settings.llmModel]
        : [];
  }, [settings]);

  const filteredModelList = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return modelList;
    return modelList.filter((id) => id.toLowerCase().includes(q));
  }, [modelList, modelQuery]);

  const addCandidate = modelQuery.trim();
  const canAddFromSearch =
    addCandidate.length > 0 &&
    !modelList.some((id) => id.toLowerCase() === addCandidate.toLowerCase());

  if (!settings) return null;

  const onProviderChange = (providerId: string) => {
    const preset = providerById(providerId);
    void patch({
      llmProvider: preset.id,
      llmApiUrl: preset.id === "custom" ? settings.llmApiUrl : preset.apiUrl,
      llmModel: preset.defaultModel,
      llmModelsCache: [],
    });
  };

  const last = telemetry.lastRequest;
  const usage = telemetry.lastUsage;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-axion-text">{t("llmTitle")}</h1>
          <EnableLlmSwitch
            enabled={settings.llmEnabled}
            disabled={loading}
            label={t("llmEnabled")}
            onToggle={() => void patch({ llmEnabled: !settings.llmEnabled })}
          />
        </div>
        <p className="max-w-md text-right text-sm leading-snug text-axion-text-muted">{t("llmSubtitle")}</p>
      </header>

      <div className="grid h-[34rem] min-h-[28rem] grid-cols-5 grid-rows-5 gap-2">
        {/* 1 — provider, base URL, API key, list-models request */}
        <section className={`${panelClass} col-span-2 row-span-3 min-h-0`}>
          <PanelTitle>{t("llmPanelConnection")}</PanelTitle>
          <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-axion-text-muted">{t("llmProvider")}</span>
              <AxionSelect
                value={settings.llmProvider}
                disabled={loading || !settings.llmEnabled}
                onChange={onProviderChange}
                options={LLM_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-axion-text-muted">{t("llmApiUrl")}</span>
              {settings.llmProvider === "custom" ? (
                <input
                  className={fieldClass}
                  placeholder="https://api.openai.com/v1"
                  value={settings.llmApiUrl}
                  disabled={loading || !settings.llmEnabled}
                  onChange={(e) => void patch({ llmApiUrl: e.target.value })}
                />
              ) : (
                <p className="rounded-lg border border-axion-border/80 bg-axion-bg/60 px-3 py-2 font-mono text-[11px] text-axion-text-secondary">
                  {apiUrl}
                </p>
              )}
            </label>

            <div className="shrink-0 space-y-2 rounded-lg border border-axion-border/80 bg-axion-bg/25 p-2.5">
              <span className="text-xs font-medium text-axion-text-muted">{t("llmApiKey")}</span>
              <input
                type="password"
                className={fieldClass}
                placeholder={hasKey ? "••••••••  (saved in OS keychain)" : "sk-…"}
                value={apiKeyDraft}
                disabled={loading || !settings.llmEnabled}
                onChange={(e) => setApiKeyDraft(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={loading || !settings.llmEnabled || !apiKeyDraft.trim()}
                  onClick={() => void saveApiKey()}
                  className="rounded-lg bg-axion-accent px-3 py-1.5 text-xs font-medium text-axion-bg hover:opacity-90 disabled:opacity-40"
                >
                  {t("llmSaveApiKey")}
                </button>
                {hasKey ? (
                  <span className="text-[11px] text-axion-text-muted">{t("llmApiKeyStored")}</span>
                ) : null}
              </div>
            </div>

            <div className="mt-auto shrink-0 space-y-1 pt-1">
              <button
                type="button"
                disabled={loading || !settings.llmEnabled || modelsLoading}
                onClick={() => void refreshModels()}
                className="w-full rounded-lg border border-axion-border bg-axion-surface/50 px-3 py-2 text-xs font-medium text-axion-text transition hover:border-axion-accent/50 hover:bg-axion-hover disabled:opacity-40"
              >
                {modelsLoading ? t("llmUpdatingModels") : t("llmFetchModels")}
              </button>
            </div>
          </div>
        </section>

        {/* 2 — models */}
        <section className={`${panelClass} col-span-3 col-start-3 row-span-3 min-h-0 overflow-hidden`}>
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-axion-text-muted">
              {t("llmPanelModels")}
            </h2>
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs text-axion-accent"
              title={settings.llmModel || undefined}
            >
              {settings.llmModel || "—"}
            </span>
            <button
              type="button"
              disabled={loading || !settings.llmEnabled || modelsLoading}
              title={t("llmFetchModels")}
              aria-label={t("llmFetchModels")}
              onClick={() => void refreshModels()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-axion-border bg-axion-bg/50 text-axion-text-secondary transition hover:border-axion-accent/40 hover:text-axion-accent disabled:opacity-40"
            >
              <RefreshCw size={14} className={modelsLoading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-axion-border bg-axion-bg/60 px-2 py-1.5">
                <Search size={14} className="shrink-0 text-axion-text-muted" />
                <input
                  value={modelQuery}
                  disabled={loading || !settings.llmEnabled}
                  onChange={(e) => setModelQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canAddFromSearch) {
                      e.preventDefault();
                      void addModel(addCandidate);
                      setModelQuery("");
                    }
                  }}
                  placeholder="Search or type model id"
                  className="min-w-0 flex-1 bg-transparent text-xs text-axion-text outline-none placeholder:text-axion-text-muted"
                />
              </span>
              {canAddFromSearch ? (
                <button
                  type="button"
                  disabled={!settings.llmEnabled}
                  onClick={() => {
                    void addModel(addCandidate);
                    setModelQuery("");
                  }}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-axion-accent/40 bg-axion-accent/10 px-2 text-[11px] font-medium text-axion-accent hover:bg-axion-accent/20 disabled:opacity-40"
                >
                  <Plus size={14} />
                  Add
                </button>
              ) : null}
            </div>
            <p className="shrink-0 text-[10px] leading-snug text-axion-text-muted">{t("llmModelHint")}</p>
            {modelsError ? <p className="shrink-0 text-xs text-red-300/90">{modelsError}</p> : null}

            <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border border-axion-border/70 bg-axion-bg/40 p-1">
              <ul className="space-y-0.5">
                {filteredModelList.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-axion-text-muted">
                    {modelList.length === 0 ? t("llmNoModelsYet") : "No models match"}
                  </li>
                ) : (
                  filteredModelList.map((id) => {
                    const active = id === settings.llmModel;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          disabled={!settings.llmEnabled}
                          onClick={() => void patch({ llmModel: id })}
                          className={`flex w-full items-center rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition ${
                            active
                              ? "bg-axion-accent/15 text-axion-accent"
                              : "text-axion-text-secondary hover:bg-axion-hover hover:text-axion-text"
                          }`}
                        >
                          <span className="min-w-0 truncate">{id}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* 4 — last request */}
        <section className={`${panelClass} col-span-3 row-span-2 row-start-4 min-h-0`}>
          <PanelTitle>{t("llmPanelLastRequest")}</PanelTitle>
          <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto text-xs leading-relaxed text-axion-text-secondary">
            {!last ? (
              <p className="text-axion-text-muted">{t("llmNoRequestYet")}</p>
            ) : (
              <dl className="space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-axion-text-muted">{t("llmReqType")}</dt>
                  <dd className="font-medium text-axion-text">{last.kind === "chat" ? "Chat" : "Models"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-axion-text-muted">{t("llmReqStatus")}</dt>
                  <dd
                    className={
                      last.status === "ok"
                        ? "text-emerald-300/90"
                        : last.status === "cancelled"
                          ? "text-amber-300/90"
                          : "text-red-300/90"
                    }
                  >
                    {last.status}
                  </dd>
                </div>
                <div>
                  <dt className="text-axion-text-muted">{t("llmReqWhen")}</dt>
                  <dd className="mt-0.5 font-mono text-[11px]">{formatLlmWhen(last.at)}</dd>
                </div>
                <div>
                  <dt className="text-axion-text-muted">{t("llmApiUrl")}</dt>
                  <dd className="mt-0.5 break-all font-mono text-[10px]">{last.apiUrl}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-axion-text-muted">{t("llmModel")}</dt>
                  <dd className="truncate font-mono text-[11px]">{last.model || "—"}</dd>
                </div>
                {last.messageCount > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-axion-text-muted">{t("llmReqMessages")}</dt>
                    <dd>{last.messageCount}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-axion-text-muted">{t("llmReqPreview")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-md border border-axion-border/60 bg-axion-bg/50 p-2 font-mono text-[10px]">
                    {last.preview}
                  </dd>
                </div>
                {last.detail ? (
                  <div>
                    <dt className="text-axion-text-muted">{t("llmReqDetail")}</dt>
                    <dd className="mt-1 text-[11px] text-red-300/90">{last.detail}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>
        </section>

        {/* 5 — usage */}
        <section className={`${panelClass} col-span-2 col-start-4 row-span-2 row-start-4 min-h-0`}>
          <PanelTitle>{t("llmPanelUsage")}</PanelTitle>
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 text-xs">
            {!usage ? (
              <p className="text-axion-text-muted">{t("llmNoUsageYet")}</p>
            ) : (
              <dl className="space-y-1.5">
                <MotionUsageRow label={t("llmUsagePrompt")} value={usage.promptTokens} />
                <MotionUsageRow label={t("llmUsageCompletion")} value={usage.completionTokens} />
                <MotionUsageRow label={t("llmUsageTotal")} value={usage.totalTokens} highlight />
              </dl>
            )}
            <p className="shrink-0 text-[10px] leading-relaxed text-axion-text-muted">{t("llmHint")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function EnableLlmSwitch({
  enabled,
  disabled,
  label,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
          enabled ? "bg-axion-accent" : "bg-axion-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            enabled ? "left-[1.35rem]" : "left-0.5"
          }`}
        />
      </button>
      <span className="text-sm text-axion-text-secondary">{label}</span>
    </label>
  );
}

function MotionUsageRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs leading-snug">
      <dt className={`shrink-0 ${highlight ? "text-axion-text-secondary" : "text-axion-text-muted"}`}>{label}</dt>
      <dd
        className={`font-mono tabular-nums ${highlight ? "text-sm font-medium text-axion-accent" : "text-sm text-axion-text"}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
