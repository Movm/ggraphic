// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The proof that the scene recorder misses nothing: record a page, replay the scene onto a plain
 * canvas, and compare the pixels with what Konva itself paints for the same page.
 *
 * The page is `__fixtures__/allElementsPage.ts`, mounted through `GenericCanvas` (what
 * `PagePreview` mounts; `PagePreview` itself reports only a PNG and keeps its stage to itself).
 * Both pictures are drawn by `@napi-rs/canvas` behind the jsdom canvases, so this checks that the
 * recorder keeps everything Konva draws, not how a browser rasterises it. The template sweep in a
 * real browser is Task 13's.
 *
 * Failing pictures go to `test-results/replay/`; set `REPLAY_DUMP=1` to write them on a passing
 * run too.
 */
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRef } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { allElementsPage } from './__fixtures__/allElementsPage.js';
import { replayScene } from './replayScene.js';
import { GenericCanvas, type GenericCanvasRef } from '../../components/GenericCanvas.js';
import { loadCanvasConfig } from '../../configs/configLoader.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';
import { registerFixtureAssets } from '../../testing/fixtureTemplates.js';
import { installNapiStageBridge, napi } from '../../testing/napiStageBridge.js';
import { diffPixels } from '../../testing/pixelDiff.js';
import { loadIconSetsFor } from '../../utils/canvasIcons.js';
import { CANVAS_ITEM_NAME } from '../../utils/deepSelect.js';
import { recordPageScene } from './recordPageScene.js';

import type { RecordedScene, SceneItem, SceneOp } from './types.js';

const WIDTH = 1080;
const HEIGHT = 1350;
/** A pixel differs when some channel is off by more than this (of 255). */
const TOLERANCE = 8;
/** At most this share of the page's pixels may differ. */
const MAX_SHARE = 0.005;
/** Pictures of circles only: the antialiased rim may differ by more than `TOLERANCE`, a hole may not. */
const RIM_TOLERANCE = 64;
const MAX_RIM_SHARE = 0.0005;
/** An element alone: at most this share of what it covers may differ. */
const MAX_ITEM_SHARE = 0.05;

// ---------------------------------------------------------------------------------------------
// Images. jsdom cannot decode them, and the primitives load theirs with `new window.Image()`.

/** A recognisable photo: a colour ramp with a diagonal cross, so a wrong crop shows. */
function makePhoto(): string {
  const canvas = napi.createCanvas(96, 72);
  const ctx = canvas.getContext('2d');
  const ramp = ctx.createLinearGradient(0, 0, 96, 72);
  ramp.addColorStop(0, '#ff7b00');
  ramp.addColorStop(0.5, '#00b4d8');
  ramp.addColorStop(1, '#7209b7');
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, 96, 72);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(96, 72);
  ctx.moveTo(96, 0);
  ctx.lineTo(0, 72);
  ctx.stroke();
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

/** What the catalogue sticker (an `https:` URL nobody fetches) looks like. */
const STICKER_DATA_URL = (() => {
  const canvas = napi.createCanvas(80, 60);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffd60a';
  ctx.beginPath();
  ctx.arc(30, 30, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 0, 110, 0.7)';
  ctx.fillRect(40, 10, 30, 40);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
})();

/**
 * Loads data URLs for real; any other URL gets `STICKER_DATA_URL`. The napi image declares `src`
 * as a field, so the accessor goes on the prototype by hand. The URL stays a string: napi fires
 * `onload` for a string source after the handler is set, but not for a decoded buffer.
 */
class TestImage extends napi.Image {}
const nativeSrc = Object.getOwnPropertyDescriptor(napi.Image.prototype, 'src')!;
Object.defineProperty(TestImage.prototype, 'src', {
  configurable: true,
  get(this: InstanceType<typeof napi.Image>) {
    return nativeSrc.get!.call(this) as unknown;
  },
  set(this: InstanceType<typeof napi.Image>, value: string) {
    nativeSrc.set!.call(this, value.startsWith('data:') ? value : STICKER_DATA_URL);
  },
});

