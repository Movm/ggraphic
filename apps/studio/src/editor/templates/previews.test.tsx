// SPDX-License-Identifier: AGPL-3.0-only
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogTemplate } from './catalog';
import { templatePageState } from './instantiate';
import { PreviewHost, previewKey, resetPreviews, useTemplatePreview } from './previews';

const mounted = vi.hoisted(() => ({
  count: 0,
  live: 0,
  maxLive: 0,
  /** Held renders: when set, onRendered waits for `release()`. */
  hold: false,
  configFails: false,
  /** Entry ids whose state building throws. */
  throwFor: [] as string[],
  pending: [] as (() => void)[],
  /** The headline font each loaded page config was built with (the real one reads the active brand). */
  loadedFonts: [] as string[],
  /** The config each preview was drawn with. */
  drawnWith: [] as unknown[],
}));

vi.mock('./instantiate', async (importOriginal) => {
  const actual = await importOriginal<{ templatePageState: typeof templatePageState }>();
  return {
    ...actual,
    templatePageState: ((entry, ...rest) => {
      if (mounted.throwFor.includes(entry.id)) throw new Error('broken template');
      return actual.templatePageState(entry, ...rest);
    }) as typeof templatePageState,
  };
});

vi.mock('@ggraphic/editor/components/PagePreview', () => ({
  PagePreview: ({
    onRendered,
    config,
  }: {
    onRendered: (dataUrl: string) => void;
    config: unknown;
  }) => {
    const done = useRef(onRendered);
    useEffect(() => {
      mounted.drawnWith.push(config);
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

vi.mock('@ggraphic/editor/configs/configLoader', async () => {
  const { activeBrand: brandNow } = await import('@ggraphic/editor/brand/brandRegistry');
  return {
    loadCanvasConfig: async () => {
      if (mounted.configFails) throw new Error('no config');
      const primary = brandNow().fonts.headline;
      mounted.loadedFonts.push(primary);
      return { id: 'studio-blank', canvas: { width: 1080, height: 1350 }, fonts: { primary } };
    },
  };
});

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
    throwFor: [],
    pending: [],
    loadedFonts: [],
    drawnWith: [],
  });
  observed.clear();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => {
  registerBrandPacks([original]);
  vi.unstubAllGlobals();
});

describe('previews in an explicit brand', () => {
  const pack = (primary: string) => ({
    ...activeBrand(),
    id: `org-${primary}`,
    colors: { ...activeBrand().colors, primary },
  });

  it('keys by the brand given, and draws the page in it without registering it', async () => {
    const entry = catalogTemplate('studio-headline')!;
    const [a, b] = [pack('#112233'), pack('#aa5500')];
    expect(previewKey(entry, 'primary', 'post-portrait', a)).not.toBe(
      previewKey(entry, 'primary', 'post-portrait', b)
    );
    const stateOf = (brand: ReturnType<typeof pack>) =>
      templatePageState(entry, 'post-portrait', { schemeId: 'primary', brand })!['backgroundColor'];
    expect(stateOf(a)).not.toBe(stateOf(b));
    expect(activeBrand().id).toBe(original.id);
  });

  it('a tile asks for its preview in the brand it is given', async () => {
    const brand = pack('#112233');
    function Org() {
      const entry = catalogTemplate('studio-headline')!;
      const { ref, src } = useTemplatePreview(entry, 'primary', 'post-portrait', brand);
      return (
        <div ref={ref} data-testid="org">
          {src ? <img alt="org" src={src} /> : null}
        </div>
      );
    }
    render(
      <>
        <PreviewHost />
        <Org />
      </>
    );
    show('org');
    expect(await screen.findByAltText('org')).toBeInTheDocument();
    expect(activeBrand().id).toBe(original.id);
  });
});

describe('template previews', () => {
  it('a template whose state building throws finishes with null and the next job renders', async () => {
    mounted.throwFor = ['studio-quote'];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <>
        <PreviewHost />
        <Tile id="bad" entryId="studio-quote" />
        <Tile id="good" entryId="studio-headline" />
      </>
    );
    show('bad');
    show('good');
    expect(await screen.findByAltText('good')).toBeInTheDocument();
    expect(screen.queryByAltText('bad')).toBeNull();
    expect(screen.getByTestId('bad')).toBeInTheDocument();
    error.mockRestore();
  });

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

  it('draws with a page config built for the brand that is active now, not the first one', async () => {
    const { rerender } = render(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    show('a');
    await screen.findByAltText('a');
    expect(mounted.loadedFonts).toEqual([original.fonts.headline]);

    const other = {
      ...original,
      fonts: { ...original.fonts, headline: 'Fraunces' },
    } as typeof original;
    registerBrandPacks([other]);
    rerender(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    await waitFor(() => expect(mounted.count).toBe(2));
    expect(mounted.loadedFonts).toEqual([original.fonts.headline, 'Fraunces']);
    expect((mounted.drawnWith[1] as { fonts: { primary: string } }).fonts.primary).toBe('Fraunces');
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
          {
            key: key(n),
            entry,
            schemeId: 'light',
            formatId: 'post-portrait',
            brand: activeBrand(),
          },
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

  it('starts a render only when the browser is idle, so scrolling keeps its frames', async () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => idle.push(callback));
    vi.stubGlobal('cancelIdleCallback', () => {});
    render(
      <>
        <PreviewHost />
        <Tile id="a" />
      </>
    );
    show('a');
    await waitFor(() => expect(idle).toHaveLength(1));
    expect(mounted.count).toBe(0);

    act(() => idle.shift()!());
    await waitFor(() => expect(screen.getByAltText('a')).toBeInTheDocument());
    expect(mounted.count).toBe(1);
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
        requestPreview(
          { key, entry, schemeId: 'light', formatId: 'post-portrait', brand: activeBrand() },
          done
        );
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
