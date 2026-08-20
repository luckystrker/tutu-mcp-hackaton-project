import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type {
  DestinationResultDto,
  ScoringConfig,
  ExplainInput,
  SetReactionInput,
  UpdatePreferencesInput,
} from "@rendezvous/contracts";
import { useApi } from "../../app/providers.js";

export const tripKeys = {
  all: ["trips"] as const,
  detail: (id: string) => ["trip", id] as const,
  final: (id: string) => ["trip-final", id] as const,
  explanation: (id: string, input: ExplainInput) =>
    ["trip-explanation", id, input] as const,
  invite: (id: string) => ["invite", id] as const,
};

export function useExplanation(id: string, input: ExplainInput | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: input
      ? tripKeys.explanation(id, input)
      : (["trip-explanation", id, "disabled"] as const),
    queryFn: () => api.explain(id, input!),
    enabled: Boolean(input),
    staleTime: 60_000,
  });
}

export function useFinalTrip(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: tripKeys.final(id),
    queryFn: () => api.getFinal(id),
  });
}

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

export function useRetryComputationMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryComputation(id),
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
    onMutate: (input) => {
      const previous = client.getQueryData<unknown>(tripKeys.detail(id));
      client.setQueryData(tripKeys.detail(id), (current: unknown) =>
        optimisticallyRescore(current, input),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined)
        client.setQueryData(tripKeys.detail(id), context.previous);
    },
    onSuccess: ({ seq, view }) => {
      if (seq === latestRequest.current)
        client.setQueryData(tripKeys.detail(id), view);
    },
  });
}

function optimisticallyRescore(current: unknown, scoring: ScoringConfig) {
  if (!current || typeof current !== "object" || !("destinations" in current))
    return current;
  const view = current as {
    trip: { scoringConfig: ScoringConfig };
    destinations: readonly DestinationResultDto[];
  };
  const total = Object.values(scoring).reduce((sum, value) => sum + value, 0);
  const destinations = view.destinations
    .map((destination) => ({
      ...destination,
      score:
        Math.round(
          (Object.entries(scoring).reduce(
            (sum, [key, value]) =>
              sum +
              destination.components[
                key as keyof DestinationResultDto["components"]
              ] *
                value,
            0,
          ) /
            total) *
            100,
        ) / 100,
    }))
    .sort((left, right) => right.score - left.score)
    .map((destination, index) => ({ ...destination, rank: index + 1 }));
  return {
    ...view,
    trip: { ...view.trip, scoringConfig: scoring },
    destinations,
  };
}

export function useReactionMutation(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetReactionInput | { cityId: string; value: null }) =>
      input.value === null
        ? api.deleteReaction(id, input.cityId)
        : api.setReaction(id, input),
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
    onSuccess: (view) => {
      client.setQueryData(tripKeys.final(id), view);
      void client.invalidateQueries({ queryKey: tripKeys.detail(id) });
    },
  });
}
