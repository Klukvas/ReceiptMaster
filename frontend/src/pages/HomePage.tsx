import { useEffect } from "react";
import { LandingPage } from "./LandingPage";
import { SEO } from "../components/seo/SEO";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareAppJsonLd,
} from "../components/seo/JsonLd";

export const HomePage = () => {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "auto";
    };
  }, []);

  return (
    <>
      <SEO
        path="/"
        description="The complete back-office for modern merchants. Manage products, customers, and orders — generate professional PDF invoices in seconds."
      />
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <SoftwareAppJsonLd />
      <LandingPage />
    </>
  );
};
