// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Every reader of `projects` must leave out the trash. A statement that forgets shows (or
 * edits) a deleted project in a list, a read, an update or a thumbnail.
 *
 * Reads the source: the mistake is one missing line, which no type check sees. A statement
 * that reads `projects` needs `live()` (src/trash.ts) or `isNull(projects.deletedAt)` in
 * the same statement. The trash side itself reads the other way round and is allowlisted,
 * each entry by a marker that only that statement contains, so a filtered reader in the
 * same file is not excused with it. The list is exact in both directions: an entry that
 * excuses nothing fails like a new unfiltered reader.
 *
 * Grünerator's trashReaders.vitest.ts, scaled down to one table. No database needed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** A statement that reads, updates or deletes `projects`. */
const READER =
  /\.(?:from|update|delete)\(projects\)|\.(?:inner|left|right|full)Join\(projects\b|\b(?:FROM|JOIN|UPDATE)\s+projects\b/g;
// Raw SQL names the table: `deleted_at IS NULL` on a joined table must not excuse the reader.
const LIVE = /\blive\(\)|isNull\(projects\.deletedAt\)|\bprojects\.deleted_at\s+IS\s+NULL/i;
/** What a statement on the trash side says instead. */
const TRASH_SIDE = /isNotNull\(projects\.deletedAt\)|lt\(projects\.deletedAt/;

interface Excuse {
  file: string;
  /** Only a statement containing this text is excused. */
  marker: string;
  reason: string;
}

const ALLOWED: Excuse[] = [
  {
    file: 'routes/projects.ts',
    marker: '.orderBy(desc(projects.deletedAt))',
    reason: 'the trash list reads the deleted projects',
  },
  {
    file: 'routes/projects.ts',
    marker: '.select({ id: projects.id })',
    reason: 'a read of a trashed project tells its organisation "trashed" instead of "missing"',
  },
  {
    file: 'routes/projects.ts',
    marker: '.set({ deletedAt: null })',
    reason: 'restore clears deleted_at on a project that is in the trash',
  },
  {
    file: 'routes/projects.ts',
    marker: '.delete(projects)',
    reason: '"delete now" removes a project that is already in the trash',
  },
  {
    file: 'trashPurge.ts',
    marker: 'lt(projects.deletedAt, cutoff)',
    reason: 'the purge removes projects whose time in the trash is up',
  },
];

/** Files that read `projects`; a new one is a decision to make here, not a surprise. */
const READER_FILES = ['routes/projects.ts', 'trashPurge.ts'];

interface Statement {
  file: string;
  text: string;
}

const allFiles = (dir = SRC): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8', withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => `${e.parentPath}/${e.name}`.slice(SRC.length + 1).replaceAll('\\', '/'))
    .sort();

function sourceFiles(): string[] {
  return allFiles().filter((f) => f.endsWith('.ts'));
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** From the nearest `db.` / `tx.` before the match to the `;` that ends the statement. */
function statementsOf(file: string, source: string): Statement[] {
  const code = withoutComments(source);
  const starts = [...code.matchAll(/\b(?:db|tx)\s*\./g)].map((m) => m.index!);
  const found: Statement[] = [];
  for (const match of code.matchAll(READER)) {
    const before = starts.filter((s) => s < match.index!).at(-1) ?? match.index!;
    const end = code.indexOf(';', match.index!);
    found.push({ file, text: code.slice(before, end === -1 ? undefined : end) });
  }
  return found;
}

const all: Statement[] = sourceFiles().flatMap((file) =>
  statementsOf(file, readFileSync(`${SRC}/${file}`, 'utf8'))
);
const unfiltered = all.filter((s) => !LIVE.test(s.text));
const excusedBy = (entry: Excuse) =>
  unfiltered.filter((s) => s.file === entry.file && s.text.includes(entry.marker));

describe('trash readers', () => {
  it('has no stray copy of a source file under src (a .bak is not scanned)', () => {
    expect(allFiles().filter((f) => !f.endsWith('.ts'))).toEqual([]);
  });

  it('finds the readers it is meant to guard', () => {
    // A scan that matches nothing would pass every other test.
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  it('keeps `live()` a plain "not in the trash" condition', () => {
    expect(readFileSync(`${SRC}/trash.ts`, 'utf8')).toMatch(
      /export const live = \(\) => isNull\(projects\.deletedAt\);/
    );
  });

  it('has the trash filter in every statement that reads projects, bar the allowlist', () => {
    const missing = unfiltered
      .filter((s) => !ALLOWED.some((a) => a.file === s.file && s.text.includes(a.marker)))
      .map((s) => `${s.file}: ${s.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    expect(missing).toEqual([]);
  });

  it('allowlists only statements that really read the trash side', () => {
    for (const entry of ALLOWED) {
      const hits = excusedBy(entry);
      expect(hits.length, `dead allowlist entry: ${entry.file} ${entry.marker}`).toBeGreaterThan(0);
      for (const hit of hits) expect(hit.text, entry.reason).toMatch(TRASH_SIDE);
    }
  });

  it('reads projects only in the files named here', () => {
    expect([...new Set(all.map((s) => s.file))].sort()).toEqual(READER_FILES);
  });
});
