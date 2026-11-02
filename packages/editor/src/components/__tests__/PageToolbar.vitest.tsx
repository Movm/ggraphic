// SPDX-License-Identifier: AGPL-3.0-only
/** The page toolbar: with one page there is nothing to move or delete, but the template can change. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PageToolbar } from '../PageToolbar.js';

const props = {
  pageIndex: 0,
  isActive: true,
  onMoveUp: () => {},
  onMoveDown: () => {},
  onDuplicate: () => {},
};

describe('PageToolbar', () => {
  it('on a single page offers only Change template', () => {
    const onChangeTemplate = vi.fn();
    render(<PageToolbar {...props} pageCount={1} onChangeTemplate={onChangeTemplate} />);
    screen.getByRole('button', { name: 'Vorlage ändern' }).click();
    expect(onChangeTemplate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /verschieben/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /duplizieren/ })).toBeNull();
  });

  it('on a single page without a template picker shows nothing', () => {
    const { container } = render(<PageToolbar {...props} pageCount={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('on several pages keeps the full toolbar', () => {
    render(<PageToolbar {...props} pageCount={2} onChangeTemplate={() => {}} />);
    expect(screen.getByRole('button', { name: 'Vorlage ändern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /duplizieren/ })).toBeInTheDocument();
  });
});
