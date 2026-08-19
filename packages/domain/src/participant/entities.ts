import type { ParticipantPrivate } from "@rendezvous/contracts";

export type ReadyParticipant = ParticipantPrivate & {
  originCityId: string;
  availableFrom: string;
  mustReturnBy: string;
  maxBudget: NonNullable<ParticipantPrivate["maxBudget"]>;
  ready: true;
};
