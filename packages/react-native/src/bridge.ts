// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The messages between a React Native host and the editor in its Expo DOM component.
 *
 * Native to DOM: the host passes its pending commands as a prop (`commands`), each with an id
 * that only grows. The DOM side runs every id it has not run yet and answers each with exactly
 * one `result` event, after which the host drops the command. A remounted DOM side (a reloaded
 * web view) runs what is still pending again, so nothing is lost in between.
 *
 * DOM to native: one callback prop (`onEvent`) carries `ready`, `change` and `result`.
 *
 * Both directions cross a serialisation boundary, so each side reads what arrives with the
 * parsers below instead of trusting the type.
 */
import { type GgraphicDocument } from '@ggraphic/editor';

export type { GgraphicDocument };

/** What a host asks the editor to do. */
export type EditorCommandBody =
  | {
      /** Opens `document` (absent or null: the pack's first template), with `templates` if given. */
      type: 'load';
      document?: GgraphicDocument | null;
      /** A template pack as JSON: one template file or an array of them (`loadTemplatePack`). */
      templates?: unknown;
    }
  | { type: 'exportPng'; pixelRatio?: number; transparent?: boolean }
  | { type: 'undo' }
  | { type: 'redo' };

export type EditorCommand = EditorCommandBody & { id: number };

/** The answer to one command. `value` is the PNG as base64 (no data URL prefix) for `exportPng`. */
export type EditorResult =
  | { type: 'result'; id: number; ok: true; value: string | null }
  | { type: 'result'; id: number; ok: false; error: string };

export type EditorEvent =
  /** The editor is mounted and takes commands. Sent again after every (re)mount. */
  | { type: 'ready' }
  /** The whole design after a change; store it as it comes. */
  | { type: 'change'; document: GgraphicDocument }
  | EditorResult;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** The largest `pixelRatio` an export takes: a 1080 px page at 4 is already 4320 px wide. */
export const MAX_PIXEL_RATIO = 4;

/** The longest PNG (as base64) an export sends back; larger images fail instead of the bridge. */
export const MAX_PNG_BASE64 = 32 * 1024 * 1024;

/** A positive number up to `MAX_PIXEL_RATIO`, or absent. */
const isOptionalScale = (value: unknown): boolean =>
  value === undefined || (typeof value === 'number' && value > 0 && value <= MAX_PIXEL_RATIO);

/** The document shape the editor stores; the page states are the editor's to read. */
export function isGgraphicDocument(value: unknown): value is GgraphicDocument {
  return (
    isRecord(value) &&
    typeof value['formatId'] === 'string' &&
    Array.isArray(value['pages']) &&
    value['pages'].every(
      (page) => isRecord(page) && typeof page['configId'] === 'string' && isRecord(page['state'])
    )
  );
}

/** A command as the DOM side receives it; null for anything that is not one. */
export function parseEditorCommand(value: unknown): EditorCommand | null {
  if (!isRecord(value) || !isId(value['id'])) return null;
  const id = value['id'];
  switch (value['type']) {
    case 'load': {
      const document = value['document'];
      if (document !== undefined && document !== null && !isGgraphicDocument(document)) {
        return null;
      }
      return {
        type: 'load',
        id,
        ...(document === undefined ? {} : { document }),
        ...(value['templates'] === undefined ? {} : { templates: value['templates'] }),
      };
    }
    case 'exportPng': {
      const { pixelRatio, transparent } = value;
      if (!isOptionalScale(pixelRatio)) return null;
      if (transparent !== undefined && typeof transparent !== 'boolean') return null;
      return {
        type: 'exportPng',
        id,
        ...(pixelRatio === undefined ? {} : { pixelRatio: pixelRatio as number }),
        ...(transparent === undefined ? {} : { transparent }),
      };
    }
    case 'undo':
    case 'redo':
      return { type: value['type'], id };
    default:
      return null;
  }
}

/** An event as the native side receives it; null for anything that is not one. */
export function parseEditorEvent(value: unknown): EditorEvent | null {
  if (!isRecord(value)) return null;
  switch (value['type']) {
    case 'ready':
      return { type: 'ready' };
    case 'change':
      return isGgraphicDocument(value['document'])
        ? { type: 'change', document: value['document'] }
        : null;
    case 'result': {
      const id = value['id'];
      if (!isId(id)) return null;
      if (value['ok'] === true) {
        const result = value['value'];
        return typeof result === 'string' || result === null
          ? { type: 'result', id, ok: true, value: result }
          : null;
      }
      if (value['ok'] === false) {
        const error = value['error'];
        return typeof error === 'string' ? { type: 'result', id, ok: false, error } : null;
      }
      return null;
    }
    default:
      return null;
  }
}

const PNG_DATA_URL = 'data:image/png;base64,';

/** The base64 payload of a PNG data URL, as `exportPng` sends it; null for anything else. */
export function pngBase64(dataUrl: string): string | null {
  return dataUrl.startsWith(PNG_DATA_URL) && dataUrl.length > PNG_DATA_URL.length
    ? dataUrl.slice(PNG_DATA_URL.length)
    : null;
}
