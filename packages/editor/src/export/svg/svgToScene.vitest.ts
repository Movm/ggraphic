// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The pragma above gives this one file the DOM the converter parses with; the lane is `node`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { IDENTITY, apply, multiply } from '../scene/matrix.js';
import type { FontSpec, Matrix, Paint, PathCommand, SceneOp } from '../scene/types.js';
import { svgToScene } from './svgToScene.js';

const FONT: FontSpec = { family: 'Test Sans', weight: 400, style: 'normal', size: 16 };
const BOX = { matrix: IDENTITY, width: 100, height: 100 };

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (inner: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg ${NS} ${attrs}>${inner}</svg>`;

type Measure = (text: string, font: FontSpec) => number[];
const convert = (markup: string, box = BOX, measure?: Measure) =>
  svgToScene(markup, box, { font: FONT, ...(measure && { measure }) });

type PathOp = Extract<SceneOp, { kind: 'path' }>;
type TextOp = Extract<SceneOp, { kind: 'text' }>;
type GroupOp = Extract<SceneOp, { kind: 'group' }>;

const flat = (ops: readonly SceneOp[]): SceneOp[] =>
  ops.flatMap((op) => (op.kind === 'group' ? flat(op.ops) : [op]));
const pathsOf = (ops: readonly SceneOp[]) =>
  flat(ops).filter((op): op is PathOp => op.kind === 'path');
const textsOf = (ops: readonly SceneOp[]) =>
  flat(ops).filter((op): op is TextOp => op.kind === 'text');
const only = <T>(list: T[]): T => {
  expect(list).toHaveLength(1);
  return list[0]!;
};

const r = (n: number) => Number(n.toFixed(3));
/** Path data of the commands, rounded, for reading a geometry at a glance. */
const d = (commands: readonly PathCommand[]) =>
  commands
    .map((c) => {
      switch (c.op) {
        case 'Z':
          return 'Z';
        case 'C':
          return `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
        case 'Q':
          return `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`;
        default:
          return `${c.op}${r(c.x)} ${r(c.y)}`;
      }
    })
    .join(' ');

const endPoints = (commands: readonly PathCommand[]) =>
  commands.flatMap((c) => (c.op === 'Z' ? [] : [{ x: c.x, y: c.y }]));
const solid = (hex: string, alpha = 1): Paint => ({ type: 'solid', hex, alpha });
const matrixClose = (actual: Matrix, expected: Matrix) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 9));

