// SPDX-License-Identifier: MIT
/**
 * A server that does not bundle its dependencies (plain Node, or Vite's SSR, which leaves
 * node_modules external) loads the embed entry as published. It must import there and render
 * nothing. The start page's server entries, `host` and `page`, must import there too and offer a
 * template for every format. Next.js bundles them instead; the server HTML is checked in
 * tests/ssr.spec.ts.
 */
import { defaultBrand } from '@ggraphic/brand-default';
import { GgraphicEditor, loadTemplatePack } from '@ggraphic/editor/embed';
import { canvasFormats } from '@ggraphic/editor/host';
import { aspectOfSize, templatePackFromJson } from '@ggraphic/editor/page';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import templateFiles from '../app/templates.json' with { type: 'json' };

const templates = loadTemplatePack(templateFiles);
const html = renderToString(createElement(GgraphicEditor, { brand: defaultBrand, templates }));
if (html !== '') throw new Error(`Expected no server markup, got: ${html}`);

// The parser's chunk resolves from the published files too.
const { problems } = await templates;
if (problems.length > 0) throw new Error(`Skipped templates: ${JSON.stringify(problems)}`);
console.log('@ggraphic/editor/embed imports in Node and renders nothing on the server.');

// The start page's data, as app/catalog.ts reads it.
const pack = templatePackFromJson(templateFiles);
for (const format of canvasFormats()) {
  const aspect = aspectOfSize(format.width, format.height);
  if (!pack.templates.some((template) => template.formats.includes(aspect))) {
    throw new Error(`No template for ${format.id} (${aspect})`);
  }
}
console.log(`@ggraphic/editor/host and /page import in Node: ${pack.templates.length} templates.`);
