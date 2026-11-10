import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState } from "react";
import { useI18n } from "../lib/i18n";

type TrafficProps = {
  variant: "close" | "minimize" | "maximize";
  label: string;
  onClick: () => void;
  showGlyph: boolean;
  glyph: string;
};

function TrafficButton({ variant, label, onClick, showGlyph, glyph }: TrafficProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`mac-traffic__dot mac-traffic__dot--${variant} ${showGlyph ? "mac-traffic__dot--glyph" : ""}`}
    >
      <span className="mac-traffic__glyph" aria-hidden>
        {glyph}
      </span>
    </button>
  );
}

/** macOS traffic-light close / minimize / maximize (glyphs on group hover). */
export function MacWindowControls({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const win = getCurrentWindow();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`mac-traffic flex shrink-0 items-center gap-2 ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <TrafficButton
        variant="close"
        label={t("winClose")}
        onClick={() => void win.close()}
        showGlyph={hovered}
        glyph="×"
      />
      <TrafficButton
        variant="minimize"
        label={t("winMinimize")}
        onClick={() => void win.minimize()}
        showGlyph={hovered}
        glyph="−"
      />
      <TrafficButton
        variant="maximize"
        label={t("winMaximize")}
        onClick={() => void win.toggleMaximize()}
        showGlyph={hovered}
        glyph="⤢"
      />
    </div>
  );
}

export function WindowControls() {
  return <MacWindowControls className="flex-row-reverse pr-3 pl-1" />;
}
