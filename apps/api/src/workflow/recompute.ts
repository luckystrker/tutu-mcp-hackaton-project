import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { City, TransportMode } from "@rendezvous/contracts";
import {
  EXPANDED_CANDIDATE_WEIGHTS,
  type CandidateGenerator,
  validateTripForComputation,
} from "@rendezvous/domain";
import { rescore, solve, type CandidateTravelFacts } from "@rendezvous/solver";
import type {
  AdapterResult,
  SearchLegInput,
  TutuTransportAdapter,
} from "@rendezvous/tutu";
import { z } from "zod";
import { projectSolverOutput } from "../application/projection.js";
import type {
  RecomputeJob,
  TripRepository,
} from "../repositories/trip-repository.js";

export type RecomputeRepository = Pick<
  TripRepository,
  | "emitProgress"
  | "currentRevision"
  | "getPrivateTrip"
  | "persistIfCurrent"
  | "markJobStale"
>;

type RunStats = {
  mcpCallCount: number;
  cacheHits: number;
  successfulRoutePairs: number;
  solverDurationMs: number;
};

const JobSchema = z.strictObject({
  id: z.uuid(),
  tripId: z.uuid(),
  revision: z.number().int().nonnegative(),
  queuedAt: z.iso.datetime(),
});
const WorkflowResultSchema = z.strictObject({
  status: z.enum(["PERSISTED", "STALE"]),
  destinations: z.number().int().nonnegative(),
});
const ALL_MODES: readonly TransportMode[] = ["train", "air", "bus", "suburban"];

export interface WorkflowLog {
  info(fields: Readonly<Record<string, unknown>>, message: string): void;
  error(fields: Readonly<Record<string, unknown>>, message: string): void;
}

export interface RecomputeMetrics {
  recordRecomputeLatencyReadyToPublished(milliseconds: number): void;
  recordWorkflowRun?(metric: {
    durationMs: number;
    candidates: number;
    feasible: number;
    rejected: number;
    exploredSolutions: number;
    degraded: boolean;
    mcpCallCount: number;
    cacheHitRate: number;
    successfulRoutePairs: number;
    solverDurationMs: number;
  }): void;
}

export class InMemoryRecomputeMetrics implements RecomputeMetrics {
  readonly recomputeLatencyReadyToPublished: number[] = [];
  readonly workflowRuns: Array<{
    durationMs: number;
    candidates: number;
    feasible: number;
    rejected: number;
    exploredSolutions: number;
    degraded: boolean;
    mcpCallCount: number;
    cacheHitRate: number;
    successfulRoutePairs: number;
    solverDurationMs: number;
  }> = [];

  recordRecomputeLatencyReadyToPublished(milliseconds: number): void {
    this.recomputeLatencyReadyToPublished.push(milliseconds);
  }

  p95ReadyToPublished(): number | null {
    if (this.recomputeLatencyReadyToPublished.length === 0) return null;
    const ordered = [...this.recomputeLatencyReadyToPublished].sort(
      (a, b) => a - b,
    );
    return ordered[Math.ceil(ordered.length * 0.95) - 1]!;
  }

  recordWorkflowRun(metric: (typeof this.workflowRuns)[number]): void {
    this.workflowRuns.push({
      ...metric,
      durationMs: Math.round(metric.durationMs),
    });
  }

  snapshot() {
    const durations = this.workflowRuns
      .map(({ durationMs }) => durationMs)
      .sort((a, b) => a - b);
    const mcpCallCount = this.workflowRuns.reduce(
      (sum, run) => sum + run.mcpCallCount,
      0,
    );
    return {
      runs: this.workflowRuns.length,
      p95DurationMs:
        durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? 0,
      candidates: this.workflowRuns.at(-1)?.candidates ?? 0,
      feasible: this.workflowRuns.at(-1)?.feasible ?? 0,
      rejected: this.workflowRuns.at(-1)?.rejected ?? 0,
      exploredSolutions: this.workflowRuns.at(-1)?.exploredSolutions ?? 0,
      degradedRuns: this.workflowRuns.filter(({ degraded }) => degraded).length,
      mcpCallCount,
      cacheHitRate:
        mcpCallCount === 0
          ? 0
          : this.workflowRuns.reduce(
              (sum, run) => sum + run.cacheHitRate * run.mcpCallCount,
              0,
            ) / mcpCallCount,
      successfulRoutePairs: this.workflowRuns.reduce(
        (sum, run) => sum + run.successfulRoutePairs,
        0,
      ),
      solverDurationMs: Math.round(
        this.workflowRuns.at(-1)?.solverDurationMs ?? 0,
      ),
    };
  }
}

