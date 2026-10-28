// SPDX-License-Identifier: AGPL-3.0-only
import argon2 from 'argon2';
import { Semaphore } from './semaphore.ts';

// OWASP's minimum for argon2id: 19 MiB, two passes, one lane. Light enough for small hosts,
// and login attempts are rate limited, which bounds the memory a flood can claim.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;
// argon2 accepts any length; the cap keeps one request from hashing megabytes.
export const PASSWORD_MAX = 256;

/** Four hashes at once (≈ 76 MiB), 64 waiting; more answers 503 instead of piling up. */
export const hashSlots = new Semaphore(4, 64);

export function hashPassword(password: string): Promise<string> {
  return hashSlots.run(() => argon2.hash(password, OPTIONS));
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return hashSlots.run(async () => {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  });
}

let dummy: Promise<string> | null = null;

/**
 * Runs one verification against a fixed hash. Called for unknown emails, so the
 * response time of a failed login does not tell whether the account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummy ??= hashPassword('dummy password that never matches');
  await verifyPassword(await dummy, password);
}
