import { describe, expect, it } from 'vitest'
import { newGame } from './game'
import * as E from './engine'
import type { GameState } from './types'

/** 进入经营阶段的干净局面（跳过抽卡） */
function inOperate(seed: number, mode: GameState['mode'] = 'core'): GameState {
  const s = newGame(seed, mode)
  E.startGame(s)
  s.eventResolved = true
  E.startGame(s)
  E.enterOperate(s)
  s.hand = []
  s.ap = 3
  return s
}

describe('行动层：AP 统一（打牌并入 AP 预算）', () => {
  it('打牌扣 1 AP（不再消耗独立提案次数）', () => {
    const s = inOperate(11)
    s.hand.push({ uid: 'p1#1', defId: 'P1', empowered: false })
    expect(s.ap).toBe(3)
    const r = E.playCard(s, 'p1#1')
    expect(r.ok).toBe(true)
    expect(s.ap).toBe(2)
  })

  it('AP 为 0 时不可打牌', () => {
    const s = inOperate(11)
    s.ap = 0
    s.hand.push({ uid: 'p1#1', defId: 'P1', empowered: false })
    expect(E.canPlay(s, s.hand[0]).ok).toBe(false)
  })

  it('卡牌现金成本：C3 压价需 2w（现金不足不可打）', () => {
    const s = inOperate(12)
    s.hand.push({ uid: 'c3#1', defId: 'C3', empowered: false })
    s.cash = 19
    expect(E.canPlay(s, s.hand[0]).ok).toBe(false)
    s.cash = 20
    expect(E.playCard(s, 'c3#1').ok).toBe(true)
    expect(s.cash).toBe(0)
  })

  it('卡牌部门门槛：C5 长期协议需采购 ≥3 人', () => {
    const s = inOperate(13)
    s.hand.push({ uid: 'c5#1', defId: 'C5', empowered: false })
    s.depts.buy.staff = 2
    expect(E.canPlay(s, s.hand[0]).ok).toBe(false)
    s.depts.buy.staff = 3
    s.cash = 20
    expect(E.playCard(s, 'c5#1').ok).toBe(true)
    expect(s.agreements.length).toBeGreaterThan(0)
  })

  it('AP 预算咬合：3 AP = 2 张卡 + 1 名招聘，花完即止', () => {
    const s = inOperate(14)
    expect(s.ap).toBe(3)
    s.hand.push({ uid: 'p1#1', defId: 'P1', empowered: false }, { uid: 'p2#1', defId: 'P2', empowered: false })
    expect(E.playCard(s, 'p1#1').ok).toBe(true)
    expect(E.playCard(s, 'p2#1').ok).toBe(true)
    const hire = E.hire(s, 'buy')
    expect(hire.ok).toBe(true)
    expect(s.ap).toBe(0)
    s.hand.push({ uid: 'p4#1', defId: 'P4', empowered: false })
    expect(E.playCard(s, 'p4#1').ok).toBe(false)
  })
})

describe('标准行动（兜底菜单：输出形状互不重叠）', () => {
  it('库存清理：1 AP，选定层卖至多 5 件（账面均价、不进损益）', () => {
    const s = inOperate(21)
    s.products.low.qty = 8
    s.products.low.value = 80 // 均价 10/件
    const ap = s.ap
    const cash = s.cash
    expect(E.liquidateStock(s, 'low').ok).toBe(true)
    expect(s.products.low.qty).toBe(3)
    expect(s.products.low.value).toBe(30)
    expect(s.cash - cash).toBe(50) // 5 件 × 10
    expect(s.ap).toBe(ap - 1)
    // 无库存层拒绝
    s.products.mid.qty = 0
    expect(E.liquidateStock(s, 'mid').ok).toBe(false)
  })

  it('渠道拜访：1 AP，自然订单 +1（8–12 件、+1 档、可接可拒）', () => {
    const s = inOperate(22)
    const ap = s.ap
    const n0 = s.orders.length
    expect(E.channelVisit(s).ok).toBe(true)
    expect(s.orders.length).toBe(n0 + 1)
    const o = s.orders[s.orders.length - 1]
    expect(o.forced).toBe(false)
    expect(o.priceShift).toBe(1)
    expect(o.qty).toBeGreaterThanOrEqual(8)
    expect(o.qty).toBeLessThanOrEqual(12)
    expect(s.ap).toBe(ap - 1)
  })

  it('市场考察：1 AP，开启气候情报展示位（本月一次）', () => {
    const s = inOperate(23)
    expect(E.derive(s).climateOddsVisible).toBe(false)
    expect(E.marketScout(s).ok).toBe(true)
    expect(E.derive(s).climateOddsVisible).toBe(true)
    expect(E.marketScout(s).ok).toBe(false) // 本月已考察
  })

  it('人才市场：1 AP + 2w，免阶梯招聘费入 1 人（生产免费不适用）', () => {
    const s = inOperate(24)
    const ap = s.ap
    const cash = s.cash
    const staff0 = s.depts.ops.staff
    expect(E.talentFair(s, 'ops').ok).toBe(true)
    expect(s.depts.ops.staff).toBe(staff0 + 1)
    expect(s.ap).toBe(ap - 1)
    expect(cash - s.cash).toBe(20)
    expect(E.talentFair(s, 'make').ok).toBe(false) // 生产免费
  })

  it('AP 不足时标准行动被拒（不扣现金/不产生效果）', () => {
    const s = inOperate(25)
    s.ap = 0
    s.products.low.qty = 5
    s.products.low.value = 50
    const cash = s.cash
    expect(E.liquidateStock(s, 'low').ok).toBe(false)
    expect(E.channelVisit(s).ok).toBe(false)
    expect(E.marketScout(s).ok).toBe(false)
    expect(E.talentFair(s, 'ops').ok).toBe(false)
    expect(s.cash).toBe(cash)
  })
})
