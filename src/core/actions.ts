import {
  BOMS,
  CARD_BY_ID,
  CARDS,
  DEPT_NAMES,
  EQUIPMENT_SHOP,
  IP_BY_ID,
  MATERIALS,
  NEW_MATERIALS,
  OVERTIME_CAPACITY,
  OVERTIME_COST,
  RND_PROJECTS,
  STAFF,
  TIERS,
} from '../data/game'
import { cardEffectToMods, derive, makerPerStaff, mergeMods, unitCost } from './derive'
import { Rng } from './rng'
import type {
  CardCtx,
  CardInstance,
  Dept,
  GameState,
  LotSize,
  Money,
  MonthMods,
  Tier,
} from './types'
import type { CardDef } from '../data/game'

/** 所有玩家操作都通过本模块，统一处理校验、扣费与日志。 */

export type ActionResult = { ok: true; msg?: string } | { ok: false; msg: string }

const OK: ActionResult = { ok: true }
const fail = (msg: string): ActionResult => ({ ok: false, msg })

export function pushLog(state: GameState, kind: GameState['log'][number]['kind'], text: string, detail?: string[]) {
  state.log.push({ month: state.month, kind, text, detail })
}

// ════════════════════════════════════════════════════════════
// 招聘
// ════════════════════════════════════════════════════════════

export function hireCost(state: GameState, dept: Dept): Money {
  const def = STAFF[dept]
  if (dept === 'make') return 0
  const idx = Math.min(state.depts[dept].hired, def.hireFees.length - 1)
  let fee = def.hireFees[idx]
  if (state.monthMods.notes?.includes('招聘费 +1w')) fee += 10
  if (state.monthMods.notes?.includes('招聘费 -1w')) fee = Math.max(0, fee - 10)
  if (state.monthMods.notes?.includes('招聘费 -50%')) fee = Math.round(fee / 2)
  return fee
}

export function canHire(state: GameState, dept: Dept): ActionResult {
  if (state.depts[dept].staff >= 5) return fail('已达上限（5 人）')
  if (state.ap < 1) return fail('AP 不足')
  const fee = hireCost(state, dept)
  if (state.cash < fee) return fail('现金不足')
  return OK
}

export function hire(state: GameState, dept: Dept): ActionResult {
  const check = canHire(state, dept)
  if (!check.ok) return check
  const fee = hireCost(state, dept)
  state.cash -= fee
  state.miscExpense += fee
  state.ap -= 1
  state.depts[dept].staff += 1
  state.depts[dept].hired += 1
  state.flags[`hireMonth:${dept}:${state.month}`] = (state.flags[`hireMonth:${dept}:${state.month}`] ?? 0) + 1
  pushLog(state, 'action', `招聘 ${DEPT_NAMES[dept]}工作人员（第 ${state.depts[dept].staff} 名）`, [
    `招聘费 ${fee / 10}w`,
    `月薪 ${STAFF[dept].salary / 10}w`,
  ])
  checkAchievements(state)
  // 管理人员增加 AP 上限（下月生效，本月记 pending）
  if (dept === 'ops') state.flags['opsHired'] = (state.flags['opsHired'] ?? 0) + 1
  return { ok: true, msg: `${DEPT_NAMES[dept]}人数 → ${state.depts[dept].staff}` }
}

/** 解雇（仅事件 S4「裁员优化」允许）。 */
export function fire(state: GameState, dept: Dept): ActionResult {
  if (state.depts[dept].staff <= 0) return fail('该部门没有员工')
  if (!state.monthFlags.includes('canFire')) return fail('本月无裁员额度')
  state.depts[dept].staff -= 1
  const refund = Math.round(STAFF[dept].hireFees[0] * 0.5)
  state.cash += refund
  state.miscExpense -= refund
  state.monthFlags = state.monthFlags.filter((f) => f !== 'canFire')
  pushLog(state, 'action', `解雇 1 名${DEPT_NAMES[dept]}人员`, [`返还招聘费 ${refund / 10}w`])
  return { ok: true, msg: `解雇 1 人，返还 ${refund / 10}w` }
}

function checkAchievements(state: GameState) {
  const map: [Dept, string][] = [
    ['ops', '金牌高管'],
    ['buy', '供应链联盟'],
    ['make', '流水线'],
    ['sell', '品牌'],
    ['rnd', '专利壁垒'],
  ]
  for (const [d, name] of map) {
    if (state.depts[d].staff >= 5 && !state.achievements.includes(name)) {
      state.achievements.push(name)
      pushLog(state, 'board', `达成成就【${name}】`, ['终局 +10 分'])
    }
  }
}

// ════════════════════════════════════════════════════════════
// 抽卡
// ════════════════════════════════════════════════════════════

export function drawCards(state: GameState) {
  const d = derive(state)
  const rng = Rng.fromState(state.rngState)
  const pool = [...state.deck]
  const n = Math.min(d.drawN, pool.length)
  const picked: CardInstance[] = []
  for (let i = 0; i < n; i++) {
    // 部门加权：四个业务部门按 (人数 + 1) 加权；管理卡不参与加权
    const weights = pool.map((c) => weightOf(state, c.defId))
    const idx = rng.weighted(weights)
    picked.push(pool.splice(idx, 1)[0])
  }
  state.rngState = rng.state
  state.drawn = picked
  state.deck = pool
  state.drawnSelected = []
}

