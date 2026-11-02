// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';

import { registerMessages } from '../i18n/messages.js';
import {
  CANVAS_FORMAT_GROUP_ORDER,
  canvasFormatGroupLabel,
  canvasFormatGroupOrder,
  registerCanvasFormatGroups,
  registerCanvasFormats,
  type CanvasFormat,
} from './index.js';

const story: CanvasFormat = {
  id: 'story-9-16',
  label: 'Story',
  description: '1080 × 1920 · 9:16',
  group: 'story',
  category: 'digital',
  width: 1080,
  height: 1920,
  dpi: 72,
  iconKey: 'portrait',
  defaultExport: 'png',
  exportable: ['png', 'jpeg'],
  print: null,
};

afterEach(() => {
  registerCanvasFormats([]);
  registerCanvasFormatGroups([]);
  registerMessages('de');
});

describe('format groups', () => {
  it('without host groups: the built-in order and German labels', () => {
    expect(canvasFormatGroupOrder()).toEqual(['post', 'square', 'slides']);
    expect(['post', 'square', 'slides', 'print'].map(canvasFormatGroupLabel)).toEqual([
      'Beiträge',
      'Quadratisch',
      'Präsentationen',
      'Print',
    ]);
  });

  it('a registered host group follows the built-ins and accepts formats', () => {
    registerCanvasFormatGroups([{ id: 'story', label: 'Stories' }]);
    registerCanvasFormats([story]);
    expect(canvasFormatGroupOrder()).toEqual(['post', 'square', 'slides', 'story']);
    expect(canvasFormatGroupLabel('story')).toBe('Stories');
  });

  it('places a host group by its order between the built-ins', () => {
    registerCanvasFormatGroups([
      { id: 'story', label: 'Stories' },
      { id: 'post-tall', label: 'Posts 3:4', order: CANVAS_FORMAT_GROUP_ORDER.post + 50 },
      { id: 'banner', label: 'Banner', order: CANVAS_FORMAT_GROUP_ORDER.slides },
      { id: 'flyer', label: 'Flyer' },
    ]);
    // Positioned by order (a tie keeps the built-in first), unpositioned last in registration order.
    expect(canvasFormatGroupOrder()).toEqual([
      'post',
      'post-tall',
      'square',
      'slides',
      'banner',
      'story',
      'flyer',
    ]);
  });

  it('throws for a group without a finite order', () => {
    expect(() =>
      registerCanvasFormatGroups([{ id: 'story', label: 'Stories', order: Number.NaN }])
    ).toThrow(/story/);
    expect(canvasFormatGroupOrder()).toEqual(['post', 'square', 'slides']);
  });

  it('built-in labels follow the active locale', () => {
    registerMessages('en');
    expect(canvasFormatGroupLabel('slides')).toBe('Presentations');
    expect(canvasFormatGroupLabel('square')).toBe('Square');
  });

  it('throws for a format with an unknown group, leaving formats unchanged', () => {
    expect(() => registerCanvasFormats([story])).toThrow(/story/);
  });

  it('throws when a group id collides with a built-in or repeats', () => {
    expect(() => registerCanvasFormatGroups([{ id: 'print', label: 'X' }])).toThrow(/print/);
    expect(() =>
      registerCanvasFormatGroups([
        { id: 'a', label: 'A' },
        { id: 'a', label: 'B' },
      ])
    ).toThrow(/'a'/);
    expect(canvasFormatGroupOrder()).toHaveLength(3);
  });

  it('rejects a replacement that orphans a registered format, keeping the groups', () => {
    registerCanvasFormatGroups([{ id: 'story', label: 'Stories' }]);
    registerCanvasFormats([story]);
    expect(() => registerCanvasFormatGroups([{ id: 'other', label: 'Other' }])).toThrow(
      /story-9-16.*story/
    );
    expect(() => registerCanvasFormatGroups([])).toThrow(/story-9-16/);
    expect(canvasFormatGroupLabel('story')).toBe('Stories');
    registerCanvasFormatGroups([
      { id: 'story', label: 'Geschichten' },
      { id: 'other', label: 'Other' },
    ]);
    expect(canvasFormatGroupLabel('story')).toBe('Geschichten');
  });
});
