// SPDX-License-Identifier: MPL-2.0

/**
 * The chart element's data shape. It lives in `@ggraphic/core`; this module hands it out under
 * its old path, so types that name a chart (base state, layer list, lifted blocks) need not
 * import `chartUtils.ts`, which reads the brand theme for its palettes.
 */

export {
  type ChartDataPoint,
  type ChartInstance,
  type ChartLegendPosition,
  type ChartSeries,
  type ChartType,
} from '@ggraphic/core';
