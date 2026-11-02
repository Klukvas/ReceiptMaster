import { Loader2 } from "lucide-react";
import type { ColumnDef } from "../../hooks/useServerPagination";

const SKELETON_BLOCK =
  "h-4 rounded bg-surface-alt animate-pulse motion-reduce:animate-none";
const MAX_SKELETON_CARDS = 10;
const CARD_SKELETON_HEIGHT_CLASS = "h-[120px]";

/** `isShown` false keeps the box (so nothing jumps later) but hides it. */
const visibility = (isShown: boolean) => (isShown ? "" : "invisible");

interface SkeletonRowsProps<T> {
  columns: ColumnDef<T>[];
  rowCount: number;
  hasSelection: boolean;
  hasActions: boolean;
  isShown: boolean;
  cellClassName: string;
}

export function SkeletonRows<T>({
  columns,
  rowCount,
  hasSelection,
  hasActions,
  isShown,
  cellClassName,
}: SkeletonRowsProps<T>) {
  return (
    <>
      {Array.from({ length: rowCount }, (_, row) => (
        <tr
          key={row}
          aria-hidden="true"
          className={`h-[61px] border-b border-[var(--color-border-light)] last:border-0 ${visibility(isShown)}`}
        >
          {hasSelection && (
            <td className="px-4 py-4 w-10">
              <div className="size-4 rounded bg-surface-alt animate-pulse motion-reduce:animate-none" />
            </td>
          )}
          {columns.map((col) => (
            <td key={col.key} className={cellClassName}>
              <div className={`${SKELETON_BLOCK} w-24`} />
            </td>
          ))}
          {hasActions && (
            <td className="px-4 py-4">
              <div className="size-6 rounded bg-surface-alt animate-pulse motion-reduce:animate-none" />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCards({
  itemCount,
  isShown,
}: {
  itemCount: number;
  isShown: boolean;
}) {
  return (
    <div aria-hidden="true" className={`space-y-3 ${visibility(isShown)}`}>
      {Array.from({ length: Math.min(itemCount, MAX_SKELETON_CARDS) }, (_, i) => (
        <div
          key={i}
          className={`${CARD_SKELETON_HEIGHT_CLASS} rounded-xl border border-[var(--color-border)] bg-elevated p-4 space-y-3`}
        >
          <div className={`${SKELETON_BLOCK} w-2/3`} />
          <div className={`${SKELETON_BLOCK} w-1/3`} />
          <div className={`${SKELETON_BLOCK} w-1/2`} />
        </div>
      ))}
    </div>
  );
}

export function PaginationPlaceholder({ isShown }: { isShown: boolean }) {
  return (
    <div aria-hidden="true" className={`pt-1 ${visibility(isShown)}`}>
      <div className="h-10 rounded-lg bg-surface-alt animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

/** Dim-and-spin cover for a list that is refreshing behind its current rows. */
export function RefreshOverlay() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-10 flex items-start justify-center bg-elevated/60 pt-16 backdrop-blur-[1px]"
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary-500 motion-reduce:animate-none" />
    </div>
  );
}
