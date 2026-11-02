import { LegalLayout } from "../components/legal/LegalLayout";
import { SEO } from "../components/seo/SEO";
import { useTranslation } from "../hooks/useTranslation";
import { refundPolicyEn } from "./legal/refund-policy.en";
import { refundPolicyRu } from "./legal/refund-policy.ru";
import { refundPolicyUk } from "./legal/refund-policy.uk";
import { pickLegalContent, resolveLegalLanguage } from "./legal/types";

const lastUpdated = new Date("2026-11-01");
const content = { en: refundPolicyEn, ru: refundPolicyRu, uk: refundPolicyUk };

export const RefundPolicyPage = () => {
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
        path="/refund-policy"
        lang={resolveLegalLanguage(currentLanguage)}
      />
      {body}
    </LegalLayout>
  );
};
