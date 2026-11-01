// SPDX-License-Identifier: MPL-2.0
/**
 * The state of an icon on the page, per instance in `iconStates`.
 */
import { type Bindings } from '../brand/bindings.js';

/** Where a placed icon came from; the licence and author are shown and stored. */
export interface IconSource {
  kind: 'iconify';
  prefix: string;
  name: string;
  setTitle: string;
  licence: string;
  author: string;
}

export interface IconState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color?: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  opacity?: number;
  /**
   * Katalog-ID des gezeigten Icons. Fehlt sie, IST der Schlüssel in
   * `iconStates` die Katalog-ID — so liegen alle Dokumente von vor #3404 vor,
   * und so legt die Seitenleiste das erste Exemplar bis heute ab. Erst eine
   * Kopie braucht das Feld, weil sie eine frische Instanz-ID trägt. Aufgelöst
   * wird immer über `catalogIconId` in `utils/iconInstances.ts`.
   */
  iconId?: string;
  /**
   * Icons from a host's icon search: a COPY of the SVG (so exports and reloads work offline,
   * and nothing is hotlinked) and where it came from, for the licence and credit line.
   * Bundled icons carry neither.
   *
   * This is the markup as it was stored, possibly by another client: NEVER read or draw it
   * directly. `registerStoredExternalIcons` sanitises it into the registry
   * (`utils/externalIcons.ts`), and `resolveIconDef` / `externalIconKey` look it up there.
   * It is not rewritten in place on load, because that would save every document on open.
   */
  svg?: string;
  source?: IconSource;
  /** Mirrored about the centre (negative node scale); omit for upright. */
  flipX?: boolean;
  flipY?: boolean;
}
