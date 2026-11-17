// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_FORMATS,
  canvasFormats,
  formatIdForSize,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  registerCanvasFormats,
  type CanvasFormat,
} from './index.js';

const story: CanvasFormat = {
  id: 'story-9-16',
  label: 'Story',
  description: '1080 × 1920 · 9:16',
  group: 'post',
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
  vi.restoreAllMocks();
});

describe('registerCanvasFormats', () => {
  it('without registration the list and the fallback are the built-ins', () => {
    expect(canvasFormats()).toEqual(CANVAS_FORMATS);
    expect(getCanvasFormat('story-9-16')).toBeNull();
    expect(getCanvasFormatOrDefault('story-9-16').id).toBe('post-portrait');
  });

  it('makes a registered format resolvable, after the built-ins', () => {
    registerCanvasFormats([story]);
    expect(getCanvasFormat('story-9-16')).toBe(story);
    expect(getCanvasFormatOrDefault('story-9-16')).toBe(story);
    expect(formatIdForSize(1080, 1920)).toBe('story-9-16');
    expect(canvasFormats().map((f) => f.id)).toEqual([
      ...CANVAS_FORMATS.map((f) => f.id),
      story.id,
    ]);
    expect(CANVAS_FORMATS.some((f) => f.id === story.id)).toBe(false);
  });

  it('throws on a built-in id and on duplicates, leaving the registry unchanged', () => {
    expect(() => registerCanvasFormats([{ ...story, id: 'post-portrait' }])).toThrow(
      /post-portrait/
    );
    expect(() => registerCanvasFormats([story, story])).toThrow(/story-9-16/);
    expect(canvasFormats()).toEqual(CANVAS_FORMATS);
  });
});

describe('getCanvasFormatOrDefault on an unknown id', () => {
  it('warns once per id, naming the fallback and the fix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getCanvasFormatOrDefault('gone-4-3').id).toBe('post-portrait');
    expect(getCanvasFormatOrDefault('gone-4-3').id).toBe('post-portrait');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "unknown canvas format 'gone-4-3', falling back to 'post-portrait'; register it with registerCanvasFormats"
    );
    getCanvasFormatOrDefault('gone-2-1');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('stays quiet for a missing id and for a known or registered one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getCanvasFormatOrDefault(null);
    getCanvasFormatOrDefault('');
    getCanvasFormatOrDefault('slide-16-9');
    registerCanvasFormats([{ ...story, id: 'quiet-9-16' }]);
    getCanvasFormatOrDefault('quiet-9-16');
    expect(warn).not.toHaveBeenCalled();
  });
});
