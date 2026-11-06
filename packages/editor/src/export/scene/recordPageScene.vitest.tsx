// SPDX-License-Identifier: AGPL-3.0-only
// Dom lane: a real Konva stage in jsdom, drawn through the napi bridge. The recorder is the unit
// under test, so what is asserted is the scene it produces, never pixels.
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { Group, Rect } from 'react-konva';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage.js';
import { installNapiStageBridge } from '../../testing/napiStageBridge.js';
import { PAGE_ROOT_NAME, EXPORT_HIDDEN_NAME } from '../../utils/captureStage.js';
import { CANVAS_ITEM_NAME } from '../../utils/deepSelect.js';
import { HIT_ALPHA_THRESHOLD } from '../../utils/pixelHitArea.js';
import { apply, IDENTITY, multiply } from './matrix.js';
import { recordPageScene } from './recordPageScene.js';

import type { RecordedScene, SceneOp } from './types.js';

let restoreBridge: () => void;
beforeAll(() => {
  restoreBridge = installNapiStageBridge();
});
afterAll(() => restoreBridge());

const stages: Konva.Stage[] = [];
afterEach(() => {
  stages.splice(0).forEach((stage) => stage.destroy());
});

/**
 * A page as `CanvasStage` shows it: a stage at `displayScale`, one layer, and the page-root group
 * that scales the logical layout up to the format. `width`/`height` are the format in page px.
 */
function buildPage({
  width = 200,
  height = 150,
  displayScale = 0.5,
  logicalScale = 2,
}: { width?: number; height?: number; displayScale?: number; logicalScale?: number } = {}) {
  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: width * displayScale,
    height: height * displayScale,
    scaleX: displayScale,
    scaleY: displayScale,
  });
  stages.push(stage);
  const layer = new Konva.Layer();
  stage.add(layer);
  const pageRoot = new Konva.Group({
    name: PAGE_ROOT_NAME,
    scaleX: logicalScale,
    scaleY: logicalScale,
  });
  layer.add(pageRoot);
  const item = (id: string, ...nodes: Array<Konva.Group | Konva.Shape>) => {
    const group = new Konva.Group({ name: CANVAS_ITEM_NAME, canvasItemId: id });
    group.add(...nodes);
    pageRoot.add(group);
    return group;
  };
  return { stage, layer, pageRoot, item };
}

const rect = (config: Konva.RectConfig) => new Konva.Rect({ fill: '#336699', ...config });

function ops(scene: RecordedScene, elementId: string | null): SceneOp[] {
  const item = scene.items.find((i) => i.elementId === elementId);
  if (!item) throw new Error(`no item for ${String(elementId)}`);
  return item.ops;
}

function only<K extends SceneOp['kind']>(list: SceneOp[], kind: K): Extract<SceneOp, { kind: K }> {
  expect(list).toHaveLength(1);
  const op = list[0]!;
  expect(op.kind).toBe(kind);
  return op as Extract<SceneOp, { kind: K }>;
}

