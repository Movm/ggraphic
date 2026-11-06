// SPDX-License-Identifier: AGPL-3.0-only
import { useCanvasEditorServices } from '../../CanvasEditorProvider.js';
import { useMessages } from '../../i18n/messages.js';
import { Button } from '../../ui/button.js';
import { Input } from '../../ui/input.js';
import { Label } from '../../ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.js';
import { Skeleton } from '../../ui/skeleton.js';
import { Switch } from '../../ui/switch.js';
import { downloadErrorMessage } from '../../utils/downloadError.js';
import { useId, useState, type FormEvent } from 'react';
import { PiDownloadSimple } from 'react-icons/pi';

import { MOBILE_INPUT_TEXT } from '../../sidebar/sidebarStyles.js';
import { DownloadNotice } from '../DownloadNotice.js';

import type {
  CanvasImprintLocale,
  CanvasImprintParts,
  CanvasImprintService,
} from '../../hostServices.js';
import type { ExportReport } from '../../export/scene/types.js';

export type CanvasDownloadChoice = 'png' | 'jpeg' | 'webp';

type DownloadChoice = CanvasDownloadChoice | 'pdf' | 'pptx' | 'svg';

/** Print formats: PDF with bleed and crop marks is the default download. */
export interface PrintExportProps {
  /** Resolves with what could not stay vector and whether a raster PDF was made instead, if it knows. */
  onDownloadPdf: () => Promise<ExportReport | void>;
  /** Notices for photos too small to print well. */
  getWarnings: () => string[];
  /** Posters only: warns (without blocking) while this is missing or a placeholder. */
  impressum?: PrintImpressumGate | null;
}

/**
 * Digitale Folien-Decks: „PowerPoint (.pptx)“ ist die Vorgabe, „PDF“ ein PDF
 * mit allen Seiten, ohne Druckmarken.
 */
export interface SlideDeckExportProps {
  /** As `PrintExportProps.onDownloadPdf`. */
  onDownloadPdf: () => Promise<ExportReport | void>;
  /** Meldet nach jeder geschriebenen Folie den Fortschritt. */
  onDownloadPptx: (onProgress: (done: number, total: number) => void) => Promise<void>;
  /** Welche Hausschriften das Deck trägt: deutsche oder österreichische Marke. */
  locale: DeckLocale;
}

type DeckLocale = 'de-DE' | 'de-AT';

/**
 * SVG for every format, and the PDF of a digital format (a print format and a slide deck have
 * theirs in `PrintExportProps` and `SlideDeckExportProps`). `category` decides what the SVG choice
 * offers: only a digital format has a page background to leave out (a print page or a slide
 * always has one).
 */
export interface VectorExportProps {
  category: 'print' | 'slides' | 'digital';
  /** The PDF with every page. Resolves with what could not stay vector or is missing. */
  onDownloadPdf: () => Promise<ExportReport>;
  /** Resolves with what could not stay vector or is missing, which the section tells the person. */
  onDownloadSvg: (options: {
    pages: 'current' | 'all';
    text: 'outlines' | 'editable';
    transparent: boolean;
  }) => Promise<ExportReport>;
}

export interface PrintImpressumGate {
  /** False until every poster page has reported its state; no warning until then. */
  ready: boolean;
  locale: CanvasImprintLocale;
  /** The impressum line on the canvas; null when the element is gone. */
  text: string | null;
  /** Writes the line to the canvas (updates the element, or re-adds it). */
  onSubmit: (parts: CanvasImprintParts) => void;
}

