// SPDX-License-Identifier: AGPL-3.0-only
// The colour of an icon comes from the document and lands inside SVG markup that an export
// inlines as it is (`trustedSvgImages.ts`). It must not be able to write markup.
import { describe, expect, it } from 'vitest';

import { generateIconDataUrl } from './canvasIcons.js';

const HOSTILE = '#336699" onload="alert(1)"><script>alert(2)</script><rect fill="';

const decode = (dataUrl: string) =>
  decodeURIComponent(escape(atob(dataUrl.replace('data:image/svg+xml;base64,', ''))));

describe('a hostile icon colour', () => {
  it('cannot write markup into a generated icon', async () => {
    const url = await generateIconDataUrl('tabler:x', 64, HOSTILE);

    const svg = decode(url!);
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/onload|<script/);
  });

  it('still colours an icon with a colour that is one', async () => {
    const url = await generateIconDataUrl('tabler:x', 64, '#123456');

    expect(decode(url!)).toContain('#123456');
  });
});
