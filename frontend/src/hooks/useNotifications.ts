import { useState, useEffect } from 'react';
import { notificationService, type Notification } from '../services/NotificationService';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe(setNotifications);
    return unsubscribe;
  }, []);

  return {
    notifications,
    success: notificationService.success.bind(notificationService),
    error: notificationService.error.bind(notificationService),
    clear: notificationService.clearNotifications.bind(notificationService),
  };
};
