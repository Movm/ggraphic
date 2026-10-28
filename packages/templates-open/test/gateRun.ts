// SPDX-License-Identifier: CC0-1.0
import { checkTemplate, type GateContext, type GateProblem } from '@ggraphic/core';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates/templateGeometry';
import { readTemplateFile } from '@ggraphic/schema';

import { OPEN_TEMPLATE_MANIFEST } from '../src/index.js';
import { testBrandPacks } from './testBrands.js';

/**
 * Assets a template of the open pack may name by id: sets under CC0, MIT, ISC or Apache-2.0
 * (the icon sets' licences are read from their `info.json`; the illustration sets' from the
 * header of their module). CC BY sets such as gophers are out: a template carries no
 * attribution. Stickers and emoji are not allowed at all.
 */
const OPEN_ALLOWED_ASSETS = {
  icon: ['bi:', 'flowbite:', 'heroicons:', 'iconoir:', 'lucide:', 'ri:', 'tabler:'],
  illustration: ['kawaii:', 'illlustrations:', 'openpeeps:'],
};

export const CANVASES = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
} as const;

/** Reads a raw template file and runs stage 1; a file that does not read is one `schema` problem. */
export function checkFile(raw: unknown): GateProblem[] {
  const read = readTemplateFile(raw);
  const id =
    typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
      ? (raw as { id: string }).id
      : '(no id)';
  if (read.status !== 'ok') {
    const detail = read.status === 'invalid' ? read.reason : `newer ${read.scope} ${read.version}`;
    return [{ rule: 'schema', templateId: id, detail }];
  }
  const t = read.template;
  const context: GateContext = {
    brands: testBrandPacks(),
    canvases: CANVASES,
    adapter: TEMPLATE_GATE_ADAPTER,
    allowedAssets: OPEN_ALLOWED_ASSETS,
    manifestPaths: new Set(OPEN_TEMPLATE_MANIFEST.assets.map((a) => a.path)),
    slots: t.slots,
    placeholderTexts: t.placeholders['en'] ?? {},
  };
  return checkTemplate(t, context);
}
