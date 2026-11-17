// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { brandDefault, type BrandPack } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '../../../brand/brandRegistry.js';
import { messages } from '../../../i18n/messages.js';
import { axe } from '../../../test-utils';

import { FloatingFontRoleControl } from './FloatingFontRoleControl';

const original = activeBrand();
beforeEach(() => registerBrandPacks([brandDefault]));
afterEach(() => registerBrandPacks([original]));

const t = () => messages().topBar;
const picker = () => screen.getByRole('combobox', { name: t().fontRole }) as HTMLSelectElement;
const options = () => Array.from(picker().options);

describe('FloatingFontRoleControl', () => {
  it('offers the roles of the brand, each in its own font', () => {
    render(<FloatingFontRoleControl text={{ fontFamily: 'Anton, Arial' }} onChange={() => {}} />);
    expect(options().map((o) => o.textContent)).toEqual([
      t().fontRoles.headline,
      t().fontRoles.body,
      t().fontRoles.condensed,
      t().fontRoles.serif,
    ]);
    expect(options().map((o) => o.value)).toEqual(['headline', 'body', 'condensed', 'serif']);
    expect(options().map((o) => o.style.fontFamily)).toEqual([
      expect.stringContaining('Bricolage Grotesque'),
      expect.stringContaining('Instrument Sans'),
      expect.stringContaining('Anton'),
      expect.stringContaining('Fraunces'),
    ]);
  });

  it('offers only the roles that differ when the brand has no serif or condensed font', () => {
    const org: BrandPack = {
      ...brandDefault,
      fonts: {
        headline: 'Raleway',
        body: 'Lora',
        quoteShort: 'Raleway',
        quoteEmphasis: 'Lora',
      },
    };
    registerBrandPacks([org]);
    render(<FloatingFontRoleControl text={{ fontFamily: 'Raleway' }} onChange={() => {}} />);
    expect(options().map((o) => o.value)).toEqual(['headline', 'body']);
  });

  it('selects the bound role', () => {
    render(
      <FloatingFontRoleControl
        text={{
          fontFamily: 'Fraunces, Georgia, serif',
          bind: { fontFamily: { ref: 'font.serif', value: 'Fraunces' } },
        }}
        onChange={() => {}}
      />
    );
    expect(picker().value).toBe('serif');
  });

  it('selects the role whose family the text uses when it is not bound', () => {
    render(
      <FloatingFontRoleControl
        text={{ fontFamily: 'Instrument Sans, Arial, sans-serif' }}
        onChange={() => {}}
      />
    );
    expect(picker().value).toBe('body');
  });

  it('shows a family no role has as a disabled entry of its own', () => {
    render(
      <FloatingFontRoleControl
        text={{ fontFamily: 'Comic Sans MS, cursive' }}
        onChange={() => {}}
      />
    );
    const custom = options()[0]!;
    expect(custom.textContent).toBe(t().fontRoleCustom('Comic Sans MS'));
    expect(custom.disabled).toBe(true);
    expect(picker().selectedOptions[0]).toBe(custom);
    // The roles are all still offered.
    expect(options()).toHaveLength(5);
  });

  it('reports the role picked', () => {
    const onChange = vi.fn();
    render(<FloatingFontRoleControl text={{ fontFamily: 'Anton' }} onChange={onChange} />);
    fireEvent.change(picker(), { target: { value: 'serif' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('serif');
  });

  describe('asking for the face of the family picked', () => {
    const load = vi.fn(() => Promise.resolve([]));
    beforeEach(() => {
      load.mockClear();
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { check: () => false, load, addEventListener: () => {}, ready: Promise.resolve() },
      });
    });
    afterEach(() => {
      Reflect.deleteProperty(document, 'fonts');
    });

    it('starts loading it before the text is switched to it', () => {
      const order: string[] = [];
      load.mockImplementation(() => {
        order.push('load');
        return Promise.resolve([]);
      });
      render(
        <FloatingFontRoleControl
          text={{ fontFamily: 'Anton' }}
          onChange={() => order.push('change')}
        />
      );
      fireEvent.change(picker(), { target: { value: 'serif' } });
      expect(load).toHaveBeenCalledWith(expect.stringContaining('"Fraunces"'), expect.any(String));
      expect(order).toEqual(['load', 'change']);
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FloatingFontRoleControl text={{ fontFamily: 'Anton' }} onChange={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
