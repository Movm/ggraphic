// SPDX-License-Identifier: MPL-2.0
/** Text measuring, wrapping and fitting, stripping inline marks, font loading and font aliases. */
export {
  measureTextWidthWithFont,
  runFont,
  runMeasurer,
  type TextAccent,
  type TextMarker,
  wrapText,
  wrapTextAccurate,
  type MeasureWidth,
} from '../utils/textUtils.js';
export { ensureFontsReady } from '../utils/ensureFontsReady.js';
export { aliasFontFamily, resolveFontFamily, FONT_FAMILY_ALIASES } from '../utils/fontAliases.js';
export { wrapWords, balancedWrap, largestSizeWordsFit } from '../composer/textFit.js';
export { stripMarks } from '../composer/marks.js';