vi.mock('use-image', async () => {
  const { Image } = await import('@napi-rs/canvas');
  return {
    default: (url: string) => {
      if (!url) return [undefined, 'loading'];
      const image = new Image();
      if (url.startsWith('data:')) image.src = url as never;
      return [image, 'loaded'];
    },
  };
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
let restoreBridge: () => void;

beforeAll(async () => {
  restoreBridge = installNapiStageBridge();
  vi.stubGlobal('Image', TestImage);
  registerFixtureAssets();
  // The page names a catalogue icon; the canvas draws it once its set is in.
  await loadIconSetsFor(['tabler:heart']);
  config = await loadCanvasConfig('fixture-poster');
}, 120_000);
afterAll(() => {
  restoreBridge();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------------------------
// Mounting, drawing, comparing

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The image nodes the page ends up with: ornament, icon, frame, illustration, asset, two photos, chart. */
const IMAGE_NODES = 8;

/**
 * Mounts the fixture page and waits until every image node holds its image. The icon, the
 * illustration and the chart load without telling `imagesSettled`, so the nodes are counted.
 */
async function mountFixture(): Promise<{ canvas: GenericCanvasRef; stage: Konva.Stage }> {
  const ref = createRef<GenericCanvasRef>();
  render(
    <AutoSaveStoreProvider>
      <GenericCanvas
        config={config as never}
        initialProps={allElementsPage({ photo: makePhoto() })}
        onExport={() => {}}
        onCancel={() => {}}
        callbacks={{}}
        forwardedRef={ref}
        preview
      />
    </AutoSaveStoreProvider>
  );
  const stage = () => Konva.stages.at(-1)!;
  const imagesIn = () =>
    stage()
      .find<Konva.Image>('Image')
      .filter((node) => node.image()).length;
  let stable = 0;
  for (let round = 0; round < 200 && stable < 3; round += 1) {
    await act(async () => {
      await sleep(50);
    });
    const settled = !!ref.current && ref.current.imageLoadState().pending === 0;
    stable = settled && imagesIn() >= IMAGE_NODES ? stable + 1 : 0;
  }
  expect(imagesIn()).toBeGreaterThanOrEqual(IMAGE_NODES);
  return { canvas: ref.current!, stage: stage() };
}

/** `loadImage`, not a synchronous `src = Buffer`: napi has the size at once but the pixels later. */
async function konvaPixels(canvas: GenericCanvasRef): Promise<Uint8ClampedArray> {
  const dataUrl = canvas.toDataURL({ format: 'png', pixelRatio: 1 });
  expect(dataUrl).toBeTruthy();
  const image = await napi.loadImage(dataUrl!);
  expect([image.width, image.height]).toEqual([WIDTH, HEIGHT]);
  const target = napi.createCanvas(WIDTH, HEIGHT);
  const ctx = target.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, WIDTH, HEIGHT).data as unknown as Uint8ClampedArray;
}

function replayPixels(
  scene: RecordedScene,
  items?: (item: SceneItem) => boolean
): Uint8ClampedArray {
  const target = napi.createCanvas(WIDTH, HEIGHT);
  const ctx = target.getContext('2d');
  replayScene(ctx as unknown as CanvasRenderingContext2D, scene, {
    ...(items && { items }),
    createCanvas: (width, height) => napi.createCanvas(width, height) as never,
  });
  return ctx.getImageData(0, 0, WIDTH, HEIGHT).data as unknown as Uint8ClampedArray;
}

function dump(
  name: string,
  konva: Uint8ClampedArray,
  replay: Uint8ClampedArray,
  diff: Uint8ClampedArray
): string {
  const dir = path.join(process.cwd(), 'test-results', 'replay');
  mkdirSync(dir, { recursive: true });
  const write = (suffix: string, data: Uint8ClampedArray) => {
    const canvas = napi.createCanvas(WIDTH, HEIGHT);
    canvas.getContext('2d').putImageData(new napi.ImageData(data, WIDTH, HEIGHT), 0, 0);
    writeFileSync(path.join(dir, `${name}-${suffix}.png`), canvas.toBuffer('image/png'));
  };
  write('konva', konva);
  write('replay', replay);
  write('diff', diff);
  return dir;
}

/** Every op of the scene, groups unpacked. */
function allOps(ops: readonly SceneOp[]): SceneOp[] {
  return ops.flatMap((op) => [op, ...(op.kind === 'group' ? allOps(op.ops) : [])]);
}

const alphaPixels = (data: Uint8ClampedArray, other: Uint8ClampedArray) => {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0 || other[i]! > 0) count += 1;
  return count;
};

describe('replay differential', () => {
  it('replay matches konva for every element kind', async () => {
    const { canvas, stage } = await mountFixture();
    // The sticker is cached for its pixel hit area; the recorder draws it from its source.
    expect(stage.find<Konva.Image>('Image').some((node) => node.isCached())).toBe(true);
    const konva = await konvaPixels(canvas);
    const scene = (await canvas.recordScene({ page: 1 }))!;
    expect([scene.width, scene.height]).toEqual([WIDTH, HEIGHT]);

    const replay = replayPixels(scene);
    const diff = diffPixels(konva, replay, WIDTH, HEIGHT, TOLERANCE);
    if (diff.share > MAX_SHARE || process.env.REPLAY_DUMP) {
      const dir = dump('all-elements', konva, replay, diff.diffRgba);
      console.info(
        `replay differential: ${diff.differing} px differ (${(diff.share * 100).toFixed(3)} %), ` +
          `box ${JSON.stringify(diff.box)}; pictures in ${dir}`
      );
    }

    // The fixture still reaches what the replay has to handle; a page that lost one of these
    // would pass the comparison without proving it.
    const ops = scene.items.flatMap((item) => allOps(item.ops));
    expect(new Set(ops.map((op) => op.kind))).toEqual(new Set(['path', 'text', 'image', 'group']));
    const paints = ops.flatMap((op) =>
      op.kind === 'path' || op.kind === 'text' ? [op.paint] : []
    );
    expect(new Set(paints.map((paint) => paint.type))).toEqual(
      new Set(['solid', 'linear', 'radial', 'pattern'])
    );
    expect(ops.some((op) => op.kind === 'path' && op.mode === 'stroke')).toBe(true);
    expect(ops.some((op) => op.kind === 'text' && op.mode === 'stroke')).toBe(true);
    expect(ops.some((op) => op.clips.length > 0)).toBe(true);
    expect(ops.some((op) => op.shadow)).toBe(true);
    expect(ops.some((op) => op.alpha < 1)).toBe(true);

    // Nothing was handed to Task 5: the fixture has no filter and no call the recorder lacks.
    expect(scene.report.unknownCalls).toEqual([]);
    expect(scene.report.rasterIslands).toEqual([]);
    expect(diff.share).toBeLessThanOrEqual(MAX_SHARE);
  }, 120_000);

  // The whole page can hide a missing element: a star is 0.5 % of the page. Each element alone is
  // compared with what Konva draws when it is the only one shown.
  it('replays each element on its own the way konva draws it', async () => {
    const { canvas, stage } = await mountFixture();
    const scene = (await canvas.recordScene({ page: 1 }))!;
    const groups = stage.find<Konva.Group>(`.${CANVAS_ITEM_NAME}`);
    expect(groups.length).toBeGreaterThanOrEqual(scene.items.length);

    const failures: string[] = [];
    for (const item of scene.items) {
      const hidden = groups.filter(
        (group) => group.visible() && group.getAttr('canvasItemId') !== item.elementId
      );
      hidden.forEach((group) => group.hide());
      let konva: Uint8ClampedArray;
      try {
        konva = await konvaPixels(canvas);
      } finally {
        hidden.forEach((group) => group.show());
      }
      const replay = replayPixels(scene, (candidate) => candidate === item);

      const diff = diffPixels(konva, replay, WIDTH, HEIGHT, TOLERANCE);
      const covered = alphaPixels(konva, replay);
      const share = covered === 0 ? 1 : diff.differing / covered;
      if (process.env.REPLAY_DUMP) {
        console.info(
          `item ${String(item.elementId)}: ${diff.differing} of ${covered} px (${(share * 100).toFixed(2)} %)`
        );
      }
      if (share > MAX_ITEM_SHARE || process.env.REPLAY_DUMP) {
        const name = `item-${String(item.elementId).replace(/[^\w-]/g, '_')}`;
        dump(name, konva, replay, diff.diffRgba);
        if (share > MAX_ITEM_SHARE) {
          failures.push(
            `${String(item.elementId)}: ${diff.differing} of ${covered} px differ (${(share * 100).toFixed(1)} %)`
          );
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  // A ring is two circles run in opposite directions, and the span of the second one is exactly a
  // turn: `Konva.Ring` draws it as arc(2π, 0, true), `Konva.Arc` of 360° as arc(0, 2π) then
  // arc(2π, 0) in the direction it was given. The recorder once read a span of a turn against its
  // direction as no arc at all, and a ring became a disc (the editor's own ring is in the fixture).
  it('replays the hole of a ring and of an arc of 360° as a hole', async () => {
    const stage = new Konva.Stage({
      container: document.createElement('div'),
      width: WIDTH,
      height: HEIGHT,
    });
    try {
      const layer = new Konva.Layer();
      stage.add(layer);
      const x = 200;
      const centres = { ring: 200, arcClockwise: 560, arcCounter: 920 };
      const radii = { innerRadius: 60, outerRadius: 150 };
      const item = (id: string, node: Konva.Shape) => {
        const group = new Konva.Group({ name: CANVAS_ITEM_NAME, canvasItemId: id });
        group.add(node);
        layer.add(group);
      };
      item('ring', new Konva.Ring({ x, y: centres.ring, fill: '#c0392b', ...radii }));
      item(
        'arc-clockwise',
        new Konva.Arc({
          x,
          y: centres.arcClockwise,
          fill: '#2980b9',
          angle: 360,
          clockwise: true,
          ...radii,
        })
      );
      item(
        'arc-counter',
        new Konva.Arc({
          x,
          y: centres.arcCounter,
          fill: '#27ae60',
          angle: 360,
          clockwise: false,
          ...radii,
        })
      );
      layer.draw();

      const image = await napi.loadImage(stage.toDataURL({ pixelRatio: 1 }));
      const target = napi.createCanvas(WIDTH, HEIGHT);
      target.getContext('2d').drawImage(image, 0, 0);
      const konva = target.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT)
        .data as unknown as Uint8ClampedArray;
      const scene = recordPageScene(stage, { page: 1 });
      const replay = replayPixels(scene);

      const alphaAt = (data: Uint8ClampedArray, x: number, y: number) =>
        data[(y * WIDTH + x) * 4 + 3]!;
      for (const [name, y] of Object.entries({
        ring: centres.ring,
        'arc clockwise': centres.arcClockwise,
        'arc counter-clockwise': centres.arcCounter,
      })) {
        // Konva draws a hole here, and the replay must too; the band round it is painted.
        expect([name, alphaAt(konva, x, y)]).toEqual([name, 0]);
        expect([name, alphaAt(replay, x, y)]).toEqual([name, 0]);
        expect([name, alphaAt(replay, x + 105, y)]).toEqual([name, 255]);
      }
      // A coarse tolerance: the rim of a circle is antialiased differently by a conic and a
      // cubic, which is not what this test is about. A disc where the hole should be is 34 000 px.
      const diff = diffPixels(konva, replay, WIDTH, HEIGHT, RIM_TOLERANCE);
      if (diff.share > MAX_RIM_SHARE || process.env.REPLAY_DUMP) {
        console.info(
          `rings: ${diff.differing} px differ, box ${JSON.stringify(diff.box)}; ` +
            `pictures in ${dump('rings', konva, replay, diff.diffRgba)}`
        );
      }
      expect(diff.share).toBeLessThanOrEqual(MAX_RIM_SHARE);
      expect(scene.report.unknownCalls).toEqual([]);
    } finally {
      stage.destroy();
    }
  }, 120_000);

  // The same turn without a hole: a wedge or an arc with no inner radius of 360° is a disc in
  // whichever direction Konva is asked to draw it, not a zero sweep.
  it('replays a wedge and an arc of 360° as a full disc, clockwise or not', async () => {
    const stage = new Konva.Stage({
      container: document.createElement('div'),
      width: WIDTH,
      height: HEIGHT,
    });
    try {
      const layer = new Konva.Layer();
      stage.add(layer);
      const x = 200;
      const shapes: { name: string; y: number; make: (y: number) => Konva.Shape }[] = [
        {
          name: 'wedge clockwise',
          y: 150,
          make: (y) =>
            new Konva.Wedge({ x, y, radius: 100, angle: 360, fill: '#c0392b', clockwise: true }),
        },
        {
          name: 'wedge counter-clockwise',
          y: 400,
          make: (y) =>
            new Konva.Wedge({ x, y, radius: 100, angle: 360, fill: '#2980b9', clockwise: false }),
        },
        {
          name: 'arc clockwise',
          y: 650,
          make: (y) =>
            new Konva.Arc({
              x,
              y,
              innerRadius: 0,
              outerRadius: 100,
              angle: 360,
              fill: '#27ae60',
              clockwise: true,
            }),
        },
        {
          name: 'arc counter-clockwise',
          y: 900,
          make: (y) =>
            new Konva.Arc({
              x,
              y,
              innerRadius: 0,
              outerRadius: 100,
              angle: 360,
              fill: '#8e44ad',
              clockwise: false,
            }),
        },
      ];
      for (const [i, shape] of shapes.entries()) {
        const group = new Konva.Group({ name: CANVAS_ITEM_NAME, canvasItemId: `disc-${i}` });
        group.add(shape.make(shape.y));
        layer.add(group);
      }
      layer.draw();

      const image = await napi.loadImage(stage.toDataURL({ pixelRatio: 1 }));
      const target = napi.createCanvas(WIDTH, HEIGHT);
      target.getContext('2d').drawImage(image, 0, 0);
      const konva = target.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT)
        .data as unknown as Uint8ClampedArray;
      const scene = recordPageScene(stage, { page: 1 });
      const replay = replayPixels(scene);

      const alphaAt = (data: Uint8ClampedArray, px: number, py: number) =>
        data[(py * WIDTH + px) * 4 + 3]!;
      for (const { name, y } of shapes) {
        // Where Konva paints, the replay paints; a zero sweep would leave both of these empty.
        for (const dx of [0, 60, -60]) {
          expect([name, dx, alphaAt(replay, x + dx, y)]).toEqual([
            name,
            dx,
            alphaAt(konva, x + dx, y),
          ]);
        }
        expect([name, alphaAt(replay, x + 60, y)]).toEqual([name, 255]);
      }
      expect(scene.report.unknownCalls).toEqual([]);
    } finally {
      stage.destroy();
    }
  }, 120_000);
});
