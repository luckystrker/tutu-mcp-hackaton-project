import type { City } from "@rendezvous/contracts";
import { haversineDistanceKm } from "@rendezvous/domain";

export function findNearestCity(
  cities: readonly City[],
  coordinates: { latitude: number; longitude: number },
): { city: City; distanceKm: number } | undefined {
  let nearest: { city: City; distanceKm: number } | undefined;
  for (const city of cities) {
    const distanceKm = haversineDistanceKm(
      { lat: coordinates.latitude, lon: coordinates.longitude },
      city,
    );
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { city, distanceKm };
    }
  }
  return nearest;
}
