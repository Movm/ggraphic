// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The load state of one image element, through the real `use-image`: a new
 * source must read as pending in the very render that brings it, or a host
 * polling between that render and the hook's next update reads a complete
 * canvas that is still loading. `use-image` resets its status during render
 * when the url changes; this pins that down.
 */
import { act, render } from '@testing-library/react';
import React from 'react';
import useImage from 'use-image';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImageRetryContext,
  PendingImagesContext,
  useImageRetry,
  useTrackPendingImage,
  type ImageLoads,
} from './pendingImages.js';

/** `<img>` elements `use-image` creates; the test fires their events. */
const created: HTMLImageElement[] = [];

beforeEach(() => {
  created.length = 0;
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: unknown) => {
    const el = original(tag, options as ElementCreationOptions);
    if (tag === 'img') {
      (el as HTMLImageElement).decode = () => Promise.resolve();
      created.push(el as HTMLImageElement);
    }
    return el;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Photo({ url }: { url: string }) {
  const retry = useImageRetry('photo');
  return <Loader key={retry} url={url} />;
}

function Loader({ url }: { url: string }) {
  const [, status] = useImage(url, 'anonymous');
  useTrackPendingImage('photo', url, status);
  return null;
}

const newLoads = (): ImageLoads => ({ pending: new Set(), failed: new Set() });
const state = (loads: ImageLoads) => ({ pending: loads.pending.size, failed: loads.failed.size });

function mount(url: string, retries: ReadonlyMap<string, number> = new Map()) {
  const loads = newLoads();
  const tree = (u: string, r: ReadonlyMap<string, number>) => (
    <PendingImagesContext.Provider value={loads}>
      <ImageRetryContext.Provider value={r}>
        <Photo url={u} />
      </ImageRetryContext.Provider>
    </PendingImagesContext.Provider>
  );
  const view = render(tree(url, retries));
  return { loads, rerender: (u: string, r = retries) => view.rerender(tree(u, r)), view };
}

const fire = async (img: HTMLImageElement, type: 'load' | 'error') => {
  await act(async () => {
    img.dispatchEvent(new Event(type));
  });
};

describe('useTrackPendingImage with use-image', () => {
  it('reads a new source as pending in the render that brings it', async () => {
    const { loads, rerender } = mount('https://example.org/a.jpg');
    await fire(created.at(-1)!, 'load');
    expect(state(loads)).toEqual({ pending: 0, failed: 0 });

    rerender('https://example.org/b.jpg');
    expect(state(loads)).toEqual({ pending: 1, failed: 0 });

    await fire(created.at(-1)!, 'load');
    expect(state(loads)).toEqual({ pending: 0, failed: 0 });
  });

  it('forgets an element removed while it loads', () => {
    const { loads, view } = mount('https://example.org/a.jpg');
    expect(state(loads)).toEqual({ pending: 1, failed: 0 });
    view.unmount();
    expect(state(loads)).toEqual({ pending: 0, failed: 0 });
  });

  it('forgets an element removed after it failed', async () => {
    const { loads, view } = mount('https://example.org/a.jpg');
    await fire(created.at(-1)!, 'error');
    expect(state(loads)).toEqual({ pending: 0, failed: 1 });
    view.unmount();
    expect(state(loads)).toEqual({ pending: 0, failed: 0 });
  });

  it('loads a failed image again when its retry generation moves on', async () => {
    const url = 'https://example.org/a.jpg';
    const { loads, rerender } = mount(url);
    await fire(created.at(-1)!, 'error');
    expect(state(loads)).toEqual({ pending: 0, failed: 1 });
    const attempts = created.length;

    rerender(url, new Map([['photo', 1]]));
    expect(created.length).toBe(attempts + 1);
    expect(created.at(-1)!.src).toBe(url);
    expect(state(loads)).toEqual({ pending: 1, failed: 0 });

    await fire(created.at(-1)!, 'load');
    expect(state(loads)).toEqual({ pending: 0, failed: 0 });
  });
});
