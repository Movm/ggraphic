// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What to tell a person when a call failed. The server's own `message` is for logs and may carry
 * internals (a database error, a limit in bytes), so an `ApiError` is told by its code, then by its
 * status, never by its text. Auth has its own, more specific wording: see `authErrorText`.
 */
import { ApiError } from '../api/client';

const BY_CODE: Readonly<Record<string, string>> = {
  not_found: 'That could not be found. It may have been deleted.',
  trashed: 'That is in the trash. Restore it first.',
  too_large: 'That is too large to save.',
  unsupported_media_type: 'That file type is not supported.',
  invalid_upload: 'That file could not be read as an image.',
  version_conflict: 'This changed in the meantime. Reload and try again.',
  feature_disabled: 'This feature is not turned on for this server.',
  busy: 'The server is busy right now. Please try again in a moment.',
  rate_limited: 'Too many requests right now. Please try again in a moment.',
  invalid_request: 'Please check your entries and try again.',
};

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * `forCode` is a call site's own wording for a code (an upload says which types it takes); it wins
 * over the general text.
 */
export function apiErrorText(
  err: unknown,
  fallback = GENERIC_ERROR,
  forCode: Readonly<Record<string, string>> = {}
): string {
  if (!(err instanceof ApiError)) return fallback;
  const byCode = forCode[err.code] ?? BY_CODE[err.code];
  if (byCode) return byCode;
  if (err.status === 0) return 'The server is not reachable. Check your connection and try again.';
  if (err.status === 401) return 'Your session has ended. Please sign in again.';
  if (err.status === 403) return 'You are not allowed to do that here.';
  if (err.status === 404) return BY_CODE['not_found']!;
  if (err.status === 413) return BY_CODE['too_large']!;
  if (err.status === 429) return BY_CODE['rate_limited']!;
  return fallback;
}

/** The auth server's reasons are fixed codes with deliberate wording; show those, not its text. */
const AUTH_BY_CODE: Readonly<Record<string, string>> = {
  invalid_credentials: 'Email or password is wrong.',
  email_taken: 'An account with this email exists. Log in to continue.',
  registration_closed: 'Registration is closed on this instance.',
  already_set_up: 'This instance is set up.',
  setup_token_invalid: 'Enter the setup token from the server log (or SETUP_TOKEN).',
  rate_limited: 'Too many attempts. Try again later.',
};

export function authErrorText(err: unknown): string {
  if (err instanceof ApiError && AUTH_BY_CODE[err.code]) return AUTH_BY_CODE[err.code]!;
  return apiErrorText(err, 'Something went wrong. Try again.');
}
