// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { registerMessages } from '../../../i18n/messages.js';
import { emptyReport, type ExportReport } from '../../../export/scene/types.js';
import { axe } from '../../../test-utils.js';
import { DownloadSection, type DownloadSectionProps } from '../DownloadSection.js';

// Radix Select asks the pointer-capture and scroll APIs jsdom does not have.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => registerMessages('de'));

type Category = 'print' | 'slides' | 'digital';
type SvgOptions = { pages: 'current' | 'all'; text: 'outlines' | 'editable'; transparent: boolean };

const printExport = { onDownloadPdf: vi.fn(), getWarnings: () => [] };
const slideDeck = { onDownloadPdf: vi.fn(), onDownloadPptx: vi.fn(), locale: 'de-DE' as const };

function renderSection(
  category: Category,
  over: Partial<DownloadSectionProps> = {},
  onDownloadSvg: (options: SvgOptions) => Promise<ExportReport> = vi.fn(async () => emptyReport())
) {
  const user = userEvent.setup();
  render(
    <DownloadSection
      onDownload={vi.fn()}
      pageCount={1}
      printExport={category === 'print' ? printExport : null}
      slideDeck={category === 'slides' ? slideDeck : null}
      vectorExport={{ category, onDownloadSvg }}
      {...over}
    />
  );
  return { user, onDownloadSvg };
}

const formatPicker = () => screen.getByRole('combobox', { name: 'Format' });

async function optionsOf(user: ReturnType<typeof userEvent.setup>) {
  await user.click(formatPicker());
  const names = screen.getAllByRole('option').map((option) => option.textContent);
  await user.keyboard('{Escape}');
  return names;
}

async function chooseSvg(user: ReturnType<typeof userEvent.setup>) {
  await user.click(formatPicker());
  await user.click(screen.getByRole('option', { name: 'SVG (Vektor)' }));
}

describe('formats per category', () => {
  it.each([
    ['print', 'PDF (Druck)', ['PDF (Druck)', 'SVG (Vektor)', 'PNG']],
    [
      'slides',
      'PowerPoint (.pptx)',
      ['PowerPoint (.pptx)', 'PDF', 'SVG (Vektor)', 'PNG', 'JPG', 'WebP'],
    ],
    ['digital', 'PNG', ['PNG', 'JPG', 'WebP', 'SVG (Vektor)']],
  ] as const)('%s: default %s, options in order', async (category, preselected, options) => {
    const { user } = renderSection(category);

    expect(formatPicker().textContent).toBe(preselected);
    expect(await optionsOf(user)).toEqual(options);
  });

  it('offers no SVG to a host that gives no vector export', async () => {
    const user = userEvent.setup();
    render(<DownloadSection onDownload={vi.fn()} pageCount={1} />);

    expect(await optionsOf(user)).toEqual(['PNG', 'JPG', 'WebP']);
  });

  it('names the format in English under en', async () => {
    registerMessages('en');
    const { user } = renderSection('digital');

    expect(await optionsOf(user)).toEqual(['PNG', 'JPG', 'WebP', 'SVG (vector)']);
  });
});