function weightOf(state: GameState, defId: string): number {
  const def = CARD_BY_ID[defId]
  if (!def) return 1
  if (def.kind === 'ops') return 1
  const staff: Record<Dept, number> = {
    ops: state.depts.ops.staff,
    buy: state.depts.buy.staff,
    make: state.depts.make.staff,
    sell: state.depts.sell.staff,
    rnd: state.depts.rnd.staff,
  }
  const total = staff.buy + staff.make + staff.sell + staff.rnd + 4
  return (staff[def.kind] + 1) / total
}

export function toggleDrawn(state: GameState, uid: string) {
  const d = derive(state)
  const i = state.drawnSelected.indexOf(uid)
  if (i >= 0) state.drawnSelected.splice(i, 1)
  else if (state.drawnSelected.length < d.drawM) state.drawnSelected.push(uid)
}

export function confirmDraw(state: GameState): ActionResult {
  if (!state.drawnSelected.length) return fail('请至少选择 1 张牌')
  const chosen = state.drawn.filter((c) => state.drawnSelected.includes(c.uid))
  const rest = state.drawn.filter((c) => !state.drawnSelected.includes(c.uid))
  state.hand.push(...chosen)
  // 未选中的放回牌库
  state.deck.push(...rest)
  state.drawn = []
  state.drawnSelected = []
  if (state.hand.length > state.handMax) {
    pushLog(state, 'action', `手牌超出上限，需弃 ${state.hand.length - state.handMax} 张`)
  }
  pushLog(state, 'action', `抽卡入手 ${chosen.length} 张`, rest.length ? [`${rest.length} 张放回牌库`] : undefined)
  return { ok: true, msg: `入手 ${chosen.length} 张` }
}

export function discardCard(state: GameState, uid: string) {
  const i = state.hand.findIndex((c) => c.uid === uid)
  if (i < 0) return
  state.discard.push(state.hand.splice(i, 1)[0])
}

// ════════════════════════════════════════════════════════════
// 打牌
// ════════════════════════════════════════════════════════════

export function cardCtx(state: GameState, empowered: boolean, mats?: string[]): CardCtx {
  return {
    staff: {
      ops: state.depts.ops.staff,
      buy: state.depts.buy.staff,
      make: state.depts.make.staff,
      sell: state.depts.sell.staff,
      rnd: state.depts.rnd.staff,
    },
    empowered,
    mats: mats ?? MATERIALS.map((m) => m.id),
    prodStock: TIERS.reduce((a, t) => a + (state.products[t]?.qty ?? 0), 0),
  }
}

export function cardPlayCost(state: GameState, def: CardDef): Money {
  let cost = def.cost ?? 0
  if (state.monthMods.notes?.includes('打牌费用 +1w/张')) cost += 10
  return cost
}

export function canPlay(state: GameState, card: CardInstance): ActionResult {
  const def = CARD_BY_ID[card.defId]
  if (!def) return fail('未知卡牌')
  if (state.plays <= 0) return fail('本月可打牌数已用完')
  if (cardPlayCost(state, def) > state.cash) return fail('现金不足')
  if (def.minStaff) {
    for (const [dept, min] of Object.entries(def.minStaff) as [Dept, number][]) {
      if (state.depts[dept].staff < min) return fail(`需${DEPT_NAMES[dept]} ≥ ${min} 人`)
    }
  }
  return OK
}

export function playCard(state: GameState, uid: string, opts?: { materialId?: string; targetUid?: string }): ActionResult {
  const idx = state.hand.findIndex((c) => c.uid === uid)
  if (idx < 0) return fail('手牌中没有这张牌')
  const card = state.hand[idx]
  const def = CARD_BY_ID[card.defId]
  const check = canPlay(state, card)
  if (!check.ok) return check

  const cost = cardPlayCost(state, def)
  state.cash -= cost
  state.miscExpense += cost
  state.plays -= 1

  const ctx = cardCtx(state, card.empowered)
  const effect = card.empowered && def.strong ? def.strong(ctx) : def.base(ctx)
  const { mods, flags } = cardEffectToMods(effect)
  state.cardMods = mergeMods(state.cardMods, mods)
  state.monthFlags.push(...flags)
  state.playedThisMonth.push(card)
  state.hand.splice(idx, 1)
  state.discard.push(card)

  // 「+1 AP」若为本月唯一打出的牌，额外 +1
  if (def.id === 'M2' && state.playedThisMonth.length === 1) {
    state.ap += 1
    state.monthFlags.push('m2solo')
  }

  applyCardSpecial(state, def.id, flags, opts)

  pushLog(state, 'action', `打出【${def.name}】${card.empowered ? '（强化）' : ''}`, [
    def.text,
    ...(cost ? [`支付 ${cost / 10}w`] : []),
  ])
  return { ok: true, msg: `已打出【${def.name}】` }
}

/**
 * 卡牌中无法用统一修饰表达的部分：立即获得订单、知产、复制手牌等。
 */
