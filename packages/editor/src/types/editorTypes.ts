// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Canvas Editor Types
 * Shared types for interactive canvas editing (web + mobile)
 */

// =============================================================================
// LEGACY TYPES (preserved for backward compatibility)
// =============================================================================

export interface CanvasState {
  foregroundX: number;
  foregroundY: number;
  foregroundScale: number;
  backgroundColor: string;
}

// =============================================================================
// TRANSFORM TYPES
// =============================================================================

export type TransformAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface TransformBounds {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface TransformConfig {
  enabledAnchors: TransformAnchor[];
  rotateEnabled: boolean;
  keepRatio: boolean;
  bounds?: TransformBounds;
}

// =============================================================================
// EXPORT TYPES
// =============================================================================

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
  format: ExportFormat;
  quality?: number;
  pixelRatio?: number;
  includeBackground?: boolean;
  /**
   * A preview (page strip, gallery) keeps what only the editor shows, such as
   * the placeholder of an empty photo slot. Unset, the capture is an export
   * and leaves it out.
   */
  keepPlaceholders?: boolean;
}

export interface ExportResult {
  dataUrl: string;
  width: number;
  height: number;
  format: ExportFormat;
}

// =============================================================================
// CANVAS EDITOR CONFIG
// =============================================================================

export interface CanvasEditorConfig {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundImage?: string;
  responsive?: boolean;
  maxContainerWidth?: number;
  maxContainerHeight?: number;
}

// =============================================================================
// HISTORY TYPES
// =============================================================================

export interface CanvasHistoryEntry<TComponentState = Record<string, unknown>> {
  selectedLayerIds: string[];
  timestamp: number;
  componentState?: TComponentState;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_CANVAS_HEIGHT = 1350;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;
export const INITIAL_SCALE = 0.85;

export const DEFAULT_TRANSFORM_CONFIG: TransformConfig = {
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  rotateEnabled: false,
  keepRatio: true,
  bounds: {
    minWidth: 20,
    minHeight: 20,
  },
};
