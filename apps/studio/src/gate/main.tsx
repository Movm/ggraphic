// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The render gate page (stage 2): `gate.html?template=<id>&scheme=<id>&brand=<id>&format=<formatId>`
 * draws one template page at full size with the bundled OFL fonts, measures every slot text with
 * the editor's own text layout (`layoutRichTextBlock` over `runMeasurer`, as `boundsOf` does) and
 * reports on `window.__gate`.
 *
 *   no `scheme`   reports the worlds the brand keeps of the template (`schemes`), draws nothing
 *   `scheme=all`  measures and draws every offered world in this one page load and reports each
 *                 on `worlds`; nothing is shown, so it is for the overflow sweep, not for goldens
 *   `list=1`      reports the templates and brands the gate covers
 *   `probe=overflow`   sets every slot text to three times its `maxChars`, which must overflow
 *
 * A dev and test entry only: `vite build` has `index.html` as its one input.
 */
import {
  brandLayout,
  offeredSchemes,
  safeArea,
  type BrandPack,
  type SchemeId,
} from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand';
import { PagePreview } from '@ggraphic/editor/shell';
import { loadCanvasConfig, type FullCanvasConfig } from '@ggraphic/editor/config';
import { getCanvasFormatOrDefault } from '@ggraphic/editor/templates';
import { ensureFontsReady, runMeasurer } from '@ggraphic/editor/text';
import { layoutRichTextBlock } from '@ggraphic/schema';
import { SAMPLE_PHOTOS } from '@ggraphic/templates-open';
import { testBrandPacks } from '@ggraphic/templates-open/test/testBrands';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { prepareBrandPack } from '../brandLoader';
import { formatSize } from '../editor/document';
import { studioCatalog, type CatalogEntry } from '../editor/templates/catalog';
import { FREE_PAGE_CONFIG_ID } from '../editor/templates/ids';
import { templatePageState } from '../editor/templates/instantiate';
import { withSamplePhotos } from '../editor/templates/samplePhotos';
import { registerEditor } from '../registerEditor';
import '../fonts';
import { type GateOverflow, type GateResult, type GateWorld } from './result';

/** A text box may end this far past its frame (rounding), as stage 1 allows. */
const SLACK = 1;
/** The probe's text is this many times the slot's `maxChars`. */
const PROBE_FACTOR = 3;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function publish(result: GateResult): void {
  window.__gate = result;
}

/** `text` repeated up to three times `maxChars` characters. */
function probeText(text: string, maxChars: number): string {
  const unit = `${text.trim() || 'word'} `;
  return unit
    .repeat(Math.ceil((maxChars * PROBE_FACTOR) / unit.length) + 1)
    .slice(0, maxChars * PROBE_FACTOR);
}

function applyProbe(state: Obj, entry: CatalogEntry): void {
  const texts = Array.isArray(state['additionalTexts']) ? state['additionalTexts'] : [];
  for (const el of texts) {
    if (!isObj(el) || typeof el['id'] !== 'string') continue;
    const maxChars = entry.template.slots[el['id']]?.budget.maxChars;
    if (maxChars !== undefined) el['text'] = probeText(String(el['text'] ?? ''), maxChars);
  }
}

/** The slot texts of the placed page that do not fit, measured with the real fonts. */
function measureOverflow(
  state: Obj,
  entry: CatalogEntry,
  brand: BrandPack,
  canvas: { width: number; height: number }
): GateOverflow[] {
  const out: GateOverflow[] = [];
  const safe = safeArea(brandLayout(brand), canvas);
  const texts = Array.isArray(state['additionalTexts']) ? state['additionalTexts'] : [];
  for (const el of texts) {
    if (!isObj(el) || typeof el['id'] !== 'string') continue;
    const slot = entry.template.slots[el['id']];
    if (!slot) continue;
    const fontSize = num(el['fontSize'], 0);
    const measure = runMeasurer(
      fontSize,
      String(el['fontFamily'] ?? ''),
      typeof el['fontStyle'] === 'string' ? el['fontStyle'] : 'normal',
      0,
      isObj(el['accent']) ? (el['accent'] as { fill: string }) : null
    );
    const lines = layoutRichTextBlock(
      String(el['text'] ?? ''),
      num(el['width'], 0),
      measure
    ).length;
    const scale = num(el['scale'], 1) || 1;
    const bottom = num(el['y'], 0) + lines * fontSize * num(el['lineHeight'], 1.2) * scale;
    const frame = entry.template.frames[el['id']] === 'canvas' ? null : safe;
    const limit = frame ? frame.y + frame.height : canvas.height;
    const maxLines = slot.budget.maxLines ?? null;
    if ((maxLines !== null && lines > maxLines) || bottom > limit + SLACK) {
      out.push({ elementId: el['id'], lines, maxLines });
    }
  }
  return out;
}

