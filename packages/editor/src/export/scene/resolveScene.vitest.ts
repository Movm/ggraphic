// SPDX-License-Identifier: AGPL-3.0-only
import { sanitizeSvg } from '@ggraphic/schema';
import { describe, expect, it, vi } from 'vitest';

import { jpegOrientation } from './imageBytes.js';
import { IDENTITY } from './matrix.js';
import { resolveScene, type ResolveDeps } from './resolveScene.js';
import { markTrustedSvgImage } from './trustedSvgImages.js';
import { emptyReport, type RecordedScene, type SceneItem, type SceneOp } from './types.js';

// ---------------------------------------------------------------------------------------------
// Fixtures. Image bytes are only as long as the format sniffing needs; nothing here decodes.

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const RESULT_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

const u16 = (n: number, little: boolean) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
const u32 = (n: number, little: boolean) =>
  little
    ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]
    : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** A JPEG that is a JFIF segment, an Exif segment holding `orientation` (or none), and the end. */
function jpeg(orientation: number | null, order: 'II' | 'MM' = 'MM'): Uint8Array {
  const little = order === 'II';
  const jfif = [0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  let exif: number[] = [];
  if (orientation !== null) {
    const tiff = [
      ...ascii(order),
      ...u16(42, little),
      ...u32(8, little),
      // IFD0: two entries, so the reader has to walk past one to find the orientation.
      ...u16(2, little),
      ...u16(0x0100, little), // ImageWidth, LONG, 1
      ...u16(4, little),
      ...u32(1, little),
      ...u32(16, little),
      ...u16(0x0112, little), // Orientation, SHORT, 1
      ...u16(3, little),
      ...u32(1, little),
      ...u16(orientation, little),
      0,
      0,
      ...u32(0, little),
    ];
    const body = [...ascii('Exif'), 0, 0, ...tiff];
    exif = [0xff, 0xe1, ...u16(body.length + 2, false), ...body];
  }
  return Uint8Array.from([0xff, 0xd8, ...jfif, ...exif, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

/** A WebP of one chunk. `payload` starts at byte 20, as in the file. */
function webp(chunk: 'VP8 ' | 'VP8X' | 'VP8L', payload: number[]): Uint8Array {
  const size = 4 + 8 + payload.length;
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...u32(size, true),
    ...ascii('WEBP'),
    ...ascii(chunk),
    ...u32(payload.length, true),
    ...payload,
  ]);
}

const GIF = Uint8Array.from([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0]);
const AVIF = Uint8Array.from([0, 0, 0, 24, ...ascii('ftypavif'), 0, 0, 0, 0, ...ascii('mif1avif')]);

const utf8 = (text: string) => new TextEncoder().encode(text);
const svgOf = (extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20">${extra}<rect width="40" height="20" fill="#336699"/></svg>`;
const dataSvg = (markup: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
const dataPng = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

// ---------------------------------------------------------------------------------------------
// Scene and dependency builders

const base = { matrix: IDENTITY, alpha: 1, clips: [], shadow: null } as const;
const SIZE = { width: 40, height: 20 };

/** What the recorder keeps of a drawn element: `HTMLImageElement` reduced to what is read of it. */
const img = (src: string) => ({ src, naturalWidth: SIZE.width, naturalHeight: SIZE.height });

/** An image element a producer in the editor made from an SVG it generated: marked as such. */
const ownImg = (src: string) => {
  const element = img(src);
  markTrustedSvgImage(element as unknown as HTMLImageElement);
  return element;
};

function imageOp(element: unknown, over: Partial<Extract<SceneOp, { kind: 'image' }>> = {}) {
  return {
    ...base,
    kind: 'image',
    image: { kind: 'element', element: element as CanvasImageSource, ...SIZE },
    sx: 0,
    sy: 0,
    sw: SIZE.width,
    sh: SIZE.height,
    dx: 5,
    dy: 6,
    dw: 40,
    dh: 20,
    ...over,
  } satisfies SceneOp;
}

const squarePath = (paint: Extract<SceneOp, { kind: 'path' }>['paint']): SceneOp => ({
  ...base,
  kind: 'path',
  mode: 'fill',
  commands: [
    { op: 'M', x: 0, y: 0 },
    { op: 'L', x: 4, y: 0 },
    { op: 'L', x: 4, y: 4 },
    { op: 'Z' },
  ],
  rule: 'nonzero',
  paint,
  stroke: null,
});

const solidPath = () => squarePath({ type: 'solid', hex: '#336699', alpha: 1 });

const island = (over: Partial<Extract<SceneOp, { kind: 'raster' }>> = {}): SceneOp => ({
  ...base,
  kind: 'raster',
  png: null,
  x: 10,
  y: 14,
  width: 40,
  height: 20,
  reason: 'filter',
  source: null,
  ...over,
});

const item = (elementId: string | null, ...ops: SceneOp[]): SceneItem => ({
  elementId,
  label: null,
  ops,
});

const sceneOf = (...items: SceneItem[]): RecordedScene => ({
  width: 100,
  height: 80,
  items,
  report: emptyReport(),
});

/** Every dependency a mock that answers "cannot"; `over` swaps some for mocks that can. */
function makeDeps(over: Partial<ResolveDeps> = {}) {
  const mocks = {
    page: 2,
    fetchBytes: vi.fn<ResolveDeps['fetchBytes']>(async () => null),
    reencode: vi.fn<ResolveDeps['reencode']>(async () => null),
    rasterizeElement: vi.fn<ResolveDeps['rasterizeElement']>(async () => null),
    rasterizeNode: vi.fn<ResolveDeps['rasterizeNode']>(async () => null),
    rasterizeOps: vi.fn<ResolveDeps['rasterizeOps']>(async () => null),
    rasterPixelRatio: 3,
  };
  // An override is itself a mock wherever a test goes on to read `.mock` of it.
  return { ...mocks, ...over } as typeof mocks;
}

/** The one op of the one item, narrowed. */
async function resolveOne(op: SceneOp, deps: ResolveDeps, elementId: string | null = 'a') {
  const scene = await resolveScene(sceneOf(item(elementId, op)), deps);
  return scene.items[0]?.ops[0];
}

/** Paths into `value` that still hold a recorded-only member. */
function leaks(value: unknown, path = '$', seen = new Set<unknown>()): string[] {
  if (typeof value !== 'object' || value === null || value instanceof Uint8Array) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found: string[] = [];
  if (!Array.isArray(value) && (value as { kind?: unknown }).kind === 'element') found.push(path);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'nodeRef') found.push(`${path}.${key}`);
    found.push(...leaks(child, `${path}.${key}`, seen));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------

describe('jpegOrientation', () => {
  it.each(['MM', 'II'] as const)('reads orientation 6 from a %s Exif segment', (order) => {
    expect(jpegOrientation(jpeg(6, order))).toBe(6);
  });

  it('is 1 without Exif, without an orientation tag, or for something that is no jpeg', () => {
    expect(jpegOrientation(jpeg(null))).toBe(1);
    expect(jpegOrientation(PNG)).toBe(1);
    expect(jpegOrientation(new Uint8Array())).toBe(1);
  });

  it('is 1 for an out-of-range value and for a segment cut short', () => {
    expect(jpegOrientation(jpeg(9))).toBe(1);
    expect(jpegOrientation(jpeg(0))).toBe(1);
    expect(jpegOrientation(jpeg(6).slice(0, 40))).toBe(1);
  });
});

describe('resolveScene: image sources', () => {
  it('inlines the svg of a marked image as it is: decoded, and not sanitised', async () => {
    // The sanitiser drops `<style>` and `<text>`; keeping them proves this markup was not run
    // through it. This is what a chart looks like.
    const markup = svgOf(
      '<style>text{font-family:Brand Sans}</style><text x="2" y="9">Label</text>'
    );
    const stripped = sanitizeSvg(markup);
    expect(stripped).not.toContain('<style');
    expect(stripped).not.toContain('<text');
    const deps = makeDeps();

    const percent = await resolveOne(imageOp(ownImg(dataSvg(markup))), deps);
    const base64 = await resolveOne(
      imageOp(ownImg(`data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`)),
      deps
    );

    for (const op of [percent, base64]) {
      expect(op).toMatchObject({ kind: 'image', image: { kind: 'svg', markup, ...SIZE } });
    }
    expect(deps.fetchBytes).not.toHaveBeenCalled();
  });

  it('inlines the svg of a marked image fetched from a url, too', async () => {
    // The illustration fallback loads the catalogue file by its path.
    const markup = svgOf('<style>.a{fill:red}</style>');
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => ({ bytes: utf8(markup), mime: 'image/svg+xml' })),
    });

    const op = await resolveOne(imageOp(ownImg('https://assets.example/ill.svg')), deps);

    expect(op).toMatchObject({ image: { kind: 'svg', markup } });
  });

  describe('an svg a document wrote into an image it did not mark', () => {
    // Each payload is what a user image or asset could carry as its `src`. The data url looks
    // exactly like the editor's own, and that proves nothing.
    const payloads: Record<string, string> = {
      'a script in a namespace prefix': svgOf(
        '<x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script>'
      ),
      'a script': svgOf('<script>alert(1)</script>'),
      'an entity-encoded javascript: link': svgOf('<use href="&#106;avascript:alert(1)"/>'),
      'a foreignObject in a namespace prefix': svgOf(
        '<x:foreignObject xmlns:x="http://www.w3.org/2000/svg"><p>hi</p></x:foreignObject>'
      ),
      'an image that phones home': svgOf('<image href="https://tracker.example/p.png"/>'),
      'a style sheet that imports': svgOf(
        '<style>@import url(https://tracker.example/x.css);</style>'
      ),
      'an event handler': svgOf('<rect width="1" height="1" onload="alert(1)"/>'),
    };
    const FORBIDDEN = /script|foreignObject|javascript|&#106;|tracker|@import|onload/i;

    /** Every piece of svg markup the output holds. */
    const markupOf = (scene: RecordedScene) =>
      scene.items
        .flatMap((i) => i.ops)
        .flatMap((op) => (op.kind === 'image' && op.image.kind === 'svg' ? [op.image.markup] : []));

    it.each(Object.entries(payloads))(
      'is sanitised or left out, never inlined: %s',
      async (_name, payload) => {
        const sources = [
          dataSvg(payload),
          `data:image/svg+xml;base64,${Buffer.from(payload).toString('base64')}`,
        ];
        for (const src of sources) {
          const deps = makeDeps();
          const scene = await resolveScene(sceneOf(item('a', imageOp(img(src)))), deps);

          expect(markupOf(scene).join('\n')).not.toMatch(FORBIDDEN);
          expect(JSON.stringify(leaks(scene))).toBe('[]');
        }
      }
    );

    it('is drawn from the stage when it uses what the sanitiser would strip', async () => {
      const deps = makeDeps();
      deps.rasterizeElement.mockResolvedValue({
        png: RESULT_PNG,
        box: { x: 0, y: 0, width: 4, height: 4 },
      });

      const scene = await resolveScene(
        sceneOf(item('a', imageOp(img(dataSvg(payloads['a style sheet that imports']!))))),
        deps
      );

      expect(scene.items[0]!.ops).toMatchObject([
        { kind: 'raster', reason: 'svg-unsupported', png: RESULT_PNG },
      ]);
      expect(scene.report.rasterIslands).toEqual([
        { page: 2, elementId: 'a', reason: 'svg-unsupported' },
      ]);
    });

    it('keeps what the sanitiser can express, sanitised', async () => {
      const scene = await resolveScene(
        sceneOf(item('a', imageOp(img(dataSvg(payloads['a script']!))))),
        makeDeps()
      );

      const [markup] = markupOf(scene);
      expect(markup).toContain('<rect');
      expect(markup).not.toContain('script');
    });
  });

  it('sanitises a foreign svg, from a url or a blob', async () => {
    const hostile = svgOf('<script>alert(1)</script><rect onload="x()" width="1" height="1"/>');
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => ({ bytes: utf8(hostile), mime: 'image/svg+xml' })),
    });
    const blobDeps = makeDeps({
      // A blob url has no extension and often no useful mime; the content decides.
      fetchBytes: vi.fn(async () => ({ bytes: utf8(hostile), mime: 'application/octet-stream' })),
    });

    const fromUrl = await resolveOne(imageOp(img('https://cdn.example/x.svg')), deps);
    const fromBlob = await resolveOne(imageOp(img('blob:https://example/1f')), blobDeps);

    expect(deps.fetchBytes).toHaveBeenCalledWith('https://cdn.example/x.svg');
    for (const op of [fromUrl, fromBlob]) {
      const image = (op as Extract<SceneOp, { kind: 'image' }>).image;
      expect(image.kind).toBe('svg');
      const markup = image.kind === 'svg' ? image.markup : '';
      expect(markup).not.toContain('<script');
      expect(markup).not.toContain('onload');
      expect(markup).toContain('<rect');
    }
  });

  it.each([
    ['a style element', svgOf('<style>.a{fill:red}</style><rect class="a" width="1" height="1"/>')],
    [
      'a class attribute',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="a" width="1" height="1"/></svg>',
    ],
    [
      'a style attribute',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red" width="1" height="1"/></svg>',
    ],
    ['text', svgOf('<text x="1" y="9">Hi</text>')],
    ['not being well-formed', '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>'],
  ])(
    'is not inlined when a foreign svg has %s: the element is drawn from the stage',
    async (_what, markup) => {
      const deps = makeDeps({
        fetchBytes: vi.fn(async () => ({ bytes: utf8(markup), mime: 'image/svg+xml' })),
      });
      deps.rasterizeElement.mockResolvedValue({
        png: RESULT_PNG,
        box: { x: 3, y: 4, width: 40, height: 20 },
      });

      const scene = await resolveScene(
        sceneOf(item('a', solidPath(), imageOp(img('https://cdn.example/x.svg')))),
        deps
      );

      expect(scene.items[0]!.ops).toEqual([
        {
          ...base,
          kind: 'raster',
          png: RESULT_PNG,
          x: 3,
          y: 4,
          width: 40,
          height: 20,
          reason: 'svg-unsupported',
          source: null,
        },
      ]);
      expect(scene.report.rasterIslands).toEqual([
        { page: 2, elementId: 'a', reason: 'svg-unsupported' },
      ]);
      expect(scene.report.missingElements).toEqual([]);
    }
  );

  it('reports a foreign svg it can neither inline nor draw from the stage as missing', async () => {
    const markup = svgOf('<style>.a{fill:red}</style>');
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => ({ bytes: utf8(markup), mime: 'image/svg+xml' })),
    });

    const scene = await resolveScene(
      sceneOf(item('a', imageOp(img('https://cdn.example/x.svg')))),
      deps
    );

    expect(scene.items).toEqual([]);
    expect(scene.report.rasterIslands).toEqual([]);
    expect(scene.report.missingElements).toEqual([
      { page: 2, elementId: 'a', reason: 'image-unreadable' },
    ]);
  });

  it('passes png and an upright jpeg through, byte for byte', async () => {
    const upright = jpeg(1);
    const fetched = new Map([
      ['https://cdn.example/a.png', PNG],
      ['https://cdn.example/b.jpg', upright],
      ['https://cdn.example/c.jpg', jpeg(null)],
    ]);
    const deps = makeDeps({
      fetchBytes: vi.fn(async (url: string) => ({ bytes: fetched.get(url)!, mime: 'image/x' })),
    });

    const png = await resolveOne(imageOp(img('https://cdn.example/a.png')), deps);
    const jpg = await resolveOne(imageOp(img('https://cdn.example/b.jpg')), deps);
    const plain = await resolveOne(imageOp(img('https://cdn.example/c.jpg')), deps);

    expect(png).toMatchObject({ image: { kind: 'bitmap', mime: 'image/png', ...SIZE } });
    expect(jpg).toMatchObject({ image: { kind: 'bitmap', mime: 'image/jpeg', ...SIZE } });
    expect((png as { image: { bytes: Uint8Array } }).image.bytes).toBe(PNG);
    expect((jpg as { image: { bytes: Uint8Array } }).image.bytes).toBe(upright);
    expect(plain).toMatchObject({ image: { kind: 'bitmap', mime: 'image/jpeg' } });
    expect(deps.reencode).not.toHaveBeenCalled();
  });

  it('reads a base64 data url of a raster without asking the fetcher', async () => {
    const deps = makeDeps();
    const op = await resolveOne(imageOp(img(dataPng(PNG))), deps);

    expect(op).toMatchObject({ image: { kind: 'bitmap', mime: 'image/png' } });
    expect(deps.fetchBytes).not.toHaveBeenCalled();
  });

  it('re-encodes webp, gif and avif, and an exif-rotated jpeg', async () => {
    const lossy = webp('VP8 ', [1, 2, 3, 4]);
    const withAlpha = webp('VP8X', [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const lossless = webp('VP8L', [0x2f, 0, 0, 0, 0x10]);
    const losslessOpaque = webp('VP8L', [0x2f, 0, 0, 0, 0]);
    const rotated = jpeg(6);
    const jpegOut = jpeg(1);
    const files = new Map<string, Uint8Array>([
      ['lossy.webp', lossy],
      ['alpha.webp', withAlpha],
      ['lossless.webp', lossless],
      ['opaque.webp', losslessOpaque],
      ['a.gif', GIF],
      ['a.avif', AVIF],
      ['rotated.jpg', rotated],
    ]);
    const deps = makeDeps({
      fetchBytes: vi.fn(async (url: string) => ({ bytes: files.get(url)!, mime: 'image/webp' })),
      // `null` asks the dependency to look at the pixels: this one finds none transparent.
      reencode: vi.fn(async (_bytes, _mime, opaque) => ({
        bytes: opaque === false ? RESULT_PNG : jpegOut,
        mime: opaque === false ? ('image/png' as const) : ('image/jpeg' as const),
        width: 40,
        height: 20,
      })),
    });

    const opaqueOf = async (name: string) => {
      deps.reencode.mockClear();
      const op = await resolveOne(imageOp(img(name)), deps);
      expect(deps.reencode).toHaveBeenCalledTimes(1);
      const [bytes, mime, opaque] = deps.reencode.mock.calls[0]!;
      return { op, bytes, mime, opaque };
    };

    const lossyCall = await opaqueOf('lossy.webp');
    expect(lossyCall.bytes).toBe(lossy);
    expect(lossyCall.mime).toBe('image/webp');
    expect(lossyCall.opaque).toBe(true);
    expect(lossyCall.op).toMatchObject({ image: { kind: 'bitmap', mime: 'image/jpeg', ...SIZE } });

    expect((await opaqueOf('alpha.webp')).opaque).toBe(false);
    // The `alpha_is_used` bit of a lossless file is a hint: with it clear, it still may have alpha.
    expect((await opaqueOf('lossless.webp')).opaque).toBe(false);
    expect((await opaqueOf('opaque.webp')).opaque).toBe(false);

    // Nothing in a GIF or AVIF says without decoding; the dependency decodes anyway.
    const gif = await opaqueOf('a.gif');
    expect(gif.mime).toBe('image/gif');
    expect(gif.opaque).toBeNull();
    const avif = await opaqueOf('a.avif');
    expect(avif.mime).toBe('image/avif');
    expect(avif.opaque).toBeNull();
    // A photographic AVIF comes back as a JPEG.
    expect(avif.op).toMatchObject({ image: { kind: 'bitmap', mime: 'image/jpeg' } });

    // A rotated jpeg has no alpha; the canvas applies the orientation when it draws it.
    const turned = await opaqueOf('rotated.jpg');
    expect(turned.bytes).toBe(rotated);
    expect(turned.mime).toBe('image/jpeg');
    expect(turned.opaque).toBe(true);
    expect(turned.op).toMatchObject({ image: { kind: 'bitmap', mime: 'image/jpeg' } });
  });

  it('keeps the size the canvas drew the image at, not the size of the re-encoded bitmap', async () => {
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => ({ bytes: GIF, mime: 'image/gif' })),
      reencode: vi.fn(async () => ({
        bytes: RESULT_PNG,
        mime: 'image/png' as const,
        width: 80,
        height: 40,
      })),
    });
    const op = await resolveOne(imageOp(img('https://cdn.example/a.gif')), deps);

    expect(op).toMatchObject({ image: { kind: 'bitmap', width: 40, height: 20 } });
  });

  it('fetches and decodes an element once however often it is drawn', async () => {
    const deps = makeDeps({ fetchBytes: vi.fn(async () => ({ bytes: PNG, mime: 'image/png' })) });
    const element = img('https://cdn.example/a.png');

    const scene = await resolveScene(
      sceneOf(item('a', imageOp(element)), item('b', imageOp(element))),
      deps
    );

    expect(deps.fetchBytes).toHaveBeenCalledTimes(1);
    const [first, second] = scene.items.map((i) => (i.ops[0] as { image: unknown }).image);
    expect(first).toBe(second);
  });

  it('turns the pixels of a canvas tile into a bitmap pattern image', async () => {
    const tile = { width: 8, height: 8, toDataURL: () => dataPng(PNG) };
    const op = await resolveOne(
      squarePath({
        type: 'pattern',
        image: {
          kind: 'element',
          element: tile as unknown as CanvasImageSource,
          width: 8,
          height: 8,
        },
        repeat: 'repeat',
        matrix: IDENTITY,
      }),
      makeDeps()
    );

    expect(op).toMatchObject({
      kind: 'path',
      paint: { type: 'pattern', image: { kind: 'bitmap', mime: 'image/png', width: 8, height: 8 } },
    });
    expect(leaks(op)).toEqual([]);
  });
});

