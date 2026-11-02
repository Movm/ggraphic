// SPDX-License-Identifier: AGPL-3.0-only

export type StructuredResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ObjectCall<T> {
  system: string;
  prompt: string;
  /** JSON schema of the expected object; shown to the model in the system prompt. */
  schema: Record<string, unknown>;
  validate: (input: unknown) => Validation<T>;
  /** Total attempts including repairs. Default 2. */
  attempts?: number;
}

/** Injected by the host: one model round trip per attempt, repair turns quote the validator error. */
export type CallObject = <T>(call: ObjectCall<T>) => Promise<StructuredResult<T>>;
