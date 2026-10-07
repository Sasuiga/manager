import { TIERS } from '../data/game'
import { derive } from './derive'
import { plannedPurchaseCost, plannedPurchaseLine, planEquipmentCost, productionUnitCosts } from './actions'
import { wagePayableOf } from './game'
import { materialPriceAt, settle, type SettleReport } from './settle'
import type { GameState, Money, Tier } from './types'

export interface ValueRange {
  min: number
  max: number
}

export interface ProductPreview {
  tier: Tier
  planned: number
  orderQty: number
  spotQty: ValueRange
  revenue: ValueRange
  /** 预计毛利（统一口径）：市场单件毛利 ×（订单交付 + 现货预计成交区间） */
  grossProfit: ValueRange
  /** 市场单件毛利 = 市价 − 生产单位成本（计划后库存材料成本 + 固定成本分摊），单位、浮点 */
  unitGrossProfit: number
  /** 订单收入（确定性：订单先于现货结算，两次推演结果相同） */
  orderRevenue: Money
  /** 现货收入区间（现货成交已确定性化，min≡max） */
  spotRevenue: ValueRange
  /** 预计订单毛利 = 单件毛利 × 订单交付量（确定性） */
  orderGrossProfit: Money
  /** 预计现货毛利区间 = 单件毛利 × 现货预计成交区间 */
  spotGrossProfit: ValueRange
}

/**
 * 本期现金计划分解（确定性，不含销售回款与所得税）：
 * 从期初现金（本月月初真值）出发，按资金时间序逐项过账：
 *   行动阶段实付：招聘费 / 杂项支出 / 设备购置 / 还款 / 采购与贸易商实付；
 *   结算时付：采购计划（核心）/ 协议 / 加班 / 研发 / 利息 / 上月工资。
 * 得到「本期期末资金（回款前）」——本期闭环的现金位置（不含结算边界回款到账）。
 * 为负 = 计划超出资金能力。
 *
 * 勾稽不变量：cashOpen + gainedMisc + eventCashIn − (paidHire + paidMisc + paidCapex + paidRepay + paidPurchase) ≡ state.cash
 * （行动阶段所有现金收付均已计入以上科目或挂账字段，无双重计算）。
 */
export interface PreSettleCash {
  /** 期初现金（本月月初真值；含上期挂账收款到账） */
  cashOpen: Money
  /** 招聘费净额（招聘实付 − 裁员返还），行动阶段实付 */
  paidHire: Money
  /** 杂项支出（卡牌费/协议手续费/供应商开发/事件服务费），行动阶段实付 */
  paidMisc: Money
  /** 事件现金赠与（含赠与设备公允价值，非现金部分），行动阶段实收 */
  gainedMisc: Money
  /** 事件直接收到、不计损益的现金（如 X10 政府纾困无息贷款：负债侧已挂 pendingCost），行动阶段实收 */
  eventCashIn: Money
  /** 设备购置（资本化：商店 + 事件对价），行动阶段实付 */
  paidCapex: Money
  /** 还款（资本性支出），行动阶段实付 */
  paidRepay: Money
  /** 采购/贸易商采购实付（完整模式采购行动阶段入账；核心模式仅贸易商实付，普通采购为计划） */
  paidPurchase: Money
  /** 采购计划（核心模式结算时付；完整模式为 0） */
  purchasePlan: Money
  /** 设备购置计划（核心模式结算时付；完整模式为 0） */
  equipmentPlan: Money
  /** 协议自动采购额（按结算执行同规则确定性模拟） */
  agreementSpend: Money
  /** 加班费 */
  overtimePay: Money
  /** 研发投入（结算实付） */
  rndInvest: Money
  /** 借款利息 */
  interest: Money
  /** 上月工资实付（当月计提、次月实付） */
  wagePaid: Money
  /** = cashOpen + gainedMisc + eventCashIn − (paidHire + paidMisc + paidCapex + paidRepay + paidPurchase + purchasePlan + equipmentPlan + agreementSpend + overtimePay + rndInvest + interest + wagePaid)；为负 = 计划超出资金能力 */
  cashAfter: Money
}

