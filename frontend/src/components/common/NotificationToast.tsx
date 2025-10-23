import { AlertCircle } from 'lucide-react';
import { type Notification } from '../../services/NotificationService';

interface NotificationToastProps {
  notifications: Notification[];
}

export const NotificationToast = ({ notifications }: NotificationToastProps) => {
  if (!notifications || notifications.length === 0) return null;

  return (
    <>
      {notifications.map((notification, index) => (
        <div
          key={index}
          className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
            notification.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' 
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          <div className="flex items-center">
            {notification.type === 'success' ? (
              <div className="w-5 h-5 text-green-400 dark:text-green-500 mr-2">✓</div>
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 dark:text-red-500 mr-2" />
            )}
            {notification.message}
          </div>
        </div>
      ))}
    </>
  );
};
