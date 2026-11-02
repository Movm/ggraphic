// SPDX-License-Identifier: MPL-2.0
/** Where the browser keeps the one design of this example. */
export const DESIGN_KEY = 'design';

/** A new design from the start page: its format and the page config of its first page. */
export interface NewDesign {
  formatId: string;
  configId: string;
}