function ImpressumForm({
  gate,
  impressum,
}: {
  gate: PrintImpressumGate;
  impressum: CanvasImprintService;
}) {
  const t = useMessages();
  const { isFilled } = impressum;
  const fieldId = useId();
  const labels = impressum.labels[gate.locale];
  const current = impressum.parse(gate.locale, gate.text ?? '');
  const initial = (value: string) => (isFilled(value) ? value : '');
  const [name, setName] = useState(initial(current.name));
  const [address, setAddress] = useState(initial(current.address));
  const [touched, setTouched] = useState(false);
  const valid = impressum.isComplete({ name, address });
  const nameError =
    touched && !isFilled(name) ? t.shell.downloadPanel.imprintNameRequired(labels.name) : null;
  const addressError =
    touched && !isFilled(address) ? t.shell.downloadPanel.imprintAddressRequired : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) gate.onSubmit({ name, address });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <h4 className="m-0 text-sm font-semibold text-foreground">
        {t.shell.downloadPanel.imprintHeading}
      </h4>
      <p className="m-0 text-xs text-foreground-muted">{labels.hint}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-name`} className="text-xs font-medium text-foreground-muted">
          {labels.name}
        </Label>
        <Input
          id={`${fieldId}-name`}
          className={MOBILE_INPUT_TEXT}
          value={name}
          placeholder={labels.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameError !== null}
          {...(nameError ? { 'aria-describedby': `${fieldId}-name-error` } : {})}
        />
        {nameError && (
          <p id={`${fieldId}-name-error`} role="alert" className="m-0 text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-address`} className="text-xs font-medium text-foreground-muted">
          {t.shell.downloadPanel.imprintAddress}
        </Label>
        <Input
          id={`${fieldId}-address`}
          className={MOBILE_INPUT_TEXT}
          value={address}
          placeholder={t.shell.downloadPanel.imprintAddressPlaceholder}
          onChange={(e) => setAddress(e.target.value)}
          aria-invalid={addressError !== null}
          {...(addressError ? { 'aria-describedby': `${fieldId}-address-error` } : {})}
        />
        {addressError && (
          <p id={`${fieldId}-address-error`} role="alert" className="m-0 text-xs text-destructive">
            {addressError}
          </p>
        )}
      </div>
      <Button type="submit" variant="brand" className="w-full rounded-lg">
        {t.shell.downloadPanel.imprintSubmit}
      </Button>
    </form>
  );
}

