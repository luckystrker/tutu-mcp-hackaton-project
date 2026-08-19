import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  City,
  CreateTripInput,
  DestinationResultDto,
  ParticipantPrivate,
  ScoringConfig,
  SetReactionInput,
  TripEvent,
  Trip,
  UpdatePreferencesInput,
  UpdateTripSettingsInput,
} from "@rendezvous/contracts";
import {
  ParticipantPrivateSchema,
  TripEventSchema,
  TripSchema,
} from "@rendezvous/contracts";
import type { SolverOutput } from "@rendezvous/solver";
import type { Queryable, Database } from "../db.js";
import type { Actor } from "../application/actor.js";
import { ApplicationError, notFound } from "../application/errors.js";

type TripRow = {
  id: string;
  organizer_user_id: string;
  title: string;
  expected_participants: number;
  status: Trip["status"];
  compute_status: Trip["computeStatus"];
  revision: number;
  ranking_version: number;
  min_together_minutes: number;
  period_from: Date;
  period_to: Date;
  allow_international: boolean;
  scoring_config: ScoringConfig;
  created_at: Date;
  updated_at: Date;
};

type ParticipantRow = {
  id: string;
  trip_id: string;
  user_id: string;
  display_name: string;
  origin_city_id: string | null;
  available_from: Date | null;
  must_return_by: Date | null;
  max_budget_minor: string | null;
  currency: "RUB" | null;
  forbidden_modes: ParticipantPrivate["forbiddenModes"];
  soft_preferences: ParticipantPrivate["softPreferences"];
  ready: boolean;
  created_at: Date;
  updated_at: Date;
};

export type TripAggregate = {
  trip: Trip;
  participants: readonly ParticipantPrivate[];
  destinations: readonly DestinationResultDto[];
  actorParticipant: ParticipantPrivate;
  isOrganizer: boolean;
};

export type RecomputeJob = {
  id: string;
  tripId: string;
  revision: number;
  queuedAt: string;
};

export class TripRepository {
  constructor(private readonly database: Database) {}

