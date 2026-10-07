/**
 * 形状目标（常驻里程碑）：四条形状 × 八条目标，开局可见、季度末判定、终身一次。
 *
 * 与董事会目标的分工：
 * - 董事会目标（完整模式）= 每季度抽的问题，会失败、随气候变；
 * - 形状目标（两种模式）= 公司在往哪个形状走，只升不降，达成即锁定。
 *
 * 指标口径复用目标系统（Ledger 季度累计 / 现有 flags），不新造判定管道。
 */
import { MILESTONES, MILESTONE_BY_ID, MILESTONE_SHAPES } from '../data/game'
import { Ledger, MilestoneDef, Money, GameState } from './types'
import { equityOf } from './game'

function quarterOf(month: number): number {
  return Math.ceil(month / 3)
}

/** 截至已结算月份的各季度账目（只含已结算的完整季度） */
function settledQuarters(state: GameState): { q: number; ledgers: Ledger[] }[] {
  const byQ = new Map<number, Ledger[]>()
  for (const l of state.ledgers) byQ.set(quarterOf(l.month), [...(byQ.get(quarterOf(l.month)) ?? []), l])
  return [...byQ.entries()].map(([q, ledgers]) => ({ q, ledgers })).sort((a, b) => a.q - b.q)
}

function sum(ledgers: Ledger[], f: (l: Ledger) => number): number {
  return ledgers.reduce((a, l) => a + f(l), 0)
}

/** 高端 + 特殊收入占比（%），口径同目标系统 highEndShare */
function highEndShare(ledgers: Ledger[]): number {
  const high = sum(ledgers, (l) => l.orders.concat(l.spots).filter((s) => s.tier === 'high' || s.tier === 'special').reduce((x, s) => x + s.revenue, 0))
  const total = sum(ledgers, (l) => l.revenue)
  return total > 0 ? Math.round((high / total) * 100) : 0
}

/** 季度收入（角） */
function revenueQ(ledgers: Ledger[]): Money {
  return sum(ledgers, (l) => l.revenue)
}

/** 季度内净利润 ≥ 0 的月份数（整季盈利 = 3/3） */
function profitMonths(ledgers: Ledger[]): number {
  return ledgers.filter((l) => l.netProfit >= 0).length
}

/** 负债 ÷ 净资产（%），口径同目标系统 debtToEquity */
function debtToEquityPct(state: GameState): number {
  const eq = equityOf(state)
  return eq > 0 ? Math.round((state.debt / eq) * 100) : 999
}

/** 已解锁的新产品线数（中端 / 高端 / 特殊） */
export function newLinesBuilt(state: GameState): number {
  return (['mid', 'high', 'special'] as const).filter((t) => state.products[t]?.built).length
}

function isDone(state: GameState, def: MilestoneDef): boolean {
  const sq = settledQuarters(state)
  switch (def.id) {
    case 'M02':
      return Object.values(state.materialsDeveloped).some((n) => n > 0)
    case 'M03':
      return (state.flags['agreementsSigned'] ?? 0) >= 1
    case 'M04':
      return sq.some(({ ledgers }) => highEndShare(ledgers) >= 30)
    case 'M06':
      return sq.some(({ ledgers }) => revenueQ(ledgers) >= 1000)
    case 'M07':
      return (state.flags['rndSuccessTotal'] ?? 0) >= 2
    case 'M08':
      return newLinesBuilt(state) >= 2
    case 'M09':
      return sq.some(({ ledgers }) => ledgers.length === 3 && profitMonths(ledgers) === 3)
    case 'M10':
      return debtToEquityPct(state) <= 25
    default:
      return false
  }
}

export interface MilestoneProgress {
  def: MilestoneDef
  done: boolean
  /** 进度展示文案（当前值 / 要求值，或定性描述） */
  text: string
}

/** 进度展示：「某季度」型取历史最好值，累计型取当前计数 */
export function milestoneProgress(state: GameState, def: MilestoneDef): MilestoneProgress {
  const done = state.milestones.includes(def.id)
  const sq = settledQuarters(state)
  let text = ''
  switch (def.id) {
    case 'M02': {
      const n = Object.values(state.materialsDeveloped).filter((x) => x > 0).length
      text = `已打通 ${n}/1 条新材料供给`
      break
    }
    case 'M03': {
      const n = Math.min(1, state.flags['agreementsSigned'] ?? 0)
      text = `长期协议 ${n}/1 份`
      break
    }
    case 'M04': {
      const best = sq.length ? Math.max(...sq.map(({ ledgers }) => highEndShare(ledgers))) : 0
      text = `最好季度高端占比 ${best}% / 30%`
      break
    }
    case 'M06': {
      const best = sq.length ? Math.max(...sq.map(({ ledgers }) => revenueQ(ledgers))) : 0
      text = `最好季度收入 ${(best / 10).toFixed(1)}w / 100w`
      break
    }
    case 'M07': {
      const n = state.flags['rndSuccessTotal'] ?? 0
      text = `研发成功 ${n}/2 项`
      break
    }
    case 'M08': {
      const n = newLinesBuilt(state)
      text = `新解锁产品线 ${n}/2 条`
      break
    }
    case 'M09': {
      const best = sq.length ? Math.max(...sq.map(({ ledgers }) => profitMonths(ledgers))) : 0
      text = `最好季度盈利月份 ${best}/3`
      break
    }
    case 'M10': {
      const cur = debtToEquityPct(state)
      text = `当前负债率 ${cur}% / ≤25%`
      break
    }
  }
  return { def, done, text }
}

export function allMilestoneProgress(state: GameState): MilestoneProgress[] {
  return MILESTONES.map((def) => milestoneProgress(state, def))
}

/**
 * 季度末判定：逐条检查未达成目标，达成则锁定（终身一次）。
 * 完整/核心模式都调用（核心模式无董事会阶段，形状目标是其唯一常驻目标）。
 */
export function checkMilestones(state: GameState): { id: string; name: string; points: number }[] {
  const results: { id: string; name: string; points: number }[] = []
  for (const def of MILESTONES) {
    if (state.milestones.includes(def.id)) continue
    if (isDone(state, def)) {
      state.milestones.push(def.id)
      state.milestonePoints += def.points
      results.push({ id: def.id, name: def.name, points: def.points })
    }
  }
  return results
}

export { MILESTONES, MILESTONE_BY_ID, MILESTONE_SHAPES }