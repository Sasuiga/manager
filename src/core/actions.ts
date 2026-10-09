import {
  BOMS,
  BUY_PRICE_NEGOTIATE_CAP,
  BUY_PRICE_NEGOTIATE_STAFF,
  CARD_BY_ID,
  MATERIAL_BY_ID,
  CARDS,
  DEPT_NAMES,
  EQUIPMENT_MODELS,
  EQUIP_CAP_PER_WORKER,
  IP_BY_ID,
  LOAN_TERM_MONTHS,
  MATERIALS,
  NEW_MATERIALS,
  overtimeCostOf,
  overtimeGainOf,
  RND_PROJECTS,
  SALES_ORDER_COUNT,
  SELL_PRICE_RAISE_STAFF,
  STAFF,
  supplyPushCapOf,
  supplyPushCostOf,
  TIER_COST,
  TIER_STAFF,
  tierUnlockedOf,
  TIERS,
} from '../data/game'
import { cardEffectToMods, derive, makerPerStaff, mergeMods, unitCost } from './derive'
import { materialPriceAt, priceAtProduct } from './settle'
import { Rng } from './rng'
import type {
  CardCtx,
  CardInstance,
  Dept,
  GameState,
  LotSize,
  Money,
  MonthMods,
  Order,
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
  fee = Math.round(fee * (derive(state).hireFeeFactor ?? 1)) // M5 高效招聘 / M7 降本模式：招聘费 ×系数
  return fee
}

export function canHire(state: GameState, dept: Dept): ActionResult {
  if (state.depts[dept].staff >= 5) return fail('已达上限（5 人）')
  const freeHire = state.monthFlags.includes('extraHire') // P10 猎头：本月可额外招聘 1 人（不耗 AP）
  const opsFree = dept === 'ops' && state.monthFlags.includes('hireApFree') // M6 强化：本月管理招聘 1 次不耗 AP
  if (!freeHire && !opsFree && state.ap < 1) return fail('AP 不足')
  const fee = hireCost(state, dept)
  if (state.cash < fee) return fail('现金不足')
  return OK
}

export function hire(state: GameState, dept: Dept): ActionResult {
  const check = canHire(state, dept)
  if (!check.ok) return check
  const fee = hireCost(state, dept)
  state.cash -= fee
  /** 招聘费当期费用化（管理费用）：不能只扣现金不记费用，否则资产凭空减少、恒等式失衡 */
  state.hireFeeBy[dept] += fee
  if (state.monthFlags.includes('extraHire')) {
    // 消耗 P10 猎头的「额外 +1 不耗 AP」名额（一次）
    state.monthFlags = state.monthFlags.filter((f) => f !== 'extraHire')
  } else if (dept === 'ops' && state.monthFlags.includes('hireApFree')) {
    // M6 强化：消耗「管理招聘 1 次不耗 AP」名额（一次）
    state.monthFlags = state.monthFlags.filter((f) => f !== 'hireApFree')
  } else {
    state.ap -= 1
  }
  state.depts[dept].staff += 1
  state.depts[dept].hired += 1
  if (dept === 'ops' && state.monthFlags.includes('opsApImmediate')) {
    // M6 即时授权：新招管理人员的 AP 上限 +1 本月即时生效（正常下月生效）
    state.ap += 1
  }
  state.flags[`hireMonth:${dept}:${state.month}`] = (state.flags[`hireMonth:${dept}:${state.month}`] ?? 0) + 1
  pushLog(state, 'action', `招聘 ${DEPT_NAMES[dept]}工作人员（第 ${state.depts[dept].staff} 名）`, [
    `招聘费 ${(fee / 10).toFixed(2)}w`,
    `月薪 ${(STAFF[dept].salary / 10).toFixed(2)}w`,
  ])
  applyHireEffect(state, dept)
  return { ok: true, msg: `${DEPT_NAMES[dept]}人数 → ${state.depts[dept].staff}` }
}

/** 招聘效果共用尾部：成就、管理 AP 上限 pending、销售订单阈值当月补发。 */
function applyHireEffect(state: GameState, dept: Dept): void {
  checkAchievements(state)
  // 管理人员增加 AP 上限（下月生效，本月记 pending）
  if (dept === 'ops') state.flags['opsHired'] = (state.flags['opsHired'] ?? 0) + 1
  // 销售招聘：解锁订单阈值时当月立即生效
  if (dept === 'sell') {
    const prevCount = SALES_ORDER_COUNT[Math.min(5, state.depts.sell.staff - 1)]
    const newCount = SALES_ORDER_COUNT[Math.min(5, state.depts.sell.staff)]
    const extra = newCount - prevCount
    if (extra > 0) {
      const d = derive(state)
      const rng = Rng.fromState(state.rngState + state.month * 104729)
      const built = TIERS.filter((t) => state.products[t].built)
      for (let i = 0; i < extra; i++) {
        const tier = built.length ? built[rng.int(built.length)] : 'low'
        state.orders.push({
          id: `hire${state.month}-${state.orders.length}`,
          tier,
          qty: Math.max(1, d.orderQty),
          priceShift: d.orderPriceShift,
          dueMonth: state.month + 1,
          from: '销售渠道',
          forced: false,
        })
      }
      state.rngState = rng.state
      pushLog(state, 'action', `销售渠道解锁：当月新增 ${extra} 个订单`, [])
    }
  }
}

/** 解雇（S4 事件 / K6 编制优化卡；本月额度内不耗 AP，返还 100% 基础招聘费）。 */
export function fire(state: GameState, dept: Dept): ActionResult {
  if (state.depts[dept].staff <= 0) return fail('该部门没有员工')
  const quotaIdx = state.monthFlags.findIndex((f) => f === 'canFire' || f === 'canFireCard')
  if (quotaIdx < 0) return fail('本月无裁员额度（S4 事件 / K6 卡）')
  state.monthFlags.splice(quotaIdx, 1)
  state.depts[dept].staff -= 1
  const refund = STAFF[dept].hireFees[0] // 100% 基础招聘费（K6 与 S4 同口径）
  state.cash += refund
  /** 返款从本月招聘费净额中抵减（与招聘费同科目，进管理费用） */
  state.hireFeeBy[dept] -= refund
  pushLog(state, 'action', `解雇 1 名${DEPT_NAMES[dept]}人员`, [`返还基础招聘费 ${(refund / 10).toFixed(2)}w`])
  return { ok: true, msg: `解雇 1 人，返还 ${(refund / 10).toFixed(2)}w` }
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
    // 提案出现与部门人数分布无关（纯随机）；但档位受对应部门人数解锁：
    // 先等概率选一档（已解锁档），再在该档牌内等概率随机（档内均匀）。
    const eligible = pool.filter((c) => {
      const def = CARD_BY_ID[c.defId]
      if (!def) return false
      return tierUnlockedOf(state.depts[def.kind].staff) >= def.tier
    })
    const src = eligible.length > 0 ? eligible : pool
    const tiers = [...new Set(src.map((c) => CARD_BY_ID[c.defId].tier))]
    const t = tiers[rng.int(tiers.length)]
    const group = src.filter((c) => CARD_BY_ID[c.defId].tier === t)
    const inst = group[rng.int(group.length)]
    picked.push(pool.splice(pool.indexOf(inst), 1)[0])
  }
  state.rngState = rng.state
  state.drawn = picked
  state.deck = pool
  state.drawnSelected = []
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
  let cost = TIER_COST[def.tier].cash
  if (state.monthMods.notes?.includes('打牌费用 +1w/张')) cost += 10
  if (state.monthFlags.includes('cardFeeDown')) cost = Math.max(0, cost - 10) // M7 降本模式：提案费 −1w/张
  return cost
}

export function canPlay(state: GameState, card: CardInstance): ActionResult {
  const def = CARD_BY_ID[card.defId]
  if (!def) return fail('未知卡牌')
  const tc = TIER_COST[def.tier]
  if (state.ap < tc.ap) return fail(`AP 不足（本牌需 ${tc.ap} AP）`)
  if (cardPlayCost(state, def) > state.cash) return fail('现金不足')
  if (def.tier > 0) {
    const need = TIER_STAFF[def.tier as 1 | 2 | 3]
    if (state.depts[def.kind].staff < need) {
      return fail(`需${DEPT_NAMES[def.kind]} ≥ ${need} 人（提案 ${def.tier} 档）`)
    }
  }
  return OK
}

