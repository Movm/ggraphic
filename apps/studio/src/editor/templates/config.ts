// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Studio's templates as editor configs: every one is the package's free page
 * (`createPageConfig`), seeded with its catalogue template.
 */
import { createPageConfig } from '@ggraphic/editor/page/config';
import { defineTemplate, registerTemplates } from '@ggraphic/editor/templates/registry';

import { templateFileOf } from './catalog';
import { STUDIO_TEMPLATE_IDS, type StudioTemplateId } from './ids';
import { seedFor } from './seeds';

export function createStudioConfig(templateId: StudioTemplateId, formatId: string | undefined) {
  return createPageConfig({
    id: templateId,
    formatId,
    seedFor: (width, height) => seedFor(templateId, width, height),
    templateOf: templateFileOf,
  });
}

// Module-level, so registering again is the registry's no-op instead of a duplicate id.
const STUDIO_TEMPLATES = STUDIO_TEMPLATE_IDS.map((id) =>
  defineTemplate({ id, load: (formatId) => Promise.resolve(createStudioConfig(id, formatId)) })
);

/** Puts the Studio templates into the editor's registry; call before rendering. */
export function registerStudioTemplates(): void {
  registerTemplates(...STUDIO_TEMPLATES);
}