export class RecomputeRunner {
  readonly #cityById: ReadonlyMap<string, City>;

  constructor(
    private readonly repository: RecomputeRepository,
    private readonly candidateGenerator: CandidateGenerator,
    private readonly adapter: TutuTransportAdapter,
    cities: readonly City[],
    private readonly log: WorkflowLog,
    private readonly deadlineMs = 60_000,
    private readonly metrics: RecomputeMetrics = {
      recordRecomputeLatencyReadyToPublished: () => undefined,
    },
  ) {
    this.#cityById = new Map(cities.map((city) => [city.id, city]));
  }

  async run(
    job: RecomputeJob,
  ): Promise<{ status: "PERSISTED" | "STALE"; destinations: number }> {
    const startedAt = performance.now();
    const signal = AbortSignal.timeout(this.deadlineMs);
    const logFields = {
      tripId: job.tripId,
      revision: job.revision,
      jobId: job.id,
      runId: `recompute-${job.id}`,
    };
    this.log.info(logFields, "recompute started");
    await this.repository.emitProgress(job.tripId, job.revision, "load", 5);
    if ((await this.repository.currentRevision(job.tripId)) !== job.revision) {
      await this.repository.markJobStale(job);
      return { status: "STALE", destinations: 0 };
    }
    const snapshot = await this.repository.getPrivateTrip(job.tripId);
    const validated = validateTripForComputation(
      snapshot.trip,
      snapshot.participants,
      [...this.#cityById.values()],
    );
    if (!validated.ok)
      throw new Error(
        `TRIP_NOT_COMPUTABLE:${validated.errors.map(({ code }) => code).join(",")}`,
      );

    await this.repository.emitProgress(
      job.tripId,
      job.revision,
      "candidates",
      15,
    );
    const initial = this.candidateGenerator.generate({
      participants: validated.value.participants,
      allowInternational: snapshot.trip.allowInternational,
      limit: 8,
    });
    const factsByCity = new Map<string, CandidateTravelFacts>();
    const stats: RunStats = {
      mcpCallCount: 0,
      cacheHits: 0,
      successfulRoutePairs: 0,
      solverDurationMs: 0,
    };
    let degraded = false;
    await this.searchCandidates(
      initial.map(({ cityId }) => cityId),
      validated.value.participants,
      snapshot.trip,
      factsByCity,
      signal,
      (partial) => {
        degraded ||= partial;
      },
      stats,
    );
    await this.repository.emitProgress(
      job.tripId,
      job.revision,
      "transport",
      55,
    );
    let solverStartedAt = performance.now();
    let preliminary = solve({
      trip: validated.value,
      candidates: [...factsByCity.values()],
      scoring: snapshot.trip.scoringConfig,
      algorithmVersion: "solver-v1",
    });
    stats.solverDurationMs += performance.now() - solverStartedAt;

    if (preliminary.ranked.length === 0) {
      const expanded = this.candidateGenerator.generate({
        participants: validated.value.participants,
        allowInternational: snapshot.trip.allowInternational,
        limit: 16,
        weights: EXPANDED_CANDIDATE_WEIGHTS,
      });
      const unseen = expanded
        .map(({ cityId }) => cityId)
        .filter((cityId) => !factsByCity.has(cityId));
      await this.searchCandidates(
        unseen,
        validated.value.participants,
        snapshot.trip,
        factsByCity,
        signal,
        (partial) => {
          degraded ||= partial;
        },
        stats,
      );
      solverStartedAt = performance.now();
      preliminary = solve({
        trip: validated.value,
        candidates: [...factsByCity.values()],
        scoring: snapshot.trip.scoringConfig,
        algorithmVersion: "solver-v1",
      });
      stats.solverDurationMs += performance.now() - solverStartedAt;
    }

    if ((await this.repository.currentRevision(job.tripId)) !== job.revision) {
      await this.repository.markJobStale(job);
      return { status: "STALE", destinations: 0 };
    }
    await this.repository.emitProgress(job.tripId, job.revision, "hotels", 70);
    const enrichedCities = new Set(
      preliminary.ranked.slice(0, 6).map(({ cityId }) => cityId),
    );
    for (const solution of preliminary.ranked.slice(0, 6)) {
      const city = this.#cityById.get(solution.cityId)!;
      const checkIn = localDate(solution.commonStart, city.tz);
      const checkOut = localDate(solution.commonEnd, city.tz);
      if (checkIn === checkOut) {
        const current = factsByCity.get(solution.cityId)!;
        factsByCity.set(solution.cityId, {
          ...current,
          hotelRequired: false,
          hotels: [],
        });
        continue;
      }
      stats.mcpCallCount += 1;
      const result = await safeAdapterCall("searchHotels", signal, () =>
        this.adapter.searchHotels(
          {
            city: { id: city.id, name: city.name, tz: city.tz },
            checkIn,
            checkOut,
            guests: validated.value.participants.length,
            rooms: Math.ceil(validated.value.participants.length / 2),
            currency: "RUB",
          },
          signal,
        ),
      );
      if (result.status === "cached") stats.cacheHits += 1;
      degraded ||= result.status === "partial";
      const current = factsByCity.get(solution.cityId)!;
      if (result.availability === "none") {
        factsByCity.set(solution.cityId, {
          ...current,
          hotelRequired: true,
          hotels: [],
        });
        continue;
      }
      factsByCity.set(solution.cityId, {
        ...current,
        hotelRequired: true,
        ...(result.status === "partial" && result.data.length === 0
          ? {}
          : { hotels: result.data }),
      });
    }
    const enrichedFacts = [...factsByCity.values()].filter(({ cityId }) =>
      enrichedCities.has(cityId),
    );
    // Scoring is deliberately revision-independent: a slider update must not
    // cancel this travel run or trigger another MCP fan-out. Read the latest
    // weights immediately before the final pure solver pass.
    const currentSnapshot = await this.repository.getPrivateTrip(job.tripId);
    solverStartedAt = performance.now();
    const output = solve({
      trip: validated.value,
      candidates: enrichedFacts,
      scoring: currentSnapshot.trip.scoringConfig,
      algorithmVersion: "solver-v1",
    });
    stats.solverDurationMs += performance.now() - solverStartedAt;
    let destinations = projectSolverOutput(output, this.#cityById);
    if (degraded)
      destinations = destinations.map((destination) => ({
        ...destination,
        degraded: true,
      }));
    await this.repository.emitProgress(job.tripId, job.revision, "persist", 90);
    const persisted = await this.repository.persistIfCurrent(
      job,
      output,
      destinations,
      degraded,
      this.candidateGenerator.algorithmVersion,
      {
        scoringUsed: currentSnapshot.trip.scoringConfig,
        reconcile: ({ scoring, readyParticipants }) => {
          const reconciled = rescore(
            output,
            readyParticipants as Parameters<typeof rescore>[1],
            scoring,
          );
          let reconciledDestinations = projectSolverOutput(
            reconciled,
            this.#cityById,
          );
          if (degraded)
            reconciledDestinations = reconciledDestinations.map(
              (destination) => ({ ...destination, degraded: true }),
            );
          return { output: reconciled, destinations: reconciledDestinations };
        },
      },
    );
    const status = persisted === "persisted" ? "PERSISTED" : "STALE";
    this.log.info(
      {
        ...logFields,
        status,
        candidates: enrichedFacts.length,
        ranked: destinations.length,
        durationMs: Math.round(performance.now() - startedAt),
        degraded,
        mcpCallCount: stats.mcpCallCount,
        cacheHitRate:
          stats.mcpCallCount === 0 ? 0 : stats.cacheHits / stats.mcpCallCount,
        successfulRoutePairs: stats.successfulRoutePairs,
        solverDurationMs: Math.round(stats.solverDurationMs),
      },
      "recompute finished",
    );
    if (status === "PERSISTED")
      this.metrics.recordRecomputeLatencyReadyToPublished(
        Date.now() - Date.parse(job.queuedAt),
      );
    this.metrics.recordWorkflowRun?.({
      durationMs: performance.now() - startedAt,
      candidates: enrichedFacts.length,
      feasible: output.allFeasible.length,
      rejected: output.rejected.length,
      exploredSolutions: output.allFeasible.reduce(
        (sum, destination) => sum + destination.groupFrontier.length,
        0,
      ),
      degraded,
      mcpCallCount: stats.mcpCallCount,
      cacheHitRate:
        stats.mcpCallCount === 0 ? 0 : stats.cacheHits / stats.mcpCallCount,
      successfulRoutePairs: stats.successfulRoutePairs,
      solverDurationMs: stats.solverDurationMs,
    });
    return { status, destinations: destinations.length };
  }

  async searchCandidates(
    cityIds: readonly string[],
    participants: Parameters<CandidateGenerator["generate"]>[0]["participants"],
    trip: Parameters<typeof validateTripForComputation>[0],
    factsByCity: Map<string, CandidateTravelFacts>,
    signal: AbortSignal,
    reportPartial: (partial: boolean) => void,
    stats: RunStats,
  ): Promise<void> {
    const searchable = cityIds.filter(
      (cityId) =>
        !participants.some(({ originCityId }) => originCityId === cityId) &&
        this.#cityById.has(cityId),
    );
    for (let offset = 0; offset < searchable.length; offset += 4) {
      await Promise.all(
        searchable.slice(offset, offset + 4).map(async (cityId) => {
          const city = this.#cityById.get(cityId)!;
          const results = await Promise.all(
            participants.map(async (participant) => {
              const origin = this.#cityById.get(participant.originCityId)!;
              const common = {
                earliestDepartureAt: participant.availableFrom,
                latestArrivalAt: participant.mustReturnBy,
                allowedModes: ALL_MODES,
                passengers: 1 as const,
              };
              const outboundInput: SearchLegInput = {
                ...common,
                origin: cityRef(origin),
                destination: cityRef(city),
              };
              const returnInput: SearchLegInput = {
                ...common,
                origin: cityRef(city),
                destination: cityRef(origin),
              };
              const [outbound, returning] = await Promise.all([
                safeAdapterCall("searchOutbound", signal, () =>
                  this.adapter.searchOutbound(outboundInput, signal),
                ),
                safeAdapterCall("searchReturn", signal, () =>
                  this.adapter.searchReturn(returnInput, signal),
                ),
              ]);
              stats.mcpCallCount += 2;
              stats.cacheHits +=
                Number(outbound.status === "cached") +
                Number(returning.status === "cached");
              if (outbound.data.length > 0 && returning.data.length > 0)
                stats.successfulRoutePairs += 1;
              reportPartial(
                outbound.status === "partial" || returning.status === "partial",
              );
              return {
                participantId: participant.id,
                originTimeZone: origin.tz,
                outbound: outbound.data,
                returns: returning.data,
                fetchedAt: earliestFetchedAt(outbound, returning),
              };
            }),
          );
          factsByCity.set(cityId, {
            cityId,
            destinationTimeZone: city.tz,
            participants: results.map(({ fetchedAt: _, ...facts }) => facts),
            fetchedAt:
              results.map(({ fetchedAt }) => fetchedAt).sort()[0] ??
              new Date().toISOString(),
          });
        }),
      );
    }
  }
}

export function createMastraRecomputeWorkflow(runner: RecomputeRunner) {
  const execute = createStep({
    id: "execute-recompute-pipeline",
    inputSchema: JobSchema,
    outputSchema: WorkflowResultSchema,
    execute: ({ inputData }) => runner.run(inputData),
  });
  return createWorkflow({
    id: "recompute-trip-v1",
    description:
      "Deterministic candidate, Tutu transport/hotel, solver and revision-guard pipeline",
    inputSchema: JobSchema,
    outputSchema: WorkflowResultSchema,
  })
    .then(execute)
    .commit();
}

function cityRef(city: City) {
  return { id: city.id, name: city.name, tz: city.tz };
}

function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function earliestFetchedAt(...results: Array<AdapterResult<unknown>>): string {
  return results.map(({ fetchedAt }) => fetchedAt).sort()[0]!;
}

async function safeAdapterCall<T>(
  tool: "searchOutbound" | "searchReturn" | "searchHotels",
  signal: AbortSignal,
  call: () => Promise<AdapterResult<T>>,
): Promise<AdapterResult<T>> {
  if (signal.aborted) return failedAdapterResult(tool, signal);
  try {
    return await call();
  } catch (error) {
    return failedAdapterResult(tool, signal, error);
  }
}

function failedAdapterResult<T>(
  tool: "searchOutbound" | "searchReturn" | "searchHotels",
  signal: AbortSignal,
  error?: unknown,
): AdapterResult<T> {
  return {
    status: "partial",
    availability: "unknown",
    data: [],
    fetchedAt: new Date().toISOString(),
    failures: [
      {
        code: signal.aborted ? "TIMEOUT" : "PROVIDER",
        tool,
        retryable: true,
        message: signal.aborted
          ? "Workflow deadline reached"
          : error instanceof Error
            ? error.message
            : "Provider failed",
      },
    ],
  };
}
