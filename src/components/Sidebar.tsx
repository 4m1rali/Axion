import {
  Cable,
  ChevronLeft,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  Network,
  Server,
  Settings,
  Terminal,
} from "lucide-react";
import logo from "../assets/axion-logo.jpg";
import { useI18n, type MessageKey } from "../lib/i18n";
import { useUiStore, type AppPage } from "../stores/uiStore";

const items: { page: AppPage; labelKey: MessageKey; icon: typeof Server }[] = [
  { page: "dashboard", labelKey: "navDashboard", icon: LayoutDashboard },
  { page: "connections", labelKey: "navConnections", icon: Server },
  { page: "terminal", labelKey: "navTerminal", icon: Terminal },
  { page: "sftp", labelKey: "navSftp", icon: FolderOpen },
  { page: "tunnels", labelKey: "navTunnels", icon: Network },
  { page: "keys", labelKey: "navKeys", icon: KeyRound },
  { page: "settings", labelKey: "navSettings", icon: Settings },
];

export function Sidebar() {
  const page = useUiStore((s) => s.page);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setPage = useUiStore((s) => s.setPage);
  const openSettings = useUiStore((s) => s.openSettings);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const { t } = useI18n();

  return (
    <aside
      className={`flex shrink-0 flex-col rounded-r-2xl border-y border-r border-axion-border bg-axion-sidebar transition-all ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div
        data-tauri-drag-region
        className={`flex shrink-0 border-b border-axion-border ${
          collapsed ? "flex-col items-center gap-1.5 px-1.5 py-2.5" : "items-center gap-2 px-2 py-3 sm:px-3"
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-axion-bg p-1">
          <img src={logo} alt="Axion" className="h-full w-full rounded-md object-cover" />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-wide text-axion-text">Axion</p>
            <p className="text-[10px] uppercase tracking-widest text-axion-text-muted">{t("appSubtitle")}</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-expanded={!collapsed}
          className="shrink-0 rounded-lg p-1.5 text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text focus:outline-none focus-visible:ring-2 focus-visible:ring-axion-accent/35 focus-visible:ring-inset"
        >
          <ChevronLeft size={16} className={`transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 px-2 pb-4 pt-4">
        {items.map(({ page: id, labelKey, icon: Icon }) => {
          const active = page === id;
          const label = t(labelKey);
          return (
            <button
              key={id}
              type="button"
              onClick={() => (id === "settings" ? openSettings("general") : setPage(id))}
              className={`relative flex items-center gap-3 rounded-l-xl rounded-r-md px-3 py-2.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-axion-accent/35 focus-visible:ring-inset ${
                active
                  ? "bg-axion-hover text-axion-accent"
                  : "text-axion-text-secondary hover:bg-axion-hover hover:text-axion-text"
              }`}
            >
              {active && (
                <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded bg-axion-accent" />
              )}
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-axion-border p-2">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-axion-text-muted">
          <Cable size={14} />
          {!collapsed && <span>{t("paletteHint")}</span>}
        </div>
      </div>
    </aside>
  );
}
