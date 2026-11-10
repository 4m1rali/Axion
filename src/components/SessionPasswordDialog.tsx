import { useI18n } from "../lib/i18n";
import { ButtonLabelSkeleton } from "./ui/Skeleton";

const fieldClass =
  "w-full rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm text-axion-text outline-none focus:border-axion-accent";

export function SessionPasswordDialog({
  hostLabel,
  subtitle,
  password,
  onPasswordChange,
  connecting,
  onCancel,
  onSubmit,
}: {
  hostLabel: string;
  subtitle?: string;
  password: string;
  onPasswordChange: (v: string) => void;
  connecting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t, tf } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[205] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        className="w-full max-w-sm rounded-xl border border-axion-border bg-axion-elevated p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-axion-text">{t("pwdRequired")}</h3>
        <p className="mt-2 text-sm text-axion-text-secondary">
          {subtitle ?? tf("pwdEnterFor", { host: hostLabel })}
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-axion-text-muted">{t("commonPassword")}</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password.trim() && onSubmit()}
            className={fieldClass}
            autoComplete="current-password"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-axion-text-secondary">
            {t("commonCancel")}
          </button>
          <button
            type="button"
            disabled={!password.trim() || connecting}
            onClick={onSubmit}
            className="rounded-lg bg-axion-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            aria-busy={connecting}
          >
            {connecting ? <ButtonLabelSkeleton variant={1} onAccent /> : t("commonContinue")}
          </button>
        </div>
      </div>
    </div>
  );
}
