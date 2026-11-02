// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CombinedTextSection } from './CombinedTextSection.js';

import type { AdditionalText } from '../../configs/types.js';

const text = (value: string) =>
  ({ id: 't1', type: 'text', text: value }) as unknown as AdditionalText;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe('CombinedTextSection canvas texts', () => {
  it('shows the line breaks of the stored text', () => {
    render(
      <CombinedTextSection
        additionalTexts={[text('one\ntwo\nthree')]}
        onUpdateText={vi.fn()}
        onRemoveText={vi.fn()}
      />
    );
    const field = screen.getByDisplayValue(/one/) as HTMLTextAreaElement;
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.value).toBe('one\ntwo\nthree');
    expect(field.rows).toBe(3);
  });

  it('writes an edit back with its line breaks intact', () => {
    const onUpdateText = vi.fn();
    render(
      <CombinedTextSection
        additionalTexts={[text('one\ntwo')]}
        onUpdateText={onUpdateText}
        onRemoveText={vi.fn()}
      />
    );
    fireEvent.change(screen.getByDisplayValue(/one/), { target: { value: 'one\ntwox' } });
    expect(onUpdateText).toHaveBeenCalledWith('t1', { text: 'one\ntwox' });
  });
});
