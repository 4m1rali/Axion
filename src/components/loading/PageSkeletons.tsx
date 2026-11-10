import { Skeleton } from "../ui/Skeleton";
import { SftpFileListSkeleton } from "./SftpFileListSkeleton";

function PaneChromeSkeleton({ titleClassName }: { titleClassName: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-axion-bg">
      <div className="flex items-center gap-2 px-4 py-3">
        <Skeleton className="h-[18px] w-[18px] rounded" />
        <Skeleton className={`h-4 ${titleClassName}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-4 min-w-[8rem] flex-1 max-w-md" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5rem_4.5rem] gap-2 px-4 pb-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="hidden h-3 w-20 sm:block" />
        <Skeleton className="ml-auto h-3 w-8" />
        <Skeleton className="hidden h-3 w-8 md:block" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SftpFileListSkeleton />
      </div>
    </div>
  );
}

export function SftpPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden" aria-busy aria-label="Loading SFTP">
      <PaneChromeSkeleton titleClassName="w-14" />
      <div className="w-px shrink-0 bg-axion-border/40" />
      <PaneChromeSkeleton titleClassName="w-2/3 max-w-xs" />
    </div>
  );
}

export function TerminalPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4" aria-busy aria-label="Loading terminal">
      <Skeleton className="h-10 w-56 rounded-lg" />
      <Skeleton className="min-h-0 flex-1 rounded-xl" />
      <div className="rounded-xl border border-axion-border p-3">
        <Skeleton className="mb-3 h-3 w-28" />
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 min-w-[6rem] flex-1 max-w-[10rem]" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  const tile = "rounded-xl border border-axion-border bg-axion-surface/70 p-4";
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6" aria-busy aria-label="Loading settings">
      <div className="grid min-h-[28rem] grid-cols-5 grid-rows-5 gap-2">
        <div className={`${tile} col-span-2 row-span-3`}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-12 w-12 rounded-xl" />
          <Skeleton className="mt-3 h-6 w-32" />
        </div>
        <div className={`${tile} col-span-3 col-start-3 row-span-3`}>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-full min-h-[8rem] w-full" />
        </div>
        <div className={`${tile} col-span-3 row-span-2 row-start-4`}>
          <Skeleton className="h-3 w-24" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-16 flex-1 rounded-xl" />
            <Skeleton className="h-16 flex-1 rounded-xl" />
            <Skeleton className="h-16 flex-1 rounded-xl" />
          </div>
        </div>
        <div className={`${tile} col-span-2 col-start-4 row-span-2 row-start-4`}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-4 w-full" />
        </div>
      </div>
    </div>
  );
}

export function MonitorMetricsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-busy aria-hidden>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

export function TunnelsPageSkeleton() {
  const tile = "rounded-xl border border-axion-border bg-axion-surface/50";
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6" aria-busy aria-hidden>
      <div className="shrink-0 space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
        <div className={`${tile} space-y-3 p-4`}>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className={`${tile} min-h-[14rem] p-4`}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mx-auto mt-8 h-12 w-3/4 max-w-sm" />
        </div>
      </div>
      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

export function KeysPageSkeleton() {
  return (
    <div className="mx-auto h-full max-w-3xl space-y-4 p-4 sm:p-6" aria-busy aria-hidden>
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ConnectionsPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-5" aria-busy aria-hidden>
      <div className="mb-4 flex justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-28 rounded-2xl" />
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-16 w-full rounded-2xl" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" aria-busy aria-hidden>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export function ProfileBlockSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <Skeleton className="h-12 w-12 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

export function LoadingOverlaySkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-axion-bg/80 pt-16">
      <div className="w-full max-w-lg px-4">
        <Skeleton className="mb-4 h-4 w-48 mx-auto" />
        <ul className="space-y-2">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-8 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
