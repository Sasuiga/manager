import {
  BASE_AP,
  BASE_CREDIT_LINE,
  BASE_DEMAND,
  BASE_HAND,
  BASE_PLAYS,
  BASE_SALES_RESOURCE,
  BUY_LOT_SLOTS,
  BOMS,
  CARD_BY_ID,
  CLIMATE_DEMAND,
  CLIMATE_MATERIAL,
  DEPT_ORDER,
  IP_BY_ID,
  MAKER_CAP_NO_SLOT,
  MAKER_CAP_WITH_SLOT,
  MATERIALS,
  MONTHLY_RATE,
  OVERTIME_COST,
  PRODUCT_PRICE,
  RND_COST_PER_PROJECT,
  SALES_ORDER_COUNT,
  SALES_RESOURCE_STEPS,
  STAFF,
  TIER_BONUS,
  TIERS,
  priceOf,
} from '../data/game'
import { hireCost } from './actions'
import type { CardPlayEffect, Dept, GameState, MonthMods, Tier } from './types'

/**
 * 派生层：把「气候 + 事件 + 已打出的卡 + 已激活知产 + 人员」汇总成一组
 * 只读的月度数值，供界面预览与结算共用。
 *
 * 关键约定：预览与结算走同一套 `derive()`，因此界面上的「预计值」
 * 与月底实际过账的数字必然一致。
 */

export interface DerivedTotals {
  /** 每类原料的供给 / 价格档位 / 库存上限 */
  materials: Record<string, { supply: number; tierShift: number; price: number; cap: number }>
  /** 分层需求 */
  demand: Record<Tier, number>
  /** 分层售价档位偏移 */
  priceShift: Record<Tier, number>
  /** 分层单价 */
  price: Record<Tier, number>
  /** 本月产能 */
  capacity: number
  /** 每名员工薪酬（角） */
  salaryPer: Record<Dept, number>
  /** 总薪酬（角） */
  salaryTotal: number
  /** 本月借款利率（月，小数） */
  rate: number
  /** 本月利息（角） */
  interest: number
  /** 本月借款额度（角） */
  creditLine: number
  /** 可用借款（额度 - 已借） */
  creditAvailable: number
  noBorrow: boolean
  /** 销售资源 */
  salesResource: number
  /** 品牌加成 */
  brandBonus: number
  /** 本月将到账的确定性订单数 */
  orderCount: number
  orderQty: number
  orderPriceShift: number
  /** 采购可选档数 */
  buyLots: number
  /** 采购总价格档位修正 */
  buyTierShift: number
  /** 研发 */
  rndProgress: number
  rndRate: number
  rndCost: number
  rndCostTotal: number
  /** 每月解雇 / 招聘等特殊标记 */
  flags: string[]
  /** 制造成本系数 */
  costFactor: number
  /** 本月 AP 上限 */
  apMax: number
  /** 本月可打牌数 */
  playsMax: number
  handMax: number
  drawN: number
  drawM: number
  /** 原料单件节省（工艺优化） */
  matSave: number
  notes: string[]
  /** 各部门本月费用明细：{ 项目, 报表科目, 金额 } */
  deptExpenses: Record<Dept, { item: string; account: string; value: number }[]>
}

