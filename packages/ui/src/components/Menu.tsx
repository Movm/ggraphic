// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement } from 'react';
import { DropdownMenu } from 'radix-ui';

import { cx } from '../cx.js';

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      /** `danger` marks a destructive action. */
      tone?: 'danger';
    }
  | { separator: true };

export interface MenuProps {
  /** The element that opens the menu and names it; it must forward its ref and props (a Button does). */
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Menu({ trigger, items, align = 'end', className }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={cx('ui-menu__content', className)}
        >
          {items.map((item, index, all) =>
            'separator' in item ? (
              <DropdownMenu.Separator
                key={`separator-after-${labelBefore(all, index)}`}
                className="ui-menu__separator"
              />
            ) : (
              <DropdownMenu.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cx('ui-menu__item', item.tone === 'danger' && 'ui-menu__item--danger')}
              >
                {item.label}
              </DropdownMenu.Item>
            )
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The label of the nearest item before `index`, so a separator has a stable key. */
function labelBefore(items: MenuItem[], index: number): string {
  for (let at = index - 1; at >= 0; at -= 1) {
    const item = items[at];
    if (item && 'label' in item) return item.label;
  }
  return 'start';
}
