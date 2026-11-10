import { MoreVertical, Plus, Save, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionProfile } from "../lib/api";
import {
  draftFromProfileFields,
  draftToProfileFields,
  transportProxyToDraft,
  type TransportProxyDraft,
} from "../lib/transportProxy";
import { TransportProxyDialog } from "./TransportProxyDialog";
import { TransportProxyLink } from "./TransportProxyLink";
import { HostContextMenu, type HostMenuAction } from "./HostContextMenu";
import { AxionCheckbox } from "./ui/AxionCheckbox";
import { ButtonLabelSkeleton } from "./ui/Skeleton";
import { useI18n } from "../lib/i18n";
import { isWindowsOs, useRuntimeOs } from "../lib/platform";
import {
  deleteProfile,
  draftFromProfile,
  draftToProfile,
  emptyDraft,
  saveProfileDraft,
  type ProfileDraft,
} from "../lib/profiles";

const fieldClass =
  "w-full rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm text-axion-text outline-none focus:border-axion-accent";

const PANEL_MS = 280;

type Props = {
  profiles: ConnectionProfile[];
  onRefresh: () => Promise<void>;
  onConnect: (profile: ConnectionProfile, password?: string) => void;
  connecting: boolean;
  error?: string;
};

export function ConnectionsPanel({ profiles, onRefresh, onConnect, connecting, error }: Props) {
  const { t, tf } = useI18n();
  const runtimeOs = useRuntimeOs();
  const savePasswordLabel = isWindowsOs(runtimeOs)
    ? t("connSavePasswordWin")
    : t("connSavePasswordKeyring");
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; profile: ConnectionProfile } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionProfile | null>(null);
  const [proxyProfile, setProxyProfile] = useState<ConnectionProfile | null>(null);
  const [proxyDraft, setProxyDraft] = useState<TransportProxyDraft | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = (partial: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...partial }));

  const openFormAnimated = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setFormOpen(true);
    requestAnimationFrame(() => setFormVisible(true));
  }, []);

  const closeFormAnimated = useCallback(() => {
    setFormVisible(false);
    closeTimer.current = setTimeout(() => {
      setFormOpen(false);
      setEditingId(null);
      setFormError("");
    }, PANEL_MS);
  }, []);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError("");
    openFormAnimated();
  };

  const openEditForm = (p: ConnectionProfile) => {
    setEditingId(p.id);
    setDraft(draftFromProfile(p));
    setFormError("");
    openFormAnimated();
  };

  const openMenu = (clientX: number, clientY: number, profile: ConnectionProfile) => {
    setMenu({ x: clientX, y: clientY, profile });
  };

  const onMenuAction = (action: HostMenuAction) => {
    if (!menu) return;
    const p = menu.profile;
    setMenu(null);
    if (action === "edit") openEditForm(p);
    if (action === "delete") setDeleteTarget(p);
    if (action === "proxy") {
      setProxyProfile(p);
      setProxyDraft(transportProxyToDraft(p.transportProxy));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteProfile(deleteTarget.id);
      await onRefresh();
      if (editingId === deleteTarget.id) closeFormAnimated();
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  };

  const saveProxyOnly = async (tp: TransportProxyDraft) => {
    if (!proxyProfile) return;
    const d = draftFromProfile(proxyProfile);
    Object.assign(d, draftToProfileFields(tp));
    await saveProfileDraft(d);
    await onRefresh();
    setProxyProfile(null);
    setProxyDraft(null);
  };

  const connectTo = (p: ConnectionProfile) => {
    if (connecting) return;
    setLastTouchedId(p.id);
    const password = editingId === p.id && formOpen ? draft.password : undefined;
    onConnect(p, password);
  };

  const save = async () => {
    if (!draft.host.trim()) {
      setFormError(t("connHostRequired"));
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const saved = await saveProfileDraft(draft);
      await onRefresh();
      setEditingId(saved.id);
      setDraft((d) => ({ ...d, id: saved.id, name: saved.name }));
      setLastTouchedId(saved.id);
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeFromForm = async () => {
    if (!draft.id) {
      closeFormAnimated();
      return;
    }
    setDeleteTarget(draftToProfile(draft));
  };

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
      <section
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-4 transition-[filter,opacity] duration-300 sm:px-6 sm:py-5 lg:px-8 ${
          formOpen ? "pointer-events-none blur-[5px] brightness-[0.55]" : ""
        }`}
      >
        <header className="mb-3 flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:mb-4">
          <p className="text-[10px] uppercase tracking-wide text-axion-text-muted sm:text-xs">{t("connClickToConnect")}</p>
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex shrink-0 items-center gap-2 rounded-l-2xl rounded-r-2xl bg-axion-accent px-4 py-2 text-sm font-medium text-black sm:px-5 sm:py-2.5"
          >
            <Plus size={16} />
            {t("connAddHost")}
          </button>
        </header>
        {error && !formOpen && <p className="mb-2 shrink-0 text-sm text-axion-error">{error}</p>}
        <ul className="hide-scrollbar flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto sm:gap-1.5">
          {profiles.length === 0 && (
            <li className="flex flex-1 items-center justify-center py-12 text-sm text-axion-text-muted sm:py-16">
              {t("connNoHosts")}
            </li>
          )}
          {profiles.map((p) => {
            const active = p.id === lastTouchedId;
            return (
              <li
                key={p.id}
                className="w-full"
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e.clientX, e.clientY, p);
                }}
              >
                <div
                  className={`flex w-full min-w-0 items-center overflow-hidden rounded-l-2xl rounded-r-2xl border transition ${
                    active
                      ? "border-axion-accent/45 bg-axion-hover ring-1 ring-axion-accent/25"
                      : "border-axion-border/40 bg-axion-surface/60 hover:bg-axion-hover"
                  }`}
                >
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => connectTo(p)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition disabled:opacity-60 sm:gap-4 sm:px-5 sm:py-3.5"
                  >
                    <Server size={18} className="shrink-0 text-axion-accent sm:h-5 sm:w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-axion-text sm:text-base">{p.name}</p>
                      <p className="truncate text-xs text-axion-text-secondary sm:text-sm">
                        {p.username}@{p.host}
                        <span className="text-axion-text-muted sm:hidden">:{p.port}</span>
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2 pr-3 text-axion-text-muted sm:gap-2.5 sm:pr-5">
                    <span className="hidden text-xs sm:inline">
                      {t("commonPort")} {p.port}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        openMenu(rect.right, rect.bottom, p);
                      }}
                      className="rounded-md p-1 transition hover:text-axion-text-secondary"
                      aria-label={tf("connOptionsFor", { name: p.name })}
                    >
                      <MoreVertical size={18} strokeWidth={2.25} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {formOpen && (
        <div
          className={`absolute inset-0 z-20 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${
            formVisible ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeFormAnimated}
          aria-hidden
        />
      )}

      {formOpen && (
        <aside
          className={`hide-scrollbar absolute right-0 top-0 z-30 flex h-full w-full flex-col overflow-y-auto rounded-l-2xl border-l border-axion-border bg-axion-elevated p-4 shadow-2xl transition-transform duration-300 ease-out sm:max-w-md sm:p-5 ${
            formVisible ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-axion-text">
                {draft.id ? t("connEditHost") : t("connNewHost")}
              </h2>
              <p className="text-xs text-axion-text-muted">{t("connFillDetails")}</p>
            </div>
            <button
              type="button"
              onClick={closeFormAnimated}
              className="text-xs text-axion-text-muted hover:text-axion-text-secondary"
            >
              {t("commonClose")}
            </button>
          </div>
          <div className="grid gap-2.5">
            <Field label={t("commonName")} value={draft.name} onChange={(name) => patch({ name })} placeholder="Production" />
            <Field label={t("commonAddress")} value={draft.host} onChange={(host) => patch({ host })} placeholder="127.0.0.1" />
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("commonPort")} value={String(draft.port)} onChange={(v) => patch({ port: Number(v) || 22 })} />
              <Field label={t("commonUsername")} value={draft.username} onChange={(username) => patch({ username })} />
            </div>
            <Field
              label={t("commonPassword")}
              value={draft.password}
              onChange={(password) => patch({ password })}
              type="password"
            />
            <div>
              <Field
                label={t("qcProxyJump")}
                value={draft.proxyJump}
                onChange={(proxyJump) => patch({ proxyJump })}
                placeholder="user@bastion:22"
              />
              <TransportProxyLink
                value={draftFromProfileFields(
                  draft.proxyType,
                  draft.proxyHost,
                  draft.proxyPort,
                  draft.proxyUser,
                  draft.proxyPass,
                )}
                onChange={(tp) => patch(draftToProfileFields(tp))}
                className="mt-1"
                subtle
              />
            </div>
            <AxionCheckbox
              checked={draft.rememberPassword}
              onChange={(e) => patch({ rememberPassword: e.target.checked })}
              label={savePasswordLabel}
            />
          </div>
          {formError && <p className="mt-2 text-xs text-axion-error">{formError}</p>}
          {error && <p className="mt-2 text-xs text-axion-error">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving || !draft.host.trim()}
              onClick={save}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-axion-accent py-2 text-sm font-medium text-black disabled:opacity-50"
              aria-busy={saving}
            >
              <Save size={15} />
              {saving ? <ButtonLabelSkeleton variant={2} onAccent /> : t("commonSave")}
            </button>
            {draft.id && (
              <button
                type="button"
                disabled={saving}
                onClick={removeFromForm}
                className="rounded-lg border border-axion-border px-3 py-2 text-axion-error hover:bg-axion-hover"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {draft.id && (
            <button
              type="button"
              disabled={connecting}
              onClick={() => onConnect(draftToProfile(draft), draft.password)}
              className="mt-2 w-full rounded-lg border border-axion-accent/50 py-2 text-sm text-axion-accent hover:bg-axion-hover disabled:opacity-50"
              aria-busy={connecting}
            >
              {connecting ? <ButtonLabelSkeleton variant={0} /> : t("connConnectNow")}
            </button>
          )}
        </aside>
      )}

      {menu && (
        <HostContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} onSelect={onMenuAction} />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          name={deleteTarget.name}
          busy={saving}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          t={t}
          tf={tf}
        />
      )}

      {proxyProfile && proxyDraft && (
        <TransportProxyDialog
          open
          initial={proxyDraft}
          onClose={() => {
            setProxyProfile(null);
            setProxyDraft(null);
          }}
          onConfirm={(next) => {
            void saveProxyOnly(next);
          }}
        />
      )}
    </div>
  );
}

function ConfirmDeleteDialog({
  name,
  busy,
  onCancel,
  onConfirm,
  t,
  tf,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: import("../lib/i18n/en").MessageKey) => string;
  tf: (key: import("../lib/i18n/en").MessageKey, vars: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        className="w-full max-w-sm rounded-xl border border-axion-border bg-axion-elevated p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-axion-text">{t("connDeleteHostTitle")}</h3>
        <p className="mt-2 text-sm text-axion-text-secondary">{tf("connDeleteHostBody", { name })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-axion-text-secondary hover:bg-axion-hover"
          >
            {t("commonCancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-lg bg-axion-error/90 px-4 py-2 text-sm font-medium text-white hover:bg-axion-error disabled:opacity-50"
          >
            {busy ? t("commonDeleting") : t("commonDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-axion-text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </label>
  );
}
