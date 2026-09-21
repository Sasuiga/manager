import { describe, expect, it } from 'vitest'
import * as E from './engine'
import { BOMS, CLIMATE_ORDER, MATERIALS, TIERS } from '../data/game'
import { Rng } from './rng'

/**
 * 无头跑通一整局：验证引擎不会崩溃、资源守恒合理、12 个月能走到终局。
 */

function playYear(seed: number, policy: 'conservative' | 'aggressive' = 'conservative'): E.GameState {
  const s = E.newGame(seed)
  E.startGame(s)
  if (s.challengeOffered.length) E.chooseChallenge(s, 0)

  for (let m = 1; m <= 12; m++) {
    E.beginMonthEvent(s)
    // 事件处理
    const ev = s.currentEvent
    if (ev) {
      if (ev.type === 'choice' && ev.options) {
        // 选最便宜的可选项
        let best = 0
        for (let i = 0; i < ev.options.length; i++) {
          const c = (ev.options[i].cost?.cash ?? 0) + (ev.options[i].cost?.ap ?? 0) * 50
          const b = (ev.options[best].cost?.cash ?? 0) + (ev.options[best].cost?.ap ?? 0) * 50
          if (c < b) best = i
        }
        E.applyEventOption(s, best)
      } else if (ev.type === 'chance' && ev.chance) {
        const cost = (ev.chance.cost.cash ?? 0) + (ev.chance.cost.ap ?? 0) * 50
        if (policy === 'aggressive' && s.cash > cost + 200) E.acceptChance(s)
        else E.skipEvent(s)
      }
    }

    E.enterDraw(s)
    // ── 抽卡阶段：每月一次，事件之后、经营之前 ──
    if (s.drawn.length) {
      for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
      E.confirmDraw(s)
    } else if (s.deck.length && s.hand.length < s.handMax) {
      E.drawCards(s)
      for (const c of s.drawn.slice(0, s.drawM)) E.toggleDrawn(s, c.uid)
      E.confirmDraw(s)
    }
    E.enterOperate(s)

    // ── 招聘：优先采购与销售，前几个月各补到 2 人 ──
    const order: E.Dept[] = ['buy', 'sell', 'make', 'ops', 'rnd']
    for (const dept of order) {
      for (let k = 0; k < 2; k++) {
        if (s.depts[dept].staff >= 2) break
        if (!E.canHire(s, dept).ok) break
        if (s.cash < 400) break
        E.hire(s, dept)
      }
    }
    if (s.depts.rnd.staff < 1 && s.cash > 300 && E.canHire(s, 'rnd').ok) E.hire(s, 'rnd')

    // 弃到上限
    while (s.hand.length > s.handMax) E.discardCard(s, s.hand[s.hand.length - 1].uid)

    // ── 打牌：能打就打（保留 AP 卡） ──
    let guard = 0
    for (const card of [...s.hand]) {
      if (guard++ > 8) break
      if (!E.canPlay(s, card).ok) continue
      E.playCard(s, card.uid)
    }

    // ── 采购：凑够本月要生产的量 ──
    const need = (id: string, want: number) => Math.max(0, want - (s.materials[id]?.qty ?? 0))
    const planQty = 12
    for (const [id, want] of [
      ['pkg', need('pkg', planQty * 2)],
      ['resin', need('resin', planQty)],
    ] as [string, number][]) {
      if (want <= 0) continue
      if (s.materials[id].chosenLot) continue
      for (const lot of ['large', 'mid', 'small'] as E.LotSize[]) {
        const qty = E.lotQty(s, id, lot)
        const price = E.lotPrice(s, id, lot)
        if (qty <= 0 || qty * price > s.cash) continue
        if (E.buyMaterial(s, id, lot).ok) break
      }
    }

    // ── 生产 ──
    const maxQ = E.maxProducible(s, 'low')
    E.setPlan(s, { tier: 'low', qty: Math.min(maxQ, planQty) })

    // ── 销售资源分配 ──
    const d = E.derive(s)
    if (s.products.low.qty > 0) E.setAlloc(s, 'low', d.salesResource)

    // ── 研发 ──
    if (s.depts.rnd.staff >= 1) {
      const target = s.products.mid.built ? 'ip-normal' : 'bom-mid'
      if (!s.rnd[target].done) E.startResearch(s, target)
    }

    // ── 借款：现金不够时借一点 ──
    if (s.cash < 200) {
      const d2 = E.derive(s)
      const amt = Math.min(d2.creditAvailable, 200)
      if (amt > 0) E.borrow(s, amt - (amt % 10))
    }

    // 每月只能结算一次
    const report = E.settleMonth(s)
    expect(report.ledger.month).toBe(m)
    if (s.result !== 'playing') break
    E.nextMonth(s)
    if (s.result !== 'playing') break
  }
  return s
}

