import { useEffect, useMemo, useRef, useState } from "react";
import { templateDisplayName } from "../../lib/template-name";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { DocumentRequestBody, Order } from "../../lib/api";
import { retentionFindingFor, type RetentionFinding } from "../../lib/document-retention";
import {
  ErrorCode,
  httpStatusOf,
  parseApiError,
  parseRequisitesError,
  translatedApiError,
  validationField,
  type RequisitesError,
} from "../../lib/api-errors";
import type { DocumentConfig } from "../../lib/document-config";
import {
  buildDocumentRequest,
  DEFAULT_PAYMENT_TERM_DAYS,
  EMPTY_RETURN_NOTE,
  formFieldOf,
  quoteDefaults,
  type QuoteDefaults,
  type ActForm,
  type DetailsErrors,
  type InvoiceForm,
  type QuoteForm,
  type ReturnNoteForm,
  withResolvedPeriodErrors,
} from "../../lib/document-details";
import { focusDetailsField } from "../../lib/document-field-focus";
import { forecastRequisites } from "../../lib/document-requisites";
import {
  DOCUMENT_TYPE_META,
  documentOf,
  isMultiplePerOrder,
  type CreatableType,
  type DocumentTypeMeta,
} from "../../lib/document-types";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";
import { useCreateDocument } from "../../hooks/useCreateDocument";
import { documentConfigQuery } from "../../hooks/useDocumentDraft";
import { useDocumentNow } from "../../hooks/useDocumentNow";
import { useOnReturnToTab } from "../../hooks/useOnReturnToTab";
import { useSignoff } from "../../hooks/useSignoff";
import { useTemplateChoice } from "../../hooks/useTemplateChoice";
import { useTranslation } from "../../hooks/useTranslation";
import { selectClass } from "../settings/DocumentFormatting";
import { Button } from "../ui/Button";
import { RetentionConfirmModal } from "../documents/RetentionConfirmModal";
import { Modal } from "../ui/Modal";
import { ActDetailsFields, InvoiceDetailsFields, QuoteDetailsFields } from "./DocumentDetailsFields";
import { RequisitesNotice } from "./RequisitesNotice";
import { ReturnNoteFields } from "./ReturnNoteFields";

type CreateDocumentModalProps = {
  order: Order;
  type: CreatableType;
  onClose: () => void;
};

/** A request held back until the user confirms that the retention cap may delete the oldest document. */
type Replacement = { finding: RetentionFinding; body: DocumentRequestBody };

const EMPTY_ACT: ActForm = { contractRef: "", completionText: "", from: "", to: "" };
const EMPTY_QUOTE_TERMS = { paymentTerms: "", deliveryTerms: "" };

/** Server refusals of a details field that have a translated text of their own. */
const SERVER_FIELD_ERRORS: Readonly<Record<string, string>> = {
  dueDate: "documents.errors.dueDateServer",
};

/** Refusals of the request as a whole (the details do not fit, an unsupported upload). */
const REJECTED_STATUSES: ReadonlySet<number> = new Set([400, 415, 422]);

/** A localized text for a refusal whose only text is the server's (English) one. */
const fallbackErrorKey = (error: unknown): string => {
  const status = httpStatusOf(error);
  return status !== undefined && REJECTED_STATUSES.has(status)
    ? "documents.errors.requestRejected"
    : "documents.errors.createFailed";
};

