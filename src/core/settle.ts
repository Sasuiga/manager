import {
  ACHIEVEMENT_BY_ID,
  BOMS,
  CARD_BY_ID,
  CLIMATE_NAMES,
  CLIMATE_ORDER,
  MATERIALS,
  MGMT_CARD_UNLOCK,
  NEW_MATERIALS,
  RND_PROJECTS,
  TAX_RATE,
  TIERS,
} from '../data/game'
import { derive, mergeMods, rndProjectOutcome } from './derive'
import { balanceSheet, equipmentNet, equityOf, inventoryValue } from './game'
import { executePlannedPurchases, issueMaterials, postProductionInbound } from './actions'
import { Rng } from './rng'
import type {
  BalanceSheet,
  Dept,
  GameState,
  GoalTrack,
  Ledger,
  Money,
  SaleRecord,
  ScoreBreakdown,
  Tier,
} from './types'

/**
 * 结算阶段：按「长期协议 → 研发 → 生产 → 销售 → 过账」的顺序推进，
 * 一次结算产出完整的报表与结算报告，供 UI 逐行展开。
 *
 * 现金处理原则：
 *   - 原料采购、薪酬、利息、税金、设备折旧之外的支出在发生时即扣减现金；
 *   - 设备折旧是**非现金**费用，只影响利润与资产账面，不动现金；
 *   - 生产领料是资产内部转换（原料 → 成品），不动现金，只在售出时通过销售成本影响利润。
 */

export interface SettleReport {
  month: number
  production: {
    capacity: number
    planned: number
    produced: number
    tier: Tier | null
    consumed: { id: string; name: string; qty: number; cost: Money }[]
    unitCost: Money
    lines: { tier: Tier; planned: number; produced: number; unitCost: Money }[]
  }
  sales: {
    orders: SaleRecord[]
    spots: SaleRecord[]
    revenue: Money
    demand: Record<Tier, number>
    filled: Record<Tier, number>
    lost: Record<Tier, number>
    fillRate: number
  }
  /** 在研项目逐条结果；空数组 = 本月无在研 */
  rnd: { projectId: string; name: string; progress: number; need: number; rate: number; success: boolean | null }[]
  ledger: Ledger
  balance: BalanceSheet
  autoPurchase: { id: string; name: string; qty: number; unit: Money; total: Money; from: string; skipped?: string }[]
  cards: { name: string; text: string }[]
  goalResults: { name: string; kind: 'basic' | 'challenge'; done: boolean; current: number; target: number; points: number; compare: 'gte' | 'lte' }[]
  warnings: string[]
}

export interface SettleOptions {
  /** 核心模式现货需求倍率；预演用固定上下界，正式结算留空后按月随机。 */
  spotDemandFactor?: Partial<Record<Tier, number>>
}

