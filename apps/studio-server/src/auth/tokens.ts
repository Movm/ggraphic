// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits, base64url. Used for session cookies, CSRF and invitation tokens. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores instead of a bearer token. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison; false for empty or differently long values. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
