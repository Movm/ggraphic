// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { draftErrorText } from './shell';

describe('draftErrorText', () => {
  it('never shows the server text of a failed draft', () => {
    const err = new ApiError(500, 'internal', 'upstream returned 502 from 10.0.0.7');
    expect(draftErrorText(err)).not.toContain('upstream');
  });
  it('keeps the specific wording for a timeout and a disabled AI', () => {
    expect(draftErrorText(new ApiError(504, 'ai_timeout', 'x'))).toMatch(/too long/);
    expect(draftErrorText(new ApiError(503, 'ai_disabled', 'x'))).toMatch(/not available/);
  });
});
