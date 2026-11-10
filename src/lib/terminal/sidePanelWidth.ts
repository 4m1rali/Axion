export const TERMINAL_SIDE_PANEL_WIDTH_KEY = "axion-terminal-side-panel-width";

export const TERMINAL_SIDE_PANEL_WIDTH_DEFAULT = 288;
export const TERMINAL_SIDE_PANEL_WIDTH_MIN = 220;
export const TERMINAL_SIDE_PANEL_WIDTH_MAX = 720;

export function clampSidePanelWidth(
  width: number,
  containerWidth?: number,
): number {
  const maxByContainer =
    containerWidth && containerWidth > 0
      ? Math.floor(containerWidth * 0.62)
      : TERMINAL_SIDE_PANEL_WIDTH_MAX;
  const max = Math.min(TERMINAL_SIDE_PANEL_WIDTH_MAX, Math.max(TERMINAL_SIDE_PANEL_WIDTH_MIN, maxByContainer));
  return Math.min(max, Math.max(TERMINAL_SIDE_PANEL_WIDTH_MIN, Math.round(width)));
}

export function loadSidePanelWidth(): number {
  try {
    const raw = localStorage.getItem(TERMINAL_SIDE_PANEL_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) return clampSidePanelWidth(n);
  } catch {
    /* private mode */
  }
  return TERMINAL_SIDE_PANEL_WIDTH_DEFAULT;
}

export function saveSidePanelWidth(width: number): void {
  try {
    localStorage.setItem(TERMINAL_SIDE_PANEL_WIDTH_KEY, String(width));
  } catch {
    /* quota */
  }
}
