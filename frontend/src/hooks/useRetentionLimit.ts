import { useQuery } from "@tanstack/react-query";
import { receiptsApi } from "../lib/api";

const RETENTION_STALE_MS = 10 * 60 * 1000;

/**
 * How many documents of each type the plan keeps, as the server reports it: a number, null
 * when the plan keeps everything, or undefined until the server has said.
 */
export function useRetentionLimit(): number | null | undefined {
  const { data } = useQuery({
    queryKey: ["retention-limit"],
    queryFn: async () => (await receiptsApi.getRetention()).data.limit,
    staleTime: RETENTION_STALE_MS,
    retry: false,
  });
  if (data === null) return null;
  return typeof data === "number" && data > 0 ? data : undefined;
}
