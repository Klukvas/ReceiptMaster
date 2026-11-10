import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../lib/api";

export const COMPANY_INFO_KEY = ["companyInfo"] as const;

/** The seller's stored company data, including the requisites documents print. */
export const useCompanyInfo = () =>
  useQuery({
    queryKey: COMPANY_INFO_KEY,
    queryFn: async () => (await settingsApi.getCompanyInfo()).data.data,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    retry: false,
  });
