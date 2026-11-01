// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it, vi } from 'vitest';

import { createIconActions } from './actionFactories.js';

import type { IconState } from '@ggraphic/editor/configs/factory/baseTypes';

/**
 * Abwählen trifft seit #3404 zwei verschiedene Absichten mit derselben Aktion:
 * aus der Seitenleiste kommt eine Katalog-ID (dort steht je Icon EIN Eintrag,
 * gemeint sind alle Kopien), aus dem Entf-Zweig eine Instanz-ID (gemeint ist
 * genau eine). Beides muss `toggleIcon` auseinanderhalten.
 */
interface IconTestState {
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
}

function harness(initial: IconTestState) {
  let state = initial;
  const setState = (partial: Partial<IconTestState> | ((prev: IconTestState) => IconTestState)) => {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
  };
  const saveToHistory = vi.fn();
  const actions = createIconActions(() => state, setState, saveToHistory, vi.fn(), 1080, 1080, {
    defaultColor: '#123456',
  });
  return { actions, current: () => state, saveToHistory };
}

const at = (x: number, extra: Partial<IconState> = {}): IconState => ({
  x,
  y: x,
  scale: 1,
  rotation: 0,
  ...extra,
});

const threeSuns = (): IconTestState => ({
  selectedIcons: ['tabler-sun', 'icon-1', 'icon-2'],
  iconStates: {
    'tabler-sun': at(10),
    'icon-1': at(30, { iconId: 'tabler-sun' }),
    'icon-2': at(50, { iconId: 'tabler-sun' }),
  },
});

describe('toggleIcon with an external icon', () => {
  it('stores a copy of the svg and its source in the design', () => {
    const h = harness({ selectedIcons: [], iconStates: {} });
    const source = {
      kind: 'iconify' as const,
      prefix: 'lets',
      name: 'tree',
      setTitle: 'Lets Icons',
      licence: 'CC-BY-4.0',
      author: 'Leonid Tsvetkov',
    };
    h.actions.toggleIcon('iconify:lets:tree', true, undefined, { svg: '<svg></svg>', source });

    expect(h.current().selectedIcons).toEqual(['iconify:lets:tree']);
    expect(h.current().iconStates['iconify:lets:tree']).toMatchObject({
      svg: '<svg></svg>',
      source,
      x: 540,
      y: 540,
    });
  });

  it('adds nothing for a bundled icon', () => {
    const h = harness({ selectedIcons: [], iconStates: {} });
    h.actions.toggleIcon('tabler-sun', true);
    expect(h.current().iconStates['tabler-sun']).not.toHaveProperty('svg');
    expect(h.current().iconStates['tabler-sun']).not.toHaveProperty('source');
  });
});

describe('toggleIcon', () => {
  it('legt das erste Exemplar unter der Katalog-ID ab', () => {
    // Kein `iconId` — genau die Form, in der alle Dokumente von vor #3404
    // vorliegen, und die Auflösung `iconId ?? id` deckt sie mit ab.
    const h = harness({ selectedIcons: [], iconStates: {} });
    h.actions.toggleIcon('tabler-sun', true);

    expect(h.current().selectedIcons).toEqual(['tabler-sun']);
    expect(h.current().iconStates['tabler-sun']).toMatchObject({ x: 540, y: 540, scale: 1 });
    expect(h.current().iconStates['tabler-sun'].iconId).toBeUndefined();
  });

  it('legt ein gezogenes Icon mittig auf den Drop-Punkt', () => {
    const h = harness({ selectedIcons: [], iconStates: {} });
    h.actions.toggleIcon('tabler-sun', true, { center: { x: 120, y: 900 } });

    expect(h.current().iconStates['tabler-sun']).toMatchObject({ x: 120, y: 900 });
  });

  it('räumt mit der Katalog-ID das Original UND jede Kopie ab', () => {
    const h = harness(threeSuns());
    h.actions.toggleIcon('tabler-sun', false);

    expect(h.current().selectedIcons).toEqual([]);
    expect(h.current().iconStates).toEqual({});
  });

  it('räumt mit einer Instanz-ID nur diese eine ab', () => {
    const h = harness(threeSuns());
    h.actions.toggleIcon('icon-1', false);

    expect(h.current().selectedIcons).toEqual(['tabler-sun', 'icon-2']);
    expect(Object.keys(h.current().iconStates)).toEqual(['tabler-sun', 'icon-2']);
  });

  it('lässt fremde Icons stehen', () => {
    const h = harness({
      selectedIcons: ['tabler-sun', 'tabler-leaf'],
      iconStates: { 'tabler-sun': at(10), 'tabler-leaf': at(20) },
    });
    h.actions.toggleIcon('tabler-sun', false);

    expect(h.current().selectedIcons).toEqual(['tabler-leaf']);
  });
});

describe('toggleIcon for an icon already on the page', () => {
  it('places a copy under its own instance id that shows the same icon', () => {
    // Under the same id the second state overwrote the first and one node was left behind on removal.
    const h = harness({ selectedIcons: ['tabler-sun'], iconStates: { 'tabler-sun': at(10) } });
    h.actions.toggleIcon('tabler-sun', true);
    const ids = h.current().selectedIcons;
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(h.current().iconStates['tabler-sun']?.x).toBe(10);
    expect(h.current().iconStates[ids[1]!]?.iconId).toBe('tabler-sun');
  });
});
