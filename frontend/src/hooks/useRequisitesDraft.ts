import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { settingsApi } from "../lib/api";
import { parseApiError, validationField } from "../lib/api-errors";
import {
  fieldOfServerPath,
  formFromCompany,
  updateFromForm,
  validateRequisites,
  type RequisitesErrors,
  type RequisitesField,
  type RequisitesForm,
} from "../lib/company-requisites-form";
import { UNSAVED_FORM_KEYS } from "../lib/unsaved-form-keys";
import { COMPANY_INFO_KEY, useCompanyInfo } from "./useCompanyInfo";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

/**
 * The draft of the seller requisites (POST /settings/company-info). It lives above the sub-tabs of
 * Settings > Documents, so it survives a switch between them and one Save bar can save it together
 * with the document design, which is stored (and revisioned) on its own.
 */
export function useRequisitesDraft() {
  const queryClient = useQueryClient();
  const company = useCompanyInfo();
  const [form, setForm] = useState<RequisitesForm | null>(null);
  const [serverErrors, setServerErrors] = useState<RequisitesErrors>({});
  const [shownErrors, setShownErrors] = useState<RequisitesErrors>({});

  const saved = company.data ? formFromCompany(company.data) : null;
  const savedJson = JSON.stringify(saved);
  const previousSaved = useRef<string | null>(null);
  // Seed once, and follow the stored values again whenever the form is still untouched.
  useEffect(() => {
    if (!saved) return;
    const previous = previousSaved.current;
    previousSaved.current = savedJson;
    setForm((current) =>
      current === null || JSON.stringify(current) === previous ? saved : current,
    );
    // `saved` is derived from savedJson, which is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedJson]);

  const isDirty = form !== null && saved !== null && JSON.stringify(form) !== savedJson;
  useUnsavedChangesGuard(isDirty, UNSAVED_FORM_KEYS.requisites);

  const mutation = useMutation({
    mutationFn: (values: RequisitesForm) => settingsApi.updateCompanyInfo(updateFromForm(values)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPANY_INFO_KEY }),
    onError: (error: unknown) => {
      const field = fieldOfServerPath(validationField(error));
      if (field) setServerErrors({ [field]: "settings.requisites.errors.serverInvalid" });
      toast.error(parseApiError(error).message);
    },
  });

  const setField = <F extends RequisitesField>(field: F, value: RequisitesForm[F]) => {
    if (!form) return;
    setForm({ ...form, [field]: value });
    setServerErrors({});
    setShownErrors({ ...shownErrors, [field]: undefined });
  };

  /** Shows what is wrong with the form; true when it can be sent. */
  const validate = (): boolean => {
    if (!form) return false;
    const found = validateRequisites(form);
    setShownErrors(found);
    return Object.keys(found).length === 0;
  };

  /** Sends the form; true once it is stored. A refused value is marked on its field. */
  const save = async (): Promise<boolean> => {
    if (!form || !validate()) return false;
    try {
      await mutation.mutateAsync(form);
      return true;
    } catch {
      // onError has marked the field and said why; the caller only needs to stop.
      return false;
    }
  };

  const discard = () => {
    setForm(saved);
    setServerErrors({});
    setShownErrors({});
  };

  return {
    query: company,
    form,
    errors: { ...shownErrors, ...serverErrors } as RequisitesErrors,
    isDirty,
    isSaving: mutation.isPending,
    setField,
    validate,
    save,
    discard,
  };
}

export type RequisitesDraftModel = ReturnType<typeof useRequisitesDraft>;
