// SPDX-License-Identifier: CC0-1.0
import { checkTemplate, type GateContext, type GateProblem } from '@ggraphic/core';
import { GOPHERS } from '@ggraphic/editor/illustrations/gophers';
import { HUMAAANS } from '@ggraphic/editor/illustrations/humaaans';
import { ILLLUSTRATIONS } from '@ggraphic/editor/illustrations/illlustrations';
import { KAWAII_ILLUSTRATIONS } from '@ggraphic/editor/illustrations/kawaii';
import { OPENDOODLES } from '@ggraphic/editor/illustrations/opendoodles';
import { OPENPEEPS } from '@ggraphic/editor/illustrations/openpeeps';
import { TRANSHUMANS } from '@ggraphic/editor/illustrations/transhumans';
import { createTemplateGateAdapter, illustrationLookup } from '@ggraphic/editor/templates';
import { readTemplateFile } from '@ggraphic/schema';

import { OPEN_TEMPLATE_MANIFEST } from '../src/index.js';
import { testBrandPacks } from './testBrands.js';

/**
 * Assets a template of the open pack may name by id: sets under CC0, MIT, ISC or Apache-2.0
 * (the icon sets' licences are read from their `info.json`; the illustration sets' from the
 * header of their module). CC BY sets such as gophers are out: a template carries no
 * attribution. Stickers and emoji are not allowed at all, and neither are stored external SVG
 * copies (they cannot be checked against their set offline). Kawaii is MIT through
 * react-kawaii's LICENSE. Gophers stay out: the pack's README says CC0, but the character
 * derives from the Go mascot (CC BY 3.0); opendoodles is not allowed until its licence is checked.
 */
const OPEN_ALLOWED_ASSETS = {
  icon: ['bi:', 'flowbite:', 'heroicons:', 'iconoir:', 'lucide:', 'ri:', 'tabler:'],
  illustration: ['kawaii:', 'illlustrations:', 'openpeeps:'],
};

/** The renderer's lookup over every set (kawaii first, as the registry lists them). */
const ADAPTER = createTemplateGateAdapter(
  illustrationLookup([
    ...KAWAII_ILLUSTRATIONS,
    ...GOPHERS,
    ...HUMAAANS,
    ...ILLLUSTRATIONS,
    ...OPENDOODLES,
    ...OPENPEEPS,
    ...TRANSHUMANS,
  ])
);

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
    adapter: ADAPTER,
    allowedAssets: OPEN_ALLOWED_ASSETS,
    manifestPaths: new Set(OPEN_TEMPLATE_MANIFEST.assets.map((a) => a.path)),
    slots: t.slots,
    placeholderTexts: t.placeholders['en'] ?? {},
  };
  return checkTemplate(t, context);
}
