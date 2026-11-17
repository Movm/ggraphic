// SPDX-License-Identifier: AGPL-3.0-only
/**
 * One of everything the writers know, as a resolved export scene, and the builders it is made
 * from. The SVG and the PDF writer tests share it, so their fixtures cannot drift apart.
 *
 * The sample text is German, like the page of `allElementsPage.ts`.
 */
import { IDENTITY } from '../matrix.js';

import type {
  ClipPath,
  ExportScene,
  FontSpec,
  Matrix,
  Paint,
  PathCommand,
  SceneImageSource,
  SceneItem,
  SceneOp,
} from '../types.js';
import { emptyReport } from '../types.js';

export const FIXTURE_FACE: FontSpec = {
  family: 'Instrument Sans',
  weight: 400,
  style: 'normal',
  size: 40,
  fallback: ['Helvetica Neue', 'sans-serif'],
};

export const base = (
  over: { matrix?: Matrix; alpha?: number; clips?: readonly ClipPath[] } = {}
) => ({
  matrix: over.matrix ?? IDENTITY,
  alpha: over.alpha ?? 1,
  clips: over.clips ?? [],
  shadow: null,
});

export const solid = (hex: string, alpha = 1): Paint => ({ type: 'solid', hex, alpha });

export const rect = (x: number, y: number, w: number, h: number): PathCommand[] => [
  { op: 'M', x, y },
  { op: 'L', x: x + w, y },
  { op: 'L', x: x + w, y: y + h },
  { op: 'L', x, y: y + h },
  { op: 'Z' },
];

export function fill(
  commands: PathCommand[],
  paint: Paint,
  over: Parameters<typeof base>[0] = {}
): Extract<SceneOp, { kind: 'path' }> {
  return {
    ...base(over),
    kind: 'path',
    mode: 'fill',
    commands,
    rule: 'nonzero',
    paint,
    stroke: null,
  };
}

export const item = (
  elementId: string | null,
  label: string | null,
  ...ops: SceneOp[]
): SceneItem => ({
  elementId,
  label,
  ops,
});

export const sceneOf = (...items: SceneItem[]): ExportScene => ({
  width: 400,
  height: 300,
  items,
  report: emptyReport(),
});

export const bitmap = (bytes: Uint8Array, width = 8, height = 8): SceneImageSource => ({
  kind: 'bitmap',
  mime: 'image/png',
  bytes,
  width,
  height,
});

export const GRADIENT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="24" height="24" fill="none"><defs><linearGradient id="a"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient><clipPath id="c"><rect width="24" height="24"/></clipPath></defs><rect class="x y" width="24" height="24" fill="url(#a)" clip-path="url(#c)"/><use xlink:href="#a"/><use href="#c"/><style>#a { opacity: 1 } .x { fill: #c; stroke: url(#a) }</style></svg>`;

export function svgImage(
  markup: string,
  over: Partial<Extract<SceneOp, { kind: 'image' }>> = {}
): SceneOp {
  return {
    ...base(),
    kind: 'image',
    image: { kind: 'svg', markup, width: 24, height: 24 },
    sx: 0,
    sy: 0,
    sw: 24,
    sh: 24,
    dx: 10,
    dy: 20,
    dw: 48,
    dh: 48,
    ...over,
  };
}

export function textOp(
  text: string,
  over: Partial<Extract<SceneOp, { kind: 'text' }>> = {}
): Extract<SceneOp, { kind: 'text' }> {
  return {
    ...base(),
    kind: 'text',
    mode: 'fill',
    text,
    xs: Array.from(text, (_char, index) => 20 + index * 22),
    y: 100,
    font: FIXTURE_FACE,
    paint: solid('#112233'),
    stroke: null,
    ...over,
  };
}