export function settle(state: GameState, options: SettleOptions = {}): SettleReport {
  const d = derive(state)
  const warnings: string[] = []

  // 核心模式：普通采购在经营阶段只是计划，正式结算时先付款入库。
  executePlannedPurchases(state)

  // ══════════ 0. 长期协议自动采购 ══════════
  const autoPurchase: SettleReport['autoPurchase'] = []
  for (const ag of state.agreements) {
    if (ag.monthsLeft <= 0) continue
    const unit = priceAt(ag.materialId, ag.priceTierShift)
    // 按仓库还能容纳的数量执行，避免付了钱却装不下
    const cap = d.materials[ag.materialId]?.cap ?? state.materials[ag.materialId].cap
    const room = Math.max(0, cap - state.materials[ag.materialId].qty)
    const want = Math.min(ag.qty, room)
    if (want <= 0) {
      autoPurchase.push({ id: ag.materialId, name: nameOf(ag.materialId), qty: 0, unit, total: 0, from: '长期协议', skipped: '仓库已满，本月未能执行' })
      warnings.push(`长期协议【${nameOf(ag.materialId)}】因仓库已满未能执行`)
      continue
    }
    if (state.cash < unit * want) {
      autoPurchase.push({ id: ag.materialId, name: nameOf(ag.materialId), qty: 0, unit, total: 0, from: '长期协议', skipped: '现金不足，本月未能执行' })
      warnings.push(`长期协议【${nameOf(ag.materialId)}】因现金不足未能执行`)
      continue
    }
    // addMaterial 内部负责扣款与移动加权平均
    const added = addMaterial(state, ag.materialId, want, unit, false, true)
    if (added > 0) {
      const name = nameOf(ag.materialId)
      // 协议到货同属采购入账：借 库存 / 贷 现金，金额与实付现金、库存增加额严格相等
      state.monthLedger.push({
        dept: 'buy',
        item: `协议到货 ${name} ×${added}`,
        debit: `库存 ${name}`,
        credit: '现金',
        debitAmt: added * unit,
        creditAmt: added * unit,
        detail: [
          `${added} 件 × ${unit / 10}w（协议锁价，不占本月采购档数）`,
          '现金实付全额转入库存（移动加权平均计价）',
        ],
      })
    }
    autoPurchase.push({
      id: ag.materialId,
      name: nameOf(ag.materialId),
      qty: added,
      unit,
      total: added * unit,
      from: `长期协议（余 ${ag.monthsLeft} 个月）`,
      skipped: added < ag.qty ? `仓库上限限制，仅入库 ${added} 单位（应供 ${ag.qty}）` : undefined,
    })
  }

  const cashBegin = state.cash

  // ══════════ 1. 研发（在生产之前：解锁当月即可排产） ══════════
  const rng = Rng.fromState(state.rngState + state.month * 7919)
  const rndResults: SettleReport['rnd'] = []
  for (const def of RND_PROJECTS) {
    const slot = state.rnd[def.id]
    if (!slot?.projectId || slot.done || slot.assigned <= 0) continue
    const { gain, rate } = rndProjectOutcome(d, def, slot.assigned)
    slot.progress += gain
    let rolledRate = 0
    let success: boolean | null = null
    if (slot.progress >= def.need) {
      rolledRate = rate
      success = rng.next() < rate
      if (success) {
        slot.done = true
        slot.projectId = null
        slot.progress = 0
        state.flags['rndSuccessQ'] = (state.flags['rndSuccessQ'] ?? 0) + 1
        applyResearchSuccess(state, def.id)
      }
    }
    rndResults.push({ projectId: def.id, name: def.name, progress: slot.progress, need: def.need, rate: rolledRate, success })
  }
  state.rngState = rng.state

  // ══════════ 2. 生产 ══════════
  const capacity = planCapacity(state)
  const requested = TIERS.reduce((sum, t) => sum + state.plan.quantities[t], 0)
  let planned = 0
  const consumed: SettleReport['production']['consumed'] = []
  const productionLines: SettleReport['production']['lines'] = []
  let produced = 0
  let producedValue = 0
  /**
   * 生产降本差异：原料按账面价全额出库、成品按 costFactor 折价入账的差额。
   *
   * 降本卡生效时，若不在当期生产费用中确认这笔差额，
   * 库存未售完之前资产负债表会凭空漂出同样金额的缺口，
   * 直到售出才通过销售成本消化——恒等式在月末即被破坏。
   */
  let prodVariance = 0
  for (const plannedTier of TIERS) {
    const want = state.plan.quantities[plannedTier]
    if (want <= 0 || !state.products[plannedTier].built) continue
    state.plan.quantities[plannedTier] = 0
    const linePlanned = Math.min(want, maxProducible(state, plannedTier))
    if (linePlanned <= 0) continue
    planned += linePlanned
    const bom = BOMS[plannedTier]
    let materialCost = 0
    for (const [id, need] of Object.entries(bom.recipe)) {
      const per = Math.max(1, need - d.matSave)
      const qty = per * linePlanned
      const mat = state.materials[id]
      const unitValue = mat.qty > 0 ? mat.value / mat.qty : 0
      const cost = unitValue * qty
      materialCost += cost
      consumed.push({ id, name: nameOf(id), qty, cost: Math.round(cost) })
    }
    /**
     * 扣减与记账同 confirmProduction 共用 issueMaterials：
     * 出库按账面单价等比例结转，并与入库使用同一个 materialCost，
     * 保证「原料减多少 = 成品加多少（除以成本系数之前）」。
     */
    issueMaterials(state, plannedTier, linePlanned, d.matSave)
    /**
     * 【流水线】成就（生产 5 人）：每 5 件额外入库 1 件。
     * 这些白得的产出若不计价，账面上就会出现「凭空多出来的资产」，
     * 因此按本批既有的单位成本计价，与自产产品同口径入账。
     */
    const bonus = state.depts.make.staff >= 5 ? Math.floor(linePlanned / 5) : 0
    const p = state.products[plannedTier]
    const batchCost = materialCost * d.costFactor
    const unitCostIn = linePlanned > 0 ? batchCost / linePlanned : 0
    p.value += batchCost + bonus * unitCostIn
    p.qty += linePlanned + bonus
    p.avgCost = p.qty > 0 ? Math.round(p.value / p.qty) : 0
    if (bonus > 0) warnings.push(`流水线效应：额外入库 ${bonus} 件`)
    postProductionInbound(state, plannedTier, linePlanned, bonus, batchCost, unitCostIn)
    prodVariance += materialCost * (1 - d.costFactor)
    produced += linePlanned + bonus
    producedValue += batchCost + bonus * unitCostIn
    productionLines.push({ tier: plannedTier, planned: linePlanned, produced: linePlanned + bonus, unitCost: Math.round(unitCostIn) })
  }
  for (const tier of TIERS) state.plan.quantities[tier] = 0
  const producedUnitCost = produced > 0 ? Math.round(producedValue / produced) : 0
  // 加班费（现金）
  if (state.plan.overtime && state.depts.make.staff >= 3) {
    state.cash -= 5
    warnings.push('已支付加班费 0.5w')
  }

  // ══════════ 3. 销售 ══════════
  const orders: SaleRecord[] = []
  const spots: SaleRecord[] = []
  const filled: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  /**
   * 核心模式的现货成交具有不确定性：每层实际市场需求为公开上限的 50%～100%。
   * 预演会分别传入 0.5 / 1 得到区间；正式结算按 seed、月份和产品层确定性抽取。
   * 完整模式保持原有确定需求规则。
   */
  const spotRng = new Rng(state.seed + state.month * 65537 + 1709)
  const spotFactor: Record<Tier, number> = { low: 1, mid: 1, high: 1, special: 1 }
  for (const t of TIERS) {
    spotFactor[t] = options.spotDemandFactor?.[t]
      ?? (state.mode === 'core' ? 0.5 + spotRng.next() * 0.5 : 1)
  }
  /** lost 以本月实际现货需求为起点，订单交付会占用本层需求。 */
  const lost: Record<Tier, number> = {
    low: Math.floor(d.demand.low * spotFactor.low),
    mid: Math.floor(d.demand.mid * spotFactor.mid),
    high: Math.floor(d.demand.high * spotFactor.high),
    special: Math.floor(d.demand.special * spotFactor.special),
  }
  /** 满足率分母用自然需求（不含加点）：玩家自己推大的盘子不应拉低自己的达标率。 */
  const demandTotal = TIERS.reduce((a, t) => a + d.demandBase[t], 0)

  // 2.1 订单：独立定价，先于现货结算并占用本层需求。
  //   · 强制订单（事件/卡牌产生）：到月必交，库存不足部分失效。
  //   · 自然订单（销售渠道）：玩家当月点「接单」才结算；未接/已取消的当月失效。
  const remainingOrders: typeof state.orders = []
  const accepted = new Set(state.acceptedOrders)
  for (const o of state.orders) {
    const p = state.products[o.tier]
    if (!p.built) {
      warnings.push(`订单（${TIER_LABEL[o.tier]} × ${o.qty}）因未解锁该产品配方而失效`)
      continue
    }
    if (!o.forced) {
      if (!accepted.has(o.id)) {
        warnings.push(`自然订单（${TIER_LABEL[o.tier]} × ${o.qty}）未接取，当月失效`)
        continue
      }
      if (p.qty < o.qty) {
        warnings.push(`已接订单（${TIER_LABEL[o.tier]} × ${o.qty}）库存 ${p.qty} 件不足，部分失效`)
      }
    }
    const deliver = o.forced ? Math.min(o.qty, p.qty) : Math.min(o.qty, p.qty)
    const unit = priceAtProduct(o.tier, o.priceShift + d.priceShift[o.tier])
    const unitValue = p.value / Math.max(1, p.qty)
    p.value -= unitValue * deliver
    p.qty -= deliver
    state.cash += unit * deliver
    orders.push({ tier: o.tier, qty: deliver, unitPrice: unit, unitCost: Math.round(unitValue), cost: unitValue * deliver, revenue: unit * deliver, channel: 'order' })
    const used = Math.min(deliver, lost[o.tier])
    lost[o.tier] -= used
    filled[o.tier] += used
    if (deliver < o.qty) warnings.push(`订单（${TIER_LABEL[o.tier]}）按实际库存交付 ${deliver} 件，剩余 ${o.qty - deliver} 件失效`)
  }
  state.orders = remainingOrders
  state.declinedOrders = []
  state.acceptedOrders = []

  // 2.2 现货：各层独立结算，可售 = min(库存, 本层剩余需求)。
  // 不再做跨层吸引力份额分配（§7.2.4 新模型：加点直接做大本层需求）。
  for (const t of TIERS) {
    let remaining = lost[t]
    if (remaining <= 0) continue
    const p = state.products[t]
    if (!p.built || p.qty <= 0) continue
    const sell = Math.min(p.qty, remaining)
    const unit = priceAtProduct(t, d.priceShift[t])
    const unitValue = p.qty > 0 ? p.value / p.qty : 0
    p.value -= unitValue * sell
    p.qty -= sell
    state.cash += unit * sell
    spots.push({ tier: t, qty: sell, unitPrice: unit, unitCost: Math.round(unitValue), cost: unitValue * sell, revenue: unit * sell, channel: 'spot' })
    lost[t] = remaining - sell
    filled[t] += sell
  }

  // 2.3 销售账务：收入与成本结转分别入账（借 现金/销售成本，贷 销售收入/存货），
  // 各行金额与利润表「销售收入 / 销售成本」及存货减记严格相等，
  // 与生产入库（借 存货）同科目勾稽：存货借方合计 − 贷方合计 = 期末成品存货。
  for (const t of TIERS) {
    const rec = [...orders, ...spots].filter((r) => r.tier === t)
    if (rec.length === 0) continue
    const rev = rec.reduce((a, r) => a + r.revenue, 0)
    const cost = rec.reduce((a, r) => a + (r.cost ?? Math.round(r.qty * r.unitCost)), 0)
    const soldQty = rec.reduce((a, r) => a + r.qty, 0)
    if (rev > 0) {
      state.monthLedger.push({
        dept: 'sell',
        item: `销售收入 ${TIER_LABEL[t]}`,
        debit: '现金',
        credit: '销售收入',
        debitAmt: rev,
        creditAmt: rev,
        detail: [
          `订单 + 现货成交 ${soldQty} 件`,
          '现金增加额 = 利润表「销售收入」',
        ],
      })
    }
    if (cost > 0) {
      state.monthLedger.push({
        dept: 'sell',
        item: `销售成本 ${TIER_LABEL[t]}`,
        debit: '销售成本',
        credit: `存货 ${BOMS[t].name}`,
        debitAmt: cost,
        creditAmt: 0,
        detail: [
          '成品存货减记全额结转为销售成本（移动加权平均）',
          '与利润表「销售成本」一致，与生产入库同科目勾稽',
        ],
      })
    }
  }

  // ══════════ 4. 过账 ══════════
  const revenue = [...orders, ...spots].reduce((a, s) => a + s.revenue, 0)
  /** 销售成本取各笔实际结转额之和，与存货减记严格一致。 */
  const cogs = [...orders, ...spots].reduce((a, s) => a + (s.cost ?? Math.round(s.qty * s.unitCost)), 0)
  const grossProfit = revenue - cogs

  const salaryBy: Record<Dept, Money> = {
    ops: d.salaryPer.ops * state.depts.ops.staff,
    buy: d.salaryPer.buy * state.depts.buy.staff,
    make: d.salaryPer.make * state.depts.make.staff,
    sell: d.salaryPer.sell * state.depts.sell.staff,
    rnd: d.salaryPer.rnd * state.depts.rnd.staff,
  }

  /**
   * 折旧：提足原值即停，账面价值不会穿到负数。
   * 若设备已提足，本月不再确认折旧费用——否则损益里会凭空多一笔
   * 没有对应资产减项的费用，恒等式随之失衡。
   */
  let depreciation = 0
  for (const e of state.equipment) {
    const charge = Math.min(e.depreciation, Math.max(0, e.cost - e.accumulated))
    e.accumulated += charge
    depreciation += charge
  }

  // 加班费已在生产阶段扣过现金，这里只作为费用进入损益
  const overtimeCost = state.plan.overtime && state.depts.make.staff >= 3 ? 5 : 0
  const projectCost = Math.max(0, d.rndCostTotal)

  /**
   * 打牌时支付的现金（技术引进 3w 等）。
   *
   * 这笔钱在 playCard 里已扣现金、并计入 miscExpense；
   * 部门账务按「提案费用：借 管理费用 / 贷 现金」入账，
   * 因此损益侧也从 misc 里拆出、计入管理费用，与部门账务同科目。
   */
  const paidCardBy = (kind: Dept) =>
    state.playedThisMonth
      .filter((c) => CARD_BY_ID[c.defId]?.kind === kind)
      .reduce((a, c) => a + (CARD_BY_ID[c.defId]?.cost ?? 0), 0)
  const cardFees = paidCardBy('make') + paidCardBy('sell') + paidCardBy('buy') + paidCardBy('ops') + paidCardBy('rnd')

  /**
   * 本月发生的杂项支出（事件开销、协议手续费、供应商开发等）。
   * 现金在发生时已付出，这里统一确认为当期费用，
   * 使「利润」与「现金」始终对得上。
   */
  const misc = state.miscExpense

  /** 招聘费净额（招聘实付 − 裁员返还）：当期费用化进管理费用 */
  const hireFee = Object.values(state.hireFeeBy).reduce((a, v) => a + v, 0)

  const mfgExpense = salaryBy.make + depreciation + overtimeCost + prodVariance
  const sellExpense = salaryBy.sell
  const adminExpense = salaryBy.ops + salaryBy.buy + hireFee + cardFees
  const rndExpense = salaryBy.rnd + projectCost
  const financeExpense = d.interest + (misc - cardFees)
  const otherIncome = state.miscIncome

  /**
   * 现金流出：只包含真正动用现金的部分。
   * 折旧、生产领料都是非现金项目；招聘费/打牌费在发生时已扣现金，
   * 结算只确认费用，不再重复扣款。
   */
  const cashOut = salaryBy.ops + salaryBy.buy + salaryBy.make + salaryBy.sell + salaryBy.rnd + projectCost + d.interest
  state.cash -= cashOut

  const preTax = grossProfit - mfgExpense - sellExpense - adminExpense - rndExpense - financeExpense + otherIncome
  const tax = preTax > 0 ? Math.round(preTax * TAX_RATE) : 0
  state.cash -= tax
  const netProfit = preTax - tax

  /**
   * 累计留存收益取「现金口径 + 非现金费用」，
   * 保证 资产 = 负债 + 所有者权益 恒成立（生产领料是资产内部转换，不影响净值）。
   */
  state.retained += netProfit

  const ledger: Ledger = {
    month: state.month,
    revenue,
    cogs,
    grossProfit,
    sellExpense,
    adminExpense,
    rndExpense,
    mfgExpense,
    financeExpense,
    netProfit,
    cashBegin,
    cashEnd: state.cash,
    borrowing: 0,
    repayment: 0,
    capex: 0,
    orders,
    spots,
    parts: {
      '订单收入': orders.reduce((a, s) => a + s.revenue, 0),
      '现货收入': spots.reduce((a, s) => a + s.revenue, 0),
      '销售成本': cogs,
      '生产人员薪酬': salaryBy.make,
      '设备折旧': depreciation,
      '加班费': overtimeCost,
      '生产降本差异': prodVariance,
      '销售人员薪酬': salaryBy.sell,
      '运营人员薪酬': salaryBy.ops,
      '采购人员薪酬': salaryBy.buy,
      '招聘费': hireFee,
      '提案费用': cardFees,
      '研发人员薪酬': salaryBy.rnd,
      '研发项目投入': Math.max(0, d.rndCostTotal),
      '借款利息': d.interest,
      '事件与杂项支出': misc - cardFees,
      '营业外收入': otherIncome,
      '所得税': tax,
    },
    demandFilled: TIERS.reduce((a, t) => a + filled[t], 0),
    demandTotal,
  }
  state.miscExpense = 0
  state.miscIncome = 0
  state.hireFeeBy = { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }
  state.ledgers.push(ledger)
  const balance = balanceSheet(state)
  state.balanceHistory.push(balance)

  // ══════════ 5. 季度目标结算 ══════════
  const goalResults: SettleReport['goalResults'] = []
  if (state.month % 3 === 0) {
    if (state.basicGoal) {
      const cur = goalCurrent(state, state.basicGoal)
      const done = checkGoal(state.basicGoal, cur)
      goalResults.push({ name: state.basicGoal.def.name, kind: 'basic', done, current: cur, target: state.basicGoal.target, points: done ? state.basicGoal.def.points : 0, compare: state.basicGoal.def.compare })
      if (done) {
        state.goalPoints += state.basicGoal.def.points
        state.misses = 0
      } else {
        state.misses += 1
      }
    }
    if (state.challengeGoal) {
      const cur = goalCurrent(state, state.challengeGoal)
      const done = checkGoal(state.challengeGoal, cur)
      goalResults.push({ name: state.challengeGoal.def.name, kind: 'challenge', done, current: cur, target: state.challengeGoal.target, points: done ? state.challengeGoal.def.points : 0, compare: state.challengeGoal.def.compare })
      if (done) state.goalPoints += state.challengeGoal.def.points
    }
    state.goalHistory.push({
      quarter: Math.ceil(state.month / 3),
      basic: goalResults.find((g) => g.kind === 'basic')?.done ?? false,
      challenge: goalResults.find((g) => g.kind === 'challenge')?.done ?? null,
      name: state.basicGoal?.def.name ?? '—',
      challengeName: state.challengeGoal?.def.name ?? '—',
    })
    /**
     * 本季度已判分完毕，账目齐全，此刻记录快照作为**下一季度**相对目标的基准。
     *
     * 不能等到季度切换时再记：那时 month 已递增到新季度，
     * quarterLedgers 采到的是只有 0～1 个月数据的新季度，
     * 基准会恒为 0，「≤ 上季度 × 0.9」这类目标必然无法达成。
     */
    state.quarterSnapshot = snapshotQuarter(state)
  }

  // ══════════ 6. 终局判定 ══════════
  if (state.cash < 0) {
    state.result = 'lost'
    state.lossReason = `第 ${state.month} 月结算后资金为负（${(state.cash / 10).toFixed(1)}w）`
  } else if (state.misses >= 2) {
    state.result = 'lost'
    state.lossReason = '连续两个季度未达成董事会基本目标'
  } else if (state.month >= 12) {
    state.result = 'won'
  }

  state.score = computeScore(state)

  return {
    month: state.month,
    production: {
      capacity,
      planned: requested || planned,
      produced,
      tier: productionLines.length === 1 ? productionLines[0].tier : null,
      consumed,
      unitCost: producedUnitCost,
      lines: productionLines,
    },
    sales: { orders, spots, revenue, demand: d.demand, filled, lost, fillRate: demandTotal ? TIERS.reduce((a, t) => a + filled[t], 0) / demandTotal : 1 },
    rnd: rndResults,
    ledger,
    balance,
    autoPurchase,
    cards: state.playedThisMonth.map((c) => ({ name: CARD_BY_ID[c.defId]?.name ?? c.defId, text: CARD_BY_ID[c.defId]?.text ?? '' })),
    goalResults,
    warnings,
  }
}

