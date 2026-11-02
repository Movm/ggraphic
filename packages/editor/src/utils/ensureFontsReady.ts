// SPDX-License-Identifier: MPL-2.0
/** How long an export waits for fonts that have not loaded. */
const FONT_WAIT_MS = 3_000;

/**
 * Awaits every declared @font-face load before a stage export rasterizes.
 *
 * Brand fonts load via `font-display: swap`, so a synchronous
 * `stage.toDataURL()` fired before they finish bakes in the fallback face —
 * the intermittent "some AT sharepics render in the wrong font" bug (the
 * heaviest brand font sets are the most visible offenders). Gating the
 * user-facing export paths on this makes the snapshot deterministic. Cheap and
 * idempotent after the first call (faces are cached), and best-effort: an
 * export must never hang or fail on font loading.
 */
export async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fonts = document.fonts;
  const loaded = (async () => {
    await Promise.all(Array.from(fonts, (face) => face.load().catch(() => undefined)));
    await fonts.ready;
  })().catch(() => undefined); // best-effort — never block an export on font loading
  // A web view can leave a face it cannot fetch pending for good (WKWebView in an Expo DOM
  // component), so the wait has an end; the export then uses the fallback face.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FONT_WAIT_MS);
  });
  await Promise.race([loaded, limit]);
  clearTimeout(timer);
}
