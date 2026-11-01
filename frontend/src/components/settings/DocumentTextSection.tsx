import type {
  DocumentConfig,
  DocumentTemplate,
} from "../../lib/document-config";
import { useTranslation } from "../../hooks/useTranslation";
import { DocumentSection, LabelledField, selectClass } from "./document-ui";

type TextField =
  | "footerTitle"
  | "footerSubtitle"
  | "paymentTerms"
  | "deliveryTerms";

export function DocumentTextSection({
  config,
  onChange,
  template,
}: {
  config: DocumentConfig;
  onChange: (value: DocumentConfig) => void;
  template?: DocumentTemplate;
}) {
  const { t } = useTranslation();
  const termsUnsupported = template ? !template.capabilities.terms : false;

  const field = (name: TextField, hint: string) => (
    <LabelledField label={t(`document.${name}`)} hint={hint}>
      {(ids) => (
        <textarea
          {...ids}
          className={selectClass}
          rows={2}
          maxLength={500}
          value={config[name]}
          onChange={(event) =>
            onChange({ ...config, [name]: event.target.value })
          }
        />
      )}
    </LabelledField>
  );
  const termsHint = (help: string) =>
    termsUnsupported
      ? t("document.notShownByTemplateTerms", {
          template: template?.name ?? "",
        })
      : help;

  return (
    <DocumentSection
      title={t("document.sectionText")}
      description={t("document.sectionTextHelp")}
    >
      {field("footerTitle", t("document.footerTitleHelp"))}
      {field("footerSubtitle", t("document.footerSubtitleHelp"))}
      {field("paymentTerms", termsHint(t("document.paymentTermsHelp")))}
      {field("deliveryTerms", termsHint(t("document.deliveryTermsHelp")))}
    </DocumentSection>
  );
}
