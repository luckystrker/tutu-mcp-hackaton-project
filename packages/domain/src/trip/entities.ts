import type { Trip } from "@rendezvous/contracts";
import type { ReadyParticipant } from "../participant/entities.js";

export type ComputableTrip = {
  trip: Trip;
  participants: readonly ReadyParticipant[];
};
