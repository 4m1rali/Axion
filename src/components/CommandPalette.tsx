import { invoke } from "@tauri-apps/api/core";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n/en";
import { useUiStore, type AppPage, type SettingsTab } from "../stores/uiStore";

const CLOSE_MS = 180;

type PaletteAction = {
  id: string;
  labelKey: MessageKey;
  page?: AppPage;
  settingsTab?: SettingsTab;
  run?: () => Promise<void>;
};

const actionDefs: PaletteAction[] = [
  { id: "nav-dashboard", labelKey: "paletteNavDashboard", page: "dashboard" },
  { id: "nav-connections", labelKey: "paletteNavConnections", page: "connections" },
  { id: "nav-terminal", labelKey: "paletteNavTerminal", page: "terminal" },
  { id: "nav-sftp", labelKey: "paletteNavSftp", page: "sftp" },
  { id: "nav-tunnels", labelKey: "paletteNavTunnels", page: "tunnels" },
  { id: "nav-keys", labelKey: "paletteNavKeys", page: "keys" },
  { id: "nav-settings", labelKey: "paletteNavSettings", page: "settings" },
  { id: "nav-appearance", labelKey: "paletteNavAppearance", settingsTab: "appearance" },
  { id: "nav-llm", labelKey: "paletteNavLlm", settingsTab: "llm" },
  {
    id: "import-ssh-config",
    labelKey: "paletteImportSsh",
    run: async () => {
      await invoke("ssh_config_import");
    },
  },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const setPage = useUiStore((s) => s.setPage);
  const openSettings = useUiStore((s) => s.openSettings);

  const actions = useMemo(
    () => actionDefs.map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => {
      closingRef.current = false;
      setClosing(false);
      setMounted(false);
      setQuery("");
      onClose();
    }, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      closingRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!mounted || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, closing, requestClose]);

  if (!mounted) return null;

  const backdropAnim = closing
    ? "animate-[backdropOut_0.18s_ease-in_forwards]"
    : "animate-[backdropIn_0.2s_ease-out]";
  const panelAnim = closing
    ? "animate-[fadeOut_0.18s_ease-in_forwards]"
    : "animate-[fadeIn_0.2s_ease-out]";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-24 backdrop-blur-md ${backdropAnim}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("paletteTitle")}
        className={`w-full max-w-lg rounded-xl border border-axion-border bg-axion-elevated shadow-2xl ${panelAnim}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-axion-border px-4 py-3">
          <Search size={16} className="text-axion-text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("palettePlaceholder")}
            className="w-full bg-transparent text-sm text-axion-text outline-none"
          />
        </div>
        <ul className="hide-scrollbar max-h-72 overflow-y-auto p-2">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-axion-text hover:bg-axion-hover"
                onClick={async () => {
                  if (item.settingsTab) openSettings(item.settingsTab);
                  else if (item.page) setPage(item.page);
                  if (item.run) await item.run();
                  requestClose();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
