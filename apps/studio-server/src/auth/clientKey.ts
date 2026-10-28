// SPDX-License-Identifier: AGPL-3.0-only
import { isIP } from 'node:net';

/** Expands an IPv6 address (no zone) to eight hextets, or null. */
function hextets(address: string): number[] | null {
  const [head = '', tail, ...more] = address.split('::');
  if (more.length > 0) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':'));
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array<string>(tail === undefined ? 0 : missing).fill('0'), ...right];
  const values = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return values.some(Number.isNaN) ? null : values;
}

/**
 * The rate-limit key for a client address. IPv6 is keyed by its /64: one host usually
 * holds a whole /64 and could otherwise rotate addresses past any per-address limit.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (isIP(ip) === 4) return ip;
  const address = ip.split('%')[0]!;
  if (isIP(address) !== 6) return 'unknown';
  const groups = hextets(address);
  if (!groups) return 'unknown';
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}
