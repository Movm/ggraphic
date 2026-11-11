// SPDX-License-Identifier: AGPL-3.0-only
import { horizontalAnchorScroll, useZoomGestures } from '../useZoomGestures.js';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * On mobile the page container scales from its top left (#4387): zoomed in it
 * only overhangs to the right, where the column can scroll; centred, the left
 * half of the overhang was out of reach. To keep the point under the fingers
 * the gesture scrolls horizontally as well; while the pages are narrower than
 * the column, canvas-editor.css centres them via
 * translateX(max(0, (1 − s) · 50 %)), and the calculation accounts for that.
 */

/** Screen x of a content point at scale s (scroll 0, column width w). */
const screenX = (contentX: number, s: number, w: number) =>
  Math.max(0, ((1 - s) * w) / 2) + contentX * s;

describe('horizontalAnchorScroll', () => {
  it('holds a point when zooming in past 100 %', () => {
    const w = 390;
    const before = screenX(300, 1, w);
    const dx = horizontalAnchorScroll(before, w, 1, 1.5);
    expect(screenX(300, 1.5, w) - dx).toBeCloseTo(before, 6);
  });

  it('accounts for the centring below 100 %', () => {
    const w = 400;
    const before = screenX(100, 0.5, w);
    const dx = horizontalAnchorScroll(before - Math.max(0, (1 - 0.5) * w * 0.5), w, 0.5, 1.2);
    expect(screenX(100, 1.2, w) - dx).toBeCloseTo(before, 6);
  });

  it('does not scroll while the pages stay narrower than the column and the point is the centre', () => {
    expect(horizontalAnchorScroll(100, 400, 0.5, 0.8)).toBeCloseTo(0, 6);
  });
});

describe('useZoomGestures: horizontal anchor', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function mount() {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as typeof scroller.scrollBy;
    const area = document.createElement('div');
    area.className = 'canvas-editor-layout__canvas';
    const container = document.createElement('div');
    container.style.setProperty('--canvas-zoom', '1');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0 } as DOMRect);
    Object.defineProperty(container, 'offsetWidth', { value: 390 });
    area.appendChild(container);
    scroller.appendChild(area);
    document.body.appendChild(scroller);
    return { container, scrollBy };
  }

  function zoomIn(container: HTMLElement) {
    container.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX: 300,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      })
    );
    vi.advanceTimersToNextFrame();
  }

  it('scrolls horizontally on mobile (origin left)', () => {
    vi.useFakeTimers();
    const { container, scrollBy } = mount();
    renderHook(() => useZoomGestures(container, vi.fn(), { leftOrigin: true }));
    zoomIn(container);
    expect(scrollBy.mock.calls[0]?.[0]).toBeCloseTo(300 * (Math.exp(0.2) - 1), 5);
  });

  it('leaves the centred desktop container alone horizontally', () => {
    vi.useFakeTimers();
    const { container, scrollBy } = mount();
    renderHook(() => useZoomGestures(container, vi.fn()));
    zoomIn(container);
    expect(scrollBy.mock.calls[0]?.[0]).toBe(0);
  });
});
