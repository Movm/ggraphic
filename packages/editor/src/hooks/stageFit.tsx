// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext, useEffect, useState } from 'react';

/** The largest size a page's stage may take, in CSS px at zoom 100 %. */
export interface StageFit {
  width: number;
  height: number;
}

const StageFitContext = createContext<StageFit | null>(null);

/** Set by the editor shell; the pages inside fit their stage to it. */
export const StageFitProvider = StageFitContext.Provider;

/** The measured fit, or `null` (previews, a canvas outside the editor). */
export function useStageFit(): StageFit | null {
  return useContext(StageFitContext);
}

/** The pixel value of a computed length (`12px` → 12). */
const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * The part of the canvas area a page can use without anything covering it: the scrolling main
 * column, minus what sits above the first stage (context bar slot, padding, page toolbar), the
 * bottom bar and a gap above it as wide as the gap above the page (canvas and container padding). Every value is laid out by the
 * editor, never by the stage itself, so a stage that grows or shrinks to the result measures the
 * same result again. Layout sizes (`offset*`, `client*`), not rects: the zoom scales the pages
 * container, and the fit is the size at 100 %.
 */
export function measureStageFit(container: HTMLElement): StageFit | null {
  const main = container.closest<HTMLElement>('.canvas-editor-layout__main');
  const page = container.querySelector<HTMLElement>('.heterogeneous-multipage__page-wrapper');
  const stage = page?.querySelector<HTMLElement>('.canvas-stage-container');
  if (!main || !page || !stage) return null;
  const bar = container
    .closest('.canvas-editor-layout')
    ?.querySelector<HTMLElement>('.canvas-editor-layout__bottom-bar');

  const style = getComputedStyle(container);
  const canvas = container.closest<HTMLElement>('.canvas-editor-layout__canvas');
  const gap = px(style.paddingTop) + (canvas ? px(getComputedStyle(canvas).paddingTop) : 0);
  // The container's top edge stays put under the zoom (`transform-origin: top center`).
  const above =
    container.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
  const pageChrome = page.offsetHeight - stage.offsetHeight;

  const width = container.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
  // `above` already holds the gap over the page; the same gap again over the bottom bar.
  const height =
    main.clientHeight - above - px(style.paddingTop) - pageChrome - (bar?.offsetHeight ?? 0) - gap;
  if (width <= 0 || height <= 0) return null;
  return { width: Math.floor(width), height: Math.floor(height) };
}

/**
 * Measures `measureStageFit` for the pages container while `enabled`, and again on every resize.
 * While `hold`, the last fit stays and nothing is measured: an open mobile sheet takes space from
 * the main column and shifts the pages, and `useMobileSheetFit` already scales them into what is left.
 */
export function useMeasuredStageFit(container: HTMLElement | null, enabled: boolean, hold = false) {
  const [fit, setFit] = useState<StageFit | null>(null);

  useEffect(() => {
    if (!enabled || !container) {
      setFit(null);
      return undefined;
    }
    if (hold) return undefined;
    const update = () => {
      const next = measureStageFit(container);
      setFit((prev) =>
        prev?.width === next?.width && prev?.height === next?.height ? prev : next
      );
    };
    update();
    const observer = new ResizeObserver(update);
    // The container resizes with its pages (a page appearing, a toolbar showing); the main column
    // and the bottom bar with the window and the side panel.
    observer.observe(container);
    const main = container.closest('.canvas-editor-layout__main');
    if (main) observer.observe(main);
    const bar = container
      .closest('.canvas-editor-layout')
      ?.querySelector('.canvas-editor-layout__bottom-bar');
    if (bar) observer.observe(bar);
    return () => observer.disconnect();
  }, [container, enabled, hold]);

  return fit;
}
