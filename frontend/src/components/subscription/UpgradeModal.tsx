import React from"react";
import {
 Package,
 ShoppingCart,
 Palette,
 CreditCard,
 Loader2,
 ExternalLink,
 Check,
 Crown,
} from"lucide-react";
import { Modal } from"../ui/Modal";
import { Button } from"../ui/Button";
import { useTranslation } from"../../hooks/useTranslation";
import { useSubscription } from"../../hooks/useSubscription";
import { useCheckout } from"../../hooks/useCheckout";

export type UpgradeReason ="products" |"orders" |"templates";

interface UpgradeModalProps {
 isOpen: boolean;
 onClose: () => void;
 reason: UpgradeReason;
}

const REASON_ICONS: Record<UpgradeReason, React.ReactNode> = {
 products: <Package className="h-12 w-12 text-warning-base" />,
 orders: <ShoppingCart className="h-12 w-12 text-warning-base" />,
 templates: <Palette className="h-12 w-12 text-warning-base" />,
};

const TITLE_KEYS: Record<UpgradeReason, string> = {
 products:"subscription.upgradeProductsTitle",
 orders:"subscription.upgradeOrdersTitle",
 templates:"subscription.upgradeTemplatesTitle",
};

const DESC_KEYS: Record<UpgradeReason, string> = {
 products:"subscription.upgradeProductsDesc",
 orders:"subscription.upgradeOrdersDesc",
 templates:"subscription.upgradeTemplatesDesc",
};

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
 isOpen,
 onClose,
 reason,
}) => {
 const { t } = useTranslation();
 const { status } = useSubscription();
 const { loading, handleUpgrade, handleManage } = useCheckout();

 const titleKey = TITLE_KEYS[reason];
 const descKey = DESC_KEYS[reason];
 const currentPlan = status?.plan ??"free";
 const hasPaddleSub = status?.hasPaddleSubscription ?? false;

 return (
 <Modal isOpen={isOpen} onClose={onClose} size="md">
 <div className="flex flex-col items-center text-center py-4">
 <div className="mb-4 p-3 bg-[var(--color-warning-light)] rounded-full">
 {REASON_ICONS[reason]}
 </div>

 <h3 className="text-lg font-semibold text-content mb-2">
 {t(titleKey,"Upgrade Required")}
 </h3>

 <p className="text-content-secondary mb-6">
 {t(descKey,"You have reached the limit of your current plan.")}
 </p>

 {hasPaddleSub ? (
 <Button
 variant="primary"
 onClick={handleManage}
 disabled={!!loading}
 className="w-full"
 >
 {loading ==="manage" ? (
 <Loader2 className="h-4 w-4 animate-spin mr-2" />
 ) : (
 <ExternalLink className="h-4 w-4 mr-2" />
 )}
 {t("subscription.manageSubscription","Manage Subscription")}
 </Button>
 ) : (
 <div className="w-full space-y-3">
 {currentPlan ==="free" && (
 <button
 onClick={() => handleUpgrade("pro")}
 disabled={!!loading}
 className="w-full flex items-center justify-between p-4 rounded-lg border-2 border-[var(--color-accent-light)] bg-[var(--color-accent-light)] hover:border-accent-base transition-colors"
 >
 <div className="flex items-center gap-3">
 <Crown className="h-5 w-5 text-accent-base" />
 <div className="text-left">
 <div className="font-medium text-content">
 {t("subscription.upgradeToPro","Upgrade to Pro")}
 </div>
 <div className="text-sm text-content-tertiary">
 {t("subscription.productsLimit","Up to {{count}} products", { count: 100 })} &middot;{""}
 {t("subscription.ordersLimit","Up to {{count}} orders/month", { count: 500 })}
 </div>
 </div>
 </div>
 {loading ==="pro" ? (
 <Loader2 className="h-4 w-4 animate-spin text-accent-base" />
 ) : (
 <CreditCard className="h-4 w-4 text-accent-base" />
 )}
 </button>
 )}

 {(currentPlan ==="free" || currentPlan ==="pro") && (
 <button
 onClick={() => handleUpgrade("business")}
 disabled={!!loading}
 className="w-full flex items-center justify-between p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 hover:border-purple-400 dark:hover:border-purple-600 transition-colors"
 >
 <div className="flex items-center gap-3">
 <Crown className="h-5 w-5 text-purple-600 dark:text-purple-400" />
 <div className="text-left">
 <div className="font-medium text-content">
 {t("subscription.upgradeToBusiness","Upgrade to Business")}
 </div>
 <div className="text-sm text-content-tertiary">
 {t("subscription.unlimitedProducts","Unlimited products")} &middot;{""}
 {t("subscription.unlimitedOrders","Unlimited orders")}
 </div>
 </div>
 </div>
 {loading ==="business" ? (
 <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
 ) : (
 <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
 )}
 </button>
 )}

 {currentPlan ==="business" && (
 <div className="flex items-center gap-2 text-success-base py-2">
 <Check className="h-5 w-5" />
 <span className="font-medium">
 {t("subscription.alreadyTopPlan","You're on the top plan!")}
 </span>
 </div>
 )}
 </div>
 )}

 <button
 onClick={onClose}
 className="mt-4 text-sm text-content-tertiary hover:text-content-secondary"
 >
 {t("common.close","Close")}
 </button>
 </div>
 </Modal>
 );
};
