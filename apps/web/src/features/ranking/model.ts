import type { DestinationResultDto } from "@rendezvous/contracts";
import { useEffect, useRef } from "react";

export type RankingViewState = {
  destinations: readonly DestinationResultDto[];
  previousScores: ReadonlyMap<string, number>;
};

export function useRankingViewState(
  destinations: readonly DestinationResultDto[],
): RankingViewState {
  const previous = useRef<ReadonlyMap<string, number>>(new Map());
  const snapshot = previous.current;
  useEffect(() => {
    previous.current = new Map(
      destinations.map((item) => [item.city.id, item.score]),
    );
  }, [destinations]);
  return { destinations, previousScores: snapshot };
}
