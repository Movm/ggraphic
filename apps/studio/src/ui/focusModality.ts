// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Keeps `html[data-focus-modality]` at `keyboard` or `pointer`, after the last
 * input. The editor's focus rings (`kbd:` variant) and keyboard-only focus
 * moves read it.
 */
export function trackFocusModality(): void {
  const root = document.documentElement;
  const set = (modality: 'keyboard' | 'pointer') => {
    if (root.dataset['focusModality'] !== modality) root.dataset['focusModality'] = modality;
  };
  set('pointer');
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) set('keyboard');
    },
    true
  );
  window.addEventListener('pointerdown', () => set('pointer'), true);
}
