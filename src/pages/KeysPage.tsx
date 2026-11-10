import { Copy, KeyRound, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { KeysPageSkeleton } from "../components/loading/PageSkeletons";
import { ButtonLabelSkeleton } from "../components/ui/Skeleton";
import { useI18n } from "../lib/i18n";
import { deleteKey, generateKey, importKey, listKeys, type KeyRecord } from "../lib/keys";

const fieldClass =
  "w-full rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm text-axion-text outline-none focus:border-axion-accent";

export function KeysPage() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importMaterial, setImportMaterial] = useState("");
  const [importPass, setImportPass] = useState("");
  const [genName, setGenName] = useState("");

  const refresh = useCallback(async () => {
    try {
      setKeys(await listKeys());
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onGenerate = async () => {
    const name = genName.trim() || "Ed25519 key";
    setBusy(true);
    setError("");
    try {
      await generateKey(name);
      setGenName("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (!importMaterial.trim()) {
      setError(t("keysPasteOpenssh"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await importKey(importName.trim() || "Imported key", importMaterial, importPass.trim() || undefined);
      setImportOpen(false);
      setImportMaterial("");
      setImportPass("");
      setImportName("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    try {
      await deleteKey(id);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyPublic = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError(t("keysCopyFail"));
    }
  };

  if (loading) {
    return <KeysPageSkeleton />;
  }

  return (
    <div className="hide-scrollbar mx-auto h-full max-w-3xl space-y-4 overflow-y-auto p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-axion-text">{t("keysTitle")}</h1>
        <p className="mt-1 text-sm text-axion-text-muted">{t("keysDesc")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-[12rem] flex-1 gap-2">
          <input
            className={fieldClass}
            placeholder={t("keysNamePlaceholder")}
            value={genName}
            onChange={(e) => setGenName(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGenerate()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-axion-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            aria-busy={busy}
          >
            <Plus size={16} />
            {busy ? <ButtonLabelSkeleton variant={1} onAccent /> : t("commonGenerate")}
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-axion-border px-4 py-2 text-sm text-axion-text-secondary hover:bg-axion-hover disabled:opacity-50"
        >
          <Upload size={16} />
          {t("commonImport")}
        </button>
      </div>

      {error && <p className="text-sm text-axion-error">{error}</p>}

      {keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-axion-border px-6 py-12 text-center text-sm text-axion-text-muted">
          <KeyRound className="mx-auto mb-2 text-axion-text-muted" size={28} />
          {t("keysNoKeys")}
        </div>
      ) : (
        <ul className="space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="rounded-xl border border-axion-border bg-axion-surface/60 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-axion-text">{k.name}</p>
                  <p className="mt-0.5 text-xs text-axion-text-muted">
                    {k.algorithm} · SHA256:{k.fingerprintSha256.slice(0, 16)}…
                    {k.hasPassphrase ? ` · ${t("keysPassphrase")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void copyPublic(k.publicKeyOpenssh)}
                    className="rounded-lg border border-axion-border p-2 text-axion-text-muted hover:bg-axion-hover hover:text-axion-text"
                    title={t("keysCopyPublicTitle")}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(k.id)}
                    className="rounded-lg border border-axion-border p-2 text-axion-error hover:bg-axion-hover"
                    title={t("commonDelete")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <p className="mt-2 truncate font-mono text-[10px] text-axion-text-secondary" title={k.publicKeyOpenssh}>
                {k.publicKeyOpenssh}
              </p>
            </li>
          ))}
        </ul>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-axion-border bg-axion-elevated p-5 shadow-xl">
            <h2 className="text-base font-semibold text-axion-text">{t("keysImportTitle")}</h2>
            <p className="mt-1 text-xs text-axion-text-muted">{t("keysImportDesc")}</p>
            <label className="mt-4 block text-xs text-axion-text-muted">
              {t("commonName")}
              <input
                className={`${fieldClass} mt-1`}
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs text-axion-text-muted">
              {t("keysPrivateKey")}
              <textarea
                className={`${fieldClass} mt-1 min-h-[8rem] font-mono text-[11px]`}
                value={importMaterial}
                onChange={(e) => setImportMaterial(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs text-axion-text-muted">
              {t("keysPassphraseOptional")}
              <input
                type="password"
                className={`${fieldClass} mt-1`}
                value={importPass}
                onChange={(e) => setImportPass(e.target.value)}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-axion-text-secondary"
              >
                {t("commonCancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onImport()}
                className="rounded-lg bg-axion-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                aria-busy={busy}
              >
                {busy ? <ButtonLabelSkeleton variant={0} onAccent /> : t("commonImport")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
