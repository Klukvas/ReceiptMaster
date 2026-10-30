// The session lives in localStorage, shared by every tab of this origin. Tabs
// refresh independently (there is no cross-tab lock) and the server redeems a
// refresh token once, so when two tabs refresh with the same token one of them
// loses. The loser must adopt the winner's stored session, never clear it.

export const ACCESS_TOKEN_KEY = "auth_token";
export const REFRESH_TOKEN_KEY = "refresh_token";

/** Another tab writes the two tokens with separate setItem calls. */
const SESSION_SETTLE_MS = 300;

/**
 * How long a tab whose refresh was rejected, with storage untouched, waits for
 * the winning tab to store its rotation: the winner's response can arrive well
 * after this tab's 401. A genuine rejection signs out once this runs out.
 */
const WINNER_WRITE_TIMEOUT_MS = 3000;

export type StoredSession = {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
};

type CompleteSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
};

export type RefreshFailureOutcome =
  /** Another tab rotated the session meanwhile: continue with its tokens. */
  | { readonly kind: "adopt"; readonly accessToken: string }
  /** The server rejected this tab's still-current credentials. */
  | { readonly kind: "signed-out" }
  /** Network/server failure or an unsettled write: keep storage untouched. */
  | { readonly kind: "keep" };

export const readStoredSession = (): StoredSession => ({
  accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
});

export const storeSession = (session: CompleteSession): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
};

export const clearStoredSession = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const isUnchanged = (now: StoredSession, sent: StoredSession): boolean =>
  now.accessToken === sent.accessToken &&
  now.refreshToken === sent.refreshToken;

const isEmpty = (now: StoredSession): boolean =>
  !now.accessToken && !now.refreshToken;

const hasNewRefreshToken = (
  now: StoredSession,
  sent: StoredSession,
): now is CompleteSession =>
  !!now.accessToken &&
  !!now.refreshToken &&
  now.refreshToken !== sent.refreshToken;

const isFullyNew = (
  now: StoredSession,
  sent: StoredSession,
): now is CompleteSession =>
  hasNewRefreshToken(now, sent) && now.accessToken !== sent.accessToken;

const isRejection = (status: number | undefined): boolean =>
  status === 401 || status === 403;

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, SESSION_SETTLE_MS));

/**
 * Resolves when another tab writes the refresh token (it is written after the
 * access token, so the pair is complete) or clears storage, or on timeout.
 * Storage events only reach tabs other than the writer — exactly the loser.
 */
const nextRefreshTokenWrite = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    const finish = () => {
      window.removeEventListener("storage", onStorage);
      clearTimeout(timer);
      resolve();
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === REFRESH_TOKEN_KEY || event.key === null)
      )
        finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    window.addEventListener("storage", onStorage);
  });

/**
 * Decides, from storage alone, what a tab whose refresh failed should do.
 * `sent` is the session this tab held when it sent its refresh token.
 */
export const resolveRefreshFailure = async (
  sent: StoredSession,
  status: number | undefined,
): Promise<RefreshFailureOutcome> => {
  const first = readStoredSession();
  if (isFullyNew(first, sent)) {
    return { kind: "adopt", accessToken: first.accessToken };
  }
  const isPartialWrite = !isUnchanged(first, sent) && !isEmpty(first);
  if (!isPartialWrite && !isRejection(status)) return { kind: "keep" };
  // Re-read once. A rejection with storage untouched may be an early loser
  // whose winner has not answered yet: wait (bounded) for its write. A half-done
  // write, or an emptied storage, only needs the short settle.
  // No await precedes the listener, so a write cannot slip in unobserved.
  await (isRejection(status) && isUnchanged(first, sent)
    ? nextRefreshTokenWrite(WINNER_WRITE_TIMEOUT_MS)
    : settle());
  const settled = readStoredSession();
  if (hasNewRefreshToken(settled, sent)) {
    return { kind: "adopt", accessToken: settled.accessToken };
  }
  if (isRejection(status) && (isUnchanged(settled, sent) || isEmpty(settled))) {
    return { kind: "signed-out" };
  }
  return { kind: "keep" };
};
