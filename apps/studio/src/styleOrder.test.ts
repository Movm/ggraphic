// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('stylesheet order in main.tsx', () => {
  it('loads the kit bridge after the editor defaults, so the editor chrome follows the kit', () => {
    // Both declare --editor-* in :where(:root): with equal specificity the later file wins, and
    // the editor's blue defaults would paint the top bar, accents and selections.
    const main = readFileSync(path.join(import.meta.dirname, 'main.tsx'), 'utf8');
    const editor = main.indexOf("import '@ggraphic/editor/styles';");
    const bridge = main.indexOf("import '@ggraphic/ui/editor-bridge.css';");
    expect(editor).toBeGreaterThanOrEqual(0);
    expect(bridge).toBeGreaterThan(editor);
  });
});
