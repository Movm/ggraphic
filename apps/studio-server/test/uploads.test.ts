// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { detectImageType, parseStoredName, randomFileName } from '../src/uploads.ts';
import { PNG_1X1 } from './helpers.ts';

const bytes = (...b: number[]) => Buffer.from(b);
const text = (s: string) => Buffer.from(s, 'utf8');

describe('detectImageType', () => {
  it.each([
    ['png', PNG_1X1],
    ['jpg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)],
    ['gif', text('GIF89a\x01\x00')],
    ['webp', Buffer.concat([text('RIFF'), bytes(0, 0, 0, 0), text('WEBPVP8 ')])],
    ['avif', Buffer.concat([bytes(0, 0, 0, 0x1c), text('ftypavif'), bytes(0, 0, 0, 0)])],
    ['svg', text('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['svg', text('\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n<svg width="1">')],
  ])('detects %s', (ext, buf) => {
    expect(detectImageType(buf)).toBe(ext);
  });

  it.each([
    ['empty', Buffer.alloc(0)],
    ['html', text('<!doctype html><html><script>alert(1)</script>')],
    ['html pretending to be svg later', text('<html><svg></svg></html>')],
    ['pdf', text('%PDF-1.7')],
    ['truncated png', PNG_1X1.subarray(0, 4)],
    ['zip', bytes(0x50, 0x4b, 0x03, 0x04)],
    ['svgz-like prefix word', text('<svgfoo>')],
  ])('rejects %s', (_name, buf) => {
    expect(detectImageType(buf)).toBeNull();
  });
});

describe('stored file names', () => {
  it('generates names that parse back', () => {
    const name = randomFileName('webp');
    expect(name).toMatch(/^[0-9a-f]{32}\.webp$/);
    expect(parseStoredName(name)).toBe('webp');
    expect(randomFileName('webp')).not.toBe(name);
  });

  it.each([
    '../etc/passwd',
    '..%2F..%2Fsecret',
    `${'a'.repeat(32)}.html`,
    `${'a'.repeat(32)}.png/../x`,
    `${'A'.repeat(32)}.png`,
    '.hidden.png',
    `${'a'.repeat(31)}.png`,
  ])('rejects %s', (name) => {
    expect(parseStoredName(name)).toBeNull();
  });
});
