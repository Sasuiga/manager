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
