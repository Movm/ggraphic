// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the Studio's pages can do with their elements: texts, shapes, icons,
 * placed images and the background colour. The editor calls these by name
 * (`OptionalCanvasActions`): the canvas for moves and edits, the sidebar
 * sections for adding, the delete key for removing (`utils/elementKinds.ts`).
 *
 * Every action is one user intent and records one history entry.
 */
import { studioBrand } from '../../brand';
import { type IconState } from '@ggraphic/editor/configs/factory/baseTypes';
import { type AdditionalText } from '@ggraphic/editor/configs/types';
import { iconInstanceIdsFor } from '@ggraphic/editor/utils/iconInstances';
import { createShape, type ShapeInstance, type ShapeType } from '@ggraphic/editor/utils/shapes';
import {
  createUserImageInstanceFromUrl,
  type ElementPlacement,
  type UserImageInstance,
  type UserImagePlacement,
} from '@ggraphic/editor/utils/userImageUtils';

import { type StudioPageState } from './pageState';
import { headlineFont, bodyFont, scaleFor } from './typography';

type SetState = (
  partial: Partial<StudioPageState> | ((prev: StudioPageState) => StudioPageState)
) => void;
type SaveHistory = (state?: StudioPageState) => void;

let idCounter = 0;
const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const withLayer = (order: readonly string[] | undefined, id: string) => [...(order ?? []), id];
const withoutLayer = (order: readonly string[] | undefined, id: string) =>
  (order ?? []).filter((entry) => entry !== id);

/** A readable ink on the page's current background. */
function inkFor(background: string): string {
  const match = studioBrand.backgrounds.find(
    (b) => b.color.toLowerCase() === background.toLowerCase()
  );
  if (match) return match.ink;
  const hex = background.replace('#', '');
  if (hex.length !== 6) return studioBrand.colors.textOnDark;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.5 ? studioBrand.colors.textOnLight : studioBrand.colors.textOnDark;
}

const TEXT_PRESETS = {
  header: { text: 'Headline', size: 88, font: headlineFont, style: 'bold' as const },
  subheader: { text: 'Subheading', size: 52, font: headlineFont, style: 'normal' as const },
  body: { text: 'Your text here', size: 36, font: bodyFont, style: 'normal' as const },
};

