---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

`instantiateTemplatePage` places a template on a page: fractions of the brand grid become pixels, bound fields take the values of the chosen colour world, the logo goes to a free corner, and the page records its template and groups. `offeredSchemes` lists the template worlds a brand keeps.

The editor declares per element kind how its numbers scale when a template is placed (`TEMPLATE_GEOMETRY`, `UNSCALED_FIELDS`), with a guard test per kind, and the adapter the render gate reads elements through.

`checkTemplate` is stage 1 of the render gate: it places a template on each brand, colour world, format and logo corner and checks bounds, logo overlap, contrast, slot budgets, unbound colours, asset licences, marker roles, world coverage and logo corners (`GATE_RULES`).

The gate fails closed: a text whose ground it cannot prove opaque and flat (a photo, a translucent or gradient shape, a badge) is a `contrast` failure. It sweeps the layout extremes (margin 0.04 and 0.12, logo box 0.4 × 0.2 and 0.05 × 0.03) for every logo corner a template declares. The gate adapter lists image fields (`assetFields`) and nested colours (`nestedColors`) and describes grounds through `cover`, which replaces `fill`.
