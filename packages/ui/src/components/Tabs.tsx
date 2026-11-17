// SPDX-License-Identifier: AGPL-3.0-only
import { type ComponentPropsWithoutRef } from 'react';
import { Tabs as RadixTabs } from 'radix-ui';

import { cx } from '../cx.js';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...rest }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cx('ui-tabs__list', className)} {...rest} />;
}

export function TabsTrigger({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return <RadixTabs.Trigger className={cx('ui-tabs__trigger', className)} {...rest} />;
}

export const TabsContent = RadixTabs.Content;
