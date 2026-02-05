export interface Notification {
  type: 'success' | 'error';
  message: string;
}

export class NotificationService {
  private notifications: Notification[] = [];
  private listeners: Set<(notifications: Notification[]) => void> = new Set();
  private timeouts: Map<Notification, NodeJS.Timeout> = new Map();

  addNotification(notification: Notification) {
    this.notifications.push(notification);
    this.notifyListeners();

    // Auto-remove after 3 seconds
    const timeoutId = setTimeout(() => {
      this.removeNotification(notification);
    }, 3000);
    this.timeouts.set(notification, timeoutId);
  }

  removeNotification(notification: Notification) {
    // Clear the timeout to prevent memory leaks
    const timeoutId = this.timeouts.get(notification);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(notification);
    }

    this.notifications = this.notifications.filter(n => n !== notification);
    this.notifyListeners();
  }

  clearNotifications() {
    // Clear all timeouts
    this.timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.timeouts.clear();

    this.notifications = [];
    this.notifyListeners();
  }

  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getNotifications()));
  }

  // Convenience methods
  success(message: string) {
    this.addNotification({ type: 'success', message });
  }

  error(message: string) {
    this.addNotification({ type: 'error', message });
  }
}

// Singleton instance
export const notificationService = new NotificationService();
