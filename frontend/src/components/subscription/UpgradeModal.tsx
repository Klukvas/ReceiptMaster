import React from "react";
import { Package, ShoppingCart, Palette } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useTranslation } from "../../hooks/useTranslation";

export type UpgradeReason = "products" | "orders" | "templates";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: UpgradeReason;
}

const REASON_ICONS: Record<UpgradeReason, React.ReactNode> = {
  products: <Package className="h-12 w-12 text-amber-500" />,
  orders: <ShoppingCart className="h-12 w-12 text-amber-500" />,
  templates: <Palette className="h-12 w-12 text-amber-500" />,
};

const TITLE_KEYS: Record<UpgradeReason, string> = {
  products: "subscription.upgradeProductsTitle",
  orders: "subscription.upgradeOrdersTitle",
  templates: "subscription.upgradeTemplatesTitle",
};

const DESC_KEYS: Record<UpgradeReason, string> = {
  products: "subscription.upgradeProductsDesc",
  orders: "subscription.upgradeOrdersDesc",
  templates: "subscription.upgradeTemplatesDesc",
};

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  reason,
}) => {
  const { t } = useTranslation();

  const titleKey = TITLE_KEYS[reason];
  const descKey = DESC_KEYS[reason];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center py-4">
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-full">
          {REASON_ICONS[reason]}
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {t(titleKey, "Upgrade Required")}
        </h3>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t(descKey, "You have reached the limit of your current plan.")}
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6 w-full">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t(
              "subscription.contactAdminHint",
              "Contact your administrator to upgrade your plan.",
            )}
          </p>
        </div>

        <Button variant="primary" onClick={onClose} className="w-full">
          {t("common.close", "Close")}
        </Button>
      </div>
    </Modal>
  );
};
