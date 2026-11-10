import { useState } from "react";
import toast from "react-hot-toast";
import { documentLabelKey } from "../../lib/document-types";
import {
  PADDING_MAX,
  PADDING_MIN,
  formatDocumentNumber,
  parseStartNumber,
  prefixProblem,
  PREFIX_MAX_LENGTH,
  trailingSpaceBecomesHyphen,
} from "../../lib/document-number-format";
import { numberingRefusal, type NumberingField } from "../../lib/numbering-errors";
import type { NumberingSetting } from "../../lib/api";
import { useUpdateDocumentNumbering } from "../../hooks/useDocumentNumbering";
import { useSettledValue } from "../../hooks/useSettledValue";
import { useTranslation } from "../../hooks/useTranslation";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";

type RowForm = {
  prefix: string;
  padding: number;
  includeYear: boolean;
  resetEveryYear: boolean;
  startText: string;
};
type ServerErrors = Partial<Record<NumberingField, string>>;

const INPUT_CLASS =
  "w-full px-3 py-2 pointer-coarse:min-h-11 text-sm border rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400";
const HINT_CLASS = "mt-1 text-xs text-content-tertiary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-content-tertiary";
const CHECKBOX_CLASS =
  "h-4 w-4 rounded border-[var(--color-border)] text-accent-base focus:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-5 pointer-coarse:w-5";
const paddingOptions = Array.from(
  { length: PADDING_MAX - PADDING_MIN + 1 },
  (_, index) => PADDING_MIN + index,
);

const formOf = (setting: NumberingSetting): RowForm => ({
  prefix: setting.prefix,
  padding: setting.padding,
  includeYear: setting.includeYear,
  resetEveryYear: setting.resetEveryYear,
  startText: "",
});

/** A pause long enough that typing in a field is announced once, not per keystroke. */
const ANNOUNCE_DELAY_MS = 800;
const PADDING_EXAMPLE_VALUE = 7;
const INVALID_PREVIEW = "—";

const focusField = (id: string) => {
  // The field is re-rendered with its error first; focusing after that keeps the caret there.
  setTimeout(() => document.getElementById(id)?.focus(), 0);
};

const borderOf = (hasError: boolean) =>
  hasError ? "border-[var(--color-danger)]" : "border-[var(--color-border)]";