// ────────────────────────────────────────────────────────────
// 内部工具
// ────────────────────────────────────────────────────────────

function planCapacity(state: GameState): number {
  const d = derive(state)
  let cap = d.capacity
  if (state.plan.overtime && state.depts.make.staff >= 3) cap += 10
  return Math.max(0, cap)
}

function maxProducible(state: GameState, tier: Tier): number {
  const d = derive(state)
  const bom = BOMS[tier]
  let max = planCapacity(state)
  for (const [id, need] of Object.entries(bom.recipe)) {
    const per = Math.max(1, need - d.matSave)
    const avail = state.materials[id]?.qty ?? 0
    max = Math.min(max, Math.floor(avail / per))
  }
  return Math.max(0, max)
}

/**
 * 入库并按移动加权平均重算单位成本。
 * 与 actions.addMaterial 保持同一语义：付款与入库在同一步完成。
 */
function addMaterial(state: GameState, id: string, qty: number, unitCost: Money, ignoreCap: boolean, pay: boolean): number {
  const mat = state.materials[id]
  if (!mat) return 0
  const d = derive(state)
  const cap = d.materials[id]?.cap ?? mat.cap
  const added = Math.max(0, ignoreCap ? qty : Math.min(qty, cap - mat.qty))
  if (added <= 0) return 0
  if (pay) state.cash -= added * unitCost
  mat.value += added * unitCost
  mat.qty += added
  return added
}

