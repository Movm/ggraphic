// SPDX-License-Identifier: MPL-2.0
// GgraphicEditor uses hooks, so whatever renders it is a client component. Next.js still renders
// it on the server, where GgraphicEditor renders nothing; the editor loads after hydration.
'use client';

import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts';
import '@ggraphic/editor/styles/compiled.css';
import { GgraphicEditor, loadTemplatePack, type GgraphicDocument } from '@ggraphic/editor/embed';
import { useEffect, useState } from 'react';

import { DESIGN_KEY, type NewDesign } from './design';
import templateFiles from './templates.json';

// The parser loads in a chunk of its own, next to the editor; GgraphicEditor resolves the promise.
const templates = loadTemplatePack(templateFiles);
void templates.then(({ problems }) => {
  if (problems.length > 0) console.warn('Skipped templates', problems);
});

// This module runs on the server too, which has no localStorage.
function storedDesign(): GgraphicDocument | undefined {
  if (typeof window === 'undefined') return undefined;
  const stored = localStorage.getItem(DESIGN_KEY);
  return stored ? (JSON.parse(stored) as GgraphicDocument) : undefined;
}

const save = (doc: GgraphicDocument) => localStorage.setItem(DESIGN_KEY, JSON.stringify(doc));

export function Editor({ start }: { start: NewDesign | null }) {
  // A new design starts as one page of the chosen config; an empty `state` is seeded by it.
  // Otherwise the stored design opens. The browser reads its own initial state while hydrating,
  // and GgraphicEditor reads `document` only when the editor mounts after that, so the server's
  // value never reaches it.
  const [design] = useState<GgraphicDocument | undefined>(() =>
    start
      ? { formatId: start.formatId, pages: [{ configId: start.configId, state: {} }] }
      : storedDesign()
  );
  // Read once, like `design`: a later render must not save the first state over the edits.
  const [isNew] = useState(start !== null);
  useEffect(() => {
    if (!isNew || !design) return;
    // The new design replaces the stored one, and a reload opens it rather than a fresh copy.
    save(design);
    window.history.replaceState(null, '', '/edit');
  }, [isNew, design]);
  return (
    <GgraphicEditor brand={defaultBrand} templates={templates} document={design} onChange={save} />
  );
}
