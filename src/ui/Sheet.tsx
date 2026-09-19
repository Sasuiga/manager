import { useEffect, type ReactNode } from 'react'
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <SheetCrown />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          {sub ? <div className="sheet-sub">{sub}</div> : null}
        </div>
        <div className="sheet-body">{children}</div>
        <div className="sheet-foot">
          <button className="btn btn-nav" onClick={onClose}>
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