function nameOf(id: string): string {
  return [...MATERIALS, ...NEW_MATERIALS].find((m) => m.id === id)?.name ?? id
}

const MAT_PRICE: Record<string, number[]> = {
  pkg: [5, 8, 10, 15, 20],
  resin: [10, 15, 20, 30, 40],
  alloy: [20, 30, 40, 60, 80],
  chip: [40, 60, 80, 120, 160],
  comp: [15, 22, 30, 45, 60],
  micro: [50, 75, 100, 150, 200],
}

const PROD_PRICE: Record<Tier, number[]> = {
  low: [40, 50, 60, 70, 80],
  mid: [80, 100, 120, 140, 160],
  high: [160, 200, 240, 280, 320],
  special: [240, 300, 360, 420, 480],
}

function priceAt(id: string, shift: number): Money {
  const arr = MAT_PRICE[id] ?? MAT_PRICE.pkg
  return arr[Math.max(0, Math.min(4, 2 + shift))]
}

export function priceAtProduct(tier: Tier, shift: number): Money {
  const arr = PROD_PRICE[tier]
  return arr[Math.max(0, Math.min(4, 2 + shift))]
}

const TIER_LABEL: Record<Tier, string> = { low: '低端', mid: '中端', high: '高端', special: '特殊' }

function applyResearchSuccess(state: GameState, projectId: string) {
  const def = RND_PROJECTS.find((p) => p.id === projectId)
  if (!def) return
  if (def.kind === 'bom' && def.tier) {
    state.products[def.tier].built = true
    if (def.tier === 'high' || def.tier === 'special') {
      for (const m of NEW_MATERIALS) {
        if (state.materials[m.id]) continue
        state.materials[m.id] = {
          id: m.id,
          supply: 0,
          price: m.basePrice,
          tierShift: 0,
          qty: 0,
          value: 0,
          cap: m.baseCapacity,
          chosenLot: null,
        }
      }
    }
  } else if (def.kind === 'ip' && def.ipId) {
    // 技能树节点：确定性授予固定知产
    if (!state.ipOwned.includes(def.ipId)) state.ipOwned.push(def.ipId)
  }
}

