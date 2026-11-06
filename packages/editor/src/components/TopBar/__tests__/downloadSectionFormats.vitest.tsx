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

function renderSection(
  category: Category,
  over: Partial<DownloadSectionProps> = {},
  onDownloadSvg: (options: SvgOptions) => Promise<ExportReport> = vi.fn(async () => emptyReport()),
  // What the PDF of this category answers: the print and slide services, or the vector export.
  pdfReport: ExportReport | void = emptyReport()
) {
  const user = userEvent.setup();
  const onDownloadPdf = vi.fn(async () => pdfReport);
  const printExport = { onDownloadPdf, getWarnings: () => [] };
  const slideDeck = { onDownloadPdf, onDownloadPptx: vi.fn(), locale: 'de-DE' as const };
  render(
    <DownloadSection
      onDownload={vi.fn()}
      pageCount={1}
      printExport={category === 'print' ? printExport : null}
      slideDeck={category === 'slides' ? slideDeck : null}
      vectorExport={{
        category,
        onDownloadSvg,
        onDownloadPdf: onDownloadPdf as () => Promise<ExportReport>,
      }}
      {...over}
    />
  );
  return { user, onDownloadSvg, onDownloadPdf };
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
    ['digital', 'PNG', ['PNG', 'JPG', 'WebP', 'PDF', 'SVG (Vektor)']],
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

    expect(await optionsOf(user)).toEqual(['PNG', 'JPG', 'WebP', 'PDF', 'SVG (vector)']);
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

describe('the PDF choice', () => {
  async function choosePdf(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(formatPicker());
    await user.click(screen.getByRole('option', { name }));
  }
  const download = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Herunterladen' }));

  it.each([
    ['print', 'PDF (Druck)'],
    ['slides', 'PDF'],
    ['digital', 'PDF'],
  ] as const)('%s: "%s" downloads through the vector path', async (category, name) => {
    const { user, onDownloadPdf, onDownloadSvg } = renderSection(category);
    // The print format is preselected; the others are chosen.
    if (category !== 'print') await choosePdf(user, name);
    expect(formatPicker().textContent).toBe(name);

    await download(user);

    expect(onDownloadPdf).toHaveBeenCalledTimes(1);
    expect(onDownloadSvg).not.toHaveBeenCalled();
  });

  it('asks nothing of the PDF of a digital document: it holds every page, as it is', async () => {
    const { user } = renderSection('digital', { pageCount: 3, onDownloadAllZip: vi.fn() });
    expect(screen.getByRole('combobox', { name: 'Seiten auswählen' })).toBeTruthy();

    await choosePdf(user, 'PDF');

    expect(screen.queryByRole('combobox', { name: 'Seiten auswählen' })).toBeNull();
    expect(screen.queryByText('Auflösung')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Transparenter Hintergrund' })).toBeNull();
  });

  describe('the notice', () => {
    const fallback = (): ExportReport => ({
      ...emptyReport(),
      fallback: { kind: 'fonts', reason: 'fonts' },
    });
    const NOTICE =
      'Das PDF wurde als Bild erzeugt, weil nicht alle Schriften geladen werden konnten.';

    it.each([
      ['print', 'PDF (Druck)'],
      ['slides', 'PDF'],
      ['digital', 'PDF'],
    ] as const)('%s: a report with a fallback says the pdf is an image', async (category, name) => {
      const { user } = renderSection(category, {}, undefined, fallback());
      if (category !== 'print') await choosePdf(user, name);
      expect(screen.queryByText(NOTICE)).toBeNull();

      await download(user);

      const notice = await screen.findByText(NOTICE);
      expect(notice.getAttribute('role')).toBe('status');
    });

    it.each([
      [
        'timeout',
        'Das PDF wurde als Bild erzeugt, weil die Vektor-Erzeugung zu lange gedauert hat.',
      ],
      ['error', 'Das PDF wurde als Bild erzeugt, weil die Vektor-Erzeugung fehlgeschlagen ist.'],
    ] as const)('says why for a %s fallback', async (kind, text) => {
      const { user } = renderSection('digital', {}, undefined, {
        ...emptyReport(),
        fallback: { kind, reason: 'x' },
      });
      await choosePdf(user, 'PDF');

      await download(user);

      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('speaks English under en', async () => {
      registerMessages('en');
      const { user } = renderSection('digital', {}, undefined, fallback());
      await user.click(formatPicker());
      await user.click(screen.getByRole('option', { name: 'PDF' }));

      await user.click(screen.getByRole('button', { name: 'Download' }));

      expect(
        await screen.findByText(
          'The PDF was made as an image because not all fonts could be loaded.'
        )
      ).toBeTruthy();
    });

    it('names the raster islands and the missing elements of a vector pdf, like the SVG does', async () => {
      const { user } = renderSection('digital', {}, undefined, {
        ...emptyReport(),
        rasterIslands: [{ page: 1, elementId: 'badge', reason: 'shadow' }],
        missingElements: [{ page: 1, elementId: 'x', reason: 'image-unreadable' }],
      });
      await choosePdf(user, 'PDF');

      await download(user);

      expect(await screen.findByText('Als Bild eingebettet: Schatten')).toBeTruthy();
      expect(
        screen.getByText('1 Element(e) fehlen, weil ihr Bild nicht geladen werden konnte.')
      ).toBeTruthy();
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('says nothing when a host’s PDF service tells nothing', async () => {
      const { user, onDownloadPdf } = renderSection('print', {}, undefined, undefined);

      await download(user);

      expect(onDownloadPdf).toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('is not shown under SVG, and an SVG notice is not shown under PDF', async () => {
      const { user } = renderSection(
        'digital',
        {},
        async () => ({
          ...emptyReport(),
          rasterIslands: [{ page: 1, elementId: 'badge', reason: 'shadow' }],
        }),
        fallback()
      );
      await choosePdf(user, 'PDF');
      await download(user);
      await screen.findByText(NOTICE);

      await user.click(formatPicker());
      await user.click(screen.getByRole('option', { name: 'SVG (Vektor)' }));
      // Gone for good, not only hidden: nothing from the PDF comes back with the format.
      expect(screen.queryByText(NOTICE)).toBeNull();
      await download(user);
      await screen.findByText('Als Bild eingebettet: Schatten');
      expect(screen.queryByText(NOTICE)).toBeNull();

      await choosePdf(user, 'PDF');
      expect(screen.queryByText(/Als Bild eingebettet/)).toBeNull();
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('goes away with the format', async () => {
      const { user } = renderSection('digital', {}, undefined, fallback());
      await choosePdf(user, 'PDF');
      await download(user);
      await screen.findByText(NOTICE);

      await user.click(formatPicker());
      await user.click(screen.getByRole('option', { name: 'PNG' }));

      expect(screen.queryByText(NOTICE)).toBeNull();
    });
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