describe('svgToScene: shapes', () => {
  it('rect', () => {
    const { ops, unsupported } = convert(
      svg('<rect x="10" y="20" width="30" height="40" fill="#FF0000"/>')
    );
    expect(unsupported).toEqual([]);
    const op = only(pathsOf(ops));
    expect(op).toMatchObject({
      mode: 'fill',
      rule: 'nonzero',
      paint: solid('#ff0000'),
      stroke: null,
      alpha: 1,
      shadow: null,
      clips: [],
      matrix: IDENTITY,
    });
    expect(d(op.commands)).toBe('M10 20 L40 20 L40 60 L10 60 Z');
  });

  it('rect with rounded corners (rx alone gives ry)', () => {
    const op = only(
      pathsOf(convert(svg('<rect x="10" y="20" width="30" height="40" rx="5"/>')).ops)
    );
    expect(op.commands[0]).toEqual({ op: 'M', x: 15, y: 20 });
    expect(op.commands.filter((c) => c.op === 'C').length).toBeGreaterThanOrEqual(4);
    expect(op.commands.at(-1)).toEqual({ op: 'Z' });
    for (const p of endPoints(op.commands)) {
      expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(40 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(60 + 1e-9);
    }
    // The corner arcs end on the straight edges.
    expect(endPoints(op.commands)).toEqual(
      expect.arrayContaining([
        { x: 35, y: 20 },
        { x: 40, y: 25 },
        { x: 40, y: 55 },
        { x: 35, y: 60 },
        { x: 15, y: 60 },
        { x: 10, y: 55 },
        { x: 10, y: 25 },
      ])
    );
  });

  it('rect clamps the radius to half the side', () => {
    const op = only(pathsOf(convert(svg('<rect width="20" height="10" rx="50"/>')).ops));
    expect(op.commands[0]).toEqual({ op: 'M', x: 10, y: 0 });
  });

  it('circle starts at its right-most point and stays on the circle', () => {
    const op = only(pathsOf(convert(svg('<circle cx="50" cy="40" r="10"/>')).ops));
    expect(op.commands[0]).toEqual({ op: 'M', x: 60, y: 40 });
    expect(op.commands.at(-1)).toEqual({ op: 'Z' });
    const ends = endPoints(op.commands);
    for (const p of ends) expect(Math.hypot(p.x - 50, p.y - 40)).toBeCloseTo(10, 6);
    expect(ends.at(-1)).toEqual({ x: 60, y: 40 });
  });

  it('ellipse', () => {
    const op = only(pathsOf(convert(svg('<ellipse cx="50" cy="40" rx="20" ry="10"/>')).ops));
    expect(op.commands[0]).toEqual({ op: 'M', x: 70, y: 40 });
    for (const p of endPoints(op.commands)) {
      expect(((p.x - 50) / 20) ** 2 + ((p.y - 40) / 10) ** 2).toBeCloseTo(1, 9);
    }
    // Every quarter turn passes through an axis point.
    expect(endPoints(op.commands).map((p) => ({ x: r(p.x), y: r(p.y) }))).toEqual(
      expect.arrayContaining([
        { x: 50, y: 50 },
        { x: 30, y: 40 },
        { x: 50, y: 30 },
      ])
    );
  });

  it('line is stroked and not filled', () => {
    const { ops } = convert(
      svg('<line x1="5" y1="6" x2="55" y2="66" stroke="#000" stroke-width="2"/>')
    );
    const op = only(pathsOf(ops));
    expect(op.mode).toBe('stroke');
    expect(d(op.commands)).toBe('M5 6 L55 66');
    expect(op.paint).toEqual(solid('#000000'));
    expect(op.stroke).toEqual({
      width: 2,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4,
      dash: [],
      dashOffset: 0,
    });
  });

  it('polyline stays open', () => {
    const op = only(
      pathsOf(convert(svg('<polyline points="10,10 20,30 30,10" fill="none" stroke="red"/>')).ops)
    );
    expect(op.mode).toBe('stroke');
    expect(d(op.commands)).toBe('M10 10 L20 30 L30 10');
  });

  it('polygon closes', () => {
    const op = only(pathsOf(convert(svg('<polygon points="10 10 20 30 30 10"/>')).ops));
    expect(op.mode).toBe('fill');
    expect(d(op.commands)).toBe('M10 10 L20 30 L30 10 Z');
  });

  it('path: absolute and relative lines, h, v and implicit repeats', () => {
    const op = only(pathsOf(convert(svg('<path d="M10 10 h20 v20 h-20 z m5 5 l5 0 10 10"/>')).ops));
    expect(d(op.commands)).toBe('M10 10 L30 10 L30 30 L10 30 Z M15 15 L20 15 L30 25');
  });

  it('path: a command after z starts from the subpath start', () => {
    const op = only(pathsOf(convert(svg('<path d="M10 10 L20 10 L20 20 Z L5 5"/>')).ops));
    expect(d(op.commands)).toBe('M10 10 L20 10 L20 20 Z M10 10 L5 5');
  });

  it('path: cubic, smooth cubic, quadratic and smooth quadratic', () => {
    const cubic = only(
      pathsOf(convert(svg('<path d="M0 0 C10 0 20 10 20 20 S30 40 40 40"/>')).ops)
    );
    expect(d(cubic.commands)).toBe('M0 0 C10 0 20 10 20 20 C20 30 30 40 40 40');
    const quad = only(pathsOf(convert(svg('<path d="M0 0 Q10 10 20 0 T40 0"/>')).ops));
    expect(d(quad.commands)).toBe('M0 0 Q10 10 20 0 Q30 -10 40 0');
  });

  it('path: numbers without separators and with exponents', () => {
    const op = only(pathsOf(convert(svg('<path d="M.5.5L1e1-5-3.5 2"/>')).ops));
    expect(d(op.commands)).toBe('M0.5 0.5 L10 -5 L-3.5 2');
  });

  it('path: an arc becomes cubics that end where the arc ends', () => {
    const op = only(pathsOf(convert(svg('<path d="M10 50 A 20 20 0 0 1 50 50"/>')).ops));
    const curves = op.commands.filter((c) => c.op === 'C');
    expect(curves).toHaveLength(4);
    expect(op.commands.every((c) => c.op === 'M' || c.op === 'C')).toBe(true);
    const ends = endPoints(op.commands);
    expect(ends.at(-1)).toEqual({ x: 50, y: 50 });
    // Sweep 1 runs clockwise on screen: over the top of the centre (30, 50).
    expect(r(ends[2]!.x)).toBe(30);
    expect(r(ends[2]!.y)).toBe(30);
  });

  it('path: sweep 0 takes the other way round', () => {
    const op = only(pathsOf(convert(svg('<path d="M10 50 A 20 20 0 0 0 50 50"/>')).ops));
    const ends = endPoints(op.commands);
    expect(r(ends[2]!.x)).toBe(30);
    expect(r(ends[2]!.y)).toBe(70);
  });

  it('path: large-arc and packed flags', () => {
    const big = only(pathsOf(convert(svg('<path d="M20 20 a10 10 0 1 1 10 10"/>')).ops));
    const packed = only(pathsOf(convert(svg('<path d="M20 20 a10 10 0 11 10 10"/>')).ops));
    expect(d(packed.commands)).toBe(d(big.commands));
    // A large arc of a 10 radius circle between points 14 apart goes round three quarters.
    expect(big.commands.filter((c) => c.op === 'C').length).toBeGreaterThanOrEqual(6);
  });

  it('path: radii too small are scaled up, a zero radius is a line', () => {
    const scaled = only(pathsOf(convert(svg('<path d="M0 0 A 1 1 0 0 1 40 0"/>')).ops));
    expect(endPoints(scaled.commands).at(-1)).toEqual({ x: 40, y: 0 });
    for (const p of endPoints(scaled.commands)) {
      expect(Math.hypot(p.x - 20, p.y)).toBeCloseTo(20, 6);
    }
    const line = only(pathsOf(convert(svg('<path d="M0 0 A 0 5 0 0 1 40 0"/>')).ops));
    expect(d(line.commands)).toBe('M0 0 L40 0');
  });

  it('path: data after an error is dropped, the part before stays', () => {
    const op = only(pathsOf(convert(svg('<path d="M10 10 L20 20 L30 x L40 40"/>')).ops));
    expect(d(op.commands)).toBe('M10 10 L20 20');
  });

  it('path: a number too big for a double ends the data like any error', () => {
    const op = only(pathsOf(convert(svg('<path d="M0 0 L5 5 L1e999 5 L9 9"/>')).ops));
    expect(d(op.commands)).toBe('M0 0 L5 5');
  });

  it('path: evenodd', () => {
    const op = only(pathsOf(convert(svg('<path d="M0 0H10V10Z" fill-rule="evenodd"/>')).ops));
    expect(op.rule).toBe('evenodd');
  });

  it('shapes without an area are skipped', () => {
    const { ops } = convert(
      svg('<rect width="0" height="5"/><circle r="0"/><ellipse rx="3" ry="0"/><path d=""/>')
    );
    expect(ops).toEqual([]);
  });
});

describe('svgToScene: placement', () => {
  it('viewBox scales into the box', () => {
    const box = { matrix: [1, 0, 0, 1, 10, 20] as Matrix, width: 100, height: 100 };
    const { ops } = convert(svg('<rect width="10" height="10"/>', 'viewBox="0 0 50 50"'), box);
    expect(only(pathsOf(ops)).matrix).toEqual([2, 0, 0, 2, 10, 20]);
  });

  it('viewBox is centred when the aspect ratios differ (xMidYMid meet)', () => {
    const box = { matrix: IDENTITY, width: 200, height: 100 };
    const { ops } = convert(svg('<rect width="10" height="10"/>', 'viewBox="0 0 50 50"'), box);
    expect(only(pathsOf(ops)).matrix).toEqual([2, 0, 0, 2, 50, 0]);
  });

  it('viewBox with an origin shifts the content', () => {
    const { ops } = convert(svg('<rect width="10" height="10"/>', 'viewBox="10 20 50 50"'));
    expect(only(pathsOf(ops)).matrix).toEqual([2, 0, 0, 2, -20, -40]);
  });

  it('preserveAspectRatio: alignment, none and slice', () => {
    const wide = { matrix: IDENTITY, width: 200, height: 100 };
    const inner = '<rect width="10" height="10"/>';
    const min = convert(
      svg(inner, 'viewBox="0 0 50 50" preserveAspectRatio="xMinYMin meet"'),
      wide
    );
    expect(only(pathsOf(min.ops)).matrix).toEqual([2, 0, 0, 2, 0, 0]);
    const max = convert(
      svg(inner, 'viewBox="0 0 50 50" preserveAspectRatio="xMaxYMax meet"'),
      wide
    );
    expect(only(pathsOf(max.ops)).matrix).toEqual([2, 0, 0, 2, 100, 0]);
    const none = convert(svg(inner, 'viewBox="0 0 50 50" preserveAspectRatio="none"'), wide);
    expect(only(pathsOf(none.ops)).matrix).toEqual([4, 0, 0, 2, 0, 0]);
    const slice = convert(svg(inner, 'viewBox="0 0 50 50" preserveAspectRatio="slice"'), wide);
    const op = only(pathsOf(slice.ops));
    expect(op.matrix).toEqual([4, 0, 0, 4, 0, -50]);
    // Slice overflows the viewport, so the box clips it.
    expect(op.clips).toHaveLength(1);
    expect(d(op.clips[0]!.commands)).toBe('M0 0 L200 0 L200 100 L0 100 Z');
    expect(op.clips[0]!.matrix).toEqual(IDENTITY);
  });

  it('without a viewBox the width and height attributes are the intrinsic size', () => {
    const box = { matrix: IDENTITY, width: 100, height: 50 };
    const { ops } = convert(svg('<rect width="10" height="10"/>', 'width="50" height="50"'), box);
    expect(only(pathsOf(ops)).matrix).toEqual([2, 0, 0, 1, 0, 0]);
    const plain = convert(svg('<rect width="10" height="10"/>', ''), box);
    expect(only(pathsOf(plain.ops)).matrix).toEqual(IDENTITY);
  });

  it('transform attributes compose with the box', () => {
    const box = { matrix: [1, 0, 0, 1, 5, 5] as Matrix, width: 100, height: 100 };
    const { ops } = convert(
      svg('<g transform="translate(10 20) scale(2)"><rect width="1" height="1"/></g>'),
      box
    );
    expect(only(pathsOf(ops)).matrix).toEqual([2, 0, 0, 2, 15, 25]);
  });

  it('transform: matrix, rotate about a point, skew, comma lists', () => {
    const m1 = only(
      pathsOf(convert(svg('<rect width="1" height="1" transform="matrix(1,2,3,4,5,6)"/>')).ops)
    ).matrix;
    expect(m1).toEqual([1, 2, 3, 4, 5, 6]);
    const rot = only(
      pathsOf(convert(svg('<rect width="1" height="1" transform="rotate(90 10 10)"/>')).ops)
    ).matrix;
    matrixClose(rot, [0, 1, -1, 0, 20, 0]);
    expect(apply(rot, 10, 10).x).toBeCloseTo(10, 9);
    const skew = only(
      pathsOf(
        convert(svg('<rect width="1" height="1" transform="translate(1,2) skewX(45) skewY(0)"/>'))
          .ops
      )
    ).matrix;
    matrixClose(skew, multiply([1, 0, 0, 1, 1, 2], [1, 0, 1, 1, 0, 0]));
  });

  it('a transform that does not parse is reported', () => {
    const { unsupported } = convert(svg('<rect width="1" height="1" transform="spin(3)"/>'));
    expect(unsupported).toEqual(['transform']);
  });

  it('nested svg places and clips its content', () => {
    const { ops } = convert(
      svg(
        '<svg x="10" y="20" width="30" height="30" viewBox="0 0 15 15"><rect width="5" height="5"/></svg>'
      )
    );
    const op = only(pathsOf(ops));
    expect(op.matrix).toEqual([2, 0, 0, 2, 10, 20]);
    expect(op.clips).toHaveLength(1);
    expect(d(op.clips[0]!.commands)).toBe('M0 0 L30 0 L30 30 L0 30 Z');
    expect(op.clips[0]!.matrix).toEqual([1, 0, 0, 1, 10, 20]);
  });
});

describe('svgToScene: paint and style', () => {
  it('named colours, rgb(), short hex and currentColor', () => {
    const fills = (fill: string, attrs = '') =>
      only(pathsOf(convert(svg(`<rect width="1" height="1" fill="${fill}" ${attrs}/>`)).ops)).paint;
    expect(fills('red')).toEqual(solid('#ff0000'));
    expect(fills('RebeccaPurple')).toEqual(solid('#663399'));
    expect(fills('rgb(0, 128, 255)')).toEqual(solid('#0080ff'));
    expect(fills('#0f8')).toEqual(solid('#00ff88'));
    expect(fills('rgba(0,0,0,0.5)')).toEqual(solid('#000000', 0.5));
    expect(fills('currentColor')).toEqual(solid('#000000'));
    expect(fills('currentColor', 'color="#123456"')).toEqual(solid('#123456'));
  });

  it('currentColor follows an ancestor', () => {
    const { ops } = convert(
      svg('<g color="blue" stroke="currentColor"><rect width="1" height="1" fill="none"/></g>')
    );
    expect(only(pathsOf(ops)).paint).toEqual(solid('#0000ff'));
  });

  it('fill defaults to black and stroke to none; none paints nothing', () => {
    const op = only(pathsOf(convert(svg('<rect width="1" height="1"/>')).ops));
    expect(op.paint).toEqual(solid('#000000'));
    const none = convert(svg('<rect width="1" height="1" fill="none"/>'));
    expect(none.ops).toEqual([]);
  });

  it('fill and stroke are two ops, fill first; paint-order swaps them', () => {
    const markup = (extra = '') =>
      svg(`<rect width="4" height="4" fill="#111111" stroke="#222222" stroke-width="3" ${extra}/>`);
    expect(pathsOf(convert(markup()).ops).map((o) => o.mode)).toEqual(['fill', 'stroke']);
    expect(pathsOf(convert(markup('paint-order="stroke"')).ops).map((o) => o.mode)).toEqual([
      'stroke',
      'fill',
    ]);
  });

  it('fill-opacity and stroke-opacity go into the paint', () => {
    const { ops } = convert(
      svg(
        '<rect width="4" height="4" fill="#111111" fill-opacity="0.25" stroke="#222222" stroke-opacity="50%"/>'
      )
    );
    const [fill, stroke] = pathsOf(ops);
    expect(fill!.paint).toEqual(solid('#111111', 0.25));
    expect(stroke!.paint).toEqual(solid('#222222', 0.5));
  });

  it('opacity on one op sets its alpha', () => {
    const op = only(pathsOf(convert(svg('<rect width="4" height="4" opacity="0.5"/>')).ops));
    expect(op.alpha).toBe(0.5);
  });

  it('opacity on a group composites the group', () => {
    const { ops } = convert(
      svg('<g opacity="0.4"><rect width="4" height="4"/><rect x="2" width="4" height="4"/></g>')
    );
    const group = only(ops) as GroupOp;
    expect(group.kind).toBe('group');
    expect(group.alpha).toBe(0.4);
    expect(group.matrix).toEqual(IDENTITY);
    expect(group.ops).toHaveLength(2);
    expect(group.ops.every((o) => o.alpha === 1)).toBe(true);
  });

  it('opacity 0 drops the element', () => {
    expect(convert(svg('<rect width="4" height="4" opacity="0"/>')).ops).toEqual([]);
  });

  it('opacity on fill and stroke of one shape composites them together', () => {
    const { ops } = convert(
      svg('<rect width="4" height="4" stroke="red" stroke-width="2" opacity="0.5"/>')
    );
    const group = only(ops) as GroupOp;
    expect(group.kind).toBe('group');
    expect(group.ops).toHaveLength(2);
  });

  it('the style attribute beats the presentation attribute', () => {
    const op = only(
      pathsOf(
        convert(svg('<rect width="1" height="1" fill="red" style="fill: #00ff00; opacity: .5"/>'))
          .ops
      )
    );
    expect(op.paint).toEqual(solid('#00ff00'));
    expect(op.alpha).toBe(0.5);
  });

  it('presentation properties inherit', () => {
    const { ops } = convert(
      svg(
        '<g fill="#123456" stroke="#abcdef" stroke-width="3"><g><rect width="1" height="1"/></g></g>'
      )
    );
    const [fill, stroke] = pathsOf(ops);
    expect(fill!.paint).toEqual(solid('#123456'));
    expect(stroke!.paint).toEqual(solid('#abcdef'));
    expect(stroke!.stroke!.width).toBe(3);
  });

  it('stroke style: caps, joins, miter limit, dashes', () => {
    const op = only(
      pathsOf(
        convert(
          svg(
            '<path d="M0 0L9 9" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="7" stroke-dasharray="3 1 2" stroke-dashoffset="1.5"/>'
          )
        ).ops
      )
    );
    expect(op.stroke).toEqual({
      width: 2,
      cap: 'round',
      join: 'bevel',
      miterLimit: 7,
      dash: [3, 1, 2, 3, 1, 2],
      dashOffset: 1.5,
    });
    const none = only(
      pathsOf(
        convert(svg('<path d="M0 0L9 9" fill="none" stroke="#000" stroke-dasharray="none"/>')).ops
      )
    );
    expect(none.stroke!.dash).toEqual([]);
  });

  it('a zero stroke width draws no stroke', () => {
    expect(
      convert(svg('<path d="M0 0L9 9" fill="none" stroke="#000" stroke-width="0"/>')).ops
    ).toEqual([]);
  });

  it('display none and visibility hidden are not drawn', () => {
    const { ops } = convert(
      svg(
        '<rect width="1" height="1" display="none"/><g visibility="hidden"><rect width="2" height="2"/><rect width="3" height="3" visibility="visible"/></g>'
      )
    );
    expect(pathsOf(ops).map((o) => d(o.commands))).toEqual(['M0 0 L3 0 L3 3 L0 3 Z']);
  });

  it('a colour that does not parse is reported and paints nothing', () => {
    const { ops, unsupported } = convert(svg('<rect width="1" height="1" fill="notacolour"/>'));
    expect(ops).toEqual([]);
    expect(unsupported).toEqual(['color']);
  });

  it('lengths with units and percentages', () => {
    const op = only(
      pathsOf(convert(svg('<rect x="10%" y="1in" width="0.5em" height="6pt" />')).ops)
    );
    // 10 % of the 100-wide viewBox; 1in is 96; em is the default 16 px font; 6pt is 8.
    expect(d(op.commands)).toBe('M10 96 L18 96 L18 104 L10 104 Z');
  });
});

describe('svgToScene: css', () => {
  it('css class styles from <style> are applied', () => {
    const { ops, unsupported } = convert(
      svg(
        `<style>
          /* a comment */
          .a { fill: #0000ff }
          #b { fill: #00ff00; stroke: #111111 }
          rect { stroke: #ff00ff; stroke-width: 2 }
          .c, .d { fill: #aa0000 }
        </style>
        <rect class="a" width="1" height="1"/>
        <rect id="b" class="a" width="2" height="2"/>
        <rect class="d" fill="#fefefe" width="3" height="3"/>`
      )
    );
    expect(unsupported).toEqual([]);
    const paths = pathsOf(ops);
    // Class: blue fill, type-rule stroke.
    expect(paths[0]!.paint).toEqual(solid('#0000ff'));
    expect(paths[1]!.paint).toEqual(solid('#ff00ff'));
    // The id beats the class and the type; the rule beats the presentation attribute.
    expect(paths[2]!.paint).toEqual(solid('#00ff00'));
    expect(paths[3]!.paint).toEqual(solid('#111111'));
    expect(paths[4]!.paint).toEqual(solid('#aa0000'));
  });

  it('a later rule of the same specificity wins; the inline style wins over rules', () => {
    const { ops } = convert(
      svg(
        `<style>.a{fill:#010101}.a{fill:#020202}.b{fill:#030303}</style>
        <rect class="a" width="1" height="1"/>
        <rect class="a b" style="fill:#040404" width="1" height="1"/>`
      )
    );
    expect(pathsOf(ops).map((o) => o.paint)).toEqual([solid('#020202'), solid('#040404')]);
  });

  it('@font-face is not an unsupported construct', () => {
    const { unsupported } = convert(
      svg(
        `<style>@font-face{font-family:"X";src:url(data:font/woff2;base64,AAAA) format("woff2")}</style><rect width="1" height="1"/>`
      )
    );
    expect(unsupported).toEqual([]);
  });

  it('other at-rules and unusable selectors are reported', () => {
    const { unsupported } = convert(
      svg(
        `<style>@media print{.a{fill:red}} :::bad{fill:red}</style><rect class="a" width="1" height="1"/>`
      )
    );
    expect(unsupported).toEqual(expect.arrayContaining(['@media']));
  });

  it('declarations that use var() are reported', () => {
    const { unsupported } = convert(
      svg('<style>.a{fill:var(--brand)}</style><rect class="a" width="1" height="1"/>')
    );
    expect(unsupported).toEqual(['css-variable']);
  });
});

describe('svgToScene: use', () => {
  it('use references are expanded', () => {
    const { ops, unsupported } = convert(
      svg(
        `<defs><rect id="r" width="10" height="10"/></defs>
        <use href="#r" x="5" y="6" fill="#aa0000"/>
        <use xlink:href="#r" transform="translate(50 0)"/>`
      )
    );
    expect(unsupported).toEqual([]);
    const [first, second] = pathsOf(ops);
    expect(first!.matrix).toEqual([1, 0, 0, 1, 5, 6]);
    expect(first!.paint).toEqual(solid('#aa0000'));
    expect(second!.matrix).toEqual([1, 0, 0, 1, 50, 0]);
    expect(second!.paint).toEqual(solid('#000000'));
  });

  it('what is only defined is not drawn', () => {
    expect(convert(svg('<defs><rect id="r" width="10" height="10"/></defs>')).ops).toEqual([]);
  });

  it('use of a symbol fits the symbol viewBox into the use size', () => {
    const { ops } = convert(
      svg(
        `<symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>
        <use href="#s" x="20" y="30" width="40" height="40"/>`
      )
    );
    const op = only(pathsOf(ops));
    expect(op.matrix).toEqual([4, 0, 0, 4, 20, 30]);
    expect(op.clips).toHaveLength(1);
    expect(d(op.clips[0]!.commands)).toBe('M0 0 L40 0 L40 40 L0 40 Z');
  });

  it('use of a group draws every child, with the use style inherited', () => {
    const { ops } = convert(
      svg(
        `<defs><g id="g"><rect width="2" height="2"/><circle cx="5" cy="5" r="1"/></g></defs>
        <use href="#g" fill="#101010"/>`
      )
    );
    const paths = pathsOf(ops);
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => p.paint.type === 'solid' && p.paint.hex === '#101010')).toBe(true);
  });

  it('a use that refers to itself terminates', () => {
    const { ops } = convert(
      svg('<g id="a"><rect width="1" height="1"/><use href="#a"/></g><use href="#missing"/>')
    );
    expect(pathsOf(ops)).toHaveLength(1);
  });

  it('a use bomb stops at the limit and says so', () => {
    const layers = Array.from(
      { length: 24 },
      (_, i) => `<g id="g${i + 1}"><use href="#g${i}"/><use href="#g${i}"/></g>`
    ).join('');
    const { unsupported } = convert(
      svg(`<g id="g0"><rect width="1" height="1"/></g>${layers}<use href="#g24"/>`)
    );
    expect(unsupported).toEqual(['size']);
  });
});

