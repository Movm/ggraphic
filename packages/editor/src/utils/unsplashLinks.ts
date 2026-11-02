// SPDX-License-Identifier: AGPL-3.0-only
import { useCanvasEditorServices } from '../CanvasEditorProvider.js';

/** The Unsplash home page, tagged with the host's `utm_source` (API Terms). */
export function useUnsplashHome(): string {
  const { unsplashUtmSource = 'ggraphic' } = useCanvasEditorServices();
  return `https://unsplash.com/?utm_source=${encodeURIComponent(unsplashUtmSource)}&utm_medium=referral`;
}
