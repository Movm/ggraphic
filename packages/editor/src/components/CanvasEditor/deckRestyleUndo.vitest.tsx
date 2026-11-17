// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A host's document tab (a Vorlage for all slides, a multi-page Vorlage)
 * replaces the whole deck in ONE `replaceDeck`. Undo in the toolbar must take
 * that step back as a whole, across all pages. It used to prefer the active
 * page's element history as soon as that held any older step: the first Undo
 * reverted the active page alone (and an older text edit with it), every other
 * page stayed replaced.
 *
 * Mounted through the real shell: the stamps of both histories only meet there.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CanvasEditorProvider,
  type CanvasEditorServices,
  type CanvasSpecEditBridge,
} from '../../CanvasEditorProvider.js';
import { CanvasEditorShell } from './CanvasEditorShell.js';
import { registerEditorShell } from './editorShell.js';

import '../../testing/fixtureTemplates';

// The editor's own tabs load nothing here; the host's document tab is a probe
// that keeps the deck bridge the shell hands every such tab.
const bridge = vi.hoisted(() => ({ deck: null as CanvasSpecEditBridge | null }));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

const services: CanvasEditorServices = {};

afterEach(() => {
  registerEditorShell({});
});

const headerText = (id: string, fill: string) => ({
  id,
  text: 'Überschrift',
  type: 'header',
  x: 100,
  y: 100,
  fontSize: 60,
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
  fill,
  width: 400,
});

const pageState = (textId: string, fill: string) => ({
  additionalTexts: [headerText(textId, fill)],
});

const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

type Page = { id: string; configId: string; state: Record<string, unknown> };

const twoTextPages: Page[] = [
  { id: 'p1', configId: 'fixture-note', state: pageState('text-1', '#ffffff') },
  { id: 'p2', configId: 'fixture-note', state: pageState('text-2', '#ffffff') },
];

async function renderDeck(initialPages: Page[] = twoTextPages) {
  bridge.deck = null;
  registerEditorShell({
    tabs: [
      {
        tab: {
          id: 'vorlagen',
          icon: (() => null) as never,
          label: 'Vorlagen',
          ariaLabel: 'Vorlagen',
        },
        insertAt: (tabs) => tabs.length,
        isAvailable: () => true,
        Section: (props) => {
          bridge.deck = props.deck;
          return null;
        },
      },
    ],
  });
  await act(async () => {
    render(
      <CanvasEditorProvider services={services}>
        <CanvasEditorShell
          initialConfigId={initialPages[0]!.configId}
          initialTab="vorlagen"
          initialProps={{}}
          initialPages={initialPages}
          onExport={() => {}}
          onCancel={() => {}}
        />
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && (Konva.stages.length < 2 || !bridge.deck); i++) await settle();
  expect(Konva.stages.length).toBe(2);
  expect(bridge.deck).not.toBeNull();
  // The first state of each page lands in its history a beat after it mounts.
  await settle();
}

const textOf = (page: number, id: string) => Konva.stages[page]!.findOne<Konva.Text>(`#${id}`)!;

async function growFontOnFirstPage(id = 'text-1') {
  const node = textOf(0, id);
  const before = node.fontSize();
  await act(async () => {
    node.fire('mousedown', { evt: { button: 0 } }, true);
    node.fire('click', { evt: { button: 0 } }, true);
  });
  const [larger] = await screen.findAllByTitle('Schrift vergrößern');
  await act(async () => {
    larger!.click();
  });
  expect(node.fontSize()).toBeGreaterThan(before);
  // The size change lands in the page's history debounced.
  await settle(700);
}

function restyle() {
  const deck = bridge.deck!;
  const pages = deck.getPages();
  act(() => {
    deck.replaceDeck({
      updates: pages.map((p, i) => ({
        pageId: p.id,
        state: {
          ...p.state,
          additionalTexts: [{ ...headerText(`text-${i + 1}`, '#ff0000'), fontSize: 62 }],
        },
      })),
      inserts: [],
      removes: [],
    });
  });
}

async function press(name: RegExp) {
  const button = screen.getAllByRole('button', { name })[0]!;
  await act(async () => {
    button.click();
  });
  await settle();
}

const pressUndo = () => press(/^Rückgängig/);
const pressRedo = () => press(/^Wiederholen/);

describe('Undo after a deck replacement', () => {
  it('takes the replacement back over all pages in one step, then the older text edit', async () => {
    await renderDeck();
    await growFontOnFirstPage();

    restyle();
    await settle();
    expect(textOf(0, 'text-1').fill()).toBe('#ff0000');
    expect(textOf(1, 'text-2').fill()).toBe('#ff0000');

    await pressUndo();
    expect(textOf(0, 'text-1').fill()).toBe('#ffffff');
    expect(textOf(1, 'text-2').fill()).toBe('#ffffff');
    // The older text edit stays: it is a step of its own, taken before.
    expect(textOf(0, 'text-1').fontSize()).toBe(62);

    await pressUndo();
    expect(textOf(0, 'text-1').fontSize()).toBe(60);
  });

  it('redoes in the order the steps were taken', async () => {
    await renderDeck();
    await growFontOnFirstPage();
    restyle();
    await settle();

    await pressUndo();
    await pressUndo();
    expect(textOf(0, 'text-1').fontSize()).toBe(60);

    // The older text edit comes back first, the replacement after it.
    await pressRedo();
    expect(textOf(0, 'text-1').fontSize()).toBe(62);
    expect(textOf(0, 'text-1').fill()).toBe('#ffffff');
    expect(textOf(1, 'text-2').fill()).toBe('#ffffff');

    await pressRedo();
    expect(textOf(0, 'text-1').fill()).toBe('#ff0000');
    expect(textOf(1, 'text-2').fill()).toBe('#ff0000');
  });

  it('keeps a page added before a text edit behind that edit, both ways', async () => {
    await renderDeck();
    act(() => {
      bridge.deck!.replaceDeck({
        updates: [],
        inserts: [
          { afterPageId: 'p2', configId: 'fixture-note', state: pageState('text-3', '#fff') },
        ],
        removes: [],
      });
    });
    await settle();
    expect(bridge.deck!.getPages()).toHaveLength(3);
    await growFontOnFirstPage();

    // The newer step goes first, the page after it.
    await pressUndo();
    expect(textOf(0, 'text-1').fontSize()).toBe(60);
    expect(bridge.deck!.getPages()).toHaveLength(3);
    await pressUndo();
    expect(bridge.deck!.getPages()).toHaveLength(2);

    // And back in the order they were taken.
    await pressRedo();
    expect(bridge.deck!.getPages()).toHaveLength(3);
    expect(textOf(0, 'text-1').fontSize()).toBe(60);
    await pressRedo();
    expect(textOf(0, 'text-1').fontSize()).toBe(62);
  });
});
