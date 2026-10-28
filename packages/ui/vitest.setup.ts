// SPDX-License-Identifier: MPL-2.0
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(jestDomMatchers);
expect.extend(axeMatchers);
afterEach(cleanup);