/** One document type's numbering: prefix, zero padding, year and an optional higher start number. */
export function NumberingRow({ setting }: { setting: NumberingSetting }) {
  const { t } = useTranslation();
  const update = useUpdateDocumentNumbering();
  const [form, setForm] = useState<RowForm>(() => formOf(setting));
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  // A refused start can reveal a higher minimum than the loaded setting (numbers issued meanwhile).
  const [refusedMinStart, setRefusedMinStart] = useState<number | null>(null);
  const minStart = Math.max(setting.minStart, refusedMinStart ?? 0);
  const prefixExample = t("numbering.prefixExample");
  const type = setting.documentType;
  const idOf = (field: string) => `numbering-${type}-${field}`;

  const startText = form.startText.trim();
  const startNumber = startText === "" ? null : parseStartNumber(startText);
  const problem = prefixProblem(form.prefix);
  const clientErrors: ServerErrors = {
    ...(problem
      ? { prefix: t(problem === "invalid" ? "numbering.errors.prefixInvalid" : "numbering.errors.prefixEndsWithDigit", { max: PREFIX_MAX_LENGTH }) }
      : {}),
    ...(startText !== "" && startNumber === null
      ? { startNumber: t("numbering.errors.startInvalid") }
      : {}),
    ...(startNumber !== null && startNumber < minStart
      ? { startNumber: t("numbering.errors.startTooLow", { min: minStart }) }
      : {}),
  };
  const errorOf = (field: NumberingField) => clientErrors[field] ?? serverErrors[field];

  const isDirty =
    form.prefix.trim() !== setting.prefix ||
    form.padding !== setting.padding ||
    form.includeYear !== setting.includeYear ||
    form.resetEveryYear !== setting.resetEveryYear ||
    startText !== "";
  useUnsavedChangesGuard(isDirty, "numbering.discardConfirm");
  const canSave = isDirty && Object.keys(clientErrors).length === 0 && !update.isPending;

  // A prefix the server would refuse is not shown as if it were a number the account will get.
  const preview = !isDirty
    ? setting.nextNumber
    : problem
      ? INVALID_PREVIEW
      : formatDocumentNumber(form, startNumber ?? setting.nextValue);
  // The hint's example follows the row's own digits and year, so it is the number "INV-" would give.
  const prefixHintExample = formatDocumentNumber({ ...form, prefix: prefixExample }, 1);
  // Only the row being edited speaks, and only once the user pauses.
  const announcedPreview = useSettledValue(preview, ANNOUNCE_DELAY_MS);
  const paddingExample = String(PADDING_EXAMPLE_VALUE).padStart(form.padding, "0");

  const change = (patch: Partial<RowForm>, clears: NumberingField[]) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setServerErrors((previous) => {
      const next = { ...previous };
      for (const field of clears) delete next[field];
      return next;
    });
  };

  const save = () => {
    if (!canSave) return;
    setServerErrors({});
    update.mutate(
      {
        type,
        body: {
          prefix: form.prefix.trim(),
          padding: form.padding,
          includeYear: form.includeYear,
          // Absent means "keep" on the server, so it is sent only when it changed.
          ...(form.resetEveryYear !== setting.resetEveryYear ? { resetEveryYear: form.resetEveryYear } : {}),
          ...(startNumber !== null ? { startNumber } : {}),
        },
      },
      {
        onSuccess: (saved) => {
          setForm(formOf(saved));
          toast.success(t("numbering.saved", { type: t(documentLabelKey(type)) }));
        },
        onError: (error) => {
          const refusal = numberingRefusal(error, (min) =>
            t("numbering.errors.startTooLow", { min }),
          );
          if (refusal.minStart !== undefined) setRefusedMinStart(refusal.minStart);
          if (refusal.field) {
            setServerErrors({ [refusal.field]: refusal.message });
            focusField(idOf(refusal.field === "startNumber" ? "start" : refusal.field));
          } else toast.error(refusal.message);
        },
      },
    );
  };

  return (
    <form
      className="rounded-lg border border-[var(--color-border)] p-4"
      aria-labelledby={idOf("title")}
      data-testid={`numbering-row-${type}`}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      noValidate
    >
      <h4 id={idOf("title")} className="mb-3 text-sm font-semibold text-content">
        {t(documentLabelKey(type))}
      </h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={idOf("prefix")} className={LABEL_CLASS}>
            {t("numbering.prefix")}
          </label>
          <input
            id={idOf("prefix")}
            type="text"
            value={form.prefix}
            maxLength={PREFIX_MAX_LENGTH + 8}
            placeholder={prefixExample}
            autoComplete="off"
            aria-invalid={Boolean(errorOf("prefix"))}
            aria-describedby={`${idOf("prefix-hint")}${errorOf("prefix") ? ` ${idOf("prefix-error")}` : ""}`}
            onChange={(event) => change({ prefix: event.target.value }, ["prefix"])}
            className={`${INPUT_CLASS} ${borderOf(Boolean(errorOf("prefix")))}`}
          />
          <p id={idOf("prefix-hint")} className={HINT_CLASS}>
            {trailingSpaceBecomesHyphen(form.prefix) && !problem
              ? t("numbering.prefixSpaceHint", { example: formatDocumentNumber({ ...form, includeYear: false }, 1) })
              : t("numbering.prefixHint", { prefix: prefixExample, example: prefixHintExample })}
          </p>
          <FieldError id={idOf("prefix-error")} message={errorOf("prefix")} />
        </div>
        <div>
          <label htmlFor={idOf("padding")} className={LABEL_CLASS}>
            {t("numbering.padding")}
          </label>
          <select
            id={idOf("padding")}
            value={form.padding}
            aria-invalid={Boolean(errorOf("padding"))}
            aria-describedby={`${idOf("padding-hint")}${errorOf("padding") ? ` ${idOf("padding-error")}` : ""}`}
            onChange={(event) => change({ padding: Number(event.target.value) }, ["padding"])}
            className={`${INPUT_CLASS} ${borderOf(Boolean(errorOf("padding")))}`}
          >
            {paddingOptions.map((digits) => (
              <option key={digits} value={digits}>
                {digits}
              </option>
            ))}
          </select>
          <p id={idOf("padding-hint")} className={HINT_CLASS}>
            {t("numbering.paddingHint", { value: PADDING_EXAMPLE_VALUE, example: paddingExample })}
          </p>
          <FieldError id={idOf("padding-error")} message={errorOf("padding")} />
        </div>
        <div>
          <label htmlFor={idOf("start")} className={LABEL_CLASS}>
            {t("numbering.startNumber")}
          </label>
          <input
            id={idOf("start")}
            type="text"
            inputMode="numeric"
            value={form.startText}
            placeholder={String(minStart)}
            autoComplete="off"
            aria-invalid={Boolean(errorOf("startNumber"))}
            aria-describedby={`${idOf("start-hint")}${errorOf("startNumber") ? ` ${idOf("start-error")}` : ""}`}
            onChange={(event) => change({ startText: event.target.value }, ["startNumber"])}
            className={`${INPUT_CLASS} ${borderOf(Boolean(errorOf("startNumber")))}`}
          />
          <p id={idOf("start-hint")} className={HINT_CLASS}>
            {t(form.resetEveryYear ? "numbering.startHintYearly" : "numbering.startHint", {
              min: minStart,
            })}
          </p>
          <FieldError id={idOf("start-error")} message={errorOf("startNumber")} />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-content-secondary pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={form.includeYear}
              aria-describedby={form.includeYear ? idOf("year-hint") : undefined}
              // Yearly restart prints the year, so switching the year off switches it off too.
              onChange={(event) =>
                change(
                  event.target.checked
                    ? { includeYear: true }
                    : { includeYear: false, resetEveryYear: false },
                  ["resetEveryYear"],
                )
              }
              className={CHECKBOX_CLASS}
            />
            {t("numbering.includeYear")}
          </label>
          {form.includeYear && !form.resetEveryYear && (
            <p id={idOf("year-hint")} className={HINT_CLASS}>
              {t("numbering.yearHint")}
            </p>
          )}
          <label
            className={`flex min-h-10 items-center gap-2 text-sm pointer-coarse:min-h-11 ${
              form.includeYear ? "cursor-pointer text-content-secondary" : "cursor-not-allowed text-content-tertiary"
            }`}
          >
            <input
              type="checkbox"
              checked={form.resetEveryYear}
              disabled={!form.includeYear}
              aria-invalid={Boolean(errorOf("resetEveryYear"))}
              aria-describedby={`${idOf("reset-hint")}${errorOf("resetEveryYear") ? ` ${idOf("reset-error")}` : ""}`}
              onChange={(event) => change({ resetEveryYear: event.target.checked }, ["resetEveryYear"])}
              className={CHECKBOX_CLASS}
            />
            {t("numbering.resetEveryYear")}
          </label>
          <p id={idOf("reset-hint")} className={HINT_CLASS}>
            {t(
              !form.includeYear
                ? "numbering.resetNeedsYear"
                : form.resetEveryYear
                  ? "numbering.resetEveryYearHint"
                  : "numbering.resetEveryYearOffHint",
            )}
          </p>
          <FieldError id={idOf("reset-error")} message={errorOf("resetEveryYear")} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-content-secondary">
          {t("numbering.preview")}:{" "}
          <span className="font-mono font-semibold text-content" data-testid={`numbering-preview-${type}`}>
            {preview}
          </span>
        </p>
        <span role="status" className="sr-only" data-testid={`numbering-announce-${type}`}>
          {isDirty ? `${t("numbering.preview")}: ${announcedPreview}` : ""}
        </span>
        <Button type="submit" size="sm" disabled={!canSave} loading={update.isPending} softDisabled>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
