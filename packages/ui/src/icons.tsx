// SPDX-License-Identifier: MPL-2.0
import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export const EyeIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const EyeOffIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.1-4.9M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2" />
    <path d="m2 2 20 20M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
export const CheckIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const ArrowUpIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
export const InfoIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
export const AlertTriangleIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3 2 20h20L12 3ZM12 10v4.5M12 17.5h.01" />
  </svg>
);
export const CheckCircleIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 3 3 5-6" />
  </svg>
);
export const XCircleIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </svg>
);
