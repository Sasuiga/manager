import { describe, expect, it } from 'vitest'
import { newGame } from './game'
import * as E from './engine'
import { Rng } from './rng'
import { CARD_BY_ID, IP_SETS, MILESTONES } from '../data/game'
import type { GameState } from './types'

function core(seed: number): GameState {
  const s = newGame(seed)
  E.startGame(s)
  s.eventResolved = true
  E.startGame(s)
  E.enterOperate(s)
  return s
}

describe('规则卡（K 系列：改本月规则、制造取舍）', () => {
  it('K1 定价权：现货档位可选，每高 1 档需求 −1（订单不受影响）', () => {
    const s = core(10)
    s.monthFlags.push('spotPriceChoice')
    const d0 = E.derive(s)
    expect(E.setSpotPrice(s, 2).ok).toBe(true)
    const d1 = E.derive(s)
    for (const t of E.TIERS) {
      expect(d1.spotShift[t] - d0.spotShift[t]).toBe(2) // 现货 +2 档
      expect(d1.demand[t] <= d0.demand[t]).toBe(true) // 需求惩罚
    }
    // 强化版惩罚减半
    const s2 = core(10)
    s2.monthFlags.push('spotPriceChoice', 'spotPriceChoiceNoPenalty')
    E.setSpotPrice(s2, 2)
    const d3 = E.derive(s2)
    for (const t of E.TIERS) {
      expect(d3.demand[t]).toBe(Math.max(0, E.derive(s2).demandBase[t] - 1))
    }
  })

  it('K2 灵活交付：承诺量 +5，接单带 flex 标记，月末缺口付 20% 违约金', () => {
    const s = core(11)
    s.monthFlags.push('flex5')
    expect(E.committableProductQty(s, 'low')).toBe(5)
    s.orders.push({ id: 't1', tier: 'low', qty: 5, priceShift: 1, dueMonth: s.month, from: 'test' })
    expect(E.toggleOrder(s, 't1').ok).toBe(true)
    expect(s.orders.find((o) => o.id === 't1')?.flex).toBeDefined()
    const cashBefore = s.cash
    const d = E.derive(s)
    const unit = E.priceAtProduct('low', 1 + d.priceShift.low)
    E.settleMonth(s)
    // 库存 0 交付 0 件 → 缺口 5 件 × 单价 × 20%
    expect(s.cash).toBe(cashBefore - Math.round(unit * 5 * 0.2))
  })

  it('K3 双档采购：第二档（小批 +1 档价）计入采购计划量与成本', () => {
    const s = core(12)
    s.monthFlags.push('doubleLot')
    E.setPurchasePlan(s, 'pkg', 'mid')
    const line0 = E.plannedPurchaseLine(s, 'pkg')
    expect(E.setSecondLot(s, 'pkg').ok).toBe(true)
    const line1 = E.plannedPurchaseLine(s, 'pkg')
    expect(line1.qty).toBeGreaterThan(line0.qty)
    expect(line1.cost).toBeGreaterThan(line0.cost)
    expect(E.clearSecondLot(s).ok).toBe(true)
    expect(E.plannedPurchaseLine(s, 'pkg').qty).toBe(line0.qty)
  })

  it('K5 快周转：现货不受需求限制（全库存可售）、售价 −1 档', () => {
    const s = core(13)
    s.products.low.qty = 10
    s.products.low.value = 100
    s.monthFlags.push('spotUnlimited')
    const d = E.derive(s)
    E.settleMonth(s)
    const report = s.ledgers.at(-1)!
    const spot = report.spots.filter((x) => x.tier === 'low')
    expect(spot.reduce((a, x) => a + x.qty, 0)).toBe(10) // 需求不足也全部卖出
    expect(spot[0].unitPrice).toBe(E.priceAtProduct('low', d.priceShift.low - 1)) // 售价 −1 档
  })

  it('K6 编制优化：canFireCard 额度允许裁员并返还 100% 基础招聘费', () => {
    const s = core(14)
    s.depts.buy.staff = 2
    s.depts.buy.hired = 2
    const cash = s.cash
    expect(E.fire(s, 'buy').ok).toBe(false)
    s.monthFlags.push('canFireCard')
    expect(E.fire(s, 'buy').ok).toBe(true)
    expect(s.cash - cash).toBe(50) // 基础招聘费（首档 5w）× 100%
  })

  it('加班补贴（P12，原 K8）：加班费减半', () => {
    const s = core(15)
    s.depts.make.staff = 3
    const d0 = E.derive(s)
    s.monthFlags.push('overtimeHalf')
    const d1 = E.derive(s)
    expect(d1.overtimeHalf).toBe(true)
    expect(d0.overtimeHalf).toBe(false)
  })

  it('K7 市场情报：climateOdds 标志开启展示位', () => {
    const s = core(16)
    expect(E.derive(s).climateOddsVisible).toBe(false)
    s.monthFlags.push('climateOdds')
    expect(E.derive(s).climateOddsVisible).toBe(true)
  })

  it('牌库含规则卡（全提案卡 1 副入池 + 0 档卡 2 副）', () => {
    const s = newGame(20)
    E.buildDeck(s, new Rng(20))
    // 73 张提案卡各 1 副；0 档卡 12 张各再 1 副 → 85
    expect(s.deck.length).toBe(85)
    for (const id of ['K1', 'K5']) expect(CARD_BY_ID[id]).toBeTruthy()
  })

  it('形状目标与知产套装数据完整性', () => {
    expect(MILESTONES.length).toBe(8)
    expect(IP_SETS.length).toBe(4)
    for (const set of IP_SETS) {
      for (const ipId of set.ips) expect(typeof ipId).toBe('string')
    }
  })
})