describe('resolveScene: canvas sources', () => {
  const canvas = (png: () => string) => ({ width: 8, height: 4, toDataURL: png });
  const canvasOp = (element: unknown, over: Partial<Extract<SceneOp, { kind: 'image' }>> = {}) =>
    imageOp(element, {
      image: { kind: 'element', element: element as CanvasImageSource, width: 8, height: 4 },
      sx: 0,
      sy: 0,
      sw: 8,
      sh: 4,
      dx: 5,
      dy: 6,
      dw: 4,
      dh: 2,
      matrix: [2, 0, 0, 2, 10, 10],
      alpha: 0.5,
      ...over,
    });

  it('turns a drawn canvas into a raster with the canvas pixels, keeping where it was drawn', async () => {
    const scene = await resolveScene(
      sceneOf(item('a', canvasOp(canvas(() => dataPng(PNG))))),
      makeDeps()
    );

    const raster = scene.items[0]!.ops[0] as Extract<SceneOp, { kind: 'raster' }>;
    expect(raster).toMatchObject({
      kind: 'raster',
      x: 5,
      y: 6,
      width: 4,
      height: 2,
      matrix: [2, 0, 0, 2, 10, 10],
      alpha: 0.5,
      reason: 'filter',
      source: null,
    });
    expect(Array.from(raster.png!)).toEqual(Array.from(PNG));
    expect(scene.report.rasterIslands).toEqual([{ page: 2, elementId: 'a', reason: 'filter' }]);
  });

  it('keeps a part of a canvas as an image, because a raster cannot be cropped', async () => {
    const op = await resolveOne(
      canvasOp(
        canvas(() => dataPng(PNG)),
        { sx: 2, sy: 1, sw: 4, sh: 2 }
      ),
      makeDeps()
    );

    expect(op).toMatchObject({
      kind: 'image',
      sx: 2,
      sy: 1,
      sw: 4,
      sh: 2,
      image: { kind: 'bitmap', mime: 'image/png', width: 8, height: 4 },
    });
  });
});

