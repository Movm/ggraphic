// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Feature Injector - Convention-Based Auto-Wiring
 *
 * Automatically detects and injects feature props for AssetsSection based on
 * naming conventions in state and actions.
 *
 * **Conventions:**
 * - Icons: state.selectedIcons + actions.toggleIcon
 * - Shapes: state.shapeInstances + actions.addShape
 * - Charts: state.chartInstances + actions.addChart
 * - Illustrations: state.illustrationInstances + actions.addIllustration
 * - Host kinds: their list (`stateKey`) + their add action (`registerElementKind`)
 *
 * This eliminates 60+ lines of manual prop passing per config (83% code reduction).
 */

import { canAddHostElement, hostElementKinds } from '../utils/elementKinds.js';
import { MAX_ICON_SELECTIONS, selectedCatalogIconIds } from '../utils/iconInstances.js';

import type { ExtendedAssetsSectionProps } from '../sidebar/sections/assets/index.js';
import type { BaseCanvasActions, IconState } from './factory/baseTypes.js';
import type { SectionContext } from './types.js';
import type { CircleBadgeInstance } from '../primitives/CircleBadge.js';
import type { ChartInstance } from '../utils/chartUtils.js';
import type { FrameInstance } from '../utils/frameUtils.js';
import type { IllustrationInstance } from '../utils/illustrations/types.js';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils.js';
import type { ShapeInstance } from '../utils/shapes.js';
import type { UserImagePlacement } from '../utils/userImageUtils.js';

interface FeatureStateWithIcons {
  selectedIcons?: string[];
  iconStates?: Record<string, IconState>;
}

interface FeatureStateWithShapes {
  shapeInstances?: ShapeInstance[];
}

interface FeatureStateWithCharts {
  chartInstances?: ChartInstance[];
}

interface FeatureStateWithIllustrations {
  illustrationInstances?: IllustrationInstance[];
}

interface FeatureStateWithPillBadge {
  pillBadgeInstances?: PillBadgeInstance[];
}

interface FeatureStateWithCircleBadge {
  circleBadgeInstances?: CircleBadgeInstance[];
}

interface FeatureStateWithFrames {
  frameInstances?: FrameInstance[];
}

interface FeatureActionsBase {
  [key: string]: ((...args: unknown[]) => unknown) | undefined;
}

/**
 * The same array for the same kinds: the panel's memos depend on it, and
 * `getProps` runs on every render.
 */
const addableKindLists = new Map<string, readonly string[]>();
function stableKinds(kinds: readonly string[]): readonly string[] {
  const key = kinds.join('\u0000');
  const known = addableKindLists.get(key);
  if (known) return known;
  addableKindLists.set(key, kinds);
  return kinds;
}

/**
 * Auto-inject feature props for AssetsSection based on state/action presence
 *
 * @param state - Canvas state (checked for feature properties)
 * @param actions - Canvas actions (checked for feature methods)
 * @param context - Canvas context (for selectedElement)
 * @returns Partial props object to spread into AssetsSection
 *
 * @example
 * ```tsx
 * assets: {
 *     component: AssetsSection,
 *     propsFactory: (state, actions, context) => ({
 *         // Asset instance props
 *         onAddAsset: actions.addAsset,
 *
 *         // Auto-inject all feature props (one line!)
 *         ...injectFeatureProps(state, actions, context),
 *     }),
 * }
 * ```
 */
