import { Pipette } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampByte,
  hueCss,
  normalizeHexInput,
  parseHex,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  type Hsv,
} from "../../lib/color";

type Props = {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
};

const digitClass =
  "w-full min-w-0 rounded-md border border-axion-border bg-axion-bg px-2 py-1.5 text-center text-sm tabular-nums text-axion-text outline-none focus:border-axion-accent";

export function AccentColorPicker({ value, onChange, disabled }: Props) {
  const parsed = parseHex(value) ?? { r: 128, g: 192, b: 224 };
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(parsed));
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragSv = useRef(false);
  const dragHue = useRef(false);

  const emitHsv = useCallback(
    (next: Hsv) => {
      setHsv(next);
      onChange(rgbToHex(hsvToRgb(next)));
    },
    [onChange],
  );

  useEffect(() => {
    const rgb = parseHex(value);
    if (!rgb) return;
    const next = rgbToHsv(rgb);
    setHsv((prev) => {
      const same =
        Math.abs(prev.h - next.h) < 0.5 &&
        Math.abs(prev.s - next.s) < 0.002 &&
        Math.abs(prev.v - next.v) < 0.002;
      return same ? prev : next;
    });
  }, [value]);

  const setFromSv = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    emitHsv({ ...hsvRef.current, s: x, v: 1 - y });
  };

  const setFromHue = (clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    emitHsv({ ...hsvRef.current, h: x * 360 });
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragSv.current) setFromSv(e.clientX, e.clientY);
      if (dragHue.current) setFromHue(e.clientX);
    };
    const onUp = () => {
      dragSv.current = false;
      dragHue.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [emitHsv]);

  const hex = rgbToHex(hsvToRgb(hsv));
  const rgb = hsvToRgb(hsv);

  const pickEyedropper = async () => {
    type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
    const W = window as Window & { EyeDropper?: EyeDropperCtor };
    if (!W.EyeDropper) return;
    try {
      const result = await new W.EyeDropper().open();
      const norm = normalizeHexInput(result.sRGBHex);
      if (norm) onChange(norm);
    } catch {
      /* cancelled */
    }
  };

  const hasEyedropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div
      className={`rounded-xl border border-axion-border bg-axion-surface/50 p-3 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <input
        type="text"
        value={hex}
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => {
          const norm = normalizeHexInput(e.target.value);
          if (norm) onChange(norm);
        }}
        className="mb-3 w-full rounded-lg border border-axion-border bg-axion-bg px-3 py-2 font-mono text-sm text-axion-text outline-none focus:border-axion-accent"
        aria-label="Hex color"
      />

      <div
        ref={svRef}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-36 w-full cursor-crosshair overflow-hidden rounded-lg border border-axion-border/80"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueCss(hsv.h)})`,
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          dragSv.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setFromSv(e.clientX, e.clientY);
        }}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {hasEyedropper && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void pickEyedropper()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-axion-border text-axion-text-secondary transition hover:bg-axion-hover hover:text-axion-text"
            aria-label="Pick color from screen"
          >
            <Pipette size={16} />
          </button>
        )}
        <span
          className="h-9 w-9 shrink-0 rounded-full border border-axion-border shadow-inner"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <div
          ref={hueRef}
          role="slider"
          aria-label="Hue"
          className="relative h-3 min-w-0 flex-1 cursor-pointer rounded-full"
          style={{
            background:
              "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            dragHue.current = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setFromHue(e.clientX);
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
            style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueCss(hsv.h) }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["r", "g", "b"] as const).map((ch) => (
          <label key={ch} className="min-w-0">
            <span className="mb-0.5 block text-center text-[10px] font-semibold uppercase text-axion-text-muted">
              {ch}
            </span>
            <input
              type="number"
              min={0}
              max={255}
              disabled={disabled}
              value={rgb[ch]}
              onChange={(e) => {
                const n = clampByte(Number(e.target.value));
                const nextRgb = { ...rgb, [ch]: n };
                emitHsv(rgbToHsv(nextRgb));
              }}
              className={digitClass}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
