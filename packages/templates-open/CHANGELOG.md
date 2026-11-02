# @ggraphic/templates-open

## 0.1.0-alpha.1

### Minor Changes

- 89a7b84: Breaking: `SAMPLE_PHOTOS`, `SamplePhoto` and `SamplePhotoRole` move from the root entry to the new `@ggraphic/templates-open/photos` subpath. The root entry no longer references the 22 sample photos, so a host that imports only the templates no longer gets about 7.9 MB of JPEGs copied into its build. Import them from `@ggraphic/templates-open/photos` where you fill preview slots.

## 0.1.0-alpha.0

### Minor Changes

- 2d94890: New package: the open template pack (CC0-1.0) with the Studio's three starter designs as template files.
