// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Studio's template ids. They are stored in every project document, so an
 * id is never renamed or reused for another design.
 */
export const BLANK_TEMPLATE_ID = 'studio-blank';
export const HEADLINE_TEMPLATE_ID = 'studio-headline';
export const QUOTE_TEMPLATE_ID = 'studio-quote';
export const NUMBER_TEMPLATE_ID = 'studio-number';

/** The one page config every page uses: a template is page content, not a config. */
export const FREE_PAGE_CONFIG_ID = BLANK_TEMPLATE_ID;

export const STUDIO_TEMPLATE_IDS = [
  BLANK_TEMPLATE_ID,
  HEADLINE_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
] as const;

export type StudioTemplateId = (typeof STUDIO_TEMPLATE_IDS)[number];

export function isStudioTemplateId(id: string): id is StudioTemplateId {
  return (STUDIO_TEMPLATE_IDS as readonly string[]).includes(id);
}
