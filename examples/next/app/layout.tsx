// SPDX-License-Identifier: MPL-2.0
import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = { title: 'ggraphic in a Next.js app' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
