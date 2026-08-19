import type { TripRepository } from "../repositories/trip-repository.js";
import type { createMastraRecomputeWorkflow } from "./recompute.js";

export class RecomputeWorker {
  #timer: ReturnType<typeof setInterval> | undefined;
  #draining: Promise<number> | undefined;

  constructor(
    private readonly repository: Pick<
      TripRepository,
      "claimNextJob" | "failJob"
    >,
    private readonly workflow: ReturnType<typeof createMastraRecomputeWorkflow>,
    private readonly onError: (error: unknown) => void,
  ) {}

  start(intervalMs = 500): void {
    this.#timer ??= setInterval(
      () => void this.drain().catch(this.onError),
      intervalMs,
    );
  }

  async drain(): Promise<number> {
    this.#draining ??= this.#drainAll().finally(() => {
      this.#draining = undefined;
    });
    return this.#draining;
  }

  async close(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    await this.#draining;
  }

  async #drainAll(): Promise<number> {
    let handled = 0;
    for (;;) {
      const job = await this.repository.claimNextJob();
      if (!job) return handled;
      try {
        const run = await this.workflow.createRun({
          runId: `recompute-${job.id}`,
          resourceId: job.tripId,
        });
        const result = await run.start({ inputData: job });
        if (result.status !== "success")
          throw new Error(`WORKFLOW_${result.status.toUpperCase()}`);
      } catch (error) {
        await this.repository.failJob(job, "WORKFLOW_FAILED");
        this.onError(error);
      }
      handled += 1;
    }
  }
}
