// SPDX-License-Identifier: MPL-2.0
/**
 * Custom element kinds: the registration, the renderer registry, and what a renderer needs from the
 * canvas (transformer presets, lock state, snapping, focus return, stage follow, pixel hit area,
 * rotation, text editing).
 *
 * A kind has two halves. Its type side is an entry in `HostElementKinds` (where its list lives in the
 * page state, one instance, the payload of a tile that adds it) plus its actions in
 * `HostCanvasActions`, both declared by augmenting this module. Its runtime side is
 * `registerElementKind` (no Konva) and `registerKindRenderers` (the drawing). The page config holds
 * the list under `stateKey` and implements the named actions.
 *
 * @example A sticky note
 * ```tsx
 * import { Group, Rect, Text } from 'react-konva';
 * import {
 *   createSelectableWrapper,
 *   registerElementKind,
 *   registerKindRenderers,
 * } from '@ggraphic/editor/kinds';
 *
 * interface Note {
 *   id: string;
 *   x: number;
 *   y: number;
 *   width: number;
 *   text: string;
 * }
 *
 * declare module '@ggraphic/editor/kinds' {
 *   interface HostElementKinds {
 *     note: { stateKey: 'notes'; data: Note; payload: { text: string } };
 *   }
 *   interface HostCanvasActions {
 *     addNote?(text: string): void;
 *     updateNote?(id: string, patch: Partial<Note>): void;
 *     removeNote?(id: string): void;
 *   }
 * }
 *
 * registerElementKind({
 *   kind: 'note',
 *   stateKey: 'notes',
 *   actions: { update: 'updateNote', remove: 'removeNote' },
 *   add: { action: 'addNote', args: (payload) => [payload.text] },
 *   name: () => 'Note',
 *   layerContent: (note) => note.text,
 *   duplicate: (note, id, offset) => ({ ...note, id, x: note.x + offset.x, y: note.y + offset.y }),
 *   nudge: (note, delta) => ({ x: note.x + delta.x, y: note.y + delta.y }),
 * });
 *
 * function NoteNode(props: {
 *   note: Note;
 *   selected: boolean;
 *   onSelect: () => void;
 *   onMove: (x: number, y: number) => void;
 * }) {
 *   const { note, selected, onSelect, onMove } = props;
 *   return (
 *     <Group
 *       id={note.id}
 *       x={note.x}
 *       y={note.y}
 *       draggable
 *       onClick={onSelect}
 *       onTap={onSelect}
 *       onDragEnd={(e) => onMove(e.target.x(), e.target.y())}
 *     >
 *       <Rect width={note.width} height={note.width} fill="#fff3a0" stroke={selected ? '#2563eb' : undefined} />
 *       <Text text={note.text} width={note.width} padding={12} fontSize={24} />
 *     </Group>
 *   );
 * }
 *
 * const SelectableNote = createSelectableWrapper(NoteNode);
 *
 * registerKindRenderers({
 *   note: (item, ctx) => (
 *     <SelectableNote
 *       key={item.id}
 *       elementId={item.id}
 *       note={item.data}
 *       onSelect={() => ctx.handlers.handleElementSelect(item.id)}
 *       onMove={(x, y) => ctx.handlers.actions.updateNote?.(item.id, { x, y })}
 *     />
 *   ),
 * });
 * ```
 */
export { registerElementKind, type ElementKindRegistration } from '../utils/elementKinds.js';
export {
  type HostElementKinds,
  type HostElementKindName,
  type HostElementData,
  type HostElementStateKey,
  type HostElementPayload,
} from '../utils/canvasItem.js';
export {
  registerKindRenderers,
  createSelectableWrapper,
  type HostKindRenderers,
  type KindRenderer,
  type RenderCtx,
  type CanvasRenderHandlers,
} from '../components/kindRenderers.js';
export { ELEMENT_TRANSFORMER, normalizeRotation } from '../utils/orientation.js';
export { LOCKED_TRANSFORMER, useIsItemLocked } from '../components/canvasItemLock.js';
export { snapByBounds, type SnapLine, type SnapTarget } from '../utils/snapping.js';
export { useSnapScheduler } from '../hooks/useSnapScheduler.js';
export { isGroupDrag } from '../utils/multiSelect.js';
export { captureFocusOrigin, returnFocus, type FocusOrigin } from '../utils/editorFocus.js';
export { followStage } from '../utils/followStage.js';
export { applyPixelHitArea } from '../utils/pixelHitArea.js';
export { useTextEditorOpener } from '../utils/textEditorOpeners.js';
export { type HostCanvasActions } from '../hooks/useCanvasElementHandlers.js';
