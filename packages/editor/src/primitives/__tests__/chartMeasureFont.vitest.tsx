// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The legend and the category axis are sized by measured labels. A label is measured in the
 * font-family the chart SVG declares, so it is measured in the font it is drawn in: a brand
 * font wider than the system sans gets a wider legend column and category axis, not a clipped one.
 */
import { render } from '@testing-library/react';
import * as recharts from 'recharts';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createChartInstance } from '../../utils/chartUtils.js';
import { chartFontFamily, SANS } from '../chartFont.js';
import { buildChartElement, renderChartImage } from '../ChartPrimitive.js';

const WIDE = 'Wide Brand';
const WIDE_FAMILY = `"${WIDE}", sans-serif`;
const CSS = '@font-face{font-family:"Wide Brand"}';

/** A canvas that sets text 12 px a character in the brand font and 8 px in anything else. */
const measured: string[] = [];
let onMeasure: () => void = () => {};
const canvas = {
  font: '',
  measureText(text: string) {
    measured.push(this.font);
    onMeasure();
    return { width: text.length * (this.font.includes(WIDE) ? 12 : 8) };
  },
};

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    canvas as unknown as CanvasRenderingContext2D
  );
  // The chart is rendered by a root of its own, outside `act`.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  return () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  };
});

const NAMES = [
  { name: 'Wärmepumpe', value: 12 },
  { name: 'Gas', value: 41 },
];
const chartOf = (chartType: 'pie' | 'bar-horizontal') => ({
  ...createChartInstance(chartType, 600, 320),
  data: NAMES,
  showLegend: chartType === 'pie',
});

/** x of the first legend entry: where its swatch's group is moved to. */
const legendX = (container: HTMLElement) =>
  /translate\(([\d.]+),/.exec(
    container.querySelector('rect[width="14"]')!.parentElement!.getAttribute('transform') ?? ''
  )?.[1];
const categoryAxisWidth = (container: HTMLElement) =>
  Number(
    container
      .querySelector('text.recharts-cartesian-axis-tick-value[orientation="left"]')
      ?.getAttribute('width')
  );

describe('chart labels are measured in the family the chart declares', () => {
  it('sizes the legend column by the brand font', () => {
    const chart = chartOf('pie');
    const plain = render(buildChartElement(recharts, chart, SANS)).container;
    // A swatch's 22 px and the longest name, 10 characters × 8 px, make 102; the column is 12 more.
    expect(legendX(plain)).toBe(String(chart.width - (22 + 10 * 8 + 12) + 8));
    const brand = render(buildChartElement(recharts, chart, WIDE_FAMILY)).container;
    expect(legendX(brand)).toBe(String(chart.width - (22 + 10 * 12 + 12) + 8));
  });

  it('sizes the category axis by the brand font', () => {
    const plain = render(buildChartElement(recharts, chartOf('bar-horizontal'), SANS)).container;
    expect(categoryAxisWidth(plain)).toBe(10 * 8 + 12);
    const brand = render(
      buildChartElement(recharts, chartOf('bar-horizontal'), WIDE_FAMILY)
    ).container;
    expect(categoryAxisWidth(brand)).toBe(10 * 12 + 12);
  });

  it('measures in sans-serif, as before, where no chart font is given', () => {
    measured.length = 0;
    render(buildChartElement(recharts, chartOf('pie')));
    expect(new Set(measured)).toEqual(new Set(['13px sans-serif']));
  });
});

describe('renderChartImage: measure and draw use one family', () => {
  const RealImage = window.Image;
  let sources: string[] = [];
  class CapturingImage {
    onload: (() => void) | null = null;
    set src(value: string) {
      sources.push(value);
      queueMicrotask(() => this.onload?.());
    }
  }
  const rootFamily = () => {
    const src = sources.at(-1)!;
    const xml = decodeURIComponent(src.slice(src.indexOf(',') + 1));
    return new DOMParser()
      .parseFromString(xml, 'image/svg+xml')
      .documentElement.getAttribute('font-family');
  };
  afterEach(() => {
    window.Image = RealImage;
    sources = [];
    delete (document as { fonts?: unknown }).fonts;
  });
  const draw = (font: { family: string; css: string | null }) => {
    measured.length = 0;
    window.Image = CapturingImage as unknown as typeof Image;
    return renderChartImage(chartOf('pie'), font);
  };

  it('declares what it measured with when the font resolved', async () => {
    const font = { family: WIDE, css: CSS };
    await draw(font);
    expect(chartFontFamily(font)).toBe(WIDE_FAMILY);
    expect(rootFamily()).toBe(WIDE_FAMILY);
    expect(new Set(measured)).toEqual(new Set([`13px ${WIDE_FAMILY}`]));
  });

  it('declares and measures sans-serif when no font file resolved', async () => {
    await draw({ family: WIDE, css: null });
    expect(rootFamily()).toBe('sans-serif');
    expect(new Set(measured)).toEqual(new Set(['13px sans-serif']));
  });

  it('measures after the page’s fonts are loaded', async () => {
    let loaded = false;
    const face = {
      load: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        loaded = true;
      },
    };
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), [Symbol.iterator]: () => [face][Symbol.iterator]() },
    });
    const loadedAtMeasure: boolean[] = [];
    onMeasure = () => loadedAtMeasure.push(loaded);
    try {
      await draw({ family: WIDE, css: CSS });
    } finally {
      onMeasure = () => {};
    }
    expect(loadedAtMeasure.length).toBeGreaterThan(0);
    expect(loadedAtMeasure.every(Boolean)).toBe(true);
  });
});
