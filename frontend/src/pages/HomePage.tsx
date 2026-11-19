import { LandingPage } from "./LandingPage";
import { SEO } from "../components/seo/SEO";
import { useTranslation } from "../hooks/useTranslation";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareAppJsonLd,
} from "../components/seo/JsonLd";

export const HomePage = () => {
  const { currentLanguage } = useTranslation();
  const language = currentLanguage === "ru" || currentLanguage === "uk" ? currentLanguage : "en";
  return (
    <>
      <SEO
        path="/"
        lang={language}
        description="The complete back-office for modern merchants. Manage products, customers, and orders — generate PDF waybills, quotes, invoices and acts in seconds."
      />
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <SoftwareAppJsonLd />
      <LandingPage />
    </>
  );
};
