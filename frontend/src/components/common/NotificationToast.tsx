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
 ? 'bg-[var(--color-success-light)] border border-[var(--color-success-light)] text-success-base' 
 : 'bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-danger-base'
 }`}
 >
 <div className="flex items-center">
 {notification.type === 'success' ? (
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
