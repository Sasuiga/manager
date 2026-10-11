import { describe, expect, it } from 'vitest'
import * as E from './engine'
import { OPENING_BASIC, OPENING_CHALLENGE } from '../data/game'
import type { GameState, Ledger } from './types'

/**
 * 董事会目标判定回归：
 *  - hiresQ（招聘计数）：flags['hiresTotal'] 累计器 + snapshotQuarter 快照，
 *    修复「招了人却判未达成」（B3 恒 0 / 跨季错计）；
 *  - grossProfitMonths 的 param 阈值必须生效（C4 曾漏 param，退化成「毛利 ≥ 0」白送分）。
 */

/** 推进到本月经营阶段（董事会 → 事件 → 抽卡 → 经营），无头测试公用。 */
function toOperate(s: GameState) {
  if (s.challengeOffered.length) E.chooseChallenge(s, 0)
  if (s.phase === 'board') E.beginMonthEvent(s)
  const ev = s.currentEvent
  if (ev) {
    if (ev.type === 'choice' && ev.options) E.applyEventOption(s, 0)
    else if (ev.type === 'chance' && ev.chance) E.skipEvent(s)
  }
  E.enterDraw(s)
  if (s.drawn.length) {
    for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
    E.confirmDraw(s)
  }
  E.enterOperate(s)
}

const b3 = OPENING_BASIC.find((d) => d.id === 'B3')!
const c4 = OPENING_CHALLENGE.find((d) => d.id === 'C4')!

function mkLedger(month: number, grossProfit: number): Ledger {
  return {
    month,
    revenue: grossProfit + 200,
    cogs: 200,
    grossProfit,
    sellExpense: 0,
    adminExpense: 0,
    rndExpense: 0,
    mfgExpense: 0,
    financeExpense: 0,
    netProfit: grossProfit - 50,
    cashBegin: 0,
    cashEnd: 0,
    borrowing: 0,
    repayment: 0,
    capex: 0,
    orders: [],
    spots: [],
    parts: {},
    demandFilled: 0,
    demandTotal: 0,
  }
}

describe('董事会目标判定', () => {
  it('hiresQ：本季招聘计入（B3 曾恒 0：招聘行动不更新 flag、快照缺 key）', () => {
    const s = E.newGame(1)
    E.startGame(s)
    toOperate(s)
    s.ap = 3 // 事件可能耗 AP，本测只关心招聘计数
    expect(E.goalCurrent(s, { def: b3, target: 1 })).toBe(0)
    const r = E.hire(s, 'sell')
    expect(r.ok).toBe(true)
    expect(E.goalCurrent(s, { def: b3, target: 1 })).toBe(1)
    E.hire(s, 'make') // 生产招聘费 0
    expect(E.goalCurrent(s, { def: b3, target: 1 })).toBe(2)
  })

  it('hiresQ 跨季口径：只计本季新增（上季快照为基准）', () => {
    const s = E.newGame(1)
    E.startGame(s)
    toOperate(s)
    s.ap = 3
    E.hire(s, 'sell')
    E.hire(s, 'make')
    // 上季末快照（settle.snapshotQuarter 口径）：累计 2 人已入快照
    s.quarterSnapshot['hiresTotal'] = 2
    E.hire(s, 'buy')
    expect(E.goalCurrent(s, { def: b3, target: 1 })).toBe(1) // 3 − 2 = 1，而非累计 3
  })

  it('grossProfitMonths：param 阈值必须生效（C4 漏 param 时退化为 ≥ 0）', () => {
    expect(c4.param).toBe(80) // 防漏配回归
    const s = E.newGame(1)
    s.month = 3
    s.ledgers = [mkLedger(1, 30), mkLedger(2, 30), mkLedger(3, 30)]
    // 3 个月毛利 3w < 8w 阈值 → 0 个月达标（若 param 缺失会判 3 个月，白送 20 分）
    expect(E.goalCurrent(s, { def: c4, target: 2 })).toBe(0)
    s.ledgers = [mkLedger(1, 90), mkLedger(2, 90), mkLedger(3, 30)]
    expect(E.goalCurrent(s, { def: c4, target: 2 })).toBe(2)
    expect(E.checkGoal({ def: c4, target: 2 }, E.goalCurrent(s, { def: c4, target: 2 }))).toBe(true)
  })
})