function ProgressBar({ progress }: { progress: { current: number; total: number } }) {
  return (
    <div className="relative w-full h-5 bg-editor-tile rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-primary-600 rounded-full transition-[width] duration-300"
        style={{ width: `${(progress.current / progress.total) * 100}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
        {progress.current}/{progress.total}
      </span>
    </div>
  );
}

export interface DownloadSectionProps {
  onDownload: (
    format: CanvasDownloadChoice,
    pixelRatio: number,
    transparent: boolean
  ) => void | Promise<void>;
  onDownloadAllZip?: (format: CanvasDownloadChoice) => Promise<void>;
  pageCount: number;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
  exportError?: string | null;
  exportNotice?: string | null;
  printExport?: PrintExportProps | null;
  slideDeck?: SlideDeckExportProps | null;
  vectorExport?: VectorExportProps | null;
}

const DEFAULT_RASTER_PIXEL_RATIO = 1;
const SCALE_OPTIONS = [1, 2] as const;

export function DownloadSection({
  onDownload,
  onDownloadAllZip,
  pageCount,
  isMultiExporting = false,
  exportProgress,
  exportError,
  exportNotice,
  printExport = null,
  slideDeck = null,
  vectorExport = null,
}: DownloadSectionProps) {
  const t = useMessages();
  const [choice, setChoice] = useState<DownloadChoice>(
    printExport ? 'pdf' : slideDeck ? 'pptx' : 'png'
  );
  const [pptxProgress, setPptxProgress] = useState<{ current: number; total: number } | null>(null);
  const [printWarnings] = useState<string[]>(() => printExport?.getWarnings() ?? []);
  const [scale, setScale] = useState<number>(DEFAULT_RASTER_PIXEL_RATIO);
  const [transparent, setTransparent] = useState(false);
  const [keepTextEditable, setKeepTextEditable] = useState(false);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [pageSelection, setPageSelection] = useState<'current' | 'all'>('current');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fieldId = useId();
  // Without the host's print service no format carries an impressum.
  const { print, carousel } = useCanvasEditorServices();
  const impressum = print?.imprint ?? null;

  const isPdf = choice === 'pdf' && printExport !== null;
  const impressumGate = isPdf && impressum ? (printExport?.impressum ?? null) : null;
  const impressumMissing =
    impressum !== null &&
    impressumGate?.ready === true &&
    !impressum.isComplete(impressum.parse(impressumGate.locale, impressumGate.text ?? ''));
  const isSlidesPdf = choice === 'pdf' && slideDeck !== null;
  // A digital format has no print or slide service: its PDF comes with the vector export.
  const isDigitalPdf = choice === 'pdf' && !printExport && !slideDeck && vectorExport !== null;
  const isPptx = choice === 'pptx' && slideDeck !== null;
  const isSvg = choice === 'svg' && vectorExport !== null;
  // A PDF always holds every page, so it asks nothing.
  const isMultiPage =
    pageCount > 1 &&
    (isSvg || (onDownloadAllZip && !isPdf && !isSlidesPdf && !isDigitalPdf && !isPptx));
  // What the person is told after a vector download: SVG, and every PDF but the old raster one.
  const reportsExport = isSvg || choice === 'pdf';
  // JPEG has no alpha channel — the transparency toggle is only meaningful for
  // PNG/WebP.
  const supportsTransparency = choice !== 'jpeg';
  // A print page or a slide always has its background; only a digital format can leave it out.
  const svgTransparency = vectorExport?.category === 'digital';
  const rasterFormat: CanvasDownloadChoice =
    choice === 'pdf' || choice === 'pptx' || choice === 'svg' ? 'png' : choice;
  const downloadPanel = t.shell.downloadPanel;
  // Once each, in the order they happened: the same reason on three photos is one phrase.
  const rasterReasons = [
    ...new Set(report?.rasterIslands.map((island) => downloadPanel.rasterReason[island.reason])),
  ];

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setReport(null);
    try {
      if (isSvg && vectorExport) {
        setReport(
          await vectorExport.onDownloadSvg({
            pages: pageCount > 1 ? pageSelection : 'current',
            text: keepTextEditable ? 'editable' : 'outlines',
            transparent: svgTransparency && transparent,
          })
        );
        return;
      }
      if (choice === 'pdf' && printExport) {
        setReport((await printExport.onDownloadPdf()) ?? null);
        return;
      }
      if (isSlidesPdf && slideDeck) {
        setReport((await slideDeck.onDownloadPdf()) ?? null);
        return;
      }
      if (isDigitalPdf && vectorExport) {
        setReport(await vectorExport.onDownloadPdf());
        return;
      }
      if (isPptx && slideDeck) {
        setPptxProgress({ current: 0, total: pageCount });
        await slideDeck.onDownloadPptx((current, total) => setPptxProgress({ current, total }));
        return;
      }
      if (pageSelection === 'all' && onDownloadAllZip) {
        await onDownloadAllZip(rasterFormat);
        return;
      }
      await onDownload(rasterFormat, scale, supportsTransparency && transparent);
    } catch (err) {
      console.error('[DownloadSection] Download failed:', err);
      setDownloadError(downloadErrorMessage(err));
    } finally {
      setIsDownloading(false);
      setPptxProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-format`} className="text-xs font-medium text-foreground-muted">
          {t.shell.downloadPanel.format}
        </Label>
        <Select
          value={choice}
          onValueChange={(v) => {
            setChoice(v as DownloadChoice);
            // What the last download reported is about that format only.
            setReport(null);
          }}
        >
          <SelectTrigger id={`${fieldId}-format`} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[10001]">
            {printExport && <SelectItem value="pdf">{t.shell.downloadPanel.pdfPrint}</SelectItem>}
            {slideDeck && <SelectItem value="pptx">PowerPoint (.pptx)</SelectItem>}
            {slideDeck && <SelectItem value="pdf">PDF</SelectItem>}
            {vectorExport && (printExport || slideDeck) && (
              <SelectItem value="svg">{downloadPanel.svg}</SelectItem>
            )}
            <SelectItem value="png">PNG</SelectItem>
            {!printExport && <SelectItem value="jpeg">JPG</SelectItem>}
            {!printExport && <SelectItem value="webp">WebP</SelectItem>}
            {vectorExport && !printExport && !slideDeck && (
              <>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="svg">{downloadPanel.svg}</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Resolution + transparency only apply to single-page export; the
          multi-page ZIP path renders at fixed settings, in the chosen format. */}
      {!isPdf &&
        !isSlidesPdf &&
        !isDigitalPdf &&
        !isPptx &&
        !isSvg &&
        pageSelection === 'current' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`${fieldId}-scale`}
                className="text-xs font-medium text-foreground-muted"
              >
                {t.shell.downloadPanel.resolution}
              </Label>
              <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
                <SelectTrigger id={`${fieldId}-scale`} size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[10001]">
                  {SCALE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}×{' '}
                      {s === DEFAULT_RASTER_PIXEL_RATIO ? t.shell.downloadPanel.defaultMark : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {supportsTransparency && (
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor={`${fieldId}-transparent`}
                  className="text-xs font-medium text-foreground-muted"
                >
                  {t.shell.downloadPanel.transparentBackground}
                </Label>
                <Switch
                  id={`${fieldId}-transparent`}
                  checked={transparent}
                  onCheckedChange={setTransparent}
                />
              </div>
            )}
          </>
        )}

      {isSvg && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={`${fieldId}-editable-text`}
                className="text-xs font-medium text-foreground-muted"
              >
                {downloadPanel.keepTextEditable}
              </Label>
              <Switch
                id={`${fieldId}-editable-text`}
                aria-describedby={`${fieldId}-editable-text-hint`}
                checked={keepTextEditable}
                onCheckedChange={setKeepTextEditable}
              />
            </div>
            <p id={`${fieldId}-editable-text-hint`} className="m-0 text-xs text-foreground-muted">
              {downloadPanel.keepTextEditableHint}
            </p>
          </div>
          {svgTransparency && (
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={`${fieldId}-transparent`}
                className="text-xs font-medium text-foreground-muted"
              >
                {downloadPanel.transparentBackground}
              </Label>
              <Switch
                id={`${fieldId}-transparent`}
                checked={transparent}
                onCheckedChange={setTransparent}
              />
            </div>
          )}
        </>
      )}

      {isMultiPage && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-pages`} className="text-xs font-medium text-foreground-muted">
            {t.shell.downloadPanel.selectPages}
          </Label>
          <Select
            value={pageSelection}
            onValueChange={(v) => setPageSelection(v as 'current' | 'all')}
          >
            <SelectTrigger id={`${fieldId}-pages`} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[10001]">
              <SelectItem value="current">{t.shell.downloadPanel.currentPage}</SelectItem>
              <SelectItem value="all">{t.shell.allPagesZip(pageCount)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isMultiExporting && exportProgress && exportProgress.total > 0 && (
        <ProgressBar progress={exportProgress} />
      )}
      {pptxProgress && pptxProgress.total > 0 && <ProgressBar progress={pptxProgress} />}

      {impressumMissing && impressumGate && impressum && (
        <>
          <DownloadNotice tone="info">{t.shell.downloadPanel.imprintMissingNotice}</DownloadNotice>
          <ImpressumForm gate={impressumGate} impressum={impressum} />
        </>
      )}

      {isPdf && print?.untestedNotice && (
        <DownloadNotice tone="info">{print.untestedNotice}</DownloadNotice>
      )}
      {isPptx && slideDeck && carousel?.pptxFontHint && (
        <DownloadNotice tone="info">{carousel.pptxFontHint[slideDeck.locale]}</DownloadNotice>
      )}
      {isPdf &&
        printWarnings.map((warning) => (
          <DownloadNotice key={warning} tone="info">
            {warning}
          </DownloadNotice>
        ))}
      {downloadError && <DownloadNotice>{downloadError}</DownloadNotice>}
      {exportError && !isMultiExporting && <DownloadNotice>{exportError}</DownloadNotice>}
      {exportNotice && <DownloadNotice tone="info">{exportNotice}</DownloadNotice>}

      <Button
        variant="brand"
        className="w-full rounded-lg"
        onClick={handleDownload}
        disabled={isDownloading || isMultiExporting}
      >
        {isDownloading || isMultiExporting ? (
          <Skeleton className="size-3.5 rounded-full" />
        ) : (
          <PiDownloadSimple className="size-3.5" />
        )}
        {isDownloading ? t.shell.downloading : t.shell.download}
      </Button>

      {reportsExport && report?.fallback && (
        <DownloadNotice tone="info">
          {downloadPanel.pdfFallbackNotice[report.fallback.kind]}
        </DownloadNotice>
      )}
      {reportsExport && report && report.missingElements.length > 0 && (
        <DownloadNotice>
          {downloadPanel.missingNotice(report.missingElements.length)}
        </DownloadNotice>
      )}
      {reportsExport && report && report.defaultInstanceFonts.length > 0 && (
        <DownloadNotice tone="info">
          {downloadPanel.variableFontNotice(report.defaultInstanceFonts.join(', '))}
        </DownloadNotice>
      )}
      {reportsExport && rasterReasons.length > 0 && (
        <DownloadNotice tone="info">
          {downloadPanel.rasterNotice(rasterReasons.join(', '))}
        </DownloadNotice>
      )}
    </div>
  );
}
