import { CustomizeDocumentModal } from "./CustomizeDocumentModal";
import { CreateDocumentModal } from "./CreateDocumentModal";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MoreVertical,
  Edit,
  XCircle,
  Printer,
  FileText,
  Trash2,
  Download,
  CheckCircle,
  Eye,
  Loader2,
} from "lucide-react";
import type { Order } from "../../lib/api";
import { useTranslation } from "../../hooks/useTranslation";
import {
  activeDocument,
  canCreate,
  CREATABLE_TYPES,
  DOCUMENT_TYPE_META,
  type CreatableType,
  waybillOf,
} from "../../lib/document-types";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  onClick: (event: React.MouseEvent) => void;
  className: string;
  disabled?: boolean;
  isDividerBefore?: boolean;
  /** Items of one group sit under a shared heading. */
  group?: string;
}

type MenuSection = { group?: string; items: { item: MenuItem; index: number }[] };

/** Consecutive items with the same group share one section; flat indices are kept for keyboard focus. */
function sectionsOf(items: MenuItem[]): MenuSection[] {
  return items.reduce<MenuSection[]>((sections, item, index) => {
    const last = sections.at(-1);
    if (last && last.group !== undefined && last.group === item.group)
      return [...sections.slice(0, -1), { ...last, items: [...last.items, { item, index }] }];
    return [...sections, { group: item.group, items: [{ item, index }] }];
  }, []);
}

interface OrderActionsMenuProps {
  order: Order;
  onView: (order: Order) => void;
  onEdit: (order: Order) => void;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (order: Order) => void;
  onDownloadReceipt: (receiptId: string) => void;
  onPrintReceipt: (receiptId: string) => void;
  onGenerateReceipt: (orderId: string) => void;
  isDeleting: boolean;
}

