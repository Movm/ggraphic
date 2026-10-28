// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';

import { createStudioServices } from './services';

afterEach(() => vi.restoreAllMocks());

describe('createStudioServices', () => {
  it('leaves background removal out unless the server has it on', () => {
    expect(createStudioServices({ ai: false, organisationId: 'o1' })).not.toHaveProperty(
      'removeBackgroundFromImage'
    );
    expect(
      createStudioServices({ ai: false, removeBackground: false, organisationId: 'o1' })
    ).not.toHaveProperty('removeBackgroundFromImage');
  });

  it('hands the editor a background remover when the server has it on', async () => {
    vi.spyOn(api, 'removeBackground').mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:cut' }));
    const services = createStudioServices({
      ai: false,
      removeBackground: true,
      organisationId: 'o1',
    });
    const result = await services.removeBackgroundFromImage!(
      new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    );
    expect(result.file.name).toBe('foto-cutout.png');
    expect(result.file.type).toBe('image/png');
    expect(result.objectUrl).toBe('blob:cut');
  });
});
