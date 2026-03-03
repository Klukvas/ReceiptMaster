import React, { useEffect, useMemo } from"react";
import { NavLink, Link } from"react-router-dom";
import { ArrowLeft } from"lucide-react";

interface LegalLayoutProps {
 title: string;
 lastUpdated: Date;
 children: React.ReactNode;
}

const titleId ="legal-page-title";

const navLinks = [
 { to:"/terms", label:"Terms of Service" },
 { to:"/privacy", label:"Privacy Policy" },
 { to:"/refund-policy", label:"Refund Policy" },
 { to:"/cookie-policy", label:"Cookie Policy" },
] as const;

export const LegalLayout: React.FC<LegalLayoutProps> = ({
 title,
 lastUpdated,
 children,
}) => {
 useEffect(() => {
 document.title = `${title} — ReceiptMaster`;
 return () => {
 document.title ="ReceiptMaster";
 };
 }, [title]);

 const formattedDate = useMemo(
 () =>
 new Intl.DateTimeFormat("en-US", {
 year:"numeric",
 month:"long",
 day:"numeric",
 }).format(lastUpdated),
 [lastUpdated],
 );

 return (
 <div className="min-h-screen bg-elevated">
 <header className="border-b border-[var(--color-border)]">
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
 <Link
 to="/"
 className="flex items-center gap-2 text-sm text-content-tertiary hover:text-content transition-colors"
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
 className="text-3xl font-bold text-content mb-2"
 >
 {title}
 </h1>
 <p className="text-sm text-content-tertiary mb-8">
 Last updated: {formattedDate}
 </p>

 <div className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-content-secondary dark:prose-p:text-content-tertiary prose-p:leading-relaxed prose-li:text-content-secondary dark:prose-li:text-content-tertiary prose-a:text-accent-base dark:prose-a:text-accent-base prose-strong:text-content dark:prose-strong:text-white prose-th:text-content dark:prose-th:text-content prose-td:text-content-secondary dark:prose-td:text-content-tertiary">
 {children}
 </div>
 </main>

 <footer className="border-t border-[var(--color-border)] py-6">
 <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-wrap gap-4 text-sm text-content-tertiary">
 {navLinks.map(({ to, label }) => (
 <NavLink
 key={to}
 to={to}
 className={({ isActive }) =>
 isActive
 ?"text-content font-medium"
 :"hover:text-content"
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
