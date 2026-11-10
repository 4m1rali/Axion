import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  dropUp?: boolean;
  width?: number;
  children: ReactNode;
  className?: string;
};

export function PopoverPortal({
  open,
  anchorRef,
  panelRef,
  dropUp = false,
  width = 260,
  children,
  className = "",
}: Props) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      left = Math.max(8, left);

      if (dropUp) {
        const maxH = Math.min(320, r.top - 12);
        setStyle({
          position: "fixed",
          left,
          bottom: window.innerHeight - r.top + 6,
          width: w,
          maxHeight: maxH,
          zIndex: 10000,
          visibility: "visible",
        });
      } else {
        const maxH = Math.min(320, window.innerHeight - r.bottom - 12);
        setStyle({
          position: "fixed",
          left,
          top: r.bottom + 6,
          width: w,
          maxHeight: maxH,
          zIndex: 10000,
          visibility: "visible",
        });
      }
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, dropUp, width]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={`flex flex-col overflow-hidden rounded-xl border border-axion-border bg-axion-surface shadow-2xl ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

export function popoverContains(
  target: Node,
  anchorRef: RefObject<HTMLElement | null>,
  panelEl: HTMLElement | null | undefined,
): boolean {
  return Boolean(anchorRef.current?.contains(target) || panelEl?.contains(target));
}
