// SPDX-License-Identifier: MPL-2.0
import { type BindingRef } from './bindings.js';

export interface BackgroundColorOption {
  id: string;
  label: string;
  color: string;
  /** The role the swatch stands for; picking it binds the background to the brand. */
  ref?: BindingRef;
}
