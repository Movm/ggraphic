// SPDX-License-Identifier: MPL-2.0
import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { SlotBudgetStatus } from '@ggraphic/editor/components/SlotBudgetStatus';
import { registerMessages } from '@ggraphic/editor/i18n/messages';
import { useCanvasStore } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { CanvasStoreProvider } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { cleanup, render, screen } from '@testing-library/react';
import Konva from 'konva';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { axe } from '../../test-utils';

import type { CanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';

const ELEVEN_WORDS = 'one two three four five six seven eight nine ten eleven';

const text = (over: Record<string, unknown> = {}) => ({
  id: 'headline',
  text: ELEVEN_WORDS,
  type: 'header',
  x: 100,
  y: 100,
  width: 800,
  fontSize: 60,
  fontFamily: 'sans-serif',
  fill: '#000',
  ...over,
});

const services: CanvasEditorServices = {
  slotBudgets: { budgetFor: () => ({ budget: { maxWords: 8 }, role: 'headline' }) },
};

function Select({ id }: { id: string | null }) {
  const store = useCanvasStore();
  useEffect(() => store.getState().setSelectedElement(id), [store, id]);
  return null;
}

function Harness({
  additionalTexts,
  selected = 'headline',
  svc = services,
}: {
  additionalTexts: unknown[];
  selected?: string | null;
  svc?: CanvasEditorServices;
}) {
  return (
    <CanvasEditorProvider services={svc}>
      <CanvasStoreProvider>
        <Select id={selected} />
        <SlotBudgetStatus
          state={{ additionalTexts, templateRef: { id: 't', version: 1 } }}
          canvasWidth={1000}
          canvasHeight={1000}
        />
      </CanvasStoreProvider>
    </CanvasEditorProvider>
  );
}

beforeEach(() => registerMessages('en'));
afterEach(() => {
  cleanup();
  registerMessages('de');
});

describe('SlotBudgetStatus', () => {
  it('renders nothing when the selected text is within budget', () => {
    const { container } = render(
      <Harness additionalTexts={[text({ text: 'three short words' })]} />
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders nothing without the host service or without a selection', () => {
    const a = render(<Harness additionalTexts={[text()]} svc={{}} />);
    expect(a.container.querySelector('[role="status"]')).toBeNull();
    a.unmount();
    const b = render(<Harness additionalTexts={[text()]} selected={null} />);
    expect(b.container.querySelector('[role="status"]')).toBeNull();
  });

  it('shows "11 of 8 words" for an over-budget text, as role="status"', () => {
    render(<Harness additionalTexts={[text()]} />);
    expect(screen.getByRole('status').textContent).toContain('11 of 8 words');
  });

  it('shows the font-size message below 0.035 of canvas height and recomputes after a format change', () => {
    const { rerender } = render(<Harness additionalTexts={[text({ text: 'ok', fontSize: 20 })]} />);
    expect(screen.getByRole('status').textContent).toMatch(/35 px/);
    rerender(<Harness additionalTexts={[text({ text: 'ok', fontSize: 40 })]} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not block editing: the text stays editable and the value is kept', () => {
    const texts = [text()];
    const { container } = render(<Harness additionalTexts={texts} />);
    expect(texts[0]!.text).toBe(ELEVEN_WORDS);
    const status = container.querySelector('[role="status"]')!;
    expect(status.querySelector('button, input, textarea, a, [tabindex]')).toBeNull();
    expect(getComputedStyle(status as HTMLElement).pointerEvents).toBe('none');
  });

  it('is not part of the stage capture', () => {
    // A capture renders the Konva stage only; the status must be plain DOM beside it.
    const host = document.createElement('div');
    document.body.append(host);
    const stage = new Konva.Stage({ container: host, width: 20, height: 20 });
    stage.add(new Konva.Layer());
    const nodesBefore = stage.find('*').length;
    const { container } = render(<Harness additionalTexts={[text()]} />);
    const status = container.querySelector('[role="status"]')!;
    expect(status).not.toBeNull();
    expect(status.closest('.konvajs-content')).toBeNull();
    expect(host.querySelector('.konvajs-content')?.contains(status)).toBe(false);
    expect(stage.find('*').length).toBe(nodesBefore);
    stage.destroy();
    host.remove();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness additionalTexts={[text()]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
