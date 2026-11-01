// SPDX-License-Identifier: AGPL-3.0-only
import { useBlockInsert } from '@ggraphic/editor/components/CanvasEditor/blockInsertContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_ORG, WithSession } from '../../testing/session';

import { BlockInsertProvider } from './BlockInsertProvider';

afterEach(() => vi.unstubAllGlobals());

function Ids() {
  const api = useBlockInsert();
  return (
    <p data-testid="ids" data-loading={String(api?.isLoading ?? false)}>
      {(api?.blocks as { id: string }[] | undefined)?.map((b) => b.id).join(',')}
    </p>
  );
}

function mount(hidden: string[], gate: Promise<void> = Promise.resolve()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === `/api/orgs/${TEST_ORG}/hidden-templates`
        ? await gate.then(
            () =>
              new Response(JSON.stringify({ templateIds: hidden }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        : new Response('{}', { status: 404 })
    )
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WithSession>
        <BlockInsertProvider
          pages={[{ configId: 'studio-blank' }]}
          currentPageIndex={0}
          formatId="post-portrait"
          canvasRefsRef={{ current: [] }}
          configTabIds={[]}
        >
          <Ids />
        </BlockInsertProvider>
      </WithSession>
    </QueryClientProvider>
  );
}

describe('BlockInsertProvider', () => {
  it('offers the blocks of every template', async () => {
    mount([]);
    await waitFor(() =>
      expect(screen.getByTestId('ids').textContent).toContain('studio-quote/quote-with-name')
    );
  });

  it('offers no block until the hidden list has settled, so a hidden one never flashes', async () => {
    let open: () => void = () => {};
    mount(['studio-quote'], new Promise<void>((resolve) => (open = resolve)));
    expect(screen.getByTestId('ids')).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId('ids').textContent).toBe('');
    open();
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveAttribute('data-loading', 'false'));
    expect(screen.getByTestId('ids').textContent).not.toContain('studio-quote/');
    expect(screen.getByTestId('ids').textContent).toContain('studio-headline/');
  });

  it('leaves out the blocks of templates the organisation hid', async () => {
    mount(['studio-quote']);
    await waitFor(() =>
      expect(screen.getByTestId('ids').textContent).toContain('studio-headline/')
    );
    expect(screen.getByTestId('ids').textContent).not.toContain('studio-quote/');
  });
});