describe('svgToScene: gradients', () => {
  const defs = (
    gradient: string,
    body = '<rect x="10" y="20" width="40" height="20" fill="url(#g)"/>'
  ) => svg(`<defs>${gradient}</defs>${body}`);

  it('linear, userSpaceOnUse', () => {
    const { ops, unsupported } = convert(
      defs(
        `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="50" y2="0">
          <stop offset="0" stop-color="#ff0000"/><stop offset="50%" stop-color="blue" stop-opacity="0.5"/>
          <stop offset="1" style="stop-color:#00ff00"/>
        </linearGradient>`
      )
    );
    expect(unsupported).toEqual([]);
    expect(only(pathsOf(ops)).paint).toEqual({
      type: 'linear',
      x0: 10,
      y0: 0,
      x1: 50,
      y1: 0,
      stops: [
        { offset: 0, hex: '#ff0000', alpha: 1 },
        { offset: 0.5, hex: '#0000ff', alpha: 0.5 },
        { offset: 1, hex: '#00ff00', alpha: 1 },
      ],
    });
  });

  it('linear, objectBoundingBox is the default and follows the shape', () => {
    const { ops } = convert(
      defs(
        '<linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>'
      )
    );
    const paint = only(pathsOf(ops)).paint;
    if (paint.type !== 'linear') throw new Error('expected a linear paint');
    expect([paint.x0, paint.y0, paint.x1, paint.y1].map(r)).toEqual([10, 20, 50, 20]);
  });

  it('linear, a diagonal on a wide shape keeps its isolines perpendicular in the box', () => {
    const { ops } = convert(
      defs(
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>'
      )
    );
    const paint = only(pathsOf(ops)).paint;
    if (paint.type !== 'linear') throw new Error('expected a linear paint');
    // The parameter of the paint at the four corners of the 40 x 20 box at (10, 20).
    const t = (x: number, y: number) => {
      const dx = paint.x1 - paint.x0;
      const dy = paint.y1 - paint.y0;
      return ((x - paint.x0) * dx + (y - paint.y0) * dy) / (dx * dx + dy * dy);
    };
    expect(t(10, 20)).toBeCloseTo(0, 9);
    expect(t(50, 40)).toBeCloseTo(1, 9);
    expect(t(50, 20)).toBeCloseTo(0.5, 9);
    expect(t(10, 40)).toBeCloseTo(0.5, 9);
  });

  it('gradientTransform rotates a userSpaceOnUse gradient', () => {
    const { ops } = convert(
      defs(
        `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0" gradientTransform="rotate(90)">
          <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
        </linearGradient>`
      )
    );
    const paint = only(pathsOf(ops)).paint;
    if (paint.type !== 'linear') throw new Error('expected a linear paint');
    expect(paint.x0).toBeCloseTo(0, 9);
    expect(paint.y0).toBeCloseTo(0, 9);
    expect(paint.x1).toBeCloseTo(0, 9);
    expect(paint.y1).toBeCloseTo(10, 9);
  });

  it('stops and attributes come along an href chain', () => {
    const { ops } = convert(
      defs(
        `<linearGradient id="base" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
        <linearGradient id="g" xlink:href="#base" x1="0.5"/>`
      )
    );
    const paint = only(pathsOf(ops)).paint;
    if (paint.type !== 'linear') throw new Error('expected a linear paint');
    expect([paint.x0, paint.x1].map(r)).toEqual([30, 50]);
    expect(paint.stops).toHaveLength(2);
  });

  it('one stop is a solid colour, none paints nothing, offsets are clamped and ordered', () => {
    const one = convert(
      defs('<linearGradient id="g"><stop offset="0.3" stop-color="#336699"/></linearGradient>')
    );
    expect(only(pathsOf(one.ops)).paint).toEqual(solid('#336699'));
    const none = convert(defs('<linearGradient id="g"/>'));
    expect(none.ops).toEqual([]);
    const messy = convert(
      defs(
        '<linearGradient id="g"><stop offset="-1" stop-color="#000"/><stop offset="0.6" stop-color="#111"/><stop offset="0.4" stop-color="#222"/><stop offset="3" stop-color="#fff"/></linearGradient>'
      )
    );
    const paint = only(pathsOf(messy.ops)).paint;
    if (paint.type !== 'linear') throw new Error('expected a linear paint');
    expect(paint.stops.map((s) => s.offset)).toEqual([0, 0.6, 0.6, 1]);
  });

  it('fill-opacity multiplies the stop alphas', () => {
    const { ops } = convert(
      defs(
        '<linearGradient id="g"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#fff"/></linearGradient>',
        '<rect width="10" height="10" fill="url(#g)" fill-opacity="0.5"/>'
      )
    );
    const paint = only(pathsOf(ops)).paint;
    if (paint.type !== 'linear') throw new Error('expected a linear paint');
    expect(paint.stops.map((s) => s.alpha)).toEqual([0.25, 0.5]);
  });

  it('a stroke can use a gradient', () => {
    const { ops } = convert(
      defs(
        '<linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>',
        '<path d="M10 10L50 10" fill="none" stroke="url(#g)" stroke-width="4"/>'
      )
    );
    // A horizontal line has no height: the box paints nothing.
    expect(ops).toEqual([]);
    const rect = convert(
      defs(
        '<linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>',
        '<rect x="10" y="10" width="40" height="20" fill="none" stroke="url(#g)" stroke-width="4"/>'
      )
    );
    const op = only(pathsOf(rect.ops));
    expect(op.mode).toBe('stroke');
    if (op.paint.type !== 'linear') throw new Error('expected a linear paint');
    expect([op.paint.x0, op.paint.x1].map(r)).toEqual([10, 50]);
  });

  it('radial, userSpaceOnUse with a focal point', () => {
    const { ops } = convert(
      defs(
        `<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="30" cy="30" r="20" fx="25" fy="28">
          <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
        </radialGradient>`
      )
    );
    const op = only(pathsOf(ops));
    expect(op.matrix).toEqual(IDENTITY);
    expect(op.paint).toMatchObject({
      type: 'radial',
      x0: 25,
      y0: 28,
      r0: 0,
      x1: 30,
      y1: 30,
      r1: 20,
    });
  });

  it('radial on a square box keeps circles circles', () => {
    const { ops } = convert(
      defs(
        '<radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>',
        '<rect x="10" y="20" width="40" height="40" fill="url(#g)"/>'
      )
    );
    const op = only(pathsOf(ops));
    expect(op.matrix).toEqual(IDENTITY);
    expect(op.paint).toMatchObject({
      type: 'radial',
      x0: 30,
      y0: 40,
      r0: 0,
      x1: 30,
      y1: 40,
      r1: 20,
    });
  });

  it('radial on a wide box is drawn in the gradient space so it stays an ellipse', () => {
    const { ops } = convert(
      defs(
        '<radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>',
        '<rect x="10" y="20" width="40" height="20" fill="url(#g)"/>'
      )
    );
    const op = only(pathsOf(ops));
    // The box space: the unit square maps onto the shape.
    expect(op.matrix).toEqual([40, 0, 0, 20, 10, 20]);
    expect(op.paint).toMatchObject({ type: 'radial', x1: 0.5, y1: 0.5, r1: 0.5 });
    // The outline is the shape's, expressed in that space.
    const corners = endPoints(op.commands).map((p) => apply(op.matrix, p.x, p.y));
    expect(corners.map((p) => [r(p.x), r(p.y)])).toEqual([
      [10, 20],
      [50, 20],
      [50, 40],
      [10, 40],
    ]);
  });

  it('a radial gradient on a stroke of a wide box is reported', () => {
    const { unsupported } = convert(
      defs(
        '<radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>',
        '<rect width="40" height="20" fill="none" stroke="url(#g)"/>'
      )
    );
    expect(unsupported).toEqual(['radialGradient']);
  });

  it('spreadMethod other than pad is reported', () => {
    const { unsupported } = convert(
      defs(
        '<linearGradient id="g" spreadMethod="reflect"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>'
      )
    );
    expect(unsupported).toEqual(['spreadMethod']);
  });

  it('a missing reference falls back to the colour after it, else paints nothing', () => {
    const fallback = convert(svg('<rect width="4" height="4" fill="url(#nope) #336699"/>'));
    expect(only(pathsOf(fallback.ops)).paint).toEqual(solid('#336699'));
    expect(convert(svg('<rect width="4" height="4" fill="url(#nope)"/>')).ops).toEqual([]);
  });
});

