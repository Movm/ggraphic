// SPDX-License-Identifier: AGPL-3.0-only
// What a photo carries besides its pixels does not travel into an export: Exif (and the position
// in it), XMP, comments, PNG text and time chunks. The image data does, byte for byte.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';

import {
  jpegOrientation,
  sourceFromUrl,
  stripJpegMetadata,
  stripPngMetadata,
  type ImageByteDeps,
} from './imageBytes.js';

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 255];
const u32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

/** A picture with something in it, so a decoder has pixels to get wrong. */
function canvasPicture() {
  const canvas = createCanvas(12, 8);
  const context = canvas.getContext('2d');
  context.fillStyle = '#336699';
  context.fillRect(0, 0, 12, 8);
  context.fillStyle = '#cc3300';
  context.fillRect(2, 2, 5, 4);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// JPEG

/** A marker segment: 0xFF, the marker, the length (which counts itself), the payload. */
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...u16(payload.length + 2),
  ...payload,
];

/** An Exif segment: orientation `orientation`, and a GPS position written out in ASCII. */
function exifWithGps(orientation = 1) {
  const tiff = [
    ...ascii('MM'),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112), // Orientation, SHORT, 1
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
    ...ascii('GPSLatitude 52.5200 N GPSLongitude 13.4050 E'),
  ];
  return segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

const XMP = segment(0xe1, [
  ...ascii('http://ns.adobe.com/xap/1.0/'),
  0,
  ...ascii('<x:xmpmeta gps:GPSLatitude="52,31.2N"/>'),
]);
const ICC = segment(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, ...ascii('profile bytes')]);
const MPF = segment(0xe2, [...ascii('MPF'), 0, ...ascii('multi picture')]);
const PHOTOSHOP = segment(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('IPTC caption')]);
const ADOBE = segment(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 2]);
const COMMENT = segment(0xfe, ascii('taken at home'));
const APP3 = segment(0xe3, ascii('Meta that is neither'));
const APP15 = segment(0xef, ascii('Last application segment'));

/** A real JPEG, with `extra` segments directly after the start of image. */
function jpegWith(extra: number[][]): { bytes: Uint8Array; plain: Uint8Array } {
  const plain = new Uint8Array(canvasPicture().toBuffer('image/jpeg', 90));
  expect([plain[0], plain[1]]).toEqual([0xff, 0xd8]);
  const bytes = Uint8Array.from([0xff, 0xd8, ...extra.flat(), ...plain.subarray(2)]);
  return { bytes, plain };
}

/** The markers of a JPEG's segments up to the image data, as 0xE1 and the like. */
function markersOf(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let cursor = 2;
  while (cursor + 4 <= bytes.length && bytes[cursor] === 0xff) {
    const marker = bytes[cursor + 1]!;
    markers.push(marker);
    if (marker === 0xda) break;
    cursor += 2 + ((bytes[cursor + 2]! << 8) | bytes[cursor + 3]!);
  }
  return markers;
}

/** From the start-of-scan marker to the end: what the pixels are made of. */
function scanOf(bytes: Uint8Array): Uint8Array {
  let cursor = 2;
  while (bytes[cursor + 1] !== 0xda) cursor += 2 + ((bytes[cursor + 2]! << 8) | bytes[cursor + 3]!);
  return bytes.subarray(cursor);
}

