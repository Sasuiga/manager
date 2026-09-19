/**
 * 图标：线条 SVG，描边 1.75–2，全部 currentColor 着色。
 * 内容区不留装饰，图标只做语义标记。
 */
interface Props {
  name: IconName
  size?: number
  className?: string
}

export type IconName = 'cash' | 'ap' | 'card' | 'ops' | 'buy' | 'make' | 'sell' | 'rnd' | 'log' | 'report' | 'chevron' | 'check' | 'cross' | 'clock' | 'warn' | 'seal'

const P: Record<IconName, React.ReactNode> = {
  cash: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h6M9 13h6M12 8v8" />
    </>
  ),
  ap: (
    <>
      <path d="M12 3l2.2 5.6L20 10l-4.4 3.4L16.6 20 12 16.8 7.4 20l1-6.6L4 10l5.8-1.4z" />
    </>
  ),
  card: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  ops: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  buy: (
    <>
      <path d="M4 6h2l2.4 10h9.2L20 8H7" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  make: (
    <>
      <path d="M4 20V9l5 3V9l5 3V7l6 4v9z" />
      <path d="M4 20h16" />
    </>
  ),
  sell: (
    <>
      <path d="M4 12l8-7 8 7" />
      <path d="M6 11v8h12v-8" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  rnd: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" />
      <path d="M7 15h10" />
    </>
  ),
  log: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </>
  ),
  report: (
    <>
      <path d="M5 20V4h14v16z" />
      <path d="M9 16v-4M12 16V8M15 16v-6" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 13l4 4L19 7" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  seal: (
    <>
      <circle cx="12" cy="10" r="6" />
      <path d="M9 15l-1 6 4-2 4 2-1-6" />
    </>
  ),
}

export function Icon({ name, size = 16, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  )
}
