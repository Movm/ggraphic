// SPDX-License-Identifier: MPL-2.0
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import type { CanvasIconSearchService } from '@ggraphic/editor/hostServices';

import { IconifyCatalog } from './IconifyCatalog.js';

afterEach(cleanup);

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" d="M0 0h24"/></svg>';

const hits = [
  {
    prefix: 'tabler',
    name: 'tree',
    setTitle: 'Tabler Icons',
    licence: 'MIT',
    author: 'Paweł Kuna',
  },
  {
    prefix: 'lets',
    name: 'tree-fill',
    setTitle: 'Lets Icons',
    licence: 'CC-BY-4.0',
    author: 'Leonid Tsvetkov',
  },
];

function service(overrides: Partial<CanvasIconSearchService> = {}): CanvasIconSearchService {
  return {
    search: vi.fn(() => Promise.resolve(hits)),
    svg: vi.fn(() => Promise.resolve(SVG)),
    previewUrl: (prefix, name) => `/api/assets/icons/${prefix}/${name}.svg`,
    ...overrides,
  };
}

function renderCatalog(
  iconSearch: CanvasIconSearchService | undefined,
  props: Partial<Parameters<typeof IconifyCatalog>[0]> = {}
) {
  const onAdd = vi.fn();
  const services: CanvasEditorServices = iconSearch ? { iconSearch } : {};
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CanvasEditorProvider services={services}>
        <IconifyCatalog query="baum" onAdd={onAdd} {...props} />
      </CanvasEditorProvider>
    </QueryClientProvider>
  );
  return { onAdd, ...view };
}

