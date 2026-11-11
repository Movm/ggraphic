// SPDX-License-Identifier: AGPL-3.0-only
import { useZoomGestures } from '../useZoomGestures.js';
import { renderHook } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mouse wheel over the canvas: scrolls normally, zooms with Ctrl/Cmd, and
 * does neither while an element is being dragged (the page would run away
 * under the pointer).
 *
 * The hook takes the element, not a ref: the editor first renders a loading
 * indicator, and an effect on a ref never ran again once the container was
 * mounted, which left pinch and Ctrl+wheel dead.
 *
 * During the gesture the scale follows directly through `--canvas-zoom` (no
 * CSS transition trailing behind); React state only follows once the gesture
 * rests, otherwise the whole editor shell would render on every wheel event.
 */

function mountContainer() {
  const area = document.createElement('div');
  area.className = 'canvas-editor-layout__canvas';
  const container = document.createElement('div');
  area.appendChild(container);
  document.body.appendChild(area);
  return container;
}

function wheel(target: HTMLElement, ctrlKey = false) {
  const e = new WheelEvent('wheel', { deltaY: 100, ctrlKey, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('useZoomGestures: mouse wheel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrolls without dragging, zooms with Ctrl and blocks both while dragging', () => {
    const container = mountContainer();
    const onZoom = vi.fn();
    renderHook(() => useZoomGestures(container, onZoom));

    expect(wheel(container)).toBe(false);
    expect(wheel(container, true)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);

    vi.spyOn(Konva, 'isDragging').mockReturnValue(true);
    expect(wheel(container)).toBe(true);
    expect(wheel(container, true)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it('attaches when the container only appears after loading', () => {
    const onZoom = vi.fn();
    const { rerender } = renderHook(({ el }) => useZoomGestures(el, onZoom), {
      initialProps: { el: null as HTMLElement | null },
    });
    const container = mountContainer();
    rerender({ el: container });

    expect(wheel(container, true)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it('scales live during the gesture and reports the final value once it rests', () => {
    const container = mountContainer();
    container.style.setProperty('--canvas-zoom', '1');
    const onZoom = vi.fn();
    renderHook(() => useZoomGestures(container, onZoom));

    wheel(container, true);
    wheel(container, true);
    wheel(container, true);
    expect(container.hasAttribute('data-zooming')).toBe(true);
    vi.advanceTimersToNextFrame();
    const live = parseFloat(container.style.getPropertyValue('--canvas-zoom'));
    expect(live).toBeCloseTo(Math.exp(-0.6), 5);
    expect(onZoom).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]?.[0]).toBeCloseTo(live, 5);
    expect(container.hasAttribute('data-zooming')).toBe(false);
  });

  it('keeps the point under the pointer by scrolling the scroll container along', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as typeof scroller.scrollBy;
    const area = document.createElement('div');
    area.className = 'canvas-editor-layout__canvas';
    const container = document.createElement('div');
    container.style.setProperty('--canvas-zoom', '1');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    area.appendChild(container);
    scroller.appendChild(area);
    document.body.appendChild(scroller);
    renderHook(() => useZoomGestures(container, vi.fn()));

    container.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    );
    vi.advanceTimersToNextFrame();

    // 200 px below the top edge, zoom 1 → e^0.2: the point shifts by 200·(z−1).
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]?.[1]).toBeCloseTo(200 * (Math.exp(0.2) - 1), 5);
  });

  it('keeps a double-click reset when a wheel zoom is still settling', () => {
    const container = mountContainer();
    const onZoom = vi.fn();
    renderHook(() => useZoomGestures(container, onZoom));

    wheel(container, true);
    container.parentElement!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    vi.advanceTimersByTime(500);

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom).toHaveBeenLastCalledWith(1);
    expect(container.style.getPropertyValue('--canvas-zoom')).toBe('1');
  });
});
