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
| `schemaVersion`, `kindVersions` | Canvas document versions the page state was written at (each at most 10000, like `version`). They are migrated by `migrateDocument` on read; a lifted `kindVersions` replaces the file's.                                                       |
| `pages`                         | Exactly one entry `{ state }` in format 1 (multi-page files come with P7).                                                                                                                                                                      |
| `frames`                        | `{ <elementId>: 'canvas' \| 'safe' }`. An element without an entry is `safe`. Default `{}`.                                                                                                                                                     |
| `slots`                         | `{ <elementId>: { role, label?, budget } }`. Roles: `headline`, `subline`, `body`, `cta`, `quote`, `name`, `number`, `date`, `place`, `photo`. Budget numbers are integers: `maxWords` 1-200, `maxLines` 1-20, `maxChars` 1-2000. Default `{}`. |
| `blocks`                        | `[{ id, title, elementIds }]`, at most 50: parts that become page groups when placed. Block ids are unique slugs (at most 64), titles at most 60 characters, an element sits in at most one block. Default `[]`.                                |
| `locks`                         | Element ids the user may not move (at most 200, ids at most 64). Default `[]`.                                                                                                                                                                  |
| `fixed`                         | `{ <elementId> \| 'page': [field] }`: fields whose colour does not follow the brand. At most 40 elements, 20 fields each, names at most 64. A field that is also bound is invalid. Default `{}`.                                                |
| `logoCorners`                   | Allowed logo corners: `top-left`, `top-right`, `bottom-left`, `bottom-right`. Default `[]`.                                                                                                                                                     |
| `placeholders`                  | `{ <locale>: { <elementId>: text } }`: at most 8 locales, text at most 160 characters. Default `{}`.                                                                                                                                            |
| `provenance`                    | `{ author, reviewed, licence }`: author and licence at most 200 characters, `reviewed` a real calendar date `YYYY-MM-DD`.                                                                                                                       |

`Localized` is a record whose keys match `/^[a-z]{2}(-[A-Z]{2})?$/`, whose values are
trimmed strings of 1-160 characters, and which always has an `en` entry.

## Element ids and cross-references

`templateElementIds(state)` lists the `id` of every object in the top-level arrays of the
page state, plus the keys of its top-level plain-object records. A duplicate id is invalid.
The element id `page` is reserved (it is the `fixed` key for the page itself). Every key of `frames`, `slots`, `fixed` (also `page`) and `placeholders.<locale>`, every
block element id and every `locks` entry must name one of those ids. The failure reason
names the offending key, for example `slots.ghost`.

## Geometry and bindings

Positions and sizes in the page state are fractions of the element's frame (`canvas` or
`safe`); see the editor's `TEMPLATE_GEOMETRY` for the axes of each element kind.

A colour or font that follows the brand is written as a plain ref string,
`"bind": { "fill": "ink" }`. Placing the template turns it into the document form
`{ ref, value }`. Refs are the surface roles, `brand.*` values (including `brand.logo`), and
`font.*` roles including `font.serif` and `font.condensed`.

**Where checks live.** This package does not import core, so it does not validate ref strings
and does not check that geometry fractions lie in 0..1. Ref validation (`isBindingRef`) happens
in core, in `instantiateTemplatePage` (Task 7) and in the render gate (Task 11); the gate also
enforces geometry fractions 0..1.

## Reading

1. `formatVersion` not a positive integer: `invalid`; greater than ours: `newer` (scope `format`).
2. Format migrations run (none yet; `readTemplateFile` takes them as an optional second parameter for tests). They must be contiguous from 1, the result must carry the current `formatVersion`, and a throwing step gives `invalid`.
3. The pages go through `migrateDocument`: a newer page version is `newer` (scope `pages`),
   a lifted result replaces the page state, `schemaVersion` and `kindVersions` (`migrated: true`).
4. Schema parse, then the cross-references above.

## How the format grows

The schema is strict, so an older build cannot read a file with a key it does not know: it
would answer `invalid`, not `newer`. Therefore **any new key, top-level or nested, bumps
`TEMPLATE_FORMAT_VERSION`** and adds an identity step to `TEMPLATE_FORMAT_MIGRATIONS`; an older
build then answers `newer`. A changed meaning of an existing key bumps the same way, with a step
that rewrites the file from `formatVersion` n to n + 1.