describe('svgToScene: text', () => {
  /** Every glyph is `size / 2` wide: easy sums. */
  const half: Measure = (text, font) => Array.from(text, () => font.size / 2);

  it('text is placed at its baseline, one x per code point', () => {
    const { ops, unsupported } = convert(
      svg('<text x="10" y="50" font-size="20" fill="#202020">Hi</text>')
    );
    expect(unsupported).toEqual([]);
    const op = only(textsOf(ops));
    expect(op).toMatchObject({
      mode: 'fill',
      text: 'Hi',
      y: 50,
      paint: solid('#202020'),
      stroke: null,
      matrix: IDENTITY,
    });
    expect(op.font).toEqual({ family: 'Test Sans', weight: 400, style: 'normal', size: 20 });
    // Without a measuring function a glyph is 0.6 em wide.
    expect(op.xs).toEqual([10, 22]);
  });

  it('measured advances place the glyphs', () => {
    const op = only(
      textsOf(convert(svg('<text x="10" y="50" font-size="20">Hey</text>'), BOX, half).ops)
    );
    expect(op.xs).toEqual([10, 20, 30]);
  });

  it('text-anchor middle and end shift the run by its measured width', () => {
    const run = (anchor: string) =>
      only(
        textsOf(
          convert(
            svg(`<text x="50" y="50" font-size="20" text-anchor="${anchor}">abcd</text>`),
            BOX,
            half
          ).ops
        )
      ).xs;
    expect(run('start')).toEqual([50, 60, 70, 80]);
    expect(run('middle')).toEqual([30, 40, 50, 60]);
    expect(run('end')).toEqual([10, 20, 30, 40]);
  });

  it('text-anchor works without a measuring function too', () => {
    const op = only(
      textsOf(convert(svg('<text x="50" y="50" font-size="10" text-anchor="end">ab</text>')).ops)
    );
    expect(op.xs).toEqual([38, 44]);
  });

  it('a tspan with an absolute x starts a new chunk with its own anchor', () => {
    const { ops } = convert(
      svg(
        '<text y="50" font-size="20" text-anchor="middle"><tspan x="30">ab</tspan><tspan x="80">cd</tspan></text>'
      ),
      BOX,
      half
    );
    // Both chunks are in one style, so one op, with the glyphs already at their anchored x.
    expect(only(textsOf(ops)).xs).toEqual([20, 30, 70, 80]);
  });

  it('tspans continue the line, dx and dy move the pen, em units follow the font size', () => {
    const { ops } = convert(
      svg(
        '<text x="10" y="50" font-size="20">ab<tspan dx="5" dy="0.5em" fill="#ff0000" font-size="10">cd</tspan></text>'
      ),
      BOX,
      half
    );
    const [first, second] = textsOf(ops);
    expect(first!.text).toBe('ab');
    expect(first!.xs).toEqual([10, 20]);
    expect(second).toMatchObject({ text: 'cd', y: 55, paint: solid('#ff0000') });
    expect(second!.font.size).toBe(10);
    expect(second!.xs).toEqual([35, 40]);
  });

  it('per-character x and y lists', () => {
    const { ops } = convert(svg('<text x="1 5 9" y="10 20" font-size="10">abc</text>'));
    const texts = textsOf(ops);
    expect(texts.map((t) => [t.text, t.xs, t.y])).toEqual([
      ['a', [1], 10],
      ['bc', [5, 9], 20],
    ]);
  });

  it('white space collapses and the ends are trimmed', () => {
    const op = only(
      textsOf(
        convert(
          svg('<text x="0" y="10" font-size="10">\n  one   two\n <tspan> three </tspan>  </text>')
        ).ops
      )
    );
    expect(op.text).toBe('one two three');
  });

  it('a generic family maps to the default family, a named one is kept with the generic after it', () => {
    const family = (value: string) =>
      only(
        textsOf(
          convert(svg(`<text x="0" y="10" font-size="10" font-family='${value}'>a</text>`)).ops
        )
      ).font;
    expect(family('sans-serif')).toEqual({
      family: 'Test Sans',
      weight: 400,
      style: 'normal',
      size: 10,
    });
    expect(family('system-ui, Arial')).toMatchObject({ family: 'Test Sans' });
    expect(family('"Brand Sans", sans-serif')).toEqual({
      family: 'Brand Sans',
      fallback: ['sans-serif'],
      weight: 400,
      style: 'normal',
      size: 10,
    });
    expect(family('Georgia')).not.toHaveProperty('fallback');
  });

  it('the default font gives the family, fallback, weight and size where the svg says nothing', () => {
    const font: FontSpec = {
      family: 'Body',
      fallback: ['Backup'],
      weight: 500,
      style: 'italic',
      size: 14,
    };
    const { ops } = svgToScene(svg('<text x="0" y="10">a</text>'), BOX, { font });
    expect(only(textsOf(ops)).font).toEqual(font);
  });

  it('font weight and style: words, numbers and relative values', () => {
    const font = (attrs: string) =>
      only(textsOf(convert(svg(`<text x="0" y="10" font-size="10" ${attrs}>a</text>`)).ops)).font;
    expect(font('font-weight="bold"').weight).toBe(700);
    expect(font('font-weight="600"').weight).toBe(600);
    expect(font('font-weight="lighter"').weight).toBe(100);
    expect(font('font-style="italic"').style).toBe('italic');
    expect(font('font-style="oblique"').style).toBe('italic');
  });

  it('the font shorthand is not read, so it is reported', () => {
    const { unsupported } = convert(svg('<text x="0" y="9" style="font: 12px serif">a</text>'));
    expect(unsupported).toEqual(['font']);
  });

  it('dominant-baseline moves the baseline', () => {
    const y = (value: string) =>
      only(
        textsOf(
          convert(svg(`<text x="0" y="50" font-size="20" dominant-baseline="${value}">a</text>`))
            .ops
        )
      ).y;
    expect(y('auto')).toBe(50);
    expect(y('alphabetic')).toBe(50);
    expect(y('central')).toBeCloseTo(57, 9);
    expect(y('hanging')).toBeGreaterThan(y('central'));
  });

  it('stroke text gets its own op, stroke style included', () => {
    const { ops } = convert(
      svg(
        '<text x="0" y="10" font-size="10" fill="#111111" stroke="#222222" stroke-width="2">a</text>'
      )
    );
    const [fill, stroke] = textsOf(ops);
    expect(fill).toMatchObject({ mode: 'fill', paint: solid('#111111'), stroke: null });
    expect(stroke).toMatchObject({ mode: 'stroke', paint: solid('#222222') });
    expect(stroke!.stroke!.width).toBe(2);
  });

  it('text takes the transform of its ancestors', () => {
    const { ops } = convert(
      svg('<g transform="translate(5 6)"><text y="10" font-size="10">a</text></g>')
    );
    expect(only(textsOf(ops)).matrix).toEqual([1, 0, 0, 1, 5, 6]);
  });

  it('text that cannot be placed is reported', () => {
    const { unsupported } = convert(
      svg(
        '<text x="0" y="10" font-size="10" letter-spacing="2" text-decoration="underline" rotate="10" textLength="30">ab</text>'
      )
    );
    expect(unsupported).toEqual(
      expect.arrayContaining(['letter-spacing', 'text-decoration', 'rotate', 'textLength'])
    );
  });

  it('a gradient on text that would need an ellipse is reported', () => {
    const { ops, unsupported } = convert(
      svg(
        `<defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="5" cy="5" r="5" gradientTransform="scale(3 1)"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient></defs><text x="0" y="10" font-size="10" fill="url(#g)">ab</text>`
      )
    );
    expect(ops).toEqual([]);
    expect(unsupported).toEqual(['radialGradient']);
  });

  it('text that keeps its white space is reported', () => {
    const preserved = convert(svg('<text x="0" y="9" xml:space="preserve">a  b</text>'));
    expect(preserved.unsupported).toEqual(['xml:space']);
    const pre = convert(svg('<text x="0" y="9" style="white-space: pre">a  b</text>'));
    expect(pre.unsupported).toEqual(['xml:space']);
  });

  it('a gradient on text works in user space and is reported in box units', () => {
    const grad = (units: string) =>
      convert(
        svg(
          `<defs><linearGradient id="g" ${units} x1="0" x2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><text x="0" y="10" font-size="10" fill="url(#g)">ab</text>`
        )
      );
    const user = grad('gradientUnits="userSpaceOnUse"');
    expect(only(textsOf(user.ops)).paint.type).toBe('linear');
    expect(grad('').unsupported).toEqual(['textGradient']);
  });
});

