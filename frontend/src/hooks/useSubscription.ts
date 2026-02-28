import { useQuery } from "@tanstack/react-query";
import {
  subscriptionApi,
  type SubscriptionStatus,
} from "../lib/subscriptionApi";

export const useSubscription = () => {
  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useQuery<SubscriptionStatus>({
    queryKey: ["subscription", "status"],
    queryFn: subscriptionApi.getStatus,
    staleTime: 5 * 60 * 1000,
  });

  return { status, isLoading, isError, refetch };
};