describe('resolveScene: unreadable images', () => {
  const unreadable = () => makeDeps({ fetchBytes: vi.fn(async () => null) });

  it('is reported as missing, never silent, when the stage cannot draw it either', async () => {
    const deps = unreadable();

    const scene = await resolveScene(
      sceneOf(item('a', imageOp(img('https://cdn.example/x.png')))),
      deps
    );

    expect(deps.rasterizeElement).toHaveBeenCalledWith('a', 3);
    expect(scene.items).toEqual([]);
    expect(scene.report.missingElements).toEqual([
      { page: 2, elementId: 'a', reason: 'image-unreadable' },
    ]);
  });

  it('removes only the unreadable op and keeps the rest of the element', async () => {
    const scene = await resolveScene(
      sceneOf(item('a', solidPath(), imageOp(img('https://cdn.example/x.png')), solidPath())),
      unreadable()
    );

    expect(scene.items[0]!.ops.map((op) => op.kind)).toEqual(['path', 'path']);
    expect(scene.report.missingElements).toHaveLength(1);
  });

  it('reports an element once however many of its images fail', async () => {
    const scene = await resolveScene(
      sceneOf(
        item(
          'a',
          imageOp(img('https://cdn.example/x.png')),
          imageOp(img('https://cdn.example/y.png'))
        )
      ),
      unreadable()
    );

    expect(scene.report.missingElements).toHaveLength(1);
  });

  it('is rastered from the stage when that works: the element becomes one island', async () => {
    const box = { x: 12, y: 14, width: 44, height: 24 };
    const deps = unreadable();
    deps.rasterizeElement.mockResolvedValue({ png: RESULT_PNG, box });

    const scene = await resolveScene(
      sceneOf(item('a', solidPath(), imageOp(img('https://cdn.example/x.png')))),
      deps
    );

    // The element's raster shows the whole element; its other ops would draw it twice.
    expect(scene.items[0]!.ops).toEqual([
      {
        ...base,
        kind: 'raster',
        png: RESULT_PNG,
        ...box,
        reason: 'image-unreadable',
        source: null,
      },
    ]);
    expect(scene.report.rasterIslands).toEqual([
      { page: 2, elementId: 'a', reason: 'image-unreadable' },
    ]);
    expect(scene.report.missingElements).toEqual([]);
  });

  it('has no stage to ask for an element without an id', async () => {
    const deps = unreadable();

    const scene = await resolveScene(
      sceneOf(item(null, imageOp(img('https://cdn.example/x.png')))),
      deps
    );

    expect(deps.rasterizeElement).not.toHaveBeenCalled();
    expect(scene.report.missingElements).toEqual([
      { page: 2, elementId: null, reason: 'image-unreadable' },
    ]);
  });

  it('falls back to the stage for a source that cannot be decoded, and for a tainted canvas', async () => {
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => ({ bytes: GIF, mime: 'image/gif' })),
      reencode: vi.fn(async () => null),
    });
    const tainted = {
      width: 8,
      height: 4,
      toDataURL: () => {
        throw new Error('SecurityError');
      },
    };

    const scene = await resolveScene(
      sceneOf(
        item('a', imageOp(img('https://cdn.example/a.gif'))),
        item(
          'b',
          imageOp(tainted, {
            image: { kind: 'element', element: tainted as never, width: 8, height: 4 },
          })
        )
      ),
      deps
    );

    expect(deps.rasterizeElement.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    expect(scene.report.missingElements.map((m) => m.elementId)).toEqual(['a', 'b']);
  });

  it('treats a source it cannot read a url from as unreadable', async () => {
    const bitmapLike = { width: 40, height: 20, close() {} };
    const scene = await resolveScene(sceneOf(item('a', imageOp(bitmapLike))), unreadable());

    expect(scene.report.missingElements).toHaveLength(1);
  });

  it('does not let a throwing dependency break the export', async () => {
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
      rasterizeElement: vi.fn(async () => {
        throw new Error('SecurityError');
      }),
    });

    const scene = await resolveScene(
      sceneOf(item('a', imageOp(img('https://cdn.example/x.png')))),
      deps
    );

    expect(scene.report.missingElements).toHaveLength(1);
  });
});

