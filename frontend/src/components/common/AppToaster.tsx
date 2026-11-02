import { ToastBar, Toaster, type Toast } from "react-hot-toast";
import { useIsDesktop } from "../../hooks/useIsDesktop";

const ERROR_DURATION_MS = 7000;

// On a phone the top-right corner is where the fixed 56px header and its Logout button
// live, so toasts go top-center and start below the header (and the notch).
const MOBILE_CONTAINER_STYLE = {
  top: "calc(56px + env(safe-area-inset-top) + 8px)",
} as const;

const ERROR_ARIA_PROPS = { role: "alert", "aria-live": "assertive" } as const;

// react-hot-toast stamps `status/polite` on every toast when it is created, which beats
// per-type options, so the announcement level is set at render time.
const announceErrorsAssertively = (toast: Toast): Toast =>
  toast.type === "error" ? { ...toast, ariaProps: ERROR_ARIA_PROPS } : toast;

export function AppToaster() {
  const isDesktop = useIsDesktop();

  return (
    <Toaster
      position={isDesktop ? "top-right" : "top-center"}
      containerStyle={isDesktop ? undefined : MOBILE_CONTAINER_STYLE}
      toastOptions={{
        duration: 4000,
        style: {
          background: "var(--toast-bg, #363636)",
          color: "var(--toast-color, #fff)",
          border: "1px solid var(--toast-border, #4a4a4a)",
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: "#4ade80",
            secondary: "#fff",
          },
        },
        // Errors need time to be read and are announced right away.
        error: {
          duration: ERROR_DURATION_MS,
          iconTheme: {
            primary: "#ef4444",
            secondary: "#fff",
          },
        },
      }}
    >
      {(toast) => <ToastBar toast={announceErrorsAssertively(toast)} />}
    </Toaster>
  );
}
