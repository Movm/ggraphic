// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the Studio's pages can do with their elements: texts, shapes, icons, emoji,
 * illustrations, placed images and the background colour. The editor calls these by name
 * (`OptionalCanvasActions`): the canvas for moves and edits, the sidebar
 * sections for adding, the delete key for removing (`utils/elementKinds.ts`).
 *
 * Every action is one user intent and records one history entry.
 */
import { withBinding, withoutBinding, type BindingRef } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { blockElementIds, type LiftedBlock } from '@ggraphic/editor/blocks/liftedBlock';
import { type IconState } from '@ggraphic/editor/configs/factory/baseTypes';
import { type AdditionalText } from '@ggraphic/editor/configs/types';
import { type AssetInstance, createAssetInstance } from '@ggraphic/editor/utils/canvasAssets';
import { type ExternalIconPayload } from '@ggraphic/editor/utils/externalIcons';
import { createInstanceId } from '@ggraphic/editor/utils/duplicateElement';
import { iconInstanceIdsFor, placedIconId } from '@ggraphic/editor/utils/iconInstances';
import { createIllustration } from '@ggraphic/editor/utils/illustrations/registry';
import { type IllustrationInstance } from '@ggraphic/editor/utils/illustrations/types';
import { createShape, type ShapeInstance, type ShapeType } from '@ggraphic/editor/utils/shapes';
import {
  createUserImageInstanceFromUrl,
  type ElementPlacement,
  type UserImageInstance,
  type UserImagePlacement,
} from '@ggraphic/editor/utils/userImageUtils';

import { fittedFontSize } from './fitting';
import { withHuggedPlates } from './hug';
import { type PageGroup, type StudioPageState } from './pageState';
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

/** The shape fields a person sets by moving or resizing it on the canvas. */
const HAND_GEOMETRY = ['x', 'y', 'width', 'height'] as const;

