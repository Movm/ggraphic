// SPDX-License-Identifier: AGPL-3.0-only
import { type EditorPagePickerProps } from '@ggraphic/editor/shell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WithSession } from '../testing/session';

import { newDocument } from './document';
import { StudioPagePicker } from './shell';
import { HEADLINE_TEMPLATE_ID } from './templates/ids';

/** Opens the picker and waits for its list: the gallery shows nothing until the hidden list is in. */
async function open(props: Partial<EditorPagePickerProps>) {
  const onSelectTemplate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WithSession>
        <StudioPagePicker
          isOpen
          onClose={() => {}}
          mode="replace"
          currentTemplateId="studio-blank"
          activeTemplateId="studio-blank"
          pages={[]}
          formatId="post-portrait"
          onSelectTemplate={onSelectTemplate}
          {...props}
        />
      </WithSession>
    </QueryClientProvider>
  );
  await screen.findByRole('list', { name: 'Templates' });
  return onSelectTemplate;
}

beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ templateIds: [] }))
  )
);
afterEach(() => vi.unstubAllGlobals());

const headlinePage = () => newDocument('post-portrait', HEADLINE_TEMPLATE_ID).pages[0]!.state;

describe('the page picker in replace mode', () => {
  it('marks the template the page holds, not the free page config', async () => {
    await open({ currentState: headlinePage() });
    expect(screen.getByRole('button', { name: /Headline/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('button', { name: /Blank/ })).not.toHaveAttribute('aria-current');
  });

  it('Blank clears the page of a free page, keeping its ground', async () => {
    const onSelect = await open({ currentState: headlinePage() });
    await userEvent.click(screen.getByRole('button', { name: /Blank/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [configId, state] = onSelect.mock.calls[0] as [string, Record<string, unknown>];
    expect(configId).toBe('studio-blank');
    expect(state['additionalTexts']).toEqual([]);
    expect(state['shapeInstances']).toEqual([]);
    expect(state['layerOrder']).toEqual([]);
    expect(state['templateRef']).toBeUndefined();
    expect(state['backgroundColor']).toBe(headlinePage()['backgroundColor']);
  });

  it('a template puts its own page on the free page config', async () => {
    const onSelect = await open({ currentState: headlinePage() });
    await userEvent.click(screen.getByRole('button', { name: /Quote/ }));
    const [configId, state] = onSelect.mock.calls[0] as [string, Record<string, unknown>];
    expect(configId).toBe('studio-blank');
    expect((state['templateRef'] as { id: string }).id).toBe('studio-quote');
  });
});

describe('the picker shows the gallery', () => {
  it('replace mode puts the picked template and world on the page in place', async () => {
    const onSelect = await open({ currentState: headlinePage() });
    const worlds = screen.getByRole('group', { name: 'Quote colour world' });
    await userEvent.click(within(worlds).getByRole('radio', { name: 'Primary' }));
    await userEvent.click(screen.getByRole('button', { name: /^Quote/ }));
    // The page keeps its id and config; only its state changes, in one call.
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [configId, state] = onSelect.mock.calls[0] as [string, Record<string, unknown>];
    expect(configId).toBe('studio-blank');
    expect((state['templateRef'] as { id: string }).id).toBe('studio-quote');
    expect(state['brandScheme']).toBe('primary');
  });

  it('add mode adds a free page with the picked template and world', async () => {
    const addPage = vi.fn(async () => {});
    await open({ mode: 'add', addPage });
    const worlds = screen.getByRole('group', { name: 'Headline + text colour world' });
    await userEvent.click(within(worlds).getByRole('radio', { name: 'Dark' }));
    await userEvent.click(screen.getByRole('button', { name: /^Headline/ }));
    expect(addPage).toHaveBeenCalledTimes(1);
    const [configId, inherit, state] = addPage.mock.calls[0] as unknown as [
      string,
      boolean,
      Record<string, unknown>,
    ];
    expect([configId, inherit, state['brandScheme']]).toEqual(['studio-blank', false, 'dark']);
  });
});

describe('the colour world on Change template', () => {
  const pickQuote = async (brandScheme: string | undefined) => {
    const onSelect = await open({ currentState: { ...headlinePage(), brandScheme } });
    await userEvent.click(screen.getByRole('button', { name: /Quote/ }));
    return (onSelect.mock.calls[0] as [string, Record<string, unknown>])[1];
  };

  it("keeps the page's world when the new template offers it", async () => {
    // The quote offers `light` first: staying on `primary` is the page's choice, not the default.
    expect((await pickQuote('primary'))['brandScheme']).toBe('primary');
  });

  it.each(['dark', undefined])(
    "falls back to the template's first world when the page's is %s",
    async (scheme) => {
      expect((await pickQuote(scheme))['brandScheme']).toBe('light');
    }
  );
});

describe('where the picker renders', () => {
  it('is mounted on the document body, whatever small box opened it', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <WithSession>
          <div style={{ width: 110, transform: 'translateZ(0)' }}>
            <StudioPagePicker
              isOpen
              onClose={() => {}}
              mode="add"
              currentTemplateId="studio-blank"
              activeTemplateId="studio-blank"
              pages={[]}
              formatId="post-portrait"
              onSelectTemplate={() => {}}
            />
          </div>
        </WithSession>
      </QueryClientProvider>
    );
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('.studio-overlay')?.parentElement).toBe(document.body);
    expect(dialog).toHaveClass('studio-dialog');
  });
});

describe('the picker and hidden templates', () => {
  it('does not list a template the organisation hid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ templateIds: ['studio-quote'] }))
    );
    await open({ currentState: headlinePage() });
    expect(screen.queryByRole('button', { name: /^Quote/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Headline/ })).toBeInTheDocument();
  });
});