describe('resolveScene: raster islands', () => {
  const box = { x: 10, y: 14, width: 40, height: 20 };

  it('gives a raster op without pixels the output of rasterizeElement', async () => {
    const deps = makeDeps();
    deps.rasterizeElement.mockResolvedValue({
      png: RESULT_PNG,
      box: { x: 0, y: 0, width: 1, height: 1 },
    });

    const scene = await resolveScene(sceneOf(item('a', island())), deps);

    expect(deps.rasterizeElement).toHaveBeenCalledWith('a', 3);
    // Where the island goes was decided when it was recorded.
    expect(scene.items[0]!.ops[0]).toEqual({
      ...base,
      kind: 'raster',
      png: RESULT_PNG,
      ...box,
      reason: 'filter',
      source: null,
    });
  });

  it('rasterises an island of an element without an id by the node it kept', async () => {
    const node = { name: 'konva node' };
    const deps = makeDeps();
    deps.rasterizeNode.mockResolvedValue(RESULT_PNG);

    const scene = await resolveScene(sceneOf(item(null, island({ nodeRef: node }))), deps);

    expect(deps.rasterizeNode).toHaveBeenCalledWith(node, 3);
    expect(deps.rasterizeElement).not.toHaveBeenCalled();
    expect(scene.items[0]!.ops[0]).toMatchObject({ kind: 'raster', png: RESULT_PNG, ...box });
  });

  it('rasterises the ops of an island that has some', async () => {
    const source = [solidPath()];
    const deps = makeDeps();
    deps.rasterizeOps.mockResolvedValue(RESULT_PNG);

    const scene = await resolveScene(sceneOf(item('a', island({ source }))), deps);

    expect(deps.rasterizeOps).toHaveBeenCalledWith(source, box, 3);
    expect(deps.rasterizeElement).not.toHaveBeenCalled();
    expect(scene.items[0]!.ops[0]).toMatchObject({ png: RESULT_PNG, source: null });
  });

  it('keeps pixels that are already there', async () => {
    const deps = makeDeps();
    const scene = await resolveScene(sceneOf(item('a', island({ png: PNG }))), deps);

    expect((scene.items[0]!.ops[0] as { png: Uint8Array }).png).toBe(PNG);
    expect(deps.rasterizeElement).not.toHaveBeenCalled();
  });

  it('removes an island nothing can rasterise, and says so', async () => {
    const scene = await resolveScene(
      sceneOf(item('a', island()), item('b', solidPath())),
      makeDeps()
    );

    expect(scene.items.map((i) => i.elementId)).toEqual(['b']);
    expect(scene.report.missingElements).toEqual([
      { page: 2, elementId: 'a', reason: 'image-unreadable' },
    ]);
  });

  it('leaves no recorded-only member in the scene', async () => {
    const node = { name: 'konva node' };
    const deps = makeDeps({
      fetchBytes: vi.fn(async () => ({ bytes: PNG, mime: 'image/png' })),
    });
    deps.rasterizeElement.mockResolvedValue({ png: RESULT_PNG, box });
    deps.rasterizeNode.mockResolvedValue(RESULT_PNG);
    deps.rasterizeOps.mockResolvedValue(RESULT_PNG);
    const grouped: SceneOp = {
      ...base,
      kind: 'group',
      ops: [imageOp(img('https://cdn.example/a.png'))],
    };
    // An island nested in a group (a buffered draw) keeps its handle in the recording too.
    const nested: SceneOp = {
      ...base,
      kind: 'group',
      ops: [island({ nodeRef: node, source: [imageOp(img('https://cdn.example/a.png'))] })],
    };

    const scene = await resolveScene(
      sceneOf(
        item('a', imageOp(img('https://cdn.example/a.png')), grouped),
        item('b', island({ source: [imageOp(img('https://cdn.example/a.png'))] })),
        item('c', island()),
        item(null, island({ nodeRef: node })),
        item(null, nested, { ...nested, ops: [island({ nodeRef: node })] })
      ),
      deps
    );

    expect(scene.items).toHaveLength(5);
    expect(scene.items[4]!.ops).toHaveLength(2);
    expect(leaks(scene)).toEqual([]);
  });
});

