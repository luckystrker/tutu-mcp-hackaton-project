import type {
  ExplainResponse,
  FinalTripDto,
  PublicCity,
} from "@rendezvous/contracts";
import { localizePublicCity } from "@rendezvous/domain";
import type { SupportedLocale } from "@rendezvous/i18n";
import type { TripView } from "./api.js";

export function localizeTripView(
  view: TripView,
  locale: SupportedLocale,
): TripView {
  return {
    ...view,
    destinations: view.destinations.map((destination) => ({
      ...destination,
      city: localizePublicCity(destination.city, locale),
    })),
  };
}

export function localizeFinalTrip(
  trip: FinalTripDto,
  locale: SupportedLocale,
): FinalTripDto {
  return { ...trip, city: localizePublicCity(trip.city, locale) };
}

export function localizeExplanation(
  response: ExplainResponse,
  locale: SupportedLocale,
): ExplainResponse {
  const localize = (city: PublicCity | null) =>
    city ? localizePublicCity(city, locale) : null;
  const facts =
    response.facts.type === "counterfactual"
      ? {
          ...response.facts,
          city: localize(response.facts.city),
          changes: response.facts.changes.map((change) => ({
            ...change,
            unlockedCities: change.unlockedCities.map((city) =>
              localizePublicCity(city, locale),
            ),
          })),
        }
      : {
          ...response.facts,
          city: localizePublicCity(response.facts.city, locale),
          reference: localize(response.facts.reference),
        };
  return { ...response, facts };
}
