import { Skeleton } from "../ui/Skeleton";
import type { DocumentGroup } from "./document-layout";

/**
 * The editor's sections (your business, tax and bank, customer details, template and title, colour and logo,
 * texts, language and formats, saved sets) at 375 px and at 1280 px. Their real height depends on
 * the account (a template that prints terms, filled bank details), so the design groups sit between
 * a sparse and a filled-in account, within about 6% of both. That keeps the sub-tab from jumping,
 * and the signature card below from moving, when the configuration arrives.
 */
const SECTION_HEIGHTS: Readonly<Record<DocumentGroup, readonly string[]>> = {
  // Your business, the tax, bank and signatory card, and the customer details. Business is sized
  // with the bank details folded (a new account): when they are open, the extra height is at the
  // card's bottom, below the fold, so the top of the Company details sub-tab does not move.
  business: [
    "h-[842px] lg:h-[482px]",
    "h-[780px] lg:h-[461px]",
    "h-[280px] lg:h-[188px]",
  ],
  template: ["h-[319px] lg:h-[307px]"],
  brand: ["h-[638px] lg:h-[553px]"],
  text: ["h-[430px] lg:h-[386px]"],
  format: ["h-[401px] lg:h-[390px]"],
  // The saved sets are a closed disclosure: a title bar with no fields.
  presets: ["h-[46px]"],
};

const FIELD_ROWS = 3;

/** Placeholder for `DocumentEditor` while the saved configuration loads. */
export function DocumentEditorSkeleton({
  groups,
}: {
  /** The groups the editor is about to show, so the placeholder has their height. */
  groups: readonly DocumentGroup[];
}) {
  const cards = groups.flatMap((group) =>
    SECTION_HEIGHTS[group].map((height) => ({
      height,
      hasFields: group !== "presets",
    })),
  );
  return (
    <div aria-hidden className="space-y-5">
      {/* The intro sentence wraps to two lines on a phone. It sits on the page background, where
          the card tone of a skeleton block would not show. */}
      <div className="h-10 space-y-2 lg:h-5">
        <Skeleton className="h-4 w-full max-w-xl bg-[var(--color-border)]" />
        <Skeleton className="h-4 w-1/2 bg-[var(--color-border)] lg:hidden" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 space-y-3 lg:space-y-5">
          {cards.map(({ height, hasFields }, index) => (
            <div
              key={index}
              className={`overflow-hidden rounded-xl border border-[var(--color-border)] bg-elevated p-5 ${height}`}
            >
              <Skeleton className="h-5 w-40" />
              {hasFields && (
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
          {/* The preview area as it waits for the first render, not a full A4 page. */}
          <Skeleton className="mt-4 hidden h-[390px] w-full lg:block" />
        </div>
      </div>
    </div>
  );
}
