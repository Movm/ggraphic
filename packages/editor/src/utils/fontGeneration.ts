// SPDX-License-Identifier: MPL-2.0
/**
 * The font generation counter without React (see `hooks/useFontGeneration`): text utilities
 * report a finished load through it, and the entries built on them load without React.
 */

let generation = 0;
const listeners = new Set<() => void>();

function bump(): void {
  generation += 1;
  for (const notify of listeners) notify();
}

/**
 * For a load the caller started itself (`requestFace`). WebKit skips the
 * `loading` event for a face that loads at once, e.g. from the HTTP cache on
 * reload, so neither `loadingdone` nor `ready` reports it (measured with
 * Playwright-WebKit, 10.10.2026, #4400).
 */
export const notifyFontLoaded = bump;

// Beim Import, nicht erst beim Abonnieren: `subscribe` läuft als passiver
// Effekt nach dem Zeichnen. Ein `loadingdone` im Fenster zwischen Rendern und
// Effekt fiele sonst aus, `generation` bliebe 0 — und genau dieses Ereignis
// ist das, weswegen es den Zähler gibt.
//
// WebKit (Safari, iOS-WebView) feuert `loading`, aber nie `loadingdone`;
// `ready` löst dort aber auf, sobald der Satz geladen ist (gemessen mit
// Playwright-WebKit, 10.10.2026, #4400). Ohne diesen Weg bliebe in Safari der
// mit der Ersatzschrift gemessene Umbruch stehen, sobald ein Schnitt nach der
// ersten Messung eintrifft. Wo `loadingdone` schon hochgezählt hat, zählt
// `ready` nicht noch einmal.
if (typeof document !== 'undefined' && document.fonts) {
  const fonts = document.fonts;
  const bumpWhenReady = () => {
    const seen = generation;
    void fonts.ready.then(() => {
      if (generation === seen) bump();
    });
  };
  fonts.addEventListener('loadingdone', bump);
  fonts.addEventListener('loading', bumpWhenReady);
  // Ein Laden, das vor dem Import begann (`preloadCanvasTemplate`), hat sein
  // `loading` schon gefeuert.
  if (fonts.status === 'loading') bumpWhenReady();
}

export function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** The current generation, for `useFontGeneration`. */
export function fontGeneration(): number {
  return generation;
}
