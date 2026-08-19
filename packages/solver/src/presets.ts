import type { ScoringConfig } from "@rendezvous/contracts";
import type { ScoringPreset } from "./model.js";
import { normalizeWeights } from "./components.js";
import { SolverError } from "./numeric.js";

export const PRESET_ALGORITHM_VERSION = "presets-v1";

const PRESETS: Readonly<Record<ScoringPreset, ScoringConfig>> = {
  balanced: {
    together: 35,
    cost: 25,
    travel: 20,
    synchronization: 10,
    fairness: 10,
  },
  cheapest: {
    together: 15,
    cost: 50,
    travel: 15,
    synchronization: 10,
    fairness: 10,
  },
  fairest: {
    together: 25,
    cost: 15,
    travel: 15,
    synchronization: 10,
    fairness: 35,
  },
  "more-time": {
    together: 55,
    cost: 15,
    travel: 10,
    synchronization: 10,
    fairness: 10,
  },
};

const ORDER: readonly ScoringPreset[] = [
  "balanced",
  "cheapest",
  "fairest",
  "more-time",
];

export function presetToWeights(preset: ScoringPreset): ScoringConfig {
  return normalizeWeights(PRESETS[preset]);
}

export function sliderToWeights(position: number): ScoringConfig {
  if (
    !Number.isFinite(position) ||
    position < 0 ||
    position > ORDER.length - 1
  ) {
    throw new SolverError(
      "INVALID_INPUT",
      `Slider position must be between 0 and ${ORDER.length - 1}`,
    );
  }
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  const left = PRESETS[ORDER[lower]!]!;
  const right = PRESETS[ORDER[upper]!]!;
  return normalizeWeights({
    together: interpolate(left.together, right.together, fraction),
    cost: interpolate(left.cost, right.cost, fraction),
    travel: interpolate(left.travel, right.travel, fraction),
    synchronization: interpolate(
      left.synchronization,
      right.synchronization,
      fraction,
    ),
    fairness: interpolate(left.fairness, right.fairness, fraction),
  });
}

function interpolate(left: number, right: number, fraction: number): number {
  return left + (right - left) * fraction;
}
