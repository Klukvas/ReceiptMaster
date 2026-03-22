import React from "react";
import { LandingShell } from "../components/landing/LandingShell";
import { HeroSection } from "../components/landing/HeroSection";
import { TrustSection } from "../components/landing/TrustSection";
import { FeaturesSection } from "../components/landing/FeaturesSection";
import { HowItWorksSection } from "../components/landing/HowItWorksSection";
import { TemplatesSection } from "../components/landing/TemplatesSection";
import { PricingSection } from "../components/landing/PricingSection";
import { CTASection } from "../components/landing/CTASection";

export const LandingPage: React.FC = () => {
  return (
    <LandingShell>
      {({ onOpenRegister }) => (
        <main>
          <HeroSection onOpenRegister={onOpenRegister} />
          <TrustSection />
          <FeaturesSection />
          <HowItWorksSection />
          <TemplatesSection />
          <PricingSection onOpenRegister={onOpenRegister} />
          <CTASection onOpenRegister={onOpenRegister} />
        </main>
      )}
    </LandingShell>
  );
};
