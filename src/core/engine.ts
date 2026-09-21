import {
  CLIMATE_NAMES,
  CLIMATE_ORDER,
  EVENTS,
  GOAL_POOL,
  MATERIALS,
  NEW_MATERIALS,
  OPENING_BASIC,
  OPENING_CHALLENGE,
} from '../data/game'
import { derive, mergeMods } from './derive'
import { Rng } from './rng'
import { advanceMonth as advanceMonthCore, goalCurrent, settle, syncManagementCards } from './settle'
// 再导出（export { x } from）不会在本模块作用域引入名字，内部复用需单独 import
import { pushLog, drawCards as drawCardsAction } from './actions'
import type { SettleReport } from './settle'
import type { Climate, GameEventDef, GameState, GoalDef, GoalTrack, Ledger, Money } from './types'

export * from './types'
export { derive, mergeMods } from './derive'
export { newGame, balanceSheet, inventoryValue, netAssets, equipmentNet, equityOf, buildDeck } from './game'
export { goalCurrent, checkGoal, goalProgress, computeScore, unitLabel, quarterLedgers } from './settle'
export type { SettleReport } from './settle'
export {
  hire,
  hireCost,
  canHire,
  fire,
  drawCards,
  toggleDrawn,
  confirmDraw,
  discardCard,
  playCard,
  canPlay,
  cardPlayCost,
  drawToHand,
  buyMaterial,
  lotQty,
  lotPrice,
  lotLabel,
  traderOffer,
  buyFromTrader,
  signAgreement,
  cancelAgreement,
  agreementSlots,
  developSupplier,
  buyEquipment,
  setPlan,
  planCapacity,
  maxProducible,
  toggleOvertime,
  setAlloc,
  allocUsed,
  startResearch,
  activeResearch,
  ipSlots,
  activateIp,
  deactivateIp,
  borrow,
  repay,
  applyEventOption,
  skipEvent,
  acceptChance,
  pushLog,
  cardCtx,
  addMaterial,
} from './actions'

/** 事件池构建与抽取（§3.2）：当季 8 张 + 相邻气候各 2 张 + 其他各 1 张。 */
export function buildEventPool(state: GameState, _rng: Rng): GameEventDef[] {
  const idx = CLIMATE_ORDER.indexOf(state.climate)
  const isEnd = idx === 0 || idx === 5
  const weights: { ev: GameEventDef; w: number }[] = []
  for (const ev of EVENTS) {
    const evIdx = CLIMATE_ORDER.indexOf(ev.climate)
    const dist = Math.min((evIdx - idx + 6) % 6, (idx - evIdx + 6) % 6)
    let w = 1
    if (dist === 0) w = isEnd ? 9 : 8
    else if (dist === 1) w = 2
    weights.push({ ev, w })
  }
  return weights.flatMap(({ ev, w }) => Array<GameEventDef>(w).fill(ev))
}

/** 开局：进入第 1 个月的事件阶段（第 1 月即季度首月，召开董事会）。 */
export function startGame(state: GameState) {
  state.phase = 'board'
  state.boardPrompted = false
  maybeDrawBoardGoals(state, new Rng(state.seed * 31 + 7))
}

/** 抽取本季度董事会目标（§4.2 / §4.4）。 */
export function drawBoardGoals(state: GameState, rng: Rng) {
  const quarter = Math.ceil(state.month / 3)
  const isFirst = quarter === 1
  if (isFirst) {
    const basicDef = rng.pick(OPENING_BASIC)
    const offered = rng.sample(OPENING_CHALLENGE, 2)
    state.basicGoal = makeTrack(state, basicDef)
    // 挑战目标以基本目标为基数，必须在 basicGoal 赋值之后再算
    state.challengeOffered = offered.map((d) => makeTrack(state, d))
    state.challengeGoal = null
  } else {
    const pool = GOAL_POOL[state.climate as Climate]
    const basicDef = rng.pick(pool.basic)
    const offered = rng.sample(pool.challenge, 2)
    state.basicGoal = makeTrack(state, basicDef)
    state.challengeOffered = offered.map((d) => makeTrack(state, d))
    state.challengeGoal = null
  }
  state.flags['hiresTotal'] = Object.values(state.depts).reduce((a, d) => a + d.hired, 0)
  state.boardPrompted = false
  if (state.basicGoal) {
    pushLog(state, 'board', `本季度基本目标：${state.basicGoal.def.name}`, [
      state.basicGoal.def.desc,
      `目标值 ${state.basicGoal.target} · 奖励 ${state.basicGoal.def.points} 分`,
      '连续两个季度未达成将被免职',
    ])
  }
}

