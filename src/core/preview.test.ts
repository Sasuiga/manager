import { describe, expect, it } from 'vitest'
import * as E from './engine'
import { settle } from './settle'
import type { GameState } from './types'

/**
 * 结算前现金（preSettleCash）的桥接不变量：
 * 结算前现金 + 回款区间 − 所得税区间 = 推演期末现金（low/high 各自精确成立），
 * 且协议自动采购的模拟金额与真实结算一致。
 */
function bridge(state: GameState, run: ReturnType<typeof settle>): number {
  const p = E.preSettleCash(state)
  const revenue =
    run.ledger.orders.reduce((a, r) => a + r.revenue, 0) +
    run.ledger.spots.reduce((a, r) => a + r.revenue, 0)
  return p.cashAfter + revenue - (run.ledger.parts['所得税'] ?? 0)
}

describe('结算前现金（preSettleCash）', () => {
  it('六个核心场景：桥接精确成立，协议模拟与结算一致', () => {
    for (const def of E.CORE_SCENARIOS) {
      const s = E.newGame(def.seed, 'core') as GameState
      E.startGame(s)
      E.applyCoreScenario(s, def.id)
      s.depts.make.staff = Math.max(s.depts.make.staff, 4)
      s.depts.make.hired = s.depts.make.staff
      s.depts.buy.staff = Math.max(s.depts.buy.staff, 3)
      E.buyMaterial(s, 'pkg', 'large')
      E.setPlan(s, 'low', 8)
      E.toggleOvertime(s)
      if (s.depts.sell.staff > 0) {
        E.setAlloc(s, 'low', E.derive(s).salesPushCost.low * 2)
      }
      if (E.derive(s).materials.pkg.supply > 0) E.signAgreement(s, 'pkg', 3)
      for (const o of s.orders) if (!o.forced && !s.acceptedOrders.includes(o.id)) E.toggleOrder(s, o.id)

      const p = E.previewOperations(s)
      const clone = () => JSON.parse(JSON.stringify(s)) as GameState
      const low = settle(clone(), { spotDemandFactor: { low: 0.5, mid: 0.5, high: 0.5, special: 0.5 } })
      const high = settle(clone(), { spotDemandFactor: { low: 1, mid: 1, high: 1, special: 1 } })
      expect(bridge(s, low), `${def.id} low`).toBe(low.ledger.cashEnd)
      expect(bridge(s, high), `${def.id} high`).toBe(high.ledger.cashEnd)
      expect(p.cashEnd.min, `${def.id} cashEnd min`).toBe(low.ledger.cashEnd)
      expect(p.cashEnd.max, `${def.id} cashEnd max`).toBe(high.ledger.cashEnd)
      expect(p.preSettle.agreementSpend, `${def.id} 协议`).toBe(
        low.autoPurchase.reduce((a, x) => a + x.total, 0),
      )
    }
  })

  it('有回款且有税：税务区间随回款区间浮动，且与真实结算一致', () => {
    const def = E.CORE_SCENARIOS.find((s) => s.id === 'expensive_high_demand')!
    const s = E.newGame(def.seed, 'core') as GameState
    E.startGame(s)
    E.applyCoreScenario(s, def.id)
    s.depts.make.staff = Math.max(s.depts.make.staff, 4)
    s.depts.make.hired = s.depts.make.staff
    s.depts.buy.staff = Math.max(s.depts.buy.staff, 3)
    // 直接给足成品库存，保证接单一定有交付与回款
    s.products.low.qty = 20
    s.products.low.value = 20 * 40
    s.products.low.avgCost = 40
    for (const o of s.orders) if (!o.forced && !s.acceptedOrders.includes(o.id)) E.toggleOrder(s, o.id)

    const p = E.previewOperations(s)
    const clone = () => JSON.parse(JSON.stringify(s)) as GameState
    const low = settle(clone(), { spotDemandFactor: { low: 0.5, mid: 0.5, high: 0.5, special: 0.5 } })
    const high = settle(clone(), { spotDemandFactor: { low: 1, mid: 1, high: 1, special: 1 } })
    expect(p.revenue.max, '应有回款').toBeGreaterThan(0)
    expect(bridge(s, low)).toBe(low.ledger.cashEnd)
    expect(bridge(s, high)).toBe(high.ledger.cashEnd)
    expect(p.cashEnd.min).toBe(low.ledger.cashEnd)
    expect(p.cashEnd.max).toBe(high.ledger.cashEnd)
    expect(p.tax.min).toBe(low.ledger.parts['所得税'] ?? 0)
    expect(p.tax.max).toBe(high.ledger.parts['所得税'] ?? 0)
  })
})
