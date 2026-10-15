import { Combobox } from "../ui/Combobox";
import { formatCurrency } from "../../lib/api";
import { parseApiError } from "../../lib/api-errors";
import {
  useOrderProducts,
  useOrderRecipients,
} from "../../hooks/useOrderOptions";
import { useTranslation } from "../../hooks/useTranslation";

type Props = { value: string; onChange: (value: string) => void };

export const OrderRecipientSelect = ({ value, onChange }: Props) => {
  const { t } = useTranslation();
  const query = useOrderRecipients([value]);
  return (
    <>
      <Combobox
        options={query.options.map((r) => ({
          value: r.id,
          label: r.name,
          subtitle: r.email || "",
        }))}
        selectedOption={
          query.records
            .filter((r) => r.id === value)
            .map((r) => ({ value: r.id, label: r.name }))[0]
        }
        value={value}
        onChange={onChange}
        onSearchChange={query.setSearch}
        onLoadMore={query.hasNextPage ? query.loadMore : undefined}
        isLoading={query.isSearching}
        loadMoreText={t("common.loadMore")}
        loadingText={t("common.loading")}
        placeholder={t("orders.selectRecipient")}
        searchPlaceholder={t("orders.searchRecipient")}
        noResultsText={t("orders.nothingFound")}
        required
      />
      {query.error && (
        <p role="alert" className="text-sm text-danger-base">
          {parseApiError(query.error).message}
        </p>
      )}
    </>
  );
};

export const OrderProductSelect = ({ value, onChange }: Props) => {
  const { t } = useTranslation();
  const query = useOrderProducts([value]);
  const option = (p: (typeof query.records)[number]) => ({
    value: p.id,
    label: `${p.name} - ${formatCurrency(p.sale_price_cents, p.currency)}`,
  });
  return (
    <>
      <Combobox
        options={query.options.map(option)}
        selectedOption={
          query.records.filter((p) => p.id === value).map(option)[0]
        }
        value={value}
        onChange={onChange}
        onSearchChange={query.setSearch}
        onLoadMore={query.hasNextPage ? query.loadMore : undefined}
        isLoading={query.isSearching}
        loadMoreText={t("common.loadMore")}
        loadingText={t("common.loading")}
        placeholder={t("orders.selectProduct")}
        searchPlaceholder={t("orders.searchProduct")}
        noResultsText={t("orders.nothingFound")}
        required
      />
      {query.error && (
        <p role="alert" className="text-sm text-danger-base">
          {parseApiError(query.error).message}
        </p>
      )}
    </>
  );
};
