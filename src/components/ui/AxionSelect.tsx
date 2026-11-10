import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type AxionSelectOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

const triggerClass =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-axion-border bg-axion-bg px-3 py-2 text-left text-sm text-axion-text outline-none transition hover:border-axion-text-muted/40 focus:border-axion-accent disabled:cursor-not-allowed disabled:opacity-45";

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: AxionSelectOption<T>[];
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  id?: string;
  "aria-label"?: string;
};

export function AxionSelect<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className = "",
  menuClassName = "",
  id,
  "aria-label": ariaLabel,
}: Props<T>) {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = options.find((o) => o.value === value);

  const updatePosition = () => {
    const tr = triggerRef.current;
    if (!tr) return;
    const rect = tr.getBoundingClientRect();
    const gap = 4;
    const estimated = Math.min(options.length * 36 + 8, 240);
    const below = rect.bottom + estimated <= window.innerHeight - 8;
    setMenuPos({
      left: rect.left,
      width: rect.width,
      top: below ? rect.bottom + gap : rect.top - gap - estimated,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const tr = triggerRef.current?.getBoundingClientRect();
    if (!tr) return;
    const gap = 4;
    let top = tr.bottom + gap;
    if (top + rect.height > window.innerHeight - 8) {
      top = tr.top - gap - rect.height;
    }
    setMenuPos((p) => ({ ...p, top }));
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReflow = () => updatePosition();
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        className={`${triggerClass} ${open ? "border-axion-accent" : ""} ${className}`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? value}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-axion-text-muted transition ${open ? "rotate-180 text-axion-accent" : ""}`}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            className={`hide-scrollbar fixed z-[250] max-h-60 animate-[fadeIn_0.12s_ease-out] overflow-y-auto rounded-xl border border-axion-border bg-axion-elevated py-1 shadow-2xl ${menuClassName}`}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={opt.disabled}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full px-3 py-2 text-left text-sm transition disabled:opacity-40 ${
                    active
                      ? "bg-axion-hover text-axion-accent"
                      : "text-axion-text hover:bg-axion-hover"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