export function playCard(state: GameState, uid: string, opts?: { materialId?: string; targetUid?: string }): ActionResult {
  const idx = state.hand.findIndex((c) => c.uid === uid)
  if (idx < 0) return fail('手牌中没有这张牌')
  const card = state.hand[idx]
  const def = CARD_BY_ID[card.defId]
  if (!def) return fail('未知卡牌')
  const check = canPlay(state, card)
  if (!check.ok) return check

  const cost = cardPlayCost(state, def)
  state.cash -= cost
  state.miscExpense += cost
  state.ap -= TIER_COST[def.tier].ap

  const ctx = cardCtx(state, card.empowered)
  const effect = card.empowered && def.strong ? def.strong(ctx) : def.base(ctx)
  const { mods, flags } = cardEffectToMods(effect)
  state.cardMods = mergeMods(state.cardMods, mods)
  state.monthFlags.push(...flags)
  /** AP 效果当月生效：state.ap 在月初按当时 apMax 初始化，卡牌带来的增量需实时补加（M2/M3） */
  if (effect.ap) state.ap += effect.ap
  state.playedThisMonth.push(card)
  state.playedThisQuarter.push(`${card.defId}:${card.empowered ? 1 : 0}`)
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
    ...(cost ? [`支付 ${(cost / 10).toFixed(2)}w`] : []),
  ])
  return { ok: true, msg: `已打出【${def.name}】` }
}

/**
 * J5 专利壁垒：每季度可复制 1 张本季已打出的牌（效果再次生效，免费、不占 AP/打牌数）。
 * key = `${defId}:${empowered ? 1 : 0}`，与 playedThisQuarter 一致。
 */
export function copyPlayedCard(state: GameState, key: string): ActionResult {
  const d = derive(state)
  if (!d.ipCardCopy) return fail('无专利壁垒（J5）生效')
  const q = Math.ceil(state.month / 3)
  if (state.flags['cardCopyQ'] === q) return fail('本季已复制')
  if (!state.playedThisQuarter.includes(key)) return fail('该卡未在本季打出')
  const [defId, emp] = key.split(':')
  const def = CARD_BY_ID[defId]
  if (!def) return fail('未知卡牌')
  const empowered = emp === '1'
  const ctx = cardCtx(state, empowered)
  const effect = empowered && def.strong ? def.strong(ctx) : def.base(ctx)
  const { mods, flags } = cardEffectToMods(effect)
  state.cardMods = mergeMods(state.cardMods, mods)
  state.monthFlags.push(...flags)
  /** AP 效果当月生效（M2/M3 同口径） */
  if (effect.ap) state.ap += effect.ap
  applyCardSpecial(state, def.id, flags)
  state.flags['cardCopyQ'] = q
  pushLog(state, 'action', `专利壁垒：复制【${def.name}】${empowered ? '（强化）' : ''}`, ['免费生效，不占 AP 与打牌数；每季度 1 次'])
  return { ok: true, msg: `已复制【${def.name}】` }
}

// ══════════════════════════════════════════════════════════
// ── 决议槽 / 规则卡交互 ──


/** 定价权（K1）：本月现货档位选择（0 基准 / 1 高 / 2 极高；每高 1 档需求惩罚） */
export function setSpotPrice(state: GameState, choice: 0 | 1 | 2): ActionResult {
  if (!state.monthFlags.includes('spotPriceChoice')) return fail('定价权未生效（需打出 K1 卡）')
  if (choice < 0 || choice > 2) return fail('档位选择无效')
  state.spotPriceChoice = choice
  const names = ['基准', '高', '极高']
  pushLog(state, 'action', `定价权：现货档位 → ${names[choice]}`, choice > 0 ? [`各层需求 −${choice}（强化版减半）`] : undefined)
  return { ok: true, msg: `现货档位 → ${names[choice]}` }
}

/** 双档采购（K3）：选定本月允许选 2 档的原料（不占档数，第二档 +1 档价） */
export function setSecondLot(state: GameState, materialId: string): ActionResult {
  const d = derive(state)
  if (!d.doubleLotActive) return fail('双档采购未生效（需打出 K3 卡）')
  if (!state.materials[materialId]) return fail('未知原料')
  if (!state.materials[materialId].chosenLot) return fail('先选定该原料的采购档，再选第二档')
  state.secondLotMat = materialId
  pushLog(state, 'action', `双档采购：${nameOf(materialId)} 第二档（${lotLabel(d.doubleLotSize)}，+1 档价）`, ['不占档数，计入采购计划'])
  return { ok: true, msg: '已选第二档' }
}

