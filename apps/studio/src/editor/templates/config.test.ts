// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { createStudioConfig } from './config';
import { HEADLINE_TEMPLATE_ID } from './ids';

describe('the Studio page config', () => {
  it('offers the tools tab, with its section', () => {
    const config = createStudioConfig(HEADLINE_TEMPLATE_ID, 'post-portrait');
    expect(config.tabs.map((tab) => tab.id)).toEqual(['text', 'elements', 'uploads', 'tools']);
    expect(config.tabs.find((tab) => tab.id === 'tools')?.label).toBe('Tools');
    expect(config.sections['tools']).toBeDefined();
  });
});
