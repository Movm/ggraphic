// SPDX-License-Identifier: AGPL-3.0-only
import { brandDefault } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { PagePreview } from '@ggraphic/editor/components/PagePreview';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { type FullCanvasConfig } from '@ggraphic/editor/configs/types';
import { render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { describe, expect, it } from 'vitest';

import { catalogTemplate } from '../editor/templates/catalog';
import { FREE_PAGE_CONFIG_ID } from '../editor/templates/ids';
import { templatePageState } from '../editor/templates/instantiate';
import { registerEditor } from '../registerEditor';

/**
 * Every empty photo slot of a template draws a placeholder (a `.export-hidden` group) on the page the
 * render gate draws. The panel's goldens predate the placeholder yet the gate passed: the fill is a
 * 12 % mix, below Playwright's per-pixel threshold, so the golden comparison cannot see it.
 *
 * The count is of what the render gate draws for a template: the page through `PagePreview`, as `gate/main.tsx` does. */
async function drawn(id: string) {
  const brand = brandDefault;
  registerBrandPacks([brand]);
  registerEditor();
  const config = (await loadCanvasConfig(FREE_PAGE_CONFIG_ID)) as FullCanvasConfig;
  const state = templatePageState(catalogTemplate(id)!, 'post-portrait', {
    schemeId: 'primary',
    brand,
  })!;
  let done = false;
  render(
    <PagePreview
      config={config}
      state={state}
      formatId="post-portrait"
      width={1080}
      onRendered={() => (done = true)}
      onFailed={() => (done = true)}
    />
  );
  await waitFor(() => expect(done).toBe(true), { timeout: 10_000 });
  const stage = Konva.stages[Konva.stages.length - 1]!;
  return stage.find('.export-hidden').length;
}

describe('empty photo slots', () => {
  it('the countdown draws one placeholder', async () => {
    expect(await drawn('studio-event-countdown')).toBe(1);
  });
  it('the panel draws three placeholders', async () => {
    expect(await drawn('studio-event-panel')).toBe(3);
  });
});
