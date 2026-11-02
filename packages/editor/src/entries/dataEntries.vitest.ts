// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

describe('data entries without a DOM', () => {
  it.each([
    ['page', () => import('./page.js')],
    ['elements', () => import('./elements.js')],
    ['templates', () => import('./templates.js')],
    ['text', () => import('./text.js')],
    ['config', () => import('./config.js')],
  ])('%s loads in Node', async (_name, load) => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(Object.keys(await load()).length).toBeGreaterThan(0);
  });
});
