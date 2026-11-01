// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  TextFormatButtons,
  type TextFormatCommands,
  type TextFormatState,
} from '../TextFormatButtons';
import { messages } from '@ggraphic/editor/i18n/messages';

const state: TextFormatState = {
  bold: true,
  italic: true,
  underline: false,
  accent: false,
  accentColor: null,
  marker: false,
  markerColor: null,
  bulletList: false,
  orderedList: false,
};

const commands: TextFormatCommands = {
  toggleBold: vi.fn(),
  toggleItalic: vi.fn(),
  toggleUnderline: vi.fn(),
  setAccent: vi.fn(),
  removeAccent: vi.fn(),
  setMarker: vi.fn(),
  removeMarker: vi.fn(),
  toggleBulletList: vi.fn(),
  toggleOrderedList: vi.fn(),
};

describe('TextFormatButtons bold with italic', () => {
  it('disables bold and explains why when the font has no bold italic cut', () => {
    render(
      <TextFormatButtons
        state={state}
        commands={commands}
        marks={{ bold: true, italic: true, boldItalic: false }}
      />
    );
    const button = screen.getByRole('button', { name: messages().textFormat.boldNeedsItalicCut });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps bold pressed and enabled when the font has the cut', () => {
    render(
      <TextFormatButtons
        state={state}
        commands={commands}
        marks={{ bold: true, italic: true, boldItalic: true }}
      />
    );
    const button = screen.getByRole('button', { name: messages().textFormat.bold });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps bold usable without italic', () => {
    render(
      <TextFormatButtons
        state={{ ...state, italic: false }}
        commands={commands}
        marks={{ bold: true, italic: true, boldItalic: false }}
      />
    );
    expect(screen.getByRole('button', { name: messages().textFormat.bold })).toBeEnabled();
  });
});
