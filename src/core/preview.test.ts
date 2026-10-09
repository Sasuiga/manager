import { describe, expect, it } from 'vitest'
import * as E from './engine'
import { settle } from './settle'
import { EVENTS } from '../data/game'
import type { GameState } from './types'

/**
 * 本期期末资金（回款前，preSettleCash）的桥接不变量：
 * 本期期末资金（回款前） + 回款区间 − 所得税区间 = 预计下期期初现金（low/high 各自精确成立），
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
      const s = E.newGame(def.seed) as GameState
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
      /** 预演现为确定性结算（因子 1）；注入 0.5 / 1.0 分别验证桥接不变量。 */
      const low = settle(clone(), { spotDemandFactor: { low: 0.5, mid: 0.5, high: 0.5, special: 0.5 } })
      const high = settle(clone(), { spotDemandFactor: { low: 1, mid: 1, high: 1, special: 1 } })
      expect(bridge(s, low), `${def.id} low`).toBe(low.ledger.cashEnd)
      expect(bridge(s, high), `${def.id} high`).toBe(high.ledger.cashEnd)
      expect(p.cashEnd.min, `${def.id} cashEnd min`).toBe(high.ledger.cashEnd)
      expect(p.cashEnd.max, `${def.id} cashEnd max`).toBe(high.ledger.cashEnd)
      expect(p.preSettle.agreementSpend, `${def.id} 协议`).toBe(
        low.autoPurchase.reduce((a, x) => a + x.total, 0),
      )
    }
  })

  it('有回款且有税：税务区间随回款区间浮动，且与真实结算一致', () => {
    const def = E.CORE_SCENARIOS.find((s) => s.id === 'expensive_high_demand')!
    const s = E.newGame(def.seed) as GameState
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
    /** 预演现为确定性结算（因子 1）；注入 0.5 / 1.0 分别验证桥接不变量。 */
    const low = settle(clone(), { spotDemandFactor: { low: 0.5, mid: 0.5, high: 0.5, special: 0.5 } })
    const high = settle(clone(), { spotDemandFactor: { low: 1, mid: 1, high: 1, special: 1 } })
    expect(p.revenue.max, '应有回款').toBeGreaterThan(0)
    expect(bridge(s, low)).toBe(low.ledger.cashEnd)
    expect(bridge(s, high)).toBe(high.ledger.cashEnd)
    expect(p.cashEnd.min).toBe(high.ledger.cashEnd)
    expect(p.cashEnd.max).toBe(high.ledger.cashEnd)
    expect(p.tax.min).toBe(high.ledger.parts['所得税'] ?? 0)
    expect(p.tax.max).toBe(high.ledger.parts['所得税'] ?? 0)
  })

  it('行动阶段实付/实收全分解，期初真值下桥接精确成立', () => {
    const s = E.newGame(7) as GameState
    E.startGame(s)
    s.depts.buy.staff = 3
    s.depts.buy.hired = 3
    s.debt = 200
    E.hire(s, 'ops') // 招聘费 50（行动阶段实付）
    E.buyEquipment(s, 'eq-line') // 设备 50（资本化，行动阶段实付）
    E.signAgreement(s, 'pkg', 3) // 协议手续费 10（杂项，行动阶段实付）
    E.repay(s, 60) // 还款 60（资本性，行动阶段实付）
    E.buyMaterial(s, 'pkg', 'mid') // 采购形成计划（结算时统一支付，不进行动阶段实付）

    const p = E.preSettleCash(s)
    // 行动阶段恒等式：期初现金 + 事件收益 + 事件现金（不计损益） − 各项已付 ≡ 当前现金（招聘费未蒸发在「期初」里）
    expect(p.cashOpen + p.gainedMisc + p.eventCashIn - (p.paidHire + p.paidMisc + p.paidCapex + p.paidRepay + p.paidPurchase)).toBe(s.cash)
    expect(p.paidHire).toBe(50)
    expect(p.paidCapex).toBe(50)
    expect(p.paidRepay).toBe(60)
    expect(p.paidMisc).toBe(10)
    expect(p.paidPurchase).toBe(0) // 普通采购已计划化
    expect(p.purchasePlan).toBeGreaterThan(0)

    // 期间桥接：本期期末资金（回款前）+ 回款 − 税 = 结算现金期末（= 下期期初）
    const clone = () => JSON.parse(JSON.stringify(s)) as GameState
    const low = settle(clone(), { spotDemandFactor: { low: 1, mid: 1, high: 1, special: 1 } })
    expect(bridge(s, low)).toBe(low.ledger.cashEnd)
  })

  it('下期挂账负债：应付职工薪酬 = 本月工资计提，利息按当前借款估算，挂账收付转下月', () => {
    const s = E.newGame(7) as GameState
    E.startGame(s)
    s.depts.make.staff = 4
    s.depts.make.hired = 4
    s.debt = 300
    s.pendingCost = 100
    s.pendingIncome = 60

    const p = E.previewOperations(s)
    const d = E.derive(s)
    const wage =
      d.salaryPer.ops * s.depts.ops.staff +
      d.salaryPer.buy * s.depts.buy.staff +
      d.salaryPer.make * s.depts.make.staff +
      d.salaryPer.sell * s.depts.sell.staff +
      d.salaryPer.rnd * s.depts.rnd.staff
    expect(p.nextLiabilities.wagePayable).toBe(wage)
    expect(p.nextLiabilities.interestEstimate).toBe(d.interest)
    expect(p.nextLiabilities.pendingCost).toBe(100)
    expect(p.nextLiabilities.pendingIncome).toBe(60)
    expect(p.nextLiabilities.net).toBe(wage + d.interest + 100 - 60)
  })

  it('X10 政府纾困：事件现金流入进桥接（不计损益，恒等式不破）', () => {
    const s = E.newGame(13) as GameState
    E.startGame(s)
    const cashBefore = s.cash
    s.currentEvent = EVENTS.find((e) => e.id === 'X10')!
    s.ap = 1
    E.acceptChance(s)
    expect(s.cash).toBe(cashBefore + 100)
    expect(s.pendingCost).toBe(100) // 下月偿还挂账（负债侧）

    const p = E.preSettleCash(s)
    expect(p.eventCashIn).toBe(100)
    expect(p.gainedMisc).toBe(0) // 损益中性，不进 miscIncome
    // 桥接不变量：期初 + 事件收益 + 事件现金 − 已付 ≡ 当前现金
    expect(
      p.cashOpen + p.gainedMisc + p.eventCashIn - (p.paidHire + p.paidMisc + p.paidCapex + p.paidRepay + p.paidPurchase),
    ).toBe(s.cash)
    // 预算页桥接总额（含全部扣减项）也等于当前现金
    expect(p.cashAfter + (p.paidHire + p.paidMisc + p.paidCapex + p.paidRepay + p.paidPurchase)).toBe(
      p.cashOpen + p.gainedMisc + p.eventCashIn,
    )
  })
})
