import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6.2" />
      <path d="M20 4v7h-7" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.5 16a5.5 5.5 0 0 1 7 0" />
      <path d="M12 19.5h.01" />
    </>
  ),
  up: <path d="m7 14 5-5 5 5" />,
  down: <path d="m7 10 5 5 5-5" />,
  news: (
    <>
      <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
      <path d="M17 8h3v9a2 2 0 0 1-2 2h-1" />
      <path d="M7 8h7M7 12h7M7 16h4" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  play: <path d="m8 5 12 7-12 7V5Z" />,
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 5.9a7 7 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1a7 7 0 0 0 1.7 1l.4 2.9h5l.4-2.9a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" />
    </>
  ),
  send: <path d="m3 11 18-8-8 18-2.5-7.5L3 11Z" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4 3.5 7.5 7 9 3.5-1.5 7-5 7-9V6l-7-3Z" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
};

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.8,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.activity}
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logo-gradient" x1="10" y1="50" x2="54" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill="#0b111b" stroke="#1e2938" />
      <path
        d="M14 44 27 30l8 7 15-19"
        stroke="url(#logo-gradient)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="18" r="4.5" fill="#22c55e" />
    </svg>
  );
}