  async syncCityCatalog(
    cities: readonly City[],
    version: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const city of cities) {
        await client.query(
          `INSERT INTO rendezvous.city_catalog(id,name,country,lat,lon,tz,hub_score,tags,catalog_version)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,country=EXCLUDED.country,lat=EXCLUDED.lat,
             lon=EXCLUDED.lon,tz=EXCLUDED.tz,hub_score=EXCLUDED.hub_score,tags=EXCLUDED.tags,
             catalog_version=EXCLUDED.catalog_version,updated_at=now()`,
          [
            city.id,
            city.name,
            city.country,
            city.lat,
            city.lon,
            city.tz,
            city.hubScore,
            city.tags,
            version,
          ],
        );
      }
    });
  }

  async createTrip(
    actor: Actor,
    input: CreateTripInput,
  ): Promise<{ trip: Trip; inviteToken: string }> {
    return this.database.transaction(async (client) => {
      await ensureUser(client, actor);
      const id = randomUUID();
      const participantId = randomUUID();
      const inviteToken = randomBytes(16).toString("base64url");
      const scoring: ScoringConfig = {
        together: 35,
        cost: 25,
        travel: 20,
        synchronization: 10,
        fairness: 10,
      };
      const inserted = await client.query<TripRow>(
        `INSERT INTO rendezvous.trips(
           id,organizer_user_id,invite_token_hash,title,expected_participants,status,compute_status,
           min_together_minutes,period_from,period_to,allow_international,scoring_config)
         VALUES($1,$2,$3,$4,$5,'COLLECTING','idle',$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          id,
          actor.userId,
          hashToken(inviteToken),
          input.title,
          input.expectedParticipants,
          input.minTogetherMinutes,
          input.periodFrom,
          input.periodTo,
          input.allowInternational,
          JSON.stringify(scoring),
        ],
      );
      await client.query(
        `INSERT INTO rendezvous.participants(id,trip_id,user_id) VALUES($1,$2,$3)`,
        [participantId, id, actor.userId],
      );
      return { trip: mapTrip(inserted.rows[0]!), inviteToken };
    });
  }

  async joinTrip(
    actor: Actor,
    tripId: string,
    inviteToken: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await ensureUser(client, actor);
      const trip = await lockedTrip(client, tripId);
      if (trip.status === "FINALIZED" || trip.status === "CANCELLED")
        throw new ApplicationError("TRIP_CLOSED", 409, "Trip is closed");
      const token = await client.query<{ valid: boolean }>(
        `SELECT invite_token_hash = $2 AND invite_expires_at > now() AS valid
         FROM rendezvous.trips WHERE id=$1`,
        [tripId, hashToken(inviteToken)],
      );
      if (!token.rows[0]?.valid) notFound();
      const count = await client.query<{ count: string }>(
        `SELECT count(*) FROM rendezvous.participants WHERE trip_id=$1`,
        [tripId],
      );
      const existing = await client.query(
        `SELECT 1 FROM rendezvous.participants WHERE trip_id=$1 AND user_id=$2`,
        [tripId, actor.userId],
      );
      if (existing.rowCount) return;
      if (Number(count.rows[0]!.count) >= trip.expected_participants)
        throw new ApplicationError("TRIP_FULL", 409, "Trip is full");
      const participantId = randomUUID();
      await client.query(
        `INSERT INTO rendezvous.participants(id,trip_id,user_id) VALUES($1,$2,$3)`,
        [participantId, tripId, actor.userId],
      );
      await insertEvent(client, tripId, trip.revision, "participant_joined", {
        participantId,
      });
    });
  }

  async resolveInvite(inviteToken: string): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM rendezvous.trips
       WHERE invite_token_hash=$1 AND invite_expires_at>now()`,
      [hashToken(inviteToken)],
    );
    if (!result.rows[0]) notFound();
    return result.rows[0].id;
  }

  async rotateInviteToken(actorId: string, tripId: string): Promise<string> {
    return this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      requireOrganizer(trip, actorId);
      requireEditable(trip);
      const token = randomBytes(16).toString("base64url");
      await client.query(
        `UPDATE rendezvous.trips SET invite_token_hash=$2,
           invite_expires_at=now()+interval '30 days',updated_at=now() WHERE id=$1`,
        [tripId, hashToken(token)],
      );
      return token;
    });
  }

  async getAggregate(actorId: string, tripId: string): Promise<TripAggregate> {
    const tripResult = await this.database.query<TripRow>(
      `SELECT * FROM rendezvous.trips WHERE id=$1`,
      [tripId],
    );
    if (!tripResult.rows[0]) notFound();
    const participantRows = await this.database.query<ParticipantRow>(
      `SELECT p.*,u.display_name FROM rendezvous.participants p JOIN rendezvous.users u ON u.id=p.user_id WHERE p.trip_id=$1 ORDER BY p.created_at,p.id`,
      [tripId],
    );
    const participants = participantRows.rows.map(mapParticipant);
    const actorParticipant = participants.find(
      ({ userId }) => userId === actorId,
    );
    if (!actorParticipant) notFound();
    const destinations = await this.latestDestinations(tripId, actorId);
    const trip = mapTrip(tripResult.rows[0]);
    return {
      trip,
      participants,
      destinations,
      actorParticipant,
      isOrganizer: trip.organizerUserId === actorId,
    };
  }

  async listTrips(actorId: string): Promise<readonly Trip[]> {
    const rows = await this.database.query<TripRow>(
      `SELECT t.* FROM rendezvous.trips t JOIN rendezvous.participants p ON p.trip_id=t.id
       WHERE p.user_id=$1 ORDER BY t.updated_at DESC,t.id`,
      [actorId],
    );
    return rows.rows.map(mapTrip);
  }

  async updatePreferences(
    actorId: string,
    tripId: string,
    input: UpdatePreferencesInput,
  ): Promise<number> {
    return this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      if (trip.status === "FINALIZED" || trip.status === "CANCELLED")
        throw new ApplicationError("TRIP_CLOSED", 409, "Trip is closed");
      const updated = await client.query<{ id: string }>(
        `UPDATE rendezvous.participants SET origin_city_id=$3,available_from=$4,must_return_by=$5,
           max_budget_minor=$6,currency='RUB',forbidden_modes=$7,soft_preferences=$8,ready=true,updated_at=now()
         WHERE trip_id=$1 AND user_id=$2 RETURNING id`,
        [
          tripId,
          actorId,
          input.originCityId,
          input.availableFrom,
          input.mustReturnBy,
          Math.round(input.maxBudget.amount * 100),
          input.forbiddenModes,
          JSON.stringify(input.softPreferences),
        ],
      );
      if (!updated.rows[0]) notFound();
      const revision = trip.revision + 1;
      const ready = await client.query<{ count: string }>(
        `SELECT count(*) FROM rendezvous.participants WHERE trip_id=$1 AND ready`,
        [tripId],
      );
      await client.query(
        `UPDATE rendezvous.trips SET revision=$2,status=CASE WHEN $3::int >= 2 THEN 'LIVE' ELSE status END,
           compute_status=CASE WHEN $3::int >= 2 THEN 'running' ELSE compute_status END,updated_at=now() WHERE id=$1`,
        [tripId, revision, Number(ready.rows[0]!.count)],
      );
      if (Number(ready.rows[0]!.count) >= 2)
        await enqueueJob(client, tripId, revision);
      await insertEvent(client, tripId, revision, "participant_ready", {
        participantId: updated.rows[0].id,
        readyCount: Number(ready.rows[0]!.count),
      });
      return revision;
    });
  }

  async updateSettings(
    actorId: string,
    tripId: string,
    input: UpdateTripSettingsInput,
  ): Promise<number> {
    return this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      requireOrganizer(trip, actorId);
      requireEditable(trip);
      const periodFrom = input.periodFrom ?? trip.period_from.toISOString();
      const periodTo = input.periodTo ?? trip.period_to.toISOString();
      if (Date.parse(periodFrom) >= Date.parse(periodTo))
        throw new ApplicationError(
          "INVALID_PERIOD",
          422,
          "Trip period is invalid",
        );
      const revision = trip.revision + 1;
      const ready = await client.query<{ count: string }>(
        `SELECT count(*) FROM rendezvous.participants WHERE trip_id=$1 AND ready`,
        [tripId],
      );
      const readyCount = Number(ready.rows[0]!.count);
      await client.query(
        `UPDATE rendezvous.trips SET title=$2,min_together_minutes=$3,period_from=$4,period_to=$5,
           allow_international=$6,revision=$7,
           status=CASE WHEN $8::int >= 2 THEN 'LIVE' ELSE status END,
           compute_status=CASE WHEN $8::int >= 2 THEN 'running' ELSE compute_status END,
           updated_at=now() WHERE id=$1`,
        [
          tripId,
          input.title ?? trip.title,
          input.minTogetherMinutes ?? trip.min_together_minutes,
          periodFrom,
          periodTo,
          input.allowInternational ?? trip.allow_international,
          revision,
          readyCount,
        ],
      );
      if (readyCount >= 2) await enqueueJob(client, tripId, revision);
      return revision;
    });
  }

  async updateScoring(
    actorId: string,
    tripId: string,
    scoring: ScoringConfig,
  ): Promise<{ trip: Trip; solverOutput: SolverOutput | null }> {
    return this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      requireOrganizer(trip, actorId);
      const rankingVersion = trip.ranking_version + 1;
      const activeJob = await client.query(
        `SELECT 1 FROM rendezvous.recompute_jobs WHERE trip_id=$1 AND revision=$2 AND status IN ('QUEUED','RUNNING')`,
        [tripId, trip.revision],
      );
      if (activeJob.rowCount) {
        const revision = trip.revision + 1;
        const superseded = await client.query<TripRow>(
          `UPDATE rendezvous.trips SET scoring_config=$2,ranking_version=$3,revision=$4,compute_status='running',updated_at=now() WHERE id=$1 RETURNING *`,
          [tripId, JSON.stringify(scoring), rankingVersion, revision],
        );
        await enqueueJob(client, tripId, revision);
        return { trip: mapTrip(superseded.rows[0]!), solverOutput: null };
      }
      const row = await client.query<TripRow>(
        `UPDATE rendezvous.trips SET scoring_config=$2,ranking_version=$3,updated_at=now() WHERE id=$1 RETURNING *`,
        [tripId, JSON.stringify(scoring), rankingVersion],
      );
      const latest = await client.query<{ solver_output: SolverOutput }>(
        `SELECT solver_output FROM rendezvous.trip_results WHERE trip_id=$1 AND revision=$2 ORDER BY ranking_version DESC LIMIT 1`,
        [tripId, trip.revision],
      );
      return {
        trip: mapTrip(row.rows[0]!),
        solverOutput: latest.rows[0]?.solver_output ?? null,
      };
    });
  }

  async setReaction(
    actorId: string,
    tripId: string,
    input: SetReactionInput,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      await requireMembership(client, actorId, tripId);
      requireEditable(trip);
      await client.query(
        `INSERT INTO rendezvous.reactions(trip_id,city_id,user_id,value) VALUES($1,$2,$3,$4)
         ON CONFLICT(trip_id,city_id,user_id) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
        [tripId, input.cityId, actorId, input.value],
      );
      await insertEvent(client, tripId, trip.revision, "reaction_added", {
        cityId: input.cityId,
        value: input.value,
      });
    });
  }

  async deleteReaction(
    actorId: string,
    tripId: string,
    cityId: string,
  ): Promise<void> {
    await this.requireMembership(actorId, tripId);
    await this.database.query(
      `DELETE FROM rendezvous.reactions WHERE trip_id=$1 AND city_id=$2 AND user_id=$3`,
      [tripId, cityId, actorId],
    );
  }

  async setShortlist(
    actorId: string,
    tripId: string,
    cityIds: readonly string[],
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      requireOrganizer(trip, actorId);
      requireEditable(trip);
      if (trip.status !== "LIVE")
        throw new ApplicationError(
          "INVALID_STATE",
          409,
          "Only a live trip can be shortlisted",
        );
      if (cityIds.length === 0)
        throw new ApplicationError(
          "EMPTY_SHORTLIST",
          422,
          "Shortlist cannot be empty",
        );
      await client.query(`DELETE FROM rendezvous.shortlist WHERE trip_id=$1`, [
        tripId,
      ]);
      for (const [index, cityId] of cityIds.entries()) {
        await client.query(
          `INSERT INTO rendezvous.shortlist(trip_id,city_id,position) VALUES($1,$2,$3)`,
          [tripId, cityId, index + 1],
        );
      }
      await client.query(
        `UPDATE rendezvous.trips SET status='SHORTLIST',updated_at=now() WHERE id=$1`,
        [tripId],
      );
    });
  }

  async transition(
    actorId: string,
    tripId: string,
    action: "reopen" | "cancel",
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      requireOrganizer(trip, actorId);
      if (action === "reopen" && trip.status !== "SHORTLIST")
        throw new ApplicationError(
          "INVALID_STATE",
          409,
          "Trip is not shortlisted",
        );
      if (action === "cancel" && trip.status === "FINALIZED")
        throw new ApplicationError(
          "TRIP_FINALIZED",
          409,
          "Finalized trip cannot be cancelled",
        );
      if (trip.status === "CANCELLED")
        throw new ApplicationError("TRIP_CLOSED", 409, "Trip is cancelled");
      await client.query(
        `UPDATE rendezvous.trips SET status=$2,updated_at=now() WHERE id=$1`,
        [tripId, action === "reopen" ? "LIVE" : "CANCELLED"],
      );
    });
  }

  async leave(actorId: string, tripId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      if (trip.organizer_user_id === actorId)
        throw new ApplicationError(
          "ORGANIZER_CANNOT_LEAVE",
          409,
          "Organizer must cancel the trip",
        );
      if (trip.status === "FINALIZED" || trip.status === "CANCELLED")
        throw new ApplicationError(
          "TRIP_FINALIZED",
          409,
          "Finalized trip cannot be left",
        );
      const deleted = await client.query<{ id: string }>(
        `DELETE FROM rendezvous.participants WHERE trip_id=$1 AND user_id=$2 RETURNING id`,
        [tripId, actorId],
      );
      if (!deleted.rowCount) notFound();
      const revision = trip.revision + 1;
      const ready = await client.query<{ count: string }>(
        `SELECT count(*) FROM rendezvous.participants WHERE trip_id=$1 AND ready`,
        [tripId],
      );
      const readyCount = Number(ready.rows[0]!.count);
      await client.query(
        `UPDATE rendezvous.trips SET revision=$2,
           status=CASE WHEN $3::int < 2 THEN 'COLLECTING' ELSE 'LIVE' END,
           compute_status=CASE WHEN $3::int >= 2 THEN 'running' ELSE 'idle' END,
           updated_at=now() WHERE id=$1`,
        [tripId, revision, readyCount],
      );
      if (readyCount >= 2) await enqueueJob(client, tripId, revision);
      await insertEvent(client, tripId, revision, "participant_left", {
        participantId: deleted.rows[0]!.id,
        readyCount,
      });
    });
  }

  async finalize(
    actorId: string,
    tripId: string,
    destinationResultId: string,
  ): Promise<DestinationResultDto> {
    return this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      requireOrganizer(trip, actorId);
      if (trip.status !== "SHORTLIST")
        throw new ApplicationError(
          "INVALID_STATE",
          409,
          "Trip must be shortlisted before finalization",
        );
      const selected = await client.query<{
        solution_facts: DestinationResultDto;
      }>(
        `SELECT d.solution_facts FROM rendezvous.destination_results d
         JOIN rendezvous.trip_results r ON r.id=d.trip_result_id
         WHERE d.id=$1 AND r.trip_id=$2 ORDER BY r.revision DESC,r.ranking_version DESC LIMIT 1`,
        [destinationResultId, tripId],
      );
      const destination = selected.rows[0]?.solution_facts;
      if (!destination)
        throw new ApplicationError(
          "RESULT_NOT_FOUND",
          404,
          "Destination result not found",
        );
      await client.query(
        `INSERT INTO rendezvous.final_selections(trip_id,destination_result_id,snapshot,finalized_by)
         VALUES($1,$2,$3,$4) ON CONFLICT(trip_id) DO NOTHING`,
        [tripId, destinationResultId, JSON.stringify(destination), actorId],
      );
      await client.query(
        `UPDATE rendezvous.trips SET status='FINALIZED',updated_at=now() WHERE id=$1`,
        [tripId],
      );
      await insertEvent(client, tripId, trip.revision, "trip_finalized", {
        cityId: destination.city.id,
      });
      return destination;
    });
  }

  async requeueOrphanedJobs(): Promise<number> {
    const result = await this.database.query(
      `UPDATE rendezvous.recompute_jobs SET status='QUEUED',started_at=NULL,run_id=NULL
       WHERE status='RUNNING'`,
    );
    return result.rowCount ?? 0;
  }

  async claimNextJob(): Promise<RecomputeJob | null> {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE rendezvous.recompute_jobs j SET status='STALE',finished_at=now()
         FROM rendezvous.trips t WHERE j.trip_id=t.id AND j.status='QUEUED' AND j.revision < t.revision`,
      );
      const selected = await client.query<{
        id: string;
        trip_id: string;
        revision: number;
        created_at: Date;
      }>(
        `SELECT j.id,j.trip_id,j.revision,j.created_at FROM rendezvous.recompute_jobs j
         JOIN rendezvous.trips t ON t.id=j.trip_id AND t.revision=j.revision
         WHERE j.status='QUEUED' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
      );
      const job = selected.rows[0];
      if (!job) return null;
      await client.query(
        `UPDATE rendezvous.recompute_jobs SET status='RUNNING',attempts=attempts+1,started_at=now(),run_id=$2 WHERE id=$1`,
        [job.id, randomUUID()],
      );
      return {
        id: job.id,
        tripId: job.trip_id,
        revision: job.revision,
        queuedAt: job.created_at.toISOString(),
      };
    });
  }

  async getPrivateTrip(
    tripId: string,
  ): Promise<{ trip: Trip; participants: readonly ParticipantPrivate[] }> {
    const trip = await this.database.query<TripRow>(
      `SELECT * FROM rendezvous.trips WHERE id=$1`,
      [tripId],
    );
    if (!trip.rows[0]) notFound();
    const participants = await this.database.query<ParticipantRow>(
      `SELECT p.*,u.display_name FROM rendezvous.participants p JOIN rendezvous.users u ON u.id=p.user_id WHERE p.trip_id=$1 ORDER BY p.id`,
      [tripId],
    );
    return {
      trip: mapTrip(trip.rows[0]),
      participants: participants.rows.map(mapParticipant),
    };
  }

  async currentRevision(tripId: string): Promise<number> {
    const result = await this.database.query<{ revision: number }>(
      `SELECT revision FROM rendezvous.trips WHERE id=$1`,
      [tripId],
    );
    return result.rows[0]?.revision ?? -1;
  }

  async persistIfCurrent(
    job: RecomputeJob,
    output: SolverOutput,
    destinations: readonly DestinationResultDto[],
    workflowDegraded = false,
    candidateAlgorithmVersion = "unknown",
  ): Promise<"persisted" | "stale"> {
    return this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, job.tripId);
      if (trip.revision !== job.revision) {
        await markJob(client, job.id, "STALE");
        return "stale";
      }
      const resultId = randomUUID();
      const degraded =
        workflowDegraded ||
        destinations.some((destination) => destination.degraded);
      const sourceFetchedAt =
        destinations.map(({ checkedAt }) => checkedAt).sort()[0] ??
        new Date().toISOString();
      await client.query(
        `INSERT INTO rendezvous.trip_results(id,trip_id,revision,ranking_version,algorithm_version,
           scoring_algorithm_version,candidate_algorithm_version,source_fetched_at,degraded,solver_output)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          resultId,
          job.tripId,
          job.revision,
          trip.ranking_version,
          output.algorithmVersion,
          output.scoringAlgorithmVersion,
          candidateAlgorithmVersion,
          sourceFetchedAt,
          degraded,
          JSON.stringify(output),
        ],
      );
      for (const destination of destinations) {
        const destinationId = randomUUID();
        await client.query(
          `INSERT INTO rendezvous.destination_results(id,trip_result_id,city_id,rank,score,component_scores,
             common_time_minutes,valid,degraded,solution_facts,hotels)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            destinationId,
            resultId,
            destination.city.id,
            destination.rank,
            destination.score,
            JSON.stringify(destination.components),
            destination.commonTimeMinutes,
            destination.valid,
            destination.degraded,
            JSON.stringify(destination),
            JSON.stringify(destination.hotels),
          ],
        );
        const solution = output.ranked.find(
          ({ cityId }) => cityId === destination.city.id,
        );
        for (const bundle of solution?.bundles ?? []) {
          const burden = solution!.burdens.find(
            ({ participantId }) => participantId === bundle.participantId,
          );
          await client.query(
            `INSERT INTO rendezvous.route_selections(destination_result_id,participant_id,outbound,return_route,burden)
             VALUES($1,$2,$3,$4,$5)`,
            [
              destinationId,
              bundle.participantId,
              JSON.stringify(bundle.outbound),
              JSON.stringify(bundle.returning),
              JSON.stringify(burden),
            ],
          );
        }
      }
      await client.query(
        `UPDATE rendezvous.trips SET compute_status=$2,updated_at=now() WHERE id=$1`,
        [job.tripId, degraded ? "degraded" : "idle"],
      );
      await markJob(client, job.id, "SUCCEEDED");
      await insertEvent(client, job.tripId, job.revision, "ranking_updated", {
        rankingVersion: trip.ranking_version,
        destinations,
      });
      await insertEvent(
        client,
        job.tripId,
        job.revision,
        "computation_finished",
        { degraded },
      );
      return "persisted";
    });
  }

  async persistRescore(
    tripId: string,
    revision: number,
    rankingVersion: number,
    output: SolverOutput,
    destinations: readonly DestinationResultDto[],
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const trip = await lockedTrip(client, tripId);
      if (
        trip.revision !== revision ||
        trip.ranking_version !== rankingVersion
      ) {
        throw new ApplicationError(
          "STALE",
          409,
          "Scoring state changed during rescore",
        );
      }
      const resultId = randomUUID();
      const degraded = destinations.some((destination) => destination.degraded);
      const sourceFetchedAt =
        destinations.map(({ checkedAt }) => checkedAt).sort()[0] ??
        new Date().toISOString();
      const provenance = await client.query<{
        candidate_algorithm_version: string;
      }>(
        `SELECT candidate_algorithm_version FROM rendezvous.trip_results
         WHERE trip_id=$1 AND revision=$2 ORDER BY ranking_version DESC LIMIT 1`,
        [tripId, revision],
      );
      await client.query(
        `INSERT INTO rendezvous.trip_results(id,trip_id,revision,ranking_version,algorithm_version,
           scoring_algorithm_version,candidate_algorithm_version,source_fetched_at,degraded,solver_output)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          resultId,
          tripId,
          revision,
          rankingVersion,
          output.algorithmVersion,
          output.scoringAlgorithmVersion,
          provenance.rows[0]?.candidate_algorithm_version ?? "unknown",
          sourceFetchedAt,
          degraded,
          JSON.stringify(output),
        ],
      );
      await insertDestinations(client, resultId, output, destinations);
      await insertEvent(client, tripId, revision, "ranking_updated", {
        rankingVersion,
        destinations,
      });
    });
  }

  async failJob(job: RecomputeJob, code: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE rendezvous.recompute_jobs SET status='FAILED',error_code=$2,finished_at=now() WHERE id=$1`,
        [job.id, code],
      );
      await client.query(
        `UPDATE rendezvous.trips SET compute_status='failed',updated_at=now() WHERE id=$1 AND revision=$2`,
        [job.tripId, job.revision],
      );
    });
  }

  async markJobStale(job: RecomputeJob): Promise<void> {
    await this.database.query(
      `UPDATE rendezvous.recompute_jobs SET status='STALE',finished_at=now()
       WHERE id=$1 AND status IN ('QUEUED','RUNNING')`,
      [job.id],
    );
  }

  async emitProgress(
    tripId: string,
    revision: number,
    stage: string,
    percent: number,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO rendezvous.event_outbox(trip_id,revision,type,payload) VALUES($1,$2,'computation_progress',$3)`,
      [tripId, revision, JSON.stringify({ stage, percent })],
    );
  }

  async listEventsAfter(
    actorId: string,
    tripId: string,
    afterId: number,
    limit = 100,
  ): Promise<readonly TripEvent[]> {
    await this.requireMembership(actorId, tripId);
    const result = await this.database.query<{
      id: string;
      revision: number;
      type: TripEvent["type"];
      payload: TripEvent["payload"];
      occurred_at: Date;
    }>(
      `SELECT id::text,revision,type,payload,occurred_at FROM rendezvous.event_outbox
       WHERE trip_id=$1 AND id>$2 ORDER BY id LIMIT $3`,
      [tripId, afterId, Math.min(Math.max(limit, 1), 100)],
    );
    if (afterId > 0) {
      const oldest = await this.database.query<{
        id: string;
        revision: number;
      }>(
        `SELECT id::text,revision FROM rendezvous.event_outbox
         WHERE trip_id=$1 ORDER BY id LIMIT 1`,
        [tripId],
      );
      const first = oldest.rows[0];
      if (first && afterId < Number(first.id) - 1)
        return [
          TripEventSchema.parse({
            id: first.id,
            tripId,
            revision: first.revision,
            type: "resync_required",
            payload: { reason: "retention" },
            occurredAt: new Date().toISOString(),
          }),
        ];
    }
    return result.rows.map((row) =>
      TripEventSchema.parse({
        id: row.id,
        tripId,
        revision: row.revision,
        type: row.type,
        payload: row.payload,
        occurredAt: row.occurred_at.toISOString(),
      }),
    );
  }

  async pruneEventOutbox(retentionHours = 24): Promise<number> {
    const result = await this.database.query(
      `DELETE FROM rendezvous.event_outbox
       WHERE occurred_at < now() - ($1::text || ' hours')::interval`,
      [Math.max(1, Math.floor(retentionHours))],
    );
    return result.rowCount ?? 0;
  }

  private async latestDestinations(
    tripId: string,
    actorId: string,
  ): Promise<readonly DestinationResultDto[]> {
    const result = await this.database.query<{
      id: string;
      solution_facts: DestinationResultDto;
    }>(
      `SELECT d.id,d.solution_facts FROM rendezvous.destination_results d
       WHERE d.trip_result_id=(
         SELECT id FROM rendezvous.trip_results
         WHERE trip_id=$1 ORDER BY revision DESC,ranking_version DESC LIMIT 1
       )
       ORDER BY d.rank LIMIT 3`,
      [tripId],
    );
    const reactions = await this.database.query<{
      city_id: string;
      love: string;
      ok: string;
      no: string;
      mine: "love" | "ok" | "no" | null;
    }>(
      `SELECT city_id,
         count(*) FILTER (WHERE value='love')::text AS love,
         count(*) FILTER (WHERE value='ok')::text AS ok,
         count(*) FILTER (WHERE value='no')::text AS no,
         max(value) FILTER (WHERE user_id=$2) AS mine
       FROM rendezvous.reactions WHERE trip_id=$1 GROUP BY city_id`,
      [tripId, actorId],
    );
    const byCity = new Map(reactions.rows.map((row) => [row.city_id, row]));
    return result.rows.map(({ id, solution_facts }) => {
      const counts = byCity.get(solution_facts.city.id);
      return {
        ...solution_facts,
        resultId: id,
        reactions: {
          love: Number(counts?.love ?? 0),
          ok: Number(counts?.ok ?? 0),
          no: Number(counts?.no ?? 0),
          mine: counts?.mine ?? null,
        },
      };
    });
  }

  private async requireMembership(
    actorId: string,
    tripId: string,
  ): Promise<void> {
    const result = await this.database.query(
      `SELECT 1 FROM rendezvous.participants WHERE trip_id=$1 AND user_id=$2`,
      [tripId, actorId],
    );
    if (!result.rowCount) notFound();
  }
}

