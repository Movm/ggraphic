// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A host document tab may follow what the deck holds: `isAvailable` sees the
 * pages, and is asked again when a page changes.
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

const plain: Page[] = [
  { id: 'p1', configId: 'fixture-note', state: pageState('text-1', '#ffffff') },
];

const tab = (id: string, label: string) => ({
  id,
  icon: (() => null) as never,
  label,
  ariaLabel: label,
});

async function renderDeck(initialPages: Page[]) {
  bridge.deck = null;
  registerEditorShell({
    tabs: [
      {
        tab: tab('probe', 'Probe'),
        insertAt: (tabs) => tabs.length,
        isAvailable: () => true,
        Section: (props) => {
          bridge.deck = props.deck;
          return null;
        },
      },
      {
        tab: tab('marked', 'Markiert'),
        insertAt: (tabs) => tabs.length,
        isAvailable: ({ pages }) => pages.some((p) => p.state.marked === true),
        Section: () => null,
      },
    ],
  });
  await act(async () => {
    render(
      <CanvasEditorProvider services={services}>
        <CanvasEditorShell
          initialConfigId={initialPages[0]!.configId}
          initialTab="probe"
          initialProps={{}}
          initialPages={initialPages}
          onExport={() => {}}
          onCancel={() => {}}
        />
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && !bridge.deck; i++) await settle();
  expect(bridge.deck).not.toBeNull();
}

const markedTab = () => screen.queryAllByRole('button', { name: /^Markiert/ });

describe('Document tab availability', () => {
  it('follows the pages: hidden until a page qualifies, shown once one does', async () => {
    await renderDeck(plain);
    expect(markedTab()).toHaveLength(0);

    const deck = bridge.deck!;
    act(() => {
      deck.replaceDeck({
        updates: deck
          .getPages()
          .map((p) => ({ pageId: p.id, state: { ...p.state, marked: true } })),
        inserts: [],
        removes: [],
      });
    });
    await settle();
    expect(markedTab().length).toBeGreaterThan(0);
  });
});
