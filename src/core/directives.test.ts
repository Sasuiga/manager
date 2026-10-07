import { describe, expect, it } from 'vitest'
import { newGame } from './game'
import * as E from './engine'
import { Rng } from './rng'
import { CARD_BY_ID, IP_SETS, MILESTONES } from '../data/game'
import type { GameState } from './types'

function core(seed: number): GameState {
  const s = newGame(seed, 'core')
  E.startGame(s)
  s.eventResolved = true
  E.startGame(s)
  E.enterOperate(s)
  return s
}

describe('决议卡（D 系列：入槽、长期生效、终局计分）', () => {
  it('D8 安全库存：成品库存上限 20/层（强化 30），生产截断', () => {
    const s = core(1)
    s.depts.make.staff = 2 // 产能 13 > 仓容余量，让 D8 成为约束
    s.products.low.qty = 19
    s.materials.pkg.qty = 100
    s.materials.pkg.value = 1000
    s.materials.resin.qty = 100
    s.materials.resin.value = 2000
    E.setPlan(s, 'low', 10)
    expect(E.maxProducible(s, 'low')).toBe(13) // 产能约束
    s.directives.push({ defId: 'D8', empowered: false })
    expect(E.maxProducible(s, 'low')).toBe(1) // 20 - 19
    s.directives = []
    s.directives.push({ defId: 'D8', empowered: true })
    expect(E.maxProducible(s, 'low')).toBe(11) // 30 - 19
  })

  it('D2 供应稳定：过热季树脂供给负修正 −3 → 减半为 −2', () => {
    const s = core(2)
    s.climate = 'overheat'
    const d0 = E.derive(s)
    s.directives.push({ defId: 'D2', empowered: false })
    const d1 = E.derive(s)
    expect(d1.materials.resin.supply - d0.materials.resin.supply).toBe(2) // 负修正 −3 向零减半 → −1（ceil(−3/2)）
  })

  it('D3 弹性用工：招聘费 −1w/人（强化 −2w）', () => {
    const s = core(3)
    s.depts.ops.hired = 1
    const base = E.hireCost(s, 'ops')
    s.directives.push({ defId: 'D3', empowered: false })
    expect(E.hireCost(s, 'ops')).toBe(Math.max(0, base - 10))
    s.directives = [{ defId: 'D3', empowered: true }]
    expect(E.hireCost(s, 'ops')).toBe(Math.max(0, base - 20))
  })

  it('D4 订单稳价：订单单价 +1 档', () => {
    const s = core(4)
    s.directives.push({ defId: 'D4', empowered: false })
    const d = E.derive(s)
    expect(d.orderPriceBonus).toBe(1)
    expect(E.priceAtProduct('low', 1 + d.priceShift.low + d.orderPriceBonus)).toBeGreaterThan(
      E.priceAtProduct('low', 1 + d.priceShift.low),
    )
  })

  it('D5 现货溢价：现货档位 +1（订单档位不受影响）', () => {
    const s = core(5)
    s.directives.push({ defId: 'D5', empowered: false })
    const d = E.derive(s)
    for (const t of E.TIERS) {
      expect(d.spotShift[t] - d.priceShift[t]).toBe(1)
    }
  })

  it('D6 低息：借款月利率 −0.1%', () => {
    const s = core(6)
    const d0 = E.derive(s)
    s.directives.push({ defId: 'D6', empowered: false })
    const d1 = E.derive(s)
    expect(d1.rate).toBeCloseTo(d0.rate - 0.001, 6)
  })

  it('D1 研发双判定：同随机流下成功率单调不降（2 次 / 3 次掷点取高）', () => {
    // 结算研发随机流 = Rng.fromState(rngState + month × 7919)；
    // 找「单次掷点失败（≥0.6）、二次掷点成功（<0.6）」的 rngState（bom-high 基础 60%）
    let goodRng = -1
    for (let base = 1; base < 500 && goodRng < 0; base++) {
      const stream = Rng.fromState(base + 2 * 7919)
      const r1 = stream.next()
      const r2 = stream.next()
      if (r1 >= 0.6 && r2 < 0.6) goodRng = base
    }
    expect(goodRng).toBeGreaterThan(0)
    const mk = () => {
      const s = core(7)
      s.rngState = goodRng
      s.month = 2
      s.rnd['bom-high'] = { projectId: 'bom-high', progress: 50, done: false, assigned: 0 }
      return s
    }
    const base = mk()
    E.settleMonth(base)
    expect(base.rnd['bom-high'].done).toBe(false) // 单次掷点失败
    const twice = mk()
    twice.monthFlags.push('rndDoubleRoll') // K4 本月双判定
    E.settleMonth(twice)
    expect(twice.rnd['bom-high'].done).toBe(true) // 二次掷点成功
    const d1 = mk()
    d1.directives.push({ defId: 'D1', empowered: false })
    E.settleMonth(d1)
    expect(d1.rnd['bom-high'].done).toBe(true) // D1 长期双判定
  })

  it('决议槽：2 槽（运营 ≥4 人 3 槽）；槽满需替换且每月限 1 次', () => {
    const s = core(8)
    expect(E.directiveSlots(s)).toBe(2)
    s.depts.ops.staff = 4
    expect(E.directiveSlots(s)).toBe(3)
    s.depts.ops.staff = 0
    s.hand.push({ uid: 'd2#1', defId: 'D2', empowered: false }, { uid: 'd3#1', defId: 'D3', empowered: false }, { uid: 'd5#1', defId: 'D5', empowered: false })
    s.cash = 500
    expect(E.playCard(s, 'd2#1').ok).toBe(true)
    expect(E.playCard(s, 'd3#1').ok).toBe(true)
    expect(E.playCard(s, 'd5#1').ok).toBe(false) // 槽满
    expect(E.playCard(s, 'd5#1', { replaceIdx: 0 }).ok).toBe(true)
    expect(s.directives.map((x) => x.defId)).toEqual(['D3', 'D5'])
    expect(E.playCard(s, 'd2#1', { replaceIdx: 1 }).ok).toBe(false) // 本月已换 1 次
  })

  it('终局计分：决议每张 +3、同部门 2 张 +5；知产套装每套 +15', () => {
    const s = core(9)
    s.directives.push({ defId: 'D2', empowered: false }, { defId: 'D3', empowered: false }) // 采购 + 运营
    expect(E.computeScore(s).directive).toBe(6) // 3×2，不同部门无组合
    s.directives.push({ defId: 'D4', empowered: false }) // 销售
    expect(E.computeScore(s).directive).toBe(9)
    s.directives.push({ defId: 'D5', empowered: false }) // 销售第 2 张
    expect(E.computeScore(s).directive).toBe(3 * 4 + 5) // 销售 2 张 +5
    s.ipOwned.push('J2', 'J9', 'I3')
    expect(E.computeScore(s).ipSet).toBe(IP_SETS[0].points) // 供应链闭环 15
  })
})

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
    const unit = E.priceAtProduct('low', 1 + d.priceShift.low + d.orderPriceBonus)
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

  it('K8 加班补贴：加班费减半', () => {
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

  it('牌库含规则卡与决议卡（40 张业务牌，非核心池随机入池）', () => {
    const s = newGame(20, 'core')
    E.buildDeck(s, new Rng(20))
    expect(s.deck.length).toBe(40)
    for (const id of ['K1', 'K5', 'D1', 'D8']) expect(CARD_BY_ID[id]).toBeTruthy()
  })

  it('形状目标与知产套装数据完整性', () => {
    expect(MILESTONES.length).toBe(8)
    expect(IP_SETS.length).toBe(4)
    for (const set of IP_SETS) {
      for (const ipId of set.ips) expect(typeof ipId).toBe('string')
    }
  })
})
