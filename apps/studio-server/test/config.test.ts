// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgres://x@localhost/x' };

describe('loadConfig', () => {
  it('uses defaults for empty values', () => {
    const config = loadConfig({ ...base, UPLOAD_MAX_BYTES: '', PORT: '', OPENAI_API_KEY: '' });
    expect(config.uploadMaxBytes).toBe(10 * 1024 * 1024);
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.ai).toBeNull();
  });

  it('turns AI on only with base URL, key and model', () => {
    const ai = {
      OPENAI_BASE_URL: 'https://api.mistral.ai/v1/',
      OPENAI_API_KEY: 'k',
      OPENAI_MODEL: 'm',
    };
    expect(loadConfig({ ...base, ...ai })?.ai).toMatchObject({
      baseUrl: 'https://api.mistral.ai/v1',
      model: 'm',
    });
    expect(loadConfig({ ...base, ...ai, OPENAI_MODEL: '' }).ai).toBeNull();
  });

  it('defaults to secure cookies, closed registration and no proxy trust', () => {
    const config = loadConfig(base);
    expect(config.cookieSecure).toBe(true);
    expect(config.allowRegistration).toBe(false);
    expect(config.trustProxy).toBe(false);
    expect(config.fontMaxBytes).toBe(5 * 1024 * 1024);
  });

  it('reads the account switches', () => {
    const config = loadConfig({
      ...base,
      COOKIE_SECURE: 'false',
      ALLOW_REGISTRATION: 'true',
      TRUST_PROXY: '1',
      FONT_MAX_BYTES: '1000',
    });
    expect(config).toMatchObject({
      cookieSecure: false,
      allowRegistration: true,
      trustProxy: 1,
      fontMaxBytes: 1000,
    });
    expect(loadConfig({ ...base, TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback');
    expect(loadConfig({ ...base, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(() => loadConfig({ ...base, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
  });

  it('names invalid fields without echoing values', () => {
    expect(() => loadConfig({ PORT: 'abc', OPENAI_API_KEY: 'sk-secret' })).toThrow(
      /DATABASE_URL, PORT$/
    );
  });
});
