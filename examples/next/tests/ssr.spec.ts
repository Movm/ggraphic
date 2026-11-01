// SPDX-License-Identifier: MPL-2.0
import { expect, test } from '@playwright/test';

test('the server renders the host page without the editor and without an error', async ({
  request,
}) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const html = await response.text();

  expect(html).toContain('My host app');
  // GgraphicEditor renders nothing on the server; its root appears only in the browser.
  expect(html).not.toContain('data-ggraphic');
  // Next.js's error document, and React's marker for a boundary that failed on the server and
  // was left to the client.
  expect(html).not.toContain('__next_error__');
  expect(html).not.toContain('<!--$!-->');
});
