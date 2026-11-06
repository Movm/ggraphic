// SPDX-License-Identifier: AGPL-3.0-only
// Node lane: there is no DOM here. The measuring context is a real 2D context from
// `@napi-rs/canvas`, cast to the DOM type at this boundary only.
import { describe, expect, it } from 'vitest';

import { IDENTITY } from './matrix.js';
import { RecordingContext } from './recordingContext.js';

import type { PathCommand, SceneOp } from './types.js';

const { createCanvas } = await import('@napi-rs/canvas');

function setup() {
  const unknown: string[] = [];
  const measure = createCanvas(1, 1).getContext('2d') as unknown as CanvasRenderingContext2D;
  const ctx = new RecordingContext({
    measure,
    page: 0,
    width: 400,
    height: 300,
    onUnknown: (call) => unknown.push(call),
  });
  return { ctx, unknown, measure };
}

function lastOp<K extends SceneOp['kind']>(
  ctx: RecordingContext,
  kind: K
): Extract<SceneOp, { kind: K }> {
  const op = ctx.ops[ctx.ops.length - 1];
  if (!op || op.kind !== kind) throw new Error(`expected the last op to be a ${kind}`);
  return op as Extract<SceneOp, { kind: K }>;
}

const image = (width: number, height: number) =>
  createCanvas(width, height) as unknown as CanvasImageSource;

/** Points on every cubic of a path, to check geometry independent of the segmentation. */
function sampleCurves(commands: PathCommand[], steps = 20): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let cx = 0;
  let cy = 0;
  for (const c of commands) {
    if (c.op === 'M' || c.op === 'L') {
      cx = c.x;
      cy = c.y;
    } else if (c.op === 'C') {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        points.push({
          x: u ** 3 * cx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x,
          y: u ** 3 * cy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y,
        });
      }
      cx = c.x;
      cy = c.y;
    }
  }
  return points;
}

