// SPDX-License-Identifier: AGPL-3.0-only
import { messages } from '../../i18n/catalogue.js';
/**
 * Common Action Creators for Canvas Factory
 *
 * Reusable action creator functions that work with any canvas state.
 * These eliminate the need to duplicate action logic across configs.
 */

import { type BrandPack } from '@ggraphic/core';

import { activeBrand } from '../../brand/brandRegistry.js';
import { createAssetInstance, createStickerInstance } from '../../utils/canvasAssets.js';
import { createChartInstance, type ChartInstance, type ChartType } from '../../utils/chartUtils.js';
import { createCircleBadgeInstance } from '../../utils/circleBadgeUtils.js';
import { brandColors } from '../../utils/colorOptions.js';
import { createInstanceId, duplicateElementInState } from '../../utils/duplicateElement.js';
import { createFrameInstance } from '../../utils/framePresets.js';
import { iconInstanceIdsFor, placedIconId } from '../../utils/iconInstances.js';
import { createIllustration } from '../../utils/illustrations/registry.js';
import { createPillBadgeInstance } from '../../utils/pillBadgeUtils.js';
import { createShape } from '../../utils/shapes.js';
import {
  createUserImageInstance,
  createUserImageInstanceFromUrl,
} from '../../utils/userImageUtils.js';
import { v4 as uuid } from 'uuid';

import type { IconState, BaseCanvasState } from './baseTypes.js';
import type { AdditionalText, CanvasActionHistory } from '../types.js';
import type { AssetInstance } from '../../utils/canvasAssets.js';
import type { CircleBadgeInstance } from '../../utils/circleBadgeUtils.js';
import type { ExternalIconPayload } from '../../utils/externalIcons.js';
import type { FrameClipType, FrameInstance } from '../../utils/frameUtils.js';
import type { IllustrationInstance } from '../../utils/illustrations/types.js';
import type { PillBadgeInstance } from '../../utils/pillBadgeUtils.js';
import type { ShapeInstance, ShapeType } from '../../utils/shapes.js';
import type {
  ElementPlacement,
  ImageAdjustments,
  UserImageInstance,
  UserImagePlacement,
} from '../../utils/userImageUtils.js';
import type { StickerRef } from '@ggraphic/schema';

// ============================================================================
// TYPE HELPERS
// ============================================================================

type StateSetter<TState> = (partial: Partial<TState> | ((prev: TState) => TState)) => void;
type HistorySaver<TState> = (state: TState) => void;

/**
 * Hält noch eine ANDERE Instanz dieselbe Bild-URL? Ein Duplikat teilt sie mit
 * seinem Original — gäbe das Löschen des einen die Blob-URL frei, würde das
 * Bild des anderen schwarz. Freigegeben wird deshalb erst, wenn die letzte
 * Instanz geht.
 */
function isLastHolder<T>(
  instances: T[],
  srcOf: (instance: T) => string | null | undefined,
  url: string
): boolean {
  return instances.filter((instance) => srcOf(instance) === url).length <= 1;
}

// ============================================================================
// ASSET ACTIONS
// ============================================================================

