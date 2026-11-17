// SPDX-License-Identifier: AGPL-3.0-only
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigCanvas } from './ConfigCanvas.js';

import type { AnyCanvasConfig } from '../configs/types.js';

const received: Record<string, unknown>[] = [];

vi.mock('./GenericCanvas.js', () => ({
  GenericCanvas: (props: Record<string, unknown>) => {
    received.push(props);
    return null;
  },
}));

// Only the size is read before GenericCanvas; the rest of a template does not matter here.
const config = { canvas: { width: 1080, height: 1350 } } as unknown as AnyCanvasConfig;

beforeEach(() => {
  received.length = 0;
});

describe('ConfigCanvas passes the preview capture ratio on', () => {
  it('hands previewCaptureRatio to GenericCanvas, so a filtered photo is cached for the capture', () => {
    render(<ConfigCanvas config={config} initialProps={{}} preview previewCaptureRatio={0.7} />);
    expect(received.at(-1)).toMatchObject({ preview: true, previewCaptureRatio: 0.7 });
  });

  it('leaves it out when the host gives none', () => {
    render(<ConfigCanvas config={config} initialProps={{}} preview />);
    expect(received.at(-1)).not.toHaveProperty('previewCaptureRatio');
  });
});
