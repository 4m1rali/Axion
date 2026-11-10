import { Skeleton } from "../ui/Skeleton";

const ROWS = 10;
const NAME_WIDTHS = ["w-3/5", "w-2/3", "w-1/2", "w-3/4", "w-2/5"] as const;

export function SftpFileListSkeleton() {
  return (
    <ul className="flex flex-col gap-0.5 px-2 pb-4" aria-busy aria-label="Loading files">
      {Array.from({ length: ROWS }, (_, i) => (
        <li
          key={i}
          className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5rem_4.5rem] items-center gap-2 rounded-lg px-2 py-2"
        >
          <span className="flex items-center gap-2">
            <Skeleton className="h-[18px] w-[18px] shrink-0 rounded" />
            <Skeleton className={`h-4 max-w-full ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
          </span>
          <Skeleton className="hidden h-3 w-4/5 sm:block" />
          <Skeleton className="ml-auto h-3 w-8" />
          <Skeleton className="hidden h-3 w-10 md:block" />
        </li>
      ))}
    </ul>
  );
}
