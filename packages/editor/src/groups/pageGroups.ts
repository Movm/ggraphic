// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Groups on a page: the page state key `groups` (F0, shapes only grow) lists
 * element ids that belong together, such as the parts of a placed block.
 * Moving and scaling goes through the ordinary multi-selection; this module
 * only answers "who belongs to whom" and keeps the list tidy.
 */

export interface PageGroup {
  id: string;
  blockRef?: { id: string; version: number };
  elementIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Tolerant: whatever a document carries, malformed entries are dropped. */
export function readGroups(state: Readonly<Record<string, unknown>>): PageGroup[] {
  const raw = state.groups;
  if (!Array.isArray(raw)) return [];
  const groups: PageGroup[] = [];
  for (const entry of raw as unknown[]) {
    if (!isRecord(entry)) continue;
    const { id, elementIds, blockRef } = entry;
    if (typeof id !== 'string' || id === '') continue;
    if (!Array.isArray(elementIds) || !elementIds.every((e) => typeof e === 'string')) continue;
    const group: PageGroup = { id, elementIds: [...(elementIds as string[])] };
    if (
      isRecord(blockRef) &&
      typeof blockRef.id === 'string' &&
      typeof blockRef.version === 'number'
    ) {
      group.blockRef = { id: blockRef.id, version: blockRef.version };
    }
    groups.push(group);
  }
  return groups;
}

export function groupOf(groups: readonly PageGroup[], elementId: string): PageGroup | null {
  return groups.find((group) => group.elementIds.includes(elementId)) ?? null;
}

/** The ids plus every member of their groups; first-seen order, no duplicates. */
export function expandToGroups(groups: readonly PageGroup[], ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    for (const member of groupOf(groups, id)?.elementIds ?? []) out.add(member);
  }
  return [...out];
}

/** Drops members that no longer exist and groups left with fewer than two. */
export function pruneGroups(
  groups: readonly PageGroup[],
  liveIds: ReadonlySet<string>
): PageGroup[] {
  let changed = false;
  const next: PageGroup[] = [];
  for (const group of groups) {
    const kept = group.elementIds.filter((id) => liveIds.has(id));
    if (kept.length < 2) {
      changed = true;
      continue;
    }
    if (kept.length === group.elementIds.length) next.push(group);
    else {
      changed = true;
      next.push({ ...group, elementIds: kept });
    }
  }
  return changed ? next : (groups as PageGroup[]);
}

export function withoutGroup(groups: readonly PageGroup[], groupId: string): PageGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/** Rewrites member ids after elements got new ids (copies); unmapped ids stay. */
export function remapGroups(
  groups: readonly PageGroup[],
  idMap: ReadonlyMap<string, string>
): PageGroup[] {
  return groups.map((group) => ({
    ...group,
    elementIds: group.elementIds.map((id) => idMap.get(id) ?? id),
  }));
}

/**
 * What a plain click on `id` selects. A click on a member selects its whole
 * group; a click on a member while exactly that group is selected narrows to
 * the member alone.
 */
export function groupClickSelection(
  groups: readonly PageGroup[],
  selected: readonly string[],
  id: string
): string[] {
  const group = groupOf(groups, id);
  if (!group) return [id];
  const wholeSelected =
    selected.length === group.elementIds.length &&
    group.elementIds.every((member) => selected.includes(member));
  return wholeSelected ? [id] : expandToGroups(groups, [id]);
}

/** The groups the selection contains completely. */
export function wholeGroupsIn(
  groups: readonly PageGroup[],
  selected: readonly string[]
): PageGroup[] {
  return groups.filter((group) => group.elementIds.every((id) => selected.includes(id)));
}
