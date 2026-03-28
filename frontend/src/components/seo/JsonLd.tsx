import React from "react";
import { Helmet } from "react-helmet-async";
import { SITE_URL, DEFAULT_DESCRIPTION } from "./constants";

interface JsonLdProps {
  readonly data: Record<string, unknown>;
}

function safeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

const JsonLd: React.FC<JsonLdProps> = ({ data }) => (
  <Helmet>
    <script type="application/ld+json">{safeJsonLd(data)}</script>
  </Helmet>
);

export const OrganizationJsonLd: React.FC = () => (
  <JsonLd
    data={{
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ReceiptMaster",
      url: SITE_URL,
      logo: `${SITE_URL}/logo-icon.svg`,
      contactPoint: {
        "@type": "ContactPoint",
        email: "fluxlab@flux-lab.dev",
        contactType: "customer support",
      },
    }}
  />
);

export const WebSiteJsonLd: React.FC = () => (
  <JsonLd
    data={{
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "ReceiptMaster",
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      inLanguage: ["en", "uk"],
    }}
  />
);

interface SoftwareAppJsonLdProps {
  readonly priceCurrency?: string;
  readonly price?: string;
}

export const SoftwareAppJsonLd: React.FC<SoftwareAppJsonLdProps> = ({
  priceCurrency = "USD",
  price = "0",
}) => (
  <JsonLd
    data={{
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "ReceiptMaster",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      offers: {
        "@type": "Offer",
        price,
        priceCurrency,
      },
      description:
        "Cloud-based platform for creating, managing, and sharing digital receipts and invoices.",
    }}
  />
);

interface BlogPostingJsonLdProps {
  readonly title: string;
  readonly description: string;
  readonly slug: string;
  readonly datePublished: string;
  readonly lang: string;
}

export const BlogPostingJsonLd: React.FC<BlogPostingJsonLdProps> = ({
  title,
  description,
  slug,
  datePublished,
  lang,
}) => (
  <JsonLd
    data={{
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title,
      description,
      url: `${SITE_URL}/blog/${slug}`,
      datePublished,
      inLanguage: lang,
      publisher: {
        "@type": "Organization",
        name: "ReceiptMaster",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo-icon.svg`,
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${SITE_URL}/blog/${slug}`,
      },
    }}
  />
);

interface BreadcrumbJsonLdProps {
  readonly items: ReadonlyArray<{
    readonly name: string;
    readonly url: string;
  }>;
}

export const BreadcrumbJsonLd: React.FC<BreadcrumbJsonLdProps> = ({
  items,
}) => (
  <JsonLd
    data={{
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    }}
  />
);
