// SPDX-License-Identifier: MIT
import { type NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This folder is the app's root, as in a standalone host. Without it Next.js picks the
  // repository's lockfile as the root and could resolve packages from its node_modules.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
