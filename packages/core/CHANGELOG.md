# @ggraphic/core

## 0.1.0-alpha.1

### Minor Changes

- 0a2be62: Brands and templates as data. `defineBrand` (core) derives a full `BrandPack` from an id, a name, three colours, the fonts (with `cuts`) and an optional logo: the colour roles and grounds come from `deriveBrandColors` and `deriveGrounds`, and the pickers offer the roles bound to them. `templatePackFromJson` (`@ggraphic/editor/page/templatePack`) reads template files into a pack whose `definitions` go straight into `registerTemplates`; each template is a free page (`createPageConfig`), and files that do not read are reported, not half-loaded. The new `@ggraphic/brand-default` is the neutral pack ready to render: `brandDefault` with the cuts of its families declared, and `@ggraphic/brand-default/fonts` to load the OFL families.

## 0.1.0-alpha.0

### Minor Changes

- f1886fc: Brand binding follow-ups: font bindings follow only the first family of a stack and keep its
  fallbacks, `brandFingerprint` now includes `markers` (every stored brand stamp changes once, so
  each project saves once on its next open), a logo swapped before its size was known carries
  `pendingFit` and is fitted once the size is known, and `resolveScheme` looks only at earlier
  worlds.
- abbea93: Brand bindings, colour worlds and colour math.
- 74008f0: A brand can set `serif` and `condensed` display fonts (falling back to the quote and headline fonts) and a second logo, `logoAlt`, chosen by how dark the ground is. `logoSizeOf` sizes whichever logo is swapped in.

  A brand can set a `layout` (margin and logo corner and envelope); `brandLayout`, `safeArea` and `logoEnvelope` read it, and the defaults match today's seed geometry.

- 6c342cb: `BrandPack.shapeCycle` (optional) names the palette ids the shape tiles cycle through, in order. Without it, or when it names no palette colour, the tiles cycle through the colour roles as before.
- 7c31154: A circle badge can be drawn as a burst or an ellipse: `CircleBadgeInstance.outline` is `'circle'`
  (the default), `'burst'` or `'ellipse'`, and `CircleBadge` takes it as a prop.
- 591386d: Hold the canvas element data model: `AdditionalText`, `ShapeInstance`, `UserImageInstance`,
  `IconState`, `AssetInstance`, `ChartInstance`, `FrameInstance`, `CircleBadgeInstance`,
  `PillBadgeInstance`, `IllustrationInstance` (with `KawaiiInstance` and `SvgInstance`) and the types
  they are built from (`GradientFill`, `TextAccent`, `TextMarker`, `TextAlign`, `FontWeight`,
  `CornerRadius`, `TailSide`, `IconSource`, `ShapeType` and the rest), plus `ASSET_TARGET_SIZE` and
  `TEXT_ALIGNS`. Also `BackgroundColorOption`. All of it is types and two constants with no
  dependency, so a server can build, read and change pages in plain Node. The shapes are stored in
  documents: fields are added, never renamed.
- 811b5f5: Add `deriveBrandColors` and `deriveGrounds`: the eight brand colour roles and the solid grounds, derived from a primary, a secondary and an accent colour, each text and accent role checked against the WCAG thresholds the colour worlds use.
- c7e390f: Two-colour duotone bound to the colour world. An image with `duotoneLow` and `duotoneHigh` maps the photo's luma between the two colours; the Duotone look binds them to the page world's `duo-low` / `duo-high`, so they follow a world change. The field names are stored, so they are fixed. Core adds `duotoneRamp`. A legacy tinted image and an image without the new fields render and export as before.
- d44dc48: Add `fontRoleOptions(brand)` and `currentFontRole(text, options)`: the font roles a brand offers on a
  text (headline, body, condensed, serif; a role whose font an earlier one already has is left out) and
  the role a text stands for, by its binding or else by its first family.
- f371673: The render gate now judges text over photos by the worst ground it can prove. A photo is any mix of its darkest and lightest colour (black and white, or its duotone pair), a translucent shape is a veil, a shade shape fades in along `SHADE_STOPS`, and the text passes only if the least contrast over all of them meets the threshold. The editor reports photos, shades and veils to the gate; tinted, masked, blended, rotated or recoloured duotone images stay not determinable. `SHADE_STOPS` and `shadeAlphaAt` move to `@ggraphic/core`.
- cc5ee96: `BrandFonts.cuts` declares the real cuts of families the host loads itself: `{ bold, italic, boldItalic }` per family. Bold and italic buttons follow it ahead of the built-in table, and a bold italic run keeps `bold italic` where `boldItalic` is set (for example a Black Italic). Fraunces stays built in. Exported page files, slider shares and ZIP entries now take their page word from the catalogue (`export.pageFile`): `seite-1.png` in German, `page-1.png` in English.
- 2761974: Hosts can ship SVG illustration sets of their own. `SvgSource` is now `keyof SvgSources`. A host adds its set with `declare module '@ggraphic/core' { interface SvgSources { mine: true } }` and lists it through `IllustrationSources.loadSvg` as before. The new `IllustrationSources.recolor` names, per set, the colour its files draw their main shapes in, and tinting swaps that colour. Open Doodles keeps its built-in `#ff5678`.
- 5807f36: Initial import of the document schema, core and canvas editor packages.
- 3534ffa: Replace the bundled fonts PT Sans and Vollkorn with the open Instrument Sans and Fraunces. `brandDefault.fonts` now names Raleway, Instrument Sans and Fraunces. Saved designs and brand packs that still name "PT Sans" or "Vollkorn" keep rendering: the editor maps the old families to the new ones when loading, painting, measuring and exporting to PPTX (`FONT_FAMILY_ALIASES`); stored data is not rewritten.
- 45d469b: Add `checkSlotBudget`, a pure runtime check of a text against its slot budget (words, characters, lines, minimum font size), with `countWords` and `countChars` that ignore the `**`, `==` and `++` markers.
- 10cce2c: `instantiateTemplatePage` places a template on a page: fractions of the brand grid become pixels, bound fields take the values of the chosen colour world, the logo goes to a free corner, and the page records its template and groups. `offeredSchemes` lists the template worlds a brand keeps.

  The editor declares per element kind how its numbers scale when a template is placed (`TEMPLATE_GEOMETRY`, `UNSCALED_FIELDS`), with a guard test per kind, and the adapter the render gate reads elements through.

  `checkTemplate` is stage 1 of the render gate: it places a template on each brand, colour world, format and logo corner and checks bounds, logo overlap, contrast, slot budgets, unbound colours, asset licences, marker roles, world coverage and logo corners (`GATE_RULES`).

  The gate fails closed: a text whose ground it cannot prove opaque and flat (a photo, a translucent or gradient shape, a badge) is a `contrast` failure. It sweeps the layout extremes (margin 0.04 and 0.12, logo box 0.3 × 0.12 and 0.05 × 0.03) for every logo corner a template declares. The gate adapter lists image fields (`assetFields`) and nested colours (`nestedColors`) and describes grounds through `cover`, which replaces `fill`.

  The logo box of a brand layout is bounded to 30 % of the canvas width and 12 % of its height (`BRAND_LAYOUT_BOUNDS`, was 40 % and 20 %); `clampBrandLayout` pulls a stored layout into the bounds.

### Patch Changes

- d9847b8: Resolve `import` to the built `dist/` outside development, so Node can load the package in a deployed install (the Studio server image).