function applyCardSpecial(state: GameState, defId: string, flags: string[], opts?: { materialId?: string; targetUid?: string }) {
  const rng = Rng.fromState(state.rngState)
  switch (defId) {
    case 'S3':
    case 'S8': {
      // 大订单 / 客户关系：立即获得确定性订单
      const d = derive(state)
      let n = 1
      if (defId === 'S3' && flags.includes('s3x2')) n = 2
      if (defId === 'S8' && flags.includes('s8x2')) n = 2
      if (defId === 'S8' && state.orders.length > 0) n += 1
      for (let i = 0; i < n; i++) grantOrder(state, d.orderQty, d.orderPriceShift, `卡牌·${CARD_BY_ID[defId].name}`)
      break
    }
    case 'R4': {
      const pool = flags.includes('ipStrongTemp') ? 'strong' : 'normal'
      const owned = new Set(state.ipOwned)
      const cands = Object.values(IP_BY_ID).filter((ip) => ip.pool === pool && !owned.has(ip.id))
      const gift = cands.length ? cands[rng.int(cands.length)] : null
      if (gift) {
        if (flags.includes('ipPerm')) {
          state.ipOwned.push(gift.id)
          pushLog(state, 'action', `永久获得知识产权【${gift.name}】`)
        } else {
          state.monthMods.tempIps = [...(state.monthMods.tempIps ?? []), gift.id]
          pushLog(state, 'action', `临时获得知识产权【${gift.name}】（本季有效）`)
        }
      }
      break
    }
    case 'R6': {
      const locked = TIERS.filter((t) => !state.products[t].built)
      const n = flags.includes('reverse2') ? 2 : 1
      for (let i = 0; i < n; i++) {
        const t = locked.shift()
        if (!t) break
        state.products[t].built = true
        revealMaterials(state, t)
        pushLog(state, 'action', `逆向工程：解锁${BOMS[t].name}配方`)
      }
      break
    }
    case 'R10': {
      if (flags.includes('ipSlotPlus') && !flags.includes('ipProtected')) {
        state.ipActive.push(null)
        pushLog(state, 'action', '知识产权激活槽 +1')
      } else if (!flags.includes('ipProtected')) {
        // 仅强化版或研发满员时获得额外槽
        if (flags.includes('ipSlotPlus')) state.ipActive.push(null)
      }
      break
    }
    case 'M1': {
      const drawN = flags.includes('m1b') ? 2 : 1
      drawToHand(state, drawN)
      break
    }
    case 'M3': {
      if (opts?.targetUid) {
        const src = state.hand.find((c) => c.uid === opts.targetUid)
        if (src) {
          const copy: CardInstance = { uid: `${src.defId}#copy${state.hand.length}${state.discard.length}`, defId: src.defId, empowered: src.empowered }
          state.hand.push(copy)
          pushLog(state, 'action', `复制手牌【${CARD_BY_ID[src.defId].name}】`)
        }
      }
      break
    }
    case 'M4': {
      const strong = CARDS.filter((c) => c.kind !== 'ops')
      const n = flags.includes('m4b') ? 2 : 1
      for (let i = 0; i < n; i++) {
        const def = strong[rng.int(strong.length)]
        state.hand.push({ uid: `${def.id}#m4${state.hand.length}`, defId: def.id, empowered: true })
        pushLog(state, 'action', `获得强化卡【${def.name}】`)
      }
      break
    }
    case 'C5':
    case 'O6':
    case 'D7': {
      // 长期协议：立即签一份（不占部门名额）
      const id = opts?.materialId ?? MATERIALS[0].id
      const months = flags.includes('agreement2x6') ? 6 : 3
      signAgreement(state, id, months, true)
      break
    }
    case 'C2': {
      state.monthFlags.push('noCap')
      break
    }
    // 以下几张牌的效果在「结算 / 界面」阶段处理，这里只记录本月标记：
    // C4 贸易商 / C6 紧急采购 / C7 原料替换 / C9 期货 / C10 清仓 / P1 满负荷
    case 'C4':
      state.flags['cardTrader'] = 1
      break
    case 'C6':
      state.flags['cardUrgent'] = 1
      break
    case 'C9':
      state.flags['cardFutures'] = flags.includes('futuresAll') ? 2 : 1
      break
    case 'C10':
      state.flags['cardClearance'] = 1
      break
    case 'P1':
      state.monthFlags.push('fullLoadCard')
      break
    default:
      break
  }
  state.rngState = rng.state
}

/** 立即从牌库抽牌加入手牌（管理卡用）。 */
export function drawToHand(state: GameState, n: number) {
  const rng = Rng.fromState(state.rngState)
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) {
      state.deck = state.discard.filter((c) => !state.playedThisMonth.some((p) => p.uid === c.uid))
      state.discard = state.discard.filter((c) => state.playedThisMonth.some((p) => p.uid === c.uid))
      if (!state.deck.length) break
    }
    const idx = rng.int(state.deck.length)
    state.hand.push(state.deck.splice(idx, 1)[0])
  }
  state.rngState = rng.state
}

export function grantOrder(state: GameState, qty: number, priceShift: number, from: string, tier?: Tier) {
  const d = derive(state)
  // 订单层次：先看已有库存的层次，再看已解锁的层次，最后回落到低端
  let target = tier
  if (!target) {
    const withStock = TIERS.filter((t) => state.products[t].qty > 0 && state.products[t].built)
    const built = TIERS.filter((t) => state.products[t].built)
    target = withStock[0] ?? built[built.length - 1] ?? 'low'
  }
  state.orders.push({
    id: `o${state.month}-${state.orders.length}-${Math.floor(d.price[tier ?? 'low'] * 1000)}`,
    tier: target,
    qty,
    priceShift,
    dueMonth: state.month + 1,
    from,
    forced: true,
  })
}

