/**
 * 装饰几何：只出现在框架层（角饰 / 边框 / 标题饰线 / 徽章 / 抽屉顶饰）。
 * 全部 currentColor 着色，颜色由 CSS 变量控制。
 */

/** 卷草角饰：同一几何四旋复用。 */
export function OrnCorner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg className={`orn-corner ${pos}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12V4a2 2 0 012-2h8M6 12V7a1 1 0 011-1h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="4.5" cy="4.5" r="1.6" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

/** hero 容器四角全配。 */
export function Corners() {
  return (
    <>
      <OrnCorner pos="tl" />
      <OrnCorner pos="tr" />
      <OrnCorner pos="bl" />
      <OrnCorner pos="br" />
    </>
  )
}

/** 抽屉顶饰：复用角饰几何。 */
export function SheetCrown() {
  return (
    <svg className="sheet-crown" viewBox="0 0 48 16" fill="none" aria-hidden="true">
      <path d="M2 14c6 0 8-10 14-10s8 10 14 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M30 14c6 0 8-10 14-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M24 3l2 3-2 3-2-3z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

/** 图标徽章：双环 + 四向刻线。 */
export function Medallion({
  children,
  size = 36,
}: {
  children: React.ReactNode
  size?: number
}) {
  return (
    <span className="medal" style={{ width: size, height: size }}>
      <span style={{ display: 'grid', placeItems: 'center', color: 'var(--gold)' }}>{children}</span>
    </span>
  )
}
