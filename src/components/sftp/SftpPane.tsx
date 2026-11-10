import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Search,
} from "lucide-react";
import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { useI18n } from "../../lib/i18n";
import type { SftpFileEntry } from "../../lib/sftp";
import { readDragPayload, setDragPayload, type SftpDragPayload } from "../../lib/sftpDrag";
import { fileKind, formatBytes, formatModified, pathSegments, sortEntries } from "../../lib/sftpFormat";
import { SftpFileListSkeleton } from "../loading/SftpFileListSkeleton";
import { SftpContextMenu, type SftpMenuAction } from "./SftpContextMenu";

type Props = {
  title: string;
  path: string;
  remote: boolean;
  entries: SftpFileEntry[];
  loading: boolean;
  error?: string;
  filter: string;
  onFilterChange: (q: string) => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onBreadcrumb: (index: number) => void;
  onOpenEntry: (entry: SftpFileEntry) => void;
  onFileAction?: (action: SftpMenuAction, entry?: SftpFileEntry) => void;
  fileActionsEnabled?: boolean;
  transfersEnabled?: boolean;
  onTransferDrop?: (payload: SftpDragPayload) => void;
  emptyOverlay?: ReactNode;
};

type MenuState =
  | { kind: "pane"; x: number; y: number }
  | { kind: "entry"; x: number; y: number; entry: SftpFileEntry };

