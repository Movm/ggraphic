// SPDX-License-Identifier: AGPL-3.0-only
/** Brand packs: registering them, the active brand, the brand of the open document and the glow a registered ground is drawn with. */
export { activeBrand, registerBrandPacks, registeredBrands } from '../brand/brandRegistry.js';
export { useDocumentBrand, DocumentBrandContext } from '../brand/documentBrand.js';
export { surfaceGlow } from '../utils/surfaceGlow.js';
