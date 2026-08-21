import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useEffect } from "react";
import i18n from "../i18n/index.js";
import {
  HttpRendezvousApi,
  type RendezvousApi,
} from "../features/trips/api.js";

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
  const [defaultApi] = useState<RendezvousApi>(
    () => new HttpRendezvousApi(import.meta.env.VITE_API_BASE_URL ?? ""),
  );
  useEffect(() => {
    const invalidateLocalizedData = () => {
      void queryClient.invalidateQueries();
    };
    i18n.on("languageChanged", invalidateLocalizedData);
    return () => {
      i18n.off("languageChanged", invalidateLocalizedData);
    };
  }, [queryClient]);
  return (
    <ApiContext.Provider value={api ?? defaultApi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): RendezvousApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("Rendezvous API provider is missing");
  return api;
}
