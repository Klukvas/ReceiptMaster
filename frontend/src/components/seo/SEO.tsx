import React from "react";
import { Helmet } from "react-helmet-async";
import {
  SITE_URL,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  LOCALE_MAP,
} from "./constants";

interface SEOProps {
  readonly title?: string;
  readonly description?: string;
  readonly path?: string;
  readonly image?: string;
  readonly type?: "website" | "article";
  readonly publishedTime?: string;
  readonly lang?: string;
  readonly alternates?: ReadonlyArray<{
    readonly hreflang: string;
    readonly href: string;
  }>;
  readonly noindex?: boolean;
}

export const SEO: React.FC<SEOProps> = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  publishedTime,
  lang = "en",
  alternates,
  noindex = false,
}) => {
  const fullTitle = title ? `${title} — receiptmaster` : DEFAULT_TITLE;
  const canonicalUrl = `${SITE_URL}${path}`;
  const locale = LOCALE_MAP[lang] ?? "en_US";
  const twitterCard = type === "article" ? "summary_large_image" : "summary";

  return (
    <Helmet>
      <html lang={lang} />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="receiptmaster" />
      <meta property="og:locale" content={locale} />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Article-specific */}
      {publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}

      {/* Hreflang alternates */}
      {alternates?.map(({ hreflang, href }) => (
        <link key={hreflang} rel="alternate" hrefLang={hreflang} href={href} />
      ))}
    </Helmet>
  );
};
