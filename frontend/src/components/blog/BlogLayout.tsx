import React from "react";
import { LandingShell } from "../landing/LandingShell";

interface BlogLayoutProps {
  children: React.ReactNode;
}

export const BlogLayout: React.FC<BlogLayoutProps> = ({ children }) => {
  return (
    <LandingShell>
      <div
        className="max-w-4xl mx-auto px-4 sm:px-6"
        style={{ paddingTop: 48, paddingBottom: 64 }}
      >
        {children}
      </div>
    </LandingShell>
  );
};
