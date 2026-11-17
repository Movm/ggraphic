// SPDX-License-Identifier: AGPL-3.0-only
/**
 * PagePreview — one page drawn read-only through GenericCanvas, reported as a
 * PNG data URL once it has settled.
 *
 * The same renderer as the editor stage, mounted without the editor shell: a
 * second renderer would drift from what the editor shows. Settled means the
 * images are in (`imagesSettled`) and the fonts are loaded (`ensureFontsReady`),
 * the same two gates the thumbnails and the export use; the PNG is encoded off
 * the main thread. A page whose image
 * never arrives is reported after `SETTLE_TIMEOUT_MS` rather than hanging a queue.
 */
import { useEffect, useRef } from 'react';

import { getCanvasFormatOrDefault } from '../formats/index.js';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider.js';

import { GenericCanvas, type GenericCanvasRef } from './GenericCanvas.js';

import type { FullCanvasConfig } from '../configs/types.js';

const POLL_MS = 50;
const SETTLE_TIMEOUT_MS = 8000;
const noop = () => {};

export interface PagePreviewProps {
  config: FullCanvasConfig;
  state: Record<string, unknown>;
  /** Width of the reported image in px. */
  width: number;
  /** Called once, with a PNG data URL. */
  onRendered: (dataUrl: string) => void;
  /** Called once instead, when the page could not be drawn or produced no image. */
  onFailed?: () => void;
  /**
   * Called once with the page's canvas handle when it has settled, just before the image is
   * encoded; the handle stays valid while the preview is mounted. For a host that reads more than
   * the PNG off the same stage (the render gate exports it as SVG and PDF).
   */
  onCanvas?: (canvas: GenericCanvasRef) => void;
  /** The page's format; absent: the default format. */
  formatId?: string;
}

export function PagePreview({
  config,
  state,
  width,
  onRendered,
  onFailed,
  onCanvas,
  formatId,
}: PagePreviewProps) {
  const canvasRef = useRef<GenericCanvasRef>(null);
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const onCanvasRef = useRef(onCanvas);
  onCanvasRef.current = onCanvas;
  const stageWidth = getCanvasFormatOrDefault(formatId).width;

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      while (!cancelled) {
        const ref = canvasRef.current;
        const late = Date.now() - startedAt > SETTLE_TIMEOUT_MS;
        if (!ref && late) return onFailedRef.current?.();
        if (ref && (ref.imagesSettled() || late)) {
          onCanvasRef.current?.(ref);
          // Waits for the fonts, then encodes off the main thread: a gallery keeps scrolling.
          const dataUrl = await ref.captureCanvas({
            format: 'png',
            pixelRatio: width / stageWidth,
            keepPlaceholders: true,
          });
          if (cancelled) return;
          if (dataUrl) onRenderedRef.current(dataUrl);
          else onFailedRef.current?.();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
    // One render per mount: the host remounts (key) for another page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AutoSaveStoreProvider>
      <GenericCanvas
        forwardedRef={canvasRef}
        config={config}
        {...(formatId ? { formatId } : {})}
        initialProps={state}
        onExport={noop}
        onCancel={noop}
        callbacks={{}}
        preview
        previewCaptureRatio={width / stageWidth}
        readOnly
      />
    </AutoSaveStoreProvider>
  );
}
