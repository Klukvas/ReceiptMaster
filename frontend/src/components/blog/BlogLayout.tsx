import React, { useEffect } from 'react';
import { LandingShell } from '../landing/LandingShell';

interface BlogLayoutProps {
  title?: string;
  children: React.ReactNode;
}

export const BlogLayout: React.FC<BlogLayoutProps> = ({ title, children }) => {
  useEffect(() => {
    document.title = title ? `${title} — receiptmaster blog` : 'Blog — receiptmaster';
    return () => { document.title = 'receiptmaster.org — Orders, Receipts & Analytics'; };
  }, [title]);

  return (
    <LandingShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6" style={{ paddingTop: 48, paddingBottom: 64 }}>
        {children}
      </div>
    </LandingShell>
  );
};
