// SPDX-License-Identifier: AGPL-3.0-only
/** The generic page model: page config and actions, page state, seeds, template placement, template packs, typography, fitting and logo size. */
export { createPageConfig, type PageConfigOptions } from '../page/config.js';
export { createPageActions, type PageActions } from '../page/actions.js';
export { pageStateFrom, type PageGroup, type PageState, type PageSeed } from '../page/pageState.js';
export { aspectOfSize, seedFromTemplate, storedPageSeed } from '../page/seeds.js';
export { placeTemplate } from '../page/instantiate.js';
export {
  templatePackFromJson,
  type TemplatePackProblem,
  type TemplatePack,
} from '../page/templatePack.js';
export { slotBudgetFor, type TemplateLookup, noTemplates } from '../page/slotBudgets.js';
export {
  headlineFont,
  bodyFont,
  quoteFont,
  fontFallbackFor,
  fontStackFor,
  scaleFor,
} from '../page/typography.js';
export { fittedFontSize } from '../page/fitting.js';
export { withHuggedPlates, HUG_ADAPTER } from '../page/hug.js';
export { rememberLogoSize, logoSizeOf, measureLogo } from '../page/logoSize.js';
export { type TextPreview } from '../hooks/useCanvasElementHandlers.js';
