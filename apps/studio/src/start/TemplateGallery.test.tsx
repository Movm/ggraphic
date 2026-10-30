// SPDX-License-Identifier: AGPL-3.0-only
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { PreviewHost, resetPreviews } from '../editor/templates/previews';

import { TemplateGallery } from './TemplateGallery';

// Besides the real three: a photo quote with an occasion, and a 4:5-only number.
vi.mock('@ggraphic/templates-open', async (importOriginal) => {
  type Raw = Record<string, Record<string, Record<string, unknown>>>;
  const original = await importOriginal<{ OPEN_TEMPLATES: readonly Raw[] }>();
  const find = (id: string) => original.OPEN_TEMPLATES.find((t) => (t['id'] as unknown) === id)!;
  const quote = find('studio-quote');
  const number = find('studio-number');
  const photoQuote = {
    ...quote,
    id: 'test-photo-quote',
    title: { en: 'Mock photo quote' },
    tags: { ...quote['tags'], occasions: ['summer'] },
    // The gate only needs the slot to name an element; the role is what the gallery reads.
    slots: { ...quote['slots'], subline: { ...quote['slots']!['subline'], role: 'photo' } },
  };
  const portraitOnly = {
    ...number,
    id: 'test-portrait-only',
    title: { en: 'Portrait only' },
    formats: ['4:5'],
  };
  return { ...original, OPEN_TEMPLATES: [...original.OPEN_TEMPLATES, photoQuote, portraitOnly] };
});

// jsdom has no IntersectionObserver: nothing is ever visible, so nothing renders.
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

