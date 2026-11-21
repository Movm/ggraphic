// SPDX-License-Identifier: AGPL-3.0-only

/** Kam die letzte Fokusbewegung von der Tastatur? (`data-focus-modality` am `<html>`, siehe `kbd:`) */
export function isKeyboardModality(): boolean {
  return document.documentElement.dataset.focusModality === 'keyboard';
}

export function isFocusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}
