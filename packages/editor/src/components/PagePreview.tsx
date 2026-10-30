// SPDX-License-Identifier: MPL-2.0
/**
 * PagePreview — one page drawn read-only through GenericCanvas, reported as a
 * PNG data URL once it has settled.
 *
 * The same renderer as the editor stage, mounted without the editor shell: a
 * second renderer would drift from what the editor shows. Settled means the
 * images are in (`imagesSettled`) and the fonts are loaded (`ensureFontsReady`),
 * the same two gates the thumbnails and the export use. A page whose image
 * never arrives is reported after `SETTLE_TIMEOUT_MS` rather than hanging a queue.
 */
import { useEffect, useRef } from 'react';

import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import { ensureFontsReady } from '../utils/ensureFontsReady.js';

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
  /** The page's format; absent: the default format. */
  formatId?: string;
}

export function PagePreview({
  config,
  state,
  width,
  onRendered,
  onFailed,
  formatId,
}: PagePreviewProps) {
  const canvasRef = useRef<GenericCanvasRef>(null);
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
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
          await ensureFontsReady();
          if (cancelled) return;
          let dataUrl: string | undefined;
          try {
            dataUrl = ref.toDataURL({ format: 'png', pixelRatio: width / stageWidth });
          } catch {
            dataUrl = undefined;
          }
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
        readOnly
      />
    </AutoSaveStoreProvider>
  );
}
