type Props = {
  className?: string;
};

export function Skeleton({ className = "" }: Props) {
  return <div className={`animate-pulse rounded-md bg-axion-border/40 ${className}`} aria-hidden />;
}

const LABEL_WIDTHS = ["w-20", "w-24", "w-28", "w-[5.5rem]"] as const;

export function ButtonLabelSkeleton({ variant = 0, onAccent }: { variant?: number; onAccent?: boolean }) {
  const tone = onAccent ? "bg-black/25" : "";
  return (
    <Skeleton
      className={`mx-auto inline-block h-4 rounded ${tone} ${LABEL_WIDTHS[variant % LABEL_WIDTHS.length]}`}
      aria-hidden
    />
  );
}
