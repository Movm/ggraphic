// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it, vi } from 'vitest';

/**
 * The data entries load without React and Konva: a module of the entry that imports React,
 * React DOM, Konva, react-konva or a package that renders with React (icons, React Query, the
 * React bindings of zustand, …), directly or through another module, fails the import here.
 *
 * Mocking the packages that depend on React matters: they are not inlined, so they would load the
 * real React past the mocks below. Each id is the exact specifier the source imports.
 *
 * Where a data module needs a React part (a sidebar section, a tab icon, a hook), it names it in a
 * React-free module and the UI provides it: `i18n/catalogue`, `utils/fontGeneration`,
 * `utils/fontSpecs`, `utils/framePresets`, `sidebar/coreSidebar`, `canvasIcons.onIconSetLoaded`.
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
vi.mock('react-dom/client', forbidden('react-dom/client'));
vi.mock('react-icons', forbidden('react-icons'));
vi.mock('react-icons/pi', forbidden('react-icons/pi'));
vi.mock('react-icons/hi', forbidden('react-icons/hi'));
vi.mock('react-icons/hi2', forbidden('react-icons/hi2'));
vi.mock('react-icons/io5', forbidden('react-icons/io5'));
vi.mock('react-icons/md', forbidden('react-icons/md'));
vi.mock('react-icons/fi', forbidden('react-icons/fi'));
vi.mock('@iconify/react', forbidden('@iconify/react'));
vi.mock('@tanstack/react-query', forbidden('@tanstack/react-query'));
vi.mock('zustand', forbidden('zustand'));
vi.mock('zustand/shallow', forbidden('zustand/shallow'));
vi.mock('zustand/middleware', forbidden('zustand/middleware'));
vi.mock('zustand/middleware/immer', forbidden('zustand/middleware/immer'));
vi.mock('use-image', forbidden('use-image'));
vi.mock('react-kawaii', forbidden('react-kawaii'));

describe('data entries without React or Konva', () => {
  it.each([
    ['page', () => import('./page.js')],
    ['elements', () => import('./elements.js')],
    ['templates', () => import('./templates.js')],
    ['text', () => import('./text.js')],
    ['config', () => import('./config.js')],
    // A host's start-up code may run in a server component, where `createContext` is missing (#136).
    ['host', () => import('./host.js')],
  ])('%s loads', async (_name, load) => {
    expect(Object.keys(await load()).length).toBeGreaterThan(0);
  });
});