async function ensureUser(client: Queryable, actor: Actor): Promise<void> {
  await client.query(
    `INSERT INTO rendezvous.users(id,display_name) VALUES($1,$2)
     ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name`,
    [actor.userId, actor.displayName],
  );
}

async function lockedTrip(client: Queryable, tripId: string): Promise<TripRow> {
  const result = await client.query<TripRow>(
    `SELECT * FROM rendezvous.trips WHERE id=$1 FOR UPDATE`,
    [tripId],
  );
  if (!result.rows[0]) notFound();
  return result.rows[0];
}

function requireOrganizer(trip: TripRow, actorId: string): void {
  if (trip.organizer_user_id !== actorId)
    throw new ApplicationError(
      "FORBIDDEN",
      403,
      "Organizer capability is required",
    );
}

function requireEditable(trip: TripRow): void {
  if (trip.status === "FINALIZED" || trip.status === "CANCELLED")
    throw new ApplicationError("TRIP_CLOSED", 409, "Trip is closed");
}

async function requireMembership(
  client: Queryable,
  actorId: string,
  tripId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM rendezvous.participants WHERE trip_id=$1 AND user_id=$2`,
    [tripId, actorId],
  );
  if (!result.rowCount) notFound();
}

async function enqueueJob(
  client: Queryable,
  tripId: string,
  revision: number,
): Promise<void> {
  await client.query(
    `INSERT INTO rendezvous.recompute_jobs(id,trip_id,revision,status) VALUES($1,$2,$3,'QUEUED')
     ON CONFLICT(trip_id,revision) DO NOTHING`,
    [randomUUID(), tripId, revision],
  );
  await insertEvent(client, tripId, revision, "computation_started", {});
}

async function insertEvent(
  client: Queryable,
  tripId: string,
  revision: number,
  type: string,
  payload: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO rendezvous.event_outbox(trip_id,revision,type,payload) VALUES($1,$2,$3,$4)`,
    [tripId, revision, type, JSON.stringify(payload)],
  );
}

