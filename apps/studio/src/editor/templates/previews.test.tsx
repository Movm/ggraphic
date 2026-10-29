// SPDX-License-Identifier: AGPL-3.0-only
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogTemplate } from './catalog';
import { PreviewHost, previewKey, resetPreviews, useTemplatePreview } from './previews';

const mounted = vi.hoisted(() => ({
  count: 0,
  live: 0,
  maxLive: 0,
  /** Held renders: when set, onRendered waits for `release()`. */
  hold: false,
  configFails: false,
  pending: [] as (() => void)[],
}));

vi.mock('@ggraphic/editor/components/PagePreview', () => ({
  PagePreview: ({ onRendered }: { onRendered: (dataUrl: string) => void }) => {
    const done = useRef(onRendered);
    useEffect(() => {
      mounted.count += 1;
      mounted.live += 1;
      mounted.maxLive = Math.max(mounted.maxLive, mounted.live);
      const finish = () => done.current('data:image/png;base64,x');
      if (mounted.hold) mounted.pending.push(finish);
      else finish();
      return () => {
        mounted.live -= 1;
      };
    }, []);
    return <div data-testid="preview-canvas" />;
  },
}));

vi.mock('@ggraphic/editor/configs/configLoader', () => ({
  loadCanvasConfig: async () => {
    if (mounted.configFails) throw new Error('no config');
    return { id: 'studio-blank', canvas: { width: 1080, height: 1350 } };
  },
}));

// jsdom has no IntersectionObserver: the test decides who is visible.
const observed = new Map<Element, (visible: boolean) => void>();
class FakeIntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    observed.set(target, (isIntersecting) =>
      this.callback([{ isIntersecting, target } as IntersectionObserverEntry], this as never)
    );
  }
  unobserve(target: Element) {
    observed.delete(target);
  }
  disconnect() {}
}
function show(testId: string, visible = true) {
  act(() => observed.get(screen.getByTestId(testId))?.(visible));
}

function Tile({ id, entryId = 'studio-quote' }: { id: string; entryId?: string }) {
  const entry = catalogTemplate(entryId)!;
  const { ref, src } = useTemplatePreview(entry, 'light', 'post-portrait');
  return (
    <div ref={ref} data-testid={id}>
      {src ? <img alt={id} src={src} /> : null}
    </div>
  );
}

const original = activeBrand();