describe('svgToScene: clip paths', () => {
  it('clipPath in user space becomes a clip on the ops', () => {
    const { ops, unsupported } = convert(
      svg(
        `<defs><clipPath id="c"><rect x="0" y="0" width="50" height="40"/></clipPath></defs>
        <g transform="translate(10 0)"><rect clip-path="url(#c)" width="100" height="100"/></g>`
      )
    );
    expect(unsupported).toEqual([]);
    const op = only(pathsOf(ops));
    expect(op.clips).toHaveLength(1);
    expect(op.clips[0]).toMatchObject({ rule: 'nonzero', matrix: [1, 0, 0, 1, 10, 0] });
    expect(d(op.clips[0]!.commands)).toBe('M0 0 L50 0 L50 40 L0 40 Z');
  });

  it('a clip on a group applies to every child, and nested clips stack', () => {
    const { ops } = convert(
      svg(
        `<defs>
          <clipPath id="a"><circle cx="50" cy="50" r="40"/></clipPath>
          <clipPath id="b"><rect width="60" height="60"/></clipPath>
        </defs>
        <g clip-path="url(#a)"><rect width="9" height="9"/><rect clip-path="url(#b)" width="8" height="8"/></g>`
      )
    );
    const [first, second] = pathsOf(ops);
    expect(first!.clips).toHaveLength(1);
    expect(second!.clips).toHaveLength(2);
    // The group's clip is shared by reference, which lets a writer open one clip group for both.
    expect(second!.clips[0]).toBe(first!.clips[0]);
  });

  it('several shapes and their transforms are one clip', () => {
    const { ops } = convert(
      svg(
        `<defs><clipPath id="c" clip-rule="evenodd" transform="translate(1 1)">
          <rect width="4" height="4"/><rect width="2" height="2" transform="translate(10 0)"/>
        </clipPath></defs><rect clip-path="url(#c)" width="50" height="50"/>`
      )
    );
    const clip = only(pathsOf(ops)).clips[0]!;
    expect(clip.rule).toBe('evenodd');
    expect(d(clip.commands)).toBe('M1 1 L5 1 L5 5 L1 5 Z M11 1 L13 1 L13 3 L11 3 Z');
  });

  it('objectBoundingBox units and nested clip-paths are reported, not guessed', () => {
    const units = convert(
      svg(
        '<defs><clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath></defs><rect clip-path="url(#c)" width="9" height="9"/>'
      )
    );
    expect(units.unsupported).toEqual(['clipPathUnits']);
    const text = convert(
      svg(
        '<defs><clipPath id="c"><text y="9">a</text></clipPath></defs><rect clip-path="url(#c)" width="9" height="9"/>'
      )
    );
    expect(text.unsupported).toEqual(['clipPath:text']);
  });

  it('an empty clipPath clips everything away', () => {
    const { ops } = convert(
      svg('<defs><clipPath id="c"/></defs><rect clip-path="url(#c)" width="9" height="9"/>')
    );
    expect(only(pathsOf(ops)).clips[0]!.commands).toEqual([]);
  });
});

