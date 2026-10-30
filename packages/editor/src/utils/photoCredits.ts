// SPDX-License-Identifier: MPL-2.0
import { type StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';

import { iconCreditLine, pageIconSources } from '@ggraphic/editor/utils/externalIcons';
import { photoCreditLine } from '@ggraphic/editor/utils/photoCredit';

import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

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
