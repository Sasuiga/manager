import {
  BASE_AP,
  BASE_CREDIT_LINE,
  BASE_DEMAND,
  BASE_HAND,
  BASE_SALES_RESOURCE,
  BUY_LOT_SLOTS,
  BOMS,
  CARD_BY_ID,
  CLIMATE_DEMAND,
  CLIMATE_MATERIAL,
  DEPT_ORDER,
  IP_BY_ID,
  EQUIP_CAP_PER_WORKER,
  MAKER_CAP_BASE,
  MATERIALS,
  OWNER_CAPACITY,
  MONTHLY_RATE,
  RND_COST_PER_PROJECT,
  RND_PROGRESS_PER_WORKER,
  RND_RATE_PER_WORKER,
  RND_RATE_CAP,
  RND_PROJECTS,
  PRODUCT_PRICE,
  SALES_ORDER_COUNT,
  SALES_PUSH_CAP,
  SALES_PUSH_COST,
  SALES_RESOURCE_STEPS,
  STAFF,
  TIERS,
  priceOf,
} from '../data/game'
import type { CardPlayEffect, Dept, GameState, LotSize, MonthMods, ResearchProjectDef, Tier } from './types'

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
  /** 分层需求（含销售资源加点后的总需求）。 */
  demand: Record<Tier, number>
  /** 自然需求：基础 + 气候 + 事件，不含销售资源加点。满足率类目标以此为分母。 */
  demandBase: Record<Tier, number>
  /** 本月各层实际生效的加点（受 3 倍基础需求上限截断）。 */
  salesPush: Record<Tier, number>
  /** 各层加点上限（§7.2.4）。 */
  salesPushCap: Record<Tier, number>
  /** 各层「1 点需求」的资源成本（低端 1 / 中端 2 / 高端 3 / 特殊 4）。 */
  salesPushCost: Record<Tier, number>
  /** 分层售价档位偏移 */
  priceShift: Record<Tier, number>
  /** 现货价格档位（= priceShift + 决议 D5 + 规则 K1/K5 修正）：仅现货结算与展示用，订单不受影响 */
  spotShift: Record<Tier, number>
  /** 分层单价 */
  price: Record<Tier, number>
  /** 本月产能 */
  capacity: number
  /** 设备产线合计产能加成（每人，含 IP 设备产能 I2/J1）：设备层差异化 */
  equipmentCapBonus: number
  /** IP 设备产能（I2/J1，每台每人）：设备计划预演用 */
  ipEquipCapacity: number
  /** J5 专利壁垒生效（本季可复制 1 张已打牌） */
  ipCardCopy: boolean
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
  /** 品牌加成（销售 5 人 +3 / J3）：计入销售资源池。 */
  brandBonus: number
  /** 本月将到账的确定性订单数 */
  orderCount: number
  orderQty: number
  orderPriceShift: number
  /** 采购可选档数 */
  buyLots: number
  /** 采购总价格档位修正 */
  buyTierShift: number
  /** 研发：平修正（事件/卡牌/知产），作用于每个在研项目；人员放置按项目另行计算（rndProjectOutcome） */
  rndProgress: number
  rndRate: number
  /** 本月在研项目数（已立项且放置 ≥1 人） */
  rndActiveCount: number
  rndCost: number
  rndCostTotal: number
  /** 每月解雇 / 招聘等特殊标记 */
  flags: string[]
  /** 制造成本系数 */
  costFactor: number
  /** 本月 AP 上限（打牌并入 AP 后，AP 是唯一的行动预算） */
  apMax: number
  handMax: number
  drawN: number
  drawM: number
  // ── 规则卡（K 系列，本月）聚合 ──
  /** 研发判定掷点次数（1 = 无；K4 本月 2/3） */
  rndRolls: number
  /** 加班费减半（K8 本月） */
  overtimeHalf: boolean
  /** 加班产能 +1× 员工产能（K8 强化） */
  overtimeGainPlus: boolean
  /** 定价权（K1）生效中（本月可选手现货档位） */
  spotPriceActive: boolean
  /** 定价权需求惩罚减半（K1 强化） */
  spotPriceNoPenalty: boolean
  /** 灵活交付（K2）：接单承诺量 +N，下月缺口违约金（10% 强化 / 20% 基础） */
  flexBonus: number
  flexPenaltyRate: number
  /** 双档采购（K3）：小批（基础）/ 中批（强化）第二档 */
  doubleLotActive: boolean
  doubleLotSize: LotSize
  /** 快周转（K5）：现货不受需求限制；强化不降档 + 低端需求 +2 */
  spotUnlimited: boolean
  spotUnlimitedPlus: boolean
  /** 市场情报（K7）：预算页展示下季度气候转移概率 */
  climateOddsVisible: boolean
  climateOddsPlus: boolean
  /** 原料单件节省（工艺优化） */
  matSave: number
  notes: string[]
  /** 各部门本月账务记录：复式记账，借贷两列，让玩家理解账务处理 */
  deptLedger: Record<Dept, { item: string; debit: string; debitAmt: number; credit: string; creditAmt: number; detail?: string[] }[]>
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
  // buyTierShift 的卡牌修正在**采购时**生效（buyCardShift：采购价 / 贸易商价），
  // 不并入展示价格档位（allTierShift），否则与 lotPrice 里的 buyCardShift 重复降档。
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
  if (e.priceShift) mods.price = { ...(mods.price ?? {}), ...mergeTier(e.priceShift) }
  if (e.demand) mods.demand = { ...(mods.demand ?? {}), ...mergeTier(e.demand) }
  return { mods, flags: (e.flags ?? []).filter(Boolean) }
}

