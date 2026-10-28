// SPDX-License-Identifier: MPL-2.0
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StandaloneCanvas } from '@ggraphic/editor/components/StandaloneCanvas';
import { messages, registerMessages } from '@ggraphic/editor/i18n/messages';
import { registerTemplates } from '@ggraphic/editor/templates/registry';

afterEach(() => registerMessages('de'));

describe('StandaloneCanvas errors are catalogue text', () => {
  it.each(['de', 'en'] as const)('an unknown template id is said in %s', (locale) => {
    registerMessages(locale);
    const { container } = render(
      <StandaloneCanvas configId="no-such-template" initialProps={{}} />
    );
    expect(container.textContent).toContain(messages().errors.canvasError);
    expect(container.textContent).toContain(
      messages().errors.unknownCanvasType('no-such-template')
    );
    if (locale === 'de') expect(container.textContent).not.toMatch(/Unknown canvas type/);
  });

  it('a failing load shows the catalogue message, not the error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerTemplates({
      id: 'load-fails',
      load: () => Promise.reject(new Error('ENOENT: /srv/secret/path.json')),
    });
    const { container } = render(<StandaloneCanvas configId="load-fails" initialProps={{}} />);
    await waitFor(() =>
      expect(container.textContent).toContain(messages().errors.canvasConfigLoad)
    );
    expect(container.textContent).not.toContain('ENOENT');
  });
});
