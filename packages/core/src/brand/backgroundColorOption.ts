// SPDX-License-Identifier: AGPL-3.0-only
import { type BindingRef } from './bindings.js';

export interface BackgroundColorOption {
  id: string;
  label: string;
  color: string;
  /** The role the swatch stands for; picking it binds the background to the brand. */
  ref?: BindingRef;
}