/** A readable ink on the page's current background. */
function inkFor(background: string): string {
  const match = activeBrand().backgrounds.find(
    (b) => b.color.toLowerCase() === background.toLowerCase()
  );
  if (match) return match.ink;
  const hex = background.replace('#', '');
  if (hex.length !== 6) return activeBrand().colors.textOnDark;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.5 ? activeBrand().colors.textOnLight : activeBrand().colors.textOnDark;
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
      lineHeight: type === 'body' ? 1.3 : activeBrand().lineHeightFactor,
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
        (prev) =>
          // The plates that hug a text follow its new lines, width or size.
          withHuggedPlates({
            ...prev,
            additionalTexts: prev.additionalTexts.map((t) => {
              if (t.id !== id) return t;
              const next = { ...t, ...partial };
              // A committed text change refits a text with a prototype size: shrink as it grows,
              // grow back as it shrinks. A size set by hand in the same change stands.
              if (!('text' in partial) || 'fontSize' in partial) return next;
              const fitted = fittedFontSize(next, prev, height);
              return fitted === null || fitted === next.fontSize
                ? next
                : { ...next, fontSize: fitted };
            }),
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
      const shape = createShape(type, center.x, center.y, activeBrand().colors.secondary, color);
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
          shapeInstances: prev.shapeInstances.map((x) => {
            if (x.id !== id) return x;
            const next = { ...x, ...partial };
            // A plate placed or sized by hand stops hugging its text; otherwise the next text
            // edit, rebind or AI fill would snap it back.
            if (!('hug' in next) || !HAND_GEOMETRY.some((k) => k in partial)) return next;
            const { hug: _hug, ...free } = next;
            return free;
          }),
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
    toggleIcon: (
      id: string,
      selected: boolean,
      options?: ElementPlacement,
      external?: ExternalIconPayload
    ) => {
      if (selected) {
        const placed = placedIconId(id, getState().selectedIcons, () => createInstanceId('icon'));
        const iconState: IconState = {
          x: options?.center?.x ?? width / 2,
          y: options?.center?.y ?? height / 2,
          scale: s,
          rotation: 0,
          color: inkFor(getState().backgroundColor),
          opacity: 1,
          // An icon from the icon search: the page keeps its markup (to draw it) and its source (to credit it).
          ...(placed.iconId ? { iconId: placed.iconId } : {}),
          ...(external ? { svg: external.svg, source: external.source } : {}),
        };
        commit((prev) => ({
          ...prev,
          selectedIcons: [...prev.selectedIcons, placed.id],
          iconStates: { ...prev.iconStates, [placed.id]: iconState },
          layerOrder: withLayer(prev.layerOrder, placed.id),
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

    // ── Emoji and other catalogue graphics ───────────────────────────────────
    addAsset: (assetId: string, options?: ElementPlacement) => {
      const placed: AssetInstance = {
        ...createAssetInstance(assetId, width, height),
        ...options?.center,
      };
      commit((prev) => ({
        ...prev,
        assetInstances: [...prev.assetInstances, placed],
        layerOrder: withLayer(prev.layerOrder, placed.id),
      }));
    },
    updateAsset: (id: string, partial: Partial<AssetInstance>) =>
      commit(
        (prev) => ({
          ...prev,
          assetInstances: prev.assetInstances.map((x) => (x.id === id ? { ...x, ...partial } : x)),
        }),
        true
      ),
    removeAsset: (id: string) =>
      commit((prev) => ({
        ...prev,
        assetInstances: prev.assetInstances.filter((x) => x.id !== id),
        layerOrder: withoutLayer(prev.layerOrder, id),
      })),

    // ── Illustrations ────────────────────────────────────────────────────────
    addIllustration: (id: string, options?: ElementPlacement) => {
      void createIllustration(id, width, height).then((created) => {
        // The primitive centres the artwork on x/y.
        const placed: IllustrationInstance = { ...created, ...options?.center };
        commit((prev) => ({
          ...prev,
          illustrationInstances: [...prev.illustrationInstances, placed],
          layerOrder: withLayer(prev.layerOrder, placed.id),
        }));
      });
    },
    updateIllustration: (id: string, partial: Partial<IllustrationInstance>) =>
      commit(
        (prev) => ({
          ...prev,
          illustrationInstances: prev.illustrationInstances.map((x) =>
            x.id === id ? ({ ...x, ...partial } as IllustrationInstance) : x
          ),
        }),
        true
      ),
    removeIllustration: (id: string) =>
      commit((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.filter((x) => x.id !== id),
        layerOrder: withoutLayer(prev.layerOrder, id),
      })),

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

    // ── Blocks ───────────────────────────────────────────────────────────────
    // A placed block is one history step; its parts form a group, and the page takes the block's
    // colour world when it has none, so a brand change later rebinds the block as it does the page.
    insertBlock: (block: LiftedBlock) => {
      // Once, outside `commit`: it runs the change for the state and again for the history entry.
      const ids = blockElementIds(block);
      const group: PageGroup = {
        id: newId('group'),
        ...(block.blockRef && { blockRef: block.blockRef }),
        elementIds: ids,
      };
      commit((prev) => {
        return {
          ...prev,
          additionalTexts: [...prev.additionalTexts, ...block.additionalTexts],
          shapeInstances: [...prev.shapeInstances, ...block.shapeInstances],
          assetInstances: [...(prev.assetInstances ?? []), ...block.assetInstances],
          chartInstances: [...(prev.chartInstances ?? []), ...block.chartInstances],
          userImageInstances: [...prev.userImageInstances, ...block.userImageInstances],
          pillBadgeInstances: [...(prev.pillBadgeInstances ?? []), ...block.pillBadgeInstances],
          circleBadgeInstances: [
            ...(prev.circleBadgeInstances ?? []),
            ...block.circleBadgeInstances,
          ],
          selectedIcons: [...prev.selectedIcons, ...block.selectedIcons],
          iconStates: { ...prev.iconStates, ...block.iconStates },
          layerOrder: [...(prev.layerOrder ?? []), ...block.layerOrder],
          // A group of one is no group (`pruneGroups` would drop it anyway).
          ...(ids.length > 1 && { groups: [...(prev.groups ?? []), group] }),
          ...(!prev.brandScheme && block.brandScheme && { brandScheme: block.brandScheme }),
        };
      });
    },

    // ── Background ───────────────────────────────────────────────────────────
    // A swatch pick carries its role: the ground then follows the brand. A free colour unbinds it.
    setBackgroundColor: (color: string, ref?: BindingRef) =>
      commit((prev) => {
        const { bind: _previous, ...rest } = prev;
        const bind = ref
          ? withBinding(prev.bind, 'backgroundColor', { ref, value: color })
          : withoutBinding(prev.bind, 'backgroundColor');
        return { ...rest, backgroundColor: color, ...(bind ? { bind } : {}) };
      }, true),
  };
}

export type StudioActions = ReturnType<typeof createStudioActions>;