describe('svgToScene: what it cannot do', () => {
  it('unknown elements (filter, mask, pattern, foreignObject) are listed in unsupported', () => {
    const { ops, unsupported } = convert(
      svg(
        `<defs>
          <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
          <mask id="m"><rect width="10" height="10" fill="#fff"/></mask>
          <pattern id="p" width="4" height="4"><rect width="2" height="2"/></pattern>
        </defs>
        <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
        <rect width="5" height="5" fill="#101010"/>`
      )
    );
    expect(unsupported).toEqual(['filter', 'feGaussianBlur', 'mask', 'pattern', 'foreignObject']);
    // The rest of the image is still converted.
    expect(only(pathsOf(ops)).paint).toEqual(solid('#101010'));
  });

  it('elements that are not drawn at all are skipped without a word', () => {
    const { ops, unsupported } = convert(
      svg(
        '<title>t</title><desc>d</desc><metadata/><defs/><rect width="5" height="5"/><ns:meta xmlns:ns="urn:x"/>'
      )
    );
    expect(unsupported).toEqual([]);
    expect(pathsOf(ops)).toHaveLength(1);
  });

  it('properties that need a filter, a mask or markers are listed', () => {
    const { unsupported } = convert(
      svg(
        `<rect width="5" height="5" filter="url(#f)"/>
        <rect width="5" height="5" style="mask:url(#m)"/>
        <path d="M0 0L5 5" stroke="#000" marker-end="url(#a)"/>
        <rect width="5" height="5" mix-blend-mode="multiply"/>`
      )
    );
    expect(unsupported).toEqual(['filter', 'mask', 'marker', 'mix-blend-mode']);
  });

  it('a pattern fill is reported and paints nothing', () => {
    const { ops, unsupported } = convert(
      svg(
        '<defs><pattern id="p" width="4" height="4"><rect width="2" height="2"/></pattern></defs><rect width="5" height="5" fill="url(#p)"/>'
      )
    );
    expect(ops).toEqual([]);
    expect(unsupported).toEqual(['pattern']);
  });

  it('markup that is not an svg document says so', () => {
    for (const markup of [
      '',
      '<svg',
      '<html xmlns="http://www.w3.org/1999/xhtml"/>',
      '<svg xmlns="x"/>',
    ]) {
      expect(convert(markup)).toEqual({ ops: [], unsupported: ['document'] });
    }
  });

  it('the output is the same for the same markup', () => {
    const markup = svg(
      '<style>.a{fill:#336699}</style><g class="a"><circle cx="10" cy="10" r="5"/><text y="9">a</text></g>'
    );
    expect(convert(markup)).toEqual(convert(markup));
  });
});