// ────────────────────────────────────────────────────────────
// 董事会目标
// ────────────────────────────────────────────────────────────

export function quarterLedgers(state: GameState): Ledger[] {
  const start = Math.floor((state.month - 1) / 3) * 3 + 1
  return state.ledgers.filter((l) => l.month >= start && l.month <= state.month)
}

function snapshotQuarter(state: GameState): Partial<Record<string, Money>> {
  const q = quarterLedgers(state)
  const qty = q.reduce((a, l) => a + l.orders.concat(l.spots).reduce((x, s) => x + s.qty, 0), 0)
  const cogs = q.reduce((a, l) => a + l.cogs, 0)
  return {
    netProfitQ: q.reduce((a, l) => a + l.netProfit, 0),
    revenueQ: q.reduce((a, l) => a + l.revenue, 0),
    grossProfitQ: q.reduce((a, l) => a + l.grossProfit, 0),
    salaryQ: q.reduce((a, l) => a + l.sellExpense + l.adminExpense + l.rndExpense + l.mfgExpense, 0),
    cashEnd: state.cash,
    netAssetsEnd: equityOf(state),
    debt: state.debt,
    inventory: inventoryValue(state),
    unitCostQ: qty > 0 ? Math.round(cogs / qty) : 0,
    rndStartsQ: state.flags['rndStartsQ'] ?? 0,
    rndSuccessQ: state.flags['rndSuccessQ'] ?? 0,
    capexQ: state.flags['capexQ'] ?? 0,
    agreementsSigned: state.flags['agreementsSigned'] ?? 0,
  }
}

