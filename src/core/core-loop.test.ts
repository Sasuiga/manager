import { describe, expect, it } from 'vitest'
import * as E from './engine'

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