export function SftpPane({
  title,
  path,
  remote,
  entries,
  loading,
  error,
  filter,
  onFilterChange,
  canBack,
  canForward,
  onBack,
  onForward,
  onBreadcrumb,
  onOpenEntry,
  onFileAction,
  fileActionsEnabled = true,
  transfersEnabled = false,
  onTransferDrop,
  emptyOverlay,
}: Props) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropHint, setDropHint] = useState(false);
  const side = remote ? "remote" : "local";
  const q = filter.trim().toLowerCase();
  const visible = sortEntries(
    q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries,
  );
  const crumbs = pathSegments(path, remote);
  const actionsOn = fileActionsEnabled && Boolean(onFileAction);

  const openPaneMenu = (e: MouseEvent) => {
    if (!actionsOn || emptyOverlay) return;
    e.preventDefault();
    setMenu({ kind: "pane", x: e.clientX, y: e.clientY });
  };

  const openEntryMenu = (e: MouseEvent, entry: SftpFileEntry) => {
    if (!actionsOn) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ kind: "entry", x: e.clientX, y: e.clientY, entry });
  };

  const onMenuSelect = (action: SftpMenuAction, entry?: SftpFileEntry) => {
    onFileAction?.(action, entry);
  };

  const allowDrop = transfersEnabled && Boolean(onTransferDrop) && !emptyOverlay;

  const onDragOver = (e: DragEvent) => {
    if (!allowDrop) return;
    const payload = readDragPayload(e);
    if (!payload) return;
    if ((remote && payload.side === "local") || (!remote && payload.side === "remote")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = remote ? "copy" : "move";
      setDropHint(true);
    }
  };

  const onDragLeave = () => setDropHint(false);

  const onDrop = (e: DragEvent) => {
    if (!allowDrop) return;
    e.preventDefault();
    setDropHint(false);
    const payload = readDragPayload(e);
    if (!payload || !onTransferDrop) return;
    if (remote && payload.side === "local") onTransferDrop(payload);
    if (!remote && payload.side === "remote") onTransferDrop(payload);
  };

  return (
    <section
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col bg-axion-bg ${
        dropHint ? "ring-2 ring-inset ring-axion-accent/50" : ""
      }`}
      onContextMenu={openPaneMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen size={18} className="shrink-0 text-axion-accent" />
          <span className="truncate text-sm font-semibold text-axion-text">{title}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
        <div className="flex items-center gap-0.5">
          <IconBtn disabled={!canBack} onClick={onBack} label={t("commonBack")}>
            <ChevronLeft size={18} />
          </IconBtn>
          <IconBtn disabled={!canForward} onClick={onForward} label={t("commonForward")}>
            <ChevronRight size={18} />
          </IconBtn>
        </div>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm text-axion-text-secondary">
          {remote && crumbs[0] === "/" ? (
            <Crumb label="/" onClick={() => onBreadcrumb(-1)} active={path === "/" || path === ""} />
          ) : null}
          {crumbs.map((part, i) => {
            if (remote && part === "/") return null;
            const isLast = i === crumbs.length - 1;
            return (
              <span key={`${part}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 || (!remote && crumbs.length > 0) ? (
                  <span className="text-axion-text-muted">›</span>
                ) : null}
                <Crumb label={part} active={isLast} onClick={() => onBreadcrumb(i)} />
              </span>
            );
          })}
          {!remote && crumbs.length === 0 && (
            <span className="text-axion-text-muted">…</span>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-axion-border/60 bg-axion-surface/50 px-2 py-1.5">
            <Search size={14} className="shrink-0 text-axion-text-muted" />
            <input
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={t("commonFilter")}
              className="w-24 bg-transparent text-xs text-axion-text outline-none placeholder:text-axion-text-muted sm:w-32"
            />
          </label>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5rem_4.5rem] gap-2 px-4 pb-2 text-[10px] font-medium uppercase tracking-wide text-axion-text-muted sm:text-xs">
        <span className="flex items-center gap-1">
          Name
          <ChevronDown size={12} className="rotate-180 text-axion-accent" />
        </span>
        <span className="hidden sm:block">Date modified</span>
        <span className="text-right">Size</span>
        <span className="hidden md:block">Kind</span>
      </div>

      <div className="hide-scrollbar relative min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {error && <p className="px-2 py-2 text-sm text-axion-error">{error}</p>}
        {loading && !error && <SftpFileListSkeleton />}
        {!loading && !error && visible.length === 0 && !emptyOverlay && (
          <p className="px-2 py-6 text-center text-sm text-axion-text-muted">This folder is empty</p>
        )}
        {!loading && (
        <ul className="flex flex-col gap-0.5">
          {visible.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                onDoubleClick={() => onOpenEntry(entry)}
                onContextMenu={(e) => openEntryMenu(e, entry)}
                draggable={transfersEnabled && !entry.isDir}
                onDragStart={(e) => setDragPayload(e, entry, side)}
                className="grid w-full grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5rem_4.5rem] items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-axion-hover"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {entry.isDir ? (
                    <Folder size={18} className="shrink-0 text-axion-accent" />
                  ) : (
                    <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                      <File size={18} className="text-axion-text-muted" />
                    </span>
                  )}
                  <span className="truncate text-sm text-axion-text">{entry.name}</span>
                  {!entry.isDir && (
                    <span className="hidden shrink-0 rounded bg-axion-surface px-1 text-[9px] uppercase text-axion-text-muted sm:inline">
                      {fileKind(entry).slice(0, 4)}
                    </span>
                  )}
                </span>
                <span className="hidden truncate text-xs text-axion-text-muted sm:block">
                  {formatModified(entry.modified)}
                </span>
                <span className="text-right text-xs text-axion-text-muted">
                  {entry.isDir ? "—" : formatBytes(entry.size)}
                </span>
                <span className="hidden truncate text-xs text-axion-text-muted md:block">
                  {fileKind(entry)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        )}
        {emptyOverlay}
      </div>

      {menu && (
        <SftpContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.kind === "pane" ? "pane" : "entry"}
          entry={menu.kind === "entry" ? menu.entry : undefined}
          paneRemote={remote}
          transfersEnabled={transfersEnabled}
          onClose={() => setMenu(null)}
          onSelect={onMenuSelect}
        />
      )}
    </section>
  );
}

function IconBtn({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg p-1.5 text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Crumb({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-[8rem] truncate rounded px-1 py-0.5 transition hover:bg-axion-hover hover:text-axion-text ${
        active ? "text-axion-text" : "text-axion-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}
