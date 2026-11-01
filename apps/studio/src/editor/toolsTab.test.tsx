// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Tools tab with the Studio's services: the four tools that run in the
 * browser are offered, and no tile of a tool that needs a server is.
 */
import { CanvasEditorProvider } from '@ggraphic/editor/shell';
import { ToolsSection } from '@ggraphic/editor/sidebar';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerEditor } from '../registerEditor';

import { createStudioServices } from './services';

beforeAll(() => registerEditor());

describe('the Tools tab', () => {
  it.each([{ ai: false }, { ai: true }])(
    'shows blob, QR code, gradient text and text path and no server tool (%o)',
    async ({ ai }) => {
      render(
        <CanvasEditorProvider services={createStudioServices({ ai, organisationId: 'org-1' })}>
          <ToolsSection />
        </CanvasEditorProvider>
      );
      // The public `ToolsSection` is lazy: wait for it to load.
      await screen.findByRole('button', { name: 'Create blob' });
      for (const name of ['Create blob', 'Create QR code', 'Gradient text', 'Create path text']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
      for (const name of [
        /Remove background/,
        /Create AI image/,
        /Edit with AI/,
        /Alt texts/,
        /Unsplash/,
      ]) {
        expect(screen.queryByRole('button', { name })).toBeNull();
      }
      expect(screen.getAllByRole('button')).toHaveLength(4);
    }
  );

  it('previews the QR code with a neutral address', () => {
    const services = createStudioServices({ ai: false, organisationId: 'org-1' });
    expect(services.qrPreviewUrl).toBe('https://example.org');
  });
});
