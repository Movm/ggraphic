// copy into packages/templates-open/test/, do not commit. PREFIX=studio-quote
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { OPEN_TEMPLATES } from '../src/index.js';
import { checkFile } from './gateRun.js';
it('summ', () => {
  const pre = process.env.PREFIX ?? '';
  const m = new Map<string, Set<string>>();
  for (const raw of OPEN_TEMPLATES as any[]) {
    if (!raw.id.startsWith(pre)) continue;
    for (const p of checkFile(raw)) {
      const k = `${p.templateId} [${p.rule}] ${String(p.detail).replace(/ under #[0-9a-f]{6}/g, '').replace(/\(layout margin [^,]*,/, '(').replace(/#[0-9a-f]{6}/g, '#').replace(/margin \d\.\d+/, '')}`;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(`${p.brand}/${p.scheme}`);
    }
  }
  writeFileSync('/private/tmp/claude-501/summ.txt', [...m].map(([k, v]) => `${k}  <${v.size}: ${[...v].slice(0, 3).join(' ')}>`).join('\n') + '\n');
});
