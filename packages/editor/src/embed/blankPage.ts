// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The page config of an empty page. `GgraphicEditor` registers it next to the pack's templates; a
 * host starts a blank design with `pages: [{ configId: BLANK_PAGE_ID, state: {} }]`. Its own module,
 * free of imports, so the React-free host entry can carry it to a server component.
 */
export const BLANK_PAGE_ID = 'ggraphic-blank';
