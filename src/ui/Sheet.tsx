import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SheetCrown } from './ornaments'

/**
 * 底部升起的全屏抽屉。
 * 手机竖屏下所有「详情 / 确认」都走这里，不用 PC 式浮窗。
 */
export function Sheet({
  title,
  sub,
  onClose,
  children,
  footer,
}: {
  title: string
  sub?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  // 关闭时先播退出动画，动画结束后再调用 onClose 真正卸载，避免突兀消失
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const timer = useRef<number | null>(null)
  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    // 兜底：比退出动画（480ms）略长，防止掉帧时动画未播完就先卸载
    timer.current = window.setTimeout(onClose, 560)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closingRef.current) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return (
    <div
      className={`sheet-overlay${closing ? ' out' : ''}`}
      onAnimationEnd={() => {
        if (closing) onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`sheet${closing ? ' out' : ''}`} onClick={(e) => e.stopPropagation()}>
        <SheetCrown />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          {sub ? <div className="sheet-sub">{sub}</div> : null}
        </div>
        <div className="sheet-body">{children}</div>
        <div className="sheet-foot">
          <button className="btn btn-nav" onClick={close}>
            <span className="btn-main">关闭</span>
          </button>
          {footer}
        </div>
      </div>
    </div>
  )
}

/** 键值行：内容区，无装饰。 */
export function Row({
  k,
  v,
  cls,
  bold,
}: {
  k: ReactNode
  v: ReactNode
  cls?: string
  bold?: boolean
}) {
  return (
    <div className={`row${bold ? ' bold' : ''}`}>
      <span className="row-key">{k}</span>
      <span className={`row-val ${cls ?? ''}`}>{v}</span>
    </div>
  )
}

/** 分段控件。 */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 进度条。 */
export function Bar({
  value,
  max,
  kind,
  done,
}: {
  value: number
  max: number
  kind?: 'emerald' | 'red'
  /** 已达成时直接画满：阈值可能是 0 或负数，按比例算会算成空条 */
  done?: boolean
}) {
  const w = done ? 100 : max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`bar ${kind ?? ''}`}>
      <i style={{ width: `${w}%` }} />
    </div>
  )
}
