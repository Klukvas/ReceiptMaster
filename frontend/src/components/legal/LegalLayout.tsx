import React, { useEffect, useMemo } from "react";
import { NavLink, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  lastUpdated: Date;
  children: React.ReactNode;
}

const titleId = "legal-page-title";

const navLinks = [
  { to: "/terms", label: "Terms of Service" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/cookie-policy", label: "Cookie Policy" },
] as const;

export const LegalLayout: React.FC<LegalLayoutProps> = ({
  title,
  lastUpdated,
  children,
}) => {
  useEffect(() => {
    document.title = `${title} — ReceiptMaster`;
    return () => {
      document.title = "ReceiptMaster";
    };
  }, [title]);

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(lastUpdated),
    [lastUpdated],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <img
              src="/image.png"
              alt="ReceiptMaster"
              className="h-6 w-6 object-contain"
            />
            <span className="font-medium">ReceiptMaster</span>
          </Link>
        </div>
      </header>

      <main
        className="max-w-3xl mx-auto px-4 sm:px-6 py-10"
        aria-labelledby={titleId}
      >
        <h1
          id={titleId}
          className="text-3xl font-bold text-gray-900 dark:text-white mb-2"
        >
          {title}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          Last updated: {formattedDate}
        </p>

        <div className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed prose-li:text-gray-600 dark:prose-li:text-gray-400 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-strong:text-gray-900 dark:prose-strong:text-white prose-th:text-gray-900 dark:prose-th:text-gray-100 prose-td:text-gray-600 dark:prose-td:text-gray-400">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive
                  ? "text-gray-900 dark:text-white font-medium"
                  : "hover:text-gray-900 dark:hover:text-white"
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </footer>
    </div>
  );
};
