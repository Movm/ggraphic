// SPDX-License-Identifier: AGPL-3.0-only
/**
 * With the panel open, the bottom bar ("+ Seite hinzufügen", zoom) lay over
 * the panel's bottom edge and thus over the chat composer (#4274).
 */
import { CanvasEditorLayout } from '../../entries/shell.js';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('CanvasEditorLayout bottom bar', () => {
  it('is inset by the width of the open panel', () => {
    const { container } = render(
      <CanvasEditorLayout
        actions={null}
        tabBar={<div />}
        sidebar={<div />}
        bottomBar={<button type="button">Seite hinzufügen</button>}
      >
        <div />
      </CanvasEditorLayout>
    );
    const bar = container.querySelector('.canvas-editor-layout__bottom-bar');
    // Positioned inside the editor's root since ggraphic alpha.2 (#105): no host inset any more.
    expect(bar?.className).toContain(
      'left-[calc(var(--image-studio-tab-bar-width)_+_var(--canvas-panel-width,0px))]'
    );
    expect(bar?.className).toContain('transition-[left]');
  });
});