async function markJob(
  client: Queryable,
  jobId: string,
  status: "SUCCEEDED" | "STALE",
): Promise<void> {
  await client.query(
    `UPDATE rendezvous.recompute_jobs SET status=$2,finished_at=now() WHERE id=$1`,
    [jobId, status],
  );
}

function mapTrip(row: TripRow): Trip {
  return TripSchema.parse({
    id: row.id,
    title: row.title,
    organizerUserId: row.organizer_user_id,
    expectedParticipants: row.expected_participants,
    status: row.status,
    computeStatus: row.compute_status,
    revision: row.revision,
    rankingVersion: row.ranking_version,
    minTogetherMinutes: row.min_together_minutes,
    periodFrom: row.period_from.toISOString(),
    periodTo: row.period_to.toISOString(),
    allowInternational: row.allow_international,
    scoringConfig: row.scoring_config,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapParticipant(row: ParticipantRow): ParticipantPrivate {
  return ParticipantPrivateSchema.parse({
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    displayName: row.display_name,
    originCityId: row.origin_city_id,
    availableFrom: row.available_from?.toISOString() ?? null,
    mustReturnBy: row.must_return_by?.toISOString() ?? null,
    maxBudget:
      row.max_budget_minor === null
        ? null
        : { amount: Number(row.max_budget_minor) / 100, currency: "RUB" },
    forbiddenModes: row.forbidden_modes,
    softPreferences: row.soft_preferences,
    ready: row.ready,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function insertDestinations(
  client: Queryable,
  resultId: string,
  output: SolverOutput,
  destinations: readonly DestinationResultDto[],
): Promise<void> {
  for (const destination of destinations) {
    const destinationId = randomUUID();
    await client.query(
      `INSERT INTO rendezvous.destination_results(id,trip_result_id,city_id,rank,score,component_scores,
         common_time_minutes,valid,degraded,solution_facts,hotels)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        destinationId,
        resultId,
        destination.city.id,
        destination.rank,
        destination.score,
        JSON.stringify(destination.components),
        destination.commonTimeMinutes,
        destination.valid,
        destination.degraded,
        JSON.stringify(destination),
        JSON.stringify(destination.hotels),
      ],
    );
    const solution = output.ranked.find(
      ({ cityId }) => cityId === destination.city.id,
    );
    for (const bundle of solution?.bundles ?? []) {
      const burden = solution!.burdens.find(
        ({ participantId }) => participantId === bundle.participantId,
      );
      await client.query(
        `INSERT INTO rendezvous.route_selections(destination_result_id,participant_id,outbound,return_route,burden)
         VALUES($1,$2,$3,$4,$5)`,
        [
          destinationId,
          bundle.participantId,
          JSON.stringify(bundle.outbound),
          JSON.stringify(bundle.returning),
          JSON.stringify(burden),
        ],
      );
    }
  }
}