describe('RecordingContext paths and paint', () => {
  it('records a filled rect with the current matrix and alpha', () => {
    const { ctx, unknown } = setup();
    ctx.translate(10, 20);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.rect(0, 0, 30, 40);
    ctx.fill();

    expect(ctx.ops).toHaveLength(1);
    expect(lastOp(ctx, 'path')).toEqual({
      kind: 'path',
      mode: 'fill',
      matrix: [1, 0, 0, 1, 10, 20],
      alpha: 0.5,
      clips: [],
      shadow: null,
      rule: 'nonzero',
      paint: { type: 'solid', hex: '#ff0000', alpha: 1 },
      stroke: null,
      commands: [
        { op: 'M', x: 0, y: 0 },
        { op: 'L', x: 30, y: 0 },
        { op: 'L', x: 30, y: 40 },
        { op: 'L', x: 0, y: 40 },
        { op: 'Z' },
      ],
    });
    expect(unknown).toEqual([]);
  });

  it('records the fill rule', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.rect(0, 0, 10, 10);
    ctx.fill('evenodd');
    expect(lastOp(ctx, 'path').rule).toBe('evenodd');
  });

  it('parses css colours', () => {
    const { ctx, unknown } = setup();
    ctx.fillStyle = 'rgba(0,128,255,0.25)';
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').paint).toEqual({ type: 'solid', hex: '#0080ff', alpha: 0.25 });

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, 5, 5);
    expect(ctx.ops).toHaveLength(2);
    expect(lastOp(ctx, 'path').paint).toMatchObject({ type: 'solid', alpha: 0 });

    ctx.fillStyle = '#abc';
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').paint).toEqual({ type: 'solid', hex: '#aabbcc', alpha: 1 });

    // Named and hsl colours go through the measuring context's own parser.
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').paint).toEqual({ type: 'solid', hex: '#ff0000', alpha: 1 });
    expect(unknown).toEqual([]);
  });

  it('ignores an unreadable colour like a canvas does, and reports it', () => {
    const { ctx, unknown } = setup();
    ctx.fillStyle = '#123456';
    ctx.fillStyle = 'not-a-colour';
    expect(unknown).toEqual(['color:not-a-colour']);
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').paint).toEqual({ type: 'solid', hex: '#123456', alpha: 1 });
  });

  it('arcs become cubic beziers within 0.01 px', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.arc(50, 50, 20, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    const { commands } = lastOp(ctx, 'path');
    expect(new Set(commands.map((c) => c.op))).toEqual(new Set(['M', 'C', 'Z']));
    expect(commands[0]).toEqual({ op: 'M', x: 70, y: 50 });
    const points = sampleCurves(commands);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(Math.abs(Math.hypot(p.x - 50, p.y - 50) - 20)).toBeLessThan(0.01);
    }
    const end = commands.filter((c) => c.op === 'C').at(-1)!;
    expect(end).toMatchObject({ op: 'C' });
    expect((end as { x: number }).x).toBeCloseTo(70, 9);
    expect((end as { y: number }).y).toBeCloseTo(50, 9);
  });

  it('keeps large arcs precise', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.arc(0, 0, 3000, 0, Math.PI * 2);
    ctx.fill();
    for (const p of sampleCurves(lastOp(ctx, 'path').commands)) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 3000)).toBeLessThan(0.05);
    }
  });

  it('arc direction follows the canvas rules', () => {
    const { ctx } = setup();
    // Clockwise on screen from 0 to a quarter turn ends at the bottom: +y.
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI / 2);
    ctx.stroke();
    const cw = lastOp(ctx, 'path').commands.at(-1) as { x: number; y: number };
    expect(cw.x).toBeCloseTo(0, 9);
    expect(cw.y).toBeCloseTo(10, 9);
    // Counter-clockwise from 0 to minus a quarter turn ends at the top: -y.
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, -Math.PI / 2, true);
    ctx.stroke();
    const ccw = lastOp(ctx, 'path').commands.at(-1) as { x: number; y: number };
    expect(ccw.x).toBeCloseTo(0, 9);
    expect(ccw.y).toBeCloseTo(-10, 9);
    // Counter-clockwise from 0 to a quarter turn takes the long way round, through (-10, 0).
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI / 2, true);
    ctx.stroke();
    const long = sampleCurves(lastOp(ctx, 'path').commands);
    expect(Math.min(...long.map((p) => Math.hypot(p.x + 10, p.y)))).toBeLessThan(0.5);
  });

  it('a rotated ellipse stays on the ellipse', () => {
    const { ctx } = setup();
    const rotation = Math.PI / 6;
    ctx.beginPath();
    ctx.ellipse(40, 30, 20, 10, rotation, 0, Math.PI * 2);
    ctx.fill();
    for (const p of sampleCurves(lastOp(ctx, 'path').commands)) {
      const dx = p.x - 40;
      const dy = p.y - 30;
      const u = dx * Math.cos(rotation) + dy * Math.sin(rotation);
      const v = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
      expect(Math.abs(Math.hypot(u / 20, v / 10) - 1)).toBeLessThan(0.001);
    }
  });

  it('arcTo draws a tangent arc (rounded corner)', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(90, 0);
    ctx.arcTo(100, 0, 100, 10, 10);
    ctx.lineTo(100, 90);
    ctx.fill();
    const { commands } = lastOp(ctx, 'path');
    // The corner arc is centred on (90, 10) with radius 10 and ends at (100, 10).
    const curves = commands.filter((c) => c.op === 'C');
    expect(curves.length).toBeGreaterThan(0);
    for (const p of sampleCurves(commands)) {
      expect(Math.abs(Math.hypot(p.x - 90, p.y - 10) - 10)).toBeLessThan(0.01);
    }
    const end = curves.at(-1) as { x: number; y: number };
    expect(end.x).toBeCloseTo(100, 9);
    expect(end.y).toBeCloseTo(10, 9);
    // The tangent point equals the current point, so no zero-length line is added.
    expect(commands.slice(0, 3)).toEqual([
      { op: 'M', x: 10, y: 0 },
      { op: 'L', x: 90, y: 0 },
      expect.objectContaining({ op: 'C' }),
    ]);
  });

  it('arcTo falls back to a line when the points are collinear', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arcTo(10, 0, 20, 0, 5);
    ctx.stroke();
    expect(lastOp(ctx, 'path').commands).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 0 },
    ]);
  });

  it('roundRect covers its box and starts after the first corner', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.roundRect(0, 0, 100, 50, 10);
    ctx.fill();
    const { commands } = lastOp(ctx, 'path');
    expect(commands[0]).toEqual({ op: 'M', x: 10, y: 0 });
    expect(commands.at(-1)).toEqual({ op: 'Z' });
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of commands) {
      if (c.op === 'Z') continue;
      xs.push(c.x);
      ys.push(c.y);
    }
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(100, 9);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...ys)).toBeCloseTo(50, 9);
  });

  it('a path built under another matrix is expressed in the space of the draw call', () => {
    const { ctx } = setup();
    // The shape Konva's Ellipse draws: scale for the arc, restore, stroke with a round pen.
    ctx.translate(10, 20);
    ctx.beginPath();
    ctx.save();
    ctx.scale(2, 1);
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.restore();
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.stroke();

    const op = lastOp(ctx, 'path');
    expect(op.matrix).toEqual([1, 0, 0, 1, 10, 20]);
    expect(op.stroke?.width).toBe(3);
    for (const p of sampleCurves(op.commands)) {
      expect(Math.abs(Math.hypot(p.x / 10, p.y / 5) - 1)).toBeLessThan(0.001);
    }
  });

  it('a gradient fill keeps the matrix of the fill call', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.translate(10, 10);
    ctx.save();
    ctx.scale(2, 2);
    ctx.rect(0, 0, 5, 5);
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0, 100, 0);
    g.addColorStop(0, '#000000');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fill();
    const op = lastOp(ctx, 'path');
    // The gradient is defined in the space of the fill call, so the op must be too.
    expect(op.matrix).toEqual([1, 0, 0, 1, 10, 10]);
    expect(op.commands[2]).toEqual({ op: 'L', x: 10, y: 10 });
  });

  it('fillRect and strokeRect do not touch the current path', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.rect(0, 0, 1, 1);
    ctx.fillRect(5, 5, 10, 10);
    ctx.strokeRect(5, 5, 10, 10);
    expect(ctx.ops.map((o) => (o.kind === 'path' ? o.mode : o.kind))).toEqual(['fill', 'stroke']);
    ctx.fill();
    expect(lastOp(ctx, 'path').commands[1]).toEqual({ op: 'L', x: 1, y: 0 });
  });

  it('draws nothing for an empty path or a lone moveTo', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.fill();
    ctx.moveTo(1, 1);
    ctx.stroke();
    expect(ctx.ops).toEqual([]);
  });

  it('a lineTo on an empty path starts the subpath', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.lineTo(1, 2);
    ctx.lineTo(3, 4);
    ctx.stroke();
    expect(lastOp(ctx, 'path').commands).toEqual([
      { op: 'M', x: 1, y: 2 },
      { op: 'L', x: 3, y: 4 },
    ]);
  });

  it('records quadratic and cubic curves as given', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(5, 10, 10, 0);
    ctx.bezierCurveTo(12, -5, 18, -5, 20, 0);
    ctx.stroke();
    expect(lastOp(ctx, 'path').commands).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'Q', x1: 5, y1: 10, x: 10, y: 0 },
      { op: 'C', x1: 12, y1: -5, x2: 18, y2: -5, x: 20, y: 0 },
    ]);
  });
});

