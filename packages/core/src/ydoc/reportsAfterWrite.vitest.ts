// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `onPlainFallback` runs only after the write it reports on is over (review of the deterministic
 * lift on #211, finding 1). Before, it ran inside the write: a hook that wrote to the document
 * wrote under the deterministic lift's derived id (two replicas, one struct id, different content:
 * they never converged), and a hook that threw aborted the lift after the stamp, or a user write
 * after its first key.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  liftDocumentState,
  liftSalt,
  readState,
  stateKeyClasses,
  transactDeterministically,
  writeStateKeys,
  type PlainFallback,
} from './index.js';
import { isDerivedClientId } from './internal.js';

const classes = stateKeyClasses();
const SALT = liftSalt({ schemaVersion: 4, kindVersions: {} }, classes);
const DUPLICATE = [{ id: 'a' }, { id: 'a' }];

function v3(clientID = 500): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  doc.transact(() => {
    const page = new Y.Map<unknown>();
    const stateY = new Y.Map<unknown>();
    stateY.set('layerOrder', ['x']);
    stateY.set('shapeInstances', DUPLICATE);
    stateY.set('additionalTexts', [{ id: 't', text: 'T' }]);
    page.set('state', stateY);
    doc.getMap('pagesById').set('p1', page);
    doc.getMap('meta').set('schemaVersion', 3);
  });
  return doc;
}
const replica = (doc: Y.Doc, clientID: number) => {
  const copy = new Y.Doc();
  copy.clientID = clientID;
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
};
const stateOf = (doc: Y.Doc) =>
  (doc.getMap('pagesById').get('p1') as Y.Map<unknown>).get('state') as Y.Map<unknown>;
const liftWith = (doc: Y.Doc, onPlainFallback: (f: PlainFallback) => void) =>
  transactDeterministically(doc, SALT, () => {
    doc.getMap('meta').set('schemaVersion', 4);
    liftDocumentState(doc, classes, { onPlainFallback });
  });

describe('a hook of the deterministic lift', () => {
  it('runs after it, under the document’s own id; its write is the client’s own', () => {
    const base = v3();
    const [a, b] = [replica(base, 1), replica(base, 2)];
    const seenIds: number[] = [];
    for (const doc of [a, b]) {
      liftWith(doc, () => {
        seenIds.push(doc.clientID);
        expect(doc._transaction).toBeNull();
        doc.getMap('meta').set('warnedBy', doc.clientID);
      });
    }
    expect(seenIds).toEqual([1, 2]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    expect(readState(stateOf(a))).toEqual(readState(stateOf(b)));
    expect(a.getMap('meta').get('warnedBy')).toBe(b.getMap('meta').get('warnedBy'));
    // Each hook's write is under its client's own id, one derived id for both lifts.
    const ids = Array.from(Y.decodeStateVector(Y.encodeStateVector(a)).keys());
    expect(ids.filter(isDerivedClientId)).toHaveLength(1);
    expect(ids).toEqual(expect.arrayContaining([1, 2]));
  });

  it('that throws does not stop the lift', () => {
    const doc = v3();
    expect(() =>
      liftWith(doc, () => {
        throw new Error('telemetry down');
      })
    ).not.toThrow();
    expect(stateOf(doc).get('layerOrder')).toBeInstanceOf(Y.Map);
    expect(stateOf(doc).get('additionalTexts')).toBeInstanceOf(Y.Map);
    expect(stateOf(doc).get('shapeInstances')).toEqual(DUPLICATE);
  });
});

describe('a hook of a user write', () => {
  const v4 = () => {
    const doc = v3();
    doc.getMap('meta').set('schemaVersion', 4);
    return doc;
  };
  const partial = {
    headline: 'new',
    shapeInstances: [{ id: 'q' }, { id: 'q' }],
    textBoxes: [{ id: 't' }],
  };

  it('that throws does not stop the write: every key is written', () => {
    const doc = v4();
    const onPlainFallback = () => {
      throw new Error('telemetry down');
    };
    expect(() =>
      writeStateKeys(stateOf(doc), partial, { classes, lift: true, onPlainFallback })
    ).not.toThrow();
    expect(readState(stateOf(doc))).toMatchObject(partial);
  });

  it('runs after the write’s transaction; inside a caller’s transaction, after that one', () => {
    const doc = v4();
    const order: string[] = [];
    const onPlainFallback = () => {
      order.push(doc._transaction === null ? 'hook after' : 'hook inside');
      doc.getMap('meta').set('warned', true);
    };
    doc.transact(() => {
      writeStateKeys(stateOf(doc), partial, { classes, lift: true, onPlainFallback });
      order.push('caller body end');
    });
    expect(order).toEqual(['caller body end', 'hook after']);
    expect(doc.getMap('meta').get('warned')).toBe(true);
  });
});