export function revealMaterials(state: GameState, tier: Tier) {
  if (tier === 'special' || tier === 'high') {
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
    pushLog(state, 'action', '新材料已加入「已知材料」，需开发供应商后才有供给')
  }
}

// ════════════════════════════════════════════════════════════
// 采购
// ════════════════════════════════════════════════════════════

export function lotQty(state: GameState, materialId: string, lot: LotSize): number {
  const d = derive(state)
  const supply = d.materials[materialId]?.supply ?? 0
  if (supply <= 0) return 0
  const round5 = (v: number) => Math.ceil(v / 5) * 5
  const small5 = round5(supply * 0.25)
  const mid5 = round5(supply * 0.5)
  // 批量原料：取整后三档数量严格递增，按 5 件取整
  if (small5 < mid5 && mid5 < supply) {
    return lot === 'small' ? small5 : lot === 'mid' ? mid5 : supply
  }
  // 稀缺原料（供给太小，取整后档位量不再递增）：改 1 件粒度，保证小批 < 中批 ≤ 大批
  const small = Math.max(1, Math.round(supply * 0.25))
  const mid = Math.min(supply, Math.max(small + 1, Math.round(supply * 0.5)))
  return lot === 'small' ? small : lot === 'mid' ? mid : supply
}

export function lotPrice(state: GameState, materialId: string, lot: LotSize): Money {
  const d = derive(state)
  const base = d.materials[materialId]
  if (!base) return 0
  const shift = lot === 'small' ? 1 : lot === 'large' ? -1 : 0
  const totalShift = base.tierShift + shift + buyCardShift(state)
  return priceAtShift(materialId, totalShift)
}

/** 卡牌带来的额外采购价格档位（批量采购、清仓等）。 */
export function buyCardShift(state: GameState): number {
  let shift = 0
  for (const c of state.playedThisMonth) {
    const def = CARD_BY_ID[c.defId]
    if (!def || def.kind !== 'buy') continue
    const ctx = cardCtx(state, c.empowered)
    const e = c.empowered && def.strong ? def.strong(ctx) : def.base(ctx)
    if (e.buyTierShift) shift += e.buyTierShift
  }
  if (state.monthFlags.includes('supplierRelation') && (state.flags['lastC8'] ?? 0) > 0) shift -= 1
  return shift
}

function priceAtShift(materialId: string, shift: number): Money {
  const all = [...MATERIALS, ...NEW_MATERIALS]
  const def = all.find((m) => m.id === materialId)
  if (!def) return 0
  const table: Record<string, number[]> = {
    pkg: [5, 8, 10, 15, 20],
    resin: [10, 15, 20, 30, 40],
    alloy: [20, 30, 40, 60, 80],
    chip: [40, 60, 80, 120, 160],
    comp: [15, 22, 30, 45, 60],
    micro: [50, 75, 100, 150, 200],
  }
  const arr = table[materialId] ?? table.pkg
  return arr[Math.max(0, Math.min(4, 2 + shift))]
}

export function buyMaterial(state: GameState, materialId: string, lot: LotSize): ActionResult {
  const d = derive(state)
  const mat = state.materials[materialId]
  if (!mat) return fail('未知原料')
  if (mat.chosenLot) return fail('每类原料每月最多选一档')
  if (state.lotsUsed >= d.buyLots) return fail('本月可选档数已用完')
  const qty = lotQty(state, materialId, lot)
  if (qty <= 0) return fail('该原料无供给')
  const unit = lotPrice(state, materialId, lot)
  const total = unit * qty
  if (state.cash < total) return fail('现金不足')

  state.lotsUsed += 1
  mat.chosenLot = lot
  const added = addMaterial(state, materialId, qty, unit, state.monthFlags.includes('noCap'))
  pushLog(state, 'action', `采购 ${nameOf(materialId)} · ${lotLabel(lot)}`, [
    `${added} 单位 × ${unit / 10}w = ${((added * unit) / 10).toFixed(1)}w`,
  ])
  return { ok: true, msg: `入库 ${added} 单位` }
}

/**
 * 入库并按移动加权平均重算单位成本。
 *
 * 这里是**唯一**改动原料库存的入口，因此现金扣减也统一放在这里，
 * 避免出现「入库了但没付钱」的漏洞。
 * `pay = false` 仅用于测试与内部调拨。
 */
export function addMaterial(
  state: GameState,
  materialId: string,
  qty: number,
  unitCost: Money,
  ignoreCap = false,
  pay = true,
) {
  const mat = state.materials[materialId]
  if (!mat) return 0
  const d = derive(state)
  const cap = d.materials[materialId]?.cap ?? mat.cap
  const canTake = ignoreCap ? qty : Math.min(qty, cap - mat.qty)
  const added = Math.max(0, canTake)
  if (added <= 0) return 0
  // 只为真正入库的部分付款
  if (pay) state.cash -= added * unitCost
  // 移动加权平均：账面价值累加实付金额，单价由 value / qty 导出
  mat.value += added * unitCost
  mat.qty += added
  mat.cap = cap
  return added
}

function nameOf(id: string) {
  return [...MATERIALS, ...NEW_MATERIALS].find((m) => m.id === id)?.name ?? id
}

export function lotLabel(lot: LotSize) {
  return lot === 'small' ? '小批' : lot === 'mid' ? '中批' : '大批'
}

