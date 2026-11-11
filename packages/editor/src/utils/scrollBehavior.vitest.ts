// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment jsdom
import { scrollBehavior } from './scrollBehavior.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

function mockMedia(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce') }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.reduceMotion;
});

describe('scrollBehavior', () => {
  it('is smooth by default', () => {
    mockMedia(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('is auto when the system asks for reduced motion', () => {
    mockMedia(true);
    expect(scrollBehavior()).toBe('auto');
  });

  it('is auto when the editor switch is on', () => {
    mockMedia(false);
    document.documentElement.dataset.reduceMotion = 'true';
    expect(scrollBehavior()).toBe('auto');
  });
});
