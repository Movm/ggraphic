// SPDX-License-Identifier: MPL-2.0
import { brandDefault } from '@ggraphic/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('@ggraphic/editor/embed on a server', () => {
  it('imports without a browser and renders nothing there', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    const { GgraphicEditor } = await import('./index.js');
    const { templatePackFromJson } = await import('../page/templatePack.js');
    const html = renderToString(
      createElement(GgraphicEditor, { brand: brandDefault, templates: templatePackFromJson([]) })
    );
    expect(html).toBe('');
  });
});
