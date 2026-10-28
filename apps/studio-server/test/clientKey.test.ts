// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { clientKey } from '../src/auth/clientKey.ts';
import { Semaphore } from '../src/auth/semaphore.ts';
import { HttpError } from '../src/http.ts';

describe('clientKey', () => {
  it('keys IPv4 by address', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('keys IPv6 by its /64, so one host cannot rotate through its prefix', () => {
    const a = clientKey('2001:db8:1:2:aaaa::1');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe(a);
    expect(clientKey('2001:db8:1:3::1')).not.toBe(a);
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
    expect(clientKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('falls back to a fixed key', () => {
    expect(clientKey(undefined)).toBe('unknown');
    expect(clientKey('garbage')).toBe('unknown');
  });
});

describe('Semaphore', () => {
  it('runs at most `limit` tasks and queues the rest', async () => {
    const sem = new Semaphore(2, 2);
    let running = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const task = () =>
      sem.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => releases.push(r));
        running--;
      });
    const all = [task(), task(), task(), task()];
    await Promise.resolve();
    expect(peak).toBe(2);
    while (releases.length) {
      releases.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(all);
    expect(peak).toBe(2);
  });

  it('rejects with 503 when the queue is full', async () => {
    const sem = new Semaphore(1, 1);
    let release!: () => void;
    const first = sem.run(() => new Promise<void>((r) => (release = r)));
    const queued = sem.run(() => Promise.resolve('queued'));
    const err = await sem.run(() => Promise.resolve()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
    release();
    await first;
    expect(await queued).toBe('queued');
  });

  it('frees the slot when a task throws', async () => {
    const sem = new Semaphore(1, 0);
    await expect(sem.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await sem.run(() => Promise.resolve(1))).toBe(1);
  });
});
