import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../lib/i18n";
import type { SftpFileEntry } from "../../lib/sftp";

export type SftpMenuAction =
  | "new-folder"
  | "new-file"
  | "refresh"
  | "open"
  | "rename"
  | "delete"
  | "upload"
  | "download";

type Props = {
  x: number;
  y: number;
  target: "pane" | "entry";
  entry?: SftpFileEntry;
  paneRemote: boolean;
  transfersEnabled?: boolean;
  onClose: () => void;
  onSelect: (action: SftpMenuAction, entry?: SftpFileEntry) => void;
};

export function SftpContextMenu({
  x,
  y,
  target,
  entry,
  paneRemote,
  transfersEnabled,
  onClose,
  onSelect,
}: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  const pick = (action: SftpMenuAction) => {
    onSelect(action, entry);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-[220] min-w-[11.5rem] animate-[fadeIn_0.12s_ease-out] rounded-xl border border-axion-border bg-axion-elevated py-1 shadow-2xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {target === "pane" ? (
        <>
          <Item label={t("sftpNewFolder")} onClick={() => pick("new-folder")} />
          <Item label={t("sftpNewFile")} onClick={() => pick("new-file")} />
          <Item label={t("commonRefresh")} onClick={() => pick("refresh")} />
        </>
      ) : (
        <>
          <Item label={t("commonOpen")} onClick={() => pick("open")} />
          {transfersEnabled && !entry?.isDir && !paneRemote && (
            <Item label={t("sftpUploadToRemote")} onClick={() => pick("upload")} />
          )}
          {transfersEnabled && !entry?.isDir && paneRemote && (
            <Item label={t("sftpDownload")} onClick={() => pick("download")} />
          )}
          <Item label={t("commonRename")} onClick={() => pick("rename")} />
          <Item label={t("commonDelete")} danger onClick={() => pick("delete")} />
        </>
      )}
    </div>,
    document.body,
  );
}

function Item({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-axion-hover ${
        danger ? "text-axion-error" : "text-axion-text"
      }`}
    >
      {label}
    </button>
  );
}
