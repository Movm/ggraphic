// SPDX-License-Identifier: MPL-2.0
import { messages } from '@ggraphic/editor/i18n/messages';

/**
 * Placeholder Text Constants
 *
 * Centralized placeholder text for new pages in multi-page canvas templates.
 * These provide example content so users see meaningful text when adding new pages.
 */

export type PlaceholderKey =
  | 'headline'
  | 'subtext'
  | 'quote'
  | 'name'
  | 'header'
  | 'body'
  | 'line1'
  | 'line2'
  | 'line3'
  | 'accent'
  | 'eventTitle'
  | 'beschreibung'
  | 'weekday'
  | 'date'
  | 'time'
  | 'locationName'
  | 'address';

const PLACEHOLDER_KEYS: ReadonlyArray<PlaceholderKey> = [
  'headline',
  'subtext',
  'quote',
  'name',
  'header',
  'body',
  'line1',
  'line2',
  'line3',
  'accent',
  'eventTitle',
  'beschreibung',
  'weekday',
  'date',
  'time',
  'locationName',
  'address',
];

/** The texts come from the message catalogue, so they follow the active language. */
export const PLACEHOLDER_TEXT: Readonly<Record<PlaceholderKey, string>> = Object.defineProperties(
  {} as Record<PlaceholderKey, string>,
  Object.fromEntries(
    PLACEHOLDER_KEYS.map((key) => [
      key,
      { enumerable: true, get: () => messages().placeholders[key] },
    ])
  )
);

/**
 * Get a placeholder value by key with type-safe lookup.
 * Returns empty string if key doesn't exist.
 */
export function getPlaceholder(key: string): string {
  return PLACEHOLDER_TEXT[key as PlaceholderKey] ?? '';
}
