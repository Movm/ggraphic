// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `chart.colors` is document data, and the chart SVG is marked trusted for export, so it is
 * inlined into an exported SVG without being sanitised. A colour like
 * `url(https://tracker/x.svg#a)` would make that SVG load an external resource, so only colours
 * `isSafeColor` accepts reach the SVG.
 */
import { brandDefault } from '@ggraphic/core';
import { render } from '@testing-library/react';
import * as recharts from 'recharts';
import { describe, expect, it } from 'vitest';

import { buildChartElement } from '../ChartPrimitive.js';
import { type ChartInstance, createChartInstance } from '../../utils/chartUtils.js';

const UNSAFE = 'url(https://tracker.example/x.svg#a)';
const RED = '#ff0000';

const chartOf = (chartType: ChartInstance['chartType'], extra: Partial<ChartInstance> = {}) => ({
  ...createChartInstance(chartType, 600, 400),
  data: [
    { name: 'Eins', value: 60 },
    { name: 'Zwei', value: 40 },
  ],
  // Two series, so a cartesian chart draws with both colours; a round one uses one per slice.
  series: [
    { name: 'A', values: [60, 40] },
    { name: 'B', values: [20, 80] },
  ],
  colors: [UNSAFE, RED],
  showLegend: true,
  ...extra,
});

describe('ChartPrimitive: unsafe colours', () => {
  it.each(['bar', 'bar-horizontal', 'line', 'area', 'pie', 'donut'] as const)(
    'keeps an external reference out of a %s chart and keeps the safe colour',
    (chartType) => {
      const { container } = render(buildChartElement(recharts, chartOf(chartType)));
      expect(container.innerHTML).not.toContain('url(http');
      expect(container.innerHTML).not.toContain('tracker');
      expect(container.innerHTML.toLowerCase()).toContain(RED);
    }
  );

  it('keeps it out of the outline derived from the colours', () => {
    const chart = chartOf('bar', { background: '#ffffff' });
    const { container } = render(buildChartElement(recharts, chart));
    expect(container.innerHTML).not.toContain('url(http');
  });

  it('replaces the colour with the brand chart colour of the same slot', () => {
    const { container } = render(buildChartElement(recharts, chartOf('pie')));
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toContain(brandDefault.chart[0]);
  });
});
