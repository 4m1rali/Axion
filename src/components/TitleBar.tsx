import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import logo from "../assets/axion-logo.jpg";
import { useSessionStore } from "../stores/sessionStore";

export function TitleBar() {
  const connected = useSessionStore((s) => s.connections.length);
  const win = getCurrentWindow();

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center justify-between border-b border-axion-border bg-axion-bg px-3"
    >
      <div data-tauri-drag-region className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-axion-bg p-0.5">
          <img src={logo} alt="Axion" className="h-full w-full rounded-[5px] object-cover" />
        </span>
        <span className="text-sm font-semibold tracking-wide text-axion-text">Axion</span>
        <span className="text-xs text-axion-text-muted">
          {connected > 0 ? `${connected} active` : "Disconnected"}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => win.minimize()}
          className="rounded-md p-2 text-axion-text-secondary hover:bg-axion-hover"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => win.toggleMaximize()}
          className="rounded-md p-2 text-axion-text-secondary hover:bg-axion-hover"
        >
          <Square size={13} />
        </button>
        <button
          type="button"
          onClick={() => win.close()}
          className="rounded-md p-2 text-axion-text-secondary hover:bg-red-500/20 hover:text-axion-error"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