/** One of everything the writer knows. */
export function fixtureScene(png: Uint8Array): ExportScene {
  const clipA: ClipPath = { matrix: IDENTITY, commands: rect(20, 20, 360, 260), rule: 'nonzero' };
  const clipB: ClipPath = {
    matrix: [1, 0, 0, 1, 40, 10],
    commands: rect(0, 0, 100, 100),
    rule: 'evenodd',
  };
  const tile = bitmap(png, 16, 16);
  const rounded: PathCommand[] = [
    { op: 'M', x: 10, y: 0 },
    { op: 'L', x: 90, y: 0 },
    { op: 'C', x1: 95.5, y1: 0, x2: 100, y2: 4.5, x: 100, y: 10 },
    { op: 'L', x: 100, y: 50 },
    { op: 'Q', x1: 100, y1: 60, x: 90, y: 60 },
    { op: 'L', x: 10, y: 60 },
    { op: 'Z' },
  ];
  const stops = [
    { offset: 0, hex: '#00a050', alpha: 1 },
    { offset: 1, hex: '#005030', alpha: 0.5 },
  ];
  const rotated: Matrix = [
    Math.cos(0.2094),
    Math.sin(0.2094),
    -Math.sin(0.2094),
    Math.cos(0.2094),
    150,
    40,
  ];
  return sceneOf(
    item(null, null, fill(rect(0, 0, 400, 300), solid('#f4f1e8'))),
    item(
      'rect-1',
      'Kachel <1> & "Rand"',
      {
        ...fill(
          rounded,
          { type: 'linear', x0: 0, y0: 0, x1: 100, y1: 60, stops },
          {
            matrix: [1, 0, 0, 1, 30, 40],
            alpha: 0.8,
          }
        ),
        rule: 'evenodd',
      },
      {
        ...base({ matrix: rotated, alpha: 0.5 }),
        kind: 'path',
        mode: 'stroke',
        commands: rect(0, 0, 80, 40),
        rule: 'nonzero',
        paint: solid('#cc3300', 0.5),
        stroke: {
          width: 3,
          cap: 'round',
          join: 'bevel',
          miterLimit: 10,
          dash: [6, 4],
          dashOffset: 2,
        },
      },
      fill(
        rounded,
        { type: 'radial', x0: 50, y0: 30, r0: 0, x1: 50, y1: 30, r1: 60, stops },
        { matrix: [-1, 0, 0, 1, 380, 100] }
      ),
      fill(
        rect(0, 0, 60, 60),
        { type: 'pattern', image: tile, repeat: 'repeat', matrix: IDENTITY },
        {
          matrix: [1, 0, 0, 1, 20, 200],
        }
      ),
      fill(rect(30, 30, 50, 50), solid('#0088ff'), { clips: [clipA] }),
      fill(rect(60, 60, 50, 50), solid('#ff8800'), { clips: [clipA] }),
      fill(rect(90, 90, 50, 50), solid('#8800ff'), { clips: [clipA, clipB] })
    ),
    item(
      'headline',
      'Überschrift',
      {
        ...textOp('Hallo →'),
        shadow: { hex: '#000000', alpha: 0.4, blur: 10, offsetX: 3, offsetY: 5 },
      },
      {
        ...textOp('Hi', { mode: 'stroke', y: 160 }),
        stroke: { width: 1.5, cap: 'butt', join: 'round', miterLimit: 10, dash: [], dashOffset: 0 },
      }
    ),
    item('icon', 'Icon', svgImage(GRADIENT_ICON), svgImage(GRADIENT_ICON, { dx: 80 })),
    item(
      'photo',
      'Foto',
      {
        ...base({ matrix: [1, 0, 0, 1, 200, 20] }),
        kind: 'image',
        image: bitmap(png, 8, 8),
        sx: 2,
        sy: 2,
        sw: 4,
        sh: 4,
        dx: 0,
        dy: 0,
        dw: 80,
        dh: 80,
      },
      {
        ...base(),
        kind: 'raster',
        png,
        x: 300,
        y: 20,
        width: 50,
        height: 50,
        reason: 'filter',
        source: null,
      }
    ),
    item('buffer', 'Puffer', {
      ...base({ alpha: 0.5 }),
      kind: 'group',
      ops: [
        fill(rect(250, 150, 80, 80), solid('#aa0000')),
        {
          ...fill(rect(290, 170, 80, 80), solid('#0000aa', 0.7)),
          shadow: { hex: '#202020', alpha: 1, blur: 4, offsetX: 0, offsetY: 2 },
        },
      ],
      shadow: null,
    })
  );
}
