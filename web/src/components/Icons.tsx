import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const MicIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
  </svg>
);
export const MicOffIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 11.5 5.4M12 17v4M8 21h8M3 3l18 18" />
  </svg>
);
export const CamIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="6" width="14" height="12" rx="3" />
    <path d="M16 10l6-3v10l-6-3z" />
  </svg>
);
export const CamOffIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 16v1a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1M10 6h3a3 3 0 0 1 3 3v1l6-3v10M3 3l18 18" />
  </svg>
);
export const ScreenIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6" />
  </svg>
);
export const ChatIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>
);
export const LinkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);
export const PhoneOffIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.2 2.6a1 1 0 0 1-1.3.2l-2.6-1.6a1 1 0 0 1-.5-.9v-2a12 12 0 0 0-4.8 0v2a1 1 0 0 1-.5.9l-2.6 1.6a1 1 0 0 1-1.3-.2z" />
  </svg>
);
export const SendIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
export const SparkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />
  </svg>
);
export const VideoIcon = CamIcon;
export const PeopleIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" />
  </svg>
);
export const PhoneIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 3h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 7 7l1.4-2.3L21 15.5V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />
  </svg>
);
export const UserIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const KeyIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
  </svg>
);
export const SignOutIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </svg>
);
export const ArrowRightIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const PhoneDeviceIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </svg>
);
export const LaptopIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 19h20" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
export const HandIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.6 14.9a1.6 1.6 0 0 1 2.4-2.1L8 15.5" />
  </svg>
);
/** Face scan: four corners and a face, the universal "face unlock" mark. */
export const FaceIdIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 16a4.5 4.5 0 0 0 6 0" />
  </svg>
);
export const ShieldIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
    <path d="M9.3 12l1.9 1.9L15 10.2" />
  </svg>
);
export const PencilIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
);
export const GoogleIcon = (p: P) => (
  <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
  </svg>
);
export const GitHubIcon = (p: P) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 1A11 11 0 0 0 8.52 22.44c.55.1.75-.24.75-.53v-1.86c-3.06.67-3.71-1.47-3.71-1.47-.5-1.28-1.22-1.62-1.22-1.62-1-.68.08-.67.08-.67 1.1.08 1.68 1.14 1.68 1.14.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.47-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.18 1.14-2.95-.11-.28-.5-1.4.11-2.92 0 0 .93-.3 3.05 1.13a10.6 10.6 0 0 1 5.56 0c2.12-1.43 3.05-1.13 3.05-1.13.61 1.52.22 2.64.11 2.92.71.77 1.14 1.75 1.14 2.95 0 4.23-2.58 5.16-5.03 5.43.4.34.75 1 .75 2.02v3c0 .29.2.64.76.53A11 11 0 0 0 12 1Z" />
  </svg>
);
