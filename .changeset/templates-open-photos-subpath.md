---
'@ggraphic/templates-open': minor
---

Breaking: `SAMPLE_PHOTOS`, `SamplePhoto` and `SamplePhotoRole` move from the root entry to the new `@ggraphic/templates-open/photos` subpath. The root entry no longer references the 22 sample photos, so a host that imports only the templates no longer gets about 7.9 MB of JPEGs copied into its build. Import them from `@ggraphic/templates-open/photos` where you fill preview slots.
