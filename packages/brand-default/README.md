# @ggraphic/brand-default

The neutral ggraphic brand pack, ready to render: colours, grounds and pickers from `brandDefault` in `@ggraphic/core`, with the real cuts of its open-licensed families declared.

```ts
import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts'; // Bricolage Grotesque, Instrument Sans, Fraunces, Anton (OFL)
import { registerBrandPacks } from '@ggraphic/editor/host';

registerBrandPacks([defaultBrand]);
```

For a brand of your own, `defineBrand` in `@ggraphic/core` derives a full pack from three colours, the fonts and a logo.

Licence: MPL-2.0. The fonts are under the SIL Open Font License 1.1; see `THIRD_PARTY_NOTICES`.