vi.mock('@ggraphic/editor/components/PagePreview', async () => {
  const { useEffect } = await import('react');
  return {
    PagePreview: ({ onRendered }: { onRendered: (dataUrl: string) => void }) => {
      useEffect(() => onRendered('data:image/png;base64,x'), [onRendered]);
      return null;
    },
  };
});
vi.mock('@ggraphic/editor/configs/configLoader', () => ({
  loadCanvasConfig: async () => ({ id: 'studio-blank', canvas: { width: 1080, height: 1350 } }),
}));

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls.
for (const m of [
  'hasPointerCapture',
  'releasePointerCapture',
  'setPointerCapture',
  'scrollIntoView',
]) {
  Object.defineProperty(Element.prototype, m, {
    value: m === 'hasPointerCapture' ? () => false : () => undefined,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  resetPreviews();
  observed.clear();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => vi.unstubAllGlobals());

const tiles = () => within(screen.getByRole('list', { name: 'Templates' }));

function gallery(props: Partial<React.ComponentProps<typeof TemplateGallery>> = {}) {
  const onPick = vi.fn();
  const view = render(
    <>
      <PreviewHost />
      <TemplateGallery formatId="post-portrait" onPick={onPick} {...props} />
    </>
  );
  return { onPick, ...view };
}

describe('the template gallery', () => {
  it("lists the format's templates with live previews", async () => {
    gallery();
    expect(tiles().getByRole('button', { name: /^Headline/ })).toBeInTheDocument();
    expect(tiles().getByRole('button', { name: /^Quote/ })).toBeInTheDocument();
    // Until the tile is on screen there is a skeleton, not an image.
    expect(document.querySelectorAll('.studio-gallery__skeleton').length).toBeGreaterThan(0);
    const [first] = [...observed.keys()];
    await act(async () => observed.get(first!)?.(true));
    await waitFor(() =>
      expect(document.querySelector('.studio-gallery img')).toHaveAttribute(
        'src',
        'data:image/png;base64,x'
      )
    );
  });

  it('filtering by family leaves only that family', async () => {
    gallery();
    await userEvent.click(screen.getByRole('radio', { name: 'Number' }));
    expect(tiles().getByRole('button', { name: /^Big number/ })).toBeInTheDocument();
    expect(tiles().queryByRole('button', { name: /^Quote/ })).not.toBeInTheDocument();
    expect(tiles().queryByRole('button', { name: /^Headline/ })).not.toBeInTheDocument();
  });

  it('filters by occasion, shown only when a template has one', async () => {
    gallery();
    await userEvent.click(screen.getByRole('radio', { name: 'Summer' }));
    expect(tiles().getByRole('button', { name: /^Mock photo quote/ })).toBeInTheDocument();
    expect(tiles().queryByRole('button', { name: /^Headline/ })).not.toBeInTheDocument();
  });

  it('"With photo" hides templates without a photo slot', async () => {
    gallery();
    await userEvent.click(screen.getByRole('combobox', { name: 'Photo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'With photo' }));
    expect(tiles().getByRole('button', { name: /^Mock photo quote/ })).toBeInTheDocument();
    expect(tiles().queryByRole('button', { name: /^Headline/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Photo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Without photo' }));
    expect(tiles().queryByRole('button', { name: /^Mock photo quote/ })).not.toBeInTheDocument();
    expect(tiles().getByRole('button', { name: /^Headline/ })).toBeInTheDocument();
  });

  it('a 16:9 project offers no 4:5-only template', () => {
    gallery({ formatId: 'slide-16-9' });
    expect(tiles().getByRole('button', { name: /^Headline/ })).toBeInTheDocument();
    expect(tiles().queryByRole('button', { name: /^Portrait only/ })).not.toBeInTheDocument();
  });

  it('picking a world on a tile starts with that world', async () => {
    const { onPick } = gallery();
    const worlds = screen.getByRole('group', { name: 'Headline + text colour world' });
    await userEvent.click(within(worlds).getByRole('radio', { name: 'Dark' }));
    await userEvent.click(tiles().getByRole('button', { name: /^Headline/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0].id).toBe('studio-headline');
    expect(onPick.mock.calls[0]![1]).toBe('dark');
  });

  it('starts with the preferred world when the template offers it', async () => {
    const { onPick } = gallery({ defaultSchemeId: 'primary' });
    await userEvent.click(tiles().getByRole('button', { name: /^Quote/ }));
    expect(onPick.mock.calls[0]![1]).toBe('primary');
  });

  it('leaves out hidden templates, and lets an owner hide and show them', async () => {
    const onToggleHidden = vi.fn();
    const { rerender } = gallery({ hiddenIds: new Set(['studio-quote']), onToggleHidden });
    expect(tiles().queryByRole('button', { name: /^Quote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hide / })).not.toBeInTheDocument();

    rerender(
      <TemplateGallery
        formatId="post-portrait"
        onPick={() => {}}
        hiddenIds={new Set(['studio-quote'])}
        canHide
        onToggleHidden={onToggleHidden}
      />
    );
    expect(tiles().getByRole('button', { name: /^Quote/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show Quote in the gallery' }));
    expect(onToggleHidden).toHaveBeenCalledWith('studio-quote', false);
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide Headline + text from the gallery' })
    );
    expect(onToggleHidden).toHaveBeenCalledWith('studio-headline', true);
  });

  it('a filter that is no longer offered is All again', async () => {
    const { rerender } = gallery();
    await userEvent.click(screen.getByRole('radio', { name: 'Number' }));
    expect(tiles().queryByRole('button', { name: /^Quote/ })).not.toBeInTheDocument();
    // Hiding the only number template takes the family chip away.
    rerender(
      <>
        <PreviewHost />
        <TemplateGallery
          formatId="post-portrait"
          onPick={() => {}}
          hiddenIds={
            new Set([
              'studio-number',
              'studio-photo-number',
              'studio-number-photo-strip',
              'studio-number-one-digit',
              'studio-number-percent',
              'studio-number-word-stack',
              'studio-number-two-columns',
              'test-portrait-only',
            ])
          }
        />
      </>
    );
    expect(screen.queryByRole('radio', { name: 'Number' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(tiles().getByRole('button', { name: /^Quote/ })).toBeInTheDocument();
  });

  it('keeps the world picked on a tile across filter changes', async () => {
    const { onPick } = gallery();
    const worlds = screen.getByRole('group', { name: 'Headline + text colour world' });
    await userEvent.click(within(worlds).getByRole('radio', { name: 'Dark' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Quote' }));
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await userEvent.click(tiles().getByRole('button', { name: /^Headline/ }));
    expect(onPick.mock.calls[0]![1]).toBe('dark');
  });

  it('offers a blank page when asked to', async () => {
    const onPickBlank = vi.fn();
    gallery({ showBlank: true, onPickBlank });
    await userEvent.click(tiles().getByRole('button', { name: /^Blank/ }));
    expect(onPickBlank).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = gallery({ showBlank: true, canHide: true });
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
