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

describe('标准行动（兜底菜单：常驻可用、AP + 现金）', () => {
  it('抽卡：1 AP + 1w 抽 1 张入手，超手牌上限拒绝', () => {
    const s = inOperate(21)
    const handLen = s.hand.length
    const ap = s.ap
    const cash = s.cash
    expect(E.standardDraw(s).ok).toBe(true)
    expect(s.hand.length).toBe(handLen + 1)
    expect(s.ap).toBe(ap - 1)
    expect(s.cash).toBe(cash - 10)
    s.hand.length = s.handMax
    expect(E.standardDraw(s).ok).toBe(false)
  })

  it('市场推广：2 AP，选定层需求 +2（其他层不变）', () => {
    const s = inOperate(22)
    const d0 = E.derive(s)
    expect(E.standardPromote(s, 'high').ok).toBe(true)
    expect(s.ap).toBe(1)
    const d1 = E.derive(s)
    expect(d1.demand.high - d0.demand.high).toBe(2)
    expect(d1.demand.low - d0.demand.low).toBe(0)
  })

  it('降本咨询：1 AP + 1w，本月全员工资 −20%（含加班费口径）', () => {
    const s = inOperate(23)
    s.depts.ops.staff = 2
    s.depts.make.staff = 3
    const d0 = E.derive(s)
    expect(E.standardConsult(s).ok).toBe(true)
    const d1 = E.derive(s)
    // 运营 1w/人 → 8/人；生产 0.8w/人 → 6.4/人（取整）
    expect(d1.salaryPer.ops).toBe(Math.round(d0.salaryPer.ops * 0.8))
    expect(d1.salaryPer.make).toBe(Math.round(d0.salaryPer.make * 0.8))
    expect(d1.salaryTotal < d0.salaryTotal).toBe(true)
  })

  it('AP 不足时标准行动被拒（不扣现金）', () => {
    const s = inOperate(24)
    s.ap = 0
    const cash = s.cash
    expect(E.standardDraw(s).ok).toBe(false)
    expect(s.cash).toBe(cash)
    expect(E.standardPromote(s, 'low').ok).toBe(false)
  })
})