describe('RecordingContext state', () => {
  it('save/restore restores matrix, alpha, paints, line state, clips, shadow and font', () => {
    const { ctx } = setup();
    ctx.translate(5, 5);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#112233';
    ctx.strokeStyle = '#445566';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'bevel';
    ctx.miterLimit = 2;
    ctx.setLineDash([1, 2]);
    ctx.lineDashOffset = 4;
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.font = 'italic 600 12px Foo';
    ctx.beginPath();
    ctx.rect(0, 0, 50, 50);
    ctx.clip();

    ctx.save();
    ctx.translate(100, 100);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 7;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.shadowBlur = 0;
    ctx.font = '10px Bar';
    ctx.beginPath();
    ctx.rect(0, 0, 5, 5);
    ctx.clip();
    ctx.restore();

    ctx.beginPath();
    ctx.rect(0, 0, 10, 10);
    ctx.stroke();
    expect(lastOp(ctx, 'path')).toMatchObject({
      matrix: [1, 0, 0, 1, 5, 5],
      alpha: 0.4,
      paint: { hex: '#445566' },
      stroke: { width: 3, cap: 'round', join: 'bevel', miterLimit: 2, dash: [1, 2], dashOffset: 4 },
      shadow: { hex: '#000000', alpha: 1, blur: 4, offsetX: 0, offsetY: 0 },
    });
    expect(lastOp(ctx, 'path').clips).toHaveLength(1);
    ctx.fill();
    expect(lastOp(ctx, 'path').paint).toEqual({ type: 'solid', hex: '#112233', alpha: 1 });
    ctx.fillText('x', 0, 0);
    expect(lastOp(ctx, 'text').font).toEqual({
      family: 'Foo',
      weight: 600,
      style: 'italic',
      size: 12,
    });
  });

  it('restore without save is a no-op', () => {
    const { ctx } = setup();
    ctx.translate(3, 4);
    ctx.restore();
    expect(ctx.getTransform()).toMatchObject({ e: 3, f: 4 });
  });

  it('keeps the current path across save/restore, as a canvas does', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.save();
    ctx.rect(0, 0, 4, 4);
    ctx.restore();
    ctx.fill();
    expect(lastOp(ctx, 'path').commands).toHaveLength(5);
  });

  it('composes transforms in canvas order', () => {
    const { ctx } = setup();
    ctx.translate(10, 0);
    ctx.scale(2, 2);
    expect(ctx.getTransform()).toMatchObject({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 0 });
    ctx.rotate(Math.PI / 2);
    const m = ctx.getTransform();
    expect(m.a).toBeCloseTo(0, 12);
    expect(m.b).toBeCloseTo(2, 12);
    expect(m.c).toBeCloseTo(-2, 12);
    expect(m.d).toBeCloseTo(0, 12);
    ctx.setTransform(1, 0, 0, 1, 7, 8);
    expect(ctx.getTransform()).toMatchObject({ a: 1, e: 7, f: 8 });
    ctx.transform(1, 0, 0, 1, 1, 1);
    expect(ctx.getTransform()).toMatchObject({ e: 8, f: 9 });
    ctx.resetTransform();
    expect(ctx.getTransform()).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it('ignores non-finite arguments like a canvas does', () => {
    const { ctx } = setup();
    ctx.translate(Number.NaN, 5);
    ctx.setTransform(1, 0, 0, Number.POSITIVE_INFINITY, 0, 0);
    ctx.beginPath();
    ctx.moveTo(0, Number.NaN);
    ctx.rect(0, 0, 1, Number.NaN);
    ctx.fill();
    expect(ctx.getTransform()).toMatchObject({ a: 1, d: 1, e: 0, f: 0 });
    expect(ctx.ops).toEqual([]);
  });

  it('ignores invalid property values like a canvas does', () => {
    const { ctx } = setup();
    ctx.lineWidth = 0;
    ctx.lineWidth = -2;
    ctx.lineWidth = Number.NaN;
    expect(ctx.lineWidth).toBe(1);
    ctx.globalAlpha = 2;
    expect(ctx.globalAlpha).toBe(1);
    ctx.lineCap = 'diamond' as CanvasLineCap;
    expect(ctx.lineCap).toBe('butt');
    ctx.setLineDash([-1, 2]);
    expect(ctx.getLineDash()).toEqual([]);
    ctx.shadowBlur = -3;
    expect(ctx.shadowBlur).toBe(0);
  });

  it('an odd dash list is repeated, as the canvas spec says', () => {
    const { ctx } = setup();
    ctx.setLineDash([3]);
    expect(ctx.getLineDash()).toEqual([3, 3]);
    ctx.setLineDash([1, 2, 3]);
    expect(ctx.getLineDash()).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('clip intersects: two nested clips give the next op two ClipPaths', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.rect(0, 0, 100, 100);
    ctx.clip();
    ctx.translate(10, 10);
    ctx.beginPath();
    ctx.rect(0, 0, 50, 50);
    ctx.clip('evenodd');
    ctx.fillRect(0, 0, 5, 5);

    expect(lastOp(ctx, 'path').clips).toEqual([
      {
        matrix: IDENTITY,
        rule: 'nonzero',
        commands: [
          { op: 'M', x: 0, y: 0 },
          { op: 'L', x: 100, y: 0 },
          { op: 'L', x: 100, y: 100 },
          { op: 'L', x: 0, y: 100 },
          { op: 'Z' },
        ],
      },
      {
        matrix: [1, 0, 0, 1, 10, 10],
        rule: 'evenodd',
        commands: [
          { op: 'M', x: 0, y: 0 },
          { op: 'L', x: 50, y: 0 },
          { op: 'L', x: 50, y: 50 },
          { op: 'L', x: 0, y: 50 },
          { op: 'Z' },
        ],
      },
    ]);
  });

  it('stroke records StrokeStyle', () => {
    const { ctx } = setup();
    ctx.strokeStyle = '#0000FF';
    ctx.lineWidth = 6;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 3;
    ctx.setLineDash([4, 2]);
    ctx.lineDashOffset = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    expect(lastOp(ctx, 'path')).toMatchObject({
      mode: 'stroke',
      paint: { type: 'solid', hex: '#0000ff', alpha: 1 },
      stroke: {
        width: 6,
        cap: 'square',
        join: 'round',
        miterLimit: 3,
        dash: [4, 2],
        dashOffset: 1.5,
      },
    });
  });

  it('the canvas getter reports the size given in the options', () => {
    const { ctx } = setup();
    expect(ctx.canvas).toMatchObject({ width: 400, height: 300 });
  });
});

describe('RecordingContext gradients and patterns', () => {
  it('linear and radial gradients keep stops in offset order with lower case hexes', () => {
    const { ctx } = setup();
    const linear = ctx.createLinearGradient(0, 0, 100, 0);
    linear.addColorStop(1, '#00FF00');
    linear.addColorStop(0, '#FF0000');
    ctx.fillStyle = linear;
    ctx.fillRect(0, 0, 100, 10);
    expect(lastOp(ctx, 'path').paint).toEqual({
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: [
        { offset: 0, hex: '#ff0000', alpha: 1 },
        { offset: 1, hex: '#00ff00', alpha: 1 },
      ],
    });

    const radial = ctx.createRadialGradient(10, 10, 2, 20, 20, 50);
    radial.addColorStop(0.5, 'rgba(0, 0, 255, 0.5)');
    radial.addColorStop(0, '#FFFFFF');
    ctx.strokeStyle = radial;
    ctx.strokeRect(0, 0, 10, 10);
    expect(lastOp(ctx, 'path').paint).toEqual({
      type: 'radial',
      x0: 10,
      y0: 10,
      r0: 2,
      x1: 20,
      y1: 20,
      r1: 50,
      stops: [
        { offset: 0, hex: '#ffffff', alpha: 1 },
        { offset: 0.5, hex: '#0000ff', alpha: 0.5 },
      ],
    });
  });

  it('a gradient with one stop is that colour; one without stops paints nothing', () => {
    const { ctx } = setup();
    const one = ctx.createLinearGradient(0, 0, 10, 0);
    one.addColorStop(0.3, '#336699');
    ctx.fillStyle = one;
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').paint).toEqual({ type: 'solid', hex: '#336699', alpha: 1 });

    const none = ctx.createLinearGradient(0, 0, 10, 0);
    ctx.fillStyle = none;
    ctx.fillRect(0, 0, 5, 5);
    expect(ctx.ops).toHaveLength(1);
  });

  it('a degenerate linear gradient paints nothing', () => {
    const { ctx } = setup();
    const g = ctx.createLinearGradient(5, 5, 5, 5);
    g.addColorStop(0, '#000000');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 5, 5);
    expect(ctx.ops).toEqual([]);
  });

  it('rejects a colour stop offset outside 0..1', () => {
    const { ctx } = setup();
    expect(() => ctx.createLinearGradient(0, 0, 1, 0).addColorStop(1.5, '#000')).toThrow(
      RangeError
    );
  });

  it('pattern paint from createPattern(canvas, repeat)', () => {
    const { ctx, unknown } = setup();
    const tile = image(8, 6);
    const pattern = ctx.createPattern(tile, 'repeat');
    expect(pattern).not.toBeNull();
    ctx.fillStyle = pattern!;
    ctx.fillRect(0, 0, 50, 50);
    const paint = lastOp(ctx, 'path').paint;
    if (paint.type !== 'pattern') throw new Error('expected a pattern paint');
    expect(paint.repeat).toBe('repeat');
    expect(paint.matrix).toEqual(IDENTITY);
    expect(paint.image).toEqual({ kind: 'element', element: tile, width: 8, height: 6 });
    if (paint.image.kind !== 'element') throw new Error('unreachable');
    expect(paint.image.element).toBe(tile);
    expect(unknown).toEqual([]);

    pattern!.setTransform({ a: 2, b: 0, c: 0, d: 2, e: 3, f: 4 });
    ctx.fillRect(0, 0, 50, 50);
    const moved = lastOp(ctx, 'path').paint;
    if (moved.type !== 'pattern') throw new Error('expected a pattern paint');
    expect(moved.matrix).toEqual([2, 0, 0, 2, 3, 4]);
  });

  it('an empty repetition means repeat; other modes are unknown', () => {
    const { ctx, unknown } = setup();
    expect(ctx.createPattern(image(2, 2), '')).not.toBeNull();
    expect(unknown).toEqual([]);
    expect(ctx.createPattern(image(2, 2), 'no-repeat')).toBeNull();
    expect(unknown).toEqual(['createPattern:no-repeat']);
  });

  it('a paint object the recorder did not make is unknown, and the op is skipped', () => {
    // Konva builds its own gradients on a private native context; the recorder cannot read them.
    const { ctx, unknown, measure } = setup();
    ctx.fillStyle = measure.createLinearGradient(0, 0, 10, 0);
    ctx.fillRect(0, 0, 5, 5);
    expect(ctx.ops).toEqual([]);
    expect(unknown).toEqual(['fillStyle:foreign-paint']);
    ctx.strokeStyle = measure.createLinearGradient(0, 0, 10, 0);
    ctx.strokeRect(0, 0, 5, 5);
    expect(unknown).toEqual(['fillStyle:foreign-paint', 'strokeStyle:foreign-paint']);
  });
});

describe('RecordingContext text', () => {
  const FONT = '700 40px sans-serif';

  it('text baseline: middle is converted to alphabetic', () => {
    const { ctx, measure } = setup();
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    ctx.fillText('Hg', 5, 50);

    measure.font = FONT;
    measure.textBaseline = 'middle';
    const metrics = measure.measureText('Hg');
    const op = lastOp(ctx, 'text');
    expect(op.mode).toBe('fill');
    expect(op.text).toBe('Hg');
    // `alphabeticBaseline` is the distance from the textBaseline line UP to the alphabetic
    // baseline, so a negative value means the alphabetic baseline lies below the middle line.
    expect(op.y).toBeCloseTo(50 - metrics.alphabeticBaseline, 3);
    expect(op.y).toBeGreaterThan(50);
    expect(op.font).toEqual({ family: 'sans-serif', weight: 700, style: 'normal', size: 40 });
    expect(op.xs).toHaveLength(2);
    expect(op.xs[0]).toBe(5);
  });

  it('a top baseline agrees with font ascents measured at the alphabetic baseline', () => {
    const { ctx, measure } = setup();
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    ctx.fillText('H', 0, 10);

    measure.font = FONT;
    measure.textBaseline = 'alphabetic';
    const alphabetic = measure.measureText('H').fontBoundingBoxAscent;
    measure.textBaseline = 'top';
    const top = measure.measureText('H').fontBoundingBoxAscent;
    expect(lastOp(ctx, 'text').y).toBeCloseTo(10 + (alphabetic - top), 3);
  });

  it('an alphabetic baseline is used as given', () => {
    const { ctx } = setup();
    ctx.font = FONT;
    ctx.fillText('H', 3, 77);
    expect(lastOp(ctx, 'text').y).toBe(77);
  });

  it('reports an engine that cannot say where the alphabetic baseline is', () => {
    const unknown: string[] = [];
    const stub = {
      measureText: () => ({ width: 10 }),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const ctx = new RecordingContext({
      measure: stub,
      page: 0,
      width: 10,
      height: 10,
      onUnknown: (call) => unknown.push(call),
    });
    ctx.fillText('x', 0, 5);
    expect(unknown).toEqual([]);
    ctx.textBaseline = 'middle';
    ctx.fillText('x', 0, 5);
    expect(unknown).toEqual(['measureText:alphabeticBaseline']);
  });

  it('merges per-glyph fillText on one baseline into one text op', () => {
    const { ctx } = setup();
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText('A', 0, 10);
    ctx.fillText('B', 12, 10);
    ctx.fillText('C', 24, 10);
    expect(ctx.ops).toHaveLength(1);
    expect(lastOp(ctx, 'text')).toMatchObject({ text: 'ABC', xs: [0, 12, 24], y: 10 });

    ctx.fillText('D', 36, 30);
    expect(ctx.ops).toHaveLength(2);
    expect(lastOp(ctx, 'text')).toMatchObject({ text: 'D', xs: [36], y: 30 });

    ctx.fillStyle = '#ff0000';
    ctx.fillText('E', 48, 30);
    expect(ctx.ops).toHaveLength(3);
    expect(lastOp(ctx, 'text')).toMatchObject({ text: 'E', xs: [48] });
  });

  it('does not merge across a different font, alpha, matrix, clip or an op in between', () => {
    const { ctx } = setup();
    ctx.font = '20px sans-serif';
    ctx.fillText('A', 0, 10);
    ctx.font = '21px sans-serif';
    ctx.fillText('B', 12, 10);
    expect(ctx.ops).toHaveLength(2);
    ctx.globalAlpha = 0.5;
    ctx.fillText('C', 24, 10);
    expect(ctx.ops).toHaveLength(3);
    ctx.translate(1, 0);
    ctx.fillText('D', 36, 10);
    expect(ctx.ops).toHaveLength(4);
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillText('E', 48, 10);
    expect(ctx.ops).toHaveLength(6);
    ctx.fillText('F', 60, 10);
    expect(ctx.ops).toHaveLength(6);
    ctx.beginPath();
    ctx.rect(0, 0, 100, 100);
    ctx.clip();
    ctx.fillText('G', 72, 10);
    expect(ctx.ops).toHaveLength(7);
  });

  it('a stroked glyph is its own op', () => {
    const { ctx } = setup();
    ctx.font = '20px sans-serif';
    ctx.strokeStyle = '#0000ff';
    ctx.lineWidth = 2;
    ctx.strokeText('X', 1, 2);
    expect(lastOp(ctx, 'text')).toMatchObject({
      mode: 'stroke',
      text: 'X',
      paint: { hex: '#0000ff' },
      stroke: { width: 2 },
    });
    ctx.fillText('X', 1, 2);
    expect(lastOp(ctx, 'text')).toMatchObject({ mode: 'fill', stroke: null });
    expect(ctx.ops).toHaveLength(2);
  });

  it('textAlign center/right shifts xs by the measured width', () => {
    const { ctx, measure } = setup();
    ctx.font = '20px sans-serif';
    measure.font = '20px sans-serif';
    const width = measure.measureText('Hello').width;
    expect(width).toBeGreaterThan(10);

    ctx.textAlign = 'center';
    ctx.fillText('Hello', 100, 50);
    expect(lastOp(ctx, 'text').xs[0]).toBeCloseTo(100 - width / 2, 6);

    ctx.fillStyle = '#ff0000';
    ctx.textAlign = 'right';
    ctx.fillText('Hello', 100, 50);
    expect(lastOp(ctx, 'text').xs[0]).toBeCloseTo(100 - width, 6);

    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'left';
    ctx.fillText('Hello', 100, 50);
    expect(lastOp(ctx, 'text').xs[0]).toBe(100);
  });

  it('gives one x per code point for a multi-character call', () => {
    const { ctx, measure } = setup();
    ctx.font = '20px sans-serif';
    measure.font = '20px sans-serif';
    ctx.fillText('Hello', 10, 50);
    const { xs } = lastOp(ctx, 'text');
    expect(xs).toHaveLength(5);
    expect(xs[0]).toBe(10);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    const last = measure.measureText('Hello').width - measure.measureText('o').width;
    expect(xs[4]).toBeCloseTo(10 + last, 6);
  });

  it('counts astral characters as one position', () => {
    const { ctx } = setup();
    ctx.font = '20px sans-serif';
    ctx.fillText('a\u{1F600}b', 0, 10);
    expect(lastOp(ctx, 'text').xs).toHaveLength(3);
  });

  it('reads the font shorthand Konva writes, with a quoted family stack', () => {
    const { ctx } = setup();
    ctx.font = 'italic bold normal 24px "Instrument Sans", sans-serif';
    ctx.fillText('x', 0, 0);
    expect(lastOp(ctx, 'text').font).toEqual({
      family: 'Instrument Sans',
      weight: 700,
      style: 'italic',
      size: 24,
    });
    ctx.font = "500 12.5px 'Foo Bar'";
    ctx.fillText('x', 1, 0);
    expect(lastOp(ctx, 'text').font).toEqual({
      family: 'Foo Bar',
      weight: 500,
      style: 'normal',
      size: 12.5,
    });
  });

  it('keeps the previous font and reports one it cannot read', () => {
    const { ctx, unknown } = setup();
    ctx.font = '20px Foo';
    ctx.font = 'small-caps 20px Foo';
    ctx.font = 'garbage';
    expect(unknown).toEqual(['font:small-caps 20px Foo', 'font:garbage']);
    ctx.fillText('x', 0, 0);
    expect(lastOp(ctx, 'text').font.family).toBe('Foo');
  });

  it('letter spacing on the context, right-to-left text and maxWidth are unknown', () => {
    const { ctx, unknown } = setup();
    ctx.font = '20px sans-serif';
    ctx.fillText('x', 0, 0);
    expect(unknown).toEqual([]);

    ctx.letterSpacing = '2px';
    ctx.fillText('x', 0, 0);
    ctx.letterSpacing = '0px';
    ctx.direction = 'rtl';
    ctx.fillText('x', 0, 0);
    ctx.direction = 'ltr';
    ctx.fillText('a long line of text', 0, 0, 5);
    ctx.fillText('x', 0, 0, 500);
    expect(unknown).toEqual(['letterSpacing', 'direction:rtl', 'fillText:maxWidth']);
  });

  it('forwards font, align, baseline and spacing to the measuring context', () => {
    const { ctx, measure } = setup();
    ctx.font = '700 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '3px';
    const a = ctx.measureText('Hg');
    expect(a.width).toBeGreaterThan(0);
    expect(measure.textAlign).toBe('center');
    expect(measure.textBaseline).toBe('top');
    expect(measure.letterSpacing).toBe('3px');
    ctx.letterSpacing = '0px';
    const b = ctx.measureText('Hg');
    expect(a.width).toBeGreaterThan(b.width);
  });
});

describe('RecordingContext images', () => {
  it('drawImage forms: 3, 5 and 9 arguments', () => {
    const { ctx } = setup();
    // A loaded <img>: natural size wins over the layout size.
    const img = { naturalWidth: 200, naturalHeight: 100, width: 20, height: 10 };
    const element = img as unknown as CanvasImageSource;

    ctx.drawImage(element, 5, 6);
    expect(lastOp(ctx, 'image')).toMatchObject({
      image: { kind: 'element', width: 200, height: 100 },
      sx: 0,
      sy: 0,
      sw: 200,
      sh: 100,
      dx: 5,
      dy: 6,
      dw: 200,
      dh: 100,
    });
    expect(lastOp(ctx, 'image').image).toMatchObject({ element });

    ctx.drawImage(element, 5, 6, 50, 25);
    expect(lastOp(ctx, 'image')).toMatchObject({
      sx: 0,
      sy: 0,
      sw: 200,
      sh: 100,
      dx: 5,
      dy: 6,
      dw: 50,
      dh: 25,
    });

    ctx.drawImage(element, 1, 2, 30, 40, 5, 6, 60, 80);
    expect(lastOp(ctx, 'image')).toMatchObject({
      sx: 1,
      sy: 2,
      sw: 30,
      sh: 40,
      dx: 5,
      dy: 6,
      dw: 60,
      dh: 80,
    });
  });

  it('a canvas source takes its size from width/height and carries its identity', () => {
    const { ctx } = setup();
    const buffer = image(40, 30);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(buffer, 0, 0, 40, 30, 7, 8, 40, 30);
    const op = lastOp(ctx, 'image');
    expect(op.matrix).toEqual(IDENTITY);
    expect(op.alpha).toBe(0.5);
    expect(op.image).toEqual({ kind: 'element', element: buffer, width: 40, height: 30 });
    if (op.image.kind !== 'element') throw new Error('unreachable');
    expect(op.image.element).toBe(buffer);
  });

  it('an image op carries matrix, clips and shadow like any other op', () => {
    const { ctx } = setup();
    ctx.translate(3, 4);
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    ctx.rect(0, 0, 9, 9);
    ctx.clip();
    ctx.drawImage(image(4, 4), 0, 0);
    expect(lastOp(ctx, 'image')).toMatchObject({
      matrix: [1, 0, 0, 1, 3, 4],
      shadow: { hex: '#000000', alpha: 0.3, blur: 0, offsetX: 0, offsetY: 5 },
    });
    expect(lastOp(ctx, 'image').clips).toHaveLength(1);
  });
});

describe('RecordingContext shadow', () => {
  it('shadow state is captured', () => {
    const { ctx } = setup();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').shadow).toEqual({
      hex: '#000000',
      alpha: 0.5,
      blur: 8,
      offsetX: 2,
      offsetY: 3,
    });
  });

  it('a shadowColor with alpha 0 is no shadow, nor is a colour without blur and offset', () => {
    const { ctx } = setup();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 8;
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').shadow).toBeNull();

    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 0;
    ctx.fillRect(0, 0, 5, 5);
    expect(lastOp(ctx, 'path').shadow).toBeNull();
  });
});

