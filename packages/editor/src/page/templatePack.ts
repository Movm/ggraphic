// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Templates as data: template files (the `@ggraphic/schema` format) become editor templates.
 * Every template is a free page (`createPageConfig`) seeded with its file, so a host registers its
 * pack with `registerTemplates(...pack.definitions)` and writes no config of its own.
 */
import { readTemplateFile, type TemplateFile } from '@ggraphic/schema';

import { type FullCanvasConfig } from '../configs/types.js';
import { defineTemplate, type TemplateDefinition } from '../templates/registry.js';

import { type PageActions } from './actions.js';
import { createPageConfig } from './config.js';
import { type PageState } from './pageState.js';
import { seedFromTemplate } from './seeds.js';
import { type TemplateLookup } from './slotBudgets.js';

/** A file of the pack that was not loaded, and why. */
export interface TemplatePackProblem {
  id: string | null;
  reason: string;
}

export interface TemplatePack {
  /** The pack's templates, in file order; blocks are not pages and are left out. */
  templates: TemplateFile[];
  /** One editor template per entry of `templates`, under the template's id. */
  definitions: TemplateDefinition<string, FullCanvasConfig<PageState, PageActions>>[];
  /** The pack as a lookup, for slot budgets (`CanvasEditorServices.slotBudgets`). */
  templateOf: TemplateLookup;
  /** Files that do not read, are newer than this editor, or repeat an id. */
  problems: TemplatePackProblem[];
}

const idOf = (raw: unknown): string | null =>
  typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
    ? (raw as { id: string }).id
    : null;

/**
 * The template files in `json` (an array of files, or one file) as a pack. A file that does not
 * read is reported and skipped, never half-loaded; the first of a duplicate id wins.
 */
export function templatePackFromJson(json: unknown): TemplatePack {
  const files = Array.isArray(json) ? (json as unknown[]) : [json];
  const templates: TemplateFile[] = [];
  const problems: TemplatePackProblem[] = [];
  const byId = new Map<string, TemplateFile>();
  const seen = new Set<string>();

  for (const raw of files) {
    const read = readTemplateFile(raw);
    if (read.status !== 'ok') {
      const reason =
        read.status === 'invalid'
          ? read.reason
          : `written by a newer version (${read.scope} ${read.version})`;
      problems.push({ id: idOf(raw), reason });
      continue;
    }
    const template = read.template;
    if (seen.has(template.id)) {
      problems.push({ id: template.id, reason: 'duplicate id: the first one is kept' });
      continue;
    }
    seen.add(template.id);
    if (template.kind !== 'template') continue;
    byId.set(template.id, template);
    templates.push(template);
  }

  const templateOf: TemplateLookup = (id) => byId.get(id) ?? null;
  const definitions = templates.map((template) =>
    defineTemplate({
      id: template.id,
      load: (formatId?: string) =>
        Promise.resolve(
          createPageConfig({
            id: template.id,
            formatId,
            seedFor: (width, height) => seedFromTemplate(template, width, height),
            templateOf,
          })
        ),
    })
  );
  return { templates, definitions, templateOf, problems };
}
