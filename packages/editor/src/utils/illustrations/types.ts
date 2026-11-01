// SPDX-License-Identifier: MPL-2.0
/**
 * Shared types and constants for illustration registry
 */

import { type KawaiiIllustrationType, type KawaiiMood, type SvgSource } from '@ggraphic/core';
import { messages } from '../../i18n/messages.js';

export {
  type IllustrationInstance,
  type KawaiiIllustrationType,
  type KawaiiInstance,
  type KawaiiMood,
  type SvgInstance,
  type SvgSource,
  type SvgSources,
} from '@ggraphic/core';

// =============================================================================
// TYPES
// =============================================================================

export interface KawaiiDef {
  id: KawaiiIllustrationType;
  name: string;
  tags: string[];
  source: 'kawaii';
}

export interface SvgDef {
  id: string;
  name: string;
  filename: string;
  source: SvgSource;
  tags: string[];
  category?: string;
}

// Unified Union Types
export type IllustrationDef = KawaiiDef | SvgDef;

// =============================================================================
// SHARED CONSTANTS
// =============================================================================

export const KAWAII_MOODS: { id: KawaiiMood; label: string; emoji: string }[] = [
  {
    id: 'happy',
    get label() {
      return messages().moods.happy;
    },
    emoji: '😊',
  },
  {
    id: 'blissful',
    get label() {
      return messages().moods.blissful;
    },
    emoji: '😌',
  },
  {
    id: 'lovestruck',
    get label() {
      return messages().moods.lovestruck;
    },
    emoji: '😍',
  },
  {
    id: 'shocked',
    get label() {
      return messages().moods.shocked;
    },
    emoji: '😲',
  },
  {
    id: 'sad',
    get label() {
      return messages().moods.sad;
    },
    emoji: '😢',
  },
];