/** 取消双档采购第二档 */
export function clearSecondLot(state: GameState): ActionResult {
  state.secondLotMat = null
  return OK
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
        } else if (flags.includes('ipQuarter')) {
          state.quarterIps.push(gift.id)
          pushLog(state, 'action', `获得知识产权【${gift.name}】（本季有效，下季度失效）`)
        } else {
          state.monthMods.tempIps = [...(state.monthMods.tempIps ?? []), gift.id]
          pushLog(state, 'action', `临时获得知识产权【${gift.name}】（本月有效）`)
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
    case 'C3': {
      // 压价代价（基础版）：重置惩罚对象，采购页选定 1 种原料本月供给 −2（强化版无代价）
      state.c3PenaltyMat = null
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
    // C4 贸易商 / C6 紧急采购 / C7 原料替换 / C9 期货 / C10 清仓
    case 'C4':
      state.flags['cardTrader'] = 1
      break
    case 'C6':
      state.flags['cardUrgent'] = 1
      break
    case 'C8':
      // 供应商关系：记录打出月份，供下月 buyCardShift 判定「上月也打出」
      state.flags['lastC8'] = state.month
      break
    case 'C9': {
      // 期货：锁定本月档位（含气候/事件修正），下月气候档位上涨时按锁定档位采购
      const dd = derive(state)
      if (flags.includes('futuresAll')) {
        for (const m of MATERIALS) state.futures[m.id] = dd.materials[m.id]?.tierShift ?? 0
        pushLog(state, 'action', '期货：锁定下月全部原料价格', ['若下月档位上涨，按本月锁定档位采购'])
      } else {
        let top = MATERIALS[0].id
        let topShift = -99
        for (const m of MATERIALS) {
          const t = dd.materials[m.id]?.tierShift ?? 0
          if (t > topShift) {
            top = m.id
            topShift = t
          }
        }
        state.futures[top] = topShift
        pushLog(state, 'action', `期货：锁定下月 ${nameOf(top)} 价格`, [`锁定档位偏移 ${topShift}（若下月档位上涨，按此档位采购）`])
      }
      state.flags['cardFutures'] = flags.includes('futuresAll') ? 2 : 1
      break
    }
    case 'C10':
      state.flags['cardClearance'] = 1
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
  // 基准价(中批) = base.price,已包含气候/事件修正后的档位。
  // 小批: 基准价 +1 档;大批: 基准价 -1 档。卡牌修正叠加在基准档位上。
  const shift = lot === 'small' ? 1 : lot === 'large' ? -1 : 0
  return priceAtShift(materialId, base.tierShift + shift + buyCardShift(state))
}

/** 卡牌带来的额外采购价格档位（批量采购、压价、供应商关系等，作用于采购/贸易商价格）。 */
export function buyCardShift(state: GameState): number {
  let shift = 0
  for (const c of state.playedThisMonth) {
    const def = CARD_BY_ID[c.defId]
    if (!def || def.kind !== 'buy') continue
    const ctx = cardCtx(state, c.empowered)
    const e = c.empowered && def.strong ? def.strong(ctx) : def.base(ctx)
    if (e.buyTierShift) shift += e.buyTierShift
    // C1 批量采购：自第 2 个已选采购档起额外 -1 档
    if (e.flags?.includes('buyTierExtra') && state.lotsUsed >= 1) shift -= 1
  }
  // C8 供应商关系：上月也打出过则额外 -1 档
  if (state.monthFlags.includes('supplierRelation') && state.flags['lastC8'] === state.month - 1) shift -= 1
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
  if (state.mode === 'core') return setPurchasePlan(state, materialId, lot)
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
  if (added > 0) {
    const name = nameOf(materialId)
    // 采购入库记账：借 库存 / 贷 现金。金额 = 实付现金（受仓库上限截断后的入库量 × 单价），
    // 与库存账面价值增加额、现金扣减额三者严格相等，供生产领料/销售成本逐层勾稽。
    state.monthLedger.push({
      dept: 'buy',
      item: `采购 ${name} ${lotLabel(lot)} ×${added}`,
      debit: `库存 ${name}`,
      credit: '现金',
      debitAmt: added * unit,
      creditAmt: added * unit,
      detail: [
        `${added} 件 × ${(unit / 10).toFixed(2)}w = ${((added * unit) / 10).toFixed(2)}w`,
        '现金实付全额转入库存（移动加权平均计价），与生产领料出库勾稽',
      ],
    })
  }
  pushLog(state, 'action', `采购 ${nameOf(materialId)} · ${lotLabel(lot)}`, [
    `${added} 单位 × ${(unit / 10).toFixed(2)}w = ${((added * unit) / 10).toFixed(2)}w`,
  ])
  return { ok: true, msg: `入库 ${added} 单位` }
}

/** 核心模式普通采购只形成计划，不立即扣款或入库。 */
export function setPurchasePlan(state: GameState, materialId: string, lot: LotSize | null): ActionResult {
  if (state.mode !== 'core') return fail('仅核心模式可调整采购计划')
  const mat = state.materials[materialId]
  if (!mat) return fail('未知原料')
  const previous = mat.chosenLot
  const usedWithoutThis = state.lotsUsed - (previous ? 1 : 0)
  if (lot && usedWithoutThis >= derive(state).buyLots) return fail('本月可选档数已用完')

  const nextQty = lot ? plannedLotQty(state, materialId, lot) : 0
  const needed = plannedMaterialNeed(state, materialId)
  const clearsPlan = plannedTotal(state) > 0 && mat.qty + nextQty < needed
  if (clearsPlan && !lot) return fail('该采购计划已被生产占用，请先调整生产安排')

  const nextCost = lot ? nextQty * lotPrice(state, materialId, lot) : 0
  const costWithoutThis = plannedPurchaseCost(state) - plannedPurchaseLine(state, materialId).cost
  if (costWithoutThis + nextCost + planEquipmentCost(state) > state.cash) return fail('可用现金不足（含设备计划）')

  mat.chosenLot = lot
  state.lotsUsed = usedWithoutThis + (lot ? 1 : 0)
  if (clearsPlan) {
    clearProductionPlan(state)
    reconcileAcceptedOrders(state)
    pushLog(state, 'action', '采购调整：原生产计划已清空', [
      '该原料新采购量低于原生产需求，请重新安排生产计划',
    ])
  }
  return {
    ok: true,
    msg: lot
      ? clearsPlan
        ? `${nameOf(materialId)}已计划${lotLabel(lot)}，生产计划已清空`
        : `${nameOf(materialId)}已计划${lotLabel(lot)}`
      : `${nameOf(materialId)}采购计划已取消`,
  }
}

export function canSetPurchasePlan(state: GameState, materialId: string, lot: LotSize | null): ActionResult {
  if (state.mode !== 'core') return OK
  const copy = JSON.parse(JSON.stringify(state)) as GameState
  return setPurchasePlan(copy, materialId, lot)
}

/** 计划采购实际可入库数量，受市场供给和仓容共同限制。 */
export function plannedLotQty(state: GameState, materialId: string, lot: LotSize): number {
  const mat = state.materials[materialId]
  if (!mat) return 0
  const cap = derive(state).materials[materialId]?.cap ?? mat.cap
  return Math.max(0, Math.min(lotQty(state, materialId, lot), cap - mat.qty))
}

export function plannedPurchaseLine(state: GameState, materialId: string) {
  const lot = state.materials[materialId]?.chosenLot ?? null
  if (!lot || state.mode !== 'core') return { lot: null, qty: 0, unit: 0, cost: 0 }
  const qty = plannedLotQty(state, materialId, lot)
  const unit = lotPrice(state, materialId, lot)
  let totalQty = qty
  let totalCost = qty * unit
  // 双档采购（K3）：第二档（小批/中批，价格 +1 档，不占档数）
  const d = derive(state)
  if (d.doubleLotActive && state.secondLotMat === materialId) {
    const shift = d.doubleLotSize === 'small' ? 1 : 0
    const q2 = plannedLotQty(state, materialId, d.doubleLotSize)
    const u2 = priceAtShift(materialId, (d.materials[materialId]?.tierShift ?? 0) + shift + 1 + buyCardShift(state))
    totalQty += q2
    totalCost += q2 * u2
  }
  return { lot, qty: totalQty, unit, cost: totalCost }
}

export function plannedPurchaseCost(state: GameState): Money {
  if (state.mode !== 'core') return 0
  return Object.keys(state.materials).reduce((sum, id) => sum + plannedPurchaseLine(state, id).cost, 0)
}

export function availableCashAfterPurchasePlan(state: GameState): Money {
  return state.cash - plannedPurchaseCost(state) - planEquipmentCost(state)
}

/** 生产可用原料：核心模式包含计划采购到货，完整模式只读实际库存。 */
export function materialAvailableForProduction(state: GameState, materialId: string): number {
  const current = state.materials[materialId]?.qty ?? 0
  return current + (state.mode === 'core' ? plannedPurchaseLine(state, materialId).qty : 0)
}

/**
 * 采购计划后的原料单位成本（统一口径，移动加权平均）：
 * - 核心模式：(账面价值 + 计划采购付款) ÷ (现库存 + 计划到货)——计划执行后的库存成本；
 * - 完整模式：采购已即时入账，即当前账面单价；
 * - 无库存且无计划：以当前价格水平代理未来采购成本。
 */
export function plannedMaterialUnitCost(state: GameState, materialId: string): number {
  const mat = state.materials[materialId]
  const line = plannedPurchaseLine(state, materialId)
  const totalQty = (mat?.qty ?? 0) + line.qty
  if (totalQty > 0) return ((mat?.value ?? 0) + line.cost) / totalQty
  return derive(state).materials[materialId]?.price ?? 0
}

/** 单条产品线成本构成（统一口径） */
export interface UnitCostBreakdown {
  /** 直接材料成本：BOM 领料量（含节材修正）× 计划后原料库存单价 × 降本系数 */
  material: number
  /** 固定成本分摊：(生产薪酬 + 折旧 + 加班费) ÷ 本月排产量，各线相同 */
  fixed: number
  /** 单位成本 = 材料 + 固定成本分摊 */
  total: number
}

/** 生产单位成本（统一口径）汇总视图 */
export interface ProductionUnitCosts {
  tiers: Record<Tier, UnitCostBreakdown>
  /** 本月生产固定成本合计（薪酬 + 折旧 + 加班费） */
  fixedTotal: number
  fixedParts: { labor: number; depreciation: number; overtime: number }
  /** 本月排产量（分摊分母）；为 0 时固定成本不分摊 */
  planned: number
}

/** 设备折旧预演：核心模式计划设备结算时入账，当月起计提全额月折旧。 */
export function plannedEquipmentDepreciation(state: GameState): number {
  if (state.mode !== 'core') return 0
  return state.plan.equipment.reduce((sum, id) => sum + (EQUIPMENT_MODELS[id]?.depreciation ?? 0), 0)
}

/**
 * 生产单位成本（完全成本口径，供生产 / 销售 / 预算页共用）：
 * 材料成本按采购计划后的原料库存单价计 BOM 领料（采购计划在此影响库存成本）；
 * 固定成本（生产薪酬、本月折旧（含核心模式计划设备）、加班费）按排产量分摊到每件。
 */
export function productionUnitCosts(state: GameState): ProductionUnitCosts {
  const d = derive(state)
  const labor = d.salaryPer.make * state.depts.make.staff
  const depreciation = state.equipment.reduce((sum, e) => sum + Math.min(e.depreciation, Math.max(0, e.cost - e.accumulated)), 0)
    + plannedEquipmentDepreciation(state)
  const overtime = state.overtimePaid
  const fixedTotal = labor + depreciation + overtime
  const planned = TIERS.reduce((sum, t) => sum + state.plan.quantities[t], 0)
  const allocated = planned > 0 ? fixedTotal / planned : 0
  const tiers = {} as Record<Tier, UnitCostBreakdown>
  for (const t of TIERS) {
    const bom = BOMS[t]
    let material = 0
    for (const [id, need] of Object.entries(bom.recipe)) {
      const per = Math.max(1, need - d.matSave)
      material += per * plannedMaterialUnitCost(state, id)
    }
    material = Math.round(material * d.costFactor)
    tiers[t] = { material, fixed: allocated, total: material + allocated }
  }
  return { tiers, fixedTotal, fixedParts: { labor, depreciation, overtime }, planned }
}

/** 正式结算时执行核心模式采购计划。 */
export function executePlannedPurchases(state: GameState) {
  if (state.mode !== 'core') return
  for (const id of Object.keys(state.materials)) {
    const line = plannedPurchaseLine(state, id)
    if (!line.lot || line.qty <= 0) continue
    const added = addMaterial(state, id, line.qty, line.unit, false, true)
    if (added <= 0) continue
    const name = nameOf(id)
    state.monthLedger.push({
      dept: 'buy',
      item: `采购 ${name} ${lotLabel(line.lot)} ×${added}`,
      debit: `库存 ${name}`,
      credit: '现金',
      debitAmt: added * line.unit,
      creditAmt: added * line.unit,
      detail: [
        `${added} 件 × ${(line.unit / 10).toFixed(2)}w = ${((added * line.unit) / 10).toFixed(2)}w`,
        '结算时按采购计划入库并付款',
      ],
    })
  }
  // 生产计划非空时取消采购会被拒绝，因此这里清空 chosenLot 不会破坏生产 BOM 约束。
  // 计划已入实体库存：清空档位与档数，避免后续“计划量 = 库存 + 计划到货”重叠加计划量。
  // 月末推进的 advanceMonthCore 也会再清一次，这里是防御性的提前清理。
  for (const id of Object.keys(state.materials)) state.materials[id].chosenLot = null
  state.lotsUsed = 0
}

function plannedMaterialNeed(state: GameState, materialId: string): number {
  const d = derive(state)
  return TIERS.reduce((sum, tier) => {
    const need = BOMS[tier].recipe[materialId] ?? 0
    return sum + Math.max(0, need - d.matSave) * state.plan.quantities[tier]
  }, 0)
}

/**
 * 修改采购计划时的生产联动规则：
 * 该原料已被生产占用（库存 + 新计划量不够 BOM 需求）时，
 * 原排产量会被整体清空，让玩家以新采购重新排产（加班一经选定即锁定，不受清计划影响）。
 * 生产计划为空时不触发任何联动。
 */
export function purchasePlanClearsProduction(state: GameState, materialId: string, lot: LotSize | null): boolean {
  if (state.mode !== 'core') return false
  const mat = state.materials[materialId]
  if (!mat) return false
  const nextQty = lot ? plannedLotQty(state, materialId, lot) : 0
  return plannedTotal(state) > 0 && mat.qty + nextQty < plannedMaterialNeed(state, materialId)
}

export function clearProductionPlan(state: GameState): void {
  for (const tier of TIERS) state.plan.quantities[tier] = 0
  // 加班一经选定即锁定：清空排产量不影响加班标志与已付加班费
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
  return lot === 'small' ? '小批采购' : lot === 'mid' ? '中批采购' : '大批采购'
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

/**
 * 本月单品种贸易商购买上限：基础 1 次。
 * C4【贸易商】额外 +1（强化 +2）；事件/员工能力可在同一口径上扩展。
 * 已购次数记录在 state.extraBuys（月初随 advanceMonth 清零）。
 */
export function traderQuota(state: GameState): number {
  let quota = 1
  for (const p of state.playedThisMonth) {
    if (p.defId === 'C4') quota += p.empowered ? 2 : 1
  }
  return quota
}

export function buyFromTrader(state: GameState, materialId: string, qty: number, price: Money): ActionResult {
  const used = state.extraBuys.filter((e) => e.kind === 'trader' && e.materialId === materialId).length
  if (used >= traderQuota(state)) return fail('该品种本月已购买')
  if (state.cash < qty * price) return fail('现金不足')
  state.extraBuys.push({ kind: 'trader', materialId, qty, price, used: true })
  const added = addMaterial(state, materialId, qty, price, false)
  if (added > 0) {
    const name = nameOf(materialId)
    state.monthLedger.push({
      dept: 'buy',
      item: `贸易商采购 ${name} ×${added}`,
      debit: `库存 ${name}`,
      credit: '现金',
      debitAmt: added * price,
      creditAmt: added * price,
      detail: [
        `${added} 件 × ${(price / 10).toFixed(2)}w（贸易商小批，价格 +1 档）`,
        '现金实付全额转入库存（移动加权平均计价），不占本月采购档数',
      ],
    })
  }
  pushLog(state, 'action', `贸易商采购 ${nameOf(materialId)}`, [`${added} 单位 × ${(price / 10).toFixed(2)}w`])
  return { ok: true, msg: `入库 ${added} 单位` }
}

/** 不占档数的额外采购机会（C6 紧急采购 / C10 清仓）共用执行：扣现金、入库、记账、记录次数。 */
function extraBuy(state: GameState, materialId: string, kind: string, qty: number, unit: Money, desc: string): ActionResult {
  const total = qty * unit
  if (state.cash < total) return fail('现金不足')
  const added = addMaterial(state, materialId, qty, unit, false, true)
  if (added <= 0) return fail('仓容已满，无法入库')
  state.extraBuys.push({ kind, materialId, qty: added, price: unit, used: true })
  state.monthLedger.push({
    dept: 'buy',
    item: `采购 ${nameOf(materialId)} ×${added}（${desc}）`,
    debit: `库存 ${nameOf(materialId)}`,
    credit: '现金',
    debitAmt: added * unit,
    creditAmt: added * unit,
    detail: [`${added} 单位 × ${(unit / 10).toFixed(2)}w（不占本月采购档数）`, '现金实付全额转入库存（移动加权平均计价）'],
  })
  pushLog(state, 'action', `${desc} ${nameOf(materialId)}`, [`${added} 单位 × ${(unit / 10).toFixed(2)}w`])
  return { ok: true, msg: `入库 ${added} 单位` }
}

/** C6 紧急采购：每类原料 1 次。小批 +2 档；强化版中批 +1 档。不占档数。 */
export function urgentBuy(state: GameState, materialId: string): ActionResult {
  const mid = state.monthFlags.includes('urgentMid')
  if (!mid && !state.monthFlags.includes('urgent')) return fail('本月无紧急采购机会')
  if (state.extraBuys.some((e) => e.kind === 'urgent' && e.materialId === materialId)) return fail('该原料本月已紧急采购')
  const d = derive(state)
  const qty = lotQty(state, materialId, mid ? 'mid' : 'small')
  if (qty <= 0) return fail('该原料本月无供给')
  const unit = materialPriceAt(materialId, (d.materials[materialId]?.tierShift ?? 0) + (mid ? 1 : 2))
  return extraBuy(state, materialId, 'urgent', qty, unit, mid ? '紧急采购（中批 · 价格 +1 档）' : '紧急采购（小批 · 价格 +2 档）')
}

/** C10 清仓：每类原料 1 次。小批 -2 档；强化版中批 -2 档。不占档数。 */
export function clearanceBuy(state: GameState, materialId: string): ActionResult {
  const mid = state.monthFlags.includes('clearanceMid')
  if (!mid && !state.monthFlags.includes('clearance')) return fail('本月无清仓采购机会')
  if (state.extraBuys.some((e) => e.kind === 'clearance' && e.materialId === materialId)) return fail('该原料本月已清仓采购')
  const d = derive(state)
  const qty = lotQty(state, materialId, mid ? 'mid' : 'small')
  if (qty <= 0) return fail('该原料本月无供给')
  const unit = materialPriceAt(materialId, (d.materials[materialId]?.tierShift ?? 0) - 2)
  return extraBuy(state, materialId, 'clearance', qty, unit, mid ? '清仓采购（中批 · 价格 -2 档）' : '清仓采购（小批 · 价格 -2 档）')
}

/** C7 原料替换：按账面单价出售 5 单位任一原料，按当前价格购入 5/7 单位另一种原料。每月 1 次，不占档数、不影响损益。 */
export function swapMaterials(state: GameState, sellId: string, buyId: string): ActionResult {
  const plus = state.monthFlags.includes('swapPlus')
  if (!plus && !state.monthFlags.includes('swap')) return fail('本月无原料替换机会')
  if (state.extraBuys.some((e) => e.kind === 'swap')) return fail('原料替换本月已使用')
  if (sellId === buyId) return fail('出售与购入原料不能相同')
  const d = derive(state)
  const sell = state.materials[sellId]
  if (!sell || sell.qty <= 0) return fail('出售原料无库存')
  const buyUnit = materialPriceAt(buyId, d.materials[buyId]?.tierShift ?? 0)
  const buyQty = Math.min(plus ? 7 : 5, d.materials[buyId]?.supply ?? 0)
  if (buyQty <= 0) return fail('购入原料本月无供给')
  const sellQty = Math.min(5, sell.qty)
  const sellUnit = sell.value / sell.qty
  const sellTotal = sellUnit * sellQty
  if (state.cash + sellTotal < buyUnit * buyQty) return fail('现金不足（出售所得抵付后仍缺口）')
  sell.value = Math.max(0, sell.value - sellTotal)
  sell.qty -= sellQty
  state.cash += sellTotal
  const added = addMaterial(state, buyId, buyQty, buyUnit, false, true)
  if (added <= 0) {
    sell.value += sellTotal
    sell.qty += sellQty
    state.cash -= sellTotal
    return fail('仓容已满，无法接收购入原料')
  }
  state.extraBuys.push({ kind: 'swap', materialId: buyId, qty: added, price: buyUnit, used: true })
  state.monthLedger.push({
    dept: 'buy',
    item: `原料替换：出售 ${nameOf(sellId)} ×${sellQty}`,
    debit: '现金',
    credit: `库存 ${nameOf(sellId)}`,
    debitAmt: Math.round(sellTotal),
    creditAmt: Math.round(sellTotal),
    detail: [`按账面单价 ${(sellUnit / 10).toFixed(2)}w × ${sellQty} 单位`, '资产转现金，不计损益（不进销售收入/成本）'],
  })
  state.monthLedger.push({
    dept: 'buy',
    item: `原料替换：购入 ${nameOf(buyId)} ×${added}`,
    debit: `库存 ${nameOf(buyId)}`,
    credit: '现金',
    debitAmt: added * buyUnit,
    creditAmt: added * buyUnit,
    detail: [`${added} 单位 × ${(buyUnit / 10).toFixed(2)}w（当前档位价，不占档数）`],
  })
  pushLog(state, 'action', `原料替换：${nameOf(sellId)} ×${sellQty} → ${nameOf(buyId)} ×${added}`, [])
  return { ok: true, msg: `出 ${sellQty} 入 ${added} 单位` }
}

/** 长期协议。 */
export function agreementSlots(state: GameState): number {
  const d = derive(state)
  let base = state.depts.buy.staff >= 3 ? 1 : 0
  if (state.depts.buy.staff >= 5) base = 2
  base += d.flags.includes('agreementDouble') ? 2 : 0
  if (state.ipOwned.includes('J2')) base += 1
  base += d.agreeSlotsPlus ?? 0 // C14 供应合约 / 员工联动：协议槽 +N
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
    /** 手续费当期费用化（事件与杂项支出）：只扣现金不记费用会破恒等式 */
    state.miscExpense += 10
    state.flags['agreementsSigned'] = (state.flags['agreementsSigned'] ?? 0) + 1
    state.monthLedger.push({
      dept: 'buy',
      item: '协议手续费',
      debit: '财务费用',
      credit: '现金',
      debitAmt: 10,
      creditAmt: 10,
      detail: ['签订长期协议的费用 1w（1 AP 不占现金），当期确认'],
    })
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
  state.monthLedger.push({
    dept: 'buy',
    item: `供应商开发 ${def.name}`,
    debit: '财务费用',
    credit: '现金',
    debitAmt: 30,
    creditAmt: 30,
    detail: ['开发费 3w 当期确认（事件与杂项支出）', '基础供给 +2，立即生效'],
  })
  pushLog(state, 'action', `供应商开发：${def.name}`, [`基础供给 +2（当前 ${cur + 2}）`])
  return { ok: true, msg: `供给 +2` }
}

// ════════════════════════════════════════════════════════════
// 生产
// ════════════════════════════════════════════════════════════

export function buyEquipment(state: GameState, shopId: string): ActionResult {
  const model = EQUIPMENT_MODELS[shopId]
  if (!model) return fail('未知设备')
  if (state.mode === 'core') return fail('核心模式先计划、结算时统一购置')
  if (state.cash < model.price) return fail('现金不足')
  state.cash -= model.price
  pushEquipment(state, model.id, model.price, '商店购置')
  return { ok: true, msg: `每名生产人员产能 +${model.cap}` }
}

/** 设备入账公共路径（商店 / 事件 / 设备计划）：资本化实付对价，型号决定产能/折旧/额度；事件白送设备传 withLedger=false（资产由营业外收入平衡）。 */
function pushEquipment(state: GameState, modelId: string, paid: Money, source: string, withLedger = true): void {
  const model = EQUIPMENT_MODELS[modelId]
  if (!model) return
  state.equipment.push({
    id: `${modelId}-${state.month}-${state.equipment.length}`,
    model: modelId,
    name: model.name,
    cap: model.cap,
    depreciation: model.depreciation,
    creditLine: model.creditLine,
    cost: paid,
    accumulated: 0,
    purchasedAt: state.month,
  })
  state.flags['capexQ'] = (state.flags['capexQ'] ?? 0) + 1
  if (withLedger) {
    state.monthLedger.push({
      dept: 'make',
      item: `设备购置 ${model.name}`,
      debit: '固定资产',
      credit: '现金',
      debitAmt: paid,
      creditAmt: paid,
      detail: [
        `现金支出 ${(paid / 10).toFixed(2)}w 资本化为固定资产（不计入当期损益）[${source}]`,
        `月折旧 ${(model.depreciation / 10).toFixed(2)}w 为非现金费用，逐月进生产费用`,
      ],
    })
  }
  pushLog(state, 'action', `购置设备【${model.name}】`, [
    `${(paid / 10).toFixed(2)}w（${source}）`,
    `每名生产人员产能 +${model.cap}${state.depts.make.staff > 0 ? `（现有 ${state.depts.make.staff} 人：本月产能 +${state.depts.make.staff * model.cap}）` : '（暂无生产人员，产能不增益）'}`,
  ])
}

/** 事件/卡牌 note 中的设备型号标记（'设备 +1 · eq-xxx'）；无标记 = 商店标准设备。 */
function equipmentModelOf(marker: string): string {
  if (marker.includes('eq-liquidation')) return 'eq-liquidation'
  if (marker.includes('eq-used')) return 'eq-used'
  return 'eq-line'
}

/** 结算时执行核心模式设备购置计划：付款资本化（当月产能与折旧生效），清空计划清单。 */
export function executePlannedEquipment(state: GameState): void {
  if (state.mode !== 'core' || state.plan.equipment.length === 0) return
  for (const modelId of state.plan.equipment) {
    const model = EQUIPMENT_MODELS[modelId]
    if (!model) continue
    state.cash -= model.price
    pushEquipment(state, modelId, model.price, '设备计划')
  }
  state.plan.equipment = []
}

/** 计划设备：各型号购置计划（核心模式）的现金预留与产能/折旧预期（含 IP 设备产能加成）。 */
export function plannedEquipmentCap(state: GameState): number {
  if (state.mode !== 'core') return 0
  const d = derive(state)
  return state.plan.equipment.reduce((sum, id) => sum + (EQUIPMENT_MODELS[id]?.cap ?? EQUIP_CAP_PER_WORKER), 0)
    + state.plan.equipment.length * d.ipEquipCapacity
}

export function planEquipmentCost(state: GameState): Money {
  if (state.mode !== 'core') return 0
  return state.plan.equipment.reduce((sum, id) => sum + (EQUIPMENT_MODELS[id]?.price ?? 0), 0)
}

/** 核心模式设备购置计划：计划 count 台某型号（0 = 取消），预留现金、结算时统一付款入库。 */
export function setPlanEquipment(state: GameState, modelId: string, count: number): ActionResult {
  if (state.mode !== 'core') return fail('仅核心模式可调整设备购置计划')
  const model = EQUIPMENT_MODELS[modelId]
  if (!model) return fail('未知设备型号')
  if (count < 0 || count > 5) return fail('单型号每月最多计划 5 台')
  const ownPlanned = state.plan.equipment.filter((id) => id === modelId).length
  const others = planEquipmentCost(state) - ownPlanned * model.price
  if (others + model.price * count + plannedPurchaseCost(state) > state.cash) return fail('可用现金不足（含采购计划）')
  const prev = state.plan.equipment.filter((id) => id !== modelId)
  state.plan.equipment = [...prev, ...Array.from({ length: count }, () => modelId)]
  pushLog(
    state, 'action',
    `设备计划：${model.name} ×${count}`,
    count
      ? [`预留现金 ${((model.price * count) / 10).toFixed(2)}w，结算时付款入库，当月产能与折旧生效`]
      : ['取消设备购置计划，预留现金释放'],
  )
  return { ok: true, msg: count ? `已计划购置 ${model.name} ${count} 台` : `${model.name} 计划已取消` }
}

export function canSetPlanEquipment(state: GameState, modelId: string, count: number): ActionResult {
  if (state.mode !== 'core') return OK
  const copy = JSON.parse(JSON.stringify(state)) as GameState
  return setPlanEquipment(copy, modelId, count)
}

/** 设置单条产品线的排产量；所有产品线共享同一个产能池。 */
export function setPlan(state: GameState, tier: Tier, qty: number) {
  if (!state.products[tier].built) return
  const other = TIERS.reduce((sum, t) => sum + (t === tier ? 0 : state.plan.quantities[t]), 0)
  const cap = Math.max(0, planCapacity(state) - other)
  state.plan.quantities[tier] = Math.max(0, Math.min(Math.floor(qty), cap))
  reconcileAcceptedOrders(state)
}

export function plannedTotal(state: GameState): number {
  return TIERS.reduce((sum, t) => sum + state.plan.quantities[t], 0)
}

export function planCapacity(state: GameState): number {
  const d = derive(state)
  const staff = state.depts.make.staff
  const planned = plannedEquipmentCap(state)
  let cap = d.capacity + staff * planned
  if (state.plan.overtime) {
    const gain = overtimeGainOf(staff, d.equipmentCapBonus + planned)
    cap += gain + (d.overtimeGainPlus ? gain : 0) // 加班补贴强化（K8+/D7+）：产能增益翻倍
  }
  return cap
}

/** 按 BOM 计算最大可生产数量。 */
export function maxProducible(state: GameState, tier: Tier): number {
  const d = derive(state)
  const bom = BOMS[tier]
  const otherCapacity = TIERS.reduce((sum, t) => sum + (t === tier ? 0 : state.plan.quantities[t]), 0)
  let max = Math.max(0, planCapacity(state) - otherCapacity)
  for (const [id, need] of Object.entries(bom.recipe)) {
    const per = Math.max(1, need - d.matSave)
    const reserved = TIERS.reduce((sum, t) => {
      if (t === tier) return sum
      const otherNeed = BOMS[t].recipe[id] ?? 0
      return sum + Math.max(0, otherNeed - d.matSave) * state.plan.quantities[t]
    }, 0)
    const avail = Math.max(0, materialAvailableForProduction(state, id) - reserved)
    max = Math.min(max, Math.floor(avail / per))
  }
  return Math.max(0, max)
}

/** 各层 BOM 可产上限（受产能与原料双重限制），供 UI 分配面板用。 */
export function maxProducibleByTier(state: GameState): Record<Tier, number> {
  const out = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) if (state.products[t].built) out[t] = maxProducible(state, t)
  return out
}

/**
 * 按 BOM 领料出库（移动加权平均）并同步记生产账务，返回本批原料成本。
 *
 * 确认生产（confirmProduction）与月末结算（§1 生产段）共用同一实现，
 * 保证两条生产路径的扣减与记账口径完全一致：
 *   领料出库：借 制造费用 / 贷 库存 X —— 库存减记额与账面价严格相等；
 *   与采购入库（借 库存 X / 贷 现金）同一库存科目，借方合计 − 贷方合计 = 期末原料存货。
 */
export function issueMaterials(state: GameState, tier: Tier, qty: number, matSave: number): Money {
  const bom = BOMS[tier]
  let materialCost = 0
  for (const [id, need] of Object.entries(bom.recipe)) {
    const per = Math.max(1, need - matSave)
    const n = per * qty
    const mat = state.materials[id]
    /** 出库按账面单价等比例结转，与入库同一份 materialCost，资产负债表恒等式不乱。 */
    const unitValue = mat.qty > 0 ? mat.value / mat.qty : 0
    const cost = unitValue * n
    mat.value -= cost
    mat.qty -= n
    materialCost += cost
    const name = MATERIAL_BY_ID[id]?.name ?? id
    state.monthLedger.push({
      dept: 'make',
      item: `原料出库 ${name}`,
      debit: '制造费用',
      credit: `库存 ${name}`,
      debitAmt: Math.round(cost),
      creditAmt: 0,
      detail: [
        `按账面单价 ${unitValue > 0 ? (unitValue / 10).toFixed(2) : '0'}w × ${n} 件`,
        '库存减记全额转入制造费用（移动加权平均），与采购入库同科目勾稽',
      ],
    })
  }
  return materialCost
}

/**
 * 成品入库的生产账务（确认生产与月末结算共用）：
 *   · 生产部分：借 存货 / 贷 制造费用，金额为折价后的本批成本；
 *   · 流水线 bonus 部分：白得的产出按本批单位成本入账是资产凭空增加，
 *     必须贷记「营业外收入」同时计入 miscIncome，
 *     否则资产增加而权益不动，恒等式会漂出 bonus × 单位成本的缺口（到售出才消化）。
 */
export function postProductionInbound(
  state: GameState,
  tier: Tier,
  produced: number,
  bonus: number,
  batchCost: Money,
  unitCostIn: number,
) {
  const bom = BOMS[tier]
  state.monthLedger.push({
    dept: 'make',
    item: `存货入库 ${bom.name} ×${produced}`,
    debit: `存货 ${bom.name}`,
    credit: '制造费用',
    debitAmt: Math.round(batchCost),
    creditAmt: 0,
    detail: [
      `成品按本批单位成本入账，制造费用对应部分结转完毕`,
      '出库成本 × 成本系数；降本差异计入生产费用，资产侧不漂移',
    ],
  })
  if (bonus > 0) {
    const bonusVal = bonus * unitCostIn
    state.miscIncome += bonusVal
    state.monthLedger.push({
      dept: 'make',
      item: `流水线入库 ${bom.name} ×${bonus}`,
      debit: `存货 ${bom.name}`,
      credit: '营业外收入',
      debitAmt: Math.round(bonusVal),
      creditAmt: Math.round(bonusVal),
      detail: [
        `每 5 件额外入库 1 件（生产 5 人），按本批单位成本 ${unitCostIn > 0 ? (unitCostIn / 10).toFixed(2) : '0'}w 计价`,
        '贷记营业外收入：资产与权益同步增加，恒等式不漂移',
      ],
    })
  }
}

/**
 * 确认生产安排：立即按 BOM 扣料、成品入库，并把「原料→存货」记账到本月生产账务。
 * 与月末结算（§1 生产段）同口径：账面价等比例结转 + costFactor 折价入账，
 * 因此之后无论再结算几次，同一批货的成本都不会重复进利润表（确认后各线计划已清零）。
 */
export function confirmProduction(state: GameState): ActionResult {
  if (state.mode === 'core') {
    // 核心模式采用「采购计划 → 生产计划 → 销售计划 → 统一结算」，生产在结算时一次执行。
    return fail('核心模式生产在结算时统一执行')
  }
  if (plannedTotal(state) <= 0) return fail('尚未安排产量')
  const d = derive(state)
  const completed: string[] = []
  for (const tier of TIERS) {
    const want = state.plan.quantities[tier]
    if (want <= 0 || !state.products[tier].built) continue
    // 其他产品线仍占用产能与原料，本线清零后计算自身可执行量。
    state.plan.quantities[tier] = 0
    const qty = Math.min(want, maxProducible(state, tier))
    if (qty <= 0) continue
    const bom = BOMS[tier]
    const materialCost = issueMaterials(state, tier, qty, d.matSave)
    const bonus = state.depts.make.staff >= 5 ? Math.floor(qty / 5) : 0
    const batchCost = Math.round(materialCost * d.costFactor)
    const unitCostIn = qty > 0 ? batchCost / qty : 0
    const p = state.products[tier]
    p.value += batchCost + bonus * unitCostIn
    p.qty += qty + bonus
    p.avgCost = p.qty > 0 ? Math.round(p.value / p.qty) : 0
    postProductionInbound(state, tier, qty, bonus, batchCost, unitCostIn)
    if (bonus > 0) pushLog(state, 'action', `流水线效应：${bom.name} 额外入库 ${bonus} 件`)
    completed.push(`${bom.name} ${qty + bonus} 件`)
  }
  for (const tier of TIERS) state.plan.quantities[tier] = 0
  return completed.length
    ? { ok: true, msg: `${completed.join('、')}已入库` }
    : fail('原料不足，先采购')
}

export function toggleOvertime(state: GameState): ActionResult {
  const staff = state.depts.make.staff
  if (staff < 3) return fail('需要生产 3 人解锁')
  if (state.plan.overtime) {
    return { ok: true, msg: '加班已选定，本月内不可取消（费用不退还）' }
  }
  const d = derive(state)
  let cost = overtimeCostOf(d.salaryPer.make, staff)
  if (d.overtimeHalf) cost = Math.round(cost / 2) // 加班补贴（K8 本月 / D7 长期）：减半
  if (state.cash < cost) return fail('现金不足')
  // 发生时直接支付（非工资式计提下月实付）：安排即扣现金，选定后不可取消、费用不退（清生产计划不影响）
  state.plan.overtime = true
  state.overtimePaid = cost
  state.cash -= cost
  let gain = overtimeGainOf(staff, d.equipmentCapBonus + plannedEquipmentCap(state))
  if (d.overtimeGainPlus) gain += overtimeGainOf(staff, d.equipmentCapBonus + plannedEquipmentCap(state)) // K8 强化 / D7 强化：加班产能 +1× 员工产能
  const baseCost = cost * (d.overtimeHalf ? 2 : 1)
  return {
    ok: true,
    msg: `加班已安排（发生支付 2× 生产工资 ${(baseCost / 10).toFixed(2)}w${d.overtimeHalf ? `，加班补贴减半后实付 ${(cost / 10).toFixed(2)}w` : ''}，选定后不可取消、费用不退；本月产能 +${gain}）`,
  }
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

// ════════════════════════════════════════════════════════════
// 采购资源（点）：供给加点 / 议价共用池（月初清零）
// ════════════════════════════════════════════════════════════

/** 设置某原料本月供给加点件数（0 清除；成本 = 件数 × 档位成本，与议价共用池）。 */
export function setBuySupplyAlloc(state: GameState, matId: string, units: number): void {
  const d = derive(state)
  const cost = supplyPushCostOf(matId)
  let cap = supplyPushCapOf(matId)
  if (d.supplyPushHalf) cap = Math.floor(cap / 2) // 锁价谈判（C15）：供给加点上限减半
  if (cap <= 0) {
    state.buySupplyAlloc[matId] = 0
    return
  }
  let usedOthers = 0
  for (const m of MATERIALS) {
    if (m.id === matId) continue
    usedOthers += d.buySupplyPush[m.id] * supplyPushCostOf(m.id) + d.buyPricePush[m.id] * d.buyNegotiateCost
  }
  const remaining = Math.max(0, d.buyResource - usedOthers)
  const maxUnits = Math.min(cap, Math.floor(remaining / cost))
  state.buySupplyAlloc[matId] = Math.max(0, Math.min(maxUnits, units))
}

/** 设置某原料本月议价档数（0 清除；需采购 ≥4；点数/档受卡牌修正，每料上限 2 档）。 */
export function setBuyPriceAlloc(state: GameState, matId: string, tiers: number): void {
  const d = derive(state)
  if (state.depts.buy.staff < BUY_PRICE_NEGOTIATE_STAFF) {
    if (state.buyPriceAlloc[matId]) state.buyPriceAlloc[matId] = 0
    return
  }
  let usedOthers = 0
  for (const m of MATERIALS) {
    if (m.id === matId) continue
    usedOthers += d.buySupplyPush[m.id] * supplyPushCostOf(m.id) + d.buyPricePush[m.id] * d.buyNegotiateCost
  }
  const current = d.buyPricePush[matId] * d.buyNegotiateCost
  const remaining = Math.max(0, d.buyResource - usedOthers - current)
  const maxTiers = Math.min(BUY_PRICE_NEGOTIATE_CAP, Math.floor(remaining / d.buyNegotiateCost))
  state.buyPriceAlloc[matId] = Math.max(0, Math.min(maxTiers, tiers))
}

/** 设置某层本月提价档数（0~上限；需销售 ≥4；消耗销售资源，与需求加点共用池；仅现货、该层需求 −1；S12/S15 可降点数/升上限）。 */
export function setSellPriceAlloc(state: GameState, tier: Tier, on: number): void {
  const d = derive(state)
  if (state.depts.sell.staff < SELL_PRICE_RAISE_STAFF) {
    if (state.sellPriceAlloc[tier]) state.sellPriceAlloc[tier] = 0
    return
  }
  let priceUsed = 0
  for (const t of TIERS) if (t !== tier) priceUsed += (state.sellPriceAlloc[t] ?? 0) * d.sellRaiseCost
  const remaining = Math.max(0, d.salesResource - allocUsed(state) - priceUsed)
  const maxAfford = Math.floor(remaining / d.sellRaiseCost)
  state.sellPriceAlloc[tier] = Math.max(0, Math.min(on, d.sellRaiseCap, maxAfford))
}

/** C3 压价代价：选定本月供给 −2 的原料（null = 尚未选定，不扣）。 */
export function setC3PenaltyMat(state: GameState, matId: string | null): void {
  state.c3PenaltyMat = matId
}

/** C13 材料聚焦：选定本月聚焦原料（供给 +6/+10、价格 −1/−2 档；null = 尚未选定，不生效）。 */
export function setFocusMat(state: GameState, matId: string | null): void {
  state.focusMat = matId
}

/** 当前可用于履约的产品量：核心模式包含本月排产，完整模式沿用已入库成品。 */
export function committableProductQty(state: GameState, tier: Tier): number {
  const d = derive(state)
  return (
    state.products[tier].qty +
    (state.mode === 'core' ? state.plan.quantities[tier] : 0) +
    d.flexBonus // 灵活交付（K2）：承诺量 +5/+10（可承诺下月排产，缺口违约金）
  )
}

/** 指定订单尚可使用的履约数量，扣除强制订单和其他已接订单。 */
export function availableForOrder(state: GameState, orderId: string): number {
  const order = state.orders.find((o) => o.id === orderId)
  if (!order) return 0
  const reserved = state.orders.reduce((sum, other) => {
    if (other.id === orderId || other.tier !== order.tier) return sum
    if (other.forced || state.acceptedOrders.includes(other.id)) return sum + other.qty
    return sum
  }, 0)
  return Math.max(0, committableProductQty(state, order.tier) - reserved)
}

export function canAcceptOrder(state: GameState, orderId: string): boolean {
  const order = state.orders.find((o) => o.id === orderId)
  return !!order && !order.forced && availableForOrder(state, orderId) >= order.qty
}

/**
 * 排产减少时，按接单先后保留仍可足额履约的订单；超出可承诺量的订单恢复为未选择状态。
 * 不标记为“已放弃”，以便玩家增加排产后重新选择。
 */
export function reconcileAcceptedOrders(state: GameState) {
  const reserved: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const order of state.orders) if (order.forced) reserved[order.tier] += order.qty
  const kept: string[] = []
  for (const id of state.acceptedOrders) {
    const order = state.orders.find((o) => o.id === id)
    if (!order || order.forced) continue
    if (reserved[order.tier] + order.qty <= committableProductQty(state, order.tier)) {
      reserved[order.tier] += order.qty
      kept.push(id)
    }
  }
  state.acceptedOrders = kept
}

/** 接取 / 放弃自然订单（当月决策，不接的当月失效，不跨月）。 */
export function toggleOrder(state: GameState, orderId: string): ActionResult {
  const o = state.orders.find((x) => x.id === orderId)
  if (!o) return fail('订单不存在')
  if (o.forced) return fail('强制订单不可取消')
  const d = derive(state)
  const attachFlex = (ord: Order): void => {
    if (d.flexBonus > 0 && !ord.flex) {
      // 灵活交付（K2）：接单时记录订单单价，下月交付缺口按 20%/10% 付违约金
      ord.flex = { dueMonth: state.month, unitPrice: priceAtProduct(ord.tier, ord.priceShift + d.priceShift[ord.tier]) }
    }
  }
  const acceptIdx = state.acceptedOrders.indexOf(orderId)
  const declineIdx = state.declinedOrders.indexOf(orderId)
  if (acceptIdx >= 0) {
    // 已接 → 取消，变为已放弃（取消即释放 flex 承诺）
    state.acceptedOrders.splice(acceptIdx, 1)
    state.declinedOrders.push(orderId)
    o.flex = undefined
    return { ok: true, msg: '已取消订单' }
  }
  if (!canAcceptOrder(state, orderId)) return fail('可承诺产品不足，请先增加该产品排产')
  if (declineIdx >= 0) {
    // 已放弃 → 接取
    state.declinedOrders.splice(declineIdx, 1)
    state.acceptedOrders.push(orderId)
    attachFlex(o)
    return { ok: true, msg: '已接取订单' }
  }
  // 默认状态 → 接取
  state.acceptedOrders.push(orderId)
  attachFlex(o)
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

/** 在研项目（已立项、未完成）锁定的研发人员总数：完成前不释放。 */
export function rndAssignedTotal(state: GameState): number {
  let n = 0
  for (const p of RND_PROJECTS) {
    const s = state.rnd[p.id]
    if (s?.projectId && !s.done) n += s.assigned
  }
  return n
}

/** 本月在研项目数（已立项且未完成；费用 3w × 在研数）。 */
export function rndActiveThisMonth(state: GameState): number {
  let n = 0
  for (const p of RND_PROJECTS) {
    const s = state.rnd[p.id]
    if (s?.projectId && !s.done) n += 1
  }
  return n
}

/**
 * 研发人员放置（承诺制：放入即锁定到项目完成，完成前不可减少；结算执行，跨月保留）：
 * 每放 1 人该项目 +5 进度/月、成功率 +5%（封顶见 def.rateCap）。
 * 首次放置自动立项。0 人 = 项目留在研但本月无进度（仅 API 可达，UI 不暴露）。
 */
export function setRndAssign(state: GameState, projectId: string, n: number): ActionResult {
  const def = RND_PROJECTS.find((p) => p.id === projectId)
  if (!def) return fail('未知项目')
  const slot = state.rnd[projectId]
  if (!slot) return fail('未知项目')
  if (slot.done) return fail('该项目已完成')
  if (n > 0 && def.preq && !state.rnd[def.preq].done) {
    const preq = RND_PROJECTS.find((p) => p.id === def.preq)
    return fail(`需先解锁「${preq?.name ?? def.preq}」`)
  }
  const free = state.depts.rnd.staff - (rndAssignedTotal(state) - slot.assigned)
  if (n < 0 || n > free) return fail(`可用研究员不足（可用 ${free} 人）`)
  if (n > 0 && !slot.projectId) {
    // 首次放置即立项（计入季度研发立项数）
    slot.projectId = projectId
    state.rndStartsThisMonth.push(projectId)
    state.flags['rndStartsQ'] = (state.flags['rndStartsQ'] ?? 0) + 1
    pushLog(state, 'action', `研发立项：${def.name}`, [`进度需求 ${def.need}`, `基础成功率 ${Math.round(def.rate * 100)}%`])
  }
  slot.assigned = n
  return { ok: true, msg: `已为「${def.name}」放置 ${n} 人` }
}

/**
 * 确认研发放置（承诺制，每月一次）：弹框草稿批量写回。
 * 校验：完成项目不可再放置、前置未解锁不可放置、Σ 在研有效放置 ≤ 研发人数（跨主题池）。
 * 确认后 `flags['rndConfirmed'] = 1`：本月不再可调，月初重置。
 */
export function confirmRndAssignments(state: GameState, drafts: Record<string, number>): ActionResult {
  const defs = RND_PROJECTS.filter((p) => drafts[p.id] !== undefined)
  if (!defs.length) return OK
  for (const def of defs) {
    const slot = state.rnd[def.id]
    const n = Math.max(0, drafts[def.id] ?? 0)
    if (slot.done && n > 0) return fail(`「${def.name}」已完成，无需再放置`)
    if (n > 0 && def.preq && !state.rnd[def.preq].done) {
      const preq = RND_PROJECTS.find((p) => p.id === def.preq)
      return fail(`「${def.name}」需先解锁「${preq?.name ?? def.preq}」`)
    }
  }
  // 池校验：在研项目（已立项或草稿 > 0）的有效放置总量 ≤ 研发人数
  let total = 0
  for (const p of RND_PROJECTS) {
    const slot = state.rnd[p.id]
    if (slot.done) continue
    const active = !!slot.projectId || (drafts[p.id] ?? 0) > 0
    if (!active) continue
    total += drafts[p.id] ?? slot.assigned
  }
  if (total > state.depts.rnd.staff) {
    return fail(`放置总量 ${total} 超过研发人数 ${state.depts.rnd.staff}`)
  }
  for (const def of defs) {
    const slot = state.rnd[def.id]
    const n = Math.max(0, drafts[def.id] ?? 0)
    if (n === slot.assigned) continue
    if (n > 0 && !slot.projectId) {
      // 首次放置即立项（计入季度研发立项数）
      slot.projectId = def.id
      state.rndStartsThisMonth.push(def.id)
      state.flags['rndStartsQ'] = (state.flags['rndStartsQ'] ?? 0) + 1
      pushLog(state, 'action', `研发立项：${def.name}`, [`进度需求 ${def.need}`, `基础成功率 ${Math.round(def.rate * 100)}%`])
    }
    slot.assigned = n
    pushLog(state, 'action', `研发放置：${def.name} ${n} 人`, ['承诺制：项目完成前锁定，下月初可再调'])
  }
  state.flags['rndConfirmed'] = 1
  return { ok: true, msg: '研发放置已确认，本月锁定' }
}


// ════════════════════════════════════════════════════════════
// 资金
// ════════════════════════════════════════════════════════════

export function borrow(state: GameState, amount: Money): ActionResult {
  const d = derive(state)
  if (state.debt > 0) return fail('先还清上一笔借款，再借新笔')
  if (d.noBorrow) return fail('本月无法新增借款')
  if (amount <= 0) return fail('金额无效')
  if (amount > d.creditAvailable) return fail('超出可用额度')
  if (amount % 10 !== 0) return fail('借款以 1w 为单位')
  state.cash += amount
  state.debt += amount
  const dueMonth = state.month + LOAN_TERM_MONTHS - 1
  state.loanDueMonth = dueMonth
  state.monthLedger.push({
    dept: 'ops',
    item: '借款',
    debit: '现金',
    credit: '借款',
    debitAmt: amount,
    creditAmt: amount,
    detail: [
      `到账 ${(amount / 10).toFixed(2)}w，新增负债 ${(amount / 10).toFixed(2)}w`,
      `期限 ${LOAN_TERM_MONTHS} 个月：第 ${dueMonth} 月末到期，未还部分到期强制全额归还`,
      '现金与负债同步增加，净资产不变；利息按月末余额 × 月利率确认进财务费用，提前还款可降低后续利息',
    ],
  })
  pushLog(state, 'action', `借款 ${(amount / 10).toFixed(2)}w`, [
    `月利率 ${(d.rate * 100).toFixed(1)}% · 期限 ${LOAN_TERM_MONTHS} 个月（第 ${dueMonth} 月到期）`,
    '还清前不能借新笔；提前还款按剩余余额少计利息',
  ])
  return { ok: true, msg: `到账 ${(amount / 10).toFixed(2)}w · 第 ${dueMonth} 月到期` }
}

export function repay(state: GameState, amount: Money): ActionResult {
  if (amount <= 0) return fail('金额无效')
  if (amount > state.debt) return fail('超出借款总额')
  if (amount > state.cash) return fail('现金不足')
  state.cash -= amount
  state.debt -= amount
  const cleared = state.debt === 0
  if (cleared) state.loanDueMonth = 0
  state.monthLedger.push({
    dept: 'ops',
    item: '还款',
    debit: '借款',
    credit: '现金',
    debitAmt: amount,
    creditAmt: amount,
    detail: [
      `归还 ${(amount / 10).toFixed(2)}w，负债同步减少`,
      cleared ? '已全部还清：期限约束解除，可再借新笔' : '提前还款：后续月份利息按剩余余额计提，降低利息费用',
    ],
  })
  pushLog(state, 'action', cleared ? `还款 ${(amount / 10).toFixed(2)}w（已还清）` : `还款 ${(amount / 10).toFixed(2)}w`)
  return { ok: true, msg: cleared ? '已还清，可再借新笔' : `已还 ${(amount / 10).toFixed(2)}w` }
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
       * 设备按**实际支付的对价**入账，型号由 extra 标记决定（eq-line/eq-used/eq-liquidation）。
       * 若事件白送设备（无现金对价），按公允价值确认为营业外收入，
       * 否则资产增加而权益不动，恒等式同样会失衡。
       */
      const modelId = equipmentModelOf(opt.extra ?? '')
      const paid = opt.cost?.cash ?? 0
      if (paid > 0) {
        // 现金对价已在调用方扣减；资本支出记账（借 固定资产 / 贷 现金），预算页「设备购置」行以台账行为准
        pushEquipment(state, modelId, paid, '事件对价')
      } else {
        state.miscIncome += 50
        pushEquipment(state, modelId, 50, '事件白送（公允价值）', false)
      }
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
        pushLog(state, 'event', `获得临时知识产权【${gift.name}】（本月有效）`)
      }
    }
    if (opt.extra.includes('管理人员 +1') && state.depts.ops.staff < 5) {
      state.depts.ops.staff += 1
      state.depts.ops.hired += 1
      state.flags['opsHired'] = (state.flags['opsHired'] ?? 0) + 1
      checkAchievements(state)
    }
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
      pushLog(state, 'event', `获得临时知识产权【${gift.name}】（本月有效）`)
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
       * 型号由 note 标记决定（eq-line/eq-used/eq-liquidation）。
       */
      const modelId = equipmentModelOf(note)
      if (equipmentConsideration > 0) {
        // 现金对价已在调用方扣减；资本支出记账（借 固定资产 / 贷 现金），预算页「设备购置」行以台账行为准
        pushEquipment(state, modelId, equipmentConsideration, '事件对价')
      } else {
        state.miscIncome += 50
        pushEquipment(state, modelId, 50, '事件白送（公允价值）', false)
      }
    }
    if (note.includes('管理人员 +1') && state.depts.ops.staff < 5) {
      state.depts.ops.staff += 1
      state.depts.ops.hired += 1
      state.flags['opsHired'] = (state.flags['opsHired'] ?? 0) + 1
      checkAchievements(state)
    }
    if (note.includes('解雇 1 人')) state.monthFlags.push('canFire')
    if (note.includes('额外招聘 1 人')) state.monthFlags.push('extraHire')

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
    if (note.includes('现金 +10w')) {
      /**
       * 政府纾困（无息贷款）：当月收到现金，负债侧由下方 pendingCost 挂账，
       * 资产与负债同步增加、损益中性——不进 miscIncome（否则权益多增、恒等式失衡），
       * 记入 eventCashGift 供预算桥接展示本笔流入。
       */
      state.cash += 100
      state.eventCashGift += 100
    }
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
