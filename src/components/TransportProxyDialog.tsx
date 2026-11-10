import { useEffect, useState } from "react";
import { emptyTransportProxyDraft, type TransportProxyDraft } from "../lib/transportProxy";
import { AxionCheckbox } from "./ui/AxionCheckbox";
import { AxionSelect } from "./ui/AxionSelect";

const PROXY_TYPE_OPTIONS: { value: TransportProxyDraft["type"]; label: string }[] = [
  { value: "http", label: "HTTP CONNECT" },
  { value: "socks4", label: "SOCKS 4" },
  { value: "socks5", label: "SOCKS 5" },
];

const inputClass =
  "w-full rounded-md border border-axion-border bg-axion-bg px-2.5 py-1.5 text-sm text-axion-text outline-none focus:border-axion-accent";

type Props = {
  open: boolean;
  initial: TransportProxyDraft;
  onClose: () => void;
  onConfirm: (draft: TransportProxyDraft) => void;
};

export function TransportProxyDialog({ open, initial, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  if (!open) return null;

  const patch = (partial: Partial<TransportProxyDraft>) => setDraft((d) => ({ ...d, ...partial }));

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="proxy-dialog-title"
        className="w-full max-w-md rounded-xl border border-axion-border bg-axion-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="proxy-dialog-title" className="border-b border-axion-border px-4 py-3 text-base font-semibold text-axion-text">
          Proxy settings
        </h2>
        <div className="space-y-3 px-4 py-3 text-sm">
          <AxionCheckbox
            checked={draft.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            label="Use proxy"
            labelClassName="text-sm text-axion-text-secondary"
          />
          <div className={`space-y-3 ${draft.enabled ? "" : "pointer-events-none opacity-40"}`}>
            <label className="block">
              <span className="mb-1 block text-xs text-axion-text-muted">Proxy type</span>
              <AxionSelect
                value={draft.type}
                onChange={(type) => patch({ type })}
                options={PROXY_TYPE_OPTIONS}
              />
            </label>
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-axion-text-muted">Server</span>
                <input
                  value={draft.host}
                  onChange={(e) => patch({ host: e.target.value })}
                  className={inputClass}
                  placeholder="127.0.0.1"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-axion-text-muted">Port</span>
                <input
                  type="number"
                  value={draft.port}
                  onChange={(e) => patch({ port: Number(e.target.value) || 1080 })}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-axion-text-muted">Username</span>
                <input
                  value={draft.username}
                  onChange={(e) => patch({ username: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-axion-text-muted">Password</span>
                <input
                  type="password"
                  value={draft.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  className={inputClass}
                />
              </label>
            </div>
            <AxionCheckbox
              checked={draft.resolveDnsLocally}
              onChange={(e) => patch({ resolveDnsLocally: e.target.checked })}
              label="Resolve DNS names locally"
              labelClassName="text-xs text-axion-text-muted"
            />
            <p className="text-xs text-axion-text-muted">Used for SSH, terminal, and SFTP on this session.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-axion-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-axion-text-secondary hover:bg-axion-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(draft.enabled ? draft : emptyTransportProxyDraft());
              onClose();
            }}
            className="rounded-lg bg-axion-accent px-4 py-1.5 text-sm font-medium text-black"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
