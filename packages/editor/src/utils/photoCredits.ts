// SPDX-License-Identifier: AGPL-3.0-only
import { type StockImageAttribution } from '../common/imageSourceTypes.js';

import { iconCreditLine, pageIconSources } from './externalIcons.js';
import { photoCreditLine } from './photoCredit.js';

import type { UserImageInstance } from './userImageUtils.js';

/** Alle Foto-Nachweise einer Seite: Hintergrundfoto und eingefügte Fotos. */
export function pagePhotoCredits(state: Record<string, unknown>): StockImageAttribution[] {
  const background = state.imageAttribution as StockImageAttribution | null | undefined;
  const images = (state.userImageInstances as UserImageInstance[] | undefined) ?? [];
  return [background, ...images.map((image) => image.attribution)].filter(
    (credit): credit is StockImageAttribution => Boolean(credit)
  );
}

/** Photo and icon credits of one or more pages, one line each, for the post text. */
export function creditLines(states: readonly Record<string, unknown>[]): string {
  return [
    photoCreditLine(states.flatMap(pagePhotoCredits)),
    iconCreditLine(states.flatMap(pageIconSources)),
  ]
    .filter(Boolean)
    .join('\n');
}