function Stage(props: {
  config: FullCanvasConfig;
  state: Obj;
  formatId: string;
  overflow: GateOverflow[];
}) {
  const { config, state, formatId, overflow } = props;
  const [src, setSrc] = useState<string | null>(null);
  return (
    <>
      {src === null && (
        <div style={{ position: 'fixed', left: -100000 }}>
          <PagePreview
            config={config}
            state={state}
            formatId={formatId}
            width={getCanvasFormatOrDefault(formatId).width}
            onRendered={setSrc}
            onFailed={() =>
              publish({ ready: true, overflow, error: 'the page could not be drawn' })
            }
          />
        </div>
      )}
      {src !== null && (
        <img
          data-testid="stage"
          alt=""
          src={src}
          style={{ display: 'block' }}
          onLoad={() => publish({ ready: true, overflow, error: null })}
        />
      )}
    </>
  );
}

interface SweepWorld {
  scheme: string;
  state: Obj;
  overflow: GateOverflow[];
}

/** Draws the worlds one after another off screen; a world that cannot be drawn is reported, not thrown. */
function Sweep(props: { config: FullCanvasConfig; formatId: string; worlds: SweepWorld[] }) {
  const { config, formatId, worlds } = props;
  const [done, setDone] = useState<GateWorld[]>([]);
  const current = worlds[done.length];
  if (!current) return null;
  const next = (error: string | null) => {
    const all = [...done, { scheme: current.scheme, overflow: current.overflow, error }];
    setDone(all);
    if (all.length === worlds.length)
      publish({ ready: true, overflow: [], error: null, worlds: all });
  };
  return (
    <div style={{ position: 'fixed', left: -100000 }}>
      <PagePreview
        key={current.scheme}
        config={config}
        state={current.state}
        formatId={formatId}
        width={getCanvasFormatOrDefault(formatId).width}
        onRendered={() => next(null)}
        onFailed={() => next('the page could not be drawn')}
      />
    </div>
  );
}

async function run(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const catalog = studioCatalog().entries.filter((e) => e.kind === 'template');
  const brands = testBrandPacks();

  if (params.get('list') === '1') {
    publish({
      ready: true,
      overflow: [],
      error: null,
      templates: catalog.map((e) => ({ id: e.id, formats: [...e.formats] })),
      brands: brands.map((b) => b.id),
    });
    return;
  }

  const entry = catalog.find((e) => e.id === params.get('template'));
  const brand = brands.find((b) => b.id === params.get('brand'));
  const formatId = params.get('format') ?? '';
  if (!entry || !brand) throw new Error('unknown template or brand');

  const offered = offeredSchemes(entry.template, brand);
  const scheme = params.get('scheme');
  if (scheme === null) {
    publish({ ready: true, overflow: [], error: null, schemes: [...offered] });
    return;
  }
  if (scheme !== 'all' && !offered.includes(scheme as SchemeId))
    throw new Error(`brand ${brand.id} does not offer ${scheme}`);

  // The brand under test is the active one before the page config and the placement read it.
  registerBrandPacks([brand]);
  await prepareBrandPack(brand);
  await ensureFontsReady();
  const config = (await loadCanvasConfig(FREE_PAGE_CONFIG_ID)) as FullCanvasConfig;
  const root = document.getElementById('root');
  if (!root) throw new Error('#root is missing in gate.html');

  if (scheme === 'all') {
    const worlds = offered.map((id): SweepWorld => {
      const placed = templatePageState(entry, formatId, { schemeId: id, brand });
      if (!placed) throw new Error(`${entry.id} cannot be placed on ${formatId}`);
      return {
        scheme: id,
        overflow: measureOverflow(placed, entry, brand, formatSize(formatId)),
        state: withSamplePhotos(placed, SAMPLE_PHOTOS, entry.id, formatSize(formatId)),
      };
    });
    if (worlds.length === 0) {
      publish({ ready: true, overflow: [], error: null, worlds: [] });
      return;
    }
    createRoot(root).render(<Sweep config={config} formatId={formatId} worlds={worlds} />);
    return;
  }

  const state = templatePageState(entry, formatId, { schemeId: scheme as SchemeId, brand });
  if (!state) throw new Error(`${entry.id} cannot be placed on ${formatId}`);
  if (params.get('probe') === 'overflow') applyProbe(state, entry);

  const overflow = measureOverflow(state, entry, brand, formatSize(formatId));
  createRoot(root).render(
    <Stage
      config={config}
      state={withSamplePhotos(state, SAMPLE_PHOTOS, entry.id, formatSize(formatId))}
      formatId={formatId}
      overflow={overflow}
    />
  );
}

publish({ ready: false, overflow: [], error: null });
registerEditor();
run().catch((error: unknown) => {
  publish({
    ready: true,
    overflow: [],
    error: error instanceof Error ? error.message : String(error),
  });
});