/** 计算某个目标在当前时点的「当前值」。 */
export function goalCurrent(state: GameState, track: GoalTrack | null): number {
  if (!track) return 0
  const def = track.def
  const q = quarterLedgers(state)
  const sum = (f: (l: Ledger) => number) => q.reduce((a, l) => a + f(l), 0)
  const delta = (key: string) => Math.max(0, (state.flags[key] ?? 0) - (state.quarterSnapshot[key] ?? 0))

  switch (def.metric) {
    case 'netProfitQ':
      return sum((l) => l.netProfit)
    case 'revenueQ':
      return sum((l) => l.revenue)
    case 'grossProfitQ':
      return sum((l) => l.grossProfit)
    case 'grossProfitMonths':
      return q.filter((l) => l.grossProfit >= (def.param ?? 0)).length
    case 'demandFillMonths':
      return q.filter((l) => l.demandTotal > 0 && l.demandFilled / l.demandTotal >= (def.param ?? 90) / 100).length
    case 'demandFillBest':
      return Math.round(Math.max(0, ...q.map((l) => (l.demandTotal ? l.demandFilled / l.demandTotal : 0))) * 100)
    case 'cashEnd':
      return state.cash
    case 'netAssetsEnd':
      return equityOf(state)
    case 'debt':
      return state.debt
    case 'staffTotal':
      return Object.values(state.depts).reduce((a, x) => a + x.staff, 0)
    case 'equipmentCount':
      return state.equipment.length
    case 'hiresQ':
      return delta('hiresTotal')
    case 'rndStartsQ':
      return delta('rndStartsQ')
    case 'rndSuccessQ':
      return delta('rndSuccessQ')
    case 'agreementsSigned':
      return delta('agreementsSigned')
    case 'capexQ':
      return delta('capexQ')
    case 'capexOrRndQ':
      return delta('capexQ') + delta('rndStartsQ')
    case 'salaryQ':
      return sum((l) => l.sellExpense + l.adminExpense + l.rndExpense + l.mfgExpense)
    case 'inventory':
      return inventoryValue(state)
    case 'debtToEquity': {
      const eq = equityOf(state)
      return eq > 0 ? Math.round((state.debt / eq) * 100) : 999
    }
    case 'debtToAssets': {
      const b = balanceSheet(state)
      return b.totalAssets > 0 ? Math.round((state.debt / b.totalAssets) * 100) : 999
    }
    case 'highEndShare': {
      const high = q.reduce(
        (a, l) => a + l.orders.concat(l.spots).filter((s) => s.tier === 'high' || s.tier === 'special').reduce((x, s) => x + s.revenue, 0),
        0,
      )
      const total = q.reduce((a, l) => a + l.revenue, 0)
      return total > 0 ? Math.round((high / total) * 100) : 0
    }
    case 'unitCostQ': {
      const qty = q.reduce((a, l) => a + l.orders.concat(l.spots).reduce((x, s) => x + s.qty, 0), 0)
      const cogs = q.reduce((a, l) => a + l.cogs, 0)
      return qty > 0 ? Math.round(cogs / qty) : 0
    }
    default:
      return 0
  }
}

