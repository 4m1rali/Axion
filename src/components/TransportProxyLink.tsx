import { useState } from "react";
import { useI18n } from "../lib/i18n";
import type { TransportProxyDraft } from "../lib/transportProxy";
import { TransportProxyDialog } from "./TransportProxyDialog";

type Props = {
  value: TransportProxyDraft;
  onChange: (next: TransportProxyDraft) => void;
  className?: string;
  /** Muted text under jump host — no separate Transport row. */
  subtle?: boolean;
};

export function TransportProxyLink({ value, onChange, className = "", subtle = false }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const summary = value.enabled
    ? `${value.type.toUpperCase()} · ${value.host}:${value.port}`
    : t("transportProxyOff");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`m-0 bg-transparent p-0 text-left transition hover:text-axion-text-secondary ${
          subtle ? "text-xs text-axion-text-muted/85" : "text-sm text-axion-text-muted"
        } ${className}`}
      >
        {t("transportProxy")}
        <span className="text-axion-text-muted/80"> — {summary}</span>
      </button>
      <TransportProxyDialog
        open={open}
        initial={value}
        onClose={() => setOpen(false)}
        onConfirm={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </>
  );
}
