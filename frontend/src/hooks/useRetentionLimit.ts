import { useQuery } from "@tanstack/react-query";
import { receiptsApi } from "../lib/api";

const RETENTION_STALE_MS = 10 * 60 * 1000;

/** How many documents of a capped type the server keeps, or undefined until it has said. */
export function useRetentionLimit(): number | undefined {
  const { data } = useQuery({
    queryKey: ["retention-limit"],
    queryFn: async () => (await receiptsApi.getRetention()).data.limit,
    staleTime: RETENTION_STALE_MS,
    retry: false,
  });
  return typeof data === "number" && data > 0 ? data : undefined;
}
