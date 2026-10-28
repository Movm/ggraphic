// SPDX-License-Identifier: AGPL-3.0-only
// Types for the jest-dom and vitest-axe matchers vitest.setup.ts registers (vitest 5 merges them onto `Matchers`).
import { type TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { type AxeMatchers } from 'vitest-axe';

/* eslint-disable @typescript-eslint/no-unused-vars -- declaration merging only */
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R>, AxeMatchers {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown>, AxeMatchers {}
}
