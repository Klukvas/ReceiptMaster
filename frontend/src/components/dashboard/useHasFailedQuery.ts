import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * True while any query whose first key segment is in `rootKeys` is in the error state.
 * Lets a page report failures of widgets that own their own queries.
 */
export function useHasFailedQuery(rootKeys: readonly string[]): boolean {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();

  return useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () =>
      cache.findAll({
        predicate: (query) =>
          query.state.status === "error" &&
          rootKeys.includes(String(query.queryKey[0])),
      }).length > 0,
  );
}
