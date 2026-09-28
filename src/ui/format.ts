import type { Money, Tier } from '../core/types'

/**
 * 金额单位：数据层一律以「角」记账（1w = 10）。
 * 展示时统一走这里，避免各页面各写一套换算。
 */

/** 42.50w / -3.00w / 0 —— 财务金额统一保留两位小数 */
export function wan(v: Money, digits = 2): string {
  const w = v / 10
  if (Math.abs(w) < 0.5 * 10 ** (1 - digits)) return '0'
  return w.toFixed(digits) + 'w'
}

/** 带符号：+3.00w / -3.00w */
export function wanSigned(v: Money, digits = 2): string {
  if (Math.abs(v) < 0.5 * 10 ** (1 - digits)) return '0'
  return (v > 0 ? '+' : '') + wan(v, digits)
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`
}

export function signed(n: number, digits = 0): string {
  return (n > 0 ? '+' : '') + n.toFixed(digits)
}

/** 价格档位 → 五档配色类名（内容区仅文字着色）。 */
export function tierClass(shift: number): string {
  const i = Math.max(0, Math.min(4, shift + 2))
  return `p${i}`
}

const SHIFT_NAME = ['极低', '低', '基准', '高', '极高']
export function tierName(shift: number): string {
  return SHIFT_NAME[Math.max(0, Math.min(4, shift + 2))]
}

export const TIER_ORDER: Tier[] = ['low', 'mid', 'high', 'special']

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
