import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type {
  ScoringConfig,
  SetReactionInput,
  UpdatePreferencesInput,
} from "@rendezvous/contracts";
import { useApi } from "../../app/providers.js";

export const tripKeys = {
  all: ["trips"] as const,
  detail: (id: string) => ["trip", id] as const,
  invite: (id: string) => ["invite", id] as const,
};

export function useTrips() {
  const api = useApi();
  return useQuery({ queryKey: tripKeys.all, queryFn: () => api.listTrips() });
}

export function useTrip(id: string) {
  const api = useApi();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: tripKeys.detail(id),
    queryFn: () => api.getTrip(id),
  });
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const start = () => {
      if (document.visibilityState === "hidden" || unsubscribe) return;
      unsubscribe = api.subscribeToTrip?.(id, () => {
        void client.invalidateQueries({ queryKey: tripKeys.detail(id) });
      });
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        unsubscribe?.();
        unsubscribe = undefined;
      } else {
        void client.invalidateQueries({ queryKey: tripKeys.detail(id) });
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe?.();
    };
  }, [api, client, id]);
  return query;
}

export function usePreferencesMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) =>
      api.updateMyPreferences(id, input),
    onSuccess: (view) => client.setQueryData(tripKeys.detail(id), view),
  });
}

export function useScoringMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  const latestRequest = useRef(0);
  return useMutation({
    mutationFn: async (input: ScoringConfig) => {
      const seq = ++latestRequest.current;
      const view = await api.updateScoring(id, input);
      return { seq, view };
    },
    onSuccess: ({ seq, view }) => {
      if (seq === latestRequest.current)
        client.setQueryData(tripKeys.detail(id), view);
    },
  });
}

export function useReactionMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetReactionInput) => api.setReaction(id, input),
    onSuccess: (view) => client.setQueryData(tripKeys.detail(id), view),
  });
}

export function useShortlistMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cityIds: readonly string[]) => api.setShortlist(id, cityIds),
    onSuccess: (view) => client.setQueryData(tripKeys.detail(id), view),
  });
}

export function useFinalizeMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (destinationResultId: string) =>
      api.finalize(id, destinationResultId),
    onSuccess: (view) => client.setQueryData(tripKeys.detail(id), view),
  });
}