export function createAssetActions<TState extends { assetInstances: AssetInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  insertScale = 1
) {
  return {
    addAsset: (assetId: string, options?: ElementPlacement) => {
      // Assets are anchored at their centre.
      const newInstance = {
        ...createAssetInstance(assetId, canvasWidth, canvasHeight),
        ...(insertScale !== 1 ? { scale: insertScale } : {}),
        ...options?.center,
      };
      setState((prev) => ({
        ...prev,
        assetInstances: [...prev.assetInstances, newInstance],
      }));
      saveToHistory(getState());
    },
    addStickerAsset: (ref: StickerRef, options?: ElementPlacement) => {
      const sticker = createStickerInstance(ref, canvasWidth, canvasHeight);
      if (!sticker) return;
      const newInstance = {
        ...sticker,
        ...(insertScale !== 1 ? { scale: insertScale } : {}),
        ...options?.center,
      };
      setState((prev) => ({
        ...prev,
        assetInstances: [...prev.assetInstances, newInstance],
      }));
      saveToHistory(getState());
    },
    updateAsset: (id: string, partial: Partial<AssetInstance>) => {
      setState((prev) => ({
        ...prev,
        assetInstances: prev.assetInstances.map((a) => (a.id === id ? { ...a, ...partial } : a)),
      }));
      debouncedSaveToHistory(getState());
    },
    removeAsset: (id: string) => {
      setState((prev) => ({
        ...prev,
        assetInstances: prev.assetInstances.filter((a) => a.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// ICON ACTIONS
// ============================================================================

export interface IconActionsConfig {
  defaultColor?: string;
  defaultOpacity?: number;
  /** Startgröße neuer Icons (`insertScaleFor`); 1 auf Sharepics. */
  defaultScale?: number;
}

export function createIconActions<
  TState extends { selectedIcons: string[]; iconStates: Record<string, IconState> },
>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  config: IconActionsConfig = {}
) {
  const { defaultColor, defaultOpacity = 1, defaultScale = 1 } = config;

  return {
    toggleIcon: (
      id: string,
      selected: boolean,
      options?: ElementPlacement,
      external?: ExternalIconPayload
    ) => {
      if (selected) {
        const placed = placedIconId(id, getState().selectedIcons, () => createInstanceId('icon'));
        const newIconState: IconState = {
          x: options?.center?.x ?? canvasWidth / 2,
          y: options?.center?.y ?? canvasHeight / 2,
          scale: defaultScale,
          rotation: 0,
          ...(defaultColor ? { color: defaultColor } : {}),
          opacity: defaultOpacity,
          ...(placed.iconId ? { iconId: placed.iconId } : {}),
          ...(external ? { svg: external.svg, source: external.source } : {}),
        };
        setState((prev) => ({
          ...prev,
          selectedIcons: [...prev.selectedIcons, placed.id],
          iconStates: { ...prev.iconStates, [placed.id]: newIconState },
        }));
      } else {
        setState((prev) => {
          // `id` kommt entweder als Katalog-ID aus der Seitenleiste — dort steht
          // je Icon EIN Eintrag zum Anklicken, gemeint sind also alle Kopien —
          // oder als Instanz-ID aus dem Entf-Zweig, und dann genau diese eine.
          // `iconInstanceIdsFor` trifft beides, weil die Instanz-ID einer Kopie
          // nie die Katalog-ID einer anderen ist.
          const doomed = new Set(iconInstanceIdsFor(id, prev.selectedIcons, prev.iconStates));
          const restStates = Object.fromEntries(
            Object.entries(prev.iconStates).filter(([key]) => !doomed.has(key))
          );
          return {
            ...prev,
            selectedIcons: prev.selectedIcons.filter((i) => !doomed.has(i)),
            iconStates: restStates,
          };
        });
      }
      saveToHistory(getState());
    },
    updateIcon: (id: string, partial: Partial<IconState>) => {
      setState((prev) => ({
        ...prev,
        iconStates: {
          ...prev.iconStates,
          [id]: { ...prev.iconStates[id], ...partial },
        },
      }));
      debouncedSaveToHistory(getState());
    },
    handleIconDragEnd: (id: string, x: number, y: number) => {
      setState((prev) => ({
        ...prev,
        iconStates: {
          ...prev.iconStates,
          [id]: { ...prev.iconStates[id], x, y },
        },
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// SHAPE ACTIONS
// ============================================================================

export function createShapeActions<TState extends { shapeInstances: ShapeInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  /** The fill of a shape that names none; absent: the first colour of `brand`. */
  defaultColor?: string,
  insertScale = 1,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  const baseColor = defaultColor ?? brandColors(brand)[0]?.value ?? '#000000';
  return {
    addShape: (type: ShapeType, color?: string, options?: ElementPlacement) => {
      const center = options?.center ?? { x: canvasWidth / 2, y: canvasHeight / 2 };
      const created = createShape(type, center.x, center.y, baseColor, color, brand);
      const newShape =
        insertScale === 1
          ? created
          : {
              ...created,
              width: created.width * insertScale,
              height: created.height * insertScale,
            };
      setState((prev) => ({
        ...prev,
        shapeInstances: [...prev.shapeInstances, newShape],
      }));
      saveToHistory(getState());
    },
    updateShape: (id: string, partial: Partial<ShapeInstance>) => {
      setState((prev) => ({
        ...prev,
        shapeInstances: prev.shapeInstances.map((s) => (s.id === id ? { ...s, ...partial } : s)),
      }));
      debouncedSaveToHistory(getState());
    },
    removeShape: (id: string) => {
      setState((prev) => ({
        ...prev,
        shapeInstances: prev.shapeInstances.filter((s) => s.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// ILLUSTRATION ACTIONS
// ============================================================================

export function createIllustrationActions<
  TState extends { illustrationInstances: IllustrationInstance[] },
>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  return {
    addIllustration: (id: string, options?: ElementPlacement) => {
      void createIllustration(id, canvasWidth, canvasHeight, brand).then((created) => {
        if (!created) return;
        // The primitive centres the artwork on x/y.
        const newIllustration = { ...created, ...options?.center };
        setState((prev) => ({
          ...prev,
          illustrationInstances: [...prev.illustrationInstances, newIllustration],
        }));
        saveToHistory(getState());
      });
    },
    updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.map((i) =>
          i.id === id ? { ...i, ...partial } : i
        ),
      }));
      debouncedSaveToHistory(getState());
    },
    removeIllustration: (id: string) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.filter((i) => i.id !== id),
      }));
      saveToHistory(getState());
    },
    duplicateIllustration: (illustrationId: string) => {
      const result = duplicateElementInState(getState(), illustrationId);
      if (!result) return;
      setState(result.state);
      saveToHistory(result.state);
    },
    handleIllustrationDragEnd: (illustrationId: string, x: number, y: number) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.map((i) =>
          i.id === illustrationId ? { ...i, x, y } : i
        ),
      }));
      saveToHistory(getState());
    },
    handleIllustrationTransformEnd: (
      illustrationId: string,
      width: number,
      height: number,
      rotation?: number
    ) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.map((i) =>
          i.id === illustrationId
            ? { ...i, width, height, ...(rotation !== undefined ? { rotation } : {}) }
            : i
        ),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// ADDITIONAL TEXT ACTIONS
// ============================================================================

// Read per call, not at import: the brand packs are registered after the modules load.
// Every text is born bound to the brand font its family stands for, so a brand change takes it along.
function additionalTextDefaults(brand: BrandPack) {
  const { fonts } = brand;
  return {
    header: {
      fontSize: 48,
      fontFamily: `${fonts.headline}, Arial, sans-serif`,
      bind: { fontFamily: { ref: 'font.headline', value: fonts.headline } },
      fontStyle: 'normal' as const,
      width: 400,
    },
    subheader: {
      fontSize: 36,
      fontFamily: `${fonts.headline}, Arial, sans-serif`,
      bind: { fontFamily: { ref: 'font.headline', value: fonts.headline } },
      fontStyle: 'normal' as const,
      width: 400,
    },
    body: {
      fontSize: 32,
      fontFamily: `${fonts.body}, Arial, sans-serif`,
      bind: { fontFamily: { ref: 'font.body', value: fonts.body } },
      width: 400,
    },
  } satisfies Record<string, Partial<AdditionalText>>;
}

/**
 * Voreinstellung einer Textart, mit `insertScale` vergrößert; zentriert über
 * der Seitenmitte. Bei 1 genau die Sharepic-Werte.
 */
function textPreset(
  type: keyof ReturnType<typeof additionalTextDefaults>,
  canvasWidth: number,
  s: number,
  brand: BrandPack
) {
  const preset = additionalTextDefaults(brand)[type];
  const width = preset.width * s;
  return {
    ...preset,
    fontSize: preset.fontSize * s,
    width,
    x: canvasWidth / 2 - width / 2,
  };
}

export function createAdditionalTextActions<TState extends { additionalTexts: AdditionalText[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  fontColor: string = '#ffffff',
  insertScale = 1,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  return {
    addHeader: () => {
      const newText: AdditionalText = {
        id: uuid(),
        text: messages().sidebar.text.defaultHeader,
        type: 'header',
        y: canvasHeight / 3,
        ...textPreset('header', canvasWidth, insertScale, brand),
        fill: fontColor,
      };
      setState((prev) => ({
        ...prev,
        additionalTexts: [...prev.additionalTexts, newText],
      }));
      saveToHistory(getState());
    },
    addSubheader: () => {
      const newText: AdditionalText = {
        id: uuid(),
        text: messages().sidebar.text.defaultSubheader,
        type: 'subheader',
        y: canvasHeight * 0.4,
        ...textPreset('subheader', canvasWidth, insertScale, brand),
        fill: fontColor,
      };
      setState((prev) => ({
        ...prev,
        additionalTexts: [...prev.additionalTexts, newText],
      }));
      saveToHistory(getState());
    },
    addText: () => {
      const newText: AdditionalText = {
        id: uuid(),
        text: messages().sidebar.text.defaultBody,
        type: 'body',
        y: canvasHeight / 2,
        ...textPreset('body', canvasWidth, insertScale, brand),
        fill: fontColor,
      };
      setState((prev) => ({
        ...prev,
        additionalTexts: [...prev.additionalTexts, newText],
      }));
      saveToHistory(getState());
    },
    /**
     * Add a body text with explicit content. Used by AI-suggestion appliers
     * that need to emit a finished text element rather than a placeholder.
     */
    addBodyTextWithContent: (content: string) => {
      const newText: AdditionalText = {
        id: uuid(),
        text: content,
        type: 'body',
        y: canvasHeight / 2,
        ...textPreset('body', canvasWidth, insertScale, brand),
        fill: fontColor,
      };
      setState((prev) => ({
        ...prev,
        additionalTexts: [...prev.additionalTexts, newText],
      }));
      saveToHistory(getState());
    },
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => {
      setState((prev) => ({
        ...prev,
        additionalTexts: prev.additionalTexts.map((t) => (t.id === id ? { ...t, ...partial } : t)),
      }));
      debouncedSaveToHistory(getState());
    },
    removeAdditionalText: (id: string) => {
      setState((prev) => ({
        ...prev,
        additionalTexts: prev.additionalTexts.filter((t) => t.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// PILL BADGE ACTIONS
// ============================================================================

export function createPillBadgeActions<TState extends { pillBadgeInstances: PillBadgeInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  return {
    addPillBadge: (preset?: string) => {
      const newPillBadge = createPillBadgeInstance(preset, {}, brand);
      setState((prev) => ({
        ...prev,
        pillBadgeInstances: [...prev.pillBadgeInstances, newPillBadge],
      }));
      saveToHistory(getState());
    },
    updatePillBadge: (id: string, partial: Partial<PillBadgeInstance>) => {
      setState((prev) => ({
        ...prev,
        pillBadgeInstances: prev.pillBadgeInstances.map((p) =>
          p.id === id ? { ...p, ...partial } : p
        ),
      }));
      debouncedSaveToHistory(getState());
    },
    removePillBadge: (id: string) => {
      setState((prev) => ({
        ...prev,
        pillBadgeInstances: prev.pillBadgeInstances.filter((p) => p.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// CIRCLE BADGE ACTIONS
// ============================================================================

export function createCircleBadgeActions<
  TState extends { circleBadgeInstances: CircleBadgeInstance[] },
>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  return {
    addCircleBadge: (preset?: string) => {
      const newCircleBadge = createCircleBadgeInstance(preset, {}, brand);
      setState((prev) => ({
        ...prev,
        circleBadgeInstances: [...prev.circleBadgeInstances, newCircleBadge],
      }));
      saveToHistory(getState());
    },
    updateCircleBadge: (id: string, partial: Partial<CircleBadgeInstance>) => {
      setState((prev) => ({
        ...prev,
        circleBadgeInstances: prev.circleBadgeInstances.map((c) =>
          c.id === id ? { ...c, ...partial } : c
        ),
      }));
      debouncedSaveToHistory(getState());
    },
    removeCircleBadge: (id: string) => {
      setState((prev) => ({
        ...prev,
        circleBadgeInstances: prev.circleBadgeInstances.filter((c) => c.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// CHART ACTIONS
// ============================================================================

export function createChartActions<TState extends { chartInstances: ChartInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  /** Series colours of a new chart; absent: the `chart` of `brand`. */
  chartColors?: readonly string[],
  insertScale = 1,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  return {
    addChart: (chartType: ChartType, options?: ElementPlacement) => {
      const created = createChartInstance(
        chartType,
        canvasWidth,
        canvasHeight,
        chartColors ?? brand.chart
      );
      // Charts store their top-left corner; `scale` grows them from there.
      const center =
        options?.center ?? (insertScale !== 1 ? { x: canvasWidth / 2, y: canvasHeight / 2 } : null);
      const newChart = center
        ? {
            ...created,
            ...(insertScale !== 1 ? { scale: insertScale } : {}),
            x: center.x - (created.width * insertScale) / 2,
            y: center.y - (created.height * insertScale) / 2,
          }
        : created;
      setState((prev) => ({
        ...prev,
        chartInstances: [...prev.chartInstances, newChart],
      }));
      saveToHistory(getState());
    },
    updateChart: (id: string, partial: Partial<ChartInstance>) => {
      setState((prev) => ({
        ...prev,
        chartInstances: prev.chartInstances.map((c) => (c.id === id ? { ...c, ...partial } : c)),
      }));
      debouncedSaveToHistory(getState());
    },
    removeChart: (id: string) => {
      setState((prev) => ({
        ...prev,
        chartInstances: prev.chartInstances.filter((c) => c.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// FRAME ACTIONS
// ============================================================================

export function createFrameActions<TState extends { frameInstances: FrameInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  /** The pack of the page's document; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  return {
    addFrame: (clipType: FrameClipType, options?: ElementPlacement) => {
      const center = options?.center ?? { x: canvasWidth / 2, y: canvasHeight / 2 };
      const newFrame = createFrameInstance(clipType, center.x, center.y, brand);
      setState((prev) => ({
        ...prev,
        frameInstances: [...prev.frameInstances, newFrame],
      }));
      saveToHistory(getState());
    },
    updateFrame: (id: string, partial: Partial<FrameInstance>) => {
      setState((prev) => ({
        ...prev,
        frameInstances: prev.frameInstances.map((f) => (f.id === id ? { ...f, ...partial } : f)),
      }));
      debouncedSaveToHistory(getState());
    },
    removeFrame: (id: string) => {
      const frames = getState().frameInstances;
      const frame = frames.find((f) => f.id === id);
      if (frame?.imageSrc && isLastHolder(frames, (f) => f.imageSrc, frame.imageSrc)) {
        URL.revokeObjectURL(frame.imageSrc);
      }
      setState((prev) => ({
        ...prev,
        frameInstances: prev.frameInstances.filter((f) => f.id !== id),
      }));
      saveToHistory(getState());
    },
    setFrameImage: (id: string, _file: File, objectUrl: string) => {
      const frames = getState().frameInstances;
      const oldFrame = frames.find((f) => f.id === id);
      if (oldFrame?.imageSrc && isLastHolder(frames, (f) => f.imageSrc, oldFrame.imageSrc)) {
        URL.revokeObjectURL(oldFrame.imageSrc);
      }
      setState((prev) => ({
        ...prev,
        frameInstances: prev.frameInstances.map((f) =>
          f.id === id
            ? { ...f, imageSrc: objectUrl, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 }
            : f
        ),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// USER IMAGE ACTIONS
// ============================================================================

export function createUserImageActions<TState extends { userImageInstances: UserImageInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  /** `createActions`' history argument; without it the URL swap is an undo step of its own. */
  history?: CanvasActionHistory
) {
  // `getState` is the render-time state (GenericCanvas), so `saveToHistory(getState())`
  // after a setState snapshots the canvas WITHOUT the change: history records
  // what `change` produces instead.
  const commit = (change: (s: TState) => TState) => {
    setState(change);
    saveToHistory(change(getState()));
  };
  const appendImage =
    (instance: UserImageInstance) =>
    (s: TState): TState => ({ ...s, userImageInstances: [...s.userImageInstances, instance] });
  // The blob preview of each placed file, until its durable URL arrives: an undo during the upload
  // takes the image off the canvas, but the redo entries still hold the preview.
  const previews = new Map<string, string>();

  return {
    addUserImage: (file: File, objectUrl: string) => {
      void createUserImageInstance(file, objectUrl, canvasWidth, canvasHeight).then((instance) => {
        commit(appendImage(instance));
      });
    },
    addUserImageFromUrl: (url: string, fileName: string, options?: UserImagePlacement) => {
      void createUserImageInstanceFromUrl(url, fileName, canvasWidth, canvasHeight, options).then(
        (instance) => {
          commit(appendImage(instance));
        }
      );
    },
    /**
     * Place a freshly-picked file instantly via a local blob preview (dimensions
     * read locally, no network) and return the new instance id. The caller
     * uploads in the background and calls `updateUserImage(id, { src })` to swap
     * the blob for the durable URL — mirrors the optimistic background path.
     */
    placeUserImageFromFile: (file: File): Promise<string> => {
      const objectUrl = URL.createObjectURL(file);
      return createUserImageInstance(file, objectUrl, canvasWidth, canvasHeight).then(
        (instance) => {
          commit(appendImage(instance));
          previews.set(instance.id, objectUrl);
          return instance.id;
        }
      );
    },
    updateUserImage: (id: string, partial: Partial<UserImageInstance>) => {
      const images = getState().userImageInstances;
      const prevSrc = images.find((u) => u.id === id)?.src;
      // Off the canvas, the preview can only be swapped where it is: in the history.
      const preview = prevSrc?.startsWith('blob:') ? prevSrc : history && previews.get(id);
      const nextSrc = partial.src;
      const blob = nextSrc && preview !== nextSrc ? preview : undefined;
      if (blob) previews.delete(id);
      // Free the optimistic blob once it's swapped for a durable URL.
      if (blob && isLastHolder(images, (u) => u.src, blob)) {
        URL.revokeObjectURL(blob);
      }
      const change = (s: TState): TState => ({
        ...s,
        userImageInstances: s.userImageInstances.map((u) =>
          u.id === id ? { ...u, ...partial } : u
        ),
      });
      setState(change);
      // An upload's durable URL replaces its preview everywhere, the history included: a step of
      // its own would let undo bring back the revoked blob, and save it (#161).
      if (blob && nextSrc && history && Object.keys(partial).length === 1) {
        history.replaceInHistory(blob, nextSrc);
        return;
      }
      debouncedSaveToHistory(change(getState()));
    },
    /** The template background photo's "Bearbeiten" look; merges like `updateUserImage`. */
    updateBackgroundImageAdjustments: (partial: Partial<ImageAdjustments>) => {
      const change = (s: TState): TState => ({
        ...s,
        backgroundImageAdjustments: {
          ...(s as { backgroundImageAdjustments?: ImageAdjustments }).backgroundImageAdjustments,
          ...partial,
        },
      });
      setState(change);
      debouncedSaveToHistory(change(getState()));
    },
    removeUserImage: (id: string) => {
      const images = getState().userImageInstances;
      const instance = images.find((u) => u.id === id);
      if (instance?.src.startsWith('blob:') && isLastHolder(images, (u) => u.src, instance.src)) {
        URL.revokeObjectURL(instance.src);
      }
      commit((s) => ({
        ...s,
        userImageInstances: s.userImageInstances.filter((u) => u.id !== id),
      }));
    },
  };
}

// ============================================================================
// COMBINED BASE ACTIONS
// ============================================================================

export function createElementActions<TState extends BaseCanvasState>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  fontColor?: string,
  chartColors?: readonly string[],
  /** Startgröße neuer Elemente (`insertScaleFor`); 1 = Sharepic-Werte. */
  insertScale = 1,
  /**
   * The pack of the page's document (`FullCanvasConfig.brand`): what new elements take their
   * colours and fonts from. Last, and a `BrandPack`, so it cannot be bound to `chartColors`
   * (a string list) or `insertScale` (a number). The active brand by default.
   */
  brand: BrandPack = activeBrand(),
  /** `createActions`' history argument (`createUserImageActions`). */
  history?: CanvasActionHistory
) {
  return {
    ...createAssetActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      insertScale
    ),
    ...createIconActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      // Without a default the icon state carries no color and IconPrimitive
      // falls back to black — invisible on dark templates. The template's own
      // font color is by definition readable against its background.
      { defaultColor: fontColor, defaultScale: insertScale }
    ),
    ...createShapeActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      undefined,
      insertScale,
      brand
    ),
    ...createIllustrationActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      brand
    ),
    ...createAdditionalTextActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      fontColor,
      insertScale,
      brand
    ),
    ...createPillBadgeActions(getState, setState, saveToHistory, debouncedSaveToHistory, brand),
    ...createCircleBadgeActions(getState, setState, saveToHistory, debouncedSaveToHistory, brand),
    ...createChartActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      chartColors,
      insertScale,
      brand
    ),
    ...createFrameActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      brand
    ),
    ...createUserImageActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      history
    ),
  };
}