export function createStudioActions(
  getState: () => StudioPageState,
  setState: SetState,
  saveToHistory: SaveHistory,
  debouncedSaveToHistory: SaveHistory,
  width: number,
  height: number
) {
  const s = scaleFor(width, height);

  /** Applies `change` and records it, immediately or coalesced with its neighbours. */
  const commit = (change: (prev: StudioPageState) => StudioPageState, debounced = false) => {
    setState(change);
    (debounced ? debouncedSaveToHistory : saveToHistory)(change(getState()));
  };

  const addText = (type: AdditionalText['type'], content?: string) => {
    const preset = TEXT_PRESETS[type];
    const textWidth = Math.round(width * 0.7);
    const text: AdditionalText = {
      id: newId('text'),
      text: content ?? preset.text,
      type,
      x: Math.round((width - textWidth) / 2),
      y: Math.round(height * (type === 'header' ? 0.3 : type === 'subheader' ? 0.42 : 0.52)),
      width: textWidth,
      fontSize: Math.round(preset.size * s),
      fontFamily: preset.font(),
      fontStyle: preset.style,
      fill: inkFor(getState().backgroundColor),
      align: 'center',
      lineHeight: type === 'body' ? 1.3 : studioBrand.lineHeightFactor,
    };
    commit((prev) => ({
      ...prev,
      additionalTexts: [...prev.additionalTexts, text],
      layerOrder: withLayer(prev.layerOrder, text.id),
    }));
  };

  return {
    // ── Texts ────────────────────────────────────────────────────────────────
    addHeader: () => addText('header'),
    addSubheader: () => addText('subheader'),
    addText: () => addText('body'),
    addBodyTextWithContent: (content: string) => addText('body', content),
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) =>
      commit(
        (prev) => ({
          ...prev,
          additionalTexts: prev.additionalTexts.map((t) =>
            t.id === id ? { ...t, ...partial } : t
          ),
        }),
        true
      ),
    removeAdditionalText: (id: string) =>
      commit((prev) => ({
        ...prev,
        additionalTexts: prev.additionalTexts.filter((t) => t.id !== id),
        layerOrder: withoutLayer(prev.layerOrder, id),
      })),

    // ── Shapes ───────────────────────────────────────────────────────────────
    addShape: (type: ShapeType, color?: string, options?: ElementPlacement) => {
      const center = options?.center ?? { x: width / 2, y: height / 2 };
      const shape = createShape(type, center.x, center.y, studioBrand.colors.secondary, color);
      const placed: ShapeInstance = { ...shape, id: newId('shape') };
      commit((prev) => ({
        ...prev,
        shapeInstances: [...prev.shapeInstances, placed],
        layerOrder: withLayer(prev.layerOrder, placed.id),
      }));
    },
    updateShape: (id: string, partial: Partial<ShapeInstance>) =>
      commit(
        (prev) => ({
          ...prev,
          shapeInstances: prev.shapeInstances.map((x) => (x.id === id ? { ...x, ...partial } : x)),
        }),
        true
      ),
    removeShape: (id: string) =>
      commit((prev) => ({
        ...prev,
        shapeInstances: prev.shapeInstances.filter((x) => x.id !== id),
        layerOrder: withoutLayer(prev.layerOrder, id),
      })),

    // ── Icons ────────────────────────────────────────────────────────────────
    // `selectedIcons` lists instance ids; the first copy of an icon carries its catalogue id.
    toggleIcon: (id: string, selected: boolean, options?: ElementPlacement) => {
      if (selected) {
        const iconState: IconState = {
          x: options?.center?.x ?? width / 2,
          y: options?.center?.y ?? height / 2,
          scale: s,
          rotation: 0,
          color: inkFor(getState().backgroundColor),
          opacity: 1,
        };
        commit((prev) => ({
          ...prev,
          selectedIcons: [...prev.selectedIcons, id],
          iconStates: { ...prev.iconStates, [id]: iconState },
          layerOrder: withLayer(prev.layerOrder, id),
        }));
        return;
      }
      commit((prev) => {
        const doomed = new Set(iconInstanceIdsFor(id, prev.selectedIcons, prev.iconStates));
        return {
          ...prev,
          selectedIcons: prev.selectedIcons.filter((i) => !doomed.has(i)),
          iconStates: Object.fromEntries(
            Object.entries(prev.iconStates).filter(([key]) => !doomed.has(key))
          ),
          layerOrder: (prev.layerOrder ?? []).filter((entry) => !doomed.has(entry)),
        };
      });
    },
    updateIcon: (id: string, partial: Partial<IconState>) =>
      commit(
        (prev) => ({
          ...prev,
          iconStates: { ...prev.iconStates, [id]: { ...prev.iconStates[id]!, ...partial } },
        }),
        true
      ),

    // ── Placed images (uploads) ──────────────────────────────────────────────
    addUserImageFromUrl: (url: string, fileName: string, options?: UserImagePlacement) => {
      void createUserImageInstanceFromUrl(url, fileName, width, height, options).then((image) =>
        commit((prev) => ({
          ...prev,
          userImageInstances: [...prev.userImageInstances, image],
          layerOrder: withLayer(prev.layerOrder, image.id),
        }))
      );
    },
    updateUserImage: (id: string, partial: Partial<UserImageInstance>) =>
      commit(
        (prev) => ({
          ...prev,
          userImageInstances: prev.userImageInstances.map((x) =>
            x.id === id ? { ...x, ...partial } : x
          ),
        }),
        true
      ),
    removeUserImage: (id: string) =>
      commit((prev) => ({
        ...prev,
        userImageInstances: prev.userImageInstances.filter((x) => x.id !== id),
        layerOrder: withoutLayer(prev.layerOrder, id),
      })),

    // ── Background ───────────────────────────────────────────────────────────
    setBackgroundColor: (color: string) =>
      commit((prev) => ({ ...prev, backgroundColor: color }), true),
  };
}

export type StudioActions = ReturnType<typeof createStudioActions>;
