// SPDX-License-Identifier: MPL-2.0
/**
 * A server that does not bundle its dependencies (plain Node, or Vite's SSR, which leaves
 * node_modules external) loads the embed entry as published. It must import there and render
 * nothing. Next.js bundles it instead; the server HTML is checked in tests/ssr.spec.ts.
 */
import { defaultBrand } from '@ggraphic/brand-default';
import { GgraphicEditor, loadTemplatePack } from '@ggraphic/editor/embed';
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
