// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nextHistoryStamp, routeHistory } from './historyStamp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('nextHistoryStamp', () => {
  it('never hands out the same stamp twice, even within one millisecond', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30));
    const first = nextHistoryStamp();
    const second = nextHistoryStamp();
    const third = nextHistoryStamp();
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('stays strictly increasing when the clock steps back', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12));
    const before = nextHistoryStamp();
    vi.setSystemTime(new Date(2026, 9, 30, 11));
    expect(nextHistoryStamp()).toBeGreaterThan(before);
  });

  it('follows the clock once it moves on', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30));
    const before = nextHistoryStamp();
    vi.setSystemTime(new Date(2026, 9, 31));
    expect(nextHistoryStamp()).toBe(new Date(2026, 9, 31).getTime());
    expect(before).toBeLessThan(new Date(2026, 9, 31).getTime());
  });
});

describe('routeHistory', () => {
  const none = { undo: null, redo: null };

  it('has nothing to route without a step in either history', () => {
    expect(routeHistory('undo', none, none)).toBeNull();
    expect(routeHistory('redo', none, none)).toBeNull();
    expect(routeHistory('undo', null, none)).toBeNull();
  });

  it('goes to the only history that has a step', () => {
    expect(routeHistory('undo', { undo: 1, redo: null }, none)).toBe('page');
    expect(routeHistory('undo', null, { undo: 1, redo: null })).toBe('pageOps');
    expect(routeHistory('redo', { undo: null, redo: 1 }, none)).toBe('page');
    expect(routeHistory('redo', none, { undo: null, redo: 1 })).toBe('pageOps');
  });

  it('undoes the newer of the two steps', () => {
    expect(routeHistory('undo', { undo: 5, redo: null }, { undo: 3, redo: null })).toBe('page');
    expect(routeHistory('undo', { undo: 3, redo: null }, { undo: 5, redo: null })).toBe('pageOps');
  });

  it('redoes the older of the two undone steps', () => {
    expect(routeHistory('redo', { undo: null, redo: 3 }, { undo: null, redo: 5 })).toBe('page');
    expect(routeHistory('redo', { undo: null, redo: 5 }, { undo: null, redo: 3 })).toBe('pageOps');
  });

  it('reads Undo from the undo stamps and Redo from the redo stamps only', () => {
    const page = { undo: 9, redo: 1 };
    const pageOps = { undo: 2, redo: 7 };
    expect(routeHistory('undo', page, pageOps)).toBe('page');
    expect(routeHistory('redo', page, pageOps)).toBe('page');
  });
});