/** 合并多个 MonthMods，后者叠加到前者之上。 */
export function mergeMods(...list: (MonthMods | undefined)[]): MonthMods {
  const out: MonthMods = {}
  for (const m of list) {
    if (!m) continue
    if (m.materials) {
      out.materials = out.materials ?? {}
      for (const [k, v] of Object.entries(m.materials)) {
        const cur = out.materials[k] ?? { supply: 0, tierShift: 0 }
        out.materials[k] = { supply: cur.supply + v.supply, tierShift: cur.tierShift + v.tierShift }
      }
    }
    out.allSupply = (out.allSupply ?? 0) + (m.allSupply ?? 0)
    out.allTierShift = (out.allTierShift ?? 0) + (m.allTierShift ?? 0)
    out.capacity = (out.capacity ?? 0) + (m.capacity ?? 0)
    out.salaryPer = (out.salaryPer ?? 0) + (m.salaryPer ?? 0)
    out.rateShift = (out.rateShift ?? 0) + (m.rateShift ?? 0)
    out.buyLots = (out.buyLots ?? 0) + (m.buyLots ?? 0)
    out.rndProgress = (out.rndProgress ?? 0) + (m.rndProgress ?? 0)
    out.rndRate = (out.rndRate ?? 0) + (m.rndRate ?? 0)
    out.rndCost = (out.rndCost ?? 0) + (m.rndCost ?? 0)
    out.salesResource = (out.salesResource ?? 0) + (m.salesResource ?? 0)
    out.ap = (out.ap ?? 0) + (m.ap ?? 0)
    out.plays = (out.plays ?? 0) + (m.plays ?? 0)
    out.orders = (out.orders ?? 0) + (m.orders ?? 0)
    out.drawBonus = (out.drawBonus ?? 0) + (m.drawBonus ?? 0)
    out.handBonus = (out.handBonus ?? 0) + (m.handBonus ?? 0)
    /**
     * orderQty 是「覆盖」语义而非累加：只有真正声明过数量的事件/卡牌才该改变它。
     * 若写成 Math.max(out.orderQty ?? 0, m.orderQty ?? 0)，
     * 未声明数量的每一条 mods 都会把值压成 0，
     * 下游的 `mods.orderQty ?? 10` 便永远取不到基准 10，订单量恒为 1 件。
     */
    if (m.orderQty != null) out.orderQty = Math.max(out.orderQty ?? 0, m.orderQty)
    out.orderPriceShift = (out.orderPriceShift ?? 0) + (m.orderPriceShift ?? 0)
    out.costFactor = (out.costFactor ?? 1) * (m.costFactor ?? 1)
    if (m.creditFactor != null) out.creditFactor = Math.min(out.creditFactor ?? 1, m.creditFactor)
    if (m.noBorrow) out.noBorrow = true
    if (m.demand) {
      out.demand = out.demand ?? {}
      for (const t of TIERS) out.demand[t] = (out.demand[t] ?? 0) + (m.demand[t] ?? 0)
    }
    if (m.price) {
      out.price = out.price ?? {}
      for (const t of TIERS) out.price[t] = (out.price[t] ?? 0) + (m.price[t] ?? 0)
    }
    if (m.carryoverPrice) {
      out.carryoverPrice = out.carryoverPrice ?? {}
      for (const t of TIERS) out.carryoverPrice[t] = (out.carryoverPrice[t] ?? 0) + (m.carryoverPrice[t] ?? 0)
    }
    if (m.tempIps) out.tempIps = [...(out.tempIps ?? []), ...m.tempIps]
    if (m.notes) out.notes = [...(out.notes ?? []), ...m.notes]
  }
  return out
}

