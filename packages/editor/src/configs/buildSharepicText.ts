// SPDX-License-Identifier: MPL-2.0
interface AdditionalTextLike {
  text?: unknown;
  type?: unknown;
}

const FIELD_LABELS: Array<[key: string, label: string]> = [
  ['quote', 'Quote'],
  ['name', 'Name'],
  ['header', 'Headline'],
  ['subheader', 'Subline'],
  ['body', 'Text'],
  ['eventTitle', 'Event'],
  ['weekday', 'Weekday'],
  ['date', 'Date'],
  ['time', 'Time'],
  ['locationName', 'Place'],
  ['address', 'Address'],
  ['line1', 'Line 1'],
  ['line2', 'Line 2'],
  ['line3', 'Line 3'],
  ['headline', 'Headline'],
  ['title', 'Title'],
];

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds a structured text description of the current canvas content.
 * Used by ChatSection to inject the sharepic content into the chat composer.
 */
export function buildSharepicText(state: Record<string, unknown>): string {
  const lines: string[] = [];

  const canvasType = asString(state.canvasType);
  if (canvasType) {
    lines.push(`Graphic type: ${canvasType}`);
  }

  for (const [key, label] of FIELD_LABELS) {
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
      lines.push(`More texts: ${additionalStrings.join(' / ')}`);
    }
  }

  if (lines.length === 0) {
    return '(The graphic is still empty)';
  }

  return lines.join('\n');
}