function MenuSectionView({
  section,
  focusedIndex,
  headingId,
}: {
  section: MenuSection;
  focusedIndex: number;
  headingId: string;
}) {
  const buttons = section.items.map(({ item, index }) => {
    const Icon = item.icon;
    return (
      <React.Fragment key={index}>
        {item.isDividerBefore && (
          <div
            role="separator"
            className="border-t border-[var(--color-border-light)] my-1"
          />
        )}
        {index === section.items[0].index && section.group && (
          <div
            id={headingId}
            role="presentation"
            className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary"
          >
            {section.group}
          </div>
        )}
        <button
          onClick={item.onClick}
          disabled={item.disabled}
          role="menuitem"
          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition-colors ${
            item.className
          } ${item.disabled ? "opacity-40 cursor-not-allowed" : ""} ${
            index === focusedIndex ? "bg-surface-alt" : ""
          }`}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span>{item.label}</span>
        </button>
      </React.Fragment>
    );
  });
  return section.group ? (
    <div role="group" aria-labelledby={headingId}>
      {buttons}
    </div>
  ) : (
    <>{buttons}</>
  );
}

export const OrderActionsMenu: React.FC<OrderActionsMenuProps> = ({
  order,
  onView,
  onEdit,
  onConfirm,
  onCancel,
  onDelete,
  onDownloadReceipt,
  onPrintReceipt,
  onGenerateReceipt,
  isDeleting,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [creating, setCreating] = useState<CreatableType | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 480;
      const proposedTop =
        spaceBelow < menuHeight
          ? rect.top - menuHeight + rect.height
          : rect.bottom + 4;
      // Keep the whole menu on screen: with the document group it can be taller than the room above.
      const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);

      setPosition({
        top: Math.max(8, Math.min(proposedTop, maxTop)),
        left: rect.right - 192,
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) updatePosition();
    setIsOpen(!isOpen);
    setFocusedIndex(-1);
  };

  const handleAction = (action: () => void, event: React.MouseEvent) => {
    event.stopPropagation();
    action();
    setIsOpen(false);
  };

  const getMenuItems = useCallback((): MenuItem[] => {
    const items: MenuItem[] = [];
    const baseItem = "text-content-secondary hover:bg-surface-alt";

    // View is always first
    items.push({
      icon: Eye,
      label: t("orders.view"),
      onClick: (e) => handleAction(() => onView(order), e),
      className: baseItem,
    });

    const creatableTypes = CREATABLE_TYPES.filter((type) => canCreate(order, type));
    const createItems: MenuItem[] = creatableTypes.map((type, position) => {
      const meta = DOCUMENT_TYPE_META[type];
      return {
        icon: meta.icon,
        label: t("documents.menuItem", { type: t(meta.labelKey) }),
        onClick: (e) => handleAction(() => setCreating(type), e),
        className: baseItem,
        group: t("documents.createGroup"),
        isDividerBefore: position === 0,
      };
    });

    // Status-dependent actions
    if (order.status === "draft" && !order.is_locked) {
      items.push(
        {
          icon: Edit,
          label: t("orders.edit"),
          onClick: (e) => handleAction(() => onEdit(order), e),
          className: baseItem,
        },
        {
          icon: CheckCircle,
          label: t("orders.confirm"),
          onClick: (e) => handleAction(() => onConfirm(order.id), e),
          className: "text-success-base hover:bg-[var(--color-success-light)]",
          isDividerBefore: true,
        },
        {
          icon: XCircle,
          label: t("orders.cancel"),
          onClick: (e) => handleAction(() => onCancel(order.id), e),
          className: "text-warning-base hover:bg-[var(--color-warning-light)]",
        },
      );
    }

    // A draft offers only the documents that do not need a confirmed order.
    if (order.status === "draft") items.push(...createItems);

    if (order.status === "confirmed") {
      // Download/print/customize act on the waybill; other documents have their own entries.
      const waybill = waybillOf(order);
      const isReplacing = waybill?.replacement_status === "processing";
      if (isReplacing)
        items.push({
          icon: Loader2,
          label: t("document.replacing"),
          onClick: () => {},
          disabled: true,
          className: "text-content-tertiary",
        });

      if (
        !isReplacing &&
        waybill?.status !== "processing" &&
        waybill?.status !== "void"
      )
        items.push({
          icon: Edit,
          label: t("document.customizeDocument"),
          onClick: (e) => handleAction(() => setCustomizing(true), e),
          className: baseItem,
        });
      const activeReceipt = activeDocument(waybill) ? waybill : undefined;

      if (activeReceipt?.status === "generated") {
        items.push(
          {
            icon: Download,
            label: t("orders.download"),
            onClick: (e) =>
              handleAction(() => onDownloadReceipt(activeReceipt.id), e),
            className:
              "text-success-base hover:bg-[var(--color-success-light)]",
            isDividerBefore: true,
          },
          {
            icon: Printer,
            label: t("orders.print"),
            onClick: (e) =>
              handleAction(() => onPrintReceipt(activeReceipt.id), e),
            className: baseItem,
          },
        );
      } else if (activeReceipt?.status === "processing") {
        items.push({
          icon: Loader2,
          label: t("orders.receiptProcessing", "Processing..."),
          onClick: () => {},
          className: "text-content-tertiary cursor-default",
          disabled: true,
          isDividerBefore: true,
        });
      } else if (canCreate(order, "waybill")) {
        items.push({
          icon: FileText,
          label: t("orders.generateReceipt"),
          onClick: (e) => handleAction(() => onGenerateReceipt(order.id), e),
          className: "text-success-base hover:bg-[var(--color-success-light)]",
          isDividerBefore: true,
        });
      }

      items.push(...createItems, {
        icon: XCircle,
        label: t("orders.cancel"),
        onClick: (e) => handleAction(() => onCancel(order.id), e),
        className: "text-warning-base hover:bg-[var(--color-warning-light)]",
      });
    }

    if (order.status === "cancelled") {
      // Future: Duplicate action
    }

    // Delete always last
    items.push({
      icon: Trash2,
      label: t("orders.delete"),
      onClick: (e) => handleAction(() => onDelete(order), e),
      className: "text-danger-base hover:bg-[var(--color-danger-light)]",
      disabled: isDeleting,
      isDividerBefore: true,
    });

    return items;
  }, [
    order,
    isDeleting,
    t,
    onView,
    onEdit,
    onConfirm,
    onCancel,
    onDelete,
    onPrintReceipt,
    onDownloadReceipt,
    onGenerateReceipt,
  ]);

  const menuItems = getMenuItems();

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex(
            (prev) => (prev - 1 + menuItems.length) % menuItems.length,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (
            focusedIndex >= 0 &&
            focusedIndex < menuItems.length &&
            !menuItems[focusedIndex].disabled
          ) {
            menuItems[focusedIndex].onClick(e as unknown as React.MouseEvent);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex, menuItems]);

  return (
    <>
      {customizing && (
        <CustomizeDocumentModal
          order={order}
          onClose={() => {
            setCustomizing(false);
            // Dialog's close autofocus runs after unmount; its menu item no longer exists.
            requestAnimationFrame(() => buttonRef.current?.focus());
          }}
        />
      )}
      {creating && (
        <CreateDocumentModal
          order={order}
          type={creating}
          onClose={() => {
            setCreating(null);
            requestAnimationFrame(() => buttonRef.current?.focus());
          }}
        />
      )}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1.5 pointer-coarse:p-3.5 rounded-lg hover:bg-surface-alt transition-colors"
        title={t("orders.moreActions")}
        aria-label={t("orders.moreActions")}
        aria-haspopup="menu"
      >
        <MoreVertical className="w-4 h-4 text-content-tertiary" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed w-48 bg-elevated rounded-xl shadow-xl border border-[var(--color-border)] z-50 py-1 animate-modal-content"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          role="menu"
        >
          {sectionsOf(menuItems).map((section, sectionIndex) => (
            <MenuSectionView
              key={sectionIndex}
              section={section}
              focusedIndex={focusedIndex}
              headingId={`order-menu-group-${order.id}-${sectionIndex}`}
            />
          ))}
        </div>
      )}
    </>
  );
};
