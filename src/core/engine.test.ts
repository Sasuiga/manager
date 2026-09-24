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
    E.setPlan(s, 'low', Math.min(maxQ, planQty))

    // ── 销售资源分配 ──
    const d = E.derive(s)
    if (s.products.low.qty > 0) E.setAlloc(s, 'low', d.salesResource)

    // ── 研发 ──
    if (s.depts.rnd.staff >= 1) {
      const target = s.products.mid.built ? 'ip-supply-1' : 'bom-mid'
      if (!s.rnd[target].done) E.setRndAssign(s, target, s.depts.rnd.staff)
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
    expect(d.capacity).toBe(5) // 老板自产 5，开局无生产人员、无设备
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
    // 给出 4 名研发人员，全部放置到中端项目
    s.depts.rnd.staff = 4
    E.setRndAssign(s, 'bom-mid', 4)
    const r1 = E.settleMonth(s)
    expect(r1.rnd).toHaveLength(1)
    expect(r1.rnd[0].success).toBe(true)
    expect(s.products.mid.built).toBe(true)
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
    // 新模型开局无设备，手动挂一台已提足的验证折旧会计路径
    s.equipment.push({ id: 'eq-test', name: '测试产线', capacity: 10, depreciation: 20, creditLine: 0, cost: 50, accumulated: 50, purchasedAt: 1 })
    const before = E.balanceSheet(s).equipmentAccum
    const rep = E.settleMonth(s)
    // 不再计提：累计折旧停在原值，净值也不会被压成负数
    expect(s.equipment[0].accumulated).toBe(50)
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
    for (const [sell, wantCount] of [[0, 0], [2, 1], [4, 2]] as [number, number][]) {
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

  it('销售资源加点直接增加该层需求：高端产品需要更多资源，每层上限 3 倍基础需求', () => {
    const s = E.newGame(7)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    const d0 = E.derive(s)
    expect(d0.demand).toEqual(d0.demandBase) // 未加点时两者相等
    // 成本梯度：低 1 / 中 2 / 高 4 / 特 6 点每需求；push = min(floor(分配/成本), 上限)
    const cases: [E.Tier, number, number][] = [
      ['low', 5, 5], // 5 点 ÷ 1 = 5（未超上限 15）
      ['mid', 10, 5], // 10 点 ÷ 2 = 5（未超上限 12）
      ['mid', 3, 1], // 零头：3 点 ÷ 2 = 1 需求，余 1 点不计
      ['high', 99, 2], // 资源池 10 点封顶 → 10 ÷ 4 = 2（未超上限 6）
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
    s.orders.push({ id: 't1', tier: 'low', qty: 3, priceShift: 1, dueMonth: s.month, from: 'test', forced: true })
    const d = E.derive(s)
    const rep = E.settleMonth(s)
    expect(rep.sales.orders.find((x) => x.qty === 3)).toBeTruthy() // 订单交付 3 件
    const lowSpot = rep.sales.spots.filter((x) => x.tier === 'low').reduce((a, x) => a + x.qty, 0)
    // 现货只剩需求 - 订单量的部分
    expect(lowSpot).toBe(Math.max(0, Math.min(7, d.demand.low - 3)))
  })

  it('确认生产：按 BOM 立即扣料入库，记账原料→存货', () => {
    const s = E.newGame(1)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    E.enterDraw(s)
    E.enterOperate(s)
    // 备料：低端 BOM 包材×2 + 树脂×1，产 5 件需 10 包材 + 5 树脂
    s.materials.pkg.qty = 10
    s.materials.pkg.value = 10 * 10
    s.materials.resin.qty = 5
    s.materials.resin.value = 5 * 20
    const before = s.products.low
    const qtyBefore = before.qty
    const valBefore = before.value
    E.setPlan(s, 'low', 5)
    const r = E.confirmProduction(s)
    expect(r.ok).toBe(true)
    expect(s.materials.pkg.qty).toBe(0)
    expect(s.materials.resin.qty).toBe(0)
    expect(s.plan.quantities.low).toBe(0)
    // 原料账面 10×10 + 5×20 = 200，costFactor 1 时成品入库同额
    expect(before.qty).toBe(qtyBefore + 5)
    expect(before.value - valBefore).toBe(200)
    // 部门账务出现「原料出库 → 存货入库」两笔
    const make = s.monthLedger.filter((l) => l.dept === 'make')
    expect(make.filter((l) => l.item.includes('原料出库 包材'))).toHaveLength(1)
    expect(make.filter((l) => l.item.includes('原料出库 树脂'))).toHaveLength(1)
    expect(make.filter((l) => l.item.includes('存货入库 标准品'))).toHaveLength(1)
    // 已全部生产完：再确认提示无剩余量
    const r2 = E.confirmProduction(s)
    expect(r2.ok).toBe(false)
  })

  it('多产品排产：共享产能与原料，并一次确认多条产品线', () => {
    const s = E.newGame(11, 'core')
    E.startGame(s)
    // 本测试验证共享产能/原料，手动解锁中端（研发解锁由「研发放置」测试覆盖）
    s.products.mid.built = true
    s.materials.pkg.qty = 4
    s.materials.pkg.value = 40
    s.materials.resin.qty = 6
    s.materials.resin.value = 120
    s.materials.alloy.qty = 2
    s.materials.alloy.value = 80

    E.setPlan(s, 'low', 2)
    E.setPlan(s, 'mid', 2)
    expect(E.plannedTotal(s)).toBe(4)
    expect(s.plan.quantities).toEqual({ low: 2, mid: 2, high: 0, special: 0 })

    const r = E.settleMonth(s)
    expect(r.production.produced).toBe(4)
    // 结算后成品库存可能因自然销售而减少；只断言原料已全额领用、排产已清零
    expect(s.materials.pkg.qty).toBe(0)
    expect(s.materials.resin.qty).toBe(0)
    expect(s.materials.alloy.qty).toBe(0)
    expect(E.plannedTotal(s)).toBe(0)
  })

  it('采购记账：借库存贷现金，金额与现金扣减、库存账面勾稽', () => {
    const s = E.newGame(1)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {} // 排除即时事件修饰，保证价格/需求确定
    E.enterDraw(s)
    E.enterOperate(s)
    const cashBefore = s.cash
    const valBefore = s.materials.pkg.value
    const r = E.buyMaterial(s, 'pkg', 'mid')
    expect(r.ok).toBe(true)
    const cashPaid = cashBefore - s.cash
    expect(cashPaid).toBeGreaterThan(0)
    // 库存账面增加额 = 现金实付（移动加权平均入库）
    expect(s.materials.pkg.value - valBefore).toBe(cashPaid)
    // 本月账务出现采购行：借 库存 包材 / 贷 现金，金额与实付严格相等
    const entry = s.monthLedger.find((l) => l.dept === 'buy' && l.item.startsWith('采购 包材'))
    expect(entry).toBeTruthy()
    expect(entry!.debit).toBe('库存 包材')
    expect(entry!.credit).toBe('现金')
    expect(entry!.debitAmt).toBe(cashPaid)
    expect(entry!.creditAmt).toBe(cashPaid)
  })

  it('月末结算：生产与销售记账与损益表勾稽', () => {
    const s = E.newGame(7)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {} // 排除即时事件修饰，保证需求/价格确定
    E.enterDraw(s)
    E.enterOperate(s)
    // 备料：低端 BOM 包材×2 + 树脂×1，产 4 件需 8 包材 + 4 树脂
    s.materials.pkg.qty = 8
    s.materials.pkg.value = 80
    s.materials.resin.qty = 4
    s.materials.resin.value = 80
    // 成品库存 5 件（供现货销售）
    s.products.low.qty = 5
    s.products.low.value = 5 * 40
    // 不点确认，产量留给月末结算路径
    E.setPlan(s, 'low', 4)
    const rep = E.settleMonth(s)
    const r2 = (n: number) => Math.round(n * 10000) / 10000
    // 生产记账：月末生产路径同样记 出库/入库，且方向为 借 制造费用 / 贷 库存
    const outRows = s.monthLedger.filter((l) => l.dept === 'make' && l.item.startsWith('原料出库'))
    expect(outRows.length).toBe(2)
    for (const l of outRows) {
      expect(l.debit).toBe('制造费用')
      expect(l.credit).toMatch(/^库存 /)
    }
    // 出库合计 = 原料账面减记（8×10 + 4×20 = 160）
    expect(outRows.reduce((a, l) => a + l.debitAmt, 0)).toBe(160)
    const inRow = s.monthLedger.find((l) => l.dept === 'make' && l.item.startsWith('存货入库 标准品'))
    expect(inRow).toBeTruthy()
    expect(inRow!.debitAmt).toBe(160)
    // 销售记账：收入行金额 = 利润表「销售收入」，成本行合计 = 利润表「销售成本」
    const sellRows = s.monthLedger.filter((l) => l.dept === 'sell')
    const revRows = sellRows.filter((l) => l.item.startsWith('销售收入'))
    const cogsRows = sellRows.filter((l) => l.item.startsWith('销售成本'))
    expect(revRows.length).toBe(1)
    expect(revRows[0].debit).toBe('现金')
    expect(revRows[0].credit).toBe('销售收入')
    expect(revRows[0].debitAmt).toBe(rep.ledger.revenue)
    expect(r2(cogsRows.reduce((a, l) => a + l.debitAmt, 0))).toBe(r2(rep.ledger.cogs))
    // 存货科目勾稽：期初 + 生产入库 − 销售结转 = 期末成品账面
    const prodValEnd = s.products.low.value
    expect(r2(200 + 160 - cogsRows.reduce((a, l) => a + l.debitAmt, 0))).toBe(r2(prodValEnd))
  })

  it('长期协议到货记账：借库存贷现金，与实付金额勾稽', () => {
    const s = E.newGame(13)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {} // 排除即时事件修饰，保证协议锁价与现金变动确定
    E.enterDraw(s)
    E.enterOperate(s)
    E.signAgreement(s, 'pkg', 3, true) // free：不占名额/AP/现金
    const cashBefore = s.cash
    const rep = E.settleMonth(s)
    const ag = rep.autoPurchase.find((a) => a.from.startsWith('长期协议'))
    expect(ag).toBeTruthy()
    expect(ag!.total).toBeGreaterThan(0)
    // 本月无生产无销售无薪酬，现金变动全部来自协议到货
    expect(cashBefore - s.cash).toBe(ag!.total)
    const entry = s.monthLedger.find((l) => l.dept === 'buy' && l.item.startsWith('协议到货'))
    expect(entry).toBeTruthy()
    expect(entry!.debit).toBe(`库存 ${ag!.name}`)
    expect(entry!.credit).toBe('现金')
    expect(entry!.debitAmt).toBe(ag!.total)
    expect(s.materials[ag!.id].value).toBe(ag!.total)
  })

  it('流水线 bonus：资产增加同步贷记营业外收入，恒等式不漂移', () => {
    const s = E.newGame(1)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {}
    E.enterDraw(s)
    E.enterOperate(s)
    s.depts.make.staff = 5
    s.materials.pkg.qty = 20
    s.materials.pkg.value = 200
    s.materials.resin.qty = 10
    s.materials.resin.value = 200
    const gapOf = () => {
      const b = E.balanceSheet(s)
      return Math.round((b.totalAssets - b.debt - b.equity) * 10000) / 10000
    }
    const gapBefore = gapOf()
    E.setPlan(s, 'low', 5)
    expect(E.confirmProduction(s).ok).toBe(true) // 5 件 → bonus 1 件
    // bonus 按本批单位成本计入存货（资产 +40），必须同步贷记营业外收入
    // （miscIncome 在结算 §4 才确认为留存收益，故先验状态、再结算后验恒等式）
    expect(s.miscIncome).toBe(40)
    const bonusRow = s.monthLedger.find((l) => l.dept === 'make' && l.item.startsWith('流水线入库'))
    expect(bonusRow).toBeTruthy()
    expect(bonusRow!.credit).toBe('营业外收入')
    E.settleMonth(s)
    expect(gapOf()).toBe(gapBefore)
  })

  it('协议手续费当期费用化：签订与结算后恒等式不漂', () => {
    const s = E.newGame(13)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {}
    E.enterDraw(s)
    E.enterOperate(s)
    s.depts.buy.staff = 3
    const gapOf = () => {
      const b = E.balanceSheet(s)
      return Math.round((b.totalAssets - b.debt - b.equity) * 10000) / 10000
    }
    const gapBefore = gapOf()
    expect(E.signAgreement(s, 'pkg', 3).ok).toBe(true) // 非 free：1 AP + 1w
    // 现金 -10 已付，未结算前恒等式暂时漂 10；结算确认费用后收回
    const rep = E.settleMonth(s)
    expect(rep.ledger.parts['事件与杂项支出'] ?? 0).toBeGreaterThanOrEqual(10)
    expect(gapOf()).toBe(gapBefore)
  })

  it('招聘费计入管理费用（不再走杂项/财务费用）', () => {
    const s = E.newGame(1)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {}
    E.enterDraw(s)
    E.enterOperate(s)
    const fee = E.hireCost(s, 'buy')
    expect(fee).toBeGreaterThan(0)
    expect(E.hire(s, 'buy').ok).toBe(true)
    // 账务行：借 管理费用 / 贷 现金，金额 = 实际招聘费
    const row = E.derive(s).deptLedger['buy'].find((l) => l.item === '招聘费')
    expect(row).toBeTruthy()
    expect(row!.debit).toBe('管理费用')
    expect(row!.debitAmt).toBe(fee)
    const rep = E.settleMonth(s)
    expect(rep.ledger.parts['招聘费'] ?? 0).toBe(fee)
    // 招聘费不再走事件与杂项（财务费用）
    expect(rep.ledger.parts['事件与杂项支出'] ?? 0).toBe(0)
  })

  it('生产费用结转：制造费用未转存货部分与损益表「生产费用」一致', () => {
    const s = E.newGame(1)
    E.startGame(s)
    if (s.challengeOffered.length) E.chooseChallenge(s, 0)
    s.climate = 'recovery'
    E.beginMonthEvent(s)
    s.monthMods = {}
    E.enterDraw(s)
    E.enterOperate(s)
    s.depts.make.staff = 2 // 有工资；无生产 → 降本差异为 0
    const d = E.derive(s)
    const rep = E.settleMonth(s)
    const closing = d.deptLedger['make'].find((l) => l.item === '生产费用结转')
    expect(closing).toBeTruthy()
    // 无生产无降本差异：结转额 = 生产工资 + 折旧 + 加班费 = 损益表「生产费用」
    expect(closing!.debitAmt).toBe(rep.ledger.mfgExpense)
    expect(closing!.debit).toBe('生产费用')
    expect(closing!.credit).toBe('制造费用')
  })
})
