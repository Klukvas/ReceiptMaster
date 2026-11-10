import { formatDate } from "../../lib/api";
import type { ColumnDef } from "../../hooks/useServerPagination";

/**
 * The lists sort newest-first by `created_at` by default. Without a column for it, the phone
 * sort control had no option to show for that order and its direction button had nothing to
 * flip. Hidden in the table until the user turns it on.
 */
export const dateAddedColumn = <T extends { created_at: string }>(
  header: string,
): ColumnDef<T> => ({
  key: "created_at",
  header,
  sortable: true,
  visible: false,
  hideable: true,
  render: (item) => (
    <span className="text-sm text-content-tertiary">
      {formatDate(item.created_at)}
    </span>
  ),
});