describe('recordPageScene', () => {
  it('records one item per canvas-item group in render order', () => {
    const { stage, layer, pageRoot, item } = buildPage();
    const background = rect({ name: 'canvas-background', x: 0, y: 0, width: 100, height: 75 });
    pageRoot.add(background);
    const first = rect({ x: 5, y: 7, width: 20, height: 10 });
    item('a', first);
    item('b', rect({ x: 30, y: 7, width: 20, height: 10, fill: '#cc0000' }));
    // The selection chrome of the editor, on the layer beside the page root.
    layer.add(new Konva.Transformer({ nodes: [first] }));

    const scene = recordPageScene(stage, {
      page: 1,
      labels: new Map([['a', 'Fläche: Eins']]),
    });

    expect(scene.items.map((i) => i.elementId)).toEqual([null, 'a', 'b']);
    expect(scene.items.map((i) => i.label)).toEqual([null, 'Fläche: Eins', null]);
    // One path op per rect: nothing came from the Transformer's anchors.
    expect(scene.items.map((i) => i.ops.map((op) => op.kind))).toEqual([
      ['path'],
      ['path'],
      ['path'],
    ]);
    expect(scene.report.rasterIslands).toEqual([]);
    expect(scene.report.unknownCalls).toEqual([]);
  });

  it('puts every matrix in page px, whatever the display scale', () => {
    const { stage, item } = buildPage({
      width: 200,
      height: 150,
      displayScale: 0.5,
      logicalScale: 2,
    });
    item('a', rect({ x: 5, y: 7, width: 20, height: 10 }));

    const scene = recordPageScene(stage, { page: 1 });

    expect([scene.width, scene.height]).toEqual([200, 150]);
    const path = only(ops(scene, 'a'), 'path');
    // Logical (5,7) is page (10,14); neither the stage scale 0.5 nor the layer is in the matrix.
    expect(path.matrix).toEqual([2, 0, 0, 2, 10, 14]);
    expect(apply(path.matrix, 0, 0)).toEqual({ x: 10, y: 14 });
  });

  it('takes the page size from the option when the stage size is rounded', () => {
    // 100 x 76 display px at scale 0.5 is 200 x 152; the format is 200 x 150.
    const { stage, item } = buildPage({ width: 200, height: 152 });
    item('a', rect({ x: 5, y: 7, width: 20, height: 10 }));

    expect(recordPageScene(stage, { page: 1 })).toMatchObject({ width: 200, height: 152 });
    expect(recordPageScene(stage, { page: 1, size: { width: 200, height: 150 } })).toMatchObject({
      width: 200,
      height: 150,
    });
  });

  it('records the logical-scale page the way CanvasStage builds it', () => {
    const ref = createRef<CanvasStageRef>();
    render(
      <CanvasStage
        ref={ref}
        width={200}
        height={150}
        logicalWidth={100}
        logicalHeight={75}
        maxContainerWidth={100}
        fitToParent={false}
      >
        <Group name={CANVAS_ITEM_NAME} canvasItemId="a">
          <Rect x={10} y={5} width={20} height={10} fill="#336699" />
        </Group>
      </CanvasStage>
    );
    const stage = ref.current!.getStage()!;
    expect(stage.scaleX()).toBe(0.5);
    expect(stage.findOne(`.${PAGE_ROOT_NAME}`)).toBeTruthy();

    const scene = recordPageScene(stage, { page: 1 });

    expect([scene.width, scene.height]).toEqual([200, 150]);
    // The brand backdrop `CanvasStage` paints under the scaled layout, then the item.
    expect(scene.items.map((i) => i.elementId)).toEqual([null, 'a']);
    expect(only(ops(scene, 'a'), 'path').matrix).toEqual([2, 0, 0, 2, 20, 10]);
  });

  it('records a page that has no page-root group (logical size equals the format)', () => {
    const stage = new Konva.Stage({
      container: document.createElement('div'),
      width: 80,
      height: 60,
    });
    stages.push(stage);
    const layer = new Konva.Layer();
    stage.add(layer);
    const group = new Konva.Group({ name: CANVAS_ITEM_NAME, canvasItemId: 'a' });
    group.add(rect({ x: 10, y: 5, width: 20, height: 10 }));
    layer.add(group);

    const scene = recordPageScene(stage, { page: 1 });

    expect([scene.width, scene.height]).toEqual([80, 60]);
    expect(only(ops(scene, 'a'), 'path').matrix).toEqual([1, 0, 0, 1, 10, 5]);
  });

  it('does not record nodes named export-hidden, and shows them again afterwards', () => {
    const { stage, item } = buildPage();
    const placeholder = rect({ name: EXPORT_HIDDEN_NAME, x: 0, y: 0, width: 10, height: 10 });
    item('a', placeholder, rect({ x: 20, y: 0, width: 10, height: 10 }));
    item('b', rect({ name: EXPORT_HIDDEN_NAME, x: 0, y: 20, width: 10, height: 10 }));

    const scene = recordPageScene(stage, { page: 1 });

    // 'b' held only a placeholder: it draws nothing, so it is not an item.
    expect(scene.items.map((i) => i.elementId)).toEqual(['a']);
    expect(only(ops(scene, 'a'), 'path').matrix[4]).toBe(40);
    expect(placeholder.isVisible()).toBe(true);
  });

  it('turns opacity with fill and stroke into one group op, never a raster', () => {
    const { stage, item } = buildPage();
    item(
      'a',
      rect({
        x: 5,
        y: 7,
        width: 20,
        height: 10,
        fill: '#ff0000',
        stroke: '#0000ff',
        strokeWidth: 4,
        opacity: 0.5,
      })
    );

    const scene = recordPageScene(stage, { page: 1 });

    const group = only(ops(scene, 'a'), 'group');
    expect(group.alpha).toBe(0.5);
    expect(group.matrix).toEqual(IDENTITY);
    expect(group.ops.map((op) => (op.kind === 'path' ? op.mode : op.kind))).toEqual([
      'fill',
      'stroke',
    ]);
    expect(group.ops.every((op) => op.alpha === 1)).toBe(true);
    expect(scene.report.rasterIslands).toEqual([]);
  });

  it('places the children of a buffered shape in page px', () => {
    const { stage, item } = buildPage({ displayScale: 0.5, logicalScale: 2 });
    // Logical (20,30) is page (40,60).
    item(
      'a',
      rect({ x: 20, y: 30, width: 20, height: 10, stroke: '#0000ff', strokeWidth: 2, opacity: 0.5 })
    );

    const scene = recordPageScene(stage, { page: 1 });

    const group = only(ops(scene, 'a'), 'group');
    const fill = group.ops[0]!;
    if (fill.kind !== 'path') throw new Error('expected a path');
    const toPage = multiply(group.matrix, fill.matrix);
    const first = fill.commands[0]!;
    if (first.op !== 'M') throw new Error('expected the path to start with M');
    expect(apply(toPage, first.x, first.y)).toEqual({ x: 40, y: 60 });
  });

  it('keeps the clip of the parent on the group of a buffered shape', () => {
    const { stage, item } = buildPage({ displayScale: 0.5, logicalScale: 2 });
    const clipped = new Konva.Group({ clipX: 0, clipY: 0, clipWidth: 30, clipHeight: 20 });
    clipped.add(
      rect({ x: 20, y: 5, width: 20, height: 10, stroke: '#0000ff', strokeWidth: 2, opacity: 0.5 })
    );
    item('a', clipped);

    const scene = recordPageScene(stage, { page: 1 });

    const group = only(ops(scene, 'a'), 'group');
    expect(group.clips).toHaveLength(1);
    // The clip box (0,0 to 30,20 logical) is page (0,0) to (60,40) in the clip's own matrix.
    const [clip] = group.clips;
    const corner = clip!.commands.find((c) => c.op === 'L');
    if (corner?.op !== 'L') throw new Error('expected a rect clip');
    expect(apply(clip!.matrix, corner.x, corner.y).x).toBeCloseTo(60);
    // The children are not clipped themselves: Konva clips when it copies the buffer.
    expect(group.ops.every((op) => op.clips.length === 0)).toBe(true);
    const fill = group.ops[0]!;
    if (fill.kind !== 'path') throw new Error('expected a path');
    expect(fill.matrix[4]).toBeCloseTo(40);
  });

  it('records text and an uncached image as ops of their own kind', () => {
    const { stage, item } = buildPage();
    item(
      'a',
      new Konva.Text({ text: 'Hallo', fontSize: 12, fontFamily: 'sans-serif', fill: '#000000' })
    );
    const source = Konva.Util.createCanvasElement();
    source.width = 20;
    source.height = 10;
    source.getContext('2d');
    item('b', new Konva.Image({ image: source, width: 20, height: 10 }));

    const scene = recordPageScene(stage, { page: 1 });

    const text = only(ops(scene, 'a'), 'text');
    expect(text).toMatchObject({ text: 'Hallo', mode: 'fill' });
    expect(text.font.size).toBe(12);
    const image = only(ops(scene, 'b'), 'image');
    // Task 5 resolves the element into bytes; the recorder only points at it.
    expect(image.image).toMatchObject({ kind: 'element', width: 20, height: 10 });
  });

  it('records an isolated group with its opacity as a group op', () => {
    const { stage, item } = buildPage();
    const isolated = new Konva.Group({ isolated: true, opacity: 0.6 });
    isolated.add(
      rect({ x: 5, y: 5, width: 10, height: 10 }),
      rect({ x: 8, y: 8, width: 10, height: 10 })
    );
    item('a', isolated);

    const scene = recordPageScene(stage, { page: 1 });

    const group = only(ops(scene, 'a'), 'group');
    expect(group.alpha).toBe(0.6);
    expect(group.ops).toHaveLength(2);
    expect(group.ops.map((op) => op.matrix[4])).toEqual([10, 16]);
  });

  it('nests a buffered shape inside an isolated group, each with its own alpha', () => {
    const { stage, item } = buildPage({ displayScale: 0.5, logicalScale: 2 });
    const isolated = new Konva.Group({ isolated: true, opacity: 0.6 });
    isolated.add(
      rect({ x: 20, y: 30, width: 20, height: 10, stroke: '#0000ff', strokeWidth: 2, opacity: 0.5 })
    );
    item('a', isolated);

    const scene = recordPageScene(stage, { page: 1 });

    const outer = only(ops(scene, 'a'), 'group');
    expect(outer.alpha).toBe(0.6);
    // The shape's opacity counts from the isolated group down, not from the page.
    const inner = only(outer.ops, 'group');
    expect(inner.alpha).toBe(0.5);
    const fill = inner.ops[0]!;
    if (fill.kind !== 'path') throw new Error('expected a path');
    expect(apply(multiply(inner.matrix, fill.matrix), 0, 0)).toEqual({ x: 40, y: 60 });
  });

  it('does not apply the opacity of the layers above the page root', () => {
    const { stage, layer, item } = buildPage();
    layer.opacity(0.5);
    item('a', rect({ x: 5, y: 7, width: 20, height: 10, opacity: 0.8 }));

    const scene = recordPageScene(stage, { page: 1 });

    expect(only(ops(scene, 'a'), 'path').alpha).toBe(0.8);
  });

  it('records a node cached without filters from its source and keeps its cache as it was', () => {
    const { stage, item } = buildPage();
    const cached = rect({ x: 5, y: 7, width: 20, height: 10 });
    item('a', cached);
    cached.cache({ pixelRatio: 3 });
    const before = cached._getCanvasCache();

    const scene = recordPageScene(stage, { page: 1 });

    expect(only(ops(scene, 'a'), 'path').mode).toBe('fill');
    expect(cached.isCached()).toBe(true);
    // The very same cache object: its scene canvas, its hit canvas and their boxes.
    expect(cached._getCanvasCache()).toBe(before);
    expect(before!.scene.pixelRatio).toBe(3);
  });

  it('keeps the pixel hit area of a cached image', () => {
    const { stage, item } = buildPage({ width: 100, height: 80, displayScale: 1, logicalScale: 1 });
    // Opaque left half, transparent right half.
    const source = Konva.Util.createCanvasElement();
    source.width = 20;
    source.height = 10;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#cc0000';
    paint.fillRect(0, 0, 10, 10);
    const image = new Konva.Image({ image: source, x: 10, y: 10, width: 20, height: 10 });
    item('a', image);
    // As `applyPixelHitArea` does it: the hit mask is cut from the cached pixels.
    image.cache({ pixelRatio: 1, hitCanvasPixelRatio: 1 });
    image.drawHitFromCache(HIT_ALPHA_THRESHOLD);
    const opaque = { x: 14, y: 15 };
    const transparent = { x: 26, y: 15 };
    stage.draw();
    expect(stage.getIntersection(opaque)).toBe(image);
    expect(stage.getIntersection(transparent)).toBeNull();

    const scene = recordPageScene(stage, { page: 1 });

    expect(only(ops(scene, 'a'), 'image').kind).toBe('image');
    stage.draw();
    expect(stage.getIntersection(opaque)).toBe(image);
    expect(stage.getIntersection(transparent)).toBeNull();
  });

  it('gives the caches back when an element throws while recording', () => {
    const { stage, item } = buildPage();
    const cached = rect({ x: 5, y: 7, width: 20, height: 10 });
    item(
      'a',
      cached,
      new Konva.Shape({
        width: 10,
        height: 10,
        sceneFunc() {
          throw new Error('broken element');
        },
      })
    );
    cached.cache();
    const before = cached._getCanvasCache();

    expect(() => recordPageScene(stage, { page: 1 })).toThrow('broken element');

    expect(cached._getCanvasCache()).toBe(before);
    expect(cached.isCached()).toBe(true);
  });

  it('turns a node cached with filters into a raster island', () => {
    const { stage, item } = buildPage();
    const source = Konva.Util.createCanvasElement();
    source.width = 20;
    source.height = 10;
    // The napi bridge maps a canvas element to its pixels on the first `getContext`.
    source.getContext('2d');
    const image = new Konva.Image({ image: source, x: 5, y: 7, width: 20, height: 10 });
    item('a', image);
    image.cache();
    image.filters([Konva.Filters.Grayscale]);

    const scene = recordPageScene(stage, { page: 1 });

    const island = only(ops(scene, 'a'), 'raster');
    expect(island).toMatchObject({
      reason: 'filter',
      png: null,
      source: null,
      matrix: IDENTITY,
      alpha: 1,
      x: 10,
      y: 14,
      width: 40,
      height: 20,
    });
    expect(scene.report.rasterIslands).toEqual([{ page: 1, elementId: 'a', reason: 'filter' }]);
    expect(image.isCached()).toBe(true);
  });

  it('turns an unknown call into a raster island for that element only', () => {
    const { stage, item } = buildPage();
    const custom = new Konva.Shape({
      x: 5,
      y: 7,
      width: 30,
      height: 20,
      sceneFunc(ctx) {
        ctx._context.getImageData(0, 0, 1, 1);
      },
    });
    item('a', custom);
    item('b', rect({ x: 50, y: 7, width: 10, height: 10 }));

    const scene = recordPageScene(stage, { page: 3 });

    expect(only(ops(scene, 'a'), 'raster')).toMatchObject({
      reason: 'unsupported-call',
      png: null,
      source: null,
      x: 10,
      y: 14,
      width: 60,
      height: 40,
    });
    expect(only(ops(scene, 'b'), 'path').kind).toBe('path');
    expect(scene.report.unknownCalls).toEqual([{ page: 3, elementId: 'a', call: 'getImageData' }]);
    expect(scene.report.rasterIslands).toEqual([
      { page: 3, elementId: 'a', reason: 'unsupported-call' },
    ]);
  });

  it('skips the page background when transparent', () => {
    const { stage, pageRoot, item } = buildPage();
    const background = rect({ name: 'canvas-background', x: 0, y: 0, width: 100, height: 75 });
    pageRoot.add(background);
    item('a', rect({ x: 5, y: 7, width: 20, height: 10 }));

    const opaque = recordPageScene(stage, { page: 1 });
    const transparent = recordPageScene(stage, { page: 1, transparent: true });

    expect(opaque.items.map((i) => i.elementId)).toEqual([null, 'a']);
    expect(transparent.items.map((i) => i.elementId)).toEqual(['a']);
    expect(background.isVisible()).toBe(true);
  });

  describe('paints Konva builds on a context of its own', () => {
    it('records a gradient fill as a linear paint, not a raster island', () => {
      const { stage, item } = buildPage();
      item(
        'a',
        new Konva.Rect({
          x: 5,
          y: 7,
          width: 20,
          height: 10,
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: 20, y: 0 },
          fillLinearGradientColorStops: [0, '#ff0000', 1, '#0000ff'],
        })
      );

      const scene = recordPageScene(stage, { page: 1 });

      const path = only(ops(scene, 'a'), 'path');
      expect(path.paint).toEqual({
        type: 'linear',
        x0: 0,
        y0: 0,
        x1: 20,
        y1: 0,
        stops: [
          { offset: 0, hex: '#ff0000', alpha: 1 },
          { offset: 1, hex: '#0000ff', alpha: 1 },
        ],
      });
      expect(scene.report.rasterIslands).toEqual([]);
      expect(scene.report.unknownCalls).toEqual([]);
    });

    it('records a radial gradient fill and a stroke gradient', () => {
      const { stage, item } = buildPage();
      item(
        'a',
        new Konva.Rect({
          x: 5,
          y: 7,
          width: 20,
          height: 10,
          fillRadialGradientStartPoint: { x: 10, y: 5 },
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndPoint: { x: 10, y: 5 },
          fillRadialGradientEndRadius: 12,
          fillRadialGradientColorStops: [0, '#ffffff', 1, '#000000'],
          strokeWidth: 2,
          strokeLinearGradientStartPoint: { x: 0, y: 0 },
          strokeLinearGradientEndPoint: { x: 20, y: 0 },
          strokeLinearGradientColorStops: [0, '#00ff00', 1, '#ff00ff'],
        })
      );

      const scene = recordPageScene(stage, { page: 1 });

      const paints = ops(scene, 'a').map((op) => (op.kind === 'path' ? op.paint.type : op.kind));
      expect(paints).toEqual(['radial', 'linear']);
      expect(scene.report.unknownCalls).toEqual([]);
    });

    it('records a pattern fill with its transform', () => {
      const { stage, item } = buildPage();
      const tile = Konva.Util.createCanvasElement();
      tile.width = 4;
      tile.height = 4;
      item(
        'a',
        new Konva.Rect({
          x: 5,
          y: 7,
          width: 20,
          height: 10,
          fillPatternImage: tile as unknown as HTMLImageElement,
          fillPatternScaleX: 2,
          fillPatternScaleY: 2,
        })
      );

      const scene = recordPageScene(stage, { page: 1 });

      const path = only(ops(scene, 'a'), 'path');
      expect(path.paint).toMatchObject({
        type: 'pattern',
        repeat: 'repeat',
        matrix: [2, 0, 0, 2, 0, 0],
      });
      expect(scene.report.unknownCalls).toEqual([]);
    });

    it('puts Konva back, and keeps its own gradient cache clean', () => {
      const { stage, item } = buildPage();
      const gradient = new Konva.Rect({
        x: 5,
        y: 7,
        width: 20,
        height: 10,
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: 20, y: 0 },
        fillLinearGradientColorStops: [0, '#ff0000', 1, '#0000ff'],
      });
      item('a', gradient);
      const proto = Konva.Shape.prototype;
      const originals = [proto._getLinearGradient, proto._getRadialGradient, proto._getFillPattern];

      recordPageScene(stage, { page: 1 });

      expect([proto._getLinearGradient, proto._getRadialGradient, proto._getFillPattern]).toEqual(
        originals
      );
      // What the editor draws with afterwards is Konva's own canvas gradient.
      const own = gradient._getLinearGradient() as unknown as Record<string, unknown>;
      expect(typeof own.addColorStop).toBe('function');
      expect('toPaint' in own).toBe(false);
    });

    it('puts Konva back when drawing throws', () => {
      const { stage, item } = buildPage();
      item(
        'a',
        new Konva.Shape({
          width: 10,
          height: 10,
          sceneFunc() {
            throw new Error('broken element');
          },
        })
      );
      const proto = Konva.Shape.prototype;
      const original = proto._getLinearGradient;

      expect(() => recordPageScene(stage, { page: 1 })).toThrow('broken element');

      expect(proto._getLinearGradient).toBe(original);
    });
  });
});
