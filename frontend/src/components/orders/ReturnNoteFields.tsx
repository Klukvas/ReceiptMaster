import { useTranslation } from "../../hooks/useTranslation";
import {
  MAX_RETURN_REASON_LENGTH,
  returnQtyField,
  returnQtyText,
  type DetailsErrors,
  type ReturnNoteForm,
} from "../../lib/document-details";
import { remainingReturnQty } from "../../lib/document-types";
import type { OrderItem } from "../../lib/api";

type ReturnNoteFieldsProps = {
  items: readonly OrderItem[];
  form: ReturnNoteForm;
  errors: DetailsErrors;
  onChange: (form: ReturnNoteForm) => void;
};

/** Lines of the order with what was ordered, what already came back and how many to take back now. */
export function ReturnNoteFields({ items, form, errors, onChange }: ReturnNoteFieldsProps) {
  const { t } = useTranslation();

  const toggle = (itemId: string, isChecked: boolean) =>
    onChange({
      ...form,
      selectedItemIds: isChecked
        ? [...form.selectedItemIds, itemId]
        : form.selectedItemIds.filter((id) => id !== itemId),
    });

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-content-secondary">
          {t("documents.returnNote.linesTitle")}
        </legend>
        <p className="text-xs text-content-tertiary" data-testid="return-note-hint">
          {t("documents.returnNote.hint")}
        </p>
        <ul data-testid="return-lines" className="space-y-2">
          {items.map((item) => {
            const remaining = remainingReturnQty(item);
            const isSelected = form.selectedItemIds.includes(item.id);
            const qtyError = errors[returnQtyField(item.id)];
            const qtyId = `return-qty-${item.id}`;
            return (
              <li
                key={item.id}
                data-testid="return-line"
                data-order-item-id={item.id}
                className="min-w-0 rounded-lg border border-[var(--color-border)] p-3"
              >
                <label className="flex items-start gap-2 text-sm font-medium text-content">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    aria-label={t("documents.returnNote.selectLine", { name: item.product_name })}
                    checked={isSelected}
                    disabled={remaining === 0}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                  <span className="min-w-0 break-words">{item.product_name}</span>
                </label>
                {remaining === 0 && (
                  <p className="mt-1 text-xs text-content-tertiary">
                    {t("documents.returnNote.fullyReturned")}
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-content-tertiary">
                  <div>
                    <dt>{t("documents.returnNote.ordered")}</dt>
                    <dd className="text-sm tabular-nums text-content-secondary">{item.qty}</dd>
                  </div>
                  <div>
                    <dt>{t("documents.returnNote.returned")}</dt>
                    <dd className="text-sm tabular-nums text-content-secondary">{item.returned_qty}</dd>
                  </div>
                </dl>
                <div className="mt-2">
                  <label htmlFor={qtyId} className="mb-1 block text-xs text-content-tertiary">
                    {t("documents.returnNote.quantity")}
                  </label>
                  <input
                    id={qtyId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={remaining}
                    step={1}
                    aria-label={t("documents.returnNote.quantityFor", { name: item.product_name })}
                    aria-invalid={qtyError ? true : undefined}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm tabular-nums disabled:opacity-40"
                    disabled={!isSelected}
                    value={returnQtyText(form, item)}
                    onChange={(event) =>
                      onChange({
                        ...form,
                        quantities: { ...form.quantities, [item.id]: event.target.value },
                      })
                    }
                  />
                  {qtyError && (
                    <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
                      {t(qtyError, { max: remaining })}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {errors.lines && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">{t(errors.lines)}</p>
        )}
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="document-return-reason" className="block text-sm font-medium text-content-secondary">
          {t("documents.returnNote.reason")}
        </label>
        <textarea
          id="document-return-reason"
          rows={3}
          maxLength={MAX_RETURN_REASON_LENGTH}
          placeholder={t("documents.returnNote.reasonPlaceholder")}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          value={form.reason}
          onChange={(event) => onChange({ ...form, reason: event.target.value })}
        />
        {errors.reason && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">{t(errors.reason)}</p>
        )}
      </div>
    </div>
  );
}
