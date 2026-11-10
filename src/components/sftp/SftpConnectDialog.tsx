import { useEffect } from "react";
import type { ConnectionProfile } from "../../lib/api";
import type { ConnectionRow } from "../../stores/sessionStore";
import { draftToTransportProxy } from "../../lib/transportProxy";
import {
  emptyQuickConnectFields,
  quickConnectFromProfile,
  type QuickConnectFields,
} from "../../lib/quickConnect";
import { useI18n } from "../../lib/i18n";
import { QuickConnectForm } from "../QuickConnectForm";
import { AxionSelect } from "../ui/AxionSelect";
import { ButtonLabelSkeleton } from "../ui/Skeleton";

export type SftpConnectDraft = QuickConnectFields & {
  profileId: string;
  label: string;
  keyRef?: string;
  /** Attach SFTP to an already-authenticated SSH session */
  existingConnectionId?: string;
};

export function draftFromLiveConnection(c: ConnectionRow): SftpConnectDraft {
  return {
    ...emptyQuickConnectFields(),
    host: c.host,
    port: c.port,
    username: c.username,
    profileId: "",
    existingConnectionId: c.id,
    label: `${c.username}@${c.host}`,
  };
}

export const LIVE_CONNECTION_PREFIX = "live:";

export function draftFromProfile(p: ConnectionProfile): SftpConnectDraft {
  return {
    ...quickConnectFromProfile(p),
    profileId: p.id,
    label: p.name || `${p.username}@${p.host}`,
    keyRef: p.keyRef,
  };
}

export function emptyDraft(): SftpConnectDraft {
  return {
    ...emptyQuickConnectFields(),
    profileId: "",
    label: "",
    keyRef: undefined,
  };
}

export function transportProxyForConnect(draft: SftpConnectDraft) {
  return draftToTransportProxy(draft.transportProxy);
}

type Props = {
  open: boolean;
  profiles: ConnectionProfile[];
  liveConnections: ConnectionRow[];
  draft: SftpConnectDraft;
  onDraftChange: (draft: SftpConnectDraft) => void;
  connecting: boolean;
  onCancel: () => void;
  onConnect: () => void;
};

export function SftpConnectDialog({
  open,
  profiles,
  liveConnections,
  draft,
  onDraftChange,
  connecting,
  onCancel,
  onConnect,
}: Props) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open || draft.profileId || draft.existingConnectionId) return;
    if (liveConnections.length > 0) {
      onDraftChange(draftFromLiveConnection(liveConnections[0]));
      return;
    }
    if (profiles.length > 0) {
      onDraftChange(draftFromProfile(profiles[0]));
    }
  }, [open, profiles, liveConnections, draft.profileId, draft.existingConnectionId, onDraftChange]);

  if (!open) return null;

  const onHostPick = (value: string) => {
    if (!value) {
      onDraftChange(emptyDraft());
      return;
    }
    if (value.startsWith(LIVE_CONNECTION_PREFIX)) {
      const id = value.slice(LIVE_CONNECTION_PREFIX.length);
      const c = liveConnections.find((x) => x.id === id);
      if (c) onDraftChange(draftFromLiveConnection(c));
      return;
    }
    const p = profiles.find((x) => x.id === value);
    if (p) onDraftChange(draftFromProfile(p));
  };

  const selectValue = draft.existingConnectionId
    ? `${LIVE_CONNECTION_PREFIX}${draft.existingConnectionId}`
    : draft.profileId || "";

  const usingLive = Boolean(draft.existingConnectionId);

  const hostOptions: { value: string; label: string }[] = [];
  if (liveConnections.length) {
    hostOptions.push(
      ...liveConnections.map((c) => ({
        value: `${LIVE_CONNECTION_PREFIX}${c.id}`,
        label: `Connected — ${c.username}@${c.host}${c.port !== 22 ? `:${c.port}` : ""}`,
      })),
    );
  }
  if (profiles.length) {
    hostOptions.push(
      ...profiles.map((p) => ({
        value: p.id,
        label: `Saved host — ${p.name || `${p.username}@${p.host}`}`,
      })),
    );
  }
  if (hostOptions.length === 0) {
    hostOptions.push({ value: "", label: t("sftpCustomManual") });
  } else {
    hostOptions.unshift({ value: "", label: t("sftpCustomManual") });
  }

  const onQuickConnectChange = (fields: QuickConnectFields) => {
    onDraftChange({ ...draft, ...fields });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        className="hide-scrollbar max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-axion-border bg-axion-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-axion-border px-5 py-4">
          <h3 className="text-base font-semibold text-axion-text">{t("sftpConnectTitle")}</h3>
          <p className="mt-1 text-xs text-axion-text-muted">{t("sftpConnectDesc")}</p>
        </div>

        <div className="hide-scrollbar space-y-4 p-5">
          <label className="block max-w-lg">
            <span className="mb-1 block text-xs text-axion-text-muted">{t("sftpConnection")}</span>
            <AxionSelect
              value={selectValue}
              onChange={onHostPick}
              aria-label={t("sftpConnection")}
              options={hostOptions}
            />
          </label>

          {usingLive && (
            <div className="rounded-lg border border-axion-accent/35 bg-axion-accent/10 px-3 py-2 text-sm text-axion-text-secondary">
              {t("sftpUsingLive")}
            </div>
          )}

          {!usingLive && <QuickConnectForm value={draft} onChange={onQuickConnectChange} compact />}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-axion-border px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm text-axion-text-secondary hover:bg-axion-hover"
          >
            {t("commonCancel")}
          </button>
          <button
            type="button"
            disabled={
              connecting ||
              (!usingLive && (!draft.host.trim() || !draft.username.trim())) ||
              (usingLive && !draft.existingConnectionId)
            }
            onClick={onConnect}
            className="rounded-lg bg-axion-accent px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50"
            aria-busy={connecting}
          >
            {connecting ? (
              <ButtonLabelSkeleton variant={0} onAccent />
            ) : usingLive ? (
              t("sftpOpenSftp")
            ) : (
              t("sftpConnectSftp")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

