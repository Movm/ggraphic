// SPDX-License-Identifier: MIT
import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts';
import '@ggraphic/editor/styles/compiled.css';
import { GgraphicEditor, loadTemplatePack, type GgraphicDocument } from '@ggraphic/editor/embed';

import templateFiles from './templates.json';

// The parser loads in a chunk of its own, next to the editor; GgraphicEditor resolves the promise.
const templates = loadTemplatePack(templateFiles);
void templates.then(({ problems }) => {
  if (problems.length > 0) console.warn('Skipped templates', problems);
});

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