describe('the SVG choice', () => {
  it('shows the "keep text editable" switch, off by default', async () => {
    const { user } = renderSection('digital');
    await chooseSvg(user);

    const keep = screen.getByRole('switch', { name: 'Text bearbeitbar lassen' });
    expect(keep.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Sieht nur richtig aus, wo die Schrift installiert ist.')).toBeTruthy();
  });

  it('shows the transparency switch for digital formats only', async () => {
    const digital = renderSection('digital');
    await chooseSvg(digital.user);
    expect(screen.getByRole('switch', { name: 'Transparenter Hintergrund' })).toBeTruthy();
  });

  it.each(['print', 'slides'] as const)(
    'hides the transparency switch for %s',
    async (category) => {
      const { user } = renderSection(category);
      await chooseSvg(user);

      expect(screen.queryByRole('switch', { name: 'Transparenter Hintergrund' })).toBeNull();
      expect(screen.getByRole('switch', { name: 'Text bearbeitbar lassen' })).toBeTruthy();
    }
  );

  it('hides the resolution select', async () => {
    const { user } = renderSection('digital');
    expect(screen.getByText('Auflösung')).toBeTruthy();

    await chooseSvg(user);

    expect(screen.queryByText('Auflösung')).toBeNull();
  });

  it('downloads with outlines and the page, and with editable text when asked', async () => {
    const { user, onDownloadSvg } = renderSection('digital');
    await chooseSvg(user);

    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(onDownloadSvg).toHaveBeenLastCalledWith({
      pages: 'current',
      text: 'outlines',
      transparent: false,
    });

    await user.click(screen.getByRole('switch', { name: 'Text bearbeitbar lassen' }));
    await user.click(screen.getByRole('switch', { name: 'Transparenter Hintergrund' }));
    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(onDownloadSvg).toHaveBeenLastCalledWith({
      pages: 'current',
      text: 'editable',
      transparent: true,
    });
  });

  it('never asks a print or slide format for a transparent page', async () => {
    const { user, onDownloadSvg } = renderSection('print');
    // The raster switch may have been turned on before the format changed.
    await user.click(screen.getByRole('combobox', { name: 'Format' }));
    await user.click(screen.getByRole('option', { name: 'PNG' }));
    await user.click(screen.getByRole('switch', { name: 'Transparenter Hintergrund' }));
    await chooseSvg(user);

    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));

    expect(onDownloadSvg).toHaveBeenCalledWith(expect.objectContaining({ transparent: false }));
  });

  it('asks which pages for a document with several, and downloads them all as chosen', async () => {
    const { user, onDownloadSvg } = renderSection('digital', {
      pageCount: 3,
      onDownloadAllZip: vi.fn(),
    });
    await chooseSvg(user);

    await user.click(screen.getByRole('combobox', { name: 'Seiten auswählen' }));
    await user.click(screen.getByRole('option', { name: 'Alle 3 Seiten (ZIP)' }));
    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));

    expect(onDownloadSvg).toHaveBeenCalledWith(expect.objectContaining({ pages: 'all' }));
  });
});

describe('the notice after an SVG download', () => {
  const report = (): ExportReport => ({
    ...emptyReport(),
    rasterIslands: [
      { page: 1, elementId: 'photo', reason: 'filter' },
      { page: 1, elementId: 'badge', reason: 'shadow' },
      { page: 2, elementId: 'photo-2', reason: 'filter' },
    ],
  });

  it('lists the reasons of the raster islands once each, in one line', async () => {
    const { user } = renderSection('digital', {}, async () => report());
    await chooseSvg(user);
    expect(screen.queryByText(/Als Bild eingebettet/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));

    const notice = await screen.findByText('Als Bild eingebettet: Foto mit Filter, Schatten');
    expect(notice.getAttribute('role')).toBe('status');
  });

  it('speaks English under en', async () => {
    registerMessages('en');
    const { user } = renderSection('digital', {}, async () => report());
    await user.click(screen.getByRole('combobox', { name: 'Format' }));
    await user.click(screen.getByRole('option', { name: 'SVG (vector)' }));

    await user.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText('Embedded as an image: Photo with filter, Shadow')).toBeTruthy();
  });

  it('says how many elements are missing', async () => {
    const { user } = renderSection('digital', {}, async () => ({
      ...emptyReport(),
      missingElements: [
        { page: 1, elementId: 'a', reason: 'image-unreadable' },
        { page: 1, elementId: 'b', reason: 'image-unreadable' },
      ],
    }));
    await chooseSvg(user);

    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));

    expect(
      await screen.findByText('2 Element(e) fehlen, weil ihr Bild nicht geladen werden konnte.')
    ).toBeTruthy();
    expect(screen.queryByText(/Als Bild eingebettet/)).toBeNull();
  });

  it('says nothing when everything stayed vector', async () => {
    const { user, onDownloadSvg } = renderSection('digital');
    await chooseSvg(user);

    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));

    expect(onDownloadSvg).toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('goes away with the format', async () => {
    const { user } = renderSection('digital', {}, async () => report());
    await chooseSvg(user);
    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));
    await screen.findByText(/Als Bild eingebettet/);

    await user.click(formatPicker());
    await user.click(screen.getByRole('option', { name: 'PNG' }));

    expect(screen.queryByText(/Als Bild eingebettet/)).toBeNull();
  });

  it('shows a failed download as an error, without a notice', async () => {
    const { user } = renderSection('digital', {}, async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await chooseSvg(user);

    await user.click(screen.getByRole('button', { name: 'Herunterladen' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Als Bild eingebettet/)).toBeNull();
  });
});

describe('accessibility', () => {
  it('has no axe violations with the SVG choice open', async () => {
    const { user } = renderSection('digital');
    await chooseSvg(user);
    const root = screen.getByRole('button', { name: 'Herunterladen' }).parentElement!;

    expect(await axe(root)).toHaveNoViolations();
    expect(within(root).getByRole('switch', { name: 'Text bearbeitbar lassen' })).toBeTruthy();
  });
});
