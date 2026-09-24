import { TIERS } from '../data/game'
import { derive } from './derive'
import { plannedPurchaseCost } from './actions'
import { settle, type SettleReport } from './settle'
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
  grossProfit: ValueRange
}

export interface OperatingPreview {
  revenue: ValueRange
  grossProfit: ValueRange
  cashEnd: ValueRange
  orderRevenue: Money
  spotRevenue: ValueRange
  cogs: ValueRange
  currentCash: Money
  monthEndPayments: ValueRange
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
  const purchaseSpend = state.mode === 'core'
    ? plannedPurchaseCost(state)
    : state.monthLedger
      .filter((row) => row.dept === 'buy' && row.credit === '现金')
      .reduce((sum, row) => sum + row.creditAmt, 0)

  const products = TIERS.map((tier) => productPreview(state, tier, low, high))
    .filter((p) => p.planned > 0 || p.orderQty > 0 || p.spotQty.max > 0)

  const orderRevenue = revenueOf(low.sales.orders)
  const lowSpotRevenue = revenueOf(low.sales.spots)
  const highSpotRevenue = revenueOf(high.sales.spots)
  const orderQty = qtyOf(low.sales.orders)
  const lowSpotQty = qtyOf(low.sales.spots)
  const highSpotQty = qtyOf(high.sales.spots)

  return {
    revenue: range(low.ledger.revenue, high.ledger.revenue),
    grossProfit: range(low.ledger.grossProfit, high.ledger.grossProfit),
    cashEnd: range(low.ledger.cashEnd, high.ledger.cashEnd),
    orderRevenue,
    spotRevenue: range(lowSpotRevenue, highSpotRevenue),
    cogs: range(low.ledger.cogs, high.ledger.cogs),
    currentCash: state.cash,
    rnd: low.rnd,
    monthEndPayments: range(
      state.cash - purchaseSpend + low.ledger.revenue - low.ledger.cashEnd,
      state.cash - purchaseSpend + high.ledger.revenue - high.ledger.cashEnd,
    ),
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

function productPreview(state: GameState, tier: Tier, low: SettleReport, high: SettleReport): ProductPreview {
  const lowOrders = low.sales.orders.filter((s) => s.tier === tier)
  const highOrders = high.sales.orders.filter((s) => s.tier === tier)
  const lowSpots = low.sales.spots.filter((s) => s.tier === tier)
  const highSpots = high.sales.spots.filter((s) => s.tier === tier)
  const lowSales = [...lowOrders, ...lowSpots]
  const highSales = [...highOrders, ...highSpots]
  return {
    tier,
    planned: state.plan.quantities[tier],
    orderQty: qtyOf(lowOrders),
    spotQty: range(qtyOf(lowSpots), qtyOf(highSpots)),
    revenue: range(revenueOf(lowSales), revenueOf(highSales)),
    grossProfit: range(
      revenueOf(lowSales) - costOf(lowSales),
      revenueOf(highSales) - costOf(highSales),
    ),
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

function costOf(rows: { cost?: Money; qty: number; unitCost: Money }[]): Money {
  return rows.reduce((sum, row) => sum + (row.cost ?? row.qty * row.unitCost), 0)
}
