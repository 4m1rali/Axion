import { MacWindowControls } from "./WindowControls";

export function AppHeader() {
  return (
    <header className="flex h-9 shrink-0 items-center justify-end bg-axion-bg">
      <div data-tauri-drag-region className="h-full min-w-0 flex-1" />
      <MacWindowControls className="flex-row-reverse pr-3 pl-1" />
    </header>
  );
}
