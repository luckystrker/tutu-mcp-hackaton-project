export class ConcurrencyLimiter {
  readonly #limit: number;
  #active = 0;
  readonly #queue: Array<() => void> = [];

  constructor(limit = 6) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new RangeError("Concurrency limit must be a positive integer");
    this.#limit = limit;
  }

  get active(): number {
    return this.#active;
  }

  get pending(): number {
    return this.#queue.length;
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.#acquire(signal);
    try {
      signal?.throwIfAborted();
      return await task();
    } finally {
      this.#release();
    }
  }

  async #acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.#active < this.#limit) {
      this.#active += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal?.removeEventListener("abort", abort);
        this.#active += 1;
        resolve();
      };
      const abort = () => {
        const index = this.#queue.indexOf(resume);
        if (index >= 0) this.#queue.splice(index, 1);
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.#queue.push(resume);
    });
  }

  #release(): void {
    this.#active -= 1;
    this.#queue.shift()?.();
  }
}
