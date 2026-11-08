import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { receiptsApi, type DocumentRequestBody, type Order } from "../../lib/api";
import { ErrorCode, parseApiError, parseRequisitesError, validationField, type RequisitesError } from "../../lib/api-errors";
import type { DocumentConfig } from "../../lib/document-config";
import {
  buildDocumentRequest,
  DEFAULT_PAYMENT_TERM_DAYS,
  EMPTY_RETURN_NOTE,
  formFieldOf,
  quoteDefaults,
  type ActForm,
  type DetailsErrors,
  type InvoiceForm,
  type QuoteForm,
  type ReturnNoteForm,
} from "../../lib/document-details";
import { forecastRequisites } from "../../lib/document-requisites";
import { DOCUMENT_TYPE_META, documentOf, isMultiplePerOrder, type CreatableType, type DocumentTypeMeta } from "../../lib/document-types";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";
import { useCreateDocument } from "../../hooks/useCreateDocument";
import { documentConfigQuery } from "../../hooks/useDocumentDraft";
import { useSignoff } from "../../hooks/useSignoff";
import { useTemplateChoice } from "../../hooks/useTemplateChoice";
import { useTranslation } from "../../hooks/useTranslation";
import { selectClass } from "../settings/DocumentFormatting";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { Modal } from "../ui/Modal";
import { ActDetailsFields, InvoiceDetailsFields, QuoteDetailsFields } from "./DocumentDetailsFields";
import { RequisitesNotice } from "./RequisitesNotice";
import { ReturnNoteFields } from "./ReturnNoteFields";

type CreateDocumentModalProps = {
  order: Order;
  type: CreatableType;
  onClose: () => void;
};

type Replacement = { number: string; limit: number; body: DocumentRequestBody };

const EMPTY_ACT: ActForm = { contractRef: "", from: "", to: "" };
const EMPTY_QUOTE_TERMS = { paymentTerms: "", deliveryTerms: "" };

/** Server refusals of a details field that have a translated text of their own. */
const SERVER_FIELD_ERRORS: Readonly<Record<string, string>> = {
  dueDate: "documents.errors.dueDateServer",
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
  const [actForm, setActForm] = useState<ActForm>(EMPTY_ACT);
  // "Today" is the day in the account's document time zone, as the server counts it. The
  // clock is read once so the suggestion does not drift if the dialog stays open past midnight.
  const documentConfig = useQuery(documentConfigQuery);
  const timeZone = documentConfig.data?.config.formatting.timeZone;
  const [openedAt] = useState(() => new Date());
  const quoteBase = useMemo(
    () => quoteDefaults(timeZone, openedAt),
    [timeZone, openedAt],
  );
  const [quoteEdits, setQuoteEdits] = useState<Partial<QuoteForm>>({});
  const quoteForm: QuoteForm = {
    validUntil: quoteBase.validUntil,
    ...EMPTY_QUOTE_TERMS,
    ...quoteEdits,
  };

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
    if (field) {
      setFieldErrors({ [field]: SERVER_FIELD_ERRORS[field] ?? "documents.errors.invalidField" });
    }
    const { code, message } = parseApiError(error);
    // A field with its own translated text must not repeat the server's English sentence.
    if (!(field && SERVER_FIELD_ERRORS[field])) setSubmitError(message);
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
    if (!isBusy) onClose();
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
    const built = buildDocumentRequest(
      type,
      {
        invoice: invoiceForm,
        act: actForm,
        quote: quoteForm,
        returnNote: returnForm,
        items: order.items,
      },
      quoteBase,
      (design.selectedId || undefined) as DocumentConfig["templateId"] | undefined,
    );
    if (!built.ok) {
      setFieldErrors(built.errors);
      return;
    }
    setIsCheckingRetention(true);
    // A failed lookup must not block the document itself.
    const retention = await receiptsApi
      .getRetention(type)
      .then((response) => response.data)
      .catch(() => null);
    setIsCheckingRetention(false);
    if (retention?.replaces) {
      setReplacement({
        number: retention.replaces.number,
        limit: retention.limit,
        body: built.value,
      });
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
            onChange={setInvoiceEdits}
            today={quoteBase.today}
          />
        )}
        {details === "act" && (
          <ActDetailsFields form={actForm} errors={fieldErrors} onChange={setActForm} />
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
            value={design.selectedId}
            disabled={design.options.length === 0}
            onChange={(event) => design.choose(event.target.value)}
          >
            {design.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
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
          <Button type="button" variant="secondary" onClick={close} disabled={isBusy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isBusy || (design.hasLoaded && design.options.length === 0)}>
            {isBusy ? t("common.saving") : t("documents.create")}
          </Button>
        </div>
      </form>

      <ConfirmModal
        isOpen={replacement !== null}
        onClose={() => setReplacement(null)}
        onConfirm={confirmReplacement}
        variant="warning"
        title={t("documents.replaceOldestTitle")}
        message={t("documents.replaceOldestMessage", {
          limit: replacement?.limit,
          number: replacement?.number,
          type: label,
        })}
        confirmLabel={t("documents.create")}
      />
    </Modal>
  );
}
