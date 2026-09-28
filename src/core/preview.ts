import { OVERTIME_COST, TIERS } from '../data/game'
import { derive } from './derive'
import { plannedPurchaseCost, plannedPurchaseLine, productionUnitCosts } from './actions'
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
  /** 现货收入区间（核心模式现货成交不确定） */
  spotRevenue: ValueRange
  /** 预计订单毛利 = 单件毛利 × 订单交付量（确定性） */
  orderGrossProfit: Money
  /** 预计现货毛利区间 = 单件毛利 × 现货预计成交区间 */
  spotGrossProfit: ValueRange
}

/**
 * 结算前·纯消耗分解（确定性，不含销售回款与所得税）：
 * 从月初现金出发，按结算执行顺序逐项扣除，得到「回款尚未到账」时的现金。
 * 为负 = 计划的纯消耗超出月初资金能力。
 */
export interface PreSettleCash {
  /** 月初现金余额 */
  cashBegin: Money
  /** 采购付款：核心模式为采购计划（结算时付），完整模式为已实付采购 */
  purchaseSpend: Money
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
  /** = cashBegin − 以上全部；为负 = 计划超出资金能力 */
  cashAfter: Money
}

export function preSettleCash(state: GameState): PreSettleCash {
  const d = derive(state)
  const purchaseSpend = state.mode === 'core'
    ? plannedPurchaseCost(state)
    : state.monthLedger
      .filter((row) => row.dept === 'buy' && row.credit === '现金')
      .reduce((sum, row) => sum + row.creditAmt, 0)
  const overtimePay = state.plan.overtime && state.depts.make.staff >= 3 ? OVERTIME_COST : 0
  const rndInvest = Math.max(0, d.rndCostTotal)
  const interest = d.interest
  const wagePaid = wagePayableOf(state)
  /**
   * 协议自动采购的确定性模拟：与结算执行同规则（仓库容量上限 + 回款前现金检查，不足则整月跳过）。
   * 核心模式采购计划尚未付款，现金基础先扣计划支出；完整模式采购已实付，不再重复扣。
   *
   * 仓容口径：结算时采购计划先入库、协议后执行，因此协议的可用仓容要按「计划后库存」计算；
   * 完整模式采购已在行动时入库，直接按当前库存计算。
   */
  const cashBase = state.cash - (state.mode === 'core' ? purchaseSpend : 0)
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
    cashBase -
    agreementSpend -
    overtimePay -
    rndInvest -
    interest -
    wagePaid
  return { cashBegin: state.cash, purchaseSpend, agreementSpend, overtimePay, rndInvest, interest, wagePaid, cashAfter }
}

export interface OperatingPreview {
  revenue: ValueRange
  grossProfit: ValueRange
  cashEnd: ValueRange
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

const LOW_FACTORS: Record<Tier, number> = { low: 0.5, mid: 0.5, high: 0.5, special: 0.5 }
const HIGH_FACTORS: Record<Tier, number> = { low: 1, mid: 1, high: 1, special: 1 }

/**
 * 只读推演当前合法经营方案。通过克隆状态运行正式结算，保证预演与结算口径一致。
 * 核心模式现货需求区间为公开需求的 50%～100%。
 */
export function previewOperations(state: GameState): OperatingPreview {
  const low = settle(cloneState(state), { spotDemandFactor: state.mode === 'core' ? LOW_FACTORS : HIGH_FACTORS })
  const high = settle(cloneState(state), { spotDemandFactor: HIGH_FACTORS })
  const d = derive(state)
  const preSettle = preSettleCash(state)
  const purchaseSpend = preSettle.purchaseSpend

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
