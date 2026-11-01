// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it, vi } from 'vitest';

/**
 * The data entries should load without React and Konva: a module of the entry that imports React,
 * React DOM, Konva or react-konva, directly or through another module, fails the import here.
 *
 * None does yet. The modules that pull them in:
 * - `i18n/messages` (`useMessages`): page, elements, templates, config;
 * - `utils/textUtils` → `hooks/useFontGeneration`: all five;
 * - `sidebar/sections/index`, through `page/config` and `configs/shareSection`: page, config;
 * - `utils/imageFilters` (Konva filters): elements;
 * - `configs/configLoader` → `hooks/useFontLoader`: config.
 *
 * `it.fails` records the gap: once an entry is free of them, its case fails here and moves to `it`.
 */
const { forbidden } = vi.hoisted(() => ({
  forbidden: (name: string) => () => {
    throw new Error(`a data entry loaded ${name}`);
  },
}));
vi.mock('react', forbidden('react'));
vi.mock('react-dom', forbidden('react-dom'));
vi.mock('react/jsx-runtime', forbidden('react/jsx-runtime'));
vi.mock('konva', forbidden('konva'));
vi.mock('react-konva', forbidden('react-konva'));

describe('data entries without React or Konva', () => {
  it.fails.each([
    ['page', () => import('./page.js')],
    ['elements', () => import('./elements.js')],
    ['templates', () => import('./templates.js')],
    ['text', () => import('./text.js')],
    ['config', () => import('./config.js')],
  ])('%s loads', async (_name, load) => {
    expect(Object.keys(await load()).length).toBeGreaterThan(0);
  });
});
