// SPDX-License-Identifier: MPL-2.0
/**
 * The shell warms the lazy sections of its config's tabs while idle (`usePreloadSections`), so
 * the first open of Elements or Tools does not suspend. Here the whole path runs: config, shell.
 */
import { act, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerBrandPacks } from '../../brand/brandRegistry.js';
import { makeSectionDefiner } from '../../configs/factory/defineSection.js';
import { AssetsSection, ToolsSection } from '../../sidebar/sections/index.js';
import { registerTemplates } from '../../templates/registry.js';
import {
  brandTestConfig,
  type BrandTestActions,
  type BrandTestState,
} from '../../testing/documentBrandConfig.js';
import { PACK_A } from '../../testing/documentBrandPacks.js';

import { CanvasEditorShell } from './CanvasEditorShell.js';

vi.mock('../../sidebar/UserUploadsProvider.js', () => ({
  useOptionalUserUploads: () => null,
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);
// jsdom has no idle callback; run it on the next task instead of after whenIdle's 2 s fallback.
vi.stubGlobal('requestIdleCallback', (fn: () => void) => setTimeout(fn, 0));
vi.stubGlobal('cancelIdleCallback', (handle: number) => clearTimeout(handle));

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

const section = makeSectionDefiner<BrandTestState, BrandTestActions>();

beforeAll(() => {
  registerBrandPacks([PACK_A]);
  const base = brandTestConfig('shell-panels');
  registerTemplates({
    id: 'shell-panels',
    load: () =>
      Promise.resolve({
        ...base,
        tabs: [
          ...base.tabs,
          { id: 'elements', icon: () => null, label: 'Elements', ariaLabel: 'Elements' },
          { id: 'tools', icon: () => null, label: 'Tools', ariaLabel: 'Tools' },
        ],
        sections: {
          ...base.sections,
          elements: section({ component: AssetsSection, propsFactory: () => ({}) }),
          tools: section({ component: ToolsSection, propsFactory: () => ({}) }),
        },
      }) as never,
  });
});

describe('the editor shell', () => {
  it('preloads the Elements and Tools sections of its config while idle', async () => {
    const elements = vi.spyOn(AssetsSection, 'preload');
    const tools = vi.spyOn(ToolsSection, 'preload');
    await act(async () => {
      render(
        <CanvasEditorShell
          initialConfigId="shell-panels"
          initialProps={{}}
          onExport={() => {}}
          onCancel={() => {}}
          initialTab="text"
        />
      );
    });
    await waitFor(
      () => {
        expect(elements).toHaveBeenCalled();
        expect(tools).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });
});
