// SPDX-License-Identifier: CC0-1.0
import { checkTemplate, type GateContext, type GateProblem } from '@ggraphic/core';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates/templateGeometry';
import { readTemplateFile } from '@ggraphic/schema';

import { OPEN_TEMPLATE_MANIFEST } from '../src/index.js';
import { testBrandPacks } from './testBrands.js';

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
    manifestPaths: new Set(OPEN_TEMPLATE_MANIFEST.assets.map((a) => a.path)),
    slots: t.slots,
    placeholderTexts: t.placeholders['en'] ?? {},
  };
  return checkTemplate(t, context);
}
