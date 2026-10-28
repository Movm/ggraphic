// SPDX-License-Identifier: AGPL-3.0-only
// Types for the jest-dom matchers vitest.setup.ts registers (vitest 5 merges them onto `Matchers`).
import { type TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type -- declaration merging only */
declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