describe('IconifyCatalog', () => {
  it('renders nothing and never searches when the host has no icon search', () => {
    const { container } = renderCatalog(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty query', () => {
    const iconSearch = service();
    const { container } = renderCatalog(iconSearch, { query: '' });
    expect(container).toBeEmptyDOMElement();
    expect(iconSearch.search).not.toHaveBeenCalled();
  });

  it('searches and lists the hits', async () => {
    const iconSearch = service();
    renderCatalog(iconSearch);
    expect(await screen.findByRole('button', { name: /tree-fill/ })).toBeTruthy();
    expect(iconSearch.search).toHaveBeenCalledWith('baum', expect.anything());
    expect(screen.getAllByRole('button', { name: /tree/ })).toHaveLength(2);
  });

  it('shows set, author and licence of the selected hit', async () => {
    renderCatalog(service());
    fireEvent.click(await screen.findByRole('button', { name: /tree-fill/ }));
    expect(screen.getByText('Icon: Lets Icons von Leonid Tsvetkov, CC-BY-4.0')).toBeTruthy();
  });

  it('places the selected icon as a copy of its svg, with source and licence', async () => {
    const iconSearch = service();
    const { onAdd } = renderCatalog(iconSearch);
    fireEvent.click(await screen.findByRole('button', { name: /tree-fill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Einfügen' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(iconSearch.svg).toHaveBeenCalledWith('lets', 'tree-fill');
    expect(onAdd).toHaveBeenCalledWith('iconify:lets:tree-fill', {
      svg: SVG,
      source: {
        kind: 'iconify',
        prefix: 'lets',
        name: 'tree-fill',
        setTitle: 'Lets Icons',
        licence: 'CC-BY-4.0',
        author: 'Leonid Tsvetkov',
      },
    });
  });

  it('stores the sanitised svg, whatever the service returned', async () => {
    const dirty = SVG.replace('<path', '<script>x()</script><path onclick="x()"');
    const { onAdd } = renderCatalog(service({ svg: vi.fn(() => Promise.resolve(dirty)) }));
    fireEvent.click(await screen.findByRole('button', { name: /tree-fill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Einfügen' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const stored = (onAdd.mock.calls[0]![1] as { svg: string }).svg;
    expect(stored).not.toMatch(/script|onclick/);
    expect(stored).toContain('<path');
  });

  it('places nothing when the svg cannot be made safe', async () => {
    const { onAdd } = renderCatalog(
      service({
        svg: vi.fn(() => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/onload=x()>')),
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: /tree-fill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Einfügen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das Icon konnte nicht geladen werden.'
    );
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('places nothing and says so when the icon cannot be fetched', async () => {
    const { onAdd } = renderCatalog(
      service({ svg: vi.fn(() => Promise.reject(new Error('502'))) })
    );
    fireEvent.click(await screen.findByRole('button', { name: /tree-fill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Einfügen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das Icon konnte nicht geladen werden.'
    );
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does not place beyond the page limit', async () => {
    const { onAdd } = renderCatalog(service(), { full: 3 });
    fireEvent.click(await screen.findByRole('button', { name: /tree-fill/ }));
    const insert = screen.getByRole('button', { name: 'Einfügen' });
    expect(insert).toBeDisabled();
    expect(screen.getByText('Pro Seite höchstens 3 verschiedene Icons.')).toBeTruthy();
    fireEvent.click(insert);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('says when the search fails', async () => {
    renderCatalog(service({ search: vi.fn(() => Promise.reject(new Error('503'))) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Icon-Suche ist gerade nicht erreichbar.'
    );
  });

  describe('tiles the host cannot serve', () => {
    /** jsdom loads no images; this stand-in fails the urls in `failing` and loads the rest. */
    const failing = new Set<string>();
    const created: string[] = [];
    const RealImage = globalThis.Image;
    beforeEach(() => {
      failing.clear();
      created.length = 0;
      class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(url: string) {
          created.push(url);
          queueMicrotask(() => (failing.has(url) ? this.onerror?.() : this.onload?.()));
        }
      }
      globalThis.Image = FakeImage as unknown as typeof Image;
    });
    afterEach(() => {
      globalThis.Image = RealImage;
    });

    it('says so and lets the user try again, instead of leaving grey tiles', async () => {
      failing.add('/api/assets/icons/lets/tree-fill.svg');
      renderCatalog(service());
      await screen.findByRole('button', { name: /tree-fill/ });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Einige Icons konnten nicht geladen werden.');
      failing.clear();
      const before = created.length;
      fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      await waitFor(() => expect(created.length).toBeGreaterThan(before));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('shows no message when every tile loads', async () => {
      renderCatalog(service());
      await screen.findByRole('button', { name: /tree-fill/ });
      await waitFor(() => expect(created.length).toBeGreaterThan(0));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('retries through the host refresh, which fetches in batches, not per tile', async () => {
      failing.add('/api/assets/icons/lets/tree-fill.svg');
      const refresh = vi.fn(() => Promise.resolve({ retryAfterSeconds: null }));
      renderCatalog(service({ refresh }));
      await screen.findByRole('alert');
      failing.clear();
      const before = created.length;
      fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      await waitFor(() => expect(refresh).toHaveBeenCalledWith('baum'));
      // The tiles are probed again only after the refresh answered.
      await waitFor(() => expect(created.length).toBeGreaterThan(before));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('disables the button for the wait the host names, and says how long', async () => {
      failing.add('/api/assets/icons/lets/tree-fill.svg');
      const refresh = vi.fn(() => Promise.resolve({ retryAfterSeconds: 7 }));
      renderCatalog(service({ refresh }));
      await screen.findByRole('alert');
      const before = created.length;
      fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      const button = await screen.findByRole('button', { name: /Erneut versuchen/ });
      await waitFor(() => expect(button).toBeDisabled());
      expect(screen.getByRole('alert')).toHaveTextContent('7 s');
      // Nothing was fetched meanwhile.
      expect(created.length).toBe(before);
    });

    it('says the wait the host names even when the clock moves during the click', async () => {
      failing.add('/api/assets/icons/lets/tree-fill.svg');
      const refresh = vi.fn(() => Promise.resolve({ retryAfterSeconds: 7 }));
      renderCatalog(service({ refresh }));
      await screen.findByRole('alert');
      // Every read of the clock is a millisecond later than the one before.
      let t = Date.now();
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => ++t);
      try {
        fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
        const button = await screen.findByRole('button', { name: /Erneut versuchen/ });
        await waitFor(() => expect(button).toBeDisabled());
        expect(screen.getByRole('alert')).toHaveTextContent('7 s');
      } finally {
        clock.mockRestore();
      }
    });
  });
});
