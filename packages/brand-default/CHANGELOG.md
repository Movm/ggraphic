# @ggraphic/brand-default

## 0.1.0-alpha.0

### Minor Changes

- 0a2be62: Brands and templates as data. `defineBrand` (core) derives a full `BrandPack` from an id, a name, three colours, the fonts (with `cuts`) and an optional logo: the colour roles and grounds come from `deriveBrandColors` and `deriveGrounds`, and the pickers offer the roles bound to them. `templatePackFromJson` (`@ggraphic/editor/page/templatePack`) reads template files into a pack whose `definitions` go straight into `registerTemplates`; each template is a free page (`createPageConfig`), and files that do not read are reported, not half-loaded. The new `@ggraphic/brand-default` is the neutral pack ready to render: `brandDefault` with the cuts of its families declared, and `@ggraphic/brand-default/fonts` to load the OFL families.

### Patch Changes

- Updated dependencies [0a2be62]
  - @ggraphic/core@0.1.0-alpha.1