export function injectFeatureProps<S extends object, A extends object>(
  state: S,
  actions: A,
  context?: SectionContext
): Partial<ExtendedAssetsSectionProps> {
  const injected: Partial<ExtendedAssetsSectionProps> = {};

  // === ICONS FEATURE ===
  // Convention: state.selectedIcons + state.iconStates + actions.toggleIcon
  if ('selectedIcons' in state && 'toggleIcon' in actions) {
    const stateWithIcons = state as FeatureStateWithIcons;
    // Die Seitenleiste zeigt den KATALOG: je Icon ein Eintrag, unabhängig davon,
    // wie viele Kopien davon auf der Fläche liegen. `selectedIcons` führt seit
    // #3404 Instanz-IDs, die Auflösung auf Katalog-IDs passiert hier — sonst
    // erschiene eine Kopie dort als eigenes, unbekanntes Icon und zählte gegen
    // `maxIconSelections`.
    injected.selectedIcons = selectedCatalogIconIds(
      stateWithIcons.selectedIcons,
      stateWithIcons.iconStates
    );
    injected.onIconToggle = actions.toggleIcon as (id: string, selected: boolean) => void;
    injected.onAddExternalIcon = (id, payload) =>
      (actions.toggleIcon as BaseCanvasActions['toggleIcon'])(id, true, undefined, payload);
    injected.maxIconSelections = MAX_ICON_SELECTIONS;

    // Optional: icon update handler
    if ('updateIcon' in actions) {
      // Not directly passed to AssetsSection, but available via IconsSection
    }
  }

  // === SHAPES FEATURE ===
  // Convention: state.shapeInstances + actions.addShape/updateShape/removeShape
  if ('shapeInstances' in state && 'addShape' in actions) {
    const stateWithShapes = state as FeatureStateWithShapes;
    injected.shapeInstances = stateWithShapes.shapeInstances;
    injected.selectedShapeId = context?.selectedElement || null;
    injected.onAddShape = actions.addShape as (type: string, color?: string) => void;

    if ('updateShape' in actions) {
      injected.onUpdateShape = actions.updateShape as (id: string, partial: unknown) => void;
    }

    if ('removeShape' in actions) {
      injected.onRemoveShape = actions.removeShape as (id: string) => void;
    }
  }

  // === CHARTS FEATURE ===
  // Convention: state.chartInstances + actions.addChart
  if ('chartInstances' in state && 'addChart' in actions) {
    const stateWithCharts = state as FeatureStateWithCharts;
    injected.chartInstances = stateWithCharts.chartInstances;
    injected.onAddChart = actions.addChart as (type: string) => void;
  }

  // === ILLUSTRATIONS FEATURE ===
  // Convention: state.illustrationInstances + actions.addIllustration/updateIllustration/removeIllustration
  if ('illustrationInstances' in state && 'addIllustration' in actions) {
    const stateWithIllustrations = state as FeatureStateWithIllustrations;
    injected.illustrationInstances = stateWithIllustrations.illustrationInstances;
    const selectedId = context?.selectedElement ?? null;
    injected.selectedIllustrationId =
      selectedId && stateWithIllustrations.illustrationInstances?.some((i) => i.id === selectedId)
        ? selectedId
        : null;
    injected.onAddIllustration = actions.addIllustration as (id: string) => void;

    if ('updateIllustration' in actions) {
      injected.onUpdateIllustration = actions.updateIllustration as (
        id: string,
        partial: unknown
      ) => void;
    }

    if ('removeIllustration' in actions) {
      injected.onRemoveIllustration = actions.removeIllustration as (id: string) => void;
    }

    if ('duplicateIllustration' in actions) {
      injected.onDuplicateIllustration = actions.duplicateIllustration as (id: string) => void;
    }
  }

  // === HOST KINDS ===
  // A host kind's tiles run where the state holds its list and the config has
  // its add action (`registerElementKind` with `add`).
  const addable = hostElementKinds()
    .map((kind) => kind.kind)
    .filter((kind) => canAddHostElement(kind, state, actions));
  if (addable.length > 0) {
    injected.addableHostKinds = stableKinds(addable);
    injected.hostElementActions = actions;
  }

  // === PILL BADGE FEATURE ===
  // Convention: state.pillBadgeInstances + actions.addPillBadge/updatePillBadge/removePillBadge
  if ('pillBadgeInstances' in state && 'addPillBadge' in actions) {
    injected.onAddPillBadge = actions.addPillBadge as (preset?: string) => void;

    if ('updatePillBadge' in actions) {
      injected.onUpdatePillBadge = actions.updatePillBadge as (
        id: string,
        partial: unknown
      ) => void;
    }

    if ('removePillBadge' in actions) {
      injected.onRemovePillBadge = actions.removePillBadge as (id: string) => void;
    }
  }

  // === CIRCLE BADGE FEATURE ===
  // Convention: state.circleBadgeInstances + actions.addCircleBadge/updateCircleBadge/removeCircleBadge
  if ('circleBadgeInstances' in state && 'addCircleBadge' in actions) {
    injected.onAddCircleBadge = actions.addCircleBadge as (preset?: string) => void;

    if ('updateCircleBadge' in actions) {
      injected.onUpdateCircleBadge = actions.updateCircleBadge as (
        id: string,
        partial: unknown
      ) => void;
    }

    if ('removeCircleBadge' in actions) {
      injected.onRemoveCircleBadge = actions.removeCircleBadge as (id: string) => void;
    }
  }

  // === FRAME FEATURE ===
  // Convention: state.frameInstances + actions.addFrame/updateFrame/removeFrame/setFrameImage
  if ('frameInstances' in state && 'addFrame' in actions) {
    const stateWithFrames = state as FeatureStateWithFrames;
    injected.frameInstances = stateWithFrames.frameInstances;
    // Nur ein Rahmen ist ein ausgewählter Rahmen: die Kataloge springen bei
    // gesetzter Id in die Rahmen-Ansicht, auch bei einer Illustration.
    const selectedId = context?.selectedElement ?? null;
    injected.selectedFrameId =
      selectedId && stateWithFrames.frameInstances?.some((f) => f.id === selectedId)
        ? selectedId
        : null;
    injected.onAddFrame = actions.addFrame as (clipType: string) => void;

    if ('updateFrame' in actions) {
      injected.onUpdateFrame = actions.updateFrame as (id: string, partial: unknown) => void;
    }

    if ('removeFrame' in actions) {
      injected.onRemoveFrame = actions.removeFrame as (id: string) => void;
    }

    if ('setFrameImage' in actions) {
      injected.onSetFrameImage = actions.setFrameImage as (
        id: string,
        file: File,
        objectUrl: string
      ) => void;
    }
  }

  // === PHOTOS ===
  // Convention: actions.addUserImageFromUrl (stock photos placed as user images)
  if ('addUserImageFromUrl' in actions) {
    injected.onAddImageFromUrl = actions.addUserImageFromUrl as (
      url: string,
      name: string,
      options?: UserImagePlacement
    ) => void;
  }

  // === BACKGROUND GALLERY ===
  // Comes from the config's background controls, not from a state convention.
  const background = context?.background;
  if (background?.onImageChange) {
    injected.onSetBackgroundImage = background.onImageChange;
    injected.currentBackgroundSrc = background.currentImageSrc;
  }

  return injected;
}