describe('RecordingContext unknown calls', () => {
  it('globalCompositeOperation other than source-over is unknown', () => {
    const { ctx, unknown } = setup();
    ctx.fillRect(0, 0, 5, 5);
    expect(unknown).toEqual([]);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.rect(0, 0, 5, 5);
    ctx.fill();
    expect(unknown).toEqual(['globalCompositeOperation:multiply']);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fill();
    expect(unknown).toHaveLength(1);
  });

  it('getImageData/putImageData/filter are unknown', () => {
    const { ctx, unknown } = setup();
    const data = ctx.getImageData(0, 0, 2, 3);
    expect(data.width).toBe(2);
    expect(data.height).toBe(3);
    expect(data.data).toHaveLength(2 * 3 * 4);
    ctx.putImageData(data, 0, 0);
    expect(unknown).toEqual(['getImageData', 'putImageData']);

    ctx.filter = 'blur(2px)';
    expect(unknown).toHaveLength(2);
    ctx.fillRect(0, 0, 5, 5);
    expect(unknown).toEqual(['getImageData', 'putImageData', 'filter:blur(2px)']);
    ctx.filter = 'none';
    ctx.fillRect(0, 0, 5, 5);
    expect(unknown).toHaveLength(3);
  });

  it('createImageData is a harmless allocation', () => {
    const { ctx, unknown } = setup();
    expect(ctx.createImageData(3, 2).data).toHaveLength(24);
    expect(unknown).toEqual([]);
  });

  it('clearRect over the whole canvas is a no-op, elsewhere it is unknown', () => {
    const { ctx, unknown } = setup();
    ctx.clearRect(0, 0, 400, 300);
    ctx.clearRect(-5, -5, 500, 400);
    expect(unknown).toEqual([]);
    ctx.clearRect(0, 0, 10, 10);
    expect(unknown).toEqual(['clearRect']);
    ctx.translate(1, 0);
    ctx.clearRect(0, 0, 400, 300);
    expect(unknown).toEqual(['clearRect', 'clearRect']);
    expect(ctx.ops).toEqual([]);
  });

  it('a Path2D argument to fill, stroke or clip is unknown', () => {
    const { ctx, unknown } = setup();
    const path = {} as Path2D;
    ctx.fill(path);
    ctx.stroke(path);
    ctx.clip(path);
    expect(unknown).toEqual(['fill:path2d', 'stroke:path2d', 'clip:path2d']);
    expect(ctx.ops).toEqual([]);
  });

  it('isPointInPath is false', () => {
    const { ctx } = setup();
    ctx.beginPath();
    ctx.rect(0, 0, 10, 10);
    expect(ctx.isPointInPath(5, 5)).toBe(false);
  });
});
