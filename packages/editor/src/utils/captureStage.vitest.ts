// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';

import { withSelectionChromeHidden } from './captureStage.js';

import type Konva from 'konva';

function node(name: string, visible = true) {
  let isVisible = visible;
  return {
    name,
    visible: () => isVisible,
    hide: vi.fn(() => {
      isVisible = false;
    }),
    show: vi.fn(() => {
      isVisible = true;
    }),
  };
}

function stageWith(nodes: ReturnType<typeof node>[]) {
  const draw = vi.fn();
  return {
    draw,
    find: (selector: string) =>
      nodes.filter((n) =>
        selector === 'Transformer' ? n.name === 'Transformer' : n.name === selector.slice(1)
      ),
  } as unknown as Konva.Stage & { draw: ReturnType<typeof vi.fn> };
}

describe('withSelectionChromeHidden', () => {
  it('hides transformers and selection rects for the capture and restores them', () => {
    const transformer = node('Transformer');
    const chrome = node('selection-chrome');
    const stage = stageWith([transformer, chrome]);

    const seen: boolean[] = [];
    const result = withSelectionChromeHidden(stage, () => {
      seen.push(transformer.visible(), chrome.visible());
      return 'data:image/png;base64,x';
    });

    expect(result).toBe('data:image/png;base64,x');
    expect(seen).toEqual([false, false]);
    expect(transformer.visible()).toBe(true);
    expect(chrome.visible()).toBe(true);
  });

  it('leaves already-hidden nodes hidden', () => {
    const hidden = node('Transformer', false);
    const stage = stageWith([hidden]);

    withSelectionChromeHidden(stage, () => null);

    expect(hidden.show).not.toHaveBeenCalled();
    expect(hidden.visible()).toBe(false);
  });

  it('restores the chrome when the capture throws', () => {
    const transformer = node('Transformer');
    const stage = stageWith([transformer]);

    expect(() =>
      withSelectionChromeHidden(stage, () => {
        throw new Error('toDataURL failed');
      })
    ).toThrow('toDataURL failed');
    expect(transformer.visible()).toBe(true);
  });

  it('captures without touching the stage when there is no chrome', () => {
    const stage = stageWith([]);

    expect(withSelectionChromeHidden(stage, () => 'ok')).toBe('ok');
    expect(stage.draw).not.toHaveBeenCalled();
  });
});

describe('withSelectionChromeHidden and export-hidden nodes', () => {
  it('hides export-hidden nodes by default, like an export', () => {
    const placeholder = node('export-hidden');
    const stage = stageWith([placeholder]);

    const seen: boolean[] = [];
    withSelectionChromeHidden(stage, () => seen.push(placeholder.visible()));

    expect(seen).toEqual([false]);
    expect(placeholder.visible()).toBe(true);
  });

  it('keeps export-hidden nodes for a preview but still hides the chrome', () => {
    const placeholder = node('export-hidden');
    const chrome = node('selection-chrome');
    const stage = stageWith([placeholder, chrome]);

    const seen: boolean[] = [];
    withSelectionChromeHidden(stage, () => seen.push(placeholder.visible(), chrome.visible()), {
      keepPlaceholders: true,
    });

    expect(seen).toEqual([true, false]);
  });
});