/** 贸易商：每月随机供应一种原料的小批，价格 +1 档，不占档数。 */
export function traderOffer(state: GameState) {
  const d = derive(state)
  const count = state.depts.buy.staff >= 4 ? 2 : state.depts.buy.staff >= 2 ? 2 : 1
  const rng = Rng.fromState(state.seed + state.month * 977)
  const pool = MATERIALS.filter((m) => (d.materials[m.id]?.supply ?? 0) > 0)
  const picked = rng.sample(pool, Math.min(count, pool.length))
  return picked.map((m) => {
    const qty = lotQty(state, m.id, 'small')
    const shift = 1 - (state.depts.buy.staff >= 4 ? 1 : 0)
    const price = priceAtShift(m.id, (d.materials[m.id]?.tierShift ?? 0) + shift + buyCardShift(state))
    return { materialId: m.id, qty, price }
  })
}

export function buyFromTrader(state: GameState, materialId: string, qty: number, price: Money): ActionResult {
  if (state.cash < qty * price) return fail('现金不足')
  if (state.flags[`trader:${materialId}`]) return fail('该品种本月已采购')
  state.flags[`trader:${materialId}`] = 1
  const added = addMaterial(state, materialId, qty, price, false)
  pushLog(state, 'action', `贸易商采购 ${nameOf(materialId)}`, [`${added} 单位 × ${price / 10}w`])
  return { ok: true, msg: `入库 ${added} 单位` }
}

/** 长期协议。 */
export function agreementSlots(state: GameState): number {
  const d = derive(state)
  let base = state.depts.buy.staff >= 3 ? 1 : 0
  if (state.depts.buy.staff >= 5) base = 2
  base += d.flags.includes('agreementDouble') ? 2 : 0
  if (state.ipOwned.includes('J2')) base += 1
  return base
}

export function signAgreement(state: GameState, materialId: string, months: number, free = false): ActionResult {
  if (!free) {
    if (state.depts.buy.staff < 3) return fail('需要采购 3 人解锁')
    const used = state.agreements.length
    if (used >= agreementSlots(state)) return fail('协议名额已满')
    if (state.ap < 1) return fail('AP 不足')
    if (state.cash < 10) return fail('现金不足')
  }
  const d = derive(state)
  const shift = (d.materials[materialId]?.tierShift ?? 0) + (NEW_MATERIALS.some((m) => m.id === materialId) ? 1 : 0)
  const qty = lotQty(state, materialId, 'mid')
  state.agreements.push({ materialId, monthsLeft: months, priceTierShift: shift, qty })
  if (!free) {
    state.ap -= 1
    state.cash -= 10
    state.flags['agreementsSigned'] = (state.flags['agreementsSigned'] ?? 0) + 1
    pushLog(state, 'action', `签订长期协议：${nameOf(materialId)}`, [
      `锁定 ${months} 个月`,
      `每月中批 ${qty} 单位`,
      '每月仍需付款，占库存',
    ])
  }
  return { ok: true, msg: `${nameOf(materialId)} 锁定 ${months} 个月` }
}

export function cancelAgreement(state: GameState, idx: number): ActionResult {
  state.agreements.splice(idx, 1)
  return { ok: true, msg: '协议已终止' }
}

/** 供应商开发（新材料）。 */
export function developSupplier(state: GameState, materialId: string): ActionResult {
  const def = NEW_MATERIALS.find((m) => m.id === materialId)
  if (!def) return fail('该原料无需开发')
  if (!state.materials[materialId]) return fail('尚未解锁该材料')
  const cur = state.materialsDeveloped[materialId] ?? 0
  if (cur >= 6) return fail('开发已达上限（基础供给 6）')
  if (state.ap < 1) return fail('AP 不足')
  if (state.cash < 30) return fail('现金不足')
  state.ap -= 1
  state.cash -= 30
  state.miscExpense += 30
  state.materialsDeveloped[materialId] = cur + 2
  state.flags[`dev:${materialId}`] = (state.flags[`dev:${materialId}`] ?? 0) + 1
  pushLog(state, 'action', `供应商开发：${def.name}`, [`基础供给 +2（当前 ${cur + 2}）`])
  return { ok: true, msg: `供给 +2` }
}

// ════════════════════════════════════════════════════════════
// 生产
// ════════════════════════════════════════════════════════════

export function buyEquipment(state: GameState, shopId: string): ActionResult {
  const shop = EQUIPMENT_SHOP.find((e) => e.id === shopId)
  if (!shop) return fail('未知设备')
  if (state.cash < shop.price) return fail('现金不足')
  state.cash -= shop.price
  state.equipment.push({
    id: `${shop.id}-${state.month}-${state.equipment.length}`,
    name: shop.name,
    capacity: shop.capacity,
    depreciation: shop.depreciation,
    creditLine: shop.creditLine,
    cost: shop.price,
    accumulated: 0,
    purchasedAt: state.month,
  })
  state.flags['capexQ'] = (state.flags['capexQ'] ?? 0) + 1
  pushLog(state, 'action', `购置设备【${shop.name}】`, [`${shop.price / 10}w`, shop.desc])
  return { ok: true, msg: `产能 +${shop.capacity}` }
}

export function setPlan(state: GameState, patch: Partial<GameState['plan']>) {
  state.plan = { ...state.plan, ...patch }
}

