import type { CSSProperties } from 'react'
export function Icon({ name, size = 18, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    up: <path d="m6 14 6-6 6 6" />,
    down: <path d="m6 10 6 6 6-6" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M5 15v5h14v-5" />
      </>
    ),
    upload: <path d="M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4" />,
    share: (
      <>
        <path d="m8 10 8-5M8 14l8 5" />
        <circle cx="5" cy="12" r="3" />
        <circle cx="19" cy="4" r="3" />
        <circle cx="19" cy="20" r="3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V4H4v12h4" />
      </>
    ),
    status: (
      <>
        <path d="m2 12 5-1 3-7 4 16 3-8h5" />
      </>
    ),
    context: (
      <>
        <path d="M4 17a9 9 0 1 1 16 0M12 12l4-4" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    checklist: (
      <>
        <path d="m3 6 2 2 3-4m-5 9 2 2 3-4M11 6h10M11 13h10M11 20h10" />
      </>
    ),
    undo: <path d="M3 10h11a6 6 0 0 1 0 12M3 10l6-6M3 10l6 6" />,
    link: (
      <>
        <path
          d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"
          transform="translate(2 -1)"
        />
      </>
    ),
    spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" />,
    terminal: (
      <>
        <path d="m4 6 5 6-5 6M12 18h8" />
      </>
    ),
    github: (
      <>
        <path d="M9 19c-5 1-5-3-7-3m14 6v-4c0-1-.3-2-1-2 4-.5 6-2 6-6a5 5 0 0 0-1-3 4 4 0 0 0 0-4s-2 0-4 2a13 13 0 0 0-7 0C7 3 5 3 5 3a4 4 0 0 0 0 4 5 5 0 0 0-1 3c0 4 2 5.5 6 6-1 .5-1 1-1 2v4" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  )
}
