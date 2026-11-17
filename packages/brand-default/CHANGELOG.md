# @ggraphic/brand-default

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [064350e]
- Updated dependencies [d570cbc]
  - @ggraphic/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Minor Changes

- cfeca71: Relicensed from MPL-2.0 to AGPL-3.0-only. Versions published before this change remain available under MPL-2.0.

### Patch Changes

- Updated dependencies [cfeca71]
  - @ggraphic/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- 8b1674f: Republish through trusted publishing. No code change.

## 0.1.0-alpha.0

### Minor Changes

- 0a2be62: Brands and templates as data. `defineBrand` (core) derives a full `BrandPack` from an id, a name, three colours, the fonts (with `cuts`) and an optional logo: the colour roles and grounds come from `deriveBrandColors` and `deriveGrounds`, and the pickers offer the roles bound to them. `templatePackFromJson` (`@ggraphic/editor/page/templatePack`) reads template files into a pack whose `definitions` go straight into `registerTemplates`; each template is a free page (`createPageConfig`), and files that do not read are reported, not half-loaded. The new `@ggraphic/brand-default` is the neutral pack ready to render: `brandDefault` with the cuts of its families declared, and `@ggraphic/brand-default/fonts` to load the OFL families.

### Patch Changes

- Updated dependencies [0a2be62]
  - @ggraphic/core@0.1.0-alpha.1
