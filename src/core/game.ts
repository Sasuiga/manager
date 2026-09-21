import {
  BASE_AP,
  BASE_SALES_RESOURCE,
  BOMS,
  CARD_BY_ID,
  CARDS,
  CLIMATE_MATERIAL,
  CLIMATE_NAMES,
  CLIMATE_ORDER,
  IP_BY_ID,
  MATERIALS,
  MGMT_CARD_UNLOCK,
  NEW_MATERIALS,
  RND_PROJECTS,
  START_CASH,
  TIERS,
  priceOf,
} from '../data/game'
import { derive } from './derive'
import { Rng } from './rng'
import type {
  BalanceSheet,
  CardInstance,
  Climate,
  Dept,
  GameState,
  Momentum,
  Money,
} from './types'

/** 构建一局新游戏。 */
export function newGame(seed: number): GameState {
  const rng = new Rng(seed)
  const climate = CLIMATE_ORDER[rng.int(6)]
  const state: GameState = {
    seed,
    rngState: rng.state,
    month: 1,
    phase: 'title',
    climate,
    momentum: 'stall',
    nextClimateOdds: blankOdds(),

    cash: START_CASH,
    debt: 0,
    paidIn: START_CASH,
    ownerCapital: 50, // 开局以实物投入一台产能 10 的产线
    prepaid: 0,
    retained: 0,

    ap: BASE_AP,
    apMax: BASE_AP,
    plays: 2,
    playsMax: 2,
    handMax: 5,
    drawN: 5,
    drawM: 3,

    depts: {
      ops: { staff: 0, hired: 0 },
      buy: { staff: 0, hired: 0 },
      make: { staff: 0, hired: 0 },
      sell: { staff: 0, hired: 0 },
      rnd: { staff: 0, hired: 0 },
    },

    materials: Object.fromEntries(
      MATERIALS.map((m) => [
        m.id,
        {
          id: m.id,
          supply: m.baseSupply,
          price: priceOf(m, climateShift(climate, m.id)),
          tierShift: climateShift(climate, m.id),
          qty: 0,
          value: 0,
          cap: m.baseCapacity,
          chosenLot: null,
        },
      ]),
    ),

    products: Object.fromEntries(
      TIERS.map((t) => [t, { tier: t, built: t === 'low', qty: 0, value: 0, avgCost: 0 }]),
    ) as GameState['products'],

    equipment: [
      { id: 'eq-0', name: '初始产线', capacity: 10, depreciation: 20, creditLine: 50, cost: 50, accumulated: 0, purchasedAt: 1 },
    ],

    salesResource: BASE_SALES_RESOURCE,
    salesAlloc: { low: 0, mid: 0, high: 0, special: 0 },
    orders: [],
    declinedOrders: [],
    acceptedOrders: [],

    rnd: Object.fromEntries(RND_PROJECTS.map((p) => [p.id, { projectId: null, progress: 0, done: false }])),
    ipOwned: [],
    ipActive: [null],
    ipChangedThisMonth: false,
    materialsDeveloped: Object.fromEntries(NEW_MATERIALS.map((m) => [m.id, 0])),
    agreements: [],
    futures: {},
    extraBuys: [],
    lotsUsed: 0,
    plan: { tier: 'low', qty: 0, overtime: false },
    pendingIncome: 0,
    pendingCost: 0,
    nextMonthPrice: {},
    rndStartsThisMonth: [],
    miscExpense: 0,
    miscIncome: 0,

    deck: [],
    hand: [],
    discard: [],
    drawn: [],
    drawnSelected: [],
    playedThisMonth: [],
    monthMods: {},
    cardMods: {},
    monthFlags: [],

    currentEvent: null,
    eventResolved: false,
    eventChosen: null,
    eventSkipped: false,

    basicGoal: null,
    challengeGoal: null,
    challengeOffered: [],
    boardPrompted: false,
    misses: 0,
    goalPoints: 0,
    goalHistory: [],
    quarterSnapshot: {},

    ledgers: [],
    balanceHistory: [],
    log: [],

    result: 'playing',
    score: { profit: 0, assets: 0, goal: 0, achievement: 0, event: 0, total: 0, netsum: 0, assetsEnd: 0 },
    achievements: [],
    flags: {},
  }

  buildDeck(state, rng)
  // 起始手牌由 enterDraw 统一按「五选三」抽牌，这里不再预置 3 张
  void rng
  return state
}

function climateShift(climate: Climate, matId: string): number {
  return CLIMATE_MATERIAL[climate].tierShift[matId] ?? 0
}

