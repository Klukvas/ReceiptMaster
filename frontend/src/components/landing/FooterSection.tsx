import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

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
              {t('landing.footer.description')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {t('landing.footer.product')}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#features" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.features')}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.pricing')}
                </a>
              </li>
              <li>
                <a href="/api/docs" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.apiDocs')}
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {t('landing.footer.company')}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.about')}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.contact')}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.github')}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {t('landing.footer.legal')}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.privacy')}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {t('landing.footer.terms')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            &copy; {new Date().getFullYear()} ReceiptMaster. {t('landing.footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  );
};