function mergeTier(r: Record<Tier, number>): Partial<Record<Tier, number>> {
  const out: Partial<Record<Tier, number>> = {}
  for (const t of TIERS) if (r[t]) out[t] = r[t]
  return out
}

/** 当前已激活的知识产权列表（含事件/卡牌带来的季度与月度临时知产）。 */
export function activeIps(state: GameState): string[] {
  const out: string[] = []
  // 核心模式无知产激活槽位：已拥有即生效；完整模式保留槽位制
  const effective = state.mode === 'core' ? state.ipOwned : state.ipActive
  for (const id of effective) if (id) out.push(id)
  for (const id of state.quarterIps ?? []) if (!out.includes(id)) out.push(id)
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
    buyTierShift: 0,
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
    acc.buyTierShift += e.buyTierShift ?? 0
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

  // ── 规则卡（K 系列，本月）聚合 ──
  const mf = state.monthFlags
  const rndRolls = mf.includes('rndTripleRoll') ? 3 : mf.includes('rndDoubleRoll') ? 2 : 1
  const overtimeHalf = mf.includes('overtimeHalf') || mf.includes('overtimeHalfPlus')
  const overtimeGainPlus = mf.includes('overtimeHalfPlus')
  const spotPriceActive = mf.includes('spotPriceChoice') || mf.includes('spotPriceChoiceNoPenalty')
  const spotPriceNoPenalty = mf.includes('spotPriceChoiceNoPenalty')
  const spotChoice = spotPriceActive ? (state.spotPriceChoice ?? 0) : 0
  const spotPenalty = spotChoice === 0 ? 0 : spotPriceNoPenalty ? Math.ceil(spotChoice / 2) : spotChoice
  const flexBonus = mf.includes('flex10') ? 10 : mf.includes('flex5') ? 5 : 0
  const flexPenaltyRate = mf.includes('flex10') ? 0.1 : 0.2
  const doubleLotActive = mf.includes('doubleLot') || mf.includes('doubleLotMid')
  const doubleLotSize: LotSize = mf.includes('doubleLotMid') ? 'mid' : 'small'
  const spotUnlimited = mf.includes('spotUnlimited') || mf.includes('spotUnlimitedPlus')
  const spotUnlimitedPlus = mf.includes('spotUnlimitedPlus')
  const climateOddsVisible = mf.includes('climateOdds') || mf.includes('climateOddsPlus')
  const climateOddsPlus = mf.includes('climateOddsPlus')
  /** 现货专用档位 = 基准价档 + 快周转 K5（基础 −1 档）+ 定价权 K1 选择 */
  const spotShiftOf = (baseShift: number): number =>
    baseShift + (spotUnlimited && !spotUnlimitedPlus ? -1 : 0) + spotChoice

  // ── 原料（采购人员不再提供供应加成：增量供给走供应商开发/气候/事件）──
  const materials: DerivedTotals['materials'] = {}
  for (const m of MATERIALS) {
    const mm = mods.materials?.[m.id] ?? { supply: 0, tierShift: 0 }
    const developed = state.materialsDeveloped[m.id] ?? 0
    let supplyAdj = mm.supply + (mods.allSupply ?? 0)
    const supply = Math.max(0, m.baseSupply + developed + supplyAdj + ip.matSupply)
    let shift = mm.tierShift + (mods.allTierShift ?? 0)
    if (staffCount.buy >= 4) shift -= 1 // 采购 4 人：所有原料价格降 1 档
    shift += ip.buyTierShift // 大宗集采（J9）：所有原料价格降 1 档（质量认证 I8 只作用于产品售价，不作用于原料）
    shift = Math.max(-3, Math.min(3, shift))
    const cap = m.baseCapacity + ip.capacityBonus
    materials[m.id] = { supply, tierShift: shift, price: priceOf(m, shift), cap }
  }

  // ── 需求（§7.2.4 新模型：销售资源加点直接增加该层需求）──
  // 需求 = 基础 + 气候 + 事件（自然需求） + 分配的销售资源（受每层 3 倍基础上限截断）。
  // 各层独立结算，不再做跨层吸引力份额分配。
  const totalShift = CLIMATE_DEMAND[state.climate]
  const lowShare = Math.ceil(Math.abs(totalShift) * 0.6) * Math.sign(totalShift)
  const midShare = Math.floor(Math.abs(totalShift) * 0.4) * Math.sign(totalShift)
  const demandBase: Record<Tier, number> = {
    low: Math.max(0, BASE_DEMAND.low + lowShare + (mods.demand?.low ?? 0)),
    mid: Math.max(0, BASE_DEMAND.mid + midShare + (mods.demand?.mid ?? 0)),
    high: Math.max(0, BASE_DEMAND.high + (mods.demand?.high ?? 0)),
    special: Math.max(0, BASE_DEMAND.special + (mods.demand?.special ?? 0)),
  }
  const salesPush: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) {
    // 每层 1 点需求需 SALES_PUSH_COST[t] 个资源，不足整档的零头不计入（可投低端吸收）
    salesPush[t] = Math.min(Math.floor(state.salesAlloc[t] / SALES_PUSH_COST[t]), SALES_PUSH_CAP[t])
  }
  const demand: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) {
    let v = demandBase[t] + salesPush[t]
    v -= spotPenalty // 定价权（K1）：现货提价每 1 档，该层需求 −N（强化版减半）
    if (spotUnlimitedPlus && t === 'low') v += 2 // 快周转强化（K5）：低端需求 +2
    demand[t] = Math.max(0, v)
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
  /** 现货专用档位（决议 D5 + 快周转 K5 + 定价权 K1；订单结算不受影响） */
  const spotShift: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const t of TIERS) spotShift[t] = spotShiftOf(priceShift[t])

  // ── 产能：老板自产 + 工人数 × 每人产能（基础 3，2 人/4 人解锁各 +1，设备产线合计 cap + IP 设备产能） ──
  const equipmentCapBonus = equipmentCapTotal(state.equipment) + state.equipment.length * ip.equipCapacity
  const capacity = Math.max(0, OWNER_CAPACITY + staffCount.make * makerPerStaff(staffCount.make, equipmentCapBonus) + (mods.capacity ?? 0))

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
  const equipCredit = equipmentCreditLine(state.equipment)
  const creditLine = Math.round((BASE_CREDIT_LINE + ip.creditLine + (state.flags['extraCredit'] ?? 0) + equipCredit) * (mods.creditFactor ?? 1))

  // ── 销售 ──
  // 品牌加成计入资源池（新模型下品牌 = 更多推力）
  const brandBonus = (staffCount.sell >= 5 ? 3 : 0) + ip.brandBonus
  const salesResource = BASE_SALES_RESOURCE + salesResourceFromStaff(Math.min(5, staffCount.sell)) + ip.salesResource + brandBonus + (mods.salesResource ?? 0)
  const orderCount = SALES_ORDER_COUNT[Math.min(5, staffCount.sell)] + ip.orderBonus + (mods.orders ?? 0)
  const orderQty = mods.orderQty ?? 10
  const orderPriceShift = 1 + ip.orderPriceShift + (mods.orderPriceShift ?? 0)

  // ── 采购 ──
  const buyLots = BUY_LOT_SLOTS[Math.min(5, staffCount.buy)] + (mods.buyLots ?? 0)

  // ── 研发：平修正（事件/卡牌/知产）+ 按项目放置人数，见 rndProjectOutcome ──
  const rndProgress = (mods.rndProgress ?? 0) + ip.rndProgress
  const rndRate = (mods.rndRate ?? 0) + ip.rndRate
  let rndActiveCount = 0
  for (const p of RND_PROJECTS) {
    const s = state.rnd[p.id]
    if (s?.projectId && !s.done) rndActiveCount += 1
  }
  const rndCost = Math.max(0, RND_COST_PER_PROJECT + (mods.rndCost ?? 0))
  /** 在研项目数 × 单项月费（在研 = 已立项且未完成，承诺制费用） */
  const rndCostTotal = rndCost * rndActiveCount

  // ── 运营 ──
  const apMax = BASE_AP + Math.max(0, staffCount.ops - 1) + (mods.ap ?? 0) + (state.monthFlags.includes('m2solo') ? 1 : 0)
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
  // 加班费：发生时已直接支付（state.overtimePaid，安排时锁定 = 2× 生产工资），账务/损益按锁定额展示
  const overtimeCost = state.overtimePaid
  let makeDepreciation = 0
  for (const e of state.equipment) {
    makeDepreciation += Math.min(e.depreciation, Math.max(0, e.cost - e.accumulated))
  }
  /** 招聘费当月直接计入管理费用，按本月招聘人数 × 招聘费展示 */
  const hireThisMonth: Record<Dept, number> = {
    ops: state.flags[`hireMonth:ops:${state.month}`] ?? 0,
    buy: state.flags[`hireMonth:buy:${state.month}`] ?? 0,
    make: state.flags[`hireMonth:make:${state.month}`] ?? 0,
    sell: state.flags[`hireMonth:sell:${state.month}`] ?? 0,
    rnd: state.flags[`hireMonth:rnd:${state.month}`] ?? 0,
  }
  /** 本月提案实施费用，按部门分组 */
  const proposalCostBy: Record<Dept, number> = { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }
  for (const c of state.playedThisMonth) {
    const def = CARD_BY_ID[c.defId]
    if (def?.kind) proposalCostBy[def.kind] += def.cost ?? 0
  }
  const deptLedger: Record<Dept, { item: string; debit: string; debitAmt: number; credit: string; creditAmt: number; detail?: string[] }[]> = {
    ops: [], buy: [], make: [], sell: [], rnd: [],
  }
  for (const dp of DEPT_ORDER) {
    const rows: typeof deptLedger.ops = []
    // 工资（月末计提应付职工薪酬：费用当期确认、挂账不动现金，次月结算时实付上月工资）
    if (salaryPer[dp] > 0 && staffCount[dp] > 0) {
      const acc = dp === 'make' ? '制造费用' : dp === 'rnd' ? '研发费用' : dp === 'sell' ? '销售费用' : '管理费用'
      const per = salaryPer[dp]
      const total = per * staffCount[dp]
      rows.push({ item: '工资计提', debit: acc, debitAmt: total, credit: '应付职工薪酬', creditAmt: total })
    }
    // 实付上月计提的工资（借 应付职工薪酬 / 贷 现金；本月现金流出，上月费用已在计提时确认）
    if (state.wagePayableBy[dp] > 0) {
      rows.push({ item: '工资支付（上月计提）', debit: '应付职工薪酬', debitAmt: state.wagePayableBy[dp], credit: '现金', creditAmt: state.wagePayableBy[dp] })
    }
    // 设备折旧（非现金）
    if (dp === 'make' && makeDepreciation > 0) {
      rows.push({ item: '设备折旧', debit: '制造费用', debitAmt: makeDepreciation, credit: '累计折旧', creditAmt: makeDepreciation })
    }
    // 加班费（结算时现金支付）
    if (dp === 'make' && overtimeCost > 0) {
      rows.push({ item: '加班费', debit: '制造费用', debitAmt: overtimeCost, credit: '现金', creditAmt: overtimeCost })
    }
    // 研发项目投入（结算时现金支付）
    if (dp === 'rnd' && rndCostTotal > 0) {
      rows.push({ item: '研发投入', debit: '研发费用', debitAmt: rndCostTotal, credit: '现金', creditAmt: rndCostTotal })
    }
    // 招聘费净额（招聘实付 − 裁员返还，发生即付现金，当期费用化进管理费用）
    const hireFee = state.hireFeeBy[dp]
    if (hireFee !== 0) {
      rows.push({
        item: '招聘费',
        debit: hireFee > 0 ? '管理费用' : '现金',
        debitAmt: Math.abs(hireFee),
        credit: hireFee > 0 ? '现金' : '管理费用',
        creditAmt: Math.abs(hireFee),
        detail: [
          `本月招聘 ${hireThisMonth[dp]} 人、裁员返还已抵减，净额 ${(Math.abs(hireFee) / 10).toFixed(2)}w`,
          hireFee > 0 ? '当期费用化：计入管理费用（不再资本化为待摊费用）' : '裁员返还多于本月招聘费：反向冲减管理费用',
        ],
      })
    }
    // 提案实施费用（发生时付现金，结算计入管理费用，与损益表同科目）
    if (proposalCostBy[dp] > 0) {
      rows.push({ item: '提案费用', debit: '管理费用', debitAmt: proposalCostBy[dp], credit: '现金', creditAmt: proposalCostBy[dp] })
    }
    // 借款利息（结算时现金支付，归运营部列示）
    if (dp === 'ops' && interest > 0) {
      rows.push({
        item: '借款利息',
        debit: '财务费用',
        debitAmt: interest,
        credit: '现金',
        creditAmt: interest,
        detail: [
          `借款余额 ${(state.debt / 10).toFixed(2)}w × 月利率 ${(rate * 100).toFixed(1)}%`,
          '计入财务费用，结算时现金支付',
        ],
      })
    }
    // 手工记账（采购入库、生产领料/入库、销售收入/成本等），按发生顺序排在自动分录之后
    for (const r of state.monthLedger) if (r.dept === dp) rows.push(r)
    // 制造费用结转（仅生产部）：未转入存货的部分（工资/折旧/加班/降本差异）当期费用化，
    // 金额与损益表「生产费用」一致，保证制造费用归集科目期末无余额
    if (dp === 'make') {
      let outTotal = 0
      let inTotal = 0
      for (const r of state.monthLedger) {
        if (r.dept !== 'make') continue
        if (r.item.startsWith('原料出库')) outTotal += r.debitAmt
        else if (r.item.startsWith('存货入库')) inTotal += r.debitAmt
      }
      const wageTotal = salaryPer.make * staffCount.make
      const variance = Math.max(0, outTotal - inTotal)
      const closing = wageTotal + makeDepreciation + overtimeCost + variance
      if (closing > 0) {
        const lines: string[] = []
        if (wageTotal > 0) lines.push(`生产人员工资 ${(wageTotal / 10).toFixed(2)}w`)
        if (makeDepreciation > 0) lines.push(`设备折旧 ${(makeDepreciation / 10).toFixed(2)}w`)
        if (overtimeCost > 0) lines.push(`加班费 ${(overtimeCost / 10).toFixed(2)}w`)
        if (variance > 0) lines.push(`降本差异 ${(variance / 10).toFixed(2)}w`)
        lines.push('制造费用中未转入存货的部分当期费用化（工资/折旧不资本化进存货成本），与损益表「生产费用」一致')
        rows.push({ item: '生产费用结转', debit: '生产费用', debitAmt: closing, credit: '制造费用', creditAmt: closing, detail: lines })
      }
    }
    deptLedger[dp] = rows
  }

  return {
    materials,
    demand,
    demandBase,
    salesPush,
    salesPushCap: { ...SALES_PUSH_CAP },
    salesPushCost: { ...SALES_PUSH_COST },
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
    rndActiveCount,
    rndCost,
    rndCostTotal,
    flags: collectFlags(state, mods),
    costFactor: mods.costFactor ?? 1,
    apMax,
    handMax: Math.max(1, handMax),
    drawN,
    drawM,
    matSave: ip.matSave,
    spotShift,
    rndRolls,
    overtimeHalf,
    overtimeGainPlus,
    spotPriceActive,
    spotPriceNoPenalty,
    flexBonus,
    flexPenaltyRate,
    doubleLotActive,
    doubleLotSize,
    spotUnlimited,
    spotUnlimitedPlus,
    climateOddsVisible,
    climateOddsPlus,
    /** J5 专利壁垒生效（本季可复制 1 张已打牌） */
    ipCardCopy: ip.cardCopy,
    /** 设备产线合计产能加成（每人，含 IP 设备产能 I2/J1） */
    equipmentCapBonus,
    /** IP 设备产能（I2/J1，每台每人）：设备计划预演用 */
    ipEquipCapacity: ip.equipCapacity,
    notes: mods.notes ?? [],
    deptLedger,
  }
}

