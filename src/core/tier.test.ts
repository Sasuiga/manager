import { describe, expect, it } from 'vitest'
import { newGame } from './game'
import * as E from './engine'
import { CARD_BY_ID, TIER_COST, TIER_STAFF, RND_PROJECTS, tierUnlockedOf } from '../data/game'
import type { Equipment, GameState } from './types'

/** 干净的经营局面（各部门 0 人，3 AP，500 现金）。 */
function inOperate(seed = 100): GameState {
  const s = newGame(seed, 'core')
  E.startGame(s)
  s.eventResolved = true
  E.enterDraw(s)
  E.enterOperate(s)
  s.hand = []
  s.ap = 3
  s.cash = 500
  return s
}

const push = (s: GameState, defId: string, uid?: string, empowered = false) => {
  s.hand.push({ uid: uid ?? `${defId}#t`, defId, empowered })
}

describe('提案档位制（0~3 档 / 人数解锁 / 纯随机出现）', () => {
  it('tierUnlockedOf：2 人→1 档，3 人→2 档，5 人→3 档', () => {
    expect(tierUnlockedOf(0)).toBe(0)
    expect(tierUnlockedOf(1)).toBe(0)
    expect(tierUnlockedOf(2)).toBe(1)
    expect(tierUnlockedOf(3)).toBe(2)
    expect(tierUnlockedOf(4)).toBe(2)
    expect(tierUnlockedOf(5)).toBe(3)
  })

  it('档位对价：0 档 1AP+0 / 1 档 1AP+1w / 2 档 2AP+2w / 3 档 2AP+4w', () => {
    expect(TIER_COST[0]).toEqual({ ap: 1, cash: 0 })
    expect(TIER_COST[1]).toEqual({ ap: 1, cash: 10 })
    expect(TIER_COST[2]).toEqual({ ap: 2, cash: 20 })
    expect(TIER_COST[3]).toEqual({ ap: 2, cash: 40 })
  })

  it('canPlay 档位门槛：2 档卡需对应部门 3 人', () => {
    const s = inOperate()
    push(s, 'C3')
    s.depts.buy.staff = 2
    expect(E.canPlay(s, s.hand[0]).ok).toBe(false)
    s.depts.buy.staff = 3
    expect(E.canPlay(s, s.hand[0]).ok).toBe(true)
  })

  it('playCard 扣档位 AP 与现金对价', () => {
    const s = inOperate()
    push(s, 'P12')
    s.depts.make.staff = 3
    const ap0 = s.ap
    const cash0 = s.cash
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(s.ap).toBe(ap0 - TIER_COST[2].ap) // 2 档 2 AP
    expect(s.cash).toBe(cash0 - TIER_COST[2].cash) // 2 档 2w
    expect(s.monthFlags.includes('overtimeHalf')).toBe(true)
  })

  it('抽牌：各部门 0 人时只出现 0 档卡', () => {
    const s = inOperate()
    for (let i = 0; i < 30; i++) {
      E.drawCards(s)
      for (const c of s.drawn) {
        const def = CARD_BY_ID[c.defId]
        expect(tierUnlockedOf(s.depts[def.kind].staff)).toBeGreaterThanOrEqual(def.tier)
      }
      for (const c of s.drawn) s.deck.push(c) // 放回牌库保持池不空
    }
    // 30 轮全部为 0 档
    for (const c of s.drawn) expect(CARD_BY_ID[c.defId].tier).toBe(0)
  })

  it('抽牌：采购 3 人后 2 档卡可出现、3 档仍不出现', () => {
    const s = inOperate()
    s.depts.buy.staff = 3
    const seen = new Set<number>()
    for (let i = 0; i < 300; i++) {
      E.drawCards(s)
      for (const c of s.drawn) seen.add(CARD_BY_ID[c.defId].tier)
      for (const c of s.drawn) s.deck.push(c)
    }
    expect(seen.has(2)).toBe(true) // 2 档（含采购 2 档卡）
    expect([...seen].every((t) => t <= 2)).toBe(true) // 3 档需 5 人，未解锁
  })

  it('档位卡解锁人数与 TIER_STAFF 一致', () => {
    for (const def of Object.values(CARD_BY_ID)) {
      expect([0, 1, 2, 3]).toContain(def.tier)
      if (def.tier > 0) {
        const need = TIER_STAFF[def.tier as 1 | 2 | 3]
        expect(need).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('员工联动卡（增效 / 改良 / 替换）', () => {
  it('增效：P11 每名工人产能 +1（随人数放大）', () => {
    const s = inOperate()
    s.depts.make.staff = 5
    const d0 = E.derive(s)
    push(s, 'P11')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.derive(s).capacity).toBe(d0.capacity + 5) // 5 人 × +1
  })

  it('增效：S11 每人销售资源 +2（随人数放大）', () => {
    const s = inOperate()
    s.depts.sell.staff = 4
    const d0 = E.derive(s)
    push(s, 'S11')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.derive(s).salesResource).toBe(d0.salesResource + 8) // 4 人 × +2
  })

  it('增效：C11 每人采购资源 +1', () => {
    const s = inOperate()
    s.depts.buy.staff = 4
    const d0 = E.derive(s)
    push(s, 'C11')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.derive(s).buyResource).toBe(d0.buyResource + 4) // 4 人 × +1
  })

  it('改良：C12 议价 4 点/档 → 3 点/档', () => {
    const s = inOperate()
    s.depts.buy.staff = 4
    push(s, 'C12')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.derive(s).buyNegotiateCost).toBe(3)
  })

  it('改良：S15 提价 8→4 点/档；强化版可提 2 档', () => {
    const s = inOperate()
    s.depts.sell.staff = 5
    push(s, 'S15')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const d = E.derive(s)
    expect(d.sellRaiseCost).toBe(4)
    expect(d.sellRaiseCap).toBe(1)
    s.ap = 5
    s.hand.push({ uid: 's15b#t', defId: 'S15', empowered: true })
    expect(E.playCard(s, 's15b#t').ok).toBe(true)
    expect(E.derive(s).sellRaiseCap).toBe(2)
  })

  it('改良：R12 研发费用 −1w/项目、成功率封顶 90%→95%', () => {
    const s = inOperate()
    s.depts.rnd.staff = 3
    push(s, 'R12')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const d = E.derive(s)
    expect(d.rndCost).toBe(20) // 基础 3w − 1w 改良 = 2w/项目
    // 放 20 人：成功率必然撞封顶，可直接比较封顶差异（基础 90% → 95%）
    // 取无 rateCap 覆盖的项目（bom-high，默认封顶 90%）
    const s0 = inOperate()
    s0.depts.rnd.staff = 3
    const proj = RND_PROJECTS[1] // bom-high：无 rateCap，封顶走默认 90%
    expect(E.rndProjectOutcome(E.derive(s0), proj, 20).rate).toBeCloseTo(0.9, 5)
    expect(E.rndProjectOutcome(d, proj, 20).rate).toBeCloseTo(0.95, 5)
  })

  it('改良：M5 招聘费 −50%', () => {
    const s = inOperate()
    s.depts.ops.staff = 3
    push(s, 'M5')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.hireCost(s, 'buy')).toBe(25) // 50 × 0.5
  })

  it('替换：C13 材料聚焦——点数不做供给加点、指定原料 +6 供给 −1 档', () => {
    const s = inOperate()
    s.depts.buy.staff = 3
    push(s, 'C13')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    s.focusMat = 'pkg'
    const d = E.derive(s)
    expect(d.matFocusActive).toBe(true)
    // 同种子无卡基线对比
    const s2 = inOperate()
    s2.depts.buy.staff = 3
    const base = E.derive(s2).materials.pkg
    expect(d.materials.pkg.supply).toBeGreaterThanOrEqual(base.supply + 6)
    expect(d.materials.pkg.tierShift).toBeLessThanOrEqual(base.tierShift - 1)
    // 点数改投：供给加点清零
    s.buySupplyAlloc['pkg'] = 3
    expect(E.derive(s).buySupplyPush.pkg).toBe(0)
  })

  it('替换：S13 全部确定性订单 +5 件、订单价 +1→+0', () => {
    const s = inOperate()
    s.depts.sell.staff = 3
    push(s, 'S13')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const d = E.derive(s)
    expect(d.orderQty).toBe(15) // 基准 10 + 5
    expect(d.orderPriceShift).toBe(0) // +1 基准 −1 卡
  })

  it('替换：R14 突破模式——研发进度 ×1.5', () => {
    const s = inOperate()
    s.depts.rnd.staff = 5
    const d0 = E.derive(s)
    const proj = RND_PROJECTS[0]
    const gain0 = E.rndProjectOutcome(d0, proj, 2).gain
    push(s, 'R14')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const d1 = E.derive(s)
    expect(E.rndProjectOutcome(d1, proj, 2).gain).toBe(Math.round(gain0 * 1.5))
  })

  it('替换：P15 设备模式——设备加成 ×2、基础产能 −1', () => {
    const s = inOperate()
    s.depts.make.staff = 5
    const eq: Equipment = {
      id: 'e1',
      model: 'eq-line',
      name: '标准产线',
      cap: 4,
      depreciation: 20,
      creditLine: 50,
      cost: 200,
      accumulated: 0,
      purchasedAt: 1,
    }
    s.equipment.push(eq)
    const d0 = E.derive(s)
    push(s, 'P15')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const d1 = E.derive(s)
    // 设备 4→8/人，基础 −1：每人净 +3，5 人 = +15
    expect(d1.capacity).toBe(d0.capacity + 15)
  })

  it('替换：M7 降本模式——AP 上限回落基础 3、提案费 −1w/张、招聘费 −50%', () => {
    const s = inOperate()
    s.depts.ops.staff = 5
    push(s, 'M7')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const d = E.derive(s)
    expect(d.apMax).toBe(3) // 原 3 + (5−1) = 7 → 回落基础 3
    expect(E.cardPlayCost(s, CARD_BY_ID['C1'])).toBe(0) // 1 档 1w − 1w
    expect(E.hireCost(s, 'buy')).toBe(25) // 50 × 0.5
  })

  it('增效：R10 成功率 +25%；C14 协议槽 +1', () => {
    const s = inOperate()
    s.depts.rnd.staff = 5
    push(s, 'R10')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.derive(s).rndRate).toBe(25) // 在研项目成功率 +25%（受封顶限制）
    s.depts.buy.staff = 5
    s.ap = 5
    push(s, 'C14')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    expect(E.agreementSlots(s)).toBe(3) // 2（buy 5 人）+ 1
  })

  it('替换：M6 即时授权——管理招聘 AP +1 即时生效', () => {
    const s = inOperate()
    s.depts.ops.staff = 3 // M6 为 2 档：管理 ≥ 3 人
    push(s, 'M6')
    expect(E.playCard(s, s.hand[0].uid).ok).toBe(true)
    const ap0 = s.ap
    expect(E.hire(s, 'ops').ok).toBe(true)
    expect(s.ap).toBe(ap0) // 招聘 −1 AP，即时授权 +1 AP，净 0
  })
})
