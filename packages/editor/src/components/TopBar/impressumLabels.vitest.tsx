// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../CanvasEditorProvider.js';
import type { CanvasImprintService } from '../../hostServices.js';
import { registerMessages } from '../../i18n/messages.js';
import { DownloadSection } from './DownloadSection.js';

afterEach(() => registerMessages('de'));

const labels = { name: 'Name', namePlaceholder: 'Vorname Nachname', hint: 'Hinweis' };
const impressum: CanvasImprintService = {
  elementId: 'impressum',
  localeOf: () => 'de-DE',
  line: () => '',
  parse: () => ({ name: '', address: '' }),
  isFilled: (v) => v.trim() !== '',
  isComplete: (p) => p.name.trim() !== '' && p.address.trim() !== '',
  labels: { 'de-DE': labels, 'de-AT': labels },
  composeElement: () => {
    throw new Error('unused');
  },
};

function renderGate() {
  return render(
    <CanvasEditorProvider services={{ print: { imprint: impressum } }}>
      <DownloadSection
        onDownload={vi.fn()}
        pageCount={1}
        printExport={{
          onDownloadPdf: vi.fn(),
          getWarnings: () => [],
          impressum: { ready: true, locale: 'de-DE', text: '', onSubmit: vi.fn() },
        }}
      />
    </CanvasEditorProvider>
  );
}

describe('impressum form labels', () => {
  it('speaks German by default, byte for byte', () => {
    renderGate();
    expect(
      screen.getByText('Noch kein vollständiges Impressum – herunterladen kannst du trotzdem.')
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Impressum ergänzen' })).toBeTruthy();
    expect(screen.getByText('Anschrift')).toBeTruthy();
    expect(screen.getByPlaceholderText('Straße Nr., PLZ Ort')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(screen.getByText('Bitte Name eintragen.')).toBeTruthy();
    expect(screen.getByText('Bitte Anschrift eintragen.')).toBeTruthy();
  });

  it('speaks English under en', () => {
    registerMessages('en');
    renderGate();
    expect(screen.getByRole('heading', { name: 'Complete the imprint' })).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
    expect(screen.getByPlaceholderText('Street no., postcode city')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('Please enter Name.')).toBeTruthy();
    expect(screen.getByText('Please enter the address.')).toBeTruthy();
    expect(screen.queryByText(/Impressum/)).toBeNull();
  });
});
