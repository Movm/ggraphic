// SPDX-License-Identifier: MPL-2.0
/**
 * A server that does not bundle its dependencies (plain Node, or Vite's SSR, which leaves
 * node_modules external) loads the embed entry as published. It must import there and render
 * nothing. Next.js bundles it instead; the server HTML is checked in tests/ssr.spec.ts.
 */
import { defaultBrand } from '@ggraphic/brand-default';
import { GgraphicEditor, templatePackFromJson } from '@ggraphic/editor/embed';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import templateFiles from '../app/templates.json' with { type: 'json' };

const templates = templatePackFromJson(templateFiles);
if (templates.problems.length > 0) {
  throw new Error(`Skipped templates: ${JSON.stringify(templates.problems)}`);
}

const html = renderToString(createElement(GgraphicEditor, { brand: defaultBrand, templates }));
if (html !== '') throw new Error(`Expected no server markup, got: ${html}`);
console.log('@ggraphic/editor/embed imports in Node and renders nothing on the server.');