describe('引擎', () => {
  it('可以在无头模式下跑完 12 个月', () => {
    const s = playYear(2025)
    expect(s.month).toBeGreaterThanOrEqual(12)
    expect(s.ledgers.length).toBeGreaterThanOrEqual(12)
    expect(['won', 'lost']).toContain(s.result)
  })

  it('不同 seed 都能跑通', () => {
    for (const seed of [1, 7, 42, 999, 20250918]) {
      const s = playYear(seed)
      expect(s.ledgers.length).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(s.cash)).toBe(true)
    }
  })

  it('同一 seed 结果一致（确定性）', () => {
    const a = playYear(777, 'aggressive')
    const b = playYear(777, 'aggressive')
    expect(a.cash).toBe(b.cash)
    expect(a.month).toBe(b.month)
    expect(a.ledgers.length).toBe(b.ledgers.length)
  })

  it('资产负债表恒等式成立', () => {
    const s = playYear(31337)
    const b = E.balanceSheet(s)
    // 金额按分取整后比较：存货结转会产生浮点尾差，业务上无意义
    const r2 = (n: number) => Math.round(n * 100) / 100
    expect(r2(b.totalAssets)).toBe(r2(b.debt + b.equity))
  })

  it('移动加权平均成本随采购价变化', () => {
    const s = E.newGame(5)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    const before = s.materials.pkg.value / Math.max(1, s.materials.pkg.qty)
    // 直接注入一批高价原料
    const cashBefore = s.cash
    E.addMaterial(s, 'pkg', 5, 20, false)
    expect(s.materials.pkg.value / s.materials.pkg.qty).toBeGreaterThan(before)
    expect(s.materials.pkg.qty).toBe(5)
    expect(s.cash).toBe(cashBefore - 100) // 5 × 2w
  })

  it('每类原料每月只能选一个档位', () => {
    const s = E.newGame(9)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    const first = E.buyMaterial(s, 'pkg', 'small')
    expect(first.ok).toBe(true)
    const second = E.buyMaterial(s, 'pkg', 'mid')
    expect(second.ok).toBe(false)
  })

  it('档位数量随档位递增（稀缺原料 1 件粒度，不出现小批 ≥ 大批）', () => {
    const s = E.newGame(13)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    for (const climate of CLIMATE_ORDER) {
      s.climate = climate
      s.monthMods = { materials: {} }
      s.cardMods = {}
      for (const m of MATERIALS) {
        const supply = E.derive(s).materials[m.id]?.supply ?? 0
        if (supply <= 0) continue
        const small = E.lotQty(s, m.id, 'small')
        const mid = E.lotQty(s, m.id, 'mid')
        const large = E.lotQty(s, m.id, 'large')
        expect(large).toBe(supply)
        expect(small).toBeLessThanOrEqual(mid)
        expect(mid).toBeLessThanOrEqual(large)
        if (supply > 1) expect(small).toBeLessThan(large)
      }
    }
  })

  it('产能不会超过设备与人员的合计', () => {
    const s = E.newGame(11)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    const d = E.derive(s)
    expect(d.capacity).toBe(10) // 开局一台产能 10 的设备，无生产人员
    expect(E.maxProducible(s, 'low')).toBe(0) // 无原料
  })

  it('需求分层与气候修正一致', () => {
    const s = E.newGame(3)
    const d = E.derive(s)
    const total = TIERS.reduce((a, t) => a + d.demand[t], 0)
    expect(total).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(total)).toBe(true)
  })

  it('低端 BOM 的原料消耗与设计一致', () => {
    expect(BOMS.low.recipe).toEqual({ pkg: 2, resin: 1 })
    expect(BOMS.mid.recipe).toEqual({ resin: 2, alloy: 1 })
    expect(MATERIALS.map((m) => m.id)).toEqual(['pkg', 'resin', 'alloy', 'chip'])
  })

  it('研发进度累积并在月底判定', () => {
    const s = E.newGame(21)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    void Rng
    // 给出 4 名研发人员
    s.depts.rnd.staff = 4
    E.startResearch(s, 'bom-mid')
    const r1 = E.settleMonth(s)
    expect(r1.rnd).not.toBeNull()
    expect(s.rnd['bom-mid'].progress).toBeGreaterThan(0)
  })
  /**
   * 会计恒等式回归：资产 = 负债 + 所有者权益。
   *
   * 断言只在**月末结算后**成立——月中允许有未过账项：
   * 事件/打牌付出的现金先挂进 miscExpense，结算时才确认为费用。
   *
   * 历史 bug 由这个断言兜住：
   *  - 借款本金被从权益里扣了一次，导致缺口永久滞留；
   *  - 结算时把 miscExpense 的现金又扣了一遍（重复付款）；
   *  - 设备提足原值后仍在计提折旧，费用进了损益、资产却不再下降。
   */
  it('资产 = 负债 + 所有者权益，全年逐月结算后成立', () => {
    const s = E.newGame(31337)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)

    const r2 = (n: number) => Math.round(n * 100) / 100
    const check = (tag: string) => {
      const b = E.balanceSheet(s)
      expect(r2(b.totalAssets - b.debt - b.equity), `${tag} 失衡`).toBe(0)
    }

    for (let m = 1; m <= 12; m++) {
      E.beginMonthEvent(s)
      const ev = s.currentEvent
      if (ev) {
        if (ev.type === 'choice' && ev.options) E.applyEventOption(s, 0)
        else if (ev.type === 'chance' && ev.chance) {
          const c = (ev.chance.cost.cash ?? 0) + (ev.chance.cost.ap ?? 0) * 50
          if (s.cash > c + 200) E.acceptChance(s)
          else E.skipEvent(s)
        }
      }
      E.enterDraw(s)
      E.enterOperate(s)
      if (E.derive(s).creditAvailable >= 100 && m >= 2) E.borrow(s, 100)

      const rep = E.settleMonth(s)
      check(`m${m} 结算后`)
      expect(Number.isFinite(rep.ledger.netProfit)).toBe(true)

      if (s.result !== 'playing') break
      E.nextMonth(s)
      check(`m${m} 结转后`)
      if (s.result !== 'playing') break
    }
  })

  it('折旧提足原值即停，账面价值不会穿负', () => {
    const s = E.newGame(5)
    E.startGame(s)
    const eq = s.equipment[0]
    eq.accumulated = eq.cost // 已提足
    const before = E.balanceSheet(s).equipmentAccum
    const rep = E.settleMonth(s)
    // 不再计提：累计折旧停在原值，净值也不会被压成负数
    expect(eq.accumulated).toBe(eq.cost)
    expect(E.balanceSheet(s).equipmentAccum).toBe(before)
    expect(E.equipmentNet(s)).toBe(0)
    expect(rep.ledger.parts['设备折旧']).toBe(0)
  })
  /**
   * 订单量是销售的第二个出口：招销售既提高订单数，也应该给出 8~12 件的规模。
   *
   * 历史 bug：mergeMods 把未声明的 orderQty 一律写成 0，
   * 使得下游 `mods.orderQty ?? 10` 永远取不到基准，
   * 订单量被压成 1 件，招销售几乎变成纯支出。
   */
  it('订单数随销售人数增长，且每单数量在 8~12 件之间', () => {
    for (const [sell, wantCount] of [[0, 0], [2, 1], [4, 3]] as [number, number][]) {
      const s = E.newGame(7)
      E.startGame(s)
      if (s.challengeOffered.length) E.chooseChallenge(s, 0)
      s.depts.sell.staff = sell
      s.depts.sell.hired = sell
      E.beginMonthEvent(s)
      E.enterDraw(s)
      E.enterOperate(s)
      expect(s.orders.length, `销售 ${sell} 人的订单数`).toBe(wantCount)
      for (const o of s.orders) {
        expect(o.qty, `销售 ${sell} 人的订单量`).toBeGreaterThanOrEqual(8)
        expect(o.qty).toBeLessThanOrEqual(12)
      }
    }
  })

  it('销售资源加点直接增加该层需求：1 点 1 需求，每层上限 3 倍基础需求', () => {
    const s = E.newGame(7)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    const d0 = E.derive(s)
    expect(d0.demand).toEqual(d0.demandBase) // 未加点时两者相等
    // 成本梯度：低 1 / 中 2 / 高 3 / 特 4 点每需求；push = min(floor(分配/成本), 上限)
    const cases: [E.Tier, number, number][] = [
      ['low', 5, 5], // 5 点 ÷ 1 = 5（未超上限 15）
      ['mid', 10, 5], // 10 点 ÷ 2 = 5（未超上限 12）
      ['mid', 3, 1], // 零头：3 点 ÷ 2 = 1 需求，余 1 点不计
      ['high', 99, 3], // 资源池 10 点封顶 → 10 ÷ 3 = 3（未超上限 6）
    ]
    for (const [tier, want, expectPush] of cases) {
      s.salesAlloc = { low: 0, mid: 0, high: 0, special: 0 }
      E.setAlloc(s, tier, want)
      const d = E.derive(s)
      expect(d.salesPush[tier], `${tier} 加点 ${want}`).toBe(expectPush)
      expect(d.demand[tier]).toBe(d.demandBase[tier] + expectPush)
    }
  })

  it('现货各层独立结算：无分配也能卖基础需求，库存不再跨层互吃', () => {
    const s = E.newGame(7)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    // 注入库存：低端 10、高端 10（解锁配方），全部资源 0 分配
    s.products.low.qty = 10
    s.products.low.value = 10 * 40
    s.products.high.qty = 10
    s.products.high.value = 10 * 120
    s.products.high.built = true
    const d = E.derive(s)
    const lowDemand = d.demand.low // 基础 + 气候，无加点
    const highDemand = d.demand.high
    const rep = E.settleMonth(s)
    const lowSold = rep.sales.spots.filter((x) => x.tier === 'low').reduce((a, x) => a + x.qty, 0)
    const highSold = rep.sales.spots.filter((x) => x.tier === 'high').reduce((a, x) => a + x.qty, 0)
    // 低高端各自卖满自己的需求，互不侵占（旧模型高端会抢低端需求）
    expect(lowSold).toBe(Math.min(10, lowDemand))
    expect(highSold).toBe(Math.min(10, highDemand))
    expect(lowSold + highSold).toBe(rep.sales.filled.low + rep.sales.filled.high)
  })

  it('订单先于现货结算并占用本层需求', () => {
    const s = E.newGame(7)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    s.products.low.qty = 10
    s.products.low.value = 10 * 40
    s.orders.push({ id: 't1', tier: 'low', qty: 3, priceShift: 1, dueMonth: s.month, from: 'test' })
    const d = E.derive(s)
    const rep = E.settleMonth(s)
    expect(rep.sales.orders.find((x) => x.qty === 3)).toBeTruthy() // 订单交付 3 件
    const lowSpot = rep.sales.spots.filter((x) => x.tier === 'low').reduce((a, x) => a + x.qty, 0)
    // 现货只剩需求 - 订单量的部分
    expect(lowSpot).toBe(Math.max(0, Math.min(7, d.demand.low - 3)))
  })
})
