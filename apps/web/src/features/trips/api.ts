import {
  CreateTripResponseSchema,
  InviteTokenResponseSchema,
  TripGroupDtoSchema,
  TripListSchema,
  TripOrganizerDtoSchema,
} from "@rendezvous/contracts";
import type {
  CreateTripInput,
  CreateTripResponse,
  ScoringConfig,
  SetReactionInput,
  TripGroupDto,
  TripOrganizerDto,
  TripPublic,
  UpdatePreferencesInput,
} from "@rendezvous/contracts";

export type TripView = TripGroupDto | TripOrganizerDto;

export interface RendezvousApi {
  listTrips(): Promise<readonly TripPublic[]>;
  getTrip(id: string): Promise<TripView>;
  getInviteToken(id: string): Promise<string>;
  createTrip(input: CreateTripInput): Promise<CreateTripResponse>;
  joinTrip(id: string, inviteToken: string): Promise<TripView>;
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
  async getInviteToken(id: string) {
    return InviteTokenResponseSchema.parse(
      await this.request(`/api/trips/${id}/invite-token`, { method: "POST" }),
    ).inviteToken;
  }
  async createTrip(input: CreateTripInput) {
    return CreateTripResponseSchema.parse(
      await this.request("/api/trips", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  }
  async joinTrip(id: string, inviteToken: string) {
    return TripViewSchema.parse(
      await this.request(`/api/trips/${id}/join`, {
        method: "POST",
        body: JSON.stringify({ inviteToken }),
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
    while (!signal.aborted) {
      try {
        const response = await fetch(
          `${this.baseUrl}/api/trips/${id}/events?after=${cursor}`,
          {
            headers: {
              "x-user-id": this.identity.id,
              "x-user-name": encodeURIComponent(this.identity.name),
            },
            signal,
          },
        );
        if (!response.ok || !response.body)
          throw new Error(`SSE_${response.status}`);
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
            const eventId = /^id:\s*(\d+)$/m.exec(frame)?.[1];
            if (eventId) cursor = Number(eventId);
            if (/^data:/m.test(frame)) onEvent();
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_000);
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
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-user-id": this.identity.id,
        "x-user-name": encodeURIComponent(this.identity.name),
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`API_${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }
}

function browserIdentity() {
  const key = "rendezvous-test-user-id";
  const id = globalThis.localStorage?.getItem(key) ?? crypto.randomUUID();
  globalThis.localStorage?.setItem(key, id);
  return { id, name: "Пользователь" };
}
