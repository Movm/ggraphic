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

  it('leaves icon search out unless the server has it on', () => {
    expect(createStudioServices({ ai: false, organisationId: 'o1' })).not.toHaveProperty(
      'iconSearch'
    );
    expect(
      createStudioServices({ ai: false, iconify: false, organisationId: 'o1' })
    ).not.toHaveProperty('iconSearch');
  });

  it('hands the editor an icon search when the server has it on', async () => {
    const hit = {
      prefix: 'tabler',
      name: 'tree',
      setTitle: 'Tabler Icons',
      licence: 'MIT',
      author: 'Paweł Kuna',
    };
    const search = vi.spyOn(api, 'searchIcons').mockResolvedValue([hit]);
    vi.spyOn(api, 'iconSvg').mockResolvedValue('<svg></svg>');
    const { iconSearch } = createStudioServices({ ai: false, iconify: true, organisationId: 'o1' });
    expect(await iconSearch!.search('tree')).toEqual([hit]);
    expect(search).toHaveBeenCalledWith('tree', 60, undefined);
    expect(await iconSearch!.svg('tabler', 'tree')).toBe('<svg></svg>');
    const refresh = vi.spyOn(api, 'refreshIcons').mockResolvedValue({ retryAfterSeconds: 3 });
    expect(await iconSearch!.refresh!('tree')).toEqual({ retryAfterSeconds: 3 });
    expect(refresh).toHaveBeenCalledWith('tree', 60);
    expect(iconSearch!.previewUrl('tabler', 'tree')).toBe('/api/assets/icons/tabler/tree.svg');
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
