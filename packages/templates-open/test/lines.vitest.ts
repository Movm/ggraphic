// Copy into packages/templates-open/test/ to use; do not commit. For every template of a family,
// brand, margin extreme and locale it prints the slots whose text wraps onto more lines than the
// slot's maxLines, measured with the editor's own width tables (the gate's measure).
// Stage 2 (the browser) fails on exactly those, so run this before pushing a family.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { instantiateTemplatePage } from '@ggraphic/core';
import { createTemplateGateAdapter, illustrationLookup } from '@ggraphic/editor/templates/templateGeometry';
import { readTemplateFile } from '@ggraphic/schema';
import { OPEN_TEMPLATES } from '../src/index.js';
import { testBrandPacks } from './testBrands.js';
const FAMILY_PREFIX = process.env.PREFIX ?? 'studio-event';
it('lines', () => {
  const adapter = createTemplateGateAdapter(illustrationLookup([]));
  const out = new Map<string, Set<string>>();
  for (const raw of OPEN_TEMPLATES as any[]) {
    if (!raw.id.startsWith(FAMILY_PREFIX)) continue;
    const r = readTemplateFile(raw); if (r.status !== 'ok') throw new Error('x');
    for (const brand of testBrandPacks()) for (const margin of [0.04, 0.09, 0.12]) for (const loc of ['en', 'de']) {
      const res = instantiateTemplatePage(r.template as any, { brand: { ...brand, layout: { margin, logoCorner: 'bottom-right', logoMaxWidth: 0.22, logoMaxHeight: 0.08 } } as any, canvas: { width: 1080, height: 1350 }, format: '4:5', geometry: adapter.geometry, locale: loc, logoSizeOf: () => ({ width: 400, height: 100 }) });
      if (!res.ok) throw new Error(res.reason);
      for (const el of (res.state as any).additionalTexts) {
        const slot = r.template.slots[el.id]; if (!slot) continue;
        const lines = adapter.lineCount('additionalTexts', el);
        if (lines > (slot.budget.maxLines ?? 1)) {
          const k = `${raw.id} ${el.id} ${loc}: ${lines} lines > max ${slot.budget.maxLines ?? 1}`;
          if (!out.has(k)) out.set(k, new Set());
          out.get(k)!.add(`${brand.name}@${margin}`);
        }
      }
    }
  }
  writeFileSync('/private/tmp/claude-501/lines.txt', [...out].map(([k, v]) => `${k}  ${[...v].join(' ')}`).join('\n') + '\n');
});