/** 仅当处于季度首月（每月 1/4/7/10）时才应召开董事会。 */
function isQuarterStart(state: GameState) {
  return (state.month - 1) % 3 === 0
}

/** 每月进入 event 阶段前调用：季度首月抽取新目标，否则沿用本季度已有目标。 */
export function maybeDrawBoardGoals(state: GameState, rng: Rng) {
  if (isQuarterStart(state)) drawBoardGoals(state, rng)
}

/**
 * 把目标定义换算成本季度的具体目标值。
 *
 * 三种基准来源：
 *  - `value`：固定值；
 *  - `growth`：以上季度快照的同指标为基数（本季气候正常时应当增长）；
 *  - `ratioFromBasic`：以**本季度基本目标**的目标值为基数——
 *    必须在基本目标定下来之后再算，否则目标值会退化成 0，白送分。
 */
function makeTrack(state: GameState, def: GoalDef): GoalTrack {
  const snap = state.quarterSnapshot
  const prev = (key: string) => snap[key as keyof typeof snap] ?? 0

  if (def.ratioFromBasic !== undefined) {
    const b = state.basicGoal?.target ?? 0
    return { def, target: Math.round(b * def.ratioFromBasic) }
  }
  if (def.growth) {
    const base = prev(def.growth.base)
    const target = Math.round(base * def.growth.factor) + (def.growth.plus ?? 0)
    return { def, target: Math.max(def.growth.plus ?? 0, target) }
  }
  return { def, target: def.value ?? 0 }
}

/** 选定挑战目标。 */
export function chooseChallenge(state: GameState, index: number) {
  const t = state.challengeOffered[index]
  if (!t) return
  state.challengeGoal = t
  state.challengeOffered = []
  pushLog(state, 'board', `接受挑战目标：${t.def.name}`, [
    `目标值 ${t.target}`,
    `奖励 ${t.def.points} 分`,
  ])
}

/** 生成并进入本月事件。 */
export function beginMonthEvent(state: GameState) {
  const rng = Rng.fromState(state.rngState)
  const ev = drawEvent(state, rng)
  state.phase = 'event'
  state.rngState = rng.state
  state.currentEvent = ev
  state.eventResolved = false
  state.eventChosen = null
  state.eventSkipped = false

  // 即时事件：抽到即结算
  if (ev.type === 'instant') {
    if (ev.mods) {
      state.monthMods = mergeMods(state.monthMods, ev.mods)
    }
    state.eventResolved = true
  }
}

function drawEvent(state: GameState, rng: Rng): GameEventDef {
  const pool = buildEventPool(state, rng)
  if (!pool.length) return EVENTS[0]
  const ev = pool[rng.int(pool.length)]
  return ev
}

/**
 * 事件确认后进入抽卡阶段：每月开始独立的一次活动，先于经营布局。
 * 月度同步（AP/打牌数/手牌/抽牌参数）与渠道订单都在这里完成。
 */
export function enterDraw(state: GameState) {
  state.phase = 'draw'
  const d = derive(state)
  state.apMax = d.apMax
  state.playsMax = d.playsMax
  state.handMax = d.handMax
  state.drawN = d.drawN
  state.drawM = d.drawM
  // 每月销售资源重置
  state.salesAlloc = { low: 0, mid: 0, high: 0, special: 0 }
  // 本月订单（渠道带来）
  generateMonthlyOrders(state)
  // 开局（第 1 月）起始手牌已由 newGame 预置，跳过再抽一次
  if (state.drawn.length > 0) return
  // 常规每月：直接抽 N 张，让玩家一次看到全部 N 张选 M 张
  openDraw(state)
}

/**
 * 抽 N 张到「待选」区，按本月部门人数加权；未选中的 N-M 张
 * 确认时放回牌库。仅在开局预置的起始手牌之外使用。
 *
 * 与 actions.drawCards 行为完全一致：复用其实现。
 */
export function openDraw(state: GameState) {
  drawCardsAction(state)
}

/** 抽卡确认后进入经营阶段。 */
export function enterOperate(state: GameState) {
  state.phase = 'operate'
}

/** 按月生成渠道订单（§7.2.6）。 */
export function generateMonthlyOrders(state: GameState) {
  const d = derive(state)
  const rng = Rng.fromState(state.rngState + state.month * 104729)
  const built = ['low', 'mid', 'high', 'special'].filter((t) => state.products[t as 'low'].built)
  for (let i = 0; i < d.orderCount; i++) {
    const tier = built.length ? built[rng.int(built.length)] : 'low'
    /**
     * 订单量在基准上下浮动，但下限必须是 1。
     * 原先写 `rng.int(5) + d.orderQty - 2` 在基准为 1 时会产出 -1 件，
     * 负数量的订单永远不会被交付，只是白白占着待交付列表。
     */
    const qty = Math.max(1, d.orderQty + rng.int(5) - 2)
    state.orders.push({
      id: `mo${state.month}-${i}`,
      tier: tier as 'low',
      qty,
      priceShift: d.orderPriceShift,
      dueMonth: state.month + 1,
      from: '销售渠道',
      forced: false,
    })
  }
  state.rngState = rng.state
}