function productPriceRaw(tier: Tier, shift: number) {
  const arr = PRODUCT_PRICE[tier]
  const idx = Math.max(0, Math.min(4, 2 + shift))
  return arr[idx]
}

export function makerPerStaff(staff: number, equipCapTotal = 0): number {
  let v = MAKER_CAP_BASE
  if (staff >= 2) v += 1
  if (staff >= 4) v += 1
  v += equipCapTotal
  return v
}

/** 设备产线合计产能加成（每人产能）：Σ 各设备型号 cap（旧数据无 cap 时按 EQUIP_CAP_PER_WORKER）。 */
export function equipmentCapTotal(equipment: { cap?: number }[]): number {
  return equipment.reduce((sum, e) => sum + (e.cap ?? EQUIP_CAP_PER_WORKER), 0)
}

/** 设备可提供的借款额度合计（§18-A8，随融资层生效）。 */
export function equipmentCreditLine(equipment: { creditLine?: number }[]): number {
  return equipment.reduce((sum, e) => sum + (e.creditLine ?? 0), 0)
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
      prodStock: 0,
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

/** 单项目研发：按本月放置人数计算进度增量与成功率（平修正作用于所有在研项目）。 */
export function rndProjectOutcome(
  d: DerivedTotals,
  def: ResearchProjectDef,
  assigned: number,
): { gain: number; rate: number } {
  const gain = assigned * RND_PROGRESS_PER_WORKER + (d.rndProgress ?? 0)
  const cap = def.rateCap ?? RND_RATE_CAP / 100
  const rate = Math.max(0.05, Math.min(cap, def.rate + (assigned * RND_RATE_PER_WORKER + (d.rndRate ?? 0)) / 100))
  return { gain, rate }
}
