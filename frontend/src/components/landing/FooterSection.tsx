import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../../hooks/useTranslation";

const linkClass =
  "text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors";

const disabledLinkClass =
  "text-sm text-gray-400 dark:text-gray-500 cursor-default";

export const FooterSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img
                src="/image.png"
                alt="ReceiptMaster"
                className="h-8 w-8 object-contain"
              />
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                ReceiptMaster
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
              {t("landing.footer.description")}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {t("landing.footer.product")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#features" className={linkClass}>
                  {t("landing.footer.features")}
                </a>
              </li>
              <li>
                <a href="#pricing" className={linkClass}>
                  {t("landing.footer.pricing")}
                </a>
              </li>
              <li>
                <a href="/api/docs" className={linkClass}>
                  {t("landing.footer.apiDocs")}
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {t("landing.footer.company")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <span className={disabledLinkClass} aria-disabled="true">
                  {t("landing.footer.about")}
                </span>
              </li>
              <li>
                <a href="mailto:fluxlab@flux-lab.dev" className={linkClass}>
                  {t("landing.footer.contact")}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {t("landing.footer.legal")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/terms" className={linkClass}>
                  {t("landing.footer.terms")}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className={linkClass}>
                  {t("landing.footer.privacy")}
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className={linkClass}>
                  {t("landing.footer.refundPolicy")}
                </Link>
              </li>
              <li>
                <Link to="/cookie-policy" className={linkClass}>
                  {t("landing.footer.cookiePolicy")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            &copy; {new Date().getFullYear()} ReceiptMaster.{" "}
            {t("landing.footer.rights")} &middot; Powered by{" "}
            <span className="font-semibold">fluxLab</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
