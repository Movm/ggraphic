// SPDX-License-Identifier: MPL-2.0
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { zipPageImages } from '@ggraphic/editor/utils/zipPageImages';

const png = (bytes: number[]) => `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;

describe('zipPageImages', () => {
  it('stores each page under page-N with its bytes intact', async () => {
    const zip = zipPageImages([png([1, 2, 3]), 'data:image/jpeg;base64,/9g=']);

    expect(zip.type).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['page-1.png', 'page-2.jpg']);
    expect([...entries['page-1.png']]).toEqual([1, 2, 3]);
    expect([...entries['page-2.jpg']]).toEqual([0xff, 0xd8]);
  });

  it('names the page it cannot pack instead of shipping a short ZIP', () => {
    expect(() => zipPageImages([png([1]), 'data:image/bmp;base64,Qk0='])).toThrow('Seite 2');
    expect(() => zipPageImages([png([1]), 'kein data url'])).toThrow('Seite 2');
  });
});
