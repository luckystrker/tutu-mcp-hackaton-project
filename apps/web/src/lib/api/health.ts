import { ReadinessSchema, type Readiness } from "@rendezvous/contracts";

export async function getReadiness(
  fetcher: typeof fetch = fetch,
): Promise<Readiness> {
  const response = await fetcher("/health/ready", {
    headers: { accept: "application/json" },
  });
  const payload: unknown = await response.json();
  return ReadinessSchema.parse(payload);
}
