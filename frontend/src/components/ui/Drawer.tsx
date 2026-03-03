import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
 open: boolean;
 onClose: () => void;
 title?: string;
 children: ReactNode;
}

export const Drawer = ({ open, onClose, title, children }: DrawerProps) => {
 useEffect(() => {
 if (!open) return;
 const handler = (e: KeyboardEvent) => {
 if (e.key === 'Escape') onClose();
 };
 document.addEventListener('keydown', handler);
 return () => document.removeEventListener('keydown', handler);
 }, [open, onClose]);

 if (!open) return null;

 return (
 <div className="fixed inset-0 z-50 flex justify-end">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/40 transition-opacity"
 onClick={onClose}
 />
 {/* Panel */}
 <div className="relative w-full max-w-md bg-elevated shadow-xl overflow-y-auto animate-slide-in-right">
 <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-elevated">
 {title && (
 <h2 className="text-lg font-semibold text-content">
 {title}
 </h2>
 )}
 <button
 onClick={onClose}
 className="p-1 rounded-md hover:bg-surface-alt text-content-tertiary"
 >
 <X className="h-5 w-5" />
 </button>
 </div>
 <div className="p-6">{children}</div>
 </div>
 </div>
 );
};
