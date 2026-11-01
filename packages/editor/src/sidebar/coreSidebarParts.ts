// SPDX-License-Identifier: MPL-2.0
import { PiShareFat, PiSquaresFour, PiTextAa, PiToolbox, PiUploadSimple } from 'react-icons/pi';

import { type CoreSidebarParts } from './coreSidebar.js';
import {
  AssetsSection,
  CombinedTextSection,
  GenericShareSection,
  ToolsSection,
  UploadsSection,
} from './sections/index.js';

/** The components and icons behind `coreSidebar()`; the editor shell provides them. */
export const CORE_SIDEBAR_PARTS: CoreSidebarParts = {
  sections: {
    text: CombinedTextSection,
    elements: AssetsSection,
    uploads: UploadsSection,
    tools: ToolsSection,
    share: GenericShareSection,
  },
  icons: {
    text: PiTextAa,
    elements: PiSquaresFour,
    uploads: PiUploadSimple,
    tools: PiToolbox,
    share: PiShareFat,
  },
};
