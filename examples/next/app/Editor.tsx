// SPDX-License-Identifier: MPL-2.0
// GgraphicEditor uses hooks, so whatever renders it is a client component. Next.js still renders
// it on the server, where GgraphicEditor renders nothing; the editor loads after hydration.
'use client';

import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts';
import '@ggraphic/editor/styles/compiled.css';
import { GgraphicEditor, loadTemplatePack, type GgraphicDocument } from '@ggraphic/editor/embed';
import { useState } from 'react';

import templateFiles from './templates.json';

// The parser loads in a chunk of its own, next to the editor; GgraphicEditor resolves the promise.
const templates = loadTemplatePack(templateFiles);
void templates.then(({ problems }) => {
  if (problems.length > 0) console.warn('Skipped templates', problems);
});

// This module runs on the server too, which has no localStorage.
function storedDesign(): GgraphicDocument | undefined {
  if (typeof window === 'undefined') return undefined;
  const stored = localStorage.getItem('design');
  return stored ? (JSON.parse(stored) as GgraphicDocument) : undefined;
}

const save = (doc: GgraphicDocument) => localStorage.setItem('design', JSON.stringify(doc));

export function Editor() {
  // The browser reads its own initial state while hydrating, and GgraphicEditor reads `document`
  // only when the editor mounts after that, so the server's `undefined` never reaches it.
  const [design] = useState(storedDesign);
  return (
    <GgraphicEditor brand={defaultBrand} templates={templates} document={design} onChange={save} />
  );
}
