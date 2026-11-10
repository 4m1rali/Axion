import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { useI18n } from "../lib/i18n";
import { localizedAuthOptions, localizedElevationOptions } from "../lib/i18n/quickConnectOptions";
import {
  authMethodShowsKbdiFallback,
  authMethodShowsPassword,
  type QuickConnectFields,
} from "../lib/quickConnect";
import { TransportProxyLink } from "./TransportProxyLink";
import { AxionCheckbox } from "./ui/AxionCheckbox";
import { AxionSelect } from "./ui/AxionSelect";

const fieldClass =
  "w-full min-w-0 rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-sm text-axion-text outline-none transition placeholder:text-axion-text-muted focus:border-axion-accent";

type Props = {
  value: QuickConnectFields;
  onChange: (next: QuickConnectFields) => void;
  showNetworkExtras?: boolean;
  compact?: boolean;
};

export function QuickConnectForm({ value, onChange, showNetworkExtras = true, compact = false }: Props) {
  const { t } = useI18n();
  const authOptions = useMemo(() => localizedAuthOptions(t), [t]);
  const elevationOptions = useMemo(() => localizedElevationOptions(t), [t]);
  const patch = (partial: Partial<QuickConnectFields>) => onChange({ ...value, ...partial });
  const showPassword = authMethodShowsPassword(value.authMethod);
  const showKbdi = authMethodShowsKbdiFallback(value.authMethod);
  const gssKex = value.kerberosGssKex;

  const setGssKex = (on: boolean) => {
    patch({
      kerberosGssKex: on,
      kerberosDelegation: on ? value.kerberosDelegation : false,
      kerberosGssapiKeyex: on,
    });
  };

  const rowLabel = compact ? "text-[11px]" : "text-xs";
  const gap = compact ? "gap-2" : "gap-2.5";
  const pad = compact ? "p-3 pt-4" : "p-4 pt-5";

  const labelCol = compact ? "6.75rem" : "7.25rem";

  return (
    <div
      className={`grid grid-cols-1 gap-3 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto] lg:gap-4 ${compact ? "text-sm" : ""}`}
    >
      <Fieldset title={t("qcServer")} className={`${pad} lg:col-start-1 lg:row-start-1`}>
        <div className={`flex flex-col ${gap}`}>
          <FormRow label={t("commonHost")} labelClass={rowLabel} labelCol={labelCol}>
            <input
              value={value.host}
              onChange={(e) => patch({ host: e.target.value })}
              placeholder="127.0.0.1"
              className={fieldClass}
              autoComplete="off"
            />
          </FormRow>
          <FormRow label={t("commonPort")} labelClass={rowLabel} labelCol={labelCol}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <input
                type="number"
                min={1}
                max={65535}
                value={value.port}
                onChange={(e) => patch({ port: Number(e.target.value) || 22 })}
                className={`${fieldClass} w-20 shrink-0`}
              />
              <AxionCheckbox
                checked={value.enableObfuscation}
                onChange={(e) =>
                  patch({
                    enableObfuscation: e.target.checked,
                    obfuscationKeyword: e.target.checked ? value.obfuscationKeyword : "",
                  })
                }
                label={t("qcEnableObfuscation")}
                labelClassName="text-sm text-axion-text-secondary"
              />
            </div>
          </FormRow>
          <FormRow label={t("qcObfuscationKeyword")} labelClass={rowLabel} labelCol={labelCol}>
            <input
              value={value.obfuscationKeyword}
              disabled={!value.enableObfuscation}
              onChange={(e) => patch({ obfuscationKeyword: e.target.value })}
              className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-45`}
            />
          </FormRow>
        </div>
      </Fieldset>

      <Fieldset title={t("qcKerberos")} className={`${pad} lg:col-start-1 lg:row-start-2`}>
        <div className={`flex flex-col ${gap}`}>
          <FormRow label={t("qcKerberosSpn")} labelClass={rowLabel} labelCol={labelCol}>
            <input
              value={value.kerberosSpn}
              onChange={(e) => patch({ kerberosSpn: e.target.value })}
              disabled={!gssKex}
              className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-45`}
            />
          </FormRow>
          <CheckboxInset labelCol={labelCol}>
            <AxionCheckbox
              checked={gssKex}
              onChange={(e) => setGssKex(e.target.checked)}
              label={t("qcGssKex")}
              labelClassName="text-sm text-axion-text-secondary"
            />
          </CheckboxInset>
          <CheckboxInset labelCol={labelCol}>
            <AxionCheckbox
              checked={value.kerberosDelegation}
              disabled={!gssKex}
              onChange={(e) => patch({ kerberosDelegation: e.target.checked })}
              label={t("qcDelegation")}
              labelClassName="text-sm text-axion-text-secondary"
            />
          </CheckboxInset>
          <CheckboxInset labelCol={labelCol}>
            <AxionCheckbox
              checked={gssKex ? value.kerberosGssapiKeyex : false}
              disabled
              onChange={() => {}}
              label={t("qcGssapiKeyex")}
              labelClassName="text-sm text-axion-text-secondary"
            />
          </CheckboxInset>
          {!gssKex && (
            <p className="text-[10px] leading-snug text-axion-text-muted lg:pl-[calc(var(--qc-label)+0.75rem)]" style={{ "--qc-label": labelCol } as CSSProperties}>
              {t("qcKerberosHint")}
            </p>
          )}
        </div>
      </Fieldset>

      <Fieldset title={t("qcAuth")} className={`${pad} lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch`}>
        <div className={`flex flex-col ${gap}`}>
          <FormRow label={t("commonUsername")} labelClass={rowLabel} labelCol={labelCol}>
            <input
              value={value.username}
              onChange={(e) => patch({ username: e.target.value })}
              placeholder="root"
              className={fieldClass}
              autoComplete="username"
            />
          </FormRow>
          <FormRow label={t("qcInitialMethod")} labelClass={rowLabel} labelCol={labelCol}>
            <AxionSelect
              value={value.authMethod}
              onChange={(authMethod) => patch({ authMethod })}
              options={authOptions}
              menuClassName="max-h-52"
            />
          </FormRow>
          {showPassword && (
            <>
              <CheckboxInset labelCol={labelCol}>
                <AxionCheckbox
                  checked={value.rememberPassword}
                  onChange={(e) => patch({ rememberPassword: e.target.checked })}
                  label={t("qcStorePassword")}
                  labelClassName="text-sm text-axion-text-secondary"
                />
              </CheckboxInset>
              <FormRow label={t("commonPassword")} labelClass={rowLabel} labelCol={labelCol}>
                <input
                  type="password"
                  value={value.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  placeholder={compact ? "••••••••" : t("qcPasswordEmpty")}
                  className={fieldClass}
                  autoComplete="current-password"
                />
              </FormRow>
            </>
          )}
          {showKbdi && (
            <CheckboxInset labelCol={labelCol}>
              <AxionCheckbox
                checked={value.passwordKbdiFallback}
                onChange={(e) => patch({ passwordKbdiFallback: e.target.checked })}
                label={t("qcKbdiFallback")}
                labelClassName="text-sm text-axion-text-secondary"
              />
            </CheckboxInset>
          )}
          {!showPassword && (
            <p className="rounded-lg border border-axion-border/70 bg-axion-bg/40 px-3 py-2 text-xs text-axion-text-secondary">
              {value.authMethod === "publickey" ||
              value.authMethod === "publickeyPassword" ||
              value.authMethod === "publickeyKbdi"
                ? t("qcAuthHintPublickey")
                : value.authMethod === "gssapiWithMic"
                  ? t("qcAuthHintGssapi")
                  : t("qcAuthHintNoPassword")}
            </p>
          )}
          <FormRow label={t("qcElevation")} labelClass={rowLabel} labelCol={labelCol}>
            <AxionSelect
              value={value.elevation}
              onChange={(elevation) => patch({ elevation })}
              options={elevationOptions}
            />
          </FormRow>
        </div>
      </Fieldset>

      {showNetworkExtras && (
        <Fieldset title={t("qcNetwork")} className={`${pad} lg:col-span-2 lg:row-start-3`}>
          <div className={`flex flex-col ${gap}`}>
            <FormRow label={t("qcProxyJump")} labelClass={rowLabel} labelCol={labelCol}>
              <div className="flex min-w-0 flex-col">
                <input
                  value={value.proxyJump}
                  onChange={(e) => patch({ proxyJump: e.target.value })}
                  placeholder="user@bastion:22"
                  className={fieldClass}
                />
                <TransportProxyLink
                  value={value.transportProxy}
                  onChange={(transportProxy) => patch({ transportProxy })}
                  className="mt-1.5"
                  subtle
                />
              </div>
            </FormRow>
          </div>
        </Fieldset>
      )}
    </div>
  );
}

function Fieldset({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={`m-0 min-w-0 rounded-xl border border-axion-border/70 bg-axion-bg/40 ${className}`}
    >
      <legend className="mb-2 ml-2 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-axion-text-muted">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function FormRow({
  label,
  labelClass,
  labelCol,
  children,
}: {
  label: string;
  labelClass: string;
  labelCol: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-1 items-center gap-1 sm:gap-x-3 max-sm:[&>span]:mb-0.5 sm:[grid-template-columns:var(--qc-label)_minmax(0,1fr)]"
      style={{ "--qc-label": labelCol } as CSSProperties}
    >
      <span className={`text-axion-text-muted sm:text-right ${labelClass}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CheckboxInset({ labelCol, children }: { labelCol: string; children: ReactNode }) {
  return (
    <div
      className="max-sm:pl-0 sm:pl-[calc(var(--qc-label)+0.75rem)]"
      style={{ "--qc-label": labelCol } as CSSProperties}
    >
      {children}
    </div>
  );
}

