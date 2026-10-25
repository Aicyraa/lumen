import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../shared/lib/api";

// A 4xx answer is the API's decision: asking again changes nothing. Only network and 5xx failures get one retry.
const retry = (count: number, e: unknown) =>
  !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 1;

// onUnauthorized re-reads the session; RequireSession then sends a signed-out user to sign-in.
export function createQueryClient(onUnauthorized: () => void) {
  const on401 = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: on401 }),
    mutationCache: new MutationCache({ onError: on401 }),
    defaultOptions: { queries: { staleTime: 5000, retry, refetchOnWindowFocus: false } },
  });
}
