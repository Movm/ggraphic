// SPDX-License-Identifier: MPL-2.0
/**
 * Ein Wort, das breiter ist als das Feld, wird mit Trennstrich an Silbengrenzen
 * umbrochen — nicht von Konva mitten im Wort ("Gemeinschaftsga / rten").
 */
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';

function linesOf(text: string, width: number) {
  Konva.autoDrawEnabled = false;
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={800} height={800}>
      <CanvasText id="t" text={text} x={10} y={10} width={width} fontSize={60} fill="#FFFFFF" />
    </CanvasStage>
  );
  return (stageRef.current!.getStage()!.find('Text') as Konva.Text[]).map((n) => n.text());
}

describe('Überschrift mit langem Wort', () => {
  it('trennt "Gemeinschaftsgarten" in einer schmalen Box an Silbengrenzen', () => {
    const lines = linesOf('Gemeinschaftsgarten', 400);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(0, -1).every((l) => l.endsWith('-'))).toBe(true);
    expect(lines.map((l) => l.replace(/-$/, '')).join('')).toBe('Gemeinschaftsgarten');
    // Kein Rest wie "ga" / "rten": jede Zeile endet auf einer Silbengrenze.
    expect(lines.join('|')).not.toMatch(/ga\|rten/);
  });

  it('lässt ein Wort, das passt, unberührt', () => {
    expect(linesOf('Garten', 400)).toEqual(['Garten']);
  });
});
