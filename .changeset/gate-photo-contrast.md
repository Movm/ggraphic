---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

The render gate now judges text over photos by the worst ground it can prove. A photo is any mix of its darkest and lightest colour (black and white, or its duotone pair), a translucent shape is a veil, a shade shape fades in along `SHADE_STOPS`, and the text passes only if the least contrast over all of them meets the threshold. The editor reports photos, shades and veils to the gate; tinted, masked, blended, rotated or recoloured duotone images stay not determinable. `SHADE_STOPS` and `shadeAlphaAt` move to `@ggraphic/core`.