describe('stripJpegMetadata', () => {
  it('drops Exif with its GPS position, XMP, comments and the other APPn segments', () => {
    const { bytes, plain } = jpegWith([exifWithGps(), XMP, PHOTOSHOP, COMMENT, APP3, APP15, MPF]);
    expect(text(bytes)).toContain('GPSLatitude');

    const stripped = stripJpegMetadata(bytes);

    for (const needle of ['Exif', 'GPS', 'xmpmeta', 'Photoshop', 'taken at home', 'Meta that']) {
      expect(text(stripped)).not.toContain(needle);
    }
    expect(markersOf(stripped)).toEqual(markersOf(plain));
  });

  it('keeps the segments a decoder reads: JFIF, the ICC profile, Adobe, and every table and frame', () => {
    const { bytes, plain } = jpegWith([exifWithGps(), ICC, XMP, ADOBE, COMMENT]);

    const stripped = stripJpegMetadata(bytes);

    // Nothing but the picture's own segments, with the two kept ones where they were.
    expect(markersOf(stripped)).toEqual([
      ...markersOf(plain).slice(0, 0),
      0xe2,
      0xee,
      ...markersOf(plain),
    ]);
    expect(text(stripped)).toContain('ICC_PROFILE');
    expect(text(stripped)).toContain('Adobe');
    // The scan, and so every pixel, is the encoder's own bytes.
    expect(scanOf(stripped)).toEqual(scanOf(plain));
  });

  it('is the identity (the same array) for a file with nothing to drop', () => {
    const { plain } = jpegWith([]);
    expect(stripJpegMetadata(plain)).toBe(plain);
  });

  it('still decodes, with the size and pixels it had', async () => {
    const { bytes, plain } = jpegWith([exifWithGps(), XMP, COMMENT]);

    const stripped = await loadImage(Buffer.from(stripJpegMetadata(bytes)));
    const original = await loadImage(Buffer.from(plain));

    expect([stripped.width, stripped.height]).toEqual([12, 8]);
    const pixels = (image: typeof stripped) => {
      const canvas = createCanvas(12, 8);
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.getContext('2d').getImageData(0, 0, 12, 8).data;
    };
    expect(pixels(stripped)).toEqual(pixels(original));
  });

  it('leaves what it cannot walk as it is', () => {
    const notJpeg = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    expect(stripJpegMetadata(notJpeg)).toBe(notJpeg);
    const { bytes } = jpegWith([exifWithGps()]);
    // Cut inside the Exif segment: what is left is dropped, never extended.
    expect(() => stripJpegMetadata(bytes.slice(0, 30))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type: string, data: number[]) => [
  ...u32(data.length),
  ...ascii(type),
  ...data,
  ...u32(crc32([...ascii(type), ...data])),
];

/** The chunks of a PNG, as `[type, bytes]`. */
function chunksOf(bytes: Uint8Array): [string, Uint8Array][] {
  const found: [string, Uint8Array][] = [];
  let cursor = 8;
  while (cursor + 12 <= bytes.length) {
    const length =
      bytes[cursor]! * 0x1000000 +
      ((bytes[cursor + 1]! << 16) | (bytes[cursor + 2]! << 8) | bytes[cursor + 3]!);
    found.push([
      text(bytes.subarray(cursor + 4, cursor + 8)),
      bytes.subarray(cursor, cursor + 12 + length),
    ]);
    cursor += 12 + length;
  }
  return found;
}

const DROPPED_CHUNKS = [
  chunk('tEXt', [...ascii('Location'), 0, ...ascii('GPS 52.5200 N 13.4050 E')]),
  chunk('zTXt', [...ascii('Comment'), 0, 0, 1, 2, 3]),
  chunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('<x:xmpmeta/>')]),
  chunk('eXIf', [...ascii('MM'), ...u16(42), ...u32(8), ...ascii('GPSLatitude')]),
  chunk('tIME', [0x07, 0xea, 11, 6, 12, 30, 0]),
];
const KEPT_CHUNKS = [
  chunk('sRGB', [0]),
  chunk('gAMA', u32(45455)),
  chunk('cHRM', Array.from({ length: 8 }, (_, n) => u32(31270 + n)).flat()),
  chunk('pHYs', [...u32(2835), ...u32(2835), 1]),
];

/** A real PNG, with `extra` chunks directly after its header chunk. */
function pngWith(extra: number[][]): { bytes: Uint8Array; plain: Uint8Array } {
  const plain = new Uint8Array(canvasPicture().toBuffer('image/png'));
  const ihdrEnd = 8 + 12 + 13;
  const bytes = Uint8Array.from([
    ...plain.subarray(0, ihdrEnd),
    ...extra.flat(),
    ...plain.subarray(ihdrEnd),
  ]);
  return { bytes, plain };
}

describe('stripPngMetadata', () => {
  it('drops text, time and Exif chunks', () => {
    const { bytes, plain } = pngWith(DROPPED_CHUNKS);
    expect(text(bytes)).toContain('GPS 52.5200 N');

    const stripped = stripPngMetadata(bytes);

    for (const needle of ['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'GPS', 'xmpmeta']) {
      expect(text(stripped)).not.toContain(needle);
    }
    expect(stripped).toEqual(plain);
  });

  it('keeps colour and density chunks, and the image data chunk for chunk', () => {
    const { bytes, plain } = pngWith([
      ...DROPPED_CHUNKS.slice(0, 2),
      ...KEPT_CHUNKS,
      ...DROPPED_CHUNKS.slice(2),
    ]);

    const stripped = chunksOf(stripPngMetadata(bytes));
    const original = chunksOf(plain);

    expect(stripped.map(([type]) => type)).toEqual([
      'IHDR',
      'sRGB',
      'gAMA',
      'cHRM',
      'pHYs',
      ...original.slice(1).map(([type]) => type),
    ]);
    const idat = (chunks: [string, Uint8Array][]) => chunks.filter(([type]) => type === 'IDAT');
    expect(idat(stripped)).toEqual(idat(original));
    expect(stripped.at(-1)?.[0]).toBe('IEND');
  });

  it('is the identity (the same array) for a file with nothing to drop', () => {
    const { plain } = pngWith([]);
    expect(stripPngMetadata(plain)).toBe(plain);
  });

  it('still decodes, with the size and pixels it had', async () => {
    const { bytes, plain } = pngWith([...DROPPED_CHUNKS, ...KEPT_CHUNKS]);

    const stripped = await loadImage(Buffer.from(stripPngMetadata(bytes)));
    const original = await loadImage(Buffer.from(plain));

    expect([stripped.width, stripped.height]).toEqual([12, 8]);
    const pixels = (image: typeof stripped) => {
      const canvas = createCanvas(12, 8);
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.getContext('2d').getImageData(0, 0, 12, 8).data;
    };
    expect(pixels(stripped)).toEqual(pixels(original));
  });

  it('keeps what it cannot walk to the end, and drops what it found before', () => {
    const { bytes } = pngWith(DROPPED_CHUNKS);
    const cut = bytes.slice(0, 8 + 12 + 13 + DROPPED_CHUNKS[0]!.length + 6);
    const stripped = stripPngMetadata(cut);
    expect(text(stripped)).not.toContain('GPS');
    expect(stripped.length).toBe(8 + 12 + 13 + 6);
  });
});

// ---------------------------------------------------------------------------------------------
// Where they are applied

const dataUrl = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const SIZE = { width: 12, height: 8 };

function depsFor() {
  const reencode = vi.fn<ImageByteDeps['reencode']>(async () => ({
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    mime: 'image/jpeg',
    width: 12,
    height: 8,
  }));
  return { fetchBytes: vi.fn<ImageByteDeps['fetchBytes']>(async () => null), reencode };
}

describe('sourceFromUrl: photos', () => {
  it('hands a JPEG on without its Exif', async () => {
    const { bytes, plain } = jpegWith([exifWithGps(), XMP, COMMENT]);
    const deps = depsFor();

    const outcome = await sourceFromUrl(dataUrl('image/jpeg', bytes), SIZE, deps, false);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.source.kind !== 'bitmap') throw new Error('expected a bitmap');
    expect(outcome.source.mime).toBe('image/jpeg');
    expect(text(outcome.source.bytes)).not.toContain('GPS');
    expect(outcome.source.bytes).toEqual(plain);
    expect(deps.reencode).not.toHaveBeenCalled();
  });

  it('hands a PNG on without its text and Exif chunks', async () => {
    const { bytes, plain } = pngWith(DROPPED_CHUNKS);
    const deps = depsFor();

    const outcome = await sourceFromUrl(dataUrl('image/png', bytes), SIZE, deps, false);

    if (!outcome.ok || outcome.source.kind !== 'bitmap') throw new Error('expected a bitmap');
    expect(outcome.source.bytes).toEqual(plain);
    expect(deps.reencode).not.toHaveBeenCalled();
  });

  it('strips what a fetched photo carries, too', async () => {
    const { bytes, plain } = jpegWith([exifWithGps()]);
    const deps = depsFor();
    deps.fetchBytes.mockResolvedValue({ bytes, mime: 'image/jpeg' });

    const outcome = await sourceFromUrl('https://assets.example/photo.jpg', SIZE, deps, false);

    if (!outcome.ok || outcome.source.kind !== 'bitmap') throw new Error('expected a bitmap');
    expect(outcome.source.bytes).toEqual(plain);
  });

  it('still re-encodes a JPEG whose orientation is not 1', async () => {
    const { bytes } = jpegWith([exifWithGps(6)]);
    expect(jpegOrientation(bytes)).toBe(6);
    const deps = depsFor();

    await sourceFromUrl(dataUrl('image/jpeg', bytes), SIZE, deps, false);

    expect(deps.reencode).toHaveBeenCalledTimes(1);
    expect(deps.reencode.mock.calls[0]![1]).toBe('image/jpeg');
  });
});
