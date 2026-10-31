// SPDX-License-Identifier: MPL-2.0
/**
 * Beim Tippen zeigt der Editor die Schrift, die der Text beim Übernehmen bekommt, und der Wirt
 * darf davor schon seine Platten nachführen. Nur der Wirt schreibt dabei etwas; der Entwurf
 * selbst wandert weiterhin erst beim Abschließen nach oben.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { commitOpenTextEdit } from '@ggraphic/editor/components/CanvasTextOverlay';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';

vi.mock('@ggraphic/editor/components/RichTextField', () => ({
  RichTextField: ({
    value,
    onChange,
    contentStyle,
  }: {
    value: string;
    onChange: (v: string) => void;
    contentStyle?: { fontSize?: number | string };
  }) => (
    <textarea
      aria-label="Entwurf"
      data-font-size={String(contentStyle?.fontSize)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

afterEach(cleanup);

async function open(onTextPreview: (draft: string | null) => number | null) {
  const onTextChange = vi.fn();
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="text-1"
        x={10}
        y={20}
        width={400}
        fontSize={40}
        text="Klimaschutz"
        editable
        onTextChange={onTextChange}
        onTextPreview={onTextPreview}
      />
    </CanvasStage>
  );
  const node = stageRef.current?.getStage()?.findOne('#text-1');
  if (!node) throw new Error('Textknoten nicht auf der Bühne gefunden');
  act(() => {
    node.fire('dblclick');
  });
  return { onTextChange, field: await screen.findByLabelText('Entwurf') };
}

describe('Vorschau beim Tippen', () => {
  it('fragt den Wirt bei jedem Tastendruck und zeigt die zurückgegebene Schrift, ohne zu übernehmen', async () => {
    const onTextPreview = vi.fn(() => 22);
    const { onTextChange, field } = await open(onTextPreview);
    expect(field.dataset['fontSize']).toBe('40');

    fireEvent.change(field, { target: { value: 'Klimaschutz jetzt' } });

    expect(onTextPreview).toHaveBeenCalledWith('Klimaschutz jetzt');
    expect(onTextChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Entwurf').dataset['fontSize']).toBe('22');
  });

  it('behält die Schrift des Feldes, wenn der Wirt keine Größe nennt', async () => {
    const { field } = await open(() => null);
    fireEvent.change(field, { target: { value: 'Klimaschutz jetzt' } });
    expect(screen.getByLabelText('Entwurf').dataset['fontSize']).toBe('40');
  });

  it('nimmt die Vorschau zurück, wenn der Entwurf unverändert abgeschlossen wird', async () => {
    const onTextPreview = vi.fn(() => 22);
    const { onTextChange, field } = await open(onTextPreview);
    fireEvent.change(field, { target: { value: 'Klimaschutz jetzt' } });
    fireEvent.change(field, { target: { value: 'Klimaschutz' } });

    act(() => commitOpenTextEdit());

    expect(onTextPreview).toHaveBeenLastCalledWith(null);
    expect(onTextChange).not.toHaveBeenCalled();
  });

  it('lässt die Vorschau stehen, wenn der Entwurf übernommen wird: der Wirt schreibt ihn selbst', async () => {
    const onTextPreview = vi.fn(() => 22);
    const { onTextChange, field } = await open(onTextPreview);
    fireEvent.change(field, { target: { value: 'Klimaschutz jetzt' } });

    act(() => commitOpenTextEdit());

    expect(onTextChange).toHaveBeenCalledWith('Klimaschutz jetzt');
    expect(onTextPreview).not.toHaveBeenCalledWith(null);
  });
});
