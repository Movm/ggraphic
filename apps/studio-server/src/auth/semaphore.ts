// SPDX-License-Identifier: AGPL-3.0-only
import { HttpError } from '../http.ts';

/**
 * Runs at most `limit` tasks at once and queues up to `maxQueue` more; beyond that it
 * answers 503 at once. Bounds the memory and CPU that password hashing can claim.
 */
export class Semaphore {
  #running = 0;
  readonly #queue: (() => void)[] = [];

  readonly limit: number;
  readonly maxQueue: number;

  constructor(limit: number, maxQueue: number) {
    this.limit = limit;
    this.maxQueue = maxQueue;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#running >= this.limit) {
      if (this.#queue.length >= this.maxQueue) {
        throw new HttpError(503, {
          error: 'busy',
          message: 'The server is busy. Try again in a moment.',
        });
      }
      await new Promise<void>((resolve) => this.#queue.push(resolve));
    } else {
      this.#running++;
    }
    try {
      return await task();
    } finally {
      const next = this.#queue.shift();
      // The slot passes straight to the next waiter; otherwise it is freed.
      if (next) next();
      else this.#running--;
    }
  }
}