export function checkGoal(track: GoalTrack | null, current: number): boolean {
  if (!track) return false
  const limit = track.limit ?? track.target
  return track.def.compare === 'gte' ? current >= limit : current <= limit
}

/** 目标进度（0–1），供进度条使用。 */
export function goalProgress(track: GoalTrack | null, current: number): number {
  if (!track) return 0
  const t = track.target
  if (track.def.compare === 'lte') {
    if (current <= 0) return 1
    return Math.max(0, Math.min(1, t / Math.max(current, 1)))
  }
  if (t <= 0) return current >= 0 ? 1 : 0
  return Math.max(0, Math.min(1, current / t))
}

export function unitLabel(metric: string): 'w' | '件' | '人' | '%' {
  if (['netProfitQ', 'revenueQ', 'cashEnd', 'netAssetsEnd', 'grossProfitQ', 'debt', 'inventory', 'salaryQ', 'unitCostQ'].includes(metric)) return 'w'
  if (metric === 'staffTotal' || metric === 'hiresQ' || metric === 'equipmentCount') return '人'
  if (metric.endsWith('Months') || metric.endsWith('Q')) return '件'
  return '%'
}

// ────────────────────────────────────────────────────────────
// 终局评分
// ────────────────────────────────────────────────────────────

export function computeScore(state: GameState): ScoreBreakdown {
  const profitSum = state.ledgers.reduce((a, l) => a + l.netProfit, 0)
  const assetsEnd = state.cash + inventoryValue(state) + equipmentNet(state) - state.debt
  // 盈利分：12 个月累计净利润 ÷ 10w；资产分：期末净资产 ÷ 10w
  const profit = Math.round((profitSum / 100) * 1.5)
  const assets = Math.round((assetsEnd / 100) * 1.0)
  const achievement = state.achievements.reduce((a, id) => a + (ACHIEVEMENT_BY_ID[id]?.points ?? 10), 0)
  const total = profit + assets + state.goalPoints + achievement
  return { profit, assets, goal: state.goalPoints, achievement, event: 0, total, netsum: profitSum, assetsEnd }
}

