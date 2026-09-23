import { describe, expect, it } from 'vitest'
import * as E from './engine'

function preparedCoreState() {
  const s = E.newGame(20260923, 'core')
  E.startGame(s)
  s.orders = []
  s.acceptedOrders = []
  s.materials.pkg.qty = 20
  s.materials.pkg.value = 200
  s.materials.resin.qty = 10
  s.materials.resin.value = 200
  E.setPlan(s, 'low', 8)
  E.setAlloc(s, 'low', E.derive(s).salesResource)
  return s
}

describe('核心循环预演', () => {
  it('预演不修改状态，并给出现货驱动的收入、毛利和现金区间', () => {
    const s = preparedCoreState()
    const before = JSON.stringify(s)
    const p = E.previewOperations(s)

    expect(JSON.stringify(s)).toBe(before)
    expect(p.plannedProduction).toBe(8)
    expect(p.capacityUsed).toBe(8)
    expect(p.spotQty.min).toBeLessThanOrEqual(p.spotQty.max)
    expect(p.revenue.min).toBeLessThanOrEqual(p.revenue.max)
    expect(p.grossProfit.min).toBeLessThanOrEqual(p.grossProfit.max)
    expect(p.cashEnd.min).toBeLessThanOrEqual(p.cashEnd.max)
    expect(p.products.find((x) => x.tier === 'low')?.planned).toBe(8)
  })

  it('核心模式正式结算结果落在预演区间内', () => {
    const s = preparedCoreState()
    const p = E.previewOperations(s)
    const report = E.settleMonth(s)

    expect(report.ledger.revenue).toBeGreaterThanOrEqual(p.revenue.min)
    expect(report.ledger.revenue).toBeLessThanOrEqual(p.revenue.max)
    expect(report.ledger.grossProfit).toBeGreaterThanOrEqual(p.grossProfit.min)
    expect(report.ledger.grossProfit).toBeLessThanOrEqual(p.grossProfit.max)
    expect(report.ledger.cashEnd).toBeGreaterThanOrEqual(p.cashEnd.min)
    expect(report.ledger.cashEnd).toBeLessThanOrEqual(p.cashEnd.max)
  })

  it('完整模式保持原有确定性现货需求', () => {
    const s = E.newGame(7, 'full')
    s.orders = []
    s.materials.pkg.qty = 20
    s.materials.pkg.value = 200
    s.materials.resin.qty = 10
    s.materials.resin.value = 200
    E.setPlan(s, 'low', 5)
    E.setAlloc(s, 'low', E.derive(s).salesResource)

    const p = E.previewOperations(s)
    expect(p.spotQty.min).toBe(p.spotQty.max)
    expect(p.revenue.min).toBe(p.revenue.max)
  })
})

describe('固定经营场景', () => {
  it('六个场景均可复现并保持三环初始状态干净', () => {
    expect(E.CORE_SCENARIOS).toHaveLength(6)
    for (const def of E.CORE_SCENARIOS) {
      const a = E.newGame(def.seed, 'core')
      const b = E.newGame(def.seed, 'core')
      E.startGame(a)
      E.startGame(b)
      E.applyCoreScenario(a, def.id)
      E.applyCoreScenario(b, def.id)

      expect(a.climate).toBe(b.climate)
      expect(a.cash).toBe(b.cash)
      expect(a.orders).toEqual(b.orders)
      expect(E.plannedTotal(a)).toBe(0)
      expect(E.allocUsed(a)).toBe(0)
      expect(Object.values(a.materials).every((m) => m.qty === 0 && m.value === 0)).toBe(true)
    }
  })

  it('固定场景表达各自的市场约束', () => {
    const make = (id: E.CoreScenarioId) => {
      const def = E.CORE_SCENARIOS.find((s) => s.id === id)!
      const s = E.newGame(def.seed, 'core')
      E.startGame(s)
      E.applyCoreScenario(s, id)
      return s
    }

    expect(make('cheap_low_demand').climate).toBe('depression')
    expect(make('expensive_high_demand').climate).toBe('overheat')
    expect(make('order_heavy').orders).toHaveLength(4)
    expect(make('spot_heavy').orders).toHaveLength(0)
    expect(E.derive(make('shared_material_shortage')).materials.alloy.supply).toBeLessThan(
      E.derive(make('order_heavy')).materials.alloy.supply,
    )
    expect(make('cash_constrained').cash).toBe(250)
  })
})

describe('订单与排产联动', () => {
  function orderState() {
    const s = E.newGame(88, 'core')
    E.startGame(s)
    s.orders = [
      { id: 'o1', tier: 'low', qty: 3, priceShift: 1, dueMonth: 1, from: 'test' },
      { id: 'o2', tier: 'low', qty: 2, priceShift: 1, dueMonth: 1, from: 'test' },
    ]
    s.acceptedOrders = []
    s.declinedOrders = []
    s.materials.pkg.qty = 20
    s.materials.pkg.value = 200
    s.materials.resin.qty = 10
    s.materials.resin.value = 200
    return s
  }

  it('没有对应排产时订单不可接受，排产足够后才可接受', () => {
    const s = orderState()
    expect(E.canAcceptOrder(s, 'o1')).toBe(false)
    expect(E.toggleOrder(s, 'o1').ok).toBe(false)

    E.setPlan(s, 'low', 3)
    expect(E.canAcceptOrder(s, 'o1')).toBe(true)
    expect(E.toggleOrder(s, 'o1').ok).toBe(true)
    expect(s.acceptedOrders).toEqual(['o1'])
  })

  it('已接订单占用可承诺量，排产减少后自动取消无法履约的订单', () => {
    const s = orderState()
    E.setPlan(s, 'low', 5)
    expect(E.toggleOrder(s, 'o1').ok).toBe(true)
    expect(E.toggleOrder(s, 'o2').ok).toBe(true)
    expect(s.acceptedOrders).toEqual(['o1', 'o2'])

    E.setPlan(s, 'low', 4)
    expect(s.acceptedOrders).toEqual(['o1'])
    expect(E.canAcceptOrder(s, 'o2')).toBe(false)

    E.setPlan(s, 'low', 5)
    expect(E.canAcceptOrder(s, 'o2')).toBe(true)
    expect(E.toggleOrder(s, 'o2').ok).toBe(true)
    expect(s.acceptedOrders).toEqual(['o1', 'o2'])
  })

  it('现有成品库存与本月排产共同构成可承诺量', () => {
    const s = orderState()
    s.products.low.qty = 1
    s.products.low.value = 40
    E.setPlan(s, 'low', 2)
    expect(E.availableForOrder(s, 'o1')).toBe(3)
    expect(E.canAcceptOrder(s, 'o1')).toBe(true)
  })
})
