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
} from "../../lib/document-number-format";
import { numberingRefusal, type NumberingField } from "../../lib/numbering-errors";
import type { NumberingSetting } from "../../lib/api";
import { useUpdateDocumentNumbering } from "../../hooks/useDocumentNumbering";
import { useSettledValue } from "../../hooks/useSettledValue";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";

type RowForm = { prefix: string; padding: number; includeYear: boolean; startText: string };
type ServerErrors = Partial<Record<NumberingField, string>>;

const INPUT_CLASS =
  "w-full px-3 py-2 pointer-coarse:min-h-11 text-sm border rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400";
const HINT_CLASS = "mt-1 text-xs text-content-tertiary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-content-tertiary";
const paddingOptions = Array.from(
  { length: PADDING_MAX - PADDING_MIN + 1 },
  (_, index) => PADDING_MIN + index,
);

const formOf = (setting: NumberingSetting): RowForm => ({
  prefix: setting.prefix,
  padding: setting.padding,
  includeYear: setting.includeYear,
  startText: "",
});

/** A pause long enough that typing in a field is announced once, not per keystroke. */
const ANNOUNCE_DELAY_MS = 800;
const PADDING_EXAMPLE_VALUE = 7;
const PREFIX_EXAMPLE = "INV-";

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
    ...(startNumber !== null && startNumber < setting.minStart
      ? { startNumber: t("numbering.errors.startTooLow", { min: setting.minStart }) }
      : {}),
  };
  const errorOf = (field: NumberingField) => clientErrors[field] ?? serverErrors[field];

  const isDirty =
    form.prefix.trim() !== setting.prefix ||
    form.padding !== setting.padding ||
    form.includeYear !== setting.includeYear ||
    startText !== "";
  const canSave = isDirty && Object.keys(clientErrors).length === 0 && !update.isPending;

  const preview = isDirty
    ? formatDocumentNumber(form, startNumber ?? setting.nextValue)
    : setting.nextNumber;
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
            placeholder={PREFIX_EXAMPLE}
            autoComplete="off"
            aria-invalid={Boolean(errorOf("prefix"))}
            aria-describedby={`${idOf("prefix-hint")}${errorOf("prefix") ? ` ${idOf("prefix-error")}` : ""}`}
            onChange={(event) => change({ prefix: event.target.value }, ["prefix"])}
            className={`${INPUT_CLASS} ${borderOf(Boolean(errorOf("prefix")))}`}
          />
          <p id={idOf("prefix-hint")} className={HINT_CLASS}>
            {t("numbering.prefixHint", { example: PREFIX_EXAMPLE })}
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
            placeholder={String(setting.minStart)}
            autoComplete="off"
            aria-invalid={Boolean(errorOf("startNumber"))}
            aria-describedby={`${idOf("start-hint")}${errorOf("startNumber") ? ` ${idOf("start-error")}` : ""}`}
            onChange={(event) => change({ startText: event.target.value }, ["startNumber"])}
            className={`${INPUT_CLASS} ${borderOf(Boolean(errorOf("startNumber")))}`}
          />
          <p id={idOf("start-hint")} className={HINT_CLASS}>
            {t("numbering.startHint", { min: setting.minStart })}
          </p>
          <FieldError id={idOf("start-error")} message={errorOf("startNumber")} />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-content-secondary pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={form.includeYear}
              aria-describedby={form.includeYear ? idOf("year-hint") : undefined}
              onChange={(event) => change({ includeYear: event.target.checked }, [])}
              className="h-4 w-4 rounded border-[var(--color-border)] text-accent-base focus:ring-[var(--color-ring)] pointer-coarse:h-5 pointer-coarse:w-5"
            />
            {t("numbering.includeYear")}
          </label>
          {form.includeYear && (
            <p id={idOf("year-hint")} className={HINT_CLASS}>
              {t("numbering.yearHint")}
            </p>
          )}
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
