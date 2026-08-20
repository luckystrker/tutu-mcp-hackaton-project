import type { DestinationResultDto } from "@rendezvous/contracts";
import { useRef } from "react";

export type RankingViewState = {
  destinations: readonly DestinationResultDto[];
  previousScores: ReadonlyMap<string, number>;
};

export function useRankingViewState(
  destinations: readonly DestinationResultDto[],
): RankingViewState {
  const state = useRef({
    signature: "",
    current: new Map<string, number>(),
    previous: new Map<string, number>(),
  });
  const signature = destinations
    .map(({ city, score, rank }) => `${city.id}:${score}:${rank}`)
    .join("|");
  if (signature !== state.current.signature) {
    state.current.previous = state.current.current;
    state.current.current = new Map(
      destinations.map((item) => [item.city.id, item.score]),
    );
    state.current.signature = signature;
  }
  return { destinations, previousScores: state.current.previous };
}
