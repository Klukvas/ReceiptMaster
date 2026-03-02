import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

interface PortalDropdownProps {
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  buttonTitle?: string;
}

export const PortalDropdown = ({
  children,
  buttonTitle,
}: PortalDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 12rem = 192px

    setPosition({
      top: rect.bottom + 4,
      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
    });
  }, []);

  const toggle = useCallback(() => {
    if (!isOpen) updatePosition();
    setIsOpen((prev) => !prev);
  }, [isOpen, updatePosition]);

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
      if (e.key === "Escape") close();
    };
    const handleScroll = () => close();

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
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors duration-150"
        title={buttonTitle}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left }}
            className="fixed w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] py-1 animate-modal-content origin-top-right"
          >
            {typeof children === "function"
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
  variant?: "default" | "danger";
  disabled?: boolean;
}

export const DropdownItem = ({
  icon,
  label,
  onClick,
  variant = "default",
  disabled = false,
}: DropdownItemProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors duration-150 disabled:opacity-50 ${
      variant === "danger"
        ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
    }`}
  >
    {icon}
    {label}
  </button>
);

export const DropdownDivider = () => (
  <div className="my-1 border-t border-gray-100 dark:border-gray-700/50" />
);
