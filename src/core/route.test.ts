import { describe, it } from 'vitest'
import * as E from './engine'
import { BOMS } from '../data/game'

/**
 * 参考打法：先按产能备料（不依赖库存），稳定低端现金流，
 * 有余力再扩设备与人力。用于校准难度基线。
 */
function play(seed: number, cfg = { make: 3, sell: 3, buy: 2, rnd: 1, ops: 1, mid: true }) {
  const s = E.newGame(seed)
  E.startGame(s)
  for (let m = 1; m <= 12; m++) {
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    E.beginMonthEvent(s)
    const ev = s.currentEvent
    if (ev) {
      if (ev.type === 'choice' && ev.options) {
        let best = 0
        for (let i = 0; i < ev.options.length; i++) {
          const c = (ev.options[i].cost?.cash ?? 0) + (ev.options[i].cost?.ap ?? 0) * 50
          const b = (ev.options[best].cost?.cash ?? 0) + (ev.options[best].cost?.ap ?? 0) * 50
          if (c < b) best = i
        }
        E.applyEventOption(s, best)
      } else if (ev.type === 'chance' && ev.chance) {
        const c = (ev.chance.cost.cash ?? 0) + (ev.chance.cost.ap ?? 0) * 50
        if (s.cash > c + 400) E.acceptChance(s)
        else E.skipEvent(s)
      }
    }
    E.enterDraw(s)
    // 抽卡阶段：每月一次，事件之后、经营之前
    if (s.drawn.length) {
      for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
      E.confirmDraw(s)
    } else if (s.deck.length && s.hand.length < s.handMax) {
      E.drawCards(s); for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid); E.confirmDraw(s)
    }
    E.enterOperate(s)

    for (const [dept, want] of [['sell', cfg.sell], ['make', cfg.make], ['buy', cfg.buy], ['rnd', cfg.rnd], ['ops', cfg.ops]] as [E.Dept, number][]) {
      let g = 0
      while (s.depts[dept].staff < want && E.canHire(s, dept).ok && s.cash > 300 && g++ < 6) E.hire(s, dept)
    }
    if (cfg.mid && m >= 3 && s.equipment.length < 2 && s.cash > 400 && s.ap >= 1) E.buyEquipment(s, 'eq-precision')

    while (s.hand.length > s.handMax) E.discardCard(s, s.hand[s.hand.length - 1].uid)
    for (const c of [...s.hand]) if (E.canPlay(s, c).ok) E.playCard(s, c.uid)

    const tier: E.Tier = s.products.mid.built ? 'mid' : 'low'
    // 先按产能备料：这一步不读库存，避免「库存 0 → 可产 0 → 不买料」的自锁
    const d = E.derive(s)
    const cap = E.planCapacity(s)
    const want = Math.min(cap, 14)
    void d
    for (const [id, per] of Object.entries(BOMS[tier].recipe)) {
      const have = s.materials[id]?.qty ?? 0
      const need = Math.max(0, per * want - have)
      if (need <= 0 || s.materials[id].chosenLot) continue
      const order: E.LotSize[] = ['large', 'mid', 'small']
      let bought = false
      for (const lot of order) {
        const q = E.lotQty(s, id, lot), p = E.lotPrice(s, id, lot)
        if (q <= 0 || q * p > s.cash * 0.5) continue
        if (q >= need) { E.buyMaterial(s, id, lot); bought = true; break }
      }
      // 单档不够就选最大档，宁可多买
      if (!bought) {
        for (const lot of order) {
          const q = E.lotQty(s, id, lot), p = E.lotPrice(s, id, lot)
          if (q > 0 && q * p <= s.cash * 0.5) { E.buyMaterial(s, id, lot); break }
        }
      }
    }
    E.setPlan(s, { tier, qty: Math.min(E.maxProducible(s, tier), want) })
    E.setAlloc(s, tier, E.derive(s).salesResource)
    if (s.depts.rnd.staff >= 1 && !E.activeResearch(s)) E.startResearch(s, s.products.mid.built ? 'ip-normal' : 'bom-mid')
    if (s.cash < 250) { const d2 = E.derive(s); const a = Math.min(d2.creditAvailable, 250); if (a >= 10) E.borrow(s, a - (a % 10)) }
    E.settleMonth(s)
    if (s.result !== 'playing') break
    E.nextMonth(s)
    if (s.result !== 'playing') break
  }
  return s
}

describe('route', () => {
  it('编制规模对照', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i * 977 + 13)
    const cfgs = [
      { make: 2, sell: 2, buy: 1, rnd: 0, ops: 0, mid: false },
      { make: 3, sell: 2, buy: 1, rnd: 1, ops: 0, mid: false },
      { make: 3, sell: 3, buy: 2, rnd: 1, ops: 1, mid: true },
      { make: 4, sell: 4, buy: 2, rnd: 2, ops: 1, mid: true },
    ]
    for (const cfg of cfgs) {
      let won = 0, bank = 0, board = 0
      const scores: number[] = []
      for (const seed of seeds) {
        const s = play(seed, cfg)
        if (s.result === 'won') won++
        else if ((s.lossReason ?? '').includes('资金为负')) bank++
        else board++
        scores.push(E.computeScore(s).total)
      }
      scores.sort((a, b) => a - b)
      console.log(`make${cfg.make} sell${cfg.sell} buy${cfg.buy} rnd${cfg.rnd} ops${cfg.ops} mid=${cfg.mid ? 'Y' : 'N'} → 通关 ${won}/30 破产 ${bank} 目标 ${board} 中位分 ${scores[15]}`)
    }
  })
})