/** 执行月度结算并推进到下一月。 */
export function settleMonth(state: GameState): SettleReport {
  const report = settle(state)
  return report
}

export function nextMonth(state: GameState) {
  const rng = Rng.fromState(state.rngState)
  advanceMonthCore(state, rng)
  state.rngState = rng.state
  state.phase = 'board'
  state.boardPrompted = false
  maybeDrawBoardGoals(state, new Rng(state.rngState + state.month * 7919))
  syncManagementCards(state)
}

/** 终局。 */
export function finishGame(state: GameState) {
  state.phase = state.result === 'lost' ? 'gameover' : 'summary'
}

// ────────────────────────────────────────────────────────────
// 供 UI 使用的只读派生视图
// ────────────────────────────────────────────────────────────

export interface HudView {
  month: number
  quarter: number
  climate: Climate
  climateName: string
  momentum: string
  cash: Money
  ap: number
  apMax: number
  plays: number
  playsMax: number
  credit: number
  creditUsed: Money
  salesResource: number
  staffTotal: number
}

export function hudView(state: GameState): HudView {
  const d = derive(state)
  return {
    month: state.month,
    quarter: Math.ceil(state.month / 3),
    climate: state.climate,
    climateName: CLIMATE_NAMES[state.climate],
    momentum: state.momentum,
    cash: state.cash,
    ap: state.ap,
    apMax: state.apMax,
    plays: state.plays,
    playsMax: state.playsMax,
    credit: d.creditLine - state.debt,
    creditUsed: state.debt,
    salesResource: d.salesResource,
    staffTotal: Object.values(state.depts).reduce((a, x) => a + x.staff, 0),
  }
}

/** 原料卡片视图。 */
export function materialViews(state: GameState) {
  const d = derive(state)
  const all = [...MATERIALS, ...NEW_MATERIALS.filter((m) => state.materials[m.id])]
  return all.map((m) => {
    const s = state.materials[m.id]
    const dm = d.materials[m.id]
    return {
      id: m.id,
      name: m.name,
      grade: m.grade,
      supply: dm?.supply ?? 0,
      price: dm?.price ?? m.basePrice,
      tierShift: dm?.tierShift ?? 0,
      qty: s?.qty ?? 0,
      cap: dm?.cap ?? m.baseCapacity,
      avgCost: s && s.qty > 0 ? Math.round(s.value / s.qty) : m.basePrice,
      chosenLot: s?.chosenLot ?? null,
      developed: state.materialsDeveloped[m.id] ?? 0,
      isNew: NEW_MATERIALS.some((n) => n.id === m.id),
    }
  })
}

/** 董事会目标进度视图。 */
export function goalDisplay(state: GameState) {
  const mk = (t: GoalTrack | null) => (t ? { track: t, current: goalCurrent(state, t) } : null)
  return { basic: mk(state.basicGoal), challenge: mk(state.challengeGoal) }
}

/** 汇总若干月份的损益表。 */
export function pnlFor(state: GameState, month: number): Ledger | undefined {
  return state.ledgers.find((l) => l.month === month)
}

export function cumulative(ledgers: Ledger[]) {
  return ledgers.reduce(
    (a, l) => ({
      revenue: a.revenue + l.revenue,
      cogs: a.cogs + l.cogs,
      grossProfit: a.grossProfit + l.grossProfit,
      sellExpense: a.sellExpense + l.sellExpense,
      adminExpense: a.adminExpense + l.adminExpense,
      rndExpense: a.rndExpense + l.rndExpense,
      mfgExpense: a.mfgExpense + l.mfgExpense,
      financeExpense: a.financeExpense + l.financeExpense,
      netProfit: a.netProfit + l.netProfit,
    }),
    { revenue: 0, cogs: 0, grossProfit: 0, sellExpense: 0, adminExpense: 0, rndExpense: 0, mfgExpense: 0, financeExpense: 0, netProfit: 0 },
  )
}

export { STAFF, RND_PROJECTS, CARD_BY_ID, EQUIPMENT_SHOP, IP_BY_ID } from '../data/game'
export { DEPT_NAMES, DEPT_SHORT, TIER_LABEL, TIERS, PRODUCT_PRICE } from '../data/game'
