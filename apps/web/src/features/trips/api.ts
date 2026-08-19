import {
  AuthSessionSchema,
  CreateTripResponseSchema,
  InviteTokenResponseSchema,
  TripGroupDtoSchema,
  TripListSchema,
  TripOrganizerDtoSchema,
  TripEventSchema,
} from "@rendezvous/contracts";
import type {
  AuthSession,
  CreateTripInput,
  CreateTripResponse,
  ScoringConfig,
  SetReactionInput,
  TripGroupDto,
  TripOrganizerDto,
  TripPublic,
  UpdatePreferencesInput,
} from "@rendezvous/contracts";
import { telegramInitData } from "../../telegram/bridge.js";

export type TripView = TripGroupDto | TripOrganizerDto;

export interface RendezvousApi {
  listTrips(): Promise<readonly TripPublic[]>;
  getTrip(id: string): Promise<TripView>;
  getInvite(id: string): Promise<{ inviteToken: string; startAppUrl: string }>;
  createTrip(input: CreateTripInput): Promise<CreateTripResponse>;
  joinTrip(inviteToken: string): Promise<TripView>;
  updateMyPreferences(
    id: string,
    input: UpdatePreferencesInput,
  ): Promise<TripView>;
  updateScoring(id: string, input: ScoringConfig): Promise<TripView>;
  setReaction(id: string, input: SetReactionInput): Promise<TripView>;
  setShortlist(id: string, cityIds: readonly string[]): Promise<TripView>;
  finalize(id: string, destinationResultId: string): Promise<TripView>;
  subscribeToTrip?(id: string, onEvent: () => void): () => void;
}

const TripViewSchema = TripOrganizerDtoSchema.or(TripGroupDtoSchema);

export class HttpRendezvousApi implements RendezvousApi {
  #session: AuthSession | undefined;
  #authRequest: Promise<AuthSession> | undefined;
  constructor(
    private readonly baseUrl = "",
    private readonly identity = browserIdentity(),
  ) {}

  async listTrips() {
    return TripListSchema.parse(await this.request("/api/trips"));
  }
  async getTrip(id: string) {
    return TripViewSchema.parse(await this.request(`/api/trips/${id}`));
  }
  async getInvite(id: string) {
    return InviteTokenResponseSchema.parse(
      await this.request(`/api/trips/${id}/invite-token`, { method: "POST" }),
    );
  }
  async createTrip(input: CreateTripInput) {
    return CreateTripResponseSchema.parse(
      await this.request("/api/trips", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  }
  async joinTrip(inviteToken: string) {
    return TripViewSchema.parse(
      await this.request(`/api/invites/${inviteToken}/join`, {
        method: "POST",
      }),
    );
  }
  async updateMyPreferences(id: string, input: UpdatePreferencesInput) {
    return TripViewSchema.parse(
      await this.request(`/api/trips/${id}/me/preferences`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    );
  }
  async updateScoring(id: string, input: ScoringConfig) {
    return TripViewSchema.parse(
      await this.request(`/api/trips/${id}/scoring`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    );
  }
  async setReaction(id: string, input: SetReactionInput) {
    await this.request(`/api/trips/${id}/reactions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return this.getTrip(id);
  }
  async setShortlist(id: string, cityIds: readonly string[]) {
    await this.request(`/api/trips/${id}/shortlist`, {
      method: "PUT",
      body: JSON.stringify({ cityIds }),
    });
    return this.getTrip(id);
  }
  async finalize(id: string, destinationResultId: string) {
    await this.request(`/api/trips/${id}/finalize`, {
      method: "POST",
      body: JSON.stringify({ destinationResultId }),
    });
    return this.getTrip(id);
  }

  subscribeToTrip(id: string, onEvent: () => void): () => void {
    const controller = new AbortController();
    void this.consumeEvents(id, onEvent, controller.signal);
    return () => controller.abort();
  }

  private async consumeEvents(
    id: string,
    onEvent: () => void,
    signal: AbortSignal,
  ): Promise<void> {
    let cursor = 0;
    let failures = 0;
    while (!signal.aborted) {
      try {
        const session = await this.ensureSession();
        const response = await fetch(
          `${this.baseUrl}/api/trips/${id}/events?after=${cursor}`,
          {
            headers: {
              authorization: `Bearer ${session.token}`,
            },
            signal,
          },
        );
        if (response.status === 401) this.#session = undefined;
        if (!response.ok || !response.body)
          throw new Error(`SSE_${response.status}`);
        failures = 0;
        onEvent();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = parseSseFrame(frame);
            if (event) {
              const nextCursor = Number(event.id);
              if (nextCursor > cursor) {
                cursor = nextCursor;
                onEvent();
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (signal.aborted) return;
        failures += 1;
      }
      await new Promise<void>((resolve) => {
        const base = Math.min(15_000, 500 * 2 ** Math.min(failures, 5));
        const timer = setTimeout(resolve, base * (0.75 + Math.random() * 0.5));
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  private async request(
    path: string,
    init: RequestInit = {},
    retryAuthentication = true,
  ): Promise<unknown> {
    const session = await this.ensureSession();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`,
        ...init.headers,
      },
    });
    if (response.status === 401 && retryAuthentication) {
      this.#session = undefined;
      return this.request(path, init, false);
    }
    if (!response.ok) throw new Error(`API_${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }

  private ensureSession(): Promise<AuthSession> {
    if (
      this.#session &&
      Date.parse(this.#session.expiresAt) > Date.now() + 30_000
    )
      return Promise.resolve(this.#session);
    this.#authRequest ??= this.authenticate().finally(() => {
      this.#authRequest = undefined;
    });
    return this.#authRequest;
  }

  private async authenticate(): Promise<AuthSession> {
    const initData = telegramInitData();
    const response = await fetch(
      `${this.baseUrl}${initData ? "/api/auth/telegram" : "/api/auth/dev"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          initData
            ? { initData }
            : { userId: this.identity.id, displayName: this.identity.name },
        ),
      },
    );
    if (!response.ok) throw new Error(`AUTH_${response.status}`);
    this.#session = AuthSessionSchema.parse(await response.json());
    return this.#session;
  }
}

export function parseSseFrame(frame: string) {
  const rawData = /^data:\s*(.+)$/m.exec(frame)?.[1];
  return rawData ? TripEventSchema.parse(JSON.parse(rawData)) : null;
}

function browserIdentity() {
  const key = "rendezvous-test-user-id";
  const id = globalThis.localStorage?.getItem(key) ?? crypto.randomUUID();
  globalThis.localStorage?.setItem(key, id);
  return { id, name: "Пользователь" };
}
