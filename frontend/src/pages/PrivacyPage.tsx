import { LegalLayout } from "../components/legal/LegalLayout";
import { SEO } from "../components/seo/SEO";
import { useTranslation } from "../hooks/useTranslation";
import { privacyEn } from "./legal/privacy.en";
import { privacyRu } from "./legal/privacy.ru";
import { privacyUk } from "./legal/privacy.uk";
import { pickLegalContent, resolveLegalLanguage } from "./legal/types";

const lastUpdated = new Date("2026-11-01");
const content = { en: privacyEn, ru: privacyRu, uk: privacyUk };

export const PrivacyPage = () => {
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
        path="/privacy"
        lang={resolveLegalLanguage(currentLanguage)}
      />
      {body}
    </LegalLayout>
  );
};
