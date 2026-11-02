import { useEffect, useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateIntent {
  /** Record to preselect in the create form (e.g. the recipient the user came from). */
  recipientId?: string;
}

/**
 * Opens a page's create form when it is reached through `?create=1` (dashboard quick
 * actions, "Create order" in a recipient's drawer), then removes the parameter so a
 * refresh does not reopen it. The id comes from the URL, so only UUIDs are passed on.
 */
export function useCreateIntent(
  onCreate: (intent: CreateIntent) => void,
  /** Hold the intent until what the handler needs (e.g. plan limits) has loaded. */
  ready = true,
): void {
  const [params, setParams] = useSearchParams();
  const onCreateRef = useRef(onCreate);

  useLayoutEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);

  useEffect(() => {
    if (!ready || params.get("create") !== "1") return;
    const recipientId = params.get("recipientId");
    onCreateRef.current({
      recipientId:
        recipientId && UUID_PATTERN.test(recipientId) ? recipientId : undefined,
    });
    setParams({}, { replace: true });
  }, [ready, params, setParams]);
}
