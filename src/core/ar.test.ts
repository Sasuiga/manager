import { describe, expect, it } from 'vitest'
import * as E from './engine'

/**
 * 应收账款（订单赊销，30 天账期）：
 *  - 订单销售收入结算当月确认收入、挂应收账款（现金未收）；
 *  - 次月结算期初批量回款（现金 +、挂账冲销，损益中性）；
 *  - 应收保理（销售特殊行动 1 AP + 1w）：按 90% 提前收回现金，
 *    10% 折价损失进营业外、手续费进财务费用，应收清零。
 * 会计恒等式在每月结算后保持（资产 = 借款 + 应付职工薪酬 + 权益，与 audit.test 同口径）。
 */

/** 推进到本月经营阶段（董事会 → 事件 → 抽卡 → 经营），无头测试公用。 */
function toOperate(s: E.GameState) {
  if (s.challengeOffered.length) E.chooseChallenge(s, 0)
  if (s.phase === 'board') E.beginMonthEvent(s)
  const ev = s.currentEvent
  if (ev) {
    if (ev.type === 'choice' && ev.options) E.applyEventOption(s, 0)
    else if (ev.type === 'chance' && ev.chance) E.skipEvent(s)
  }
  E.enterDraw(s)
  if (s.drawn.length) {
    for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
    E.confirmDraw(s)
  }
  E.enterOperate(s)
}

const identity = (s: E.GameState) => {
  const b = E.balanceSheet(s)
  return Math.round((b.totalAssets - b.debt - b.wagePayable - b.equity) * 100) / 100
}

/** 注入一笔已接订单 + 排产 5 件（老板基线产能 5）+ 备料（库存注入同步扣现金，保持恒等式平衡），返回本月挂账应收额。 */
function postOrderAr(s: E.GameState): number {
  s.orders.push({ id: 't-ar', tier: 'low', qty: 5, priceShift: 1, dueMonth: s.month, from: '测试', forced: false })
  s.acceptedOrders.push('t-ar')
  s.plan.quantities.low = 5
  s.materials.pkg.qty = 10
  s.materials.pkg.value = 100 // 10 件 × 1w（基准价）
  s.materials.resin.qty = 5
  s.materials.resin.value = 100 // 5 件 × 2w（基准价）
  s.cash -= 200 // 库存注入的现金冲销
  /** 订单价 = 订单价偏移 +1 档 × 当月价格修正（事件可能移档，动态取真值） */
  const unit = E.priceAtProduct('low', 1 + E.derive(s).priceShift['low'])
  return 5 * unit
}

describe('应收账款（订单赊销）', () => {
  it('订单结算挂应收（现金未收），次月结算期初回款', () => {
    const s = E.newGame(7)
    E.startGame(s)
    toOperate(s)
    const ar = postOrderAr(s)

    const rep = E.settleMonth(s)
    expect(rep.sales.receivableCollected).toBe(0) // 无上月挂账
    expect(rep.sales.receivablePosted).toBe(ar) // 订单收入挂应收
    expect(s.receivable).toBe(ar)
    expect(rep.ledger.parts['订单收入']).toBe(ar)
    expect(identity(s)).toBe(0)

    // 次月：无新订单（销售 0 人）、无现货（库存清零），回款即上月挂账
    E.nextMonth(s)
    toOperate(s)
    const rep2 = E.settleMonth(s)
    expect(rep2.sales.receivableCollected).toBe(ar)
    expect(rep2.sales.receivablePosted).toBe(0)
    expect(s.receivable).toBe(0)
    expect(identity(s)).toBe(0)
  })

  it('回款现金差值 = 挂账额（对照同 seed 无挂账局）', () => {
    const run = (withAr: boolean) => {
      const s = E.newGame(7)
      E.startGame(s)
      toOperate(s)
      if (withAr) {
        s.receivable = 1234
        s.cash -= 1234 // 同步扣现金保持恒等式平衡（模拟上月已确认收入）
      }
      const rep = E.settleMonth(s)
      return { cash: s.cash, collected: rep.sales.receivableCollected }
    }
    expect(run(true).collected - run(false).collected).toBe(1234) // 挂账局结算期初多回款 1234
  })

  it('应收保理：90% 现金收回、应收清零，手续费进财务费用、折价损失进营业外', () => {
    const s = E.newGame(7)
    E.startGame(s)
    toOperate(s)
    const ar = postOrderAr(s)
    E.settleMonth(s)
    E.nextMonth(s) // 次月：应收已挂账（权益侧已确认收入）
    toOperate(s)
    const cashBefore = s.cash
    const r = E.factorReceivable(s)
    expect(r.ok).toBe(true)
    const proceeds = Math.round(ar * 0.9)
    const loss = ar - proceeds
    expect(s.cash).toBe(cashBefore + proceeds - 10)
    expect(s.receivable).toBe(0)
    // 无应收时保理失败
    const s0 = E.newGame(7)
    E.startGame(s0)
    toOperate(s0)
    expect(E.factorReceivable(s0).ok).toBe(false)
    // 结算确认损益归属：保理后应收已清零，本月无自动回款；恒等式不破
    const rep = E.settleMonth(s)
    expect(rep.sales.receivableCollected).toBe(0)
    expect(rep.ledger.parts['事件与杂项支出']).toBeGreaterThanOrEqual(10) // 保理手续费 10 在其中
    expect(rep.ledger.parts['营业外收入']).toBe(-loss) // 折价损失 10%（本月无其他营业外项）
    expect(identity(s)).toBe(0)
  })
})