// ────────────────────────────────────────────────────────────
// 推进月份
// ────────────────────────────────────────────────────────────

export function advanceMonth(state: GameState, rng: Rng) {
  state.month += 1

  // 「AP 上限 +1 于下月生效」：先按当前人数重算，再赋值
  const d = derive(state)
  state.apMax = d.apMax
  state.ap = d.apMax
  state.playsMax = d.playsMax
  state.plays = d.playsMax
  state.handMax = d.handMax
  state.drawN = d.drawN
  state.drawM = d.drawM

  // 结转下月的售价修正
  const carry = state.nextMonthPrice
  state.nextMonthPrice = {}

  // 清理月度状态
  state.cardMods = {}
  state.monthMods = carry && Object.keys(carry).length ? mergeMods({ carryoverPrice: carry }) : {}
  state.monthFlags = []
  state.playedThisMonth = []
  state.lotsUsed = 0
  state.plan = { quantities: { low: 0, mid: 0, high: 0, special: 0 }, overtime: false }
  state.salesAlloc = { low: 0, mid: 0, high: 0, special: 0 }
  state.monthLedger = []
  state.declinedOrders = []
  state.acceptedOrders = []
  state.futures = {}
  state.ipChangedThisMonth = false
  state.rndStartsThisMonth = []
  // 研发人员放置为计划层：结算已执行完毕，下月重新放置
  for (const s of Object.values(state.rnd)) s.assigned = 0
  state.eventResolved = false
  state.eventChosen = null
  state.eventSkipped = false
  state.currentEvent = null
  state.boardPrompted = false
  state.flags['cardTrader'] = 0
  state.flags['cardUrgent'] = 0
  state.flags['cardFutures'] = 0
  state.flags['cardClearance'] = 0

  /**
   * 上月挂账的现金收付：只是资产/负债的形态转换，
   * 不产生损益（收益与费用已在挂账当月确认）。
   */
  if (state.pendingIncome) {
    state.cash += state.pendingIncome
    state.pendingIncome = 0
  }
  if (state.pendingCost) {
    state.cash -= state.pendingCost
    state.pendingCost = 0
  }

  for (const ag of state.agreements) ag.monthsLeft -= 1
  state.agreements = state.agreements.filter((a) => a.monthsLeft > 0)
  for (const id of Object.keys(state.materials)) state.materials[id].chosenLot = null

  // 季度切换：气候与经济动能
  if ((state.month - 1) % 3 === 0) {
    const dirRoll = rng.next()
    const dir = dirRoll < 0.7 ? 1 : dirRoll < 0.9 ? 0 : -1
    const stepRoll = rng.next()
    const step = stepRoll < 0.7 ? 1 : stepRoll < 0.9 ? 0 : 2
    void step
    const move = dir * (stepRoll < 0.7 ? 1 : stepRoll < 0.9 ? 0 : 2)
    state.momentum = dir === 1 ? 'expand' : dir === -1 ? 'contract' : 'stall'
    const idx = CLIMATE_ORDER.indexOf(state.climate)
    const nextIdx = ((idx + move) % 6 + 6) % 6
    state.climate = CLIMATE_ORDER[nextIdx]
    state.nextClimateOdds = forecastOdds(nextIdx)
  }

  // 管理卡随人数解锁补入牌库
  syncManagementCards(state)

  state.phase = 'event'
}

function forecastOdds(idx: number): Record<string, number> {
  const names = CLIMATE_ORDER
  const out: Record<string, number> = { recovery: 0, boom: 0, overheat: 0, stagflation: 0, recession: 0, depression: 0 }
  out[names[(idx + 1) % 6]] = 0.7
  out[names[idx]] = 0.2
  out[names[(idx + 2) % 6]] = 0.1
  return out
}

/** 把新解锁的管理卡补入牌库（已拥有则跳过）。 */
export function syncManagementCards(state: GameState) {
  const ownedIds = new Set([...state.deck, ...state.hand, ...state.discard, ...state.playedThisMonth].map((c) => c.defId))
  for (const [id, need] of Object.entries(MGMT_CARD_UNLOCK)) {
    if (state.depts.ops.staff >= need && !ownedIds.has(id)) {
      state.deck.push({ uid: `${id}#mg${state.month}-${state.deck.length}`, defId: id, empowered: false })
    }
  }
}

export { CLIMATE_NAMES, MATERIALS, TIER_LABEL }
