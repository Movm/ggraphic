// SPDX-License-Identifier: AGPL-3.0-only
import { messages } from '../i18n/catalogue.js';

// The host's file delivery (`CanvasFileDeliveryService`) throws an error named
// 'NativeDownloadTooLargeError' when the WebView bridge refuses the payload
// (the host's `NativeDownloadTooLargeError` sets that name). Matched by
// name, not class, so the editor needs no import from the host.
export function isDownloadTooLarge(err: unknown): boolean {
  return err instanceof Error && err.name === 'NativeDownloadTooLargeError';
}

export function downloadErrorMessage(err: unknown): string {
  const m = messages().errors;
  return isDownloadTooLarge(err) ? m.downloadTooLarge : m.downloadFailed;
}