/** 把一张卡的 CardPlayEffect 转成 MonthMods。 */
export function cardEffectToMods(e: CardPlayEffect): { mods: MonthMods; flags: string[] } {
  const mods: MonthMods = {}
  if (e.buyTierShift) mods.allTierShift = (mods.allTierShift ?? 0) + e.buyTierShift
  if (e.buySupply) mods.allSupply = (mods.allSupply ?? 0) + e.buySupply
  if (e.buyLots) mods.buyLots = (mods.buyLots ?? 0) + e.buyLots
  if (e.capacity) mods.capacity = (mods.capacity ?? 0) + e.capacity
  if (e.costFactor != null && e.costFactor !== 1) mods.costFactor = e.costFactor
  if (e.salary) mods.salaryPer = (mods.salaryPer ?? 0) + e.salary
  if (e.rndProgress) mods.rndProgress = (mods.rndProgress ?? 0) + e.rndProgress
  if (e.rndRate) mods.rndRate = (mods.rndRate ?? 0) + e.rndRate
  if (e.rndCost) mods.rndCost = (mods.rndCost ?? 0) + e.rndCost
  if (e.salesResource) mods.salesResource = (mods.salesResource ?? 0) + e.salesResource
  if (e.orders) mods.orders = (mods.orders ?? 0) + e.orders
  if (e.orderQty) mods.orderQty = Math.max(mods.orderQty ?? 0, e.orderQty)
  if (e.ap) mods.ap = (mods.ap ?? 0) + e.ap
  if (e.plays) mods.plays = (mods.plays ?? 0) + e.plays
  if (e.priceShift) mods.price = { ...(mods.price ?? {}), ...mergeTier(e.priceShift) }
  if (e.demand) mods.demand = { ...(mods.demand ?? {}), ...mergeTier(e.demand) }
  return { mods, flags: (e.flags ?? []).filter(Boolean) }
}

function mergeTier(r: Record<Tier, number>): Partial<Record<Tier, number>> {
  const out: Partial<Record<Tier, number>> = {}
  for (const t of TIERS) if (r[t]) out[t] = r[t]
  return out
}

/** 当前已激活的知识产权列表（含事件带来的临时知产）。 */
export function activeIps(state: GameState): string[] {
  const out: string[] = []
  for (const id of state.ipActive) if (id) out.push(id)
  for (const id of state.monthMods.tempIps ?? []) {
    if (id === 'normal' || id === 'strong') {
      // 事件临时知产：从对应池中挑一个尚未拥有的
      const owned = new Set(state.ipOwned)
      const candidates = Object.values(IP_BY_ID).filter((ip) => ip.pool === id && !owned.has(ip.id))
      if (candidates.length) out.push(candidates[state.seed % candidates.length].id)
    } else if (IP_BY_ID[id]) out.push(id)
  }
  return out
}

/** 汇总知产效果。 */
function ipEffects(ids: string[]) {
  const acc = {
    matSave: 0,
    equipCapacity: 0,
    matSupply: 0,
    salesResource: 0,
    interestSave: 0,
    capacityBonus: 0,
    rndProgress: 0,
    priceShift: 0,
    orderBonus: 0,
    salarySave: 0,
    agreementSlots: 0,
    brandBonus: 0,
    costTransfer: false,
    cardCopy: false,
    rndRate: 0,
    creditLine: 0,
    rateSave: 0,
    orderPriceShift: 0,
  }
  for (const id of ids) {
    const e = IP_BY_ID[id]?.effect
    if (!e) continue
    acc.matSave += e.matSave ?? 0
    acc.equipCapacity += e.equipCapacity ?? 0
    acc.matSupply += e.matSupply ?? 0
    acc.salesResource += e.salesResource ?? 0
    acc.interestSave += e.interestSave ?? 0
    acc.capacityBonus += e.capacityBonus ?? 0
    acc.rndProgress += e.rndProgress ?? 0
    acc.priceShift += e.priceShift ?? 0
    acc.orderBonus += e.orderBonus ?? 0
    acc.salarySave += e.salarySave ?? 0
    acc.agreementSlots += e.agreementSlots ?? 0
    acc.brandBonus += e.brandBonus ?? 0
    acc.costTransfer = acc.costTransfer || !!e.costTransfer
    acc.cardCopy = acc.cardCopy || !!e.cardCopy
    acc.rndRate += e.rndRate ?? 0
    acc.creditLine += e.creditLine ?? 0
    acc.rateSave += e.rateSave ?? 0
    acc.orderPriceShift += e.orderPriceShift ?? 0
  }
  return acc
}

/**
 * 核心派生。
 * 将气候、事件与本月已打出卡牌的效果全部叠加后，算出所有月度数值。
 */
