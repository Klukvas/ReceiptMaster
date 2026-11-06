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

const cellClass = "px-2 py-2 text-sm";

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
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table data-testid="return-lines" className="w-full min-w-[28rem] text-left">
            <thead className="bg-surface-alt text-xs text-content-tertiary">
              <tr>
                <th scope="col" className="w-8 px-2 py-2">
                  <span className="sr-only">{t("documents.returnNote.select")}</span>
                </th>
                <th scope="col" className="px-2 py-2 font-medium">{t("documents.returnNote.product")}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t("documents.returnNote.ordered")}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t("documents.returnNote.returned")}</th>
                <th scope="col" className="w-28 px-2 py-2 font-medium">{t("documents.returnNote.quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const remaining = remainingReturnQty(item);
                const isSelected = form.selectedItemIds.includes(item.id);
                const qtyError = errors[returnQtyField(item.id)];
                return (
                  <tr
                    key={item.id}
                    data-testid="return-line"
                    data-order-item-id={item.id}
                    className="border-t border-[var(--color-border)] align-top"
                  >
                    <td className={cellClass}>
                      <input
                        type="checkbox"
                        aria-label={t("documents.returnNote.selectLine", { name: item.product_name })}
                        checked={isSelected}
                        disabled={remaining === 0}
                        onChange={(event) => toggle(item.id, event.target.checked)}
                      />
                    </td>
                    <td className={`${cellClass} break-words`}>
                      {item.product_name}
                      {remaining === 0 && (
                        <span className="block text-xs text-content-tertiary">
                          {t("documents.returnNote.fullyReturned")}
                        </span>
                      )}
                    </td>
                    <td className={`${cellClass} text-right tabular-nums`}>{item.qty}</td>
                    <td className={`${cellClass} text-right tabular-nums`}>{item.returned_qty}</td>
                    <td className={cellClass}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={remaining}
                        step={1}
                        aria-label={t("documents.returnNote.quantityFor", { name: item.product_name })}
                        aria-invalid={qtyError ? true : undefined}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-elevated px-2 py-1 text-sm tabular-nums disabled:opacity-40"
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
