// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Which image elements show an SVG the editor wrote itself.
 *
 * An export inlines an SVG into its own output, and an SVG that came from a document (a user
 * image, an asset, an uploaded logo) is a trust boundary: it goes through `sanitizeSvg`. The
 * editor's own SVGs (charts, icons, illustrations) do not, because the sanitiser strips what they
 * are drawn with (`<style>`, `<text>`).
 *
 * What tells the two apart is who made the element, never what its `src` looks like: a document
 * can write any data URL it likes into a user image's `src`. So the code that builds an image
 * from an SVG it generated marks that element here, and nothing unmarked is trusted.
 */
const trusted = new WeakSet<HTMLImageElement>();

/** Call on an image element whose SVG source the editor generated, right where it is made. */
export function markTrustedSvgImage(img: HTMLImageElement): void {
  trusted.add(img);
}

export function isTrustedSvgImage(img: unknown): boolean {
  return typeof img === 'object' && img !== null && trusted.has(img as HTMLImageElement);
}
