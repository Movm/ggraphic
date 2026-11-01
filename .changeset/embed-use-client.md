---
'@ggraphic/editor': patch
---

The `embed` entry (and the package root, its alias) starts with `'use client'`. A React Server Component that imports it now gets a client reference instead of failing with `createContext is not a function`. `templatePackFromJson` and `loadTemplatePack` are not server APIs: the skill now says so and shows the App Router setup.
