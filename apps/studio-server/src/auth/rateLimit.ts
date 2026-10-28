// SPDX-License-Identifier: AGPL-3.0-only

interface Window {
  count: number;
  resetAt: number;
}

export interface LimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

/**
 * Counts events per key in fixed windows, in process memory. One process, one count:
 * several Studio processes behind a balancer each allow `limit` (see the design note).
 */
export class FixedWindowLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  #nextSweep = 0;

  constructor({ limit, windowMs, now = Date.now }: LimiterOptions) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  /** Seconds until the key may try again, or null when it is under the limit. */
  check(key: string): number | null {
    const window = this.#live(key);
    if (!window || window.count < this.#limit) return null;
    return Math.max(1, Math.ceil((window.resetAt - this.#now()) / 1000));
  }

  hit(key: string): void {
    this.#sweep();
    const window = this.#live(key);
    if (window) window.count++;
    else this.#windows.set(key, { count: 1, resetAt: this.#now() + this.#windowMs });
  }

  reset(key: string): void {
    this.#windows.delete(key);
  }

  get size(): number {
    return this.#windows.size;
  }

  #live(key: string): Window | null {
    const window = this.#windows.get(key);
    if (!window) return null;
    if (window.resetAt <= this.#now()) {
      this.#windows.delete(key);
      return null;
    }
    return window;
  }

  #sweep(): void {
    const now = this.#now();
    if (now < this.#nextSweep) return;
    this.#nextSweep = now + this.#windowMs;
    for (const [key, window] of this.#windows) {
      if (window.resetAt <= now) this.#windows.delete(key);
    }
  }
}
