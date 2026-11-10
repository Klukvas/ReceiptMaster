import { CustomizeDocumentModal } from "./CustomizeDocumentModal";
import { CreateDocumentModal } from "./CreateDocumentModal";
import React, { useState, useRef, useEffect, useCallback, useId } from "react";
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
import { useMenuPosition } from "../../hooks/useMenuPosition";
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

type MenuSection = {
  group?: string;
  items: { item: MenuItem; index: number }[];
};

/** Consecutive items with the same group share one section; flat indices are kept for keyboard focus. */
function sectionsOf(items: MenuItem[]): MenuSection[] {
  return items.reduce<MenuSection[]>((sections, item, index) => {
    const last = sections.at(-1);
    if (last && last.group !== undefined && last.group === item.group)
      return [
        ...sections.slice(0, -1),
        { ...last, items: [...last.items, { item, index }] },
      ];
    return [...sections, { group: item.group, items: [{ item, index }] }];
  }, []);
}

interface OrderActionsMenuProps {
  order: Order;
  onView: (order: Order) => void;
  onEdit: (order: Order) => void;
  onConfirm: (id: string) => void;
  onCancel: (order: Order) => void;
  onDelete: (order: Order) => void;
  onDownloadReceipt: (receiptId: string) => void;
  onPrintReceipt: (receiptId: string) => void;
  onGenerateReceipt: (orderId: string) => void;
  isDeleting: boolean;
}

const getEnabledItems = (menu: HTMLElement | null) =>
  Array.from(
    menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ??
      [],
  );

function MenuSectionView({
  section,
  headingId,
}: {
  section: MenuSection;
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
          tabIndex={-1}
          className={`w-full px-3 py-2 pointer-coarse:py-3 pointer-coarse:min-h-11 text-left text-sm flex items-center gap-2.5 transition-colors focus:outline-none focus-visible:bg-surface-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] ${
            item.className
          } ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="min-w-0 break-words">{item.label}</span>
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const position = useMenuPosition(isOpen, buttonRef, dropdownRef);

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

  // The menu is position: fixed, so it would stay behind while the page moves under it.
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const openedAt = buttonRef.current.getBoundingClientRect();
    // Scroll and resize events are delivered a frame late, so one caused by the scroll that
    // brought the trigger into view arrives after the menu opened. Only a trigger that has
    // actually moved leaves the fixed menu behind.
    const closeIfTriggerMoved = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && dropdownRef.current?.contains(target)) return;
      const now = buttonRef.current?.getBoundingClientRect();
      if (now && now.top === openedAt.top && now.left === openedAt.left) return;
      setIsOpen(false);
    };
    window.addEventListener("scroll", closeIfTriggerMoved, true);
    window.addEventListener("resize", closeIfTriggerMoved);
    return () => {
      window.removeEventListener("scroll", closeIfTriggerMoved, true);
      window.removeEventListener("resize", closeIfTriggerMoved);
    };
  }, [isOpen]);

  const handleToggle = () => setIsOpen(!isOpen);

  const handleAction = (action: () => void, event: React.MouseEvent) => {
    event.stopPropagation();
    // The focused item unmounts with the menu. Focus the trigger first, so a dialog the action
    // opens records it as its opener and hands focus back to it on close.
    buttonRef.current?.focus();
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

    const creatableTypes = CREATABLE_TYPES.filter((type) =>
      canCreate(order, type),
    );
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
          onClick: (e) => handleAction(() => onCancel(order), e),
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
        onClick: (e) => handleAction(() => onCancel(order), e),
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

  // Keyboard users get real focus inside the menu as soon as it opens (as in PortalDropdown).
  useEffect(() => {
    if (isOpen)
      getEnabledItems(dropdownRef.current)[0]?.focus({ preventScroll: true });
  }, [isOpen]);

  const closeAndRefocusTrigger = () => {
    buttonRef.current?.focus();
    setIsOpen(false);
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocusTrigger();
      return;
    }
    // Focus is back on the trigger before Tab's default action, so Tab moves on from there.
    if (e.key === "Tab") {
      closeAndRefocusTrigger();
      return;
    }
    const items = getEnabledItems(dropdownRef.current);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = {
      ArrowDown: (current + 1) % items.length,
      ArrowUp: (current - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (e.key in targets) {
      // Also keeps Home/End from scrolling the page.
      e.preventDefault();
      items[targets[e.key]].focus();
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" || isOpen) return;
    e.preventDefault();
    setIsOpen(true);
  };

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
        data-order-actions={order.id}
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        className="p-1.5 pointer-coarse:p-3.5 rounded-lg hover:bg-surface-alt transition-colors"
        title={t("orders.moreActions")}
        aria-label={t("orders.moreActions")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
      >
        <MoreVertical className="w-4 h-4 text-content-tertiary" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          id={menuId}
          // Document labels run long in ru/uk: the menu grows to fit them, then wraps.
          className="fixed w-max min-w-48 max-w-[min(20rem,calc(100vw-1rem))] bg-elevated rounded-xl shadow-xl border border-[var(--color-border)] z-50 py-1 animate-modal-content"
          style={position}
          role="menu"
          aria-label={t("orders.moreActions")}
          onKeyDown={handleMenuKeyDown}
        >
          {sectionsOf(menuItems).map((section, sectionIndex) => (
            <MenuSectionView
              key={sectionIndex}
              section={section}
              headingId={`order-menu-group-${order.id}-${sectionIndex}`}
            />
          ))}
        </div>
      )}
    </>
  );
};
