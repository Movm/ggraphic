// SPDX-License-Identifier: MPL-2.0
import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts';
import '@ggraphic/editor/styles/compiled';
import {
  GgraphicEditor,
  templatePackFromJson,
  type GgraphicDocument,
} from '@ggraphic/editor/embed';

import templateFiles from './templates.json';

const templates = templatePackFromJson(templateFiles);
if (templates.problems.length > 0) console.warn('Skipped templates', templates.problems);

const stored = localStorage.getItem('design');
const design = stored ? (JSON.parse(stored) as GgraphicDocument) : undefined;
const save = (doc: GgraphicDocument) => localStorage.setItem('design', JSON.stringify(doc));

export function App() {
  return (
    <>
      <header className="host-bar">
        <h1>My host app</h1>
      </header>
      {/* The editor fills this box, below the host's own bar. */}
      <main className="editor">
        <GgraphicEditor
          brand={defaultBrand}
          templates={templates}
          document={design}
          onChange={save}
        />
      </main>
    </>
  );
}
