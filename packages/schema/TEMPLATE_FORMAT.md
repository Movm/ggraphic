# Template file format

A template (or a block) is one JSON file. `readTemplateFile(raw)` in
`src/template/templateFile.ts` is the only door for reading it; it never throws and
answers `ok`, `newer` or `invalid`.

## Keys

All keys are strict: an unknown top-level key makes the file invalid.

| Key                             | Meaning                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatVersion`                 | Version of this file format. Currently `1`.                                                                                                                                                                                                     |
| `id`                            | Slug `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, at most 64 characters.                                                                                                                                                                                     |
| `version`                       | Integer >= 1; bumped when the template changes.                                                                                                                                                                                                 |
| `kind`                          | `template` (a whole page) or `block` (a part).                                                                                                                                                                                                  |
| `family`                        | Open slug, at most 40 characters. A new family needs no code.                                                                                                                                                                                   |
| `title`, `description`          | Localised text, see below. Title at most 60 characters.                                                                                                                                                                                         |
| `tags`                          | `{ tone?, occasions, topics }`: slugs of at most 40 characters, at most 12 entries each.                                                                                                                                                        |
| `formats`                       | Subset of `1:1`, `4:5`, `16:9`; at least one, no duplicates.                                                                                                                                                                                    |
| `schemes`                       | Offered colour worlds: `primary`, `secondary`, `light`, `dark`, `photo`; at least one, no duplicates.                                                                                                                                           |
| `schemaVersion`, `kindVersions` | Canvas document versions the page state was written at. They are migrated by `migrateDocument` on read.                                                                                                                                         |
| `pages`                         | Exactly one entry `{ state }` in format 1 (multi-page files come with P7).                                                                                                                                                                      |
| `frames`                        | `{ <elementId>: 'canvas' \| 'safe' }`. An element without an entry is `safe`. Default `{}`.                                                                                                                                                     |
| `slots`                         | `{ <elementId>: { role, label?, budget } }`. Roles: `headline`, `subline`, `body`, `cta`, `quote`, `name`, `number`, `date`, `place`, `photo`. Budget numbers are integers: `maxWords` 1-200, `maxLines` 1-20, `maxChars` 1-2000. Default `{}`. |
| `blocks`                        | `[{ id, title, elementIds }]`: parts that become page groups when placed. Default `[]`.                                                                                                                                                         |
| `locks`                         | Element ids the user may not move. Default `[]`.                                                                                                                                                                                                |
| `fixed`                         | `{ <elementId> \| 'page': [field] }`: fields whose colour does not follow the brand. Default `{}`.                                                                                                                                              |
| `logoCorners`                   | Allowed logo corners: `top-left`, `top-right`, `bottom-left`, `bottom-right`. Default `[]`.                                                                                                                                                     |
| `placeholders`                  | `{ <locale>: { <elementId>: text } }`. Default `{}`.                                                                                                                                                                                            |
| `provenance`                    | `{ author, reviewed: 'YYYY-MM-DD', licence }`.                                                                                                                                                                                                  |

`Localized` is a record whose keys match `/^[a-z]{2}(-[A-Z]{2})?$/`, whose values are
trimmed strings of 1-160 characters, and which always has an `en` entry.

## Element ids and cross-references

`templateElementIds(state)` lists the `id` of every object in the top-level arrays of the
page state, plus the keys of its top-level plain-object records. A duplicate id is invalid.
Every key of `frames`, `slots`, `fixed` (also `page`) and `placeholders.<locale>`, every
block element id and every `locks` entry must name one of those ids. The failure reason
names the offending key, for example `slots.ghost`.

## Geometry and bindings

Positions and sizes in the page state are fractions of the element's frame (`canvas` or
`safe`); see the editor's `TEMPLATE_GEOMETRY` for the axes of each element kind.

A colour or font that follows the brand is written as a plain ref string,
`"bind": { "fill": "ink" }`. Placing the template turns it into the document form
`{ ref, value }`. Refs are the surface roles, `brand.*` values, and `font.*` roles including
`font.serif` and `font.condensed`.

## Reading

1. `formatVersion` not a positive integer: `invalid`; greater than ours: `newer` (scope `format`).
2. Format migrations run (none yet).
3. The pages go through `migrateDocument`: a newer page version is `newer` (scope `pages`),
   a lifted result replaces the page state and `schemaVersion` (`migrated: true`).
4. Schema parse, then the cross-references above.

## How the format grows

Additive keys (optional, with a default) need no bump. A changed meaning of an existing key
needs a bump of `TEMPLATE_FORMAT_VERSION` plus a step in `TEMPLATE_FORMAT_MIGRATIONS` that
lifts `formatVersion` n to n + 1.
