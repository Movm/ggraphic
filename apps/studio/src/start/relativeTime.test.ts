// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { relativeTime } from './relativeTime';

const NOW = new Date('2026-10-28T12:00:00.000Z');

describe('relativeTime', () => {
  it('picks the coarsest unit that fits', () => {
    expect(relativeTime('2026-10-28T11:59:40.000Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-28T11:15:00.000Z', NOW)).toBe('45 minutes ago');
    expect(relativeTime('2026-10-28T10:00:00.000Z', NOW)).toBe('2 hours ago');
    expect(relativeTime('2026-10-27T11:00:00.000Z', NOW)).toBe('yesterday');
    expect(relativeTime('2026-10-25T12:00:00.000Z', NOW)).toBe('3 days ago');
    expect(relativeTime('2026-10-14T12:00:00.000Z', NOW)).toBe('2 weeks ago');
    expect(relativeTime('2026-07-28T12:00:00.000Z', NOW)).toBe('3 months ago');
  });

  it('returns nothing for an unreadable date', () => {
    expect(relativeTime('soon', NOW)).toBe('');
  });
});
