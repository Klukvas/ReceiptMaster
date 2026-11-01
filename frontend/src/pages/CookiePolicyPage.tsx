import { LegalLayout } from "../components/legal/LegalLayout";
import { SEO } from "../components/seo/SEO";
import { useTranslation } from "../hooks/useTranslation";
import { cookiePolicyEn } from "./legal/cookie-policy.en";
import { cookiePolicyRu } from "./legal/cookie-policy.ru";
import { cookiePolicyUk } from "./legal/cookie-policy.uk";
import { pickLegalContent, resolveLegalLanguage } from "./legal/types";

const lastUpdated = new Date("2026-11-01");
const content = { en: cookiePolicyEn, ru: cookiePolicyRu, uk: cookiePolicyUk };

export const CookiePolicyPage = () => {
  const { currentLanguage } = useTranslation();
  const { title, seoDescription, body } = pickLegalContent(
    content,
    currentLanguage,
  );

  return (
    <LegalLayout title={title} lastUpdated={lastUpdated}>
      <SEO
        title={title}
        description={seoDescription}
        path="/cookie-policy"
        lang={resolveLegalLanguage(currentLanguage)}
      />
      {body}
    </LegalLayout>
  );
};
