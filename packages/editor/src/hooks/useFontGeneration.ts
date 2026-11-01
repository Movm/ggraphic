// SPDX-License-Identifier: MPL-2.0
/**
 * Zählt hoch, sobald ein Schriftschnitt fertig geladen ist.
 *
 * Konva misst beim Zeichnen und kann deshalb einfach neu gezeichnet werden,
 * wenn eine Schrift eintrifft — genau das tut `GenericCanvas` mit seinem
 * Zurücksetzen der Textknoten. Ein Textblock mit Auszeichnung wird dagegen auf
 * React-Seite vermessen (`layoutRichTextBlock` über `runMeasurer`) und das
 * Ergebnis gemerkt. Dessen Abhängigkeiten — Text, Breite, Schriftgrad — ändern
 * sich beim Nachladen nicht, also bliebe ein mit der Ersatzschrift berechneter
 * Umbruch für immer stehen, auch im Export.
 *
 * Der Zähler ist die fehlende Abhängigkeit. Er hängt an `loadingdone` (in WebKit
 * an `ready`, siehe unten), nicht an
 * einem einmaligen Tor: die Schnitte treffen einzeln ein, und jeder von ihnen
 * kann den Umbruch verschieben.
 *
 * Der Wert muss in die Messung HINEINGEREICHT werden (`runMeasurer(…, gen)`,
 * die Layouts der Host-Arten ebenso), nicht bloß in der Deps-Liste eines
 * `useMemo` stehen: der React-Compiler (dom-Testlane und `vite build`) leitet
 * den Cache-Schlüssel aus dem ab, was der Körper liest, und streicht eine
 * Abhängigkeit, die nur in der Liste steht — auch `void gen` im Körper fällt
 * als toter Ausdruck weg. Gemessen am kompilierten Output, 18.09.2026.
 */
import { useSyncExternalStore } from 'react';

import { fontGeneration, subscribe } from '../utils/fontGeneration.js';

export { notifyFontLoaded } from '../utils/fontGeneration.js';

export function useFontGeneration(): number {
  return useSyncExternalStore(
    subscribe,
    fontGeneration,
    // Ohne DOM (Tests, SSR) lädt nichts nach.
    () => 0
  );
}
