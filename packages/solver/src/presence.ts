import type { RouteBundle } from "./model.js";
import { minutesBetween } from "./numeric.js";

export type PresenceIntersection = {
  commonStart: string;
  commonEnd: string;
  commonTimeMinutes: number;
};

export function intersectPresence(
  bundles: readonly RouteBundle[],
): PresenceIntersection {
  if (bundles.length === 0)
    throw new TypeError("At least one bundle is required");
  const commonStart = bundles.reduce(
    (latest, bundle) =>
      Date.parse(bundle.presenceStart) > Date.parse(latest)
        ? bundle.presenceStart
        : latest,
    bundles[0]!.presenceStart,
  );
  const commonEnd = bundles.reduce(
    (earliest, bundle) =>
      Date.parse(bundle.presenceEnd) < Date.parse(earliest)
        ? bundle.presenceEnd
        : earliest,
    bundles[0]!.presenceEnd,
  );
  return {
    commonStart,
    commonEnd,
    commonTimeMinutes: Math.max(
      0,
      Math.floor(minutesBetween(commonStart, commonEnd)),
    ),
  };
}

export function cartesianProduct<T>(
  groups: readonly (readonly T[])[],
): readonly (readonly T[])[] {
  if (groups.some((group) => group.length === 0)) return [];
  return groups.reduce<readonly (readonly T[])[]>(
    (products, group) =>
      products.flatMap((product) => group.map((item) => [...product, item])),
    [[]],
  );
}
