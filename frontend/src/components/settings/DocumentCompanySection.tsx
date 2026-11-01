import {
  type DocumentConfig,
  type DocumentTemplate,
} from "../../lib/document-config";
import { useTranslation } from "../../hooks/useTranslation";
import { Disclosure } from "../ui/Disclosure";
import { Input } from "../ui/Input";
import { CheckField, DocumentSection, FieldHint } from "./document-ui";

type Company = DocumentConfig["company"];
type CompanyField = keyof Company;
type Visibility = DocumentConfig["visibility"];

const MAIN_FIELDS: readonly CompanyField[] = [
  "companyName",
  "companyAddress",
  "companyEmail",
  "companyPhone",
  "companyWebsite",
  "companyTagline",
];
const BANK_FIELDS: readonly CompanyField[] = [
  "companyTaxId",
  "companyIban",
  "companySwift",
];
const CUSTOMER_FIELDS = [
  "recipientEmail",
  "recipientPhone",
  "recipientAddress",
] as const satisfies ReadonlyArray<keyof Visibility>;

const maxLength = (field: CompanyField): number =>
  field === "companyName"
    ? 200
    : field === "companyEmail"
      ? 254
      : ["companyAddress", "companyWebsite", "companyTagline"].includes(field)
        ? 500
        : 100;

export function DocumentCompanySection({
  config,
  onChange,
  template,
}: {
  config: DocumentConfig;
  onChange: (value: DocumentConfig) => void;
  /** The chosen template, which decides what it can show; undefined while templates load. */
  template?: DocumentTemplate;
}) {
  const { t } = useTranslation();
  const caps = template?.capabilities;
  const setCompany = (field: CompanyField, value: string) =>
    onChange({ ...config, company: { ...config.company, [field]: value } });
  const setVisible = (field: keyof Visibility, value: boolean) =>
    onChange({
      ...config,
      visibility: { ...config.visibility, [field]: value },
    });
  const notShown = (supported: boolean | undefined) =>
    supported === false
      ? t("document.notShownByTemplate", { template: template?.name ?? "" })
      : undefined;

  const field = (name: CompanyField) => {
    const label = t(`settings.${name}`);
    const supported = caps ? caps.companyFields.includes(name) : undefined;
    const toggle = name in config.visibility;
    return (
      <div key={name} className="space-y-1">
        <Input
          label={label}
          value={config.company[name]}
          placeholder={t(`settings.${name}Placeholder`, "")}
          type={name === "companyEmail" ? "email" : "text"}
          maxLength={maxLength(name)}
          onChange={(event) => setCompany(name, event.target.value)}
        />
        {toggle && (
          <CheckField
            label={t("document.showOnDocument")}
            ariaLabel={t("document.showFieldOnDocument", { field: label })}
            checked={config.visibility[name as keyof Visibility]}
            onChange={(value) => setVisible(name as keyof Visibility, value)}
          />
        )}
        {notShown(supported) && <FieldHint>{notShown(supported)}</FieldHint>}
      </div>
    );
  };

  const hasBankDetails = BANK_FIELDS.some((name) => config.company[name]);

  return (
    <>
      <DocumentSection
        title={t("document.sectionCompany")}
        description={t("document.sectionCompanyHelp")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {MAIN_FIELDS.map(field)}
        </div>
        <Disclosure
          summary={t("document.sectionBank")}
          defaultOpen={hasBankDetails}
        >
          <p className="text-sm text-content-tertiary">
            {t("document.sectionBankHelp")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {BANK_FIELDS.map(field)}
          </div>
        </Disclosure>
      </DocumentSection>

      <DocumentSection
        title={t("document.sectionCustomer")}
        description={t("document.sectionCustomerHelp")}
      >
        <div className="space-y-3">
          {CUSTOMER_FIELDS.map((name) => {
            const supported = caps
              ? caps.recipientFields.includes(name)
              : undefined;
            return (
              <CheckField
                key={name}
                label={t(`document.show_${name}`)}
                hint={notShown(supported)}
                checked={config.visibility[name]}
                onChange={(value) => setVisible(name, value)}
              />
            );
          })}
        </div>
      </DocumentSection>
    </>
  );
}
