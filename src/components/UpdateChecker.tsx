import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fetchGitHubUpdate, type AppUpdateOffer } from "../lib/appUpdate";
import { GITHUB_REPO_URL } from "../lib/repo";
import { useI18n } from "../lib/i18n";

const DISMISS_KEY = "axion-update-dismissed";
const POLL_MS = 60_000;

const updateNotesMd: ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-axion-text-secondary">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-axion-bg/60 px-1 py-px font-mono text-[10px] text-axion-text-muted">{children}</code>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-axion-accent hover:underline" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-1 list-disc pl-3 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1 list-decimal pl-3 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
};

export function UpdateChecker() {
  const { t, tf } = useI18n();
  const [offer, setOffer] = useState<AppUpdateOffer | null>(null);
  const [installing, setInstalling] = useState(false);
  const offerRef = useRef<AppUpdateOffer | null>(null);
  const installingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (offer?.version) sessionStorage.setItem(DISMISS_KEY, offer.version);
    offerRef.current = null;
    setOffer(null);
  }, [offer]);

  const install = useCallback(async () => {
    const current = offerRef.current;
    if (!current || installingRef.current) return;
    installingRef.current = true;
    setInstalling(true);
    try {
      if (current.setupUrl) {
        await invoke("install_release_update", { url: current.setupUrl });
      } else {
        await openUrl(`${GITHUB_REPO_URL}/releases/latest`);
        installingRef.current = false;
        setInstalling(false);
      }
    } catch (err) {
      console.warn("[Axion updater] install failed:", err);
      installingRef.current = false;
      setInstalling(false);
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let cancelled = false;

    const tick = async () => {
      if (installingRef.current || cancelled) return;
      try {
        const current = await getVersion();
        const update = await fetchGitHubUpdate(current);
        if (cancelled) return;
        if (!update) {
          offerRef.current = null;
          setOffer(null);
          return;
        }
        const dismissed = sessionStorage.getItem(DISMISS_KEY);
        if (dismissed === update.version) return;
        offerRef.current = update;
        setOffer(update);
      } catch (err) {
        console.warn("[Axion updater] check failed:", err);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!offer) return null;

  return (
    <div
      role="status"
      className="pointer-events-auto fixed bottom-4 left-4 z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-axion-border bg-axion-elevated p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-axion-text">{t("updateAvailableTitle")}</p>
      <p className="mt-1 text-xs leading-relaxed text-axion-text-secondary">
        {tf("updateAvailableBody", { version: offer.version })}
      </p>
      {offer.notes ? (
        <div className="mt-2 max-h-20 overflow-hidden text-[11px] leading-relaxed text-axion-text-muted">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={updateNotesMd}>
            {offer.notes}
          </ReactMarkdown>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={installing}
          onClick={() => void install()}
          className="rounded-lg bg-axion-accent px-3 py-1.5 text-xs font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {installing ? t("updateDownloading") : t("updateInstall")}
        </button>
        <button
          type="button"
          disabled={installing}
          onClick={dismiss}
          className="rounded-lg px-3 py-1.5 text-xs text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text disabled:opacity-50"
        >
          {t("updateLater")}
        </button>
      </div>
    </div>
  );
}
