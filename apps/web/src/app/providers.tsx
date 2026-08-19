import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { RendezvousApi } from "../features/trips/api.js";
import { FixtureRendezvousApi } from "../demo/fixtures.js";

const ApiContext = createContext<RendezvousApi | null>(null);

export function AppProviders({
  children,
  api,
}: {
  children: ReactNode;
  api?: RendezvousApi;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: false } },
      }),
  );
  const [fixtureApi] = useState(() => new FixtureRendezvousApi());
  return (
    <ApiContext.Provider value={api ?? fixtureApi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): RendezvousApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("Rendezvous API provider is missing");
  return api;
}
