const SESSION_EXPIRED_KEY = "session_expired";

const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/orders",
  "/products",
  "/recipients",
  "/suppliers",
  "/analytics",
  "/settings",
  "/profile",
] as const;

export const isProtectedPath = (pathname: string): boolean =>
  PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

// sessionStorage can be unavailable (private mode, blocked site data); the message is optional.
export const markSessionExpired = (): void => {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  } catch {
    // Without storage the user simply sees the login screen without the explanation.
  }
};

export const hasSessionExpired = (): boolean => {
  try {
    return sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1";
  } catch {
    return false;
  }
};

export const clearSessionExpired = (): void => {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
};

/** Where to land after signing in: back on the page the user was on, else the dashboard. */
export const postLoginPath = (location: Pick<Location, "pathname" | "search">) =>
  isProtectedPath(location.pathname)
    ? `${location.pathname}${location.search}`
    : "/dashboard";