export function planCapacity(state: GameState): number {
  const d = derive(state)
  let cap = d.capacity
  if (state.plan.overtime && state.depts.make.staff >= 3) cap += OVERTIME_CAPACITY
  return cap
}

/** 按 BOM 计算最大可生产数量。 */
export function maxProducible(state: GameState, tier: Tier): number {
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

export function toggleOvertime(state: GameState): ActionResult {
  if (state.depts.make.staff < 3) return fail('需要生产 3 人解锁')
  if (state.plan.overtime) {
    state.plan.overtime = false
    return { ok: true, msg: '已取消加班' }
  }
  if (state.cash < OVERTIME_COST) return fail('现金不足')
  state.plan.overtime = true
  return { ok: true, msg: `加班已安排（结算时扣 ${OVERTIME_COST / 10}w）` }
}

// ════════════════════════════════════════════════════════════
// 销售分配
// ════════════════════════════════════════════════════════════

export function setAlloc(state: GameState, tier: Tier, value: number) {
  const d = derive(state)
  const used = TIERS.reduce((a, t) => a + (t === tier ? 0 : state.salesAlloc[t]), 0)
  const max = Math.max(0, d.salesResource - used)
  state.salesAlloc[tier] = Math.max(0, Math.min(max, value))
}

export function allocUsed(state: GameState): number {
  return TIERS.reduce((a, t) => a + state.salesAlloc[t], 0)
}

/** 接取 / 放弃自然订单（当月决策，不接的当月失效，不跨月）。 */
export function toggleOrder(state: GameState, orderId: string): ActionResult {
  const o = state.orders.find((x) => x.id === orderId)
  if (!o) return fail('订单不存在')
  if (o.forced) return fail('强制订单不可取消')
  const acceptIdx = state.acceptedOrders.indexOf(orderId)
  const declineIdx = state.declinedOrders.indexOf(orderId)
  if (acceptIdx >= 0) {
    // 已接 → 取消，变为已放弃
    state.acceptedOrders.splice(acceptIdx, 1)
    state.declinedOrders.push(orderId)
    return { ok: true, msg: '已取消订单' }
  }
  if (declineIdx >= 0) {
    // 已放弃 → 接取
    state.declinedOrders.splice(declineIdx, 1)
    state.acceptedOrders.push(orderId)
    return { ok: true, msg: '已接取订单' }
  }
  // 默认状态 → 接取
  state.acceptedOrders.push(orderId)
  return { ok: true, msg: '已接取订单' }
}

// ════════════════════════════════════════════════════════════
// 研发与知识产权
// ════════════════════════════════════════════════════════════

export function startResearch(state: GameState, projectId: string): ActionResult {
  const def = RND_PROJECTS.find((p) => p.id === projectId)
  if (!def) return fail('未知项目')
  const slot = state.rnd[projectId]
  if (slot.done) return fail('该项目已完成')
  if (!state.depts.rnd || state.depts.rnd.staff < 1) return fail('需要至少 1 名研发人员')
  // 每月只能推进一个项目：把其它在研项目停掉
  for (const [id, s] of Object.entries(state.rnd)) {
    if (id !== projectId && s.projectId) s.projectId = null
  }
  if (!slot.projectId) {
    slot.projectId = projectId
    state.rndStartsThisMonth.push(projectId)
    state.flags['rndStartsQ'] = (state.flags['rndStartsQ'] ?? 0) + 1
    pushLog(state, 'action', `研发立项：${def.name}`, [`进度需求 ${def.need}`, `基础成功率 ${Math.round(def.rate * 100)}%`])
  }
  return { ok: true, msg: `正在推进【${def.name}】` }
}

export function activeResearch(state: GameState): string | null {
  for (const [id, s] of Object.entries(state.rnd)) if (s.projectId && !s.done) return id
  return null
}

export function ipSlots(state: GameState): number {
  const s = state.depts.rnd.staff
  let n = 1
  if (s >= 3) n = 2
  if (s >= 5) n = 3
  if (state.monthFlags.includes('ipSlotPlus')) n += 1
  return n
}

export function activateIp(state: GameState, ipId: string, slot: number): ActionResult {
  if (!state.ipOwned.includes(ipId)) return fail('未拥有该知识产权')
  if (state.ipChangedThisMonth) return fail('本月已更换过一次')
  if (state.ipActive[slot] === ipId) return fail('该槽位已激活此项')
  if (state.ipActive.includes(ipId)) return fail('该知识产权已在其他槽位激活')
  state.ipActive[slot] = ipId
  state.ipChangedThisMonth = true
  pushLog(state, 'action', `激活知识产权【${IP_BY_ID[ipId]?.name}】`)
  return { ok: true, msg: `已激活【${IP_BY_ID[ipId]?.name}】` }
}

export function deactivateIp(state: GameState, slot: number): ActionResult {
  if (state.ipChangedThisMonth) return fail('本月已更换过一次')
  state.ipActive[slot] = null
  state.ipChangedThisMonth = true
  return { ok: true, msg: '已卸下' }
}

// ════════════════════════════════════════════════════════════
// 资金
// ════════════════════════════════════════════════════════════

export function borrow(state: GameState, amount: Money): ActionResult {
  const d = derive(state)
  if (d.noBorrow) return fail('本月无法新增借款')
  if (amount <= 0) return fail('金额无效')
  if (amount > d.creditAvailable) return fail('超出可用额度')
  if (amount % 10 !== 0) return fail('借款以 1w 为单位')
  state.cash += amount
  state.debt += amount
  pushLog(state, 'action', `借款 ${amount / 10}w`, [`月利率 ${(d.rate * 100).toFixed(1)}%`])
  return { ok: true, msg: `到账 ${amount / 10}w` }
}

export function repay(state: GameState, amount: Money): ActionResult {
  if (amount <= 0) return fail('金额无效')
  if (amount > state.debt) return fail('超出借款总额')
  if (amount > state.cash) return fail('现金不足')
  state.cash -= amount
  state.debt -= amount
  pushLog(state, 'action', `还款 ${amount / 10}w`)
  return { ok: true, msg: `已还 ${amount / 10}w` }
}

// ════════════════════════════════════════════════════════════
// 事件
// ════════════════════════════════════════════════════════════

export function applyEventOption(state: GameState, optionIndex: number): ActionResult {
  const ev = state.currentEvent
  if (!ev || !ev.options) return fail('当前无抉择事件')
  const opt = ev.options[optionIndex]
  if (!opt) return fail('无效选项')

  if (opt.cost?.ap && state.ap < opt.cost.ap) return fail('AP 不足')
  if (opt.cost?.cash && state.cash < opt.cost.cash) return fail('现金不足')

  /**
   * 付费换取设备/资产的事件选项属于**资本支出**，不是费用：
   * 钱换成了资产，权益不变。若照 miscExpense 走，同一笔钱会
   * 一边减资产、一边减权益，资产负债表立刻失衡。
   */
  const buysEquipment = !!(opt.extra && opt.extra.includes('设备'))

  if (opt.cost?.ap) state.ap -= opt.cost.ap
  if (opt.cost?.cash) {
    state.cash -= opt.cost.cash
    if (!buysEquipment) state.miscExpense += opt.cost.cash
  }
  // 事件直接赠与的现金计入当期收益，避免「钱多了但利润没动」
  if (opt.gain) {
    state.cash += opt.gain
    state.miscIncome += opt.gain
  }
  if (opt.mods) {
    state.monthMods = mergeMods(state.monthMods, opt.mods)
    applyModSideEffects(state, opt.mods, buysEquipment ? opt.cost?.cash ?? 0 : 0)
  }

  // 卡牌与事件中「立即获得订单 / 设备 / 知产 / 人员」的落地
  if (opt.extra) {
    const d = derive(state)
    if (buysEquipment) {
      /**
       * 设备按**实际支付的对价**入账（¥），而不是 opt.cost.cash 的字面值——
       * 数据里金额一律以「角」为单位（1w = 10），写 50 就是 5w。
       * 若事件白送设备（无现金对价），按公允价值确认为营业外收入，
       * 否则资产增加而权益不动，恒等式同样会失衡。
       */
      const paid = opt.cost?.cash ?? 0
      const bookValue = paid > 0 ? paid : 50
      state.equipment.push({
        id: `ev-eq-${state.month}-${state.equipment.length}`,
        name: opt.extra.includes('产能 15') ? '清算设备' : '机会设备',
        capacity: opt.extra.includes('产能 15') ? 15 : 10,
        depreciation: opt.extra.includes('折旧减半') ? 10 : 20,
        creditLine: 50,
        cost: bookValue,
        accumulated: 0,
        purchasedAt: state.month,
      })
      if (paid <= 0) state.miscIncome += bookValue
      state.flags['capexQ'] = (state.flags['capexQ'] ?? 0) + 1
    }
    if (opt.extra.includes('长期协议') || opt.extra.includes('锁定')) {
      const months = opt.detail.includes('6 个月') ? 6 : 3
      signAgreement(state, MATERIALS[0].id, months, true)
    }
    if (opt.extra.includes('普通知识产权')) {
      const owned = new Set(state.ipOwned)
      const cands = Object.values(IP_BY_ID).filter((ip) => ip.pool === 'normal' && !owned.has(ip.id))
      if (cands.length) {
        const rng = Rng.fromState(state.seed + state.month * 31)
        const gift = cands[rng.int(cands.length)]
        state.monthMods.tempIps = [...(state.monthMods.tempIps ?? []), gift.id]
        pushLog(state, 'event', `获得临时知识产权【${gift.name}】（本季有效）`)
      }
    }
    if (opt.extra.includes('管理人员 +1') && state.depts.ops.staff < 5) {
      state.depts.ops.staff += 1
      state.depts.ops.hired += 1
      state.flags['opsHired'] = (state.flags['opsHired'] ?? 0) + 1
      checkAchievements(state)
    }
    if (opt.extra.includes('签订 1 份')) signAgreement(state, MATERIALS[0].id, 3, true)
    void d
  }

  if (opt.mods?.orders) {
    const d = derive(state)
    for (let i = 0; i < opt.mods.orders; i++) grantOrder(state, opt.mods.orderQty ?? d.orderQty, 1 + (opt.mods.orderPriceShift ?? 0), `事件·${ev.name}`)
  }

  state.eventResolved = true
  state.eventChosen = optionIndex
  pushLog(state, 'event', `事件【${ev.name}】→ ${opt.label}`, [opt.detail])
  return { ok: true, msg: opt.label }
}

export function skipEvent(state: GameState): ActionResult {
  const ev = state.currentEvent
  if (!ev || ev.type !== 'chance') return fail('该事件不能放弃')
  state.eventResolved = true
  state.eventSkipped = true
  pushLog(state, 'event', `事件【${ev.name}】→ 放弃`)
  return { ok: true, msg: '已放弃' }
}

export function acceptChance(state: GameState): ActionResult {
  const ev = state.currentEvent
  if (!ev || !ev.chance) return fail('当前无机会事件')
  const c = ev.chance
  if (c.cost.ap && state.ap < c.cost.ap) return fail('AP 不足')
  if (c.cost.cash && state.cash < c.cost.cash) return fail('现金不足')
  /**
   * 机会事件里「付钱换设备」是资本支出：现金转为设备资产，权益不变。
   * 只有除此之外的代价（手续费、服务费）才是当期费用。
   */
  const buysEquipment = !!(c.mods?.notes ?? []).some((n) => n.includes('设备 +1'))

  if (c.cost.ap) state.ap -= c.cost.ap
  if (c.cost.cash) {
    state.cash -= c.cost.cash
    if (!buysEquipment) state.miscExpense += c.cost.cash
  }
  if (c.mods) {
    state.monthMods = mergeMods(state.monthMods, c.mods)
    applyModSideEffects(state, c.mods, buysEquipment ? c.cost.cash ?? 0 : 0)
  }
  if (c.mods?.tempIps?.length) {
    const pool = c.mods.tempIps[0]
    const owned = new Set(state.ipOwned)
    const cands = Object.values(IP_BY_ID).filter((ip) => ip.pool === pool && !owned.has(ip.id))
    if (cands.length) {
      const rng = Rng.fromState(state.seed + state.month * 53)
      const gift = cands[rng.int(cands.length)]
      state.monthMods.tempIps = [...(state.monthMods.tempIps ?? []), gift.id]
      pushLog(state, 'event', `获得临时知识产权【${gift.name}】（本季有效）`)
    }
  }
  if (c.mods?.orders) {
    const d = derive(state)
    for (let i = 0; i < c.mods.orders; i++) grantOrder(state, c.mods.orderQty ?? d.orderQty, 1 + (c.mods.orderPriceShift ?? 0), `事件·${ev.name}`)
  }
  state.eventResolved = true
  pushLog(state, 'event', `事件【${ev.name}】→ 参与`, [c.detail])
  return { ok: true, msg: '已参与' }
}

/** 事件修饰中需要立刻改变状态的部分（设备、人员、解雇额度等）。 */
function applyModSideEffects(state: GameState, mods: MonthMods, equipmentConsideration = 0) {
  for (const note of mods.notes ?? []) {
    if (note.includes('设备 +1')) {
      /**
       * 机会事件的设备是对价换来的，现金已在调用方扣除。
       * 入账金额必须等于**实际支付的对价**：按固定 50 入账会让
       * 「付 80、只记 50」的差额凭空蒸发，恒等式随之失衡。
       * 若无对价（纯赠予），按公允价值确认为营业外收入。
       */
      const bookValue = equipmentConsideration > 0 ? equipmentConsideration : 50
      state.equipment.push({
        id: `note-eq-${state.month}-${state.equipment.length}`,
        name: '机会设备',
        capacity: note.includes('产能 15') ? 15 : 10,
        depreciation: note.includes('折旧减半') ? 10 : 20,
        creditLine: 50,
        cost: bookValue,
        accumulated: 0,
        purchasedAt: state.month,
      })
      if (equipmentConsideration <= 0) state.miscIncome += bookValue
      state.flags['capexQ'] = (state.flags['capexQ'] ?? 0) + 1
    }
    if (note.includes('管理人员 +1') && state.depts.ops.staff < 5) {
      state.depts.ops.staff += 1
      state.depts.ops.hired += 1
      state.flags['opsHired'] = (state.flags['opsHired'] ?? 0) + 1
      checkAchievements(state)
    }
    if (note.includes('解雇 1 人')) state.monthFlags.push('canFire')

    /**
     * 跨月挂账一律按权责发生制在**当月**入账，次月结算只做现金收付。
     * 只在下月凭空加减现金，等于无凭据地创造或消灭资产，恒等式会失衡。
     *
     * 金额单位：数据里 1w = 10。
     */
    /**
     * 短期理财：当月按权责发生制确认收益与应收，次月收到现金时冲销应收。
     * 只挂应收而不确认收益，资产会增加而权益不动，恒等式随即失衡。
     */
    if (note.includes('下月现金 +6w')) {
      state.pendingIncome += 60
      state.miscIncome += 60
    }
    if (note.includes('现金 +10w')) state.cash += 100
    /**
     * 「下月偿还 10w」描述的是这笔无息贷款形成的负债：
     * 收到现金的同月同时确认等额应付，次月偿还时冲销。
     * 两个 note 描述同一笔业务，负债只在这里确认一次。
     */
    if (note.includes('下月偿还 10w')) state.pendingCost += 100
    if (note.includes('下月售价 -1 档')) state.nextMonthPrice = { low: -1, mid: -1, high: -1, special: -1 }
    if (note.includes('借款额度 +5w')) state.flags['extraCredit'] = (state.flags['extraCredit'] ?? 0) + 50
  }
}

// ════════════════════════════════════════════════════════════
// 结束本月
// ════════════════════════════════════════════════════════════

export function canSettle(_state: GameState): ActionResult {
  return OK
}

export { makerPerStaff, unitCost, derive }