describe('svgToScene: the Recharts bar chart', () => {
  const fixture = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'barChart.svg'),
    'utf8'
  );
  // 7 px per glyph at 13 px: round numbers to check the anchors against.
  const seven: Measure = (text) => Array.from(text, () => 7);

  it('the Recharts bar chart fixture converts without unsupported entries', () => {
    const { ops, unsupported } = convert(
      fixture,
      { matrix: IDENTITY, width: 480, height: 320 },
      seven
    );
    expect(unsupported).toEqual([]);
    const paths = pathsOf(ops);
    const texts = textsOf(ops);
    // 5 grid lines and 2 axis lines are strokes; 4 bars are fills.
    expect(paths.filter((p) => p.mode === 'stroke')).toHaveLength(7);
    expect(paths.filter((p) => p.mode === 'fill')).toHaveLength(4);
    expect(texts.map((t) => t.text)).toEqual(['A', 'B', 'C', 'D', '0', '20', '40', '60', '80']);
    expect(ops.every((op) => op.matrix.join() === IDENTITY.join())).toBe(true);
  });

  it('bars keep their colours and rounded corners', () => {
    const { ops } = convert(fixture, { matrix: IDENTITY, width: 480, height: 320 }, seven);
    const bars = pathsOf(ops).filter((p) => p.mode === 'fill');
    expect(bars.map((b) => b.paint)).toEqual([
      solid('#1d3557'),
      solid('#457b9d'),
      solid('#d62839'),
      solid('#b5470f'),
    ]);
    const first = bars[0]!;
    expect(first.commands[0]).toEqual({ op: 'M', x: 50.5, y: 153 });
    expect(first.commands.filter((c) => c.op === 'C').length).toBeGreaterThanOrEqual(4);
    expect(d(first.commands.slice(-3))).toBe('L134.5 282 L50.5 282 Z');
  });

  it('grid lines are dashed, axes are solid', () => {
    const { ops } = convert(fixture, { matrix: IDENTITY, width: 480, height: 320 }, seven);
    const strokes = pathsOf(ops).filter((p) => p.mode === 'stroke');
    expect(strokes.slice(0, 5).every((s) => s.stroke!.dash.join() === '3,3')).toBe(true);
    expect(
      strokes.slice(0, 5).every((s) => s.paint.type === 'solid' && s.paint.hex === '#e0e0df')
    ).toBe(true);
    expect(strokes.slice(5).every((s) => s.stroke!.dash.length === 0)).toBe(true);
    expect(d(strokes[0]!.commands)).toBe('M40 282 L460 282');
  });

  it('labels sit on their baseline, in the chart font, anchored as Recharts says', () => {
    const { ops } = convert(fixture, { matrix: IDENTITY, width: 480, height: 320 }, seven);
    const [a, , , , zero, twenty] = textsOf(ops);
    expect(a).toMatchObject({ text: 'A', paint: solid('#40403f') });
    expect(a!.font).toEqual({
      family: 'Chart Brand Sans',
      fallback: ['sans-serif'],
      weight: 400,
      style: 'normal',
      size: 13,
    });
    // x label: text-anchor middle at 92.5, dy 0.71em below y 290.
    expect(a!.xs[0]).toBeCloseTo(92.5 - 3.5, 9);
    expect(a!.y).toBeCloseTo(290 + 0.71 * 13, 9);
    // y label: text-anchor end at 32, dy 0.355em.
    expect(zero!.xs[0]).toBeCloseTo(32 - 7, 9);
    expect(twenty!.xs).toEqual([32 - 14, 32 - 7]);
    expect(zero!.y).toBeCloseTo(282 + 0.355 * 13, 9);
  });

  it('the chart scales into a box on the page', () => {
    const box = { matrix: [1, 0, 0, 1, 100, 200] as Matrix, width: 240, height: 160 };
    const { ops } = convert(fixture, box, seven);
    expect(pathsOf(ops)[0]!.matrix).toEqual([0.5, 0, 0, 0.5, 100, 200]);
  });
});
