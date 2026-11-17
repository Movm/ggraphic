// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor's own `react` / `react-dom` floor must satisfy what its other peers ask for (#134).
 * react-konva 19.3 needs React ^19.3.0; while the editor said ^19.0.0, npm accepted React 19.1 for
 * the editor and then failed on react-konva with ERESOLVE.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const editor = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>;
};

/** Finds an installed package's manifest the way Node does: up the node_modules chain. */
function manifestOf(name: string): { peerDependencies?: Record<string, string> } {
  for (let dir = pkgDir; ; dir = dirname(dir)) {
    const file = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    if (dirname(dir) === dir) throw new Error(`${name} is not installed`);
  }
}

type Version = [number, number, number];
const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The lowest version a `^x.y.z || ^…` range accepts. Other range forms fail the test. */
function floor(range: string): Version {
  const floors = range.split('||').map((part) => {
    const match = /^\s*\^(\d+)\.(\d+)\.(\d+)\s*$/.exec(part);
    if (!match) throw new Error(`unsupported range "${range}"`);
    return [Number(match[1]), Number(match[2]), Number(match[3])] as Version;
  });
  return floors.sort(compare)[0];
}

describe('peer ranges', () => {
  const others = Object.keys(editor.peerDependencies).filter(
    (name) => name !== 'react' && name !== 'react-dom'
  );

  for (const dep of ['react', 'react-dom']) {
    it.each(others)(`the editor's ${dep} floor satisfies %s`, (peer) => {
      const asked = manifestOf(peer).peerDependencies?.[dep];
      if (!asked) return;
      // Every part of the peer's range that the editor's floor could fall into must accept it.
      const ours = floor(editor.peerDependencies[dep]);
      const ok = asked.split('||').some((part) => {
        const theirs = floor(part);
        return theirs[0] === ours[0] && compare(ours, theirs) >= 0;
      });
      expect(ok, `${dep} ${editor.peerDependencies[dep]} vs ${peer} wants ${asked}`).toBe(true);
    });
  }
});