export function preSettleCash(state: GameState): PreSettleCash {
  const d = derive(state)
  /** 行动阶段实付/实收：各已记入账目或台账，此处只汇总不重复记账。 */
  type LedgerRow = (typeof state.monthLedger)[number]
  const ledgerSpend = (match: (row: LedgerRow) => boolean): Money =>
    state.monthLedger.filter(match).reduce((a, row) => a + row.creditAmt, 0)
  const paidHire = Object.values(state.hireFeeBy).reduce((a, v) => a + v, 0)
  const paidMisc = state.miscExpense
  const gainedMisc = state.miscIncome
  const eventCashIn = state.eventCashGift
  const paidCapex = ledgerSpend((row) => row.item.startsWith('设备购置'))
  const paidRepay = ledgerSpend((row) => row.item === '还款')
  /** 采购实付：普通采购（完整模式）+ 贸易商采购；协议手续费/供应商开发在 paidMisc，不重复计。 */
  const paidPurchase = ledgerSpend(
    (row) => row.dept === 'buy' && (row.item.startsWith('采购') || row.item.startsWith('贸易商采购')),
  )
  /** 采购计划：核心模式尚未付款（结算时付）；完整模式已实付，记在 paidPurchase。 */
  const purchasePlan = state.mode === 'core' ? plannedPurchaseCost(state) : 0
  /** 设备购置计划：核心模式尚未付款（结算时资本化）；完整模式为 0。 */
  const equipmentPlan = state.mode === 'core' ? planEquipmentCost(state) : 0
  /** 加班费：安排时已发生支付（state.overtimePaid），桥接按锁定额计。 */
  const overtimePay = state.overtimePaid
  const rndInvest = Math.max(0, d.rndCostTotal)
  const interest = d.interest
  const wagePaid = wagePayableOf(state)
  /**
   * 协议自动采购的确定性模拟：与结算执行同规则（仓库容量上限 + 回款前现金检查，不足则整月跳过）。
   * 核心模式采购计划尚未付款，现金基础先扣计划支出；完整模式采购已实付（在 paidPurchase），不再重复扣。
   *
   * 仓容口径：结算时采购计划先入库、协议后执行，因此协议的可用仓容要按「计划后库存」计算；
   * 完整模式采购已在行动时入库，直接按当前库存计算。
   */
  const cashBase = state.cash - purchasePlan - equipmentPlan
  let cash = cashBase
  let agreementSpend = 0
  for (const ag of state.agreements) {
    if (ag.monthsLeft <= 0) continue
    const unit = materialPriceAt(ag.materialId, ag.priceTierShift)
    const cap = d.materials[ag.materialId]?.cap ?? state.materials[ag.materialId]?.cap ?? 0
    const planQty = state.mode === 'core' ? plannedPurchaseLine(state, ag.materialId).qty : 0
    const room = Math.max(0, cap - state.materials[ag.materialId].qty - planQty)
    const want = Math.min(ag.qty, room)
    if (want <= 0) continue
    if (cash < unit * want) continue
    cash -= unit * want
    agreementSpend += unit * want
  }
  const cashAfter =
    state.openingCash +
    gainedMisc +
    eventCashIn -
    (paidHire +
      paidMisc +
      paidCapex +
      paidRepay +
      paidPurchase +
      purchasePlan +
      equipmentPlan +
      agreementSpend +
      overtimePay +
      rndInvest +
      interest +
      wagePaid)
  return {
    cashOpen: state.openingCash,
    paidHire,
    paidMisc,
    gainedMisc,
    eventCashIn,
    paidCapex,
    paidRepay,
    paidPurchase,
    purchasePlan,
    equipmentPlan,
    agreementSpend,
    overtimePay,
    rndInvest,
    interest,
    wagePaid,
    cashAfter,
  }
}

/**
 * 下期挂账负债（确定性部分）：本期方案已承诺、下期确定要动现金的项目。
 * 应付职工薪酬 = 本月计提、下期结算实付（取预演结算后账面）；
 * 借款利息按当前借款水平估算（下期借还会变，仅作参考）；
 * 挂账收付为事件跨月挂账，下期期初直接收/付。
 */
export interface NextPeriodLiabilities {
  /** 应付职工薪酬：本月计提额，下期结算实付 */
  wagePayable: Money
  /** 借款利息（按当前借款水平估算） */
  interestEstimate: Money
  /** 挂账支出（下期期初支付） */
  pendingCost: Money
  /** 挂账收入（下期期初到账） */
  pendingIncome: Money
  /** 净挂账负债 = wagePayable + interestEstimate + pendingCost − pendingIncome */
  net: Money
}

export interface OperatingPreview {
  revenue: ValueRange
  grossProfit: ValueRange
  cashEnd: ValueRange
  /** 下期挂账负债：供预算页估算下期资金缺口 */
  nextLiabilities: NextPeriodLiabilities
  orderRevenue: Money
  spotRevenue: ValueRange
  cogs: ValueRange
  currentCash: Money
  /** 结算前·纯消耗段（确定性，不含回款与所得税） */
  preSettle: PreSettleCash
  /** 结算后·所得税区间（依赖回款，无应税利润时为 0） */
  tax: ValueRange
  purchaseSpend: Money
  plannedProduction: number
  capacityUsed: number
  capacityTotal: number
  orderQty: number
  spotQty: ValueRange
  salesResourceUsed: number
  salesResourceTotal: number
  products: ProductPreview[]
  /** 本月研发结果（确定性，与预演区间无关） */
  rnd: SettleReport['rnd']
}

/**
 * 只读推演当前合法经营方案。通过克隆状态运行正式结算，保证预演与结算口径一致。
 * 现货需求按公开需求 100% 结算（核心模式与完整模式一致，结果确定，区间 min≡max）。
 */
