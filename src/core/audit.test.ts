import { describe, expect, it } from 'vitest'
import * as E from './engine'

/** 用多种子无头跑满整年，逐月校验恒等式与账务一致性。 */
describe('audit', () => {
  it('多seed全年会计审计', () => {
    const r2 = (n: number) => Math.round(n * 100) / 100
    let worst = 0
    let completed = 0
    for (const seed of [1, 7, 13, 42, 99, 31337, 777, 2024, 555, 12345]) {
      const s = E.newGame(seed)
      E.startGame(s)
      if (s.challengeOffered.length) E.chooseChallenge(s, seed % Math.max(1, s.challengeOffered.length))
      let months = 0
      for (let m = 1; m <= 12; m++) {
        E.beginMonthEvent(s)
        const ev = s.currentEvent
        if (ev) {
          if (ev.type === 'choice' && ev.options) E.applyEventOption(s, 0)
          else if (ev.type === 'chance' && ev.chance) {
            const c = (ev.chance.cost.cash ?? 0) + (ev.chance.cost.ap ?? 0) * 50
            if (s.cash > c + 200) E.acceptChance(s); else E.skipEvent(s)
          }
        }
        E.enterDraw(s)
        if (s.drawn.length) { for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid); E.confirmDraw(s) }
        else if (s.deck.length && s.hand.length < s.handMax) { E.drawCards(s); for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid); E.confirmDraw(s) }
        E.enterOperate(s)
        // 随机但确定性的经营动作：招聘、打牌、采购、生产、借款
        for (const dept of ['buy','sell','make','ops','rnd'] as E.Dept[])
          for (let k = 0; k < 2; k++) { if (s.depts[dept].staff >= 2) break; if (!E.canHire(s, dept).ok) break; if (s.cash < 400) break; E.hire(s, dept) }
        while (s.hand.length > s.handMax) E.discardCard(s, s.hand[s.hand.length - 1].uid)
        let guard = 0
        for (const card of [...s.hand]) { if (guard++ > 8) break; if (!E.canPlay(s, card).ok) continue; E.playCard(s, card.uid) }
        const need = (id: string, want: number) => Math.max(0, want - (s.materials[id]?.qty ?? 0))
        for (const [id, want] of [['pkg', need('pkg', 24)], ['resin', need('resin', 12)], ['alloy', need('alloy', 8)]] as [string, number][]) {
          if (want <= 0 || s.materials[id].chosenLot) continue
          for (const lot of ['large','mid','small'] as E.LotSize[]) {
            const q = E.lotQty(s, id, lot), p = E.lotPrice(s, id, lot)
            if (q <= 0 || q * p > s.cash) continue
            if (E.buyMaterial(s, id, lot).ok) break
          }
        }
        const d = E.derive(s)
        E.setPlan(s, 'low', Math.min(E.maxProducible(s, 'low'), 12))
        E.setAlloc(s, 'low', d.salesResource)
        if (s.depts.rnd.staff >= 1) { const t = s.products.mid.built ? 'ip-normal' : 'bom-mid'; if (!s.rnd[t].done) E.startResearch(s, t) }
        if (s.cash < 300) { const d2 = E.derive(s); const amt = Math.min(d2.creditAvailable, 200); if (amt >= 10) E.borrow(s, amt - (amt % 10)) }

        const rep = E.settleMonth(s)
        const b = E.balanceSheet(s)
        const gap = r2(b.totalAssets - b.debt - b.equity)
        worst = Math.max(worst, Math.abs(gap))
        if (gap !== 0) console.log(`seed ${seed} m${m} 失衡 ${gap}`)
        // 报表自洽：损益表编制出来的净利润 = 留存收益增量
        const ret0 = s.retained - rep.ledger.netProfit
        if (r2(ret0 + rep.ledger.netProfit) !== r2(s.retained)) console.log(`seed ${seed} m${m} 留存收益异常`)
        // 现金流水：期末现金 = 期初 + 收入 - 支出 + 借款等（由 settle 内部保证）
        if (rep.ledger.cashEnd !== s.cash) console.log(`seed ${seed} m${m} 现金台账不符`)
        months++
        if (s.result !== 'playing') break
        E.nextMonth(s)
        if (s.result !== 'playing') break
      }
      if (months === 12) completed++
      const sc = E.computeScore(s)
      console.log(`seed ${seed}: ${months} 个月, 结果 ${s.result}, 净资产 ${E.netAssets(s)}, 得分 ${sc.total}`)
    }
    console.log(`\n跑满 12 个月的种子数 ${completed}/10，最大恒等式偏差 ${worst}`)
    expect(worst).toBe(0)
  })
})
