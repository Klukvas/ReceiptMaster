export interface Notification {
  type: 'success' | 'error';
  message: string;
}

export class NotificationService {
  private notifications: Notification[] = [];
  private listeners: Set<(notifications: Notification[]) => void> = new Set();

  addNotification(notification: Notification) {
    this.notifications.push(notification);
    this.notifyListeners();
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.removeNotification(notification);
    }, 3000);
  }

  removeNotification(notification: Notification) {
    this.notifications = this.notifications.filter(n => n !== notification);
    this.notifyListeners();
  }

  clearNotifications() {
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