export function derive(state: GameState): DerivedTotals {
  const staffCount: Record<Dept, number> = {
    ops: state.depts.ops.staff,
    buy: state.depts.buy.staff,
    make: state.depts.make.staff,
    sell: state.depts.sell.staff,
    rnd: state.depts.rnd.staff,
  }

  const ips = activeIps(state)
  const ip = ipEffects(ips)

  // ── 气候 + 事件 + 卡牌 三层修饰合并 ──
  const climateMat = CLIMATE_MATERIAL[state.climate]
  const climateMods: MonthMods = {
    materials: Object.fromEntries(
      MATERIALS.map((m) => [m.id, { supply: climateMat.supply[m.id] ?? 0, tierShift: climateMat.tierShift[m.id] ?? 0 }]),
    ),
  }
  const mods = mergeMods(climateMods, state.monthMods, state.cardMods)

  // ── 原料 ──
  const buyStaffSupply = staffCount.buy * 2
  const materials: DerivedTotals['materials'] = {}
  for (const m of MATERIALS) {
    const mm = mods.materials?.[m.id] ?? { supply: 0, tierShift: 0 }
    const developed = state.materialsDeveloped[m.id] ?? 0
    const supply = Math.max(0, m.baseSupply + developed + mm.supply + (mods.allSupply ?? 0) + buyStaffSupply + ip.matSupply)
    let shift = mm.tierShift + (mods.allTierShift ?? 0)
    if (staffCount.buy >= 4) shift -= 1 // 采购 4 人：所有原料价格降 1 档
    shift -= ip.priceShift > 0 && state.ipOwned.includes('I8') ? 0 : 0 // 质量认证作用于售价，不作用于原料
    shift = Math.max(-3, Math.min(3, shift))
    const cap = m.baseCapacity + ip.capacityBonus
    materials[m.id] = { supply, tierShift: shift, price: priceOf(m, shift), cap }
  }

  // ── 需求 ──
  const totalShift = CLIMATE_DEMAND[state.climate]
  const lowShare = Math.ceil(Math.abs(totalShift) * 0.6) * Math.sign(totalShift)
  const midShare = Math.floor(Math.abs(totalShift) * 0.4) * Math.sign(totalShift)
  const demand: Record<Tier, number> = {
    low: Math.max(0, BASE_DEMAND.low + lowShare + (mods.demand?.low ?? 0)),
    mid: Math.max(0, BASE_DEMAND.mid + midShare + (mods.demand?.mid ?? 0)),
    high: Math.max(0, BASE_DEMAND.high + (mods.demand?.high ?? 0)),
    special: Math.max(0, BASE_DEMAND.special + (mods.demand?.special ?? 0)),
  }

  // ── 售价档位 ──
  const priceShift: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) {
    priceShift[t] = (mods.price?.[t] ?? 0) + (mods.carryoverPrice?.[t] ?? 0) + ip.priceShift
  }
  // 成本转移（销售 5 人 / J4）：原料涨价时售价同步升 1 档
  const costTransferUnlocked = staffCount.sell >= 5 || ip.costTransfer
  if (costTransferUnlocked) {
    const worst = Math.max(0, ...Object.values(materials).map((m) => m.tierShift))
    if (worst > 0) for (const t of TIERS) priceShift[t] += 1
  }
  const price: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) price[t] = productPriceRaw(t, priceShift[t])

  // ── 产能 ──
  const slots = state.equipment.length
  const equipCap = state.equipment.reduce((a, e) => a + e.capacity + ip.equipCapacity, 0)
  const placed = Math.min(staffCount.make, slots)
  const unplaced = Math.max(0, staffCount.make - slots)
  let makerCap = 0
  const per = makerPerStaff(staffCount.make)
  makerCap += placed * per + unplaced * MAKER_CAP_NO_SLOT
  const capacity = Math.max(0, equipCap + makerCap + (mods.capacity ?? 0))

  // ── 薪酬 ──
  const salaryPer: Record<Dept, number> = { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }
  let salaryTotal = 0
  for (const d of DEPT_ORDER) {
    const base = STAFF[d].salary - ip.salarySave
    const v = Math.max(0, base + (mods.salaryPer ?? 0))
    salaryPer[d] = v
    salaryTotal += v * staffCount[d]
  }

  // ── 资金 ──
  const rate = Math.max(0, MONTHLY_RATE + (mods.rateShift ?? 0) * 0.001 - ip.rateSave * 0.001)
  const interest = Math.max(0, Math.round(state.debt * rate) - ip.interestSave)
  const equipCredit = state.equipment.reduce((a, e) => a + e.creditLine, 0)
  const creditLine = Math.round((BASE_CREDIT_LINE + equipCredit + ip.creditLine) * (mods.creditFactor ?? 1))

  // ── 销售 ──
  const salesResource = BASE_SALES_RESOURCE + salesResourceFromStaff(Math.min(5, staffCount.sell)) + ip.salesResource + (mods.salesResource ?? 0)
  const brandBonus = (staffCount.sell >= 5 ? 3 : 0) + ip.brandBonus
  const orderCount = SALES_ORDER_COUNT[Math.min(5, staffCount.sell)] + ip.orderBonus + (mods.orders ?? 0)
  const orderQty = mods.orderQty ?? 10
  const orderPriceShift = 1 + ip.orderPriceShift + (mods.orderPriceShift ?? 0)

  // ── 采购 ──
  const buyLots = BUY_LOT_SLOTS[Math.min(5, staffCount.buy)] + (mods.buyLots ?? 0)

  // ── 研发 ──
  const rndProgress = staffCount.rnd * 2 + (mods.rndProgress ?? 0) + ip.rndProgress
  const rndRate = staffCount.rnd * 5 + (mods.rndRate ?? 0) + ip.rndRate
  const hasProject = Object.values(state.rnd).some((s) => s.projectId && !s.done)
  const rndCost = RND_COST_PER_PROJECT + (mods.rndCost ?? 0)
  const rndCostTotal = hasProject ? Math.max(0, rndCost) : 0

  // ── 运营 ──
  const apMax = BASE_AP + Math.max(0, staffCount.ops - 1) + (mods.ap ?? 0)
  const playsMax = (staffCount.ops >= 4 ? 3 : BASE_PLAYS) + (mods.plays ?? 0)
  let handMax = BASE_HAND
  if (staffCount.ops >= 3) handMax += 1
  if (staffCount.ops >= 5) handMax += 1
  handMax += mods.handBonus ?? 0
  let drawM = 3
  if (staffCount.ops >= 2) drawM += 1
  if (staffCount.ops >= 5) drawM += 1
  const drawN = drawM + 2 + (mods.drawBonus ?? 0)

  const salaryTotalAdj = salaryTotal
  const noBorrow = !!mods.noBorrow

  // ── 各部门费用明细 ──
  const overtimeCost = state.plan.overtime && state.depts.make.staff >= 3 ? OVERTIME_COST : 0
  let makeDepreciation = 0
  for (const e of state.equipment) {
    makeDepreciation += Math.min(e.depreciation, Math.max(0, e.cost - e.accumulated))
  }
  /** 招聘费当月直接计入管理费用（miscExpense），按本月招聘人数 × 招聘费展示 */
  const hireThisMonth: Record<Dept, number> = {
    ops: state.flags[`hireMonth:ops:${state.month}`] ?? 0,
    buy: state.flags[`hireMonth:buy:${state.month}`] ?? 0,
    make: state.flags[`hireMonth:make:${state.month}`] ?? 0,
    sell: state.flags[`hireMonth:sell:${state.month}`] ?? 0,
    rnd: state.flags[`hireMonth:rnd:${state.month}`] ?? 0,
  }
  const deptHires: Record<Dept, { item: string; account: string; value: number }[]> = {
    ops: [], buy: [], make: [], sell: [], rnd: [],
  }
  for (const dp of DEPT_ORDER) {
    const rows: { item: string; account: string; value: number }[] = []
    if (salaryPer[dp] * staffCount[dp] > 0) {
      const acc = dp === 'make' ? '制造费用' : dp === 'rnd' ? '研发费用' : '管理费用'
      rows.push({ item: '工资', account: acc, value: salaryPer[dp] * staffCount[dp] })
    }
    if (dp === 'make') {
      if (makeDepreciation > 0) rows.push({ item: '设备折旧', account: '制造费用', value: makeDepreciation })
      if (overtimeCost > 0) rows.push({ item: '加班费', account: '制造费用', value: overtimeCost })
    }
    if (dp === 'rnd' && rndCostTotal > 0) {
      rows.push({ item: '研发投入', account: '研发费用', value: rndCostTotal })
    }
    if (hireThisMonth[dp] > 0) {
      const fee = hireCost(state, dp)
      if (fee > 0) rows.push({ item: '招聘费', account: '管理费用', value: fee * hireThisMonth[dp] })
    }
    deptHires[dp] = rows
  }
  const deptExpenses = deptHires

  return {
    materials,
    demand,
    priceShift,
    price,
    capacity,
    salaryPer,
    salaryTotal: salaryTotalAdj,
    rate,
    interest,
    creditLine,
    creditAvailable: Math.max(0, creditLine - state.debt),
    noBorrow,
    salesResource,
    brandBonus,
    orderCount: Math.max(0, orderCount),
    orderQty,
    orderPriceShift,
    buyLots: Math.max(1, buyLots),
    buyTierShift: mods.allTierShift ?? 0,
    rndProgress,
    rndRate,
    rndCost,
    rndCostTotal,
    flags: collectFlags(state, mods),
    costFactor: mods.costFactor ?? 1,
    apMax,
    playsMax,
    handMax: Math.max(1, handMax),
    drawN,
    drawM,
    matSave: ip.matSave,
    notes: mods.notes ?? [],
    deptExpenses,
  }
}

