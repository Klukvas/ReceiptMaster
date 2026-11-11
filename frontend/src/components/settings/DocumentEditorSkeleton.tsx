import { Skeleton } from "../ui/Skeleton";

/**
 * The editor's sections (your business, customer details, template and title, colour and logo,
 * texts, language and formats, saved sets) at 375 px and at 1280 px. Their real height depends on
 * the account (a template that prints terms, filled bank details), so these sit between a sparse
 * and a filled-in account, within about 6% of both. That keeps the page from jumping thousands of
 * pixels, and the requisites card below from moving, when the configuration arrives.
 */
const SECTION_HEIGHTS = [
  "h-[1200px] lg:h-[697px]",
  "h-[260px] lg:h-[179px]",
  "h-[319px] lg:h-[307px]",
  "h-[638px] lg:h-[553px]",
  "h-[430px] lg:h-[386px]",
  "h-[401px] lg:h-[390px]",
  "h-[46px]",
] as const;

const FIELD_ROWS = 3;

/** Placeholder for `DocumentEditor` while the saved configuration loads. */
export function DocumentEditorSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      {/* The intro sentence wraps to two lines on a phone. */}
      <div className="h-10 lg:h-5">
        <Skeleton className="h-4 w-3/4 max-w-md" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 space-y-3 lg:space-y-5">
          {SECTION_HEIGHTS.map((height, index) => (
            <div
              key={index}
              className={`overflow-hidden rounded-xl border border-[var(--color-border)] bg-elevated p-5 ${height}`}
            >
              <Skeleton className="h-5 w-40" />
              {index < SECTION_HEIGHTS.length - 1 && (
                <div className="mt-5 space-y-4">
                  {Array.from({ length: FIELD_ROWS }, (_, row) => (
                    <div key={row} className="space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* On a phone the preview is a collapsed bar above the form, as in the editor. */}
        <div className="order-first min-h-[78px] min-w-0 self-start rounded-xl border border-[var(--color-border)] bg-elevated p-4 lg:order-none lg:min-h-0">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 hidden aspect-[1/1.414] w-full lg:block" />
        </div>
      </div>
    </div>
  );
}
