// SPDX-License-Identifier: AGPL-3.0-only
import {
  SubsectionTabBar as ChromeSubsectionTabBar,
  type SubsectionTabBarProps,
} from '@ggraphic/editor-chrome';

import { useMessages } from '../i18n/messages.js';

export { type Subsection, type SubsectionTabBarProps } from '@ggraphic/editor-chrome';

/** The chrome's subsection tabs with the editor's texts. */
export function SubsectionTabBar(props: SubsectionTabBarProps) {
  const t = useMessages();
  return <ChromeSubsectionTabBar viewLabel={t.ui.view} {...props} />;
}
