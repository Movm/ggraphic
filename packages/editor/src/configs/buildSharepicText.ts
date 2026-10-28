// SPDX-License-Identifier: MPL-2.0
import { messages } from '@ggraphic/editor/i18n/messages';

interface AdditionalTextLike {
  text?: unknown;
  type?: unknown;
}

const FIELD_KEYS = [
  'quote',
  'name',
  'header',
  'subheader',
  'body',
  'eventTitle',
  'weekday',
  'date',
  'time',
  'locationName',
  'address',
  'line1',
  'line2',
  'line3',
  'headline',
  'title',
] as const;

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds a structured text description in the active language of the current canvas content.
 * Used by ChatSection to inject the sharepic content into the chat composer.
 */
export function buildSharepicText(state: Record<string, unknown>): string {
  const lines: string[] = [];
  const t = messages().sharepicText;

  const canvasType = asString(state.canvasType);
  if (canvasType) {
    lines.push(t.type(canvasType));
  }

  for (const key of FIELD_KEYS) {
    const label = t.labels[key];
    const value = asString(state[key]);
    if (value) {
      lines.push(`${label}: ${value}`);
    }
  }

  const additional = state.additionalTexts;
  if (Array.isArray(additional) && additional.length > 0) {
    const additionalStrings = (additional as AdditionalTextLike[])
      .map((entry) => asString(entry.text))
      .filter((value): value is string => value !== null);
    if (additionalStrings.length > 0) {
      lines.push(t.more(additionalStrings.join(' / ')));
    }
  }

  if (lines.length === 0) {
    return t.empty;
  }

  return lines.join('\n');
}
