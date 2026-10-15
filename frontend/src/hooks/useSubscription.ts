import { useQuery } from "@tanstack/react-query";
import {
  subscriptionApi,
  type SubscriptionStatus,
} from "../lib/subscriptionApi";
import { usePaddle } from "../providers/PaddleProvider";
import { useAuth } from "./useAuth";

export const useSubscription = () => {
  const { isAuthenticated } = useAuth();
  const { billingEnabled } = usePaddle();

  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useQuery<SubscriptionStatus>({
    queryKey: ["subscription", "status"],
    queryFn: subscriptionApi.getStatus,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
  });

  return { status, isLoading, isError, refetch, billingEnabled };
};
