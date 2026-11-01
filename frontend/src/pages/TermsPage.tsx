import { LegalLayout } from "../components/legal/LegalLayout";
import { SEO } from "../components/seo/SEO";
import { useTranslation } from "../hooks/useTranslation";
import { termsEn } from "./legal/terms.en";
import { termsRu } from "./legal/terms.ru";
import { termsUk } from "./legal/terms.uk";
import { pickLegalContent, resolveLegalLanguage } from "./legal/types";

const lastUpdated = new Date("2026-03-01");
const content = { en: termsEn, ru: termsRu, uk: termsUk };

export const TermsPage = () => {
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
        path="/terms"
        lang={resolveLegalLanguage(currentLanguage)}
      />
      {body}
    </LegalLayout>
  );
};
