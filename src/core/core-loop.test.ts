import { describe, expect, it } from 'vitest'
import * as E from './engine'
import { Rng } from './rng'
import { EVENT_BY_ID } from '../data/game'

function preparedCoreState() {
  const s = E.newGame(20260923, 'core')
  E.startGame(s)
  E.hire(s, 'make')
  E.hire(s, 'make')
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

  it('收入与毛利可按产品拆分，产品内再按订单/现货拆分并可还原汇总值', () => {
    const s = preparedCoreState()
    const p = E.previewOperations(s)
    for (const item of p.products) {
      expect(item.orderRevenue + item.spotRevenue.min).toBe(item.revenue.min)
      expect(item.orderRevenue + item.spotRevenue.max).toBe(item.revenue.max)
      expect(item.orderGrossProfit + item.spotGrossProfit.min).toBeCloseTo(item.grossProfit.min, 1)
      expect(item.orderGrossProfit + item.spotGrossProfit.max).toBeCloseTo(item.grossProfit.max, 1)
    }
    expect(p.products.reduce((a, x) => a + x.revenue.min, 0)).toBe(p.revenue.min)
    expect(p.products.reduce((a, x) => a + x.revenue.max, 0)).toBe(p.revenue.max)
    expect(p.products.reduce((a, x) => a + x.grossProfit.min, 0)).toBe(p.grossProfit.min)
    expect(p.products.reduce((a, x) => a + x.grossProfit.max, 0)).toBe(p.grossProfit.max)
  })

  it('核心模式正式结算结果落在预演区间内', () => {
    const s = preparedCoreState()
    const p = E.previewOperations(s)
    const report = E.settleMonth(s)

    expect(report.ledger.revenue).toBeGreaterThanOrEqual(p.revenue.min)
    expect(report.ledger.revenue).toBeLessThanOrEqual(p.revenue.max)
    // 预计毛利现为统一口径（含固定成本分摊），与损益表口径的 report.ledger.grossProfit 不保证同区间，不再断言
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
    expect(make('shared_material_shortage').depts.sell.staff).toBe(0)
    expect(E.derive(make('shared_material_shortage')).materials.alloy.supply).toBeLessThan(
      E.derive(make('order_heavy')).materials.alloy.supply,
    )
    expect(make('spot_heavy').orders).toHaveLength(0)
    expect(make('spot_heavy').depts.sell.staff).toBe(0)
    expect(make('cash_constrained').cash).toBe(250)
    expect(make('cash_constrained').depts.sell.staff).toBe(0)
    expect(make('order_heavy').depts.sell.staff).toBe(4)
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

describe('三線招聘（人员能力与解锁轨道）', () => {
  function fresh(seed = 901) {
    const s = E.newGame(seed, 'core')
    E.startGame(s)
    return s
  }

  it('初始产能 = 老板自产 5，采购档 2，确定性订单 0', () => {
    const s = fresh()
    const d = E.derive(s)
    expect(d.capacity).toBe(5)
    expect(d.buyLots).toBe(2)
    expect(d.orderCount).toBe(0)
  })

  it('生产 2 人解锁后产能 5→10→17（每人 +1），工资按人计提', () => {
    const s = fresh()
    expect(E.hire(s, 'make').ok).toBe(true)
    expect(E.derive(s).capacity).toBe(10)
    expect(E.hire(s, 'make').ok).toBe(true)
    expect(E.derive(s).capacity).toBe(17)
    expect(E.derive(s).salaryTotal).toBe(10) // 2 人 × 0.5w
    expect(s.ap).toBe(1)
  })

  it('采购：招聘费阶梯扣现，档数 2→3→5→6，3 人解锁协议位，4 人原料降价 1 档', () => {
    const s = fresh()
    const cash0 = s.cash
    expect(E.hire(s, 'buy').ok).toBe(true)
    expect(s.cash).toBe(cash0 - 50) // 5w 招聘费
    expect(E.derive(s).buyLots).toBe(3)
    expect(E.agreementSlots(s)).toBe(0)
    s.ap = 5
    expect(E.hire(s, 'buy').ok).toBe(true)
    expect(E.hire(s, 'buy').ok).toBe(true)
    expect(E.derive(s).buyLots).toBe(5)
    expect(E.agreementSlots(s)).toBe(1)
    expect(E.hire(s, 'buy').ok).toBe(true)
    expect(E.derive(s).buyLots).toBe(6)
    expect(E.derive(s).materials.pkg.tierShift).toBeLessThan(0) // 4 人降价 1 档
    // 采购人员不再提供供应加成：供应增量为 0（增量供给走供应商开发等途径）
    const d0 = E.derive(fresh())
    const d4 = E.derive(s)
    expect(d4.materials.chip.supply - d0.materials.chip.supply).toBe(0)
    expect(d4.materials.pkg.supply - d0.materials.pkg.supply).toBe(0)
  })

  it('销售 2 人解锁第 1 个订单槽、4 人解锁第 2 个：达标当月立即补发', () => {
    const s = fresh()
    expect(E.hire(s, 'sell').ok).toBe(true)
    expect(s.orders.length).toBe(0) // 1 人未达订单阈值
    expect(E.hire(s, 'sell').ok).toBe(true)
    expect(s.orders.length).toBe(1) // 2 人解锁 1 单，当月立即补发
    expect(E.derive(s).orderCount).toBe(1)
    expect(E.derive(s).salesResource).toBe(18) // 基础 10 + 2 人 × 4
    s.ap = 5
    expect(E.hire(s, 'sell').ok).toBe(true)
    expect(E.hire(s, 'sell').ok).toBe(true)
    expect(E.derive(s).orderCount).toBe(2) // 4 人解锁第 2 个订单槽
    expect(s.orders.length).toBe(2) // 第 2 单当月立即补发
  })

  it('3 名生产解锁加班：产能计划含 +10', () => {
    const s = fresh(902)
    s.monthMods = {} // 排除本月事件修正，只验证加班解锁本身
    s.currentEvent = null
    s.ap = 5
    expect(E.hire(s, 'make').ok).toBe(true)
    expect(E.hire(s, 'make').ok).toBe(true)
    expect(E.hire(s, 'make').ok).toBe(true)
    expect(E.toggleOvertime(s).ok).toBe(true)
    expect(E.planCapacity(s)).toBe(5 + 3 * 6 + 10)
  })

  it('预演包含当月招聘的效果：招 2 名生产后产能上限提升', () => {
    const s = fresh(903)
    const before = E.previewOperations(s).capacityTotal
    E.hire(s, 'make')
    E.hire(s, 'make')
    const after = E.previewOperations(s).capacityTotal
    expect(after).toBeGreaterThan(before)
  })
})

describe('核心模式采购计划', () => {
  it('选择采购档位只预留现金与到货量，不立即扣款入库', () => {
    const s = E.newGame(91, 'core')
    E.startGame(s)
    const cash = s.cash
    const qty = E.plannedLotQty(s, 'pkg', 'mid')
    const cost = qty * E.lotPrice(s, 'pkg', 'mid')

    expect(E.buyMaterial(s, 'pkg', 'mid').ok).toBe(true)
    expect(s.cash).toBe(cash)
    expect(s.materials.pkg.qty).toBe(0)
    expect(s.materials.pkg.chosenLot).toBe('mid')
    expect(E.plannedPurchaseCost(s)).toBe(cost)
    expect(E.availableCashAfterPurchasePlan(s)).toBe(cash - cost)
  })

  it('生产可以使用计划到货；减少采购会保留生产计划，取消采购则清空生产计划', () => {
    const s = E.newGame(92, 'core')
    E.startGame(s)
    E.hire(s, 'make')
    E.hire(s, 'make')
    expect(E.buyMaterial(s, 'pkg', 'large').ok).toBe(true)
    expect(E.buyMaterial(s, 'resin', 'large').ok).toBe(true)

    const producible = E.maxProducible(s, 'low')
    expect(producible).toBeGreaterThan(0)
    E.setPlan(s, 'low', producible)

    // 减少采购：新采购量低于生产需求 → 允许，但生产计划被清空
    expect(E.setPurchasePlan(s, 'resin', 'small').ok).toBe(true)
    expect(E.plannedTotal(s)).toBe(0)
    expect(s.materials.resin.chosenLot).toBe('small')
    expect(s.materials.pkg.chosenLot).toBe('large')

    // 取消采购：生产计划已清空，直接允许
    expect(E.setPurchasePlan(s, 'pkg', null).ok).toBe(true)
    expect(s.materials.pkg.chosenLot).toBe(null)
  })

  it('清空生产计划会一并取消加班并同步已接订单', () => {
    const s = E.newGame(95, 'core')
    E.startGame(s)
    E.hire(s, 'make')
    E.hire(s, 'make')
    expect(E.buyMaterial(s, 'pkg', 'large').ok).toBe(true)
    expect(E.buyMaterial(s, 'resin', 'large').ok).toBe(true)
    E.setPlan(s, 'low', E.maxProducible(s, 'low'))
    s.plan.overtime = true

    const r = E.setPurchasePlan(s, 'resin', 'small')
    expect(r.ok).toBe(true)
    expect(E.plannedTotal(s)).toBe(0)
    expect(s.plan.overtime).toBe(false)
  })

  it('正式结算按采购计划先入库，再执行生产与销售', () => {
    const s = E.newGame(93, 'core')
    E.startGame(s)
    s.orders = []
    expect(E.buyMaterial(s, 'pkg', 'large').ok).toBe(true)
    expect(E.buyMaterial(s, 'resin', 'large').ok).toBe(true)
    E.setPlan(s, 'low', Math.min(5, E.maxProducible(s, 'low')))
    const purchaseCost = E.plannedPurchaseCost(s)
    const report = E.settleMonth(s)

    expect(report.production.produced).toBeGreaterThan(0)
    expect(s.monthLedger.filter((row) => row.dept === 'buy' && row.item.startsWith('采购'))).toHaveLength(2)
    expect(report.ledger.cashBegin).toBe(1000 - purchaseCost)
    // 计划已执行：档位与档数清空，后续“库存 + 计划到货”不会重叠加计划量
    expect(Object.values(s.materials).every((m) => m.chosenLot === null)).toBe(true)
    expect(s.lotsUsed).toBe(0)
  })

  it('核心模式生产不在确认时立即执行，结算时统一过账', () => {
    const s = E.newGame(96, 'core')
    E.startGame(s)
    expect(E.buyMaterial(s, 'pkg', 'large').ok).toBe(true)
    expect(E.buyMaterial(s, 'resin', 'large').ok).toBe(true)
    E.setPlan(s, 'low', 3)

    const before = s.materials.resin.qty
    const r = E.confirmProduction(s)
    expect(r.ok).toBe(false)
    expect(r.msg).toBe('核心模式生产在结算时统一执行')
    expect(s.materials.resin.qty).toBe(before) // 未扣料
    expect(s.products.low.qty).toBe(0) // 未入库
    expect(E.plannedTotal(s)).toBe(3) // 计划保留，结算时执行

    E.settleMonth(s)
    expect(s.products.low.qty).toBeGreaterThan(0)
  })

  it('预演读取采购计划，但不实际执行采购', () => {
    const s = E.newGame(94, 'core')
    E.startGame(s)
    E.buyMaterial(s, 'pkg', 'mid')
    const before = JSON.stringify(s)
    const preview = E.previewOperations(s)
    expect(preview.purchaseSpend).toBe(E.plannedPurchaseCost(s))
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('研发放置与 IP 技能树', () => {
  function rndState(seed = 210) {
    const s = E.newGame(seed, 'core')
    E.startGame(s)
    s.orders = []
    s.acceptedOrders = []
    return s
  }

  it('开局仅低端产线解锁，放置研发人员自动立项', () => {
    const s = rndState()
    expect(s.products.low.built).toBe(true)
    expect(s.products.mid.built).toBe(false)
    expect(s.products.high.built).toBe(false)
    expect(s.products.special.built).toBe(false)

    s.depts.rnd.staff = 1
    expect(E.setRndAssign(s, 'bom-mid', 1).ok).toBe(true)
    expect(s.rnd['bom-mid'].projectId).toBe('bom-mid')
    expect(s.rnd['bom-mid'].assigned).toBe(1)
    expect(s.rndStartsThisMonth).toContain('bom-mid')
    expect(s.flags['rndStartsQ']).toBe(1)
  })

  it('放置池受研发人数约束（上限 5 人）', () => {
    const s = rndState()
    s.depts.rnd.staff = 5
    expect(E.setRndAssign(s, 'bom-mid', 3).ok).toBe(true)
    expect(E.setRndAssign(s, 'bom-high', 3).ok).toBe(false)
    expect(E.setRndAssign(s, 'bom-high', 2).ok).toBe(true)
    expect(E.setRndAssign(s, 'ip-supply-1', 1).ok).toBe(false)
    expect(E.rndAssignedTotal(s)).toBe(5)
    expect(E.rndActiveThisMonth(s)).toBe(2)
  })

  it('进度与成功率由放置人数决定（5 人上限下的封顶值）', () => {
    const s = rndState()
    s.depts.rnd.staff = 5
    const d = E.derive(s)
    const mid = E.RND_PROJECTS.find((p) => p.id === 'bom-mid')!
    const high = E.RND_PROJECTS.find((p) => p.id === 'bom-high')!
    const special = E.RND_PROJECTS.find((p) => p.id === 'bom-special')!
    expect(E.rndProjectOutcome(d, mid, 1).rate).toBe(1)
    expect(E.rndProjectOutcome(d, mid, 1).gain).toBe(5)
    expect(E.rndProjectOutcome(d, high, 5).rate).toBeCloseTo(0.85)
    expect(E.rndProjectOutcome(d, special, 5).rate).toBeCloseTo(0.7)
  })

  it('1 人 3 个月解锁中端（教学路径），进度不足不判定', () => {
    const s = rndState(211)
    s.depts.rnd.staff = 1
    E.setRndAssign(s, 'bom-mid', 1)
    let rep = E.settleMonth(s)
    expect(rep.rnd[0].success).toBeNull()
    expect(s.rnd['bom-mid'].progress).toBe(5)
    E.nextMonth(s)
    E.setRndAssign(s, 'bom-mid', 1)
    rep = E.settleMonth(s)
    expect(rep.rnd[0].success).toBeNull()
    expect(s.rnd['bom-mid'].progress).toBe(10)
    E.nextMonth(s)
    E.setRndAssign(s, 'bom-mid', 1)
    rep = E.settleMonth(s)
    expect(rep.rnd[0].success).toBe(true)
    expect(s.products.mid.built).toBe(true)
  })

  it('3 人当月解锁中端：结算层解锁先于生产，当月可生产中端', () => {
    const s = rndState()
    s.materials.resin.qty = 10
    s.materials.resin.value = 200
    s.materials.alloy.qty = 5
    s.materials.alloy.value = 200
    s.depts.rnd.staff = 3
    E.setRndAssign(s, 'bom-mid', 3)
    s.plan.quantities.mid = 5
    const rep = E.settleMonth(s)
    expect(rep.rnd[0].success).toBe(true)
    expect(s.products.mid.built).toBe(true)
    // 解锁当月的生产段已执行中端排产；成品可能被当月现货售出一部
    const line = rep.production.lines.find((l) => l.tier === 'mid')!
    expect(line.planned).toBe(5)
    expect(line.produced).toBe(5)
    const midSpot = rep.sales.spots.filter((x) => x.tier === 'mid').reduce((a, x) => a + x.qty, 0)
    expect(s.products.mid.qty + midSpot).toBe(5)
  })

  it('失败保留进度，下月可继续推进（放置跨月保留）', () => {
    const s = rndState(212)
    s.depts.rnd.staff = 5
    E.setRndAssign(s, 'bom-high', 5)
    let rep = E.settleMonth(s)
    expect(rep.rnd[0].success).toBeNull()
    expect(s.rnd['bom-high'].progress).toBe(25)
    E.nextMonth(s)
    // 承诺制：放置不清零，下月自动继续推进
    expect(s.rnd['bom-high'].assigned).toBe(5)
    rep = E.settleMonth(s)
    if (rep.rnd[0].success) {
      // 判定成功：进度清零、高端解锁、人员释放
      expect(s.rnd['bom-high'].progress).toBe(0)
      expect(s.products.high.built).toBe(true)
      expect(s.rnd['bom-high'].assigned).toBe(0)
    } else {
      // 判定失败：进度保留，下月可继续
      expect(s.rnd['bom-high'].progress).toBe(50)
      expect(rep.rnd[0].rate).toBeGreaterThan(0)
    }
  })

  it('在研项目数驱动研发费用（3w × 在研数，承诺制）', () => {
    const s = rndState()
    s.depts.rnd.staff = 5
    expect(E.derive(s).rndCostTotal).toBe(0)
    E.setRndAssign(s, 'bom-mid', 1)
    expect(E.derive(s).rndCostTotal).toBe(30)
    E.setRndAssign(s, 'bom-high', 2)
    expect(E.rndActiveThisMonth(s)).toBe(2)
    expect(E.derive(s).rndCostTotal).toBe(60)
    // 0 人仅 API 可达：项目仍在研，费用照计
    E.setRndAssign(s, 'bom-mid', 0)
    expect(E.rndActiveThisMonth(s)).toBe(2)
    expect(E.derive(s).rndCostTotal).toBe(60)
  })

  it('完成即释放：中端完成后人员池恢复，可投其他项目', () => {
    const s = rndState(214)
    s.depts.rnd.staff = 3
    E.setRndAssign(s, 'bom-mid', 3)
    const rep = E.settleMonth(s)
    expect(rep.rnd[0].success).toBe(true)
    expect(s.rnd['bom-mid'].done).toBe(true)
    expect(s.rnd['bom-mid'].assigned).toBe(0)
    expect(E.rndAssignedTotal(s)).toBe(0)
    expect(E.setRndAssign(s, 'bom-high', 3).ok).toBe(true)
  })

  it('确认锁：confirmRndAssignments 批量写回并锁定本月，月初解锁可再调', () => {
    const s = rndState(216)
    s.depts.rnd.staff = 3
    const r = E.confirmRndAssignments(s, { 'bom-mid': 2, 'bom-high': 1 })
    expect(r.ok).toBe(true)
    expect(s.rnd['bom-mid'].assigned).toBe(2)
    expect(s.rnd['bom-high'].assigned).toBe(1)
    expect(s.rnd['bom-high'].projectId).toBe('bom-high')
    expect(s.flags['rndConfirmed']).toBe(1)
    E.nextMonth(s)
    expect(s.flags['rndConfirmed']).toBe(0)
    expect(s.rnd['bom-mid'].assigned).toBe(2)
    E.settleMonth(s)
    expect(s.rnd['bom-mid'].progress).toBe(10)
  })

  it('确认校验：跨项目池总量 / 前置锁定', () => {
    const s = rndState(217)
    s.depts.rnd.staff = 2
    expect(E.confirmRndAssignments(s, { 'bom-mid': 2, 'bom-high': 2 }).ok).toBe(false)
    expect(E.confirmRndAssignments(s, { 'ip-channel-2': 1 }).ok).toBe(false)
    expect(E.confirmRndAssignments(s, { 'bom-mid': 1 }).ok).toBe(true)
  })

  it('IP 技能树：前置未解锁不可放置，成功授予固定知产', () => {
    const s = rndState(213)
    s.depts.rnd.staff = 5
    expect(E.setRndAssign(s, 'ip-supply-2', 1).ok).toBe(false)
    s.rnd['ip-supply-1'].done = true
    expect(E.setRndAssign(s, 'ip-supply-2', 1).ok).toBe(true)
    // 核心模式：解锁即生效（无激活槽位），I3 供给 +2
    const before = E.derive(s).materials.resin.supply
    s.ipOwned.push('I3')
    expect(E.derive(s).materials.resin.supply).toBe(before + 2)
  })
})

describe('IP 技能树 3 + 3×2 + 3×2×2 分支与逐层揭示', () => {
  function ipState(seed = 218) {
    const s = E.newGame(seed, 'core')
    E.startGame(s)
    s.orders = []
    s.acceptedOrders = []
    s.depts.rnd.staff = 5
    return s
  }

  it('树形结构：21 个 IP 节点 = 3 阶段 1 + 6 阶段 2 + 12 阶段 3', () => {
    const ips = E.RND_PROJECTS.filter((p) => p.kind === 'ip')
    expect(ips.length).toBe(21)
    const byStage = (st: 1 | 2 | 3) => ips.filter((p) => p.stage === st)
    expect(byStage(1)).toHaveLength(3)
    expect(byStage(2)).toHaveLength(6)
    expect(byStage(3)).toHaveLength(12)
    // 阶段 1 无前置；阶段 2/3 前置同分支、高一阶段
    for (const p of byStage(1)) expect(p.preq).toBeUndefined()
    for (const p of [...byStage(2), ...byStage(3)]) {
      expect(p.preq).toBeTruthy()
      const preq = E.RND_PROJECTS.find((x) => x.id === p.preq)!
      expect(preq.branch).toBe(p.branch)
      expect(preq.stage).toBe(p.stage! - 1)
    }
  })

  it('前置链跨两层：阶段 3 需先完成对应的阶段 2 方向', () => {
    const s = ipState()
    expect(E.setRndAssign(s, 'ip-supply-3c', 1).ok).toBe(false) // 需先解锁「库存管理」
    s.rnd['ip-supply-1'].done = true
    expect(E.setRndAssign(s, 'ip-supply-3c', 1).ok).toBe(false) // 阶段 2 新方向未完成
    s.rnd['ip-supply-2b'].done = true
    expect(E.setRndAssign(s, 'ip-supply-3c', 1).ok).toBe(true)
  })

  it('大宗集采 J9：所有原料价格降 1 档', () => {
    const s = ipState()
    const before = E.derive(s).materials.resin.tierShift
    s.ipOwned.push('J9')
    expect(E.derive(s).materials.resin.tierShift).toBe(before - 1)
  })

  it('质量认证 I8 与品牌溢价 J10 售价档位叠加', () => {
    const s = ipState()
    const base = E.derive(s).price.low
    s.ipOwned.push('I8')
    const one = E.derive(s).price.low
    s.ipOwned.push('J10')
    const two = E.derive(s).price.low
    expect(one).toBeGreaterThan(base)
    expect(two).toBeGreaterThan(one)
  })
})

describe('场景预置研发', () => {
  it('各场景开局预置 1 名研发、仅低端解锁、知产树为空', () => {
    for (const def of E.CORE_SCENARIOS) {
      const s = E.newGame(def.seed, 'core')
      E.startGame(s)
      E.applyCoreScenario(s, def.id)
      expect(s.depts.rnd.staff, def.id).toBe(1)
      expect(s.products.low.built, def.id).toBe(true)
      expect(s.products.mid.built, def.id).toBe(false)
      expect(s.ipOwned, def.id).toEqual([])
      for (const slot of Object.values(s.rnd)) {
        expect(slot.projectId, def.id).toBeNull()
        expect(slot.progress, def.id).toBe(0)
        expect(slot.assigned, def.id).toBe(0)
      }
    }
  })
})

describe('贸易商', () => {
  it('购买后记录 extraBuys，配额用尽后行动被拒', () => {
    const s = preparedCoreState()
    const offers = E.traderOffer(s)
    expect(offers.length).toBeGreaterThan(0)
    const o = offers[0]
    expect(E.traderQuota(s)).toBe(1)
    expect(E.buyFromTrader(s, o.materialId, o.qty, o.price).ok).toBe(true)
    expect(s.extraBuys.filter((e) => e.kind === 'trader' && e.materialId === o.materialId)).toHaveLength(1)
    expect(E.buyFromTrader(s, o.materialId, o.qty, o.price).ok).toBe(false)
  })

  it('C4 贸易商牌提升配额，月初清零', () => {
    const s = preparedCoreState()
    s.playedThisMonth.push({ uid: 'c4#test', defId: 'C4', empowered: false })
    const o = E.traderOffer(s)[0]
    expect(E.traderQuota(s)).toBe(2)
    expect(E.buyFromTrader(s, o.materialId, o.qty, o.price).ok).toBe(true)
    expect(E.buyFromTrader(s, o.materialId, o.qty, o.price).ok).toBe(true)
    expect(E.buyFromTrader(s, o.materialId, o.qty, o.price).ok).toBe(false)
    E.nextMonth(s)
    expect(s.extraBuys).toEqual([])
    expect(E.traderQuota(s)).toBe(1)
  })
})

describe('统一成本口径（采购计划 → 单位成本 → 单件毛利 → 预计毛利）', () => {
  it('计划后原料单价：无计划等于账面单价，选档后按移动加权平均更新', () => {
    const s = preparedCoreState()
    const m = s.materials.pkg
    expect(E.plannedMaterialUnitCost(s, 'pkg')).toBe(m.value / m.qty)
    s.materials.pkg.chosenLot = 'mid'
    const line = E.plannedPurchaseLine(s, 'pkg')
    expect(line.qty).toBeGreaterThan(0)
    expect(E.plannedMaterialUnitCost(s, 'pkg')).toBe((m.value + line.cost) / (m.qty + line.qty))
  })

  it('生产单位成本 = 计划后库存材料成本 + 固定成本分摊', () => {
    const s = preparedCoreState()
    const uc = E.productionUnitCosts(s)
    expect(uc.tiers.low.total).toBe(uc.tiers.low.material + uc.tiers.low.fixed)
    expect(uc.fixedTotal).toBe(uc.fixedParts.labor + uc.fixedParts.depreciation + uc.fixedParts.overtime)
    if (uc.planned > 0) {
      expect(uc.tiers.low.fixed).toBe(uc.fixedTotal / uc.planned)
    }
  })

  it('预计毛利 = 市场单件毛利 ×（订单 + 现货区间）', () => {
    const s = preparedCoreState()
    const p = E.previewOperations(s)
    const lo = p.products.find((x) => x.tier === 'low')!
    expect(lo.unitGrossProfit).toBeCloseTo(E.derive(s).price.low - E.productionUnitCosts(s).tiers.low.total, 3)
    expect(lo.grossProfit.min).toBe(lo.unitGrossProfit * (lo.orderQty + lo.spotQty.min))
    expect(lo.grossProfit.max).toBe(lo.unitGrossProfit * (lo.orderQty + lo.spotQty.max))
    expect(lo.orderGrossProfit).toBe(lo.unitGrossProfit * lo.orderQty)
    // 仅低端有排产：汇总等于单品
    expect(p.grossProfit.min).toBe(lo.grossProfit.min)
    expect(p.grossProfit.max).toBe(lo.grossProfit.max)
  })
})

describe('事件阶段（核心模式：全类型 × 落地原则）', () => {
  it('池过滤：融资未落地剔 8 张（两模式），核心再剔卡牌参数 2 张', () => {
    const fullPool = new Set(E.buildEventPool(E.newGame(1), Rng.fromState(1)).map((e) => e.id))
    const corePool = new Set(E.buildEventPool(E.newGame(1, 'core'), Rng.fromState(1)).map((e) => e.id))
    for (const id of ['R4', 'P5', 'O4', 'S3', 'D4', 'X3', 'R6', 'S9']) {
      expect(fullPool.has(id), `${id} 依赖借款参数（debt≡0 落空）`).toBe(false)
      expect(corePool.has(id), id).toBe(false)
    }
    for (const id of ['R5', 'O5']) {
      expect(fullPool.has(id), `${id} 完整模式有卡牌，保留`).toBe(true)
      expect(corePool.has(id), `${id} 核心无抽卡阶段，剔除`).toBe(false)
    }
    for (const id of ['R1', 'R2', 'R9', 'R10', 'P1', 'P2', 'P9', 'P10', 'S6', 'S7', 'X7', 'X9']) {
      expect(corePool.has(id), `${id} 落在三环/人员/研发参数，保留`).toBe(true)
    }
  })

  it('P10 猎头：机会事件消费端——本月可额外招聘 1 人不耗 AP', () => {
    const s = E.newGame(1, 'core')
    E.startGame(s)
    s.phase = 'event'
    s.currentEvent = EVENT_BY_ID['P10']
    s.cash = 500
    E.acceptChance(s)
    expect(s.monthFlags.includes('extraHire')).toBe(true)
    s.ap = 0
    expect(E.hire(s, 'buy').ok).toBe(true) // extraHire 免 AP
    expect(s.monthFlags.includes('extraHire')).toBe(false) // 一次性名额
    s.cash = 500
    expect(E.canHire(s, 'sell').ok).toBe(false) // 名额已耗、AP 为 0
  })

  it('核心 12 月流程：每月恰好 1 张事件（全类型），确认后直接进经营，恒等式全程成立', () => {
    const run = (seed: number) => {
      const s = E.newGame(seed, 'core')
      E.startGame(s)
      const ids: string[] = []
      const r2 = (n: number) => Math.round(n * 100) / 100
      for (let m = 1; m <= 12; m++) {
        if (s.result !== 'playing') break
        if (s.phase === 'event' && !s.eventResolved) {
          const ev = s.currentEvent
          if (ev) {
            ids.push(ev.id)
            if (ev.type === 'choice' && ev.options) {
              let best = 0
              for (let i = 0; i < ev.options.length; i++) {
                const c = (ev.options[i].cost?.cash ?? 0) + (ev.options[i].cost?.ap ?? 0) * 50
                const b = (ev.options[best].cost?.cash ?? 0) + (ev.options[best].cost?.ap ?? 0) * 50
                if (c < b) best = i
              }
              if (!E.applyEventOption(s, best).ok) s.eventResolved = true
            } else if (ev.type === 'chance' && ev.chance) {
              const cashCost = ev.chance.cost.cash ?? 0
              const apCost = ev.chance.cost.ap ?? 0
              if (s.cash >= cashCost && s.ap >= apCost) E.acceptChance(s)
              else E.skipEvent(s)
            }
          }
          s.eventResolved = true
          E.enterDraw(s) // 核心：跳过抽卡直接进经营
          expect(s.phase, `m${m}`).toBe('operate')
        }
        E.enterOperate(s)
        E.settleMonth(s)
        const b = E.balanceSheet(s)
        expect(r2(b.totalAssets - b.debt - b.wagePayable - b.equity), `m${m} 恒等式`).toBe(0)
        if (s.result !== 'playing') break
        E.nextMonth(s)
      }
      return ids
    }
    const seq = run(777)
    expect(seq.length).toBeGreaterThanOrEqual(8)
    expect(run(777)).toEqual(seq) // 同 seed 事件序列可复现
  })

  it('场景基线：applyCoreScenario 保留所抽事件（即时修正重并），预设订单不被事件确认时重复生成', () => {
    const s = E.newGame(3303, 'core')
    E.startGame(s)
    E.applyCoreScenario(s, 'order_heavy')
    expect(s.phase).toBe('event')
    expect(s.currentEvent?.id).toBe('R1') // 保留本月事件（seed 固定，即场景的一部分）
    expect(s.monthMods.demand?.low).toBe(1) // 即时事件修正在基线重置后重新并入
    expect(s.monthMods.demand?.mid).toBe(1)
    const preset = s.orders.length
    expect(preset).toBeGreaterThan(0)
    s.eventResolved = true
    E.enterDraw(s)
    expect(s.orders.length).toBe(preset) // 订单已预设，不重复生成
    expect(s.phase).toBe('operate')
  })
})
