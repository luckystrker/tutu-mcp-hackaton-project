const EARTH_RADIUS_KM = 6_371;

export type Coordinates = { lat: number; lon: number };

export function haversineDistanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  assertCoordinates(from);
  assertCoordinates(to);
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lon - from.lon);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
  return EARTH_RADIUS_KM * centralAngle;
}

function assertCoordinates({ lat, lon }: Coordinates): void {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new RangeError(`Invalid coordinates: ${lat}, ${lon}`);
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
