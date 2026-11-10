import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/i18n";

export type HostMenuAction = "edit" | "delete" | "proxy";

type Props = {
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (action: HostMenuAction) => void;
};

export function HostContextMenu({ x, y, onClose, onSelect }: Props) {
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

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-[200] min-w-[11rem] animate-[fadeIn_0.15s_ease-out] rounded-xl border border-axion-border bg-axion-elevated py-1 shadow-2xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem label={t("menuEdit")} onClick={() => onSelect("edit")} />
      <MenuItem label={t("menuProxySettings")} onClick={() => onSelect("proxy")} />
      <MenuItem label={t("menuDelete")} danger onClick={() => onSelect("delete")} />
    </div>,
    document.body,
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
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
