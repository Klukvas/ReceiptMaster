import { LandingPage } from "./LandingPage";
import { SEO } from "../components/seo/SEO";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareAppJsonLd,
} from "../components/seo/JsonLd";

export const HomePage = () => {
  return (
    <>
      <SEO
        path="/"
        description="The complete back-office for modern merchants. Manage products, customers, and orders — generate PDF waybills, quotes, invoices and acts in seconds."
      />
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <SoftwareAppJsonLd />
      <LandingPage />
    </>
  );
};
