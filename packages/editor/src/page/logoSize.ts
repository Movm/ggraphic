// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Natural sizes of brand logos. A template seed is built synchronously but needs the
 * logo's proportions, so the host measures the image first (`measureLogo`, when it applies a
 * brand) and placing reads it here.
 */
const sizes = new Map<string, { width: number; height: number }>();

export function rememberLogoSize(src: string, width: number, height: number): void {
  sizes.set(src, { width, height });
}

/** The measured size, or null while unknown or when the image has no area. */
export function logoSizeOf(src: string): { width: number; height: number } | null {
  const size = sizes.get(src);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/** Loads the image to learn its size; a logo that does not load stays unmeasured. */
export function measureLogo(src: string): Promise<void> {
  if (logoSizeOf(src) || typeof Image === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      rememberLogoSize(src, img.naturalWidth, img.naturalHeight);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}
