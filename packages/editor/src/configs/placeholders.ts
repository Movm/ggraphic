// SPDX-License-Identifier: MPL-2.0
/**
 * Placeholder Text Constants
 *
 * Centralized placeholder text for new pages in multi-page canvas templates.
 * These provide example content so users see meaningful text when adding new pages.
 */

export const PLACEHOLDER_TEXT = {
  // Simple template
  headline: 'Your headline here',
  subtext: 'Your message goes here',

  // Zitat templates
  quote: 'Your quote goes here.\nA good quote inspires.',
  name: 'Alex Example',

  // Info template
  header: 'Did you know?',
  body: 'Add your text here.',

  // Dreizeilen template
  line1: 'First line',
  line2: 'Second line',
  line3: 'Third line',
  // AT: die gelbe kursive Betonungszeile liegt unter `accent`, nicht `line2`
  accent: 'Emphasis',

  // Veranstaltung template
  eventTitle: 'EVENT',
  beschreibung: 'Enter a description here',
  weekday: 'WED',
  date: '15 JAN',
  time: '7 PM',
  locationName: 'Venue',
  address: '1 Sample Street, 12345 Town',
} as const;

/**
 * Get a placeholder value by key with type-safe lookup.
 * Returns empty string if key doesn't exist.
 */
export function getPlaceholder(key: string): string {
  return PLACEHOLDER_TEXT[key as keyof typeof PLACEHOLDER_TEXT] ?? '';
}
