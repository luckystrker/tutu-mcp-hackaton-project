import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  ScoringConfig,
  UpdatePreferencesInput,
} from "@rendezvous/contracts";
import { useApi } from "../../app/providers.js";

export const tripKeys = { detail: (id: string) => ["trip", id] as const };

export function useTrip(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: tripKeys.detail(id),
    queryFn: () => api.getTrip(id),
  });
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
