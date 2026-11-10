import { AlertCircle } from "lucide-react";
import { type Notification } from "../../services/NotificationService";

interface NotificationToastProps {
  notifications: Notification[];
}

export const NotificationToast = ({
  notifications,
}: NotificationToastProps) => {
  if (!notifications || notifications.length === 0) return null;

  return (
    <>
      {notifications.map((notification, index) => (
        // At the bottom on phones, like the other toasts, so an open dialog's header stays visible.
        <div
          key={index}
          role={notification.type === "success" ? "status" : "alert"}
          className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-4 right-4 left-4 sm:left-auto z-[60] p-4 rounded-md shadow-lg max-w-md sm:max-w-sm ${
            notification.type === "success"
              ? "bg-[var(--color-success-light)] border border-[var(--color-success-light)] text-success-base"
              : "bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-danger-base"
          }`}
        >
          <div className="flex items-center">
            {notification.type === "success" ? (
              <div className="w-5 h-5 text-success-base mr-2">✓</div>
            ) : (
              <AlertCircle className="w-5 h-5 text-danger-base mr-2" />
            )}
            {notification.message}
          </div>
        </div>
      ))}
    </>
  );
};