function blankOdds(): Record<Climate, number> {
  return { recovery: 0, boom: 0, overheat: 0, stagflation: 0, recession: 0, depression: 0 }
}

/** 按部门人数加权构建本局牌库（§5.3）。 */
export function buildDeck(state: GameState, rng: Rng) {
  const deck: CardInstance[] = []
  let seq = 0
  const push = (defId: string) => deck.push({ uid: `${defId}#${seq++}`, defId, empowered: false })

  for (const kind of ['buy', 'make', 'sell', 'rnd'] as Dept[]) {
    const pool = CARDS.filter((c) => c.kind === kind)
    const core = pool.filter((c) => c.core)
    const normal = pool.filter((c) => !c.core)
    for (const c of core) {
      push(c.id)
      push(c.id)
    }
    for (const c of rng.sample(normal, 6)) push(c.id)
  }

  // 管理卡按管理人数解锁
  const ops = state.depts.ops.staff
  for (const [id, need] of Object.entries(MGMT_CARD_UNLOCK)) {
    if (ops >= need) push(id)
  }

  // 洗牌
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  state.deck = deck
}



/** 部门人员基础值与解锁效果的展示文本，供 UI 直接使用。 */
export function creditInfo(state: GameState) {
  const d = derive(state)
  return { line: d.creditLine, used: state.debt, available: d.creditAvailable, noBorrow: d.noBorrow }
}

export function monthlyRndCost(state: GameState): Money {
  return derive(state).rndCostTotal
}

export { derive as deriveState }

/**
 * 所有者权益合计。
 *
 * 借款是负债，已在资产负债表右侧单独列示，绝不能再从权益里扣一次，
 * 否则「借多少、权益就少多少」，而资产侧却按现金全额增加，
 * 恒等式 资产 = 负债 + 所有者权益 会永久性失衡。
 */
export function equityOf(state: GameState): Money {
  return state.paidIn + state.ownerCapital + state.retained
}

/** 净资产 = 所有者权益（借款已在负债列示，不重复扣减）。 */
export function netAssets(state: GameState): Money {
  return equityOf(state)
}

/** 存货账面价值（原料 + 成品），直接取账面数，不做二次换算。 */
export function inventoryValue(state: GameState): Money {
  let v = 0
  for (const id of Object.keys(state.materials)) v += state.materials[id].value
  for (const t of TIERS) v += state.products[t].value
  return v
}

/**
 * 设备净值 = Σ max(0, 原值 − 累计折旧)。
 * 折旧在提足原值时停止，账面价值不会变负；这里再取一次下界，
 * 保证任何历史状态读出来的净值都不会是负数。
 */
export function equipmentNet(state: GameState): Money {
  return state.equipment.reduce((a, e) => a + Math.max(0, e.cost - e.accumulated), 0)
}

export function totalAssets(state: GameState): Money {
  return state.cash + inventoryValue(state) + equipmentNet(state) + state.pendingIncome
}

export function balanceSheet(state: GameState): BalanceSheet {
  let matv = 0
  for (const id of Object.keys(state.materials)) matv += state.materials[id].value
  let prodv = 0
  for (const t of TIERS) prodv += state.products[t].value
  const grossEquip = state.equipment.reduce((a, e) => a + e.cost, 0)
  const accum = state.equipment.reduce((a, e) => a + Math.min(e.accumulated, e.cost), 0)
  const netEquip = equipmentNet(state)
  return {
    cash: state.cash,
    inventoryMaterial: matv,
    inventoryProduct: prodv,
    prepaid: state.prepaid,
    equipmentGross: grossEquip,
    equipmentAccum: accum,
    totalAssets: state.cash + matv + prodv + netEquip + state.pendingIncome,
    debt: state.debt + state.pendingCost,
    equity: equityOf(state),
    retained: state.retained,
    paidIn: state.paidIn,
    ownerCapital: state.ownerCapital,
  }
}

/** 一句话描述当前局势，用于日志与终局页。 */
export function climateLine(state: GameState): string {
  return `${CLIMATE_NAMES[state.climate]}`
}

export function ipName(id: string | null): string {
  return id ? (IP_BY_ID[id]?.name ?? '—') : '（空槽）'
}

export function cardName(id: string): string {
  return CARD_BY_ID[id]?.name ?? id
}

export function bomName(t: string): string {
  return BOMS[t as keyof typeof BOMS]?.name ?? t
}

export function sumMoney(...v: Money[]): Money {
  return v.reduce((a, b) => a + b, 0)
}

export { Momentum }
