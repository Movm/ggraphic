// SPDX-License-Identifier: AGPL-3.0-only
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(jestDomMatchers);
expect.extend(axeMatchers);
afterEach(cleanup);

// jsdom has no 2D canvas; Konva needs one to build a stage. @napi-rs/canvas
// rasterises for real; nothing here checks pixels, only that the stage exists.
const napi = await import('@napi-rs/canvas');
const contexts = new WeakMap<HTMLCanvasElement, unknown>();
const backings = new WeakMap<HTMLCanvasElement, unknown>();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: string,
  ...rest: unknown[]
) {
  if (contextId !== '2d') {
    return (originalGetContext as (...args: unknown[]) => unknown).call(this, contextId, ...rest);
  }
  let context = contexts.get(this);
  if (!context) {
    const backing = napi.createCanvas(this.width || 1, this.height || 1);
    backings.set(this, backing);
    const ctx = backing.getContext('2d');
    // Konva composites layers (thumbnails, exports) by drawing one canvas element onto
    // another; @napi-rs/canvas only takes its own canvases, so hand it the backing one.
    const drawImage = ctx.drawImage.bind(ctx) as (...args: unknown[]) => void;
    (ctx as unknown as { drawImage: (...args: unknown[]) => void }).drawImage = (
      source: unknown,
      ...args: unknown[]
    ) => {
      if (source instanceof HTMLCanvasElement) {
        const inner = backings.get(source);
        if (!inner) return;
        drawImage(inner, ...args);
        return;
      }
      if (source instanceof HTMLImageElement) return;
      drawImage(source, ...args);
    };
    context = ctx;
    contexts.set(this, context);
  }
  return context;
} as HTMLCanvasElement['getContext'];

// jsdom does no layout: no ResizeObserver, no client rects, no matchMedia.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
const emptyRects = () => Object.assign([] as unknown as DOMRectList, { item: () => null });
Range.prototype.getClientRects ??= emptyRects;
Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
Element.prototype.getClientRects ??= emptyRects;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// jsdom has no FontFaceSet; the editor waits for its fonts through it. Every font counts as loaded.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      check: () => true,
      load: () => Promise.resolve([]),
      ready: Promise.resolve(),
      status: 'loaded',
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
}
