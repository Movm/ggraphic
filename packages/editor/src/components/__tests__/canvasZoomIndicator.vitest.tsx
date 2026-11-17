// SPDX-License-Identifier: AGPL-3.0-only
import { CanvasZoomIndicator } from '../CanvasMetaBar.js';
import { CanvasEditorLayout } from '../../entries/shell.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The phone had no zoom display at all (#4387): the desktop bar with the
 * percentage and buttons is not rendered there. The pill shows the zoom as
 * soon as it is not 100 %, and resets it on tap.
 */
describe('CanvasZoomIndicator', () => {
  it('stays invisible at 100 %, even when a pinch rests just off it', () => {
    for (const zoom of [1, 0.9981, 1.0042]) {
      const { container, unmount } = render(
        <CanvasZoomIndicator zoom={zoom} onZoomChange={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it('shows the zoom and resets it to 100 %', () => {
    const onZoomChange = vi.fn();
    render(<CanvasZoomIndicator zoom={1.4999} onZoomChange={onZoomChange} />);
    const button = screen.getByRole('button', { name: 'Zoom auf 100 % zurücksetzen' });
    expect(button.textContent).toContain('150%');
    // 36 px visible, hit area via ::after 4 px all round → 44 px
    expect(button.className).toContain('after:-inset-1');
    fireEvent.click(button);
    expect(onZoomChange).toHaveBeenCalledWith(1);
  });

  it('sits in the layout outside the scrolling area', () => {
    const { container } = render(
      <CanvasEditorLayout
        actions={null}
        mobileZoomControl={<CanvasZoomIndicator zoom={1.5} onZoomChange={vi.fn()} />}
      >
        <div />
      </CanvasEditorLayout>
    );
    const button = screen.getByRole('button', { name: 'Zoom auf 100 % zurücksetzen' });
    expect(container.querySelector('.canvas-editor-layout__main')?.contains(button)).toBe(false);
  });
});