describe('resolveScene: the scene', () => {
  it('keeps order, size and labels, drops items with nothing left, and leaves the input alone', async () => {
    const recorded = sceneOf(
      { elementId: 'a', label: 'Photo', ops: [solidPath()] },
      item('b', island()),
      { elementId: 'c', label: 'Text', ops: [solidPath(), solidPath()] }
    );
    recorded.report.rasterIslands.push({ page: 2, elementId: 'b', reason: 'filter' });
    recorded.report.unknownCalls.push({ page: 2, elementId: 'b', call: 'getImageData' });
    const before = recorded.items[1]!.ops[0];

    const scene = await resolveScene(recorded, makeDeps());

    expect(scene.width).toBe(100);
    expect(scene.height).toBe(80);
    expect(scene.items.map((i) => [i.elementId, i.label, i.ops.length])).toEqual([
      ['a', 'Photo', 1],
      ['c', 'Text', 2],
    ]);
    // The recording's entries stay.
    expect(scene.report.rasterIslands).toEqual([{ page: 2, elementId: 'b', reason: 'filter' }]);
    expect(scene.report.unknownCalls).toEqual([{ page: 2, elementId: 'b', call: 'getImageData' }]);
    // The recorded report is not written to.
    expect(recorded.report.missingElements).toEqual([]);
    expect(recorded.items[1]!.ops[0]).toBe(before);
  });

  it('resolves images inside groups', async () => {
    const grouped: SceneOp = {
      ...base,
      kind: 'group',
      ops: [imageOp(img(dataSvg(svgOf())))],
    };

    const op = await resolveOne(grouped, makeDeps());

    expect(op).toMatchObject({ kind: 'group', ops: [{ kind: 'image', image: { kind: 'svg' } }] });
  });

  it('passes an image that is already a source straight through', async () => {
    const source = { kind: 'bitmap' as const, mime: 'image/png' as const, bytes: PNG, ...SIZE };
    const op = await resolveOne({ ...imageOp(null), image: source }, makeDeps());

    expect((op as { image: unknown }).image).toBe(source);
  });
});
