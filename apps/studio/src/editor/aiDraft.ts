// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Puts an AI draft on the design. The draft's fields go into the texts of the
 * active page that carry their role id (`TEXT_ROLES`); a page without a
 * headline or subline text (a blank page, say) gets a new "Headline + text"
 * page after it instead.
 */
import { type ReplaceDeckOps } from '@ggraphic/editor/collab/pagesDoc';
import { type AdditionalText } from '@ggraphic/editor/configs/types';
import { runMeasurer } from '@ggraphic/editor/utils/textUtils';
import { fitFontSizeToSlot, PLAIN_STYLE } from '@ggraphic/schema';

import { type Draft } from '../api/client';

import { HEADLINE_TEMPLATE_ID } from './templates/ids';
import { seedPageState, TEXT_ROLES } from './templates/seeds';

interface DeckPage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
}

/** The draft as text per role id; empty fields are left out. */
export function draftTexts(draft: Draft): Map<string, string> {
  const texts = new Map<string, string>();
  for (const [field, role] of Object.entries(TEXT_ROLES)) {
    const value = draft[field as keyof Draft]?.trim();
    if (value) texts.set(role, value);
  }
  return texts;
}

function textsOf(state: Record<string, unknown>): AdditionalText[] {
  const texts = state['additionalTexts'];
  return Array.isArray(texts) ? (texts as AdditionalText[]) : [];
}

/** `texts` filled with the draft; null when the page has no headline or subline to fill. */
export function fillTexts(texts: readonly AdditionalText[], draft: Draft): AdditionalText[] | null {
  const byRole = draftTexts(draft);
  const fillable = texts.some((t) => t.id === TEXT_ROLES.headline || t.id === TEXT_ROLES.subline);
  if (!fillable) return null;
  return fillById(texts, byRole);
}

/** `texts` with the text of every id in `byId` replaced, each fitted above the text below it. */
export function fillById(
  texts: readonly AdditionalText[],
  byId: ReadonlyMap<string, string>
): AdditionalText[] {
  return texts.map((t) => {
    const value = byId.get(t.id);
    return value === undefined ? t : fitToSlot({ ...t, text: value }, texts);
  });
}

/**
 * A text grows downwards, so a long one runs into the next text below it. Shrink it
 * until it ends above that text; a word that does not fit even hyphenated shrinks too.
 */
function fitToSlot(text: AdditionalText, texts: readonly AdditionalText[]): AdditionalText {
  const { fontSize, width, fontFamily } = text;
  const below = texts.filter((other) => other.y > text.y).map((other) => other.y);
  if (!fontSize || !width || below.length === 0) return text;
  const fitted = fitFontSizeToSlot(
    text.text,
    {
      width,
      maxHeight: Math.min(...below) - text.y,
      fontSize,
      lineHeight: text.lineHeight ?? 1,
    },
    (size) => (line) =>
      runMeasurer(size, fontFamily ?? '', text.fontStyle ?? 'normal')(line, PLAIN_STYLE)
  );
  return fitted === fontSize ? text : { ...text, fontSize: fitted };
}

/**
 * The deck change for `draft`: the active page filled in place, or a new
 * "Headline + text" page after it. `size` is the document's sheet.
 */
export function draftDeckOps(
  pages: readonly DeckPage[],
  activePageId: string | null,
  draft: Draft,
  size: { width: number; height: number }
): ReplaceDeckOps {
  const active = pages.find((p) => p.id === activePageId) ?? pages[0] ?? null;
  if (active) {
    const filled = fillTexts(textsOf(active.state), draft);
    if (filled) {
      return {
        updates: [{ pageId: active.id, state: { ...active.state, additionalTexts: filled } }],
        inserts: [],
        removes: [],
      };
    }
  }
  const seed = seedPageState(HEADLINE_TEMPLATE_ID, size.width, size.height);
  const byRole = draftTexts(draft);
  const texts = textsOf(seed)
    // A seed text the draft has nothing for (no call to action) is left off.
    .filter((t) => byRole.has(t.id))
    .map((t) => ({ ...t, text: byRole.get(t.id)! }));
  const kept = new Set(texts.map((t) => t.id));
  const layerOrder = (seed['layerOrder'] as string[]).filter(
    (id) => kept.has(id) || !textsOf(seed).some((t) => t.id === id)
  );
  return {
    updates: [],
    inserts: [
      {
        afterPageId: active?.id ?? null,
        configId: HEADLINE_TEMPLATE_ID,
        state: { ...seed, additionalTexts: texts, layerOrder },
      },
    ],
    removes: [],
  };
}
