import { describe, it } from 'vitest'
import * as E from './engine'
import { BOMS } from '../data/game'

/**
 * 平衡性基线：用一个「稳健但保守」的策略跑多个种子，
 * 看存活率与得分分布，作为难度调参的参照。
 */
function play(seed: number) {
  const s = E.newGame(seed)
  E.startGame(s)
  const hist: { m: number; cash: number; np: number; net: number }[] = []
  for (let m = 1; m <= 12; m++) {
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    E.beginMonthEvent(s)
    const ev = s.currentEvent
    if (ev) {
      if (ev.type === 'choice' && ev.options) {
        // 选现金代价最低的选项
        let best = 0
        for (let i = 0; i < ev.options.length; i++) {
          const c = (ev.options[i].cost?.cash ?? 0) + (ev.options[i].cost?.ap ?? 0) * 50
          const b = (ev.options[best].cost?.cash ?? 0) + (ev.options[best].cost?.ap ?? 0) * 50
          if (c < b) best = i
        }
        E.applyEventOption(s, best)
      } else if (ev.type === 'chance' && ev.chance) {
        const c = (ev.chance.cost.cash ?? 0) + (ev.chance.cost.ap ?? 0) * 50
        if (s.cash > c + 300) E.acceptChance(s)
        else E.skipEvent(s)
      }
    }
    E.enterDraw(s)
    // 抽卡阶段：每月一次，事件之后、经营之前
    if (s.drawn.length) {
      for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
      E.confirmDraw(s)
    } else if (s.deck.length && s.hand.length < s.handMax) {
      E.drawCards(s)
      for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
      E.confirmDraw(s)
    }
    E.enterOperate(s)

    // 优先补生产（产能直接决定产量），再补采购与销售，研发 1 人
    for (const [dept, want] of [['make', 3], ['buy', 2], ['sell', 2], ['rnd', 1]] as [E.Dept, number][]) {
      while (s.depts[dept].staff < want && E.canHire(s, dept).ok && s.cash > 250) E.hire(s, dept)
    }

    while (s.hand.length > s.handMax) E.discardCard(s, s.hand[s.hand.length - 1].uid)
    for (const card of [...s.hand]) if (E.canPlay(s, card).ok) E.playCard(s, card.uid)

    // 按产能备料：目标产量 = 当前产能
    const d = E.derive(s)
    const want = Math.min(E.planCapacity(s), 12)
    for (const [id, per] of Object.entries(BOMS.low.recipe)) {
      const need = Math.max(0, (per - d.matSave) * want - (s.materials[id]?.qty ?? 0))
      if (need <= 0 || s.materials[id].chosenLot) continue
      // 从大到小试，保证一次买够当月的量
      for (const lot of ['large', 'mid', 'small'] as E.LotSize[]) {
        const q = E.lotQty(s, id, lot), p = E.lotPrice(s, id, lot)
        if (q <= 0 || q * p > s.cash * 0.7) continue
        if (q >= need) { E.buyMaterial(s, id, lot); break }
      }
    }

    E.setPlan(s, { tier: 'low', qty: Math.min(E.maxProducible(s, 'low'), want) })
    E.setAlloc(s, 'low', E.derive(s).salesResource)
    if (s.depts.rnd.staff >= 1 && !E.activeResearch(s)) E.startResearch(s, 'bom-mid')

    // 周转紧张时借一点
    if (s.cash < 200) {
      const d2 = E.derive(s)
      const amt = Math.min(d2.creditAvailable, 200)
      if (amt >= 10) E.borrow(s, amt - (amt % 10))
    }

    const rep = E.settleMonth(s)
    hist.push({ m, cash: s.cash, np: rep.ledger.netProfit, net: E.netAssets(s) })
    if (s.result !== 'playing') break
    E.nextMonth(s)
    if (s.result !== 'playing') break
  }
  return { s, hist }
}

describe('balance', () => {
  it('稳健策略的存活率与得分分布', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i * 977 + 13)
    let won = 0
    const reasons: Record<string, number> = {}
    const scores: number[] = [], nets: number[] = []
    for (const seed of seeds) {
      const { s } = play(seed)
      if (s.result === 'won') won++
      else {
        const r = (s.lossReason ?? 'unknown').replace(/第 \d+ 月.*?（/, '').replace(/）/, '')
        reasons[r] = (reasons[r] ?? 0) + 1
      }
      scores.push(E.computeScore(s).total)
      nets.push(E.netAssets(s))
    }
    console.log('出局原因:', JSON.stringify(reasons))
    const lost = seeds.length - won
    scores.sort((a, b) => a - b); nets.sort((a, b) => a - b)
    const med = (a: number[]) => a[Math.floor(a.length / 2)]
    console.log(`生存至终局 ${won}/${seeds.length}，中途出局 ${lost}`)
    console.log(`得分 中位 ${med(scores)}  最低 ${scores[0]}  最高 ${scores[scores.length - 1]}`)
    console.log(`净资产 中位 ${(med(nets) / 10).toFixed(1)}w  最低 ${(nets[0] / 10).toFixed(1)}w  最高 ${(nets[nets.length - 1] / 10).toFixed(1)}w`)
  })
})