export function previewOperations(state: GameState): OperatingPreview {
  const report = settle(cloneState(state))
  const low = report
  const high = report
  const d = derive(state)
  const preSettle = preSettleCash(state)
  const purchaseSpend = preSettle.purchasePlan + preSettle.paidPurchase

  /** 下期挂账负债：应付职工薪酬取预演结算后的账面计提（本月工资，下月实付）。 */
  const nextLiabilities: NextPeriodLiabilities = {
    wagePayable: low.balance.wagePayable,
    interestEstimate: d.interest,
    pendingCost: state.pendingCost,
    pendingIncome: state.pendingIncome,
    net: 0,
  }
  nextLiabilities.net = nextLiabilities.wagePayable + nextLiabilities.interestEstimate + nextLiabilities.pendingCost - nextLiabilities.pendingIncome

  const orderRevenue = revenueOf(low.sales.orders)
  const lowSpotRevenue = revenueOf(low.sales.spots)
  const highSpotRevenue = revenueOf(high.sales.spots)
  const orderQty = qtyOf(low.sales.orders)
  const lowSpotQty = qtyOf(low.sales.spots)
  const highSpotQty = qtyOf(high.sales.spots)

  /** 统一口径：市场单件毛利 = 市价 − 生产单位成本（计划后库存材料成本 + 固定成本分摊） */
  const unitCosts = productionUnitCosts(state)
  const unitGrossProfit = (t: Tier): number => d.price[t] - unitCosts.tiers[t].total
  const grossAt = (qtyBy: Record<Tier, number>): number =>
    TIERS.reduce((sum, t) => sum + unitGrossProfit(t) * (qtyBy[t] ?? 0), 0)
  const qtyLow: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  const qtyHigh: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) {
    const orders = qtyOf(low.sales.orders.filter((s) => s.tier === t))
    qtyLow[t] = orders + qtyOf(low.sales.spots.filter((s) => s.tier === t))
    qtyHigh[t] = orders + qtyOf(high.sales.spots.filter((s) => s.tier === t))
  }

  const products = TIERS.map((tier) => productPreview(state, tier, low, high, unitGrossProfit(tier)))
    .filter((p) => p.planned > 0 || p.orderQty > 0 || p.spotQty.max > 0)

  return {
    revenue: range(low.ledger.revenue, high.ledger.revenue),
    grossProfit: range(grossAt(qtyLow), grossAt(qtyHigh)),
    cashEnd: range(low.ledger.cashEnd, high.ledger.cashEnd),
    orderRevenue,
    spotRevenue: range(lowSpotRevenue, highSpotRevenue),
    cogs: range(low.ledger.cogs, high.ledger.cogs),
    currentCash: state.cash,
    rnd: low.rnd,
    preSettle,
    nextLiabilities,
    /** 所得税随回款区间浮动（无应税利润时为 0），只属于「结算后」段。 */
    tax: range(low.ledger.parts['所得税'] ?? 0, high.ledger.parts['所得税'] ?? 0),
    purchaseSpend,
    plannedProduction: TIERS.reduce((sum, t) => sum + state.plan.quantities[t], 0),
    capacityUsed: TIERS.reduce((sum, t) => sum + state.plan.quantities[t], 0),
    capacityTotal: low.production.capacity,
    orderQty,
    spotQty: range(lowSpotQty, highSpotQty),
    salesResourceUsed: TIERS.reduce((sum, t) => sum + state.salesAlloc[t], 0),
    salesResourceTotal: d.salesResource,
    products,
  }
}

function productPreview(
  state: GameState,
  tier: Tier,
  low: SettleReport,
  high: SettleReport,
  unitGross: number,
): ProductPreview {
  const lowOrders = low.sales.orders.filter((s) => s.tier === tier)
  const highOrders = high.sales.orders.filter((s) => s.tier === tier)
  const lowSpots = low.sales.spots.filter((s) => s.tier === tier)
  const highSpots = high.sales.spots.filter((s) => s.tier === tier)
  const lowSales = [...lowOrders, ...lowSpots]
  const highSales = [...highOrders, ...highSpots]
  const orderRevenue = revenueOf(lowOrders)
  const lowSpotRevenue = revenueOf(lowSpots)
  const highSpotRevenue = revenueOf(highSpots)
  const orderQty = qtyOf(lowOrders)
  const lowSpotQty = qtyOf(lowSpots)
  const highSpotQty = qtyOf(highSpots)
  return {
    tier,
    planned: state.plan.quantities[tier],
    orderQty,
    spotQty: range(lowSpotQty, highSpotQty),
    revenue: range(revenueOf(lowSales), revenueOf(highSales)),
    grossProfit: range(unitGross * (orderQty + lowSpotQty), unitGross * (orderQty + highSpotQty)),
    unitGrossProfit: unitGross,
    orderRevenue,
    spotRevenue: range(lowSpotRevenue, highSpotRevenue),
    orderGrossProfit: unitGross * orderQty,
    spotGrossProfit: range(unitGross * lowSpotQty, unitGross * highSpotQty),
  }
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState
}

function range(a: number, b: number): ValueRange {
  return { min: Math.min(a, b), max: Math.max(a, b) }
}

function qtyOf(rows: { qty: number }[]): number {
  return rows.reduce((sum, row) => sum + row.qty, 0)
}

function revenueOf(rows: { revenue: Money }[]): Money {
  return rows.reduce((sum, row) => sum + row.revenue, 0)
}
