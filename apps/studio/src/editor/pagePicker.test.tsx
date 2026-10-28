// SPDX-License-Identifier: AGPL-3.0-only
import { type EditorPagePickerProps } from '@ggraphic/editor/components/CanvasEditor/editorShell';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { newDocument } from './document';
import { StudioPagePicker } from './shell';
import { HEADLINE_TEMPLATE_ID } from './templates/ids';

function open(props: Partial<EditorPagePickerProps>) {
  const onSelectTemplate = vi.fn();
  render(
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
  );
  return onSelectTemplate;
}

const headlinePage = () => newDocument('post-portrait', HEADLINE_TEMPLATE_ID).pages[0]!.state;

describe('the page picker in replace mode', () => {
  it('marks the template the page holds, not the free page config', () => {
    open({ currentState: headlinePage() });
    expect(screen.getByRole('button', { name: /Headline/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('button', { name: /Blank/ })).not.toHaveAttribute('aria-current');
  });

  it('Blank clears the page of a free page, keeping its ground', async () => {
    const onSelect = open({ currentState: headlinePage() });
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
    const onSelect = open({ currentState: headlinePage() });
    await userEvent.click(screen.getByRole('button', { name: /Quote/ }));
    const [configId, state] = onSelect.mock.calls[0] as [string, Record<string, unknown>];
    expect(configId).toBe('studio-blank');
    expect((state['templateRef'] as { id: string }).id).toBe('studio-quote');
  });
});

describe('the colour world on Change template', () => {
  const pickQuote = async (brandScheme: string | undefined) => {
    const onSelect = open({ currentState: { ...headlinePage(), brandScheme } });
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
    );
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('.studio-overlay')?.parentElement).toBe(document.body);
    expect(dialog).toHaveClass('studio-dialog');
  });
});
