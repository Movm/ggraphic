// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Names for inline editors, the save status as text, the lightbox as a dialog.
 */
import { Lightbox } from './Lightbox.js';
import { RichTextField } from '../components/RichTextField.js';
import { AutoSaveIndicator } from '../components/TopBar/AutoSaveIndicator.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../test-utils';

const mockState = vi.hoisted(() => ({ status: null as string | null }));
vi.mock('../stores/useAutoSaveStore.js', () => ({
  useAutoSaveStore: (selector: (s: unknown) => unknown) =>
    selector({ autoSaveStatus: mockState.status, retryAutoSave: () => {} }),
}));

describe('RichTextField', () => {
  it('is a named multi-line text field', async () => {
    const { container } = render(<RichTextField value="Hallo" onChange={() => {}} />);
    const box = screen.getByRole('textbox', { name: 'Text bearbeiten' });
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('AutoSaveIndicator', () => {
  it.each([
    ['saving', 'Speichert …'],
    ['saved', 'Gespeichert'],
    ['error', 'Fehler beim Speichern'],
  ] as const)('%s is written out as text in the status', async (status, text) => {
    mockState.status = status;
    const { container } = render(<AutoSaveIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Lightbox', () => {
  it('is a named dialog and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Lightbox isOpen onClose={onClose} imageSrc="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
    );
    expect(screen.getByRole('dialog', { name: 'Bildvorschau' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while it is closed', () => {
    render(<Lightbox isOpen={false} onClose={() => {}} imageSrc="x.png" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
