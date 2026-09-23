import type { Climate, GameState, MonthMods, Order, Tier } from './types'

export type CoreScenarioId =
  | 'cheap_low_demand'
  | 'expensive_high_demand'
  | 'order_heavy'
  | 'spot_heavy'
  | 'shared_material_shortage'
  | 'cash_constrained'

export interface CoreScenarioDef {
  id: CoreScenarioId
  name: string
  desc: string
  seed: number
}

export const CORE_SCENARIOS: CoreScenarioDef[] = [
  { id: 'cheap_low_demand', name: '低价·低需求', desc: '原料价格低，市场需求有限。', seed: 1101 },
  { id: 'expensive_high_demand', name: '高价·高需求', desc: '原料价格高，市场需求旺盛。', seed: 2202 },
  { id: 'order_heavy', name: '订单密集', desc: '多个产品层级均有确定性订单。', seed: 3303 },
  { id: 'spot_heavy', name: '现货主导', desc: '没有渠道订单，销售全部依赖现货。', seed: 4404 },
  { id: 'shared_material_shortage', name: '共享原料紧缺', desc: '树脂与合金供应有限，多条产线竞争原料。', seed: 5505 },
  { id: 'cash_constrained', name: '现金受限', desc: '可用现金较少，需要控制采购规模。', seed: 6606 },
]

/** 将核心模式重置为可复现的固定经营局面。 */
export function applyCoreScenario(state: GameState, id: CoreScenarioId) {
  if (state.mode !== 'core') return
  const setup = SCENARIO_SETUP[id]
  state.climate = setup.climate
  state.cash = setup.cash
  state.paidIn = setup.cash
  state.debt = 0
  state.retained = 0
  state.monthMods = setup.mods ?? {}
  state.cardMods = {}
  /** 场景预设订单需要销售团队作为来源：无销售则开局无订单。 */
  state.depts.sell.staff = setup.sellStaff ?? 0
  state.orders = setup.orders.map((o, i) => makeOrder(state, i, o))
  state.acceptedOrders = []
  state.declinedOrders = []
  state.salesAlloc = { low: 0, mid: 0, high: 0, special: 0 }
  state.plan = { quantities: { low: 0, mid: 0, high: 0, special: 0 }, overtime: false }
  state.monthLedger = []
  state.lotsUsed = 0
  for (const mat of Object.values(state.materials)) {
    mat.qty = 0
    mat.value = 0
    mat.chosenLot = null
  }
  for (const product of Object.values(state.products)) {
    product.qty = 0
    product.value = 0
    product.avgCost = 0
  }
}

interface ScenarioSetup {
  climate: Climate
  cash: number
  mods?: MonthMods
  orders: { tier: Tier; qty: number; priceShift?: number }[]
  /** 开局销售人数：为场景预设订单提供「来源」，与人员模型自洽。 */
  sellStaff?: number
}

const SCENARIO_SETUP: Record<CoreScenarioId, ScenarioSetup> = {
  cheap_low_demand: {
    climate: 'depression',
    cash: 600,
    orders: [],
  },
  expensive_high_demand: {
    climate: 'overheat',
    cash: 600,
    orders: [],
  },
  order_heavy: {
    climate: 'boom',
    cash: 600,
    orders: [
      { tier: 'low', qty: 4 },
      { tier: 'mid', qty: 3 },
      { tier: 'high', qty: 2 },
      { tier: 'special', qty: 1 },
    ],
    sellStaff: 4,
  },
  spot_heavy: {
    climate: 'boom',
    cash: 600,
    orders: [],
  },
  shared_material_shortage: {
    climate: 'boom',
    cash: 600,
    mods: {
      materials: {
        resin: { supply: -12, tierShift: 0 },
        alloy: { supply: -6, tierShift: 0 },
      },
    },
    orders: [],
  },
  cash_constrained: {
    climate: 'recovery',
    cash: 250,
    orders: [],
  },
}

function makeOrder(
  state: GameState,
  index: number,
  input: { tier: Tier; qty: number; priceShift?: number },
): Order {
  return {
    id: `scenario-${state.month}-${index}`,
    tier: input.tier,
    qty: input.qty,
    priceShift: input.priceShift ?? 1,
    dueMonth: state.month,
    from: '固定场景',
    forced: false,
  }
}