export function CreateDocumentModal({
  order,
  type,
  onClose,
}: CreateDocumentModalProps) {
  const { t } = useTranslation();
  const company = useCompanyInfo();
  const createDocument = useCreateDocument();
  const queryClient = useQueryClient();
  const design = useTemplateChoice(type);
  const signoff = useSignoff();
  const willPrintSignoff =
    Boolean(signoff.data?.signature || signoff.data?.stamp) &&
    design.options.find((option) => option.id === design.selectedId)?.capabilities.signoff === true;

  const defaultDays = String(
    company.data?.defaultPaymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS,
  );
  const [invoiceEdits, setInvoiceEdits] = useState<Partial<InvoiceForm>>({});
  const invoiceForm: InvoiceForm = {
    mode: "days",
    days: defaultDays,
    dueDate: "",
    ...invoiceEdits,
  };
  // Only the fields the user changed are kept: copying the whole form would freeze the term in
  // days at the fallback if the mode is switched before the account's default has loaded.
  const editInvoice = (next: InvoiceForm) =>
    setInvoiceEdits((previous) => ({
      ...previous,
      ...Object.fromEntries(
        Object.entries(next).filter(
          ([field, value]) => value !== invoiceForm[field as keyof InvoiceForm],
        ),
      ),
    }));
  const [actForm, setActForm] = useState<ActForm>(EMPTY_ACT);
  // "Today" is the day in the account's document time zone, as the server counts it. The clock
  // moves on when that day changes, so a dialog left open past midnight does not offer yesterday.
  const documentConfig = useQuery(documentConfigQuery);
  const timeZone = documentConfig.data?.config.formatting.timeZone;
  const now = useDocumentNow(timeZone);
  const quoteBase = useMemo(() => quoteDefaults(timeZone, now), [timeZone, now]);
  const [quoteEdits, setQuoteEdits] = useState<Partial<QuoteForm>>({});
  const quoteFormFor = (base: QuoteDefaults): QuoteForm => ({
    validUntil: base.validUntil,
    ...EMPTY_QUOTE_TERMS,
    ...quoteEdits,
  });
  const quoteForm = quoteFormFor(quoteBase);

  // Only what the user touched is kept, so an untouched date still follows the time zone
  // once the account's settings arrive.
  const editQuote = (next: QuoteForm) =>
    setQuoteEdits((previous) => ({
      ...previous,
      ...Object.fromEntries(
        Object.entries(next).filter(
          ([field, value]) => value !== quoteForm[field as keyof QuoteForm],
        ),
      ),
    }));

  const [returnForm, setReturnForm] = useState<ReturnNoteForm>(EMPTY_RETURN_NOTE);

  const [fieldErrors, setFieldErrors] = useState<DetailsErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [refusal, setRefusal] = useState<RequisitesError | null>(null);
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const [isCheckingRetention, setIsCheckingRetention] = useState(false);

  // After a refusal, a keyboard or screen-reader user lands on the first field to fix.
  useEffect(() => {
    const [firstField] = Object.keys(fieldErrors);
    if (firstField) focusDetailsField(firstField);
  }, [fieldErrors]);

  const meta: DocumentTypeMeta = DOCUMENT_TYPE_META[type];
  const { labelKey, details, createNoteKey } = meta;
  const label = t(labelKey);
  const isBusy = createDocument.isPending || isCheckingRetention;
  const recipient = order.recipient;
  const current = documentOf(order, type);
  // A repeatable type has no single document to reissue.
  const voidedNumber =
    !isMultiplePerOrder(type) && current?.status === "void" ? current.number : null;

  const forecast =
    company.data &&
    forecastRequisites(type, company.data, recipient, actForm.contractRef);
  const gaps = refusal
    ? { fields: refusal.fields, warnings: refusal.warnings }
    : forecast;

  // The notice links open the company settings or the recipient in a new tab; coming back must
  // show what is stored now, not what was missing when the dialog opened.
  const hasRequisiteGaps = Boolean(gaps && (gaps.fields.length > 0 || gaps.warnings.length > 0));
  useOnReturnToTab(hasRequisiteGaps, () => {
    setRefusal(null);
    void company.refetch();
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
  });

  const isSendingRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const send = async (body: DocumentRequestBody) => {
    // A quick double click on a confirm button fires before the modal re-renders.
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    try {
      await createDocument.mutateAsync({ orderId: order.id, body });
      toast.success(t("documents.created", { type: label }));
      onClose();
    } catch (error) {
      showServerError(error);
    } finally {
      isSendingRef.current = false;
    }
  };

  const showServerError = (error: unknown) => {
    const missing = parseRequisitesError(error);
    if (missing) {
      setRefusal(missing);
      return;
    }
    const path = validationField(error);
    const field = path?.startsWith("details.") ? formFieldOf(path) : null;
    const { code } = parseApiError(error);
    if (field) {
      setFieldErrors({ [field]: SERVER_FIELD_ERRORS[field] ?? "documents.errors.invalidField" });
      // The server's sentence is English; the field says what is wrong. A generic banner covers
      // a field this dialog does not show (say, one line of a return note).
      if (!SERVER_FIELD_ERRORS[field]) setSubmitError(t("documents.errors.checkFields"));
    } else {
      setSubmitError(translatedApiError(error) ?? t(fallbackErrorKey(error)));
    }
    // Someone else (or another tab) already issued it, or returned the units first: show the
    // order as it is now.
    if (
      code === ErrorCode.DOCUMENT_ALREADY_EXISTS ||
      code === ErrorCode.RETURN_QUANTITY_EXCEEDED
    )
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  const close = () => {
    // Closing mid-request would hide the outcome of a document that is still being created.
    if (!isBusy && !isSendingRef.current && !isSubmittingRef.current) onClose();
  };

  const submit = async () => {
    // Two quick submits both see the same idle render, so the state flag alone is not enough
    // for a document that may legitimately be issued many times.
    if (isBusy || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await submitForm();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const submitForm = async () => {
    setFieldErrors({});
    setSubmitError("");
    setRefusal(null);
    // Read the clock again: the day may have turned since the dialog opened, and the limits and the
    // untouched default date must follow it.
    const clock = quoteDefaults(timeZone, new Date());
    const built = buildDocumentRequest(
      type,
      {
        invoice: invoiceForm,
        act: actForm,
        quote: quoteFormFor(clock),
        returnNote: returnForm,
        items: order.items,
      },
      clock,
      (design.selectedId || undefined) as DocumentConfig["templateId"] | undefined,
    );
    if (!built.ok) {
      setFieldErrors(built.errors);
      return;
    }
    setIsCheckingRetention(true);
    const finding = await retentionFindingFor(type);
    setIsCheckingRetention(false);
    if (finding) {
      setReplacement({ finding, body: built.value });
      return;
    }
    await send(built.value);
  };

  const confirmReplacement = () => {
    if (replacement) void send(replacement.body);
    setReplacement(null);
  };

  return (
    <Modal isOpen onClose={close} title={t("documents.createTitle", { type: label })}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {details === "invoice" && (
          <InvoiceDetailsFields
            form={invoiceForm}
            errors={fieldErrors}
            onChange={editInvoice}
            today={quoteBase.today}
          />
        )}
        {details === "act" && (
          <ActDetailsFields
            form={actForm}
            errors={fieldErrors}
            onChange={(next) => {
              setActForm(next);
              setFieldErrors((errors) => withResolvedPeriodErrors(errors, next));
            }}
          />
        )}
        {details === "quote" && (
          <QuoteDetailsFields
            form={quoteForm}
            errors={fieldErrors}
            onChange={editQuote}
            today={quoteBase.today}
          />
        )}
        {details === "return_note" && (
          <ReturnNoteFields
            items={order.items}
            form={returnForm}
            errors={fieldErrors}
            onChange={setReturnForm}
          />
        )}
        {voidedNumber && (
          <p data-testid="document-reissue-note" className="rounded-lg bg-surface-alt p-3 text-sm text-content-secondary">
            {t("documents.reissueNote", { number: voidedNumber })}
          </p>
        )}
        {createNoteKey && (
          <p data-testid="document-create-note" className="rounded-lg bg-surface-alt p-3 text-sm text-content-secondary">
            {t(createNoteKey)}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="document-design" className="block text-sm font-medium text-content-secondary">
            {t("documents.design")}
          </label>
          <select
            id="document-design"
            className={selectClass}
            data-autofocus={details === null || undefined}
            value={design.selectedId}
            disabled={design.options.length === 0}
            onChange={(event) => design.choose(event.target.value)}
          >
            {design.options.map((option) => (
              <option key={option.id} value={option.id}>
                {templateDisplayName(t, option)}
              </option>
            ))}
          </select>
          {design.isAccountDesignUnfit && (
            <p className="text-xs text-content-tertiary">{t("documents.designFallback")}</p>
          )}
          {willPrintSignoff && (
            <p data-testid="document-signoff-note" className="text-xs text-content-tertiary">
              {t("signoff.willBeAdded")}
            </p>
          )}
          {design.hasLoaded && design.options.length === 0 && (
            <p role="alert" className="text-sm text-danger-base">{t("documents.noDesign")}</p>
          )}
        </div>

        {gaps && (
          <RequisitesNotice gaps={gaps} recipientId={recipient.id} isRefusal={refusal !== null} />
        )}

        {submitError && (
          <p role="alert" className="text-sm text-danger-base">{submitError}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={close} disabled={isBusy} softDisabled>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            softDisabled
            disabled={isBusy || (design.hasLoaded && design.options.length === 0)}
          >
            {isBusy ? t("common.saving") : t("documents.create")}
          </Button>
        </div>
      </form>

      <RetentionConfirmModal
        finding={replacement?.finding ?? null}
        typeLabel={label}
        onClose={() => setReplacement(null)}
        onConfirm={confirmReplacement}
      />
    </Modal>
  );
}
