// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The pragma above gives this one file the DOM the inliner parses with; the lane is `node`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { resolveFontFiles, type FontFileSet } from '../fonts/fontFiles.js';
import {
  base,
  bitmap as fixtureBitmap,
  fill,
  fixtureScene as buildFixtureScene,
  FIXTURE_FACE,
  GRADIENT_ICON,
  item,
  rect,
  sceneOf,
  solid,
  svgImage,
  textOp,
} from '../scene/__fixtures__/exportSceneFixture.js';
import { IDENTITY } from '../scene/matrix.js';
import {
  emptyReport,
  type ClipPath,
  type ExportReport,
  type ExportScene,
  type FontSpec,
  type Matrix,
  type Paint,
  type SceneImageSource,
  type SceneOp,
} from '../scene/types.js';
import { inlineSvg } from './inlineSvg.js';
import { writeSvg, type WriteSvgOptions } from './writeSvg.js';

// ---------------------------------------------------------------------------------------------
// Fonts: the real Instrument Sans (latin subset), so outlines are real outlines.

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const latinBytes = new Uint8Array(
  readFileSync(path.join(fontsourceDir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);

const FACE: FontSpec = FIXTURE_FACE;
let fonts: ReadonlyMap<string, FontFileSet>;

beforeAll(async () => {
  const set = await resolveFontFiles(FACE, {
    brandFaces: [{ family: FACE.family, src: 'latin.woff2' }],
    fetchBytes: async () => latinBytes,
  });
  fonts = new Map([['Instrument Sans|400|normal', set]]);
});

// ---------------------------------------------------------------------------------------------
// Goldens: a normal run compares, `UPDATE_GOLDEN=1` writes.

const goldenDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__golden__');

function expectGolden(name: string, actual: string): void {
  const file = path.join(goldenDir, name);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  if (!existsSync(file)) throw new Error(`no golden ${name}: run with UPDATE_GOLDEN=1 to write it`);
  expect(actual).toBe(readFileSync(file, 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// Scene builders: shared with the PDF writer tests (`scene/__fixtures__/exportSceneFixture.ts`).
// The PNG here is not a real picture; the SVG writer only embeds the bytes it is given.

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const bitmap = (width = 8, height = 8): SceneImageSource => fixtureBitmap(PNG, width, height);
const fixtureScene = (): ExportScene => buildFixtureScene(PNG);

// ---------------------------------------------------------------------------------------------
// Reading the output back

function run(
  scene: ExportScene,
  options: Partial<WriteSvgOptions> = {}
): { svg: string; report: ExportReport } {
  const report = options.report ?? emptyReport();
  const svg = writeSvg(scene, { text: 'outlines', fonts, page: 1, ...options, report });
  return { svg, report };
}

/** Parses as XML (a malformed file fails here) and returns the root. */
function parse(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc.documentElement;
}

const itemGroups = (root: Element) =>
  Array.from(root.children).filter((child) => child.localName === 'g');

/** `matrix(...)` or `translate(...)` back to six numbers. */
function matrixOf(element: Element): number[] {
  const transform = element.getAttribute('transform') ?? '';
  const numbers = (transform.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  if (transform.startsWith('translate')) return [1, 0, 0, 1, numbers[0]!, numbers[1] ?? 0];
  if (transform.startsWith('matrix')) return numbers;
  return [1, 0, 0, 1, 0, 0];
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

// ---------------------------------------------------------------------------------------------

describe('golden', () => {
  it('fixture scene in outline mode', () => {
    const { svg } = run(fixtureScene());
    parse(svg);
    expectGolden('fixture-outlines.svg', svg);
  });

  it('fixture scene in editable mode', () => {
    const { svg } = run(fixtureScene(), { text: 'editable' });
    parse(svg);
    expectGolden('fixture-editable.svg', svg);
  });
});

describe('structure', () => {
  it('writes one g per item with id, data-element-id and title', () => {
    const scene = sceneOf(
      item('a b/c', 'Erstes <Ding>', fill(rect(0, 0, 10, 10), solid('#000000'))),
      item('a b/c', 'Zweites', fill(rect(0, 0, 10, 10), solid('#000000'))),
      item('x', null, fill(rect(0, 0, 10, 10), solid('#000000'))),
      item(null, null, fill(rect(0, 0, 10, 10), solid('#000000')))
    );
    const root = parse(run(scene).svg);
    const groups = itemGroups(root);
    expect(groups.map((g) => g.getAttribute('id'))).toEqual([
      'el-a_b_c',
      'el-a_b_c-2',
      'el-x',
      'el-page',
    ]);
    expect(groups.map((g) => g.getAttribute('data-element-id'))).toEqual([
      'a b/c',
      'a b/c',
      'x',
      null,
    ]);
    expect(groups[0]!.querySelector(':scope > title')?.textContent).toBe('Erstes <Ding>');
    expect(groups[2]!.querySelector(':scope > title')).toBeNull();
    for (const g of groups) expect(g.getAttribute('id')).toMatch(/^el-[A-Za-z0-9_-]*$/);
  });

  it('writes the page as the viewBox, width and height of the root', () => {
    const root = parse(run(sceneOf()).svg);
    expect(root.localName).toBe('svg');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(root.getAttribute('xmlns:xlink')).toBe('http://www.w3.org/1999/xlink');
    expect(root.getAttribute('viewBox')).toBe('0 0 400 300');
    expect(root.getAttribute('width')).toBe('400');
    expect(root.getAttribute('height')).toBe('300');
  });

  it('escapes every text and attribute value', () => {
    const scene = sceneOf(
      item(
        'e<1>',
        `"Q" & 'A' <b>`,
        textOp(`a<b>&"c'`, {
          font: { ...FACE, family: `Odd'Name"`, fallback: undefined },
        })
      )
    );
    const { svg } = run(scene, { text: 'editable' });
    const root = parse(svg);
    expect(svg).not.toContain('<b>');
    expect(root.querySelector('title')?.textContent).toBe(`"Q" & 'A' <b>`);
    expect(root.querySelector('text')?.textContent).toBe(`a<b>&"c'`);
    expect(root.querySelector('text')?.getAttribute('font-family')).toBe(`'Odd\\'Name"'`);
    expect(itemGroups(root)[0]!.getAttribute('data-element-id')).toBe('e<1>');
  });

  it('shares one clip group between ops with the same clips and skips ops that clip everything', () => {
    const clip: ClipPath = {
      matrix: [1, 0, 0, 1, 5, 5],
      commands: rect(0, 0, 50, 50),
      rule: 'nonzero',
    };
    const nothing: ClipPath = { matrix: IDENTITY, commands: [], rule: 'nonzero' };
    const scene = sceneOf(
      item(
        'c',
        null,
        fill(rect(0, 0, 10, 10), solid('#111111'), { clips: [clip] }),
        fill(rect(10, 0, 10, 10), solid('#222222'), { clips: [clip] }),
        fill(rect(20, 0, 10, 10), solid('#333333'), { clips: [clip, nothing] }),
        fill(rect(30, 0, 10, 10), solid('#444444'))
      )
    );
    const root = parse(run(scene).svg);
    expect(root.querySelectorAll('clipPath')).toHaveLength(1);
    const clipped = root.querySelectorAll('g[clip-path]');
    expect(clipped).toHaveLength(1);
    expect(clipped[0]!.querySelectorAll('path')).toHaveLength(2);
    expect(root.querySelectorAll('path[fill="#333333"]')).toHaveLength(0);
    expect(root.querySelectorAll('path[fill="#444444"]')).toHaveLength(1);
    expect(clipped[0]!.getAttribute('clip-path')).toBe(
      `url(#${root.querySelector('clipPath')!.getAttribute('id')})`
    );
    // The clip keeps its own matrix, in page px.
    expect(matrixOf(root.querySelector('clipPath > path')!)).toEqual([1, 0, 0, 1, 5, 5]);
  });

  it('keeps fill and stroke of the same commands as two elements, in order', () => {
    const commands = rect(0, 0, 20, 20);
    const stroke = {
      ...base(),
      kind: 'path' as const,
      mode: 'stroke' as const,
      commands,
      rule: 'nonzero' as const,
      paint: solid('#000000'),
      stroke: {
        width: 2,
        cap: 'butt' as const,
        join: 'miter' as const,
        miterLimit: 10,
        dash: [],
        dashOffset: 0,
      },
    };
    const scene = sceneOf(item('s', null, fill(commands, solid('#ff0000')), stroke));
    const paths = Array.from(parse(run(scene).svg).querySelectorAll('path'));
    expect(paths.map((p) => [p.getAttribute('fill'), p.getAttribute('stroke')])).toEqual([
      ['#ff0000', null],
      ['none', '#000000'],
    ]);
    expect(paths[1]!.getAttribute('stroke-width')).toBe('2');
    expect(paths[1]!.getAttribute('stroke-miterlimit')).toBe('10');
  });

  it('writes opacity on the element and the paint alpha apart', () => {
    const scene = sceneOf(
      item('o', null, fill(rect(0, 0, 9, 9), solid('#336699', 0.25), { alpha: 0.5 }))
    );
    const path = parse(run(scene).svg).querySelector('path')!;
    expect(path.getAttribute('opacity')).toBe('0.5');
    expect(path.getAttribute('fill-opacity')).toBe('0.25');
  });

  it('writes numbers with at most three decimals', () => {
    const scene = sceneOf(
      item(
        'n',
        null,
        fill(
          [
            { op: 'M', x: 1 / 3, y: -0.0004 },
            { op: 'L', x: 2 / 3, y: 12.3456 },
          ],
          solid('#000000')
        )
      )
    );
    const d = parse(run(scene).svg).querySelector('path')!.getAttribute('d');
    expect(d).toBe('M0.333 0L0.667 12.346');
  });
});

describe('matrices', () => {
  it('writes flipped and rotated shapes with exact matrices', () => {
    const angle = (12 * Math.PI) / 180;
    const rotated: Matrix = [
      Math.cos(angle),
      Math.sin(angle),
      -Math.sin(angle),
      Math.cos(angle),
      50.1234,
      60.5678,
    ];
    const scene = sceneOf(
      item(
        'm',
        null,
        fill(rect(0, 0, 40, 20), solid('#000000'), { matrix: [-1, 0, 0, 1, 200, 0] }),
        fill(rect(0, 0, 40, 20), solid('#000000'), { matrix: rotated }),
        fill(rect(0, 0, 40, 20), solid('#000000'), { matrix: [1, 0, 0, 1, 7.25, 8] }),
        fill(rect(0, 0, 40, 20), solid('#000000'))
      )
    );
    const { svg } = run(scene);
    expect(svg).toContain('transform="matrix(-1,0,0,1,200,0)"');
    const paths = Array.from(parse(svg).querySelectorAll('path'));
    const back = matrixOf(paths[1]!);
    rotated.forEach((value, index) => expect(Math.abs(back[index]! - value)).toBeLessThan(1e-3));
    // Even the long lever of a 1000 px page stays under a tenth of a pixel.
    expect(Math.abs(back[0]! - rotated[0]) * 1000).toBeLessThan(0.1);
    expect(matrixOf(paths[2]!)).toEqual([1, 0, 0, 1, 7.25, 8]);
    expect(paths[3]!.hasAttribute('transform')).toBe(false);
  });
});

describe('inlined svg', () => {
  it('prefixes ids of inlined svg per instance', () => {
    const scene = sceneOf(
      item('i', null, svgImage(GRADIENT_ICON), svgImage(GRADIENT_ICON, { dx: 100 }))
    );
    const { svg } = run(scene);
    const root = parse(svg);
    const ids = Array.from(root.querySelectorAll('[id]')).map((e) => e.getAttribute('id')!);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prefix of ['i0-', 'i1-']) {
      expect(ids).toContain(`${prefix}a`);
      expect(ids).toContain(`${prefix}c`);
      expect(svg).toContain(`fill="url(#${prefix}a)"`);
      expect(svg).toContain(`clip-path="url(#${prefix}c)"`);
      expect(svg).toContain(`xlink:href="#${prefix}a"`);
      expect(svg).toContain(` href="#${prefix}c"`);
      expect(svg).toContain(`#${prefix}a { opacity: 1 }`);
      expect(svg).toContain(`stroke: url(#${prefix}a)`);
      expect(svg).toContain(`class="${prefix}x ${prefix}y"`);
    }
    // A hex colour in a declaration is not an id.
    expect(svg).toContain('fill: #c;');
    expect(svg).not.toMatch(/(?<![\w-])#a(?![\w-])/);
    expect(svg).not.toMatch(/url\(#(a|c)\)/);
  });

  it("places the svg at the destination rect, with the root's presentation attributes", () => {
    const root = parse(run(sceneOf(item('i', null, svgImage(GRADIENT_ICON)))).svg);
    const nested = root.querySelector('g[id] > svg')!;
    expect(
      ['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio'].map((n) =>
        nested.getAttribute(n)
      )
    ).toEqual(['10', '20', '48', '48', '0 0 24 24', 'none']);
    expect(nested.getAttribute('fill')).toBe('none');
  });

  it('honours the source rect by moving the viewBox', () => {
    const root = parse(
      run(sceneOf(item('i', null, svgImage(GRADIENT_ICON, { sx: 6, sy: 12, sw: 12, sh: 6 })))).svg
    );
    expect(root.querySelector('g[id] > svg')!.getAttribute('viewBox')).toBe('6 12 12 6');
  });

  it('nests a second viewport when the viewBox does not have the shape of the image', () => {
    const wide = GRADIENT_ICON.replace(
      'viewBox="0 0 24 24"',
      'viewBox="0 0 48 24" preserveAspectRatio="xMinYMin meet"'
    );
    const root = parse(
      run(sceneOf(item('i', null, svgImage(wide, { sx: 0, sy: 0, sw: 12, sh: 12 })))).svg
    );
    const outer = root.querySelector('g[id] > svg')!;
    expect(outer.getAttribute('viewBox')).toBe('0 0 12 12');
    expect(outer.getAttribute('preserveAspectRatio')).toBe('none');
    const inner = outer.querySelector(':scope > svg')!;
    expect(
      ['width', 'height', 'viewBox', 'preserveAspectRatio'].map((n) => inner.getAttribute(n))
    ).toEqual(['24', '24', '0 0 48 24', 'xMinYMin meet']);
  });

  it('puts the matrix on a group around the nested svg', () => {
    const op = { ...svgImage(GRADIENT_ICON), matrix: [2, 0, 0, 2, 5, 6] as Matrix, alpha: 0.5 };
    const root = parse(run(sceneOf(item('i', null, op))).svg);
    const wrapper = root.querySelector('g[id] > g')!;
    expect(matrixOf(wrapper)).toEqual([2, 0, 0, 2, 5, 6]);
    expect(wrapper.getAttribute('opacity')).toBe('0.5');
    expect(wrapper.querySelector(':scope > svg')).not.toBeNull();
  });

  it('embeds markup that cannot be parsed as an image', () => {
    const root = parse(run(sceneOf(item('i', null, svgImage('<svg><oops></svg>')))).svg);
    const image = root.querySelector('image')!;
    expect(image.getAttribute('xlink:href')).toBe(
      `data:image/svg+xml;base64,${Buffer.from('<svg><oops></svg>').toString('base64')}`
    );
    expect(root.querySelector('svg svg')).toBeNull();
  });
});

describe('inlineSvg', () => {
  it('returns the root attributes and the prefixed content', () => {
    const result = inlineSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" id="r" viewBox="0 0 10 10" style="color:red"><g id="g"><path d="M0 0" filter="url(\'#f\')"/>text &amp; more</g></svg>',
      'p-'
    );
    expect(result).toEqual({
      attrs: { id: 'p-r', viewBox: '0 0 10 10', style: 'color:red' },
      inner: '<g id="p-g"><path d="M0 0" filter="url(&#39;#p-f&#39;)"/>text &amp; more</g>',
    });
  });

  it('is null for markup that is not an svg document', () => {
    expect(inlineSvg('<svg><oops></svg>', 'p-')).toBeNull();
    expect(inlineSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>', 'p-')).toBeNull();
    expect(inlineSvg('', 'p-')).toBeNull();
  });

  it('drops comments and layout whitespace but keeps the text of text elements', () => {
    const result = inlineSvg(
      '<svg xmlns="http://www.w3.org/2000/svg">\n  <!-- c -->\n  <text> a  b </text>\n</svg>',
      'p-'
    );
    expect(result!.inner).toBe('<text> a  b </text>');
  });
});

describe('css of inlined svg', () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const sheet = (css: string, body = '<path class="cls-1" d="M0 0"/>', attrs = '') =>
    `<svg ${NS} viewBox="0 0 10 10"${attrs}><style>${css}</style>${body}</svg>`;
  /** The style sheet the writer puts for `css`, decoded; null when the svg is not inlined. */
  const scoped = (css: string, body?: string, attrs?: string): string | null => {
    const inlined = inlineSvg(sheet(css, body, attrs), 'i0-');
    if (!inlined) return null;
    const doc = new DOMParser().parseFromString(
      `<svg ${NS}>${inlined.inner}</svg>`,
      'image/svg+xml'
    );
    return doc.querySelector('style')!.textContent;
  };

  it('two inlined svgs that both define .cls-1 each keep their own class and rule', () => {
    const red = sheet('.cls-1 { fill: #ff0000 }');
    const blue = sheet('.cls-1 { fill: #0000ff }');
    const { svg } = run(sceneOf(item('s', null, svgImage(red), svgImage(blue, { dx: 80 }))));
    const root = parse(svg);
    const instances = Array.from(root.querySelectorAll('g[id] > svg'));
    expect(instances.map((instance) => instance.getAttribute('id'))).toEqual([
      'i0-root',
      'i1-root',
    ]);
    instances.forEach((instance, n) => {
      expect(instance.querySelector('path')!.getAttribute('class')).toBe(`i${n}-cls-1`);
    });
    const styles = Array.from(root.querySelectorAll('style'), (style) => style.textContent);
    expect(styles).toEqual([
      '#i0-root .i0-cls-1 { fill: #ff0000 }',
      '#i1-root .i1-cls-1 { fill: #0000ff }',
    ]);
    expect(svg).not.toContain('.cls-1');
    expect(svg).not.toContain('"cls-1"');
  });

  it('scopes a type selector under the root id, and the svg selector to the root itself', () => {
    expect(
      scoped('path { fill: red } svg { opacity: .5 } svg:hover { opacity: 1 } * { stroke: none }')
    ).toBe(
      '#i0-root path { fill: red } #i0-root { opacity: .5 } #i0-root:hover { opacity: 1 } #i0-root * { stroke: none }'
    );
  });

  it('rewrites class selectors of every shape and each member of a list', () => {
    expect(scoped('.a.b:hover, .a > .b path, g .c:nth-child(2n+1)::after { fill: red }')).toBe(
      '#i0-root .i0-a.i0-b:hover, #i0-root .i0-a > .i0-b path, #i0-root g .i0-c:nth-child(2n+1)::after { fill: red }'
    );
    expect(scoped('[fill="none"] { stroke: red }')).toBe('#i0-root [fill="none"] { stroke: red }');
  });

  it('rewrites each class of a class attribute', () => {
    const inlined = inlineSvg(sheet('', '<g class="a  b"><path class="c"/></g>'), 'i3-');
    expect(inlined!.inner).toContain('<g class="i3-a i3-b"><path class="i3-c"/></g>');
  });

  it('keeps the specificity of the rules among themselves by scoping the id selectors too', () => {
    // `#r path` names the root: it stays one id deep, as every other rule is made to be.
    expect(scoped('#r path { fill: red } #g { fill: blue }', undefined, ' id="r"')).toBe(
      '#i0-r path { fill: red } #i0-r #i0-g { fill: blue }'
    );
  });

  it('gives a root without an id one no element of the markup has', () => {
    const inlined = inlineSvg(sheet('path { fill: red }', '<g id="root"/>'), 'i0-')!;
    expect(inlined.attrs.id).toBe('i0-root_');
    expect(inlined.inner).toContain('<g id="i0-root"/>');
    expect(inlined.inner).toContain('#i0-root_ path');
  });

  it('keeps @font-face, prefixes @keyframes and what uses them, and recurses into @media', () => {
    const css =
      '@font-face { font-family: X; src: url(a.woff2) } ' +
      '@keyframes spin { from { opacity: 0 } to { opacity: 1 } } ' +
      '.a { animation: spin 1s linear; animation-name: spin } ' +
      '@media (min-width: 10px) { .a { fill: red } }';
    expect(scoped(css)).toBe(
      '@font-face { font-family: X; src: url(a.woff2) } ' +
        '@keyframes i0-spin { from { opacity: 0 } to { opacity: 1 } } ' +
        '#i0-root .i0-a { animation: i0-spin 1s linear; animation-name: i0-spin } ' +
        '@media (min-width: 10px) { #i0-root .i0-a { fill: red } }'
    );
    const attribute = inlineSvg(
      sheet(css, '<path style="animation: spin 1s; fill: url(#g)"/>'),
      'i0-'
    );
    expect(attribute!.inner).toContain('style="animation: i0-spin 1s; fill: url(#i0-g)"');
  });

  it('does not inline css it cannot scope safely', () => {
    for (const css of [
      '[class~="x"] { fill: red }',
      '[id=x] { fill: red }',
      '.a:is(.b, .c) { fill: red }',
      ':where(.a) { fill: red }',
      '.a:not(.b) { fill: red }',
      ':root { fill: red }',
      'li:nth-child(2n of .a) { fill: red }',
      '.a\\:b { fill: red }',
      '.a { .b { fill: red } }',
      '@import url(x.css);',
      '@page { margin: 0 }',
      '> path { fill: red }',
    ]) {
      expect(scoped(css), css).toBeNull();
    }
    // The nearby shapes that are fine.
    for (const css of ['path:nth-child(2n+1) { fill: red }', 'a[href^="http"] { fill: red }']) {
      expect(scoped(css), css).not.toBeNull();
    }
  });

  it('embeds an svg whose css cannot be scoped as an image, and does not count it as inlined', () => {
    const unsafe = sheet(':is(.a, .b) { fill: red }');
    const { svg } = run(
      sceneOf(item('u', null, svgImage(unsafe), svgImage(sheet('.a { fill: red }'))))
    );
    const root = parse(svg);
    expect(root.querySelectorAll('g[id] > image')).toHaveLength(1);
    expect(root.querySelector('g[id] > image')!.getAttribute('xlink:href')).toBe(
      `data:image/svg+xml;base64,${Buffer.from(unsafe).toString('base64')}`
    );
    expect(root.querySelectorAll('g[id] > svg')).toHaveLength(1);
    expect(root.querySelector('g[id] > svg')!.getAttribute('id')).toBe('i0-root');
  });
});

describe('paint', () => {
  it('writes gradients into defs, in the user space of the element', () => {
    const stops = [
      { offset: 0, hex: '#ff0000', alpha: 1 },
      { offset: 1, hex: '#0000ff', alpha: 0.5 },
    ];
    const scene = sceneOf(
      item(
        'g',
        null,
        fill(rect(0, 0, 10, 10), { type: 'linear', x0: 1, y0: 2, x1: 3, y1: 4, stops }),
        fill(rect(0, 0, 10, 10), { type: 'linear', x0: 1, y0: 2, x1: 3, y1: 4, stops }),
        fill(rect(0, 0, 10, 10), {
          type: 'radial',
          x0: 5,
          y0: 6,
          r0: 2,
          x1: 7,
          y1: 8,
          r1: 9,
          stops,
        })
      )
    );
    const root = parse(run(scene).svg);
    const linear = root.querySelectorAll('defs > linearGradient');
    expect(linear).toHaveLength(1);
    expect(linear[0]!.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    expect(['x1', 'y1', 'x2', 'y2'].map((n) => linear[0]!.getAttribute(n))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(Array.from(linear[0]!.children).map((s) => s.getAttribute('stop-opacity'))).toEqual([
      null,
      '0.5',
    ]);
    const radial = root.querySelector('defs > radialGradient')!;
    expect(['cx', 'cy', 'r', 'fx', 'fy', 'fr'].map((n) => radial.getAttribute(n))).toEqual([
      '7',
      '8',
      '9',
      '5',
      '6',
      '2',
    ]);
    const fills = Array.from(root.querySelectorAll('path')).map((p) => p.getAttribute('fill'));
    expect(fills[0]).toBe(fills[1]);
    expect(fills[0]).toBe(`url(#${linear[0]!.getAttribute('id')})`);
    expect(fills[2]).toBe(`url(#${radial.getAttribute('id')})`);
  });

  it('pattern paint writes one pattern def per tile image', () => {
    const tile = bitmap(16, 16);
    const other = bitmap(4, 4);
    const pattern = (image: SceneImageSource, matrix: Matrix = IDENTITY): Paint => ({
      type: 'pattern',
      image,
      repeat: 'repeat',
      matrix,
    });
    const scene = sceneOf(
      item(
        'p',
        null,
        fill(rect(0, 0, 10, 10), pattern(tile)),
        fill(rect(0, 20, 10, 10), pattern(tile), { matrix: [1, 0, 0, 1, 5, 5] }),
        fill(rect(0, 40, 10, 10), pattern(other, [0.5, 0, 0, 0.5, 0, 0]))
      )
    );
    const { svg } = run(scene);
    const root = parse(svg);
    const patterns = root.querySelectorAll('defs > pattern');
    expect(patterns).toHaveLength(2);
    expect(count(svg, 'data:image/png;base64,')).toBe(2);
    expect(['patternUnits', 'width', 'height'].map((n) => patterns[0]!.getAttribute(n))).toEqual([
      'userSpaceOnUse',
      '16',
      '16',
    ]);
    expect(patterns[1]!.getAttribute('patternTransform')).toBe('matrix(0.5,0,0,0.5,0,0)');
    const fills = Array.from(root.querySelectorAll('path')).map((p) => p.getAttribute('fill'));
    expect(fills[0]).toBe(fills[1]);
    expect(fills[0]).toBe(`url(#${patterns[0]!.getAttribute('id')})`);
    expect(fills[2]).toBe(`url(#${patterns[1]!.getAttribute('id')})`);
  });
});

describe('shadow', () => {
  it('writes an feDropShadow filter around the shape', () => {
    const op = {
      ...fill(rect(10, 10, 50, 50), solid('#ffffff')),
      shadow: { hex: '#102030', alpha: 0.4, blur: 10, offsetX: 3, offsetY: -5 },
    };
    const root = parse(run(sceneOf(item('s', null, op, { ...op }))).svg);
    const filters = root.querySelectorAll('defs > filter');
    expect(filters).toHaveLength(1);
    const drop = filters[0]!.querySelector('feDropShadow')!;
    expect(
      ['dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity'].map((n) => drop.getAttribute(n))
    ).toEqual(['3', '-5', '5', '#102030', '0.4']);
    // The region covers the page and the reach of the shadow, also for a hairline.
    expect(filters[0]!.getAttribute('filterUnits')).toBe('userSpaceOnUse');
    const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((n) =>
      Number(filters[0]!.getAttribute(n))
    );
    expect(x).toBeLessThanOrEqual(-20);
    expect(y).toBeLessThanOrEqual(-20);
    expect(x! + w!).toBeGreaterThanOrEqual(420);
    expect(y! + h!).toBeGreaterThanOrEqual(320);
    const wrapped = root.querySelectorAll(`g[filter="url(#${filters[0]!.getAttribute('id')})"]`);
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0]!.querySelectorAll(':scope > path')).toHaveLength(1);
  });
});

describe('text', () => {
  const sample = () => sceneOf(item('t', 'Titel', textOp('Hallo Welt')));

  it('outline mode writes no text element when the fonts resolve', () => {
    const { svg, report } = run(sample());
    const root = parse(svg);
    expect(root.querySelectorAll('text')).toHaveLength(0);
    const paths = root.querySelectorAll('g[id] > path');
    expect(paths).toHaveLength(1); // one run: one path
    expect(paths[0]!.getAttribute('fill')).toBe('#112233');
    expect(paths[0]!.getAttribute('d')!.length).toBeGreaterThan(100);
    expect(report.missingGlyphs).toEqual([]);
  });

  it('outline mode places each glyph at its x', () => {
    const op = textOp('II', { xs: [10, 200] });
    const d = parse(run(sceneOf(item('t', null, op))).svg)
      .querySelector('path')!
      .getAttribute('d')!;
    const xs = Array.from(d.matchAll(/M(-?[\d.]+) /g), (m) => Number(m[1]));
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeGreaterThan(10);
    expect(xs[0]).toBeLessThan(25);
    expect(xs[1]).toBeGreaterThan(200);
    expect(xs[1]).toBeLessThan(215);
  });

  it('editable mode writes text with font-family, font-weight, font-style and the x list', () => {
    const op = textOp('Hi ya', {
      font: { ...FACE, weight: 700, style: 'italic', size: 31.5 },
      y: 77.123,
    });
    const { svg, report } = run(sceneOf(item('t', null, op)), { text: 'editable' });
    const text = parse(svg).querySelector('text')!;
    expect(text.textContent).toBe('Hi ya');
    expect(text.getAttribute('x')).toBe('20 42 64 86 108');
    expect(text.getAttribute('y')).toBe('77.123');
    expect(text.getAttribute('font-family')).toBe('Instrument Sans, Helvetica Neue, sans-serif');
    expect(text.getAttribute('font-weight')).toBe('700');
    expect(text.getAttribute('font-style')).toBe('italic');
    expect(text.getAttribute('font-size')).toBe('31.5');
    expect(text.getAttribute('xml:space')).toBe('preserve');
    expect(text.getAttribute('fill')).toBe('#112233');
    expect(svg).not.toContain('<path');
    expect(report.missingGlyphs).toEqual([]);
  });

  it('editable mode leaves a code point XML forbids out of the text and out of the x list', () => {
    // A paste from Word brings a vertical tab; a lone surrogate comes from a split emoji.
    const text = 'A\u000BB\uD83DC';
    const op = textOp(text, { xs: [10, 20, 30, 40, 50] });

    const { svg } = run(sceneOf(item('t', null, op)), { text: 'editable' });

    const element = parse(svg).querySelector('text')!;
    expect(element.textContent).toBe('ABC');
    expect(element.getAttribute('x')).toBe('10 30 50');
  });

  it('editable mode keeps a surrogate pair, and writes nothing for text that is only illegal', () => {
    const pair = textOp('a😀b', { xs: [1, 2, 3] });
    const only = textOp('\u0001\u0002', { xs: [1, 2] });

    const withPair = run(sceneOf(item('t', null, pair)), { text: 'editable' }).svg;
    const withNothing = run(sceneOf(item('t', null, only)), { text: 'editable' }).svg;

    expect(parse(withPair).querySelector('text')!.textContent).toBe('a😀b');
    expect(parse(withPair).querySelector('text')!.getAttribute('x')).toBe('1 2 3');
    expect(parse(withNothing).querySelectorAll('text')).toHaveLength(0);
  });

  it('writes stroked text as stroke, in both modes', () => {
    const op = textOp('I', {
      mode: 'stroke',
      stroke: { width: 2, cap: 'butt', join: 'miter', miterLimit: 10, dash: [], dashOffset: 0 },
    });
    for (const text of ['outlines', 'editable'] as const) {
      const el = parse(run(sceneOf(item('t', null, op)), { text }).svg).querySelector(
        'g[id] > *:not(title)'
      )!;
      expect(el.getAttribute('fill')).toBe('none');
      expect(el.getAttribute('stroke')).toBe('#112233');
      expect(el.getAttribute('stroke-width')).toBe('2');
    }
  });

  it('writes a missing glyph run as text and reports it', () => {
    const report = emptyReport();
    const op = textOp('Hi →→ ok', {
      xs: [0, 10, 20, 30, 40, 50, 60, 70],
      matrix: [1, 0, 0, 1, 5, 6],
    });
    const root = parse(run(sceneOf(item('mg', 'Pfeil', op)), { report, page: 3 }).svg);
    const texts = root.querySelectorAll('text');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.textContent).toBe('→→');
    expect(texts[0]!.getAttribute('x')).toBe('30 40');
    expect(texts[0]!.getAttribute('font-family')).toContain('Instrument Sans');
    // The runs around it are outlines, and the op's own attributes are on the group around them.
    expect(root.querySelectorAll('g[id] > g > path')).toHaveLength(2);
    expect(matrixOf(root.querySelector('g[id] > g')!)).toEqual([1, 0, 0, 1, 5, 6]);
    expect(report.missingGlyphs).toEqual([{ page: 3, elementId: 'mg', text: '→→' }]);
  });

  it('writes the whole text as text and reports it when the face has no files', () => {
    const report = emptyReport();
    const root = parse(
      run(sceneOf(item('nf', null, textOp('Hi'))), { report, fonts: new Map() }).svg
    );
    expect(root.querySelector('text')?.textContent).toBe('Hi');
    expect(report.missingGlyphs).toEqual([{ page: 1, elementId: 'nf', text: 'Hi' }]);
  });

  it('writes nothing for text of spaces only in outline mode', () => {
    const root = parse(run(sceneOf(item('sp', null, textOp('   ')))).svg);
    expect(root.querySelectorAll('path, text')).toHaveLength(0);
  });
});

describe('images', () => {
  it('embeds bitmaps as data urls and clips a source rect', () => {
    const photo = bitmap(8, 8);
    const full: SceneOp = {
      ...base(),
      kind: 'image',
      image: photo,
      sx: 0,
      sy: 0,
      sw: 8,
      sh: 8,
      dx: 5,
      dy: 6,
      dw: 40,
      dh: 24,
    };
    const crop: SceneOp = { ...full, sx: 2, sy: 4, sw: 4, sh: 2 };
    const root = parse(run(sceneOf(item('p', null, full, crop))).svg);
    const [whole, cropped] = Array.from(root.querySelectorAll('image'));
    expect(whole!.getAttribute('xlink:href')).toBe(
      `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    );
    expect(
      ['x', 'y', 'width', 'height', 'preserveAspectRatio'].map((n) => whole!.getAttribute(n))
    ).toEqual(['5', '6', '40', '24', 'none']);
    expect(whole!.hasAttribute('clip-path')).toBe(false);
    // 10 px per source px across and 12 down: the picture starts 2 px / 4 px of source above and left of the rect.
    expect(['x', 'y', 'width', 'height'].map((n) => cropped!.getAttribute(n))).toEqual([
      '-15',
      '-42',
      '80',
      '96',
    ]);
    const clipId = /url\(#(.+)\)/.exec(cropped!.getAttribute('clip-path')!)![1]!;
    const rectEl = root.querySelector(`clipPath[id="${clipId}"] > rect`)!;
    expect(['x', 'y', 'width', 'height'].map((n) => rectEl.getAttribute(n))).toEqual([
      '5',
      '6',
      '40',
      '24',
    ]);
  });

  it('raster ops embed png data urls; no raster image when the scene has none', () => {
    const raster: SceneOp = {
      ...base({ matrix: [1, 0, 0, 1, 3, 4] }),
      kind: 'raster',
      png: PNG,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      reason: 'filter',
      source: null,
    };
    const { svg } = run(sceneOf(item('r', null, raster)));
    const image = parse(svg).querySelector('image')!;
    expect(image.getAttribute('xlink:href')).toMatch(/^data:image\/png;base64,/);
    expect(['x', 'y', 'width', 'height'].map((n) => image.getAttribute(n))).toEqual([
      '10',
      '20',
      '30',
      '40',
    ]);
    expect(matrixOf(image)).toEqual([1, 0, 0, 1, 3, 4]);

    const plain = run(sceneOf(item('r', null, fill(rect(0, 0, 5, 5), solid('#000000'))))).svg;
    expect(plain).not.toContain('<image');
    expect(plain).not.toContain('data:image');
  });

  it('writes a group op as a group around its children', () => {
    const group: SceneOp = {
      ...base({ alpha: 0.4 }),
      kind: 'group',
      ops: [fill(rect(0, 0, 10, 10), solid('#00ff00')), fill(rect(5, 5, 10, 10), solid('#ff00ff'))],
      shadow: null,
    };
    const wrapper = parse(run(sceneOf(item('g', null, group))).svg).querySelector('g[id] > g')!;
    expect(wrapper.getAttribute('opacity')).toBe('0.4');
    expect(wrapper.querySelectorAll(':scope > path')).toHaveLength(2);
  });
});

describe('determinism', () => {
  it('output is deterministic', () => {
    const first = run(fixtureScene()).svg;
    const second = run(fixtureScene()).svg;
    expect(second).toBe(first);
    const editable = [
      run(fixtureScene(), { text: 'editable' }).svg,
      run(fixtureScene(), { text: 'editable' }).svg,
    ];
    expect(editable[1]).toBe(editable[0]);
  });
});

describe('characters XML forbids', () => {
  // A control character and a lone surrogate come in with pasted text (a Word or PDF paste).
  const dirty = 'a\u0001b\uD800c\uDC00d\uFFFEe\tf';

  it.each(['outlines', 'editable'] as const)(
    'keeps them out of a text run and a layer label, in %s mode',
    (text) => {
      const scene = sceneOf(item('t', `Label ${dirty}`, textOp(dirty)));

      const { svg } = run(scene, { text });

      const root = parse(svg);
      expect(root.querySelector('title')!.textContent).toBe('Label abcde\tf');
      // eslint-disable-next-line no-control-regex
      expect(svg).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
      if (text === 'editable') expect(root.querySelector('text')!.textContent).toBe('abcde\tf');
    }
  );

  it('keeps them out of an attribute value, and keeps the characters XML allows', () => {
    const scene = sceneOf(
      item('a\u0001b', 'Größe → 😀\nzwei', fill(rect(0, 0, 5, 5), solid('#ff0000')))
    );

    const root = parse(run(scene).svg);

    expect(itemGroups(root)[0]!.getAttribute('data-element-id')).toBe('ab');
    expect(root.querySelector('title')!.textContent).toBe('Größe → 😀\nzwei');
  });
});