beforeEach(() => {
  resetPreviews();
  Object.assign(mounted, {
    count: 0,
    live: 0,
    maxLive: 0,
    hold: false,
    configFails: false,
    pending: [],
  });
  observed.clear();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => {
  registerBrandPacks([original]);
  vi.unstubAllGlobals();
});

describe('template previews', () => {
  it('a tile renders only once visible', async () => {
    render(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    await act(async () => {});
    expect(mounted.count).toBe(0);
    expect(screen.queryByAltText('a')).toBeNull();

    show('a');
    expect(await screen.findByAltText('a')).toHaveAttribute('src', 'data:image/png;base64,x');
    expect(mounted.count).toBe(1);
  });

  it('two tiles with the same key render once', async () => {
    mounted.hold = true;
    render(
      <>
        <PreviewHost />
        <Tile id="a" />
        <Tile id="b" />
      </>
    );
    show('a');
    show('b');
    await waitFor(() => expect(mounted.pending).toHaveLength(1));
    await act(async () => mounted.pending.shift()!());
    expect(await screen.findByAltText('a')).toBeInTheDocument();
    expect(await screen.findByAltText('b')).toBeInTheDocument();
    expect(mounted.count).toBe(1);
    expect(mounted.pending).toHaveLength(0);
  });

  it('a brand change renders again', async () => {
    const { rerender } = render(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    show('a');
    await screen.findByAltText('a');
    expect(mounted.count).toBe(1);

    registerBrandPacks([
      { ...original, colors: { ...original.colors, primary: '#123456' } } as typeof original,
    ]);
    rerender(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    await waitFor(() => expect(mounted.count).toBe(2));
  });

  it('one render runs at a time', async () => {
    mounted.hold = true;
    render(
      <>
        <PreviewHost />
        <Tile id="a" entryId="studio-quote" />
        <Tile id="b" entryId="studio-headline" />
      </>
    );
    show('a');
    show('b');
    await waitFor(() => expect(mounted.pending).toHaveLength(1));
    expect(mounted.count).toBe(1);

    await act(async () => mounted.pending.shift()!());
    await waitFor(() => expect(mounted.pending).toHaveLength(1));
    expect(mounted.count).toBe(2);
    expect(mounted.maxLive).toBe(1);
    await act(async () => mounted.pending.shift()!());
    expect(await screen.findByAltText('b')).toBeInTheDocument();
  });

  it('the cache keeps at most 200 previews', async () => {
    const entry = catalogTemplate('studio-quote')!;
    const brand = activeBrand();
    const key = (n: number) => previewKey(entry, 'light', `format-${n}`, brand);
    render(<PreviewHost />);
    // 201 distinct keys through the one door the host fills the cache by.
    const { requestPreview, cachedPreview } = await import('./previews');
    for (let n = 0; n < 201; n += 1) {
      await act(async () => {
        requestPreview(
          { key: key(n), entry, schemeId: 'light', formatId: 'post-portrait' },
          () => {}
        );
      });
      await waitFor(() => expect(cachedPreview(key(n))).not.toBeNull());
    }
    expect(cachedPreview(key(0))).toBeNull();
    expect(cachedPreview(key(200))).not.toBeNull();
    expect(cachedPreview(key(1))).not.toBeNull();
  });

  it('hides the host from people and screen readers', async () => {
    mounted.hold = true;
    render(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    show('a');
    const canvas = await screen.findByTestId('preview-canvas');
    const host = canvas.parentElement!;
    expect(host).toHaveAttribute('aria-hidden', 'true');
    expect(host).toHaveAttribute('inert');
    expect(host.style.visibility).toBe('hidden');
  });

  describe('a stuck job', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not block the next tile', async () => {
      vi.useFakeTimers();
      mounted.hold = true;
      render(
        <>
          <PreviewHost />
          <Tile id="a" entryId="studio-quote" />
          <Tile id="b" entryId="studio-headline" />
        </>
      );
      show('a');
      show('b');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(mounted.count).toBe(1);

      // The first render never reports.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      expect(mounted.count).toBe(2);
      expect(screen.queryByAltText('a')).toBeNull();

      await act(async () => mounted.pending.pop()!());
      expect(screen.getByAltText('b')).toBeInTheDocument();
    });

    it('does not cache a failed render as an image', async () => {
      vi.useFakeTimers();
      mounted.hold = true;
      const entry = catalogTemplate('studio-quote')!;
      render(<PreviewHost />);
      const key = previewKey(entry, 'light', 'post-portrait', activeBrand());
      const { requestPreview, cachedPreview } = await import('./previews');
      const done = vi.fn();
      act(() => {
        requestPreview({ key, entry, schemeId: 'light', formatId: 'post-portrait' }, done);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      expect(done).toHaveBeenCalledWith(null);
      expect(cachedPreview(key)).toBeNull();
    });
  });

  it('a rejected config load does not block the queue', async () => {
    mounted.configFails = true;
    render(
      <>
        <PreviewHost />
        <Tile id="a" entryId="studio-quote" />
        <Tile id="b" entryId="studio-headline" />
      </>
    );
    show('a');
    show('b');
    await act(async () => {});
    expect(mounted.count).toBe(0);

    mounted.configFails = false;
    const { rerender } = render(<Tile id="c" entryId="studio-number" />);
    void rerender;
    show('c');
    expect(await screen.findByAltText('c')).toBeInTheDocument();
  });
});
