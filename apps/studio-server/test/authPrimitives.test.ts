// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { parseCookies, sessionCookie } from '../src/auth/cookies.ts';
import { hashPassword, verifyPassword } from '../src/auth/passwords.ts';
import { FixedWindowLimiter } from '../src/auth/rateLimit.ts';
import { randomToken, sha256, safeEqual } from '../src/auth/tokens.ts';

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false);
  });

  it('treats a malformed hash as a failed verification', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('tokens', () => {
  it('makes 256-bit url-safe tokens and stable hashes', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
    expect(sha256(a)).toBe(sha256(a));
    expect(sha256(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compares in constant time and tolerates different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('cookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('a=1; b=x%20y;c=;  d = 4 ')).toEqual({ a: '1', b: 'x y', c: '', d: '4' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('broken; =x; e=%E0%A4%A')).toEqual({ e: '%E0%A4%A' });
  });

  it('names and flags the session cookie by the secure switch', () => {
    const secure = sessionCookie(true);
    expect(secure.name).toBe('__Host-studio_session');
    expect(secure.serialize('tok', 60)).toBe(
      '__Host-studio_session=tok; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure'
    );
    const plain = sessionCookie(false);
    expect(plain.name).toBe('studio_session');
    expect(plain.clear()).toBe('studio_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  });
});

describe('FixedWindowLimiter', () => {
  it('blocks after the limit within a window and resets after it', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect(limiter.check('k')).toBeNull();
    limiter.hit('k');
    limiter.hit('k');
    expect(limiter.check('k')).toBe(1);
    expect(limiter.check('other')).toBeNull();
    now = 999;
    expect(limiter.check('k')).toBe(1);
    now = 1000;
    expect(limiter.check('k')).toBeNull();
  });

  it('reset forgets a key', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    limiter.hit('k');
    expect(limiter.check('k')).not.toBeNull();
    limiter.reset('k');
    expect(limiter.check('k')).toBeNull();
  });

  it('keeps memory bounded by sweeping expired windows', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 10, now: () => now });
    for (let i = 0; i < 100; i++) limiter.hit(`k${i}`);
    now = 20;
    limiter.hit('fresh');
    expect(limiter.size).toBe(1);
  });
});
