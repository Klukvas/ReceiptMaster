import { useState, useRef, useEffect, useCallback, useId } from"react";
import { createPortal } from"react-dom";
import { MoreHorizontal } from"lucide-react";
import { useMenuPosition } from"../../hooks/useMenuPosition";

interface PortalDropdownProps {
 children: React.ReactNode | ((close: () => void) => React.ReactNode);
 buttonTitle?: string;
}

const getEnabledItems = (menu: HTMLElement | null) =>
 Array.from(
 menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
 );

export const PortalDropdown = ({
 children,
 buttonTitle,
}: PortalDropdownProps) => {
 const [isOpen, setIsOpen] = useState(false);
 const buttonRef = useRef<HTMLButtonElement>(null);
 const menuRef = useRef<HTMLDivElement>(null);
 // Opens below the trigger, flips above near the bottom edge, and scrolls when nothing fits.
 const position = useMenuPosition(isOpen, buttonRef, menuRef);

 const menuId = useId();

 const close = useCallback(() => setIsOpen(false), []);

 const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

 // Keyboard users get focus inside the menu as soon as it opens.
 useEffect(() => {
 if (isOpen) getEnabledItems(menuRef.current)[0]?.focus();
 }, [isOpen]);

 const handleMenuKeyDown = (e: React.KeyboardEvent) => {
 const items = getEnabledItems(menuRef.current);
 if (items.length === 0) return;
 const current = items.indexOf(document.activeElement as HTMLElement);
 const targets: Record<string, number> = {
 ArrowDown: (current + 1) % items.length,
 ArrowUp: (current - 1 + items.length) % items.length,
 Home: 0,
 End: items.length - 1,
 };
 if (e.key in targets) {
 e.preventDefault();
 items[targets[e.key]].focus();
 } else if (e.key ==="Tab") {
 close();
 }
 };

 const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
 if (e.key !=="ArrowDown" || isOpen) return;
 e.preventDefault();
 setIsOpen(true);
 };

 useEffect(() => {
 if (!isOpen) return;

 const handleClick = (e: MouseEvent) => {
 if (
 menuRef.current &&
 !menuRef.current.contains(e.target as Node) &&
 buttonRef.current &&
 !buttonRef.current.contains(e.target as Node)
 ) {
 close();
 }
 };
 const handleEscape = (e: KeyboardEvent) => {
 if (e.key !=="Escape") return;
 close();
 buttonRef.current?.focus();
 };
 // Scrolling inside a menu that had to cap its height must not close it.
 const handleScroll = (e: Event) => {
 if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
 close();
 };

 document.addEventListener("mousedown", handleClick);
 document.addEventListener("keydown", handleEscape);
 window.addEventListener("scroll", handleScroll, true);
 return () => {
 document.removeEventListener("mousedown", handleClick);
 document.removeEventListener("keydown", handleEscape);
 window.removeEventListener("scroll", handleScroll, true);
 };
 }, [isOpen, close]);

 return (
 <>
 <button
 ref={buttonRef}
 onClick={toggle}
 onKeyDown={handleTriggerKeyDown}
 className="p-1.5 pointer-coarse:p-3.5 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors duration-150"
 title={buttonTitle}
 aria-label={buttonTitle}
 aria-haspopup="menu"
 aria-expanded={isOpen}
 aria-controls={isOpen ? menuId : undefined}
 >
 <MoreHorizontal className="w-4 h-4" />
 </button>

 {isOpen &&
 createPortal(
 <div
 ref={menuRef}
 id={menuId}
 role="menu"
 aria-label={buttonTitle}
 onKeyDown={handleMenuKeyDown}
 style={position}
 className="fixed w-48 bg-elevated rounded-xl shadow-lg border border-[var(--color-border)] z-[9999] py-1 animate-modal-content origin-top-right"
 >
 {typeof children ==="function"
 ? (children as (close: () => void) => React.ReactNode)(close)
 : children}
 </div>,
 document.body,
 )}
 </>
 );
};

interface DropdownItemProps {
 icon: React.ReactNode;
 label: string;
 onClick: () => void;
 variant?:"default" |"danger";
 disabled?: boolean;
}

export const DropdownItem = ({
 icon,
 label,
 onClick,
 variant ="default",
 disabled = false,
}: DropdownItemProps) => (
 <button
 role="menuitem"
 tabIndex={-1}
 onClick={onClick}
 disabled={disabled}
 className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] ${
 variant ==="danger"
 ?"text-danger-base hover:bg-[var(--color-danger-light)]"
 :"text-content-secondary hover:bg-surface-alt"
 }`}
 >
 {icon}
 {label}
 </button>
);

export const DropdownDivider = () => (
 <div className="my-1 border-t border-[var(--color-border-light)]" />
);
