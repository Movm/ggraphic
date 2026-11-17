// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Awaits every declared @font-face load before a stage export rasterizes.
 *
 * Brand fonts load via `font-display: swap`, so a synchronous
 * `stage.toDataURL()` fired before they finish bakes in the fallback face —
 * the intermittent "some AT sharepics render in the wrong font" bug (the
 * heaviest brand font sets are the most visible offenders). Gating the
 * user-facing export paths on this makes the snapshot deterministic. Cheap and
 * idempotent after the first call (faces are cached), and best-effort: an
 * export must never fail on font loading.
 *
 * `timeoutMs` bounds the wait, for a host whose web view can leave a face it cannot fetch pending
 * for good (WKWebView in an Expo DOM component); the export then uses the fallback face. Without
 * it the wait lasts until the fonts settle.
 */
export async function ensureFontsReady(options: { timeoutMs?: number } = {}): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fonts = document.fonts;
  const loaded = (async () => {
    await Promise.all(Array.from(fonts, (face) => face.load().catch(() => undefined)));
    await fonts.ready;
  })().catch(() => undefined); // best-effort — never fail an export on font loading
  if (options.timeoutMs === undefined) return loaded;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, options.timeoutMs);
  });
  await Promise.race([loaded, limit]);
  clearTimeout(timer);
}