function productPriceRaw(tier: Tier, shift: number) {
  const arr = PRODUCT_PRICE[tier]
  const idx = Math.max(0, Math.min(4, 2 + shift))
  return arr[idx]
}

export function makerPerStaff(staff: number): number {
  let v = MAKER_CAP_WITH_SLOT
  if (staff >= 2) v += 2
  if (staff >= 4) v += 1
  return v
}

/** 销售人员带来的销售资源总量（§7.2.4 表）。 */
export function salesResourceFromStaff(n: number): number {
  let total = 0
  for (let i = 1; i <= Math.min(5, n); i++) total += SALES_RESOURCE_STEPS[i]
  return total
}

export function collectFlags(state: GameState, mods: MonthMods): string[] {
  const flags = [...(mods.notes ?? [])]
  for (const c of state.playedThisMonth) {
    const def = CARD_BY_ID[c.defId]
    if (!def) continue
    const e = (c.empowered && def.strong ? def.strong : def.base)({
      staff: {
        ops: state.depts.ops.staff,
        buy: state.depts.buy.staff,
        make: state.depts.make.staff,
        sell: state.depts.sell.staff,
        rnd: state.depts.rnd.staff,
      },
      empowered: c.empowered,
      mats: MATERIALS.map((m) => m.id),
    })
    if (e.flags) flags.push(...e.flags.filter(Boolean))
  }
  return flags
}

/** 单件标准成本（含工艺优化、知产、成本系数），用于界面预览。 */
export function unitCost(_state: GameState, tier: Tier, d: DerivedTotals): number {
  const bom = BOMS[tier]
  let cost = 0
  for (const [id, need] of Object.entries(bom.recipe)) {
    const mat = d.materials[id]
    const per = Math.max(1, need - d.matSave)
    cost += per * (mat?.price ?? 0)
  }
  return Math.round(cost * d.costFactor)
}

export { TIER_BONUS }
