import type {
  BomDef,
  CardInstance,
  CardPlayEffect,
  Climate,
  Dept,
  GameEventDef,
  GoalDef,
  IpDef,
  MaterialDef,
  MilestoneDef,
  Money,
  Momentum,
  ResearchProjectDef,
  StaffDef,
  Tier,
} from '../core/types'

/**
 * 全部静态配置。
 *
 * 数值单位说明：凡涉及货币的一律以「角」（0.1w）为整数存储，
 * 故 1w = 10，10w = 100。售价 / 价格档位表亦同。
 */

// ════════════════════════════════════════════════════════════
// 1. 原料
// ════════════════════════════════════════════════════════════

export const MATERIALS: MaterialDef[] = [
  { id: 'pkg', name: '包材', grade: 1, baseSupply: 24, basePrice: 10, baseCapacity: 40 },
  { id: 'resin', name: '树脂', grade: 2, baseSupply: 14, basePrice: 20, baseCapacity: 30 },
  { id: 'alloy', name: '合金', grade: 3, baseSupply: 7, basePrice: 40, baseCapacity: 15 },
  { id: 'chip', name: '芯片', grade: 4, baseSupply: 3, basePrice: 80, baseCapacity: 8 },
]

/** 研发解锁的新材料（供应商开发后进入已知材料）。 */
export const NEW_MATERIALS: MaterialDef[] = [
  { id: 'comp', name: '复合材', grade: 3, baseSupply: 0, basePrice: 30, baseCapacity: 12, unlocked: true, tier: 'mid' },
  { id: 'micro', name: '微机电', grade: 5, baseSupply: 0, basePrice: 100, baseCapacity: 6, unlocked: true, tier: 'special' },
]

export const SOURCED_MATERIALS = [...MATERIALS, ...NEW_MATERIALS]

export const MATERIAL_BY_ID: Record<string, MaterialDef> = Object.fromEntries(
  SOURCED_MATERIALS.map((m) => [m.id, m]),
)

/**
 * 价格档位表：索引 = 基准档位（2） + tierShift。
 * 0 极低 · 1 低 · 2 基准 · 3 高 · 4 极高
 */
export const PRICE_TIERS = [0, 1, 2, 3, 4] as const

export function priceOf(mat: MaterialDef, tierShift: number): Money {
  const row: Record<string, number[]> = {
    pkg: [5, 8, 10, 15, 20],
    resin: [10, 15, 20, 30, 40],
    alloy: [20, 30, 40, 60, 80],
    chip: [40, 60, 80, 120, 160],
    comp: [15, 22, 30, 45, 60],
    micro: [50, 75, 100, 150, 200],
  }
  const arr = row[mat.id] ?? row.pkg
  const idx = Math.max(0, Math.min(4, 2 + tierShift))
  return arr[idx]
}

export const TIER_NAMES = ['极低', '低', '基准', '高', '极高']

/** 气候对原料供给与价格的影响（§7.1 气候影响表）。 */
export const CLIMATE_MATERIAL: Record<Climate, { supply: Record<string, number>; tierShift: Record<string, number> }> = {
  recovery: { supply: { pkg: 2, resin: 1, alloy: 0, chip: -1 }, tierShift: { pkg: -1, resin: -1, alloy: -1, chip: -1 } },
  boom: { supply: { pkg: 3, resin: 2, alloy: 1, chip: 0 }, tierShift: { pkg: 0, resin: 0, alloy: 0, chip: 0 } },
  overheat: { supply: { pkg: -2, resin: -3, alloy: -3, chip: -2 }, tierShift: { pkg: 1, resin: 1, alloy: 1, chip: 2 } },
  stagflation: { supply: { pkg: -1, resin: -2, alloy: -2, chip: -1 }, tierShift: { pkg: 1, resin: 1, alloy: 1, chip: 1 } },
  recession: { supply: { pkg: 4, resin: 3, alloy: 1, chip: 0 }, tierShift: { pkg: -1, resin: -1, alloy: -1, chip: -1 } },
  depression: { supply: { pkg: 6, resin: 4, alloy: 2, chip: 0 }, tierShift: { pkg: -2, resin: -2, alloy: -2, chip: -1 } },
}

// ════════════════════════════════════════════════════════════
// 2. 气候与经济动能
// ════════════════════════════════════════════════════════════

export const CLIMATE_ORDER: Climate[] = ['recovery', 'boom', 'overheat', 'stagflation', 'recession', 'depression']
/** 循环为环形：萧条之后回到复苏。 */
export const CLIMATE_NAMES: Record<Climate, string> = {
  recovery: '复苏',
  boom: '繁荣',
  overheat: '过热',
  stagflation: '滞涨',
  recession: '衰退',
  depression: '萧条',
}

/** 气候含义（玩家提示）：需求 / 原料价 / 资金。 */
export const CLIMATE_HINTS: Record<Climate, string> = {
  recovery: '需求低位回升，原料价低、资金便宜',
  boom: '需求旺盛，原料价稳定，资金适中',
  overheat: '需求极高，原料价大涨，资金紧张',
  stagflation: '需求下滑，原料价高企，资金紧张',
  recession: '需求低迷，原料价下跌，资金转松',
  depression: '需求极弱，原料价见底，信贷收缩',
}

export const MOMENTUM_NAMES: Record<Momentum, string> = {
  expand: '扩张',
  stall: '停滞',
  contract: '收缩',
}

/** 经济动能概率表（§3.1.1）：扩张 / 停滞 / 收缩。 */
export const MOMENTUM_ODDS: Record<Climate, [number, number, number]> = {
  recovery: [0.7, 0.2, 0.1],
  boom: [0.7, 0.2, 0.1],
  overheat: [0.15, 0.15, 0.7],
  stagflation: [0.15, 0.7, 0.15],
  recession: [0.1, 0.2, 0.7],
  depression: [0.1, 0.2, 0.7],
}

/** 气候总需求修正（§7.2.2）。 */
export const CLIMATE_DEMAND: Record<Climate, number> = {
  recovery: -1,
  boom: 3,
  overheat: 4,
  stagflation: -2,
  recession: -3,
  depression: -4,
}

export const BASE_DEMAND: Record<Tier, number> = { low: 5, mid: 4, high: 2, special: 1 }

// ════════════════════════════════════════════════════════════
// 3. 产品与 BOM
// ════════════════════════════════════════════════════════════

export const TIERS: Tier[] = ['low', 'mid', 'high', 'special']
export const TIER_LABEL: Record<Tier, string> = { low: '低端', mid: '中端', high: '高端', special: '特殊' }
/**
 * 销售资源加点上限（§7.2.4）：每层最多可推 3 倍基础需求。
 * 低端 +15 / 中端 +12 / 高端 +6 / 特殊 +3，合计 36，
 * 与销售 5 人的资源池（基础 4 + 人员 28 = 32）大致会师，全游戏没有大段死点。
 */
export const SALES_PUSH_CAP: Record<Tier, number> = {
  low: 3 * BASE_DEMAND.low,
  mid: 3 * BASE_DEMAND.mid,
  high: 3 * BASE_DEMAND.high,
  special: 3 * BASE_DEMAND.special,
}

/**
 * 每层「1 点需求」的销售资源成本：越高端的产品，渠道覆盖越昂贵。
 * 销售流派可以通过员工、卡牌和事件获得更多资源，承担高端市场覆盖成本。
 */
export const SALES_PUSH_COST: Record<Tier, number> = { low: 1, mid: 2, high: 4, special: 6 }

export const BOMS: Record<Tier, BomDef> = {
  low: { tier: 'low', name: '标准品', recipe: { pkg: 2, resin: 1 }, basePrice: 55, stdCost: 40 },
  mid: { tier: 'mid', name: '精工件', recipe: { resin: 2, alloy: 1 }, basePrice: 105, stdCost: 60 },
  high: { tier: 'high', name: '精密件', recipe: { alloy: 1, chip: 1 }, basePrice: 240, stdCost: 120 },
  special: { tier: 'special', name: '特种件', recipe: { micro: 1, comp: 1, alloy: 1 }, basePrice: 360, stdCost: 150 },
}

/**
 * 产品售价档位表。索引 = 基准档位（2） + shift。
 * 售价可降至「极低」或升至「极高」，故不做下限截断太狠。
 */
export const PRODUCT_PRICE: Record<Tier, number[]> = {
  low: [35, 45, 55, 65, 75],
  mid: [75, 90, 105, 125, 145],
  high: [160, 200, 240, 280, 320],
  special: [240, 300, 360, 420, 480],
}

export function productPrice(tier: Tier, shift: number): Money {
  const arr = PRODUCT_PRICE[tier]
  const idx = Math.max(0, Math.min(4, 2 + shift))
  return arr[idx]
}

// ════════════════════════════════════════════════════════════
// 4. 部门与人员（§6.1）
// ════════════════════════════════════════════════════════════

export const DEPT_ORDER: Dept[] = ['ops', 'buy', 'make', 'sell', 'rnd']

export const DEPT_NAMES: Record<Dept, string> = {
  ops: '运营部',
  buy: '采购部',
  make: '生产部',
  sell: '销售部',
  rnd: '研发部',
}

export const DEPT_SHORT: Record<Dept, string> = {
  ops: '运营',
  buy: '采购',
  make: '生产',
  sell: '销售',
  rnd: '研发',
}

export const STAFF: Record<Dept, StaffDef> = {
  ops: {
    dept: 'ops',
    name: '管理人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 10,
    base: ['AP 上限 +1（下月生效）'],
    unlocks: [
      { at: 2, text: '提案 1 档解锁；抽卡可选上限 3 → 4' },
      { at: 3, text: '手牌上限 5 → 6；提案 2 档解锁' },
      { at: 4, text: '（无新增解锁；提案 3 档需 5 人）' },
      { at: 5, text: '提案 3 档解锁；抽卡可选上限 4 → 5，手牌上限 6 → 7', achievement: '金牌高管' },
    ],
  },
  buy: {
    dept: 'buy',
    name: '采购人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 10,
    base: ['每月采购资源 +2（供给加点 / 议价共用点数）'],
    unlocks: [
      { at: 2, text: '贸易商每月随机供应品种 +1；提案 1 档解锁' },
      { at: 3, text: '解锁长期供货协议；提案 2 档解锁' },
      { at: 4, text: '解锁议价：4 点 = 1 种原料价格降 1 档（每料最多 2 档）' },
      { at: 5, text: '可同时签 2 份长期协议，且锁定期可选 6 个月；提案 3 档解锁', achievement: '供应链联盟' },
    ],
  },
  make: {
    dept: 'make',
    name: '生产人员',
    hireFees: [0], // 生产人员无阶梯招聘费，仅消耗 AP
    salary: 8,
    base: ['每人产能 +3'],
    unlocks: [
      { at: 2, text: '每名工人产能 +1；提案 1 档解锁' },
      { at: 3, text: '解锁加班：付 2× 生产工资，当月产能 +1× 员工产能；提案 2 档解锁' },
      { at: 4, text: '每名工人产能 +1' },
      { at: 5, text: '每生产 5 件额外入库 1 件；提案 3 档解锁', achievement: '流水线' },
    ],
  },
  sell: {
    dept: 'sell',
    name: '销售人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 15,
    base: ['每人销售资源 +4'],
    unlocks: [
      { at: 2, text: '每月获得 1 个确定性订单；提案 1 档解锁' },
      { at: 3, text: '每人销售资源 +4 → +6；提案 2 档解锁' },
      { at: 4, text: '每月获得 2 个确定性订单；解锁提价：8 点销售资源 = 某层价格升 1 档（仅现货、该层需求 −1）' },
      { at: 5, text: '每人 +6 → +8，并实现成本转移；提案 3 档解锁', achievement: '品牌' },
    ],
  },
  rnd: {
    dept: 'rnd',
    name: '研发人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 20,
    base: ['每人 +5 研发进度/月，+5% 成功率（封顶 90%）'],
    unlocks: [
      { at: 2, text: '提案 1 档解锁' },
      { at: 3, text: '提案 2 档解锁' },
      { at: 4, text: '（无新增解锁）' },
      { at: 5, text: '提案 3 档解锁', achievement: '专利壁垒' },
    ],
  },
}

/** 销售人员每人的销售资源贡献（§7.2.4）。 */
export const SALES_RESOURCE_STEPS = [0, 4, 4, 6, 6, 8]
/** 每月确定性订单数（§7.2.6）：2 人解锁第 1 个订单槽，4 人解锁第 2 个。 */
export const SALES_ORDER_COUNT = [0, 0, 1, 1, 2, 2]
export const BASE_SALES_RESOURCE = 0 // 基础销售资源池：开局 0 点（全部靠销售人员/事件/卡牌/知产获得）
export const BASE_HAND = 5
export const BASE_PLAYS = 2
export const BASE_AP = 3
export const START_CASH = 400 // 40w

/**
 * 采购档位已取消：每种原料每月可自由选 1 档（小/中/大批），
 * 数量受当月市场供给（气候/事件/知产/采购资源加点）与库存上限约束。
 */
/** 采购资源（点）：每名采购人员每月产出的点数，供给加点与议价共用同一池。 */
export const BUY_RESOURCE_PER_STAFF = 2
/** 议价（采购 ≥4 人）：指定原料每降 1 档所需点数。 */
export const BUY_PRICE_NEGOTIATE_STAFF = 4
export const BUY_PRICE_NEGOTIATE_COST = 4
/** 议价：每原料每月最多降 2 档。 */
export const BUY_PRICE_NEGOTIATE_CAP = 2
/** 供给加点：每 +1 供给的成本（点），按原料档位：包材 1 / 树脂 2 / 合金 3 / 复合 3 / 芯片 4 / 微机电 5。 */
export function supplyPushCostOf(matId: string): number {
  return MATERIAL_BY_ID[matId]?.grade ?? 1
}
/** 供给加点：每原料每月上限（3× 基础供给；复合/微机电基础供给为 0，上限 0，其供给走研发供应商开发）。 */
export function supplyPushCapOf(matId: string): number {
  return Math.max(0, 3 * (MATERIAL_BY_ID[matId]?.baseSupply ?? 0))
}
/** 销售提价（销售 ≥4 人）：每层现货价每升 1 档所需销售资源（订单不受影响，该层需求 −1）。 */
export const SELL_PRICE_RAISE_STAFF = 4
export const SELL_PRICE_RAISE_COST = 8
/** 销售提价：每层每月最多升 1 档。 */
export const SELL_PRICE_RAISE_CAP = 1

/** 老板自产产能（玩家亲自下场的固定贡献，无工人也生效）。 */
export const OWNER_CAPACITY = 5
/** 每名工人的基础产能。 */
export const MAKER_CAP_BASE = 3
/** 标准设备（eq-line）为每名工人提供的产能；其他型号按 EQUIPMENT_MODELS.cap 差异化。 */
export const EQUIP_CAP_PER_WORKER = 4

/** 加成计算：每名工人的产能（基础 3；生产 2 人 +1、4 人 +1 解锁；设备按型号合计 +equipCap）。 */
export function makerCapacityPerStaff(staff: number, equipCap = 0): number {
  let v = MAKER_CAP_BASE
  if (staff >= 2) v += 1
  if (staff >= 4) v += 1
  v += equipCap
  return v
}

/**
 * 设备产线型号（设备层差异化）：
 * - 标准设备 eq-line：商店唯一在售型号（单型号起步，5w/月折旧 2w/每人 +4）；
 * - 二手产线 eq-used：事件 D9 低价设备（折旧减半 1w，每人 +4 同标准）；
 * - 清算产线 eq-liquidation：事件 X9 资产抄底（8w，每人 +6，额度 8w）——比 D9 强但更贵。
 */
export interface EquipmentModel {
  id: string
  name: string
  /** 每台设备为每名生产人员提供的产能 */
  cap: number
  /** 每月折旧（角） */
  depreciation: Money
  /** 可提供的借款额度（角，随融资层生效） */
  creditLine: Money
  /** 购置成本（角；商店价。事件对价以事件 cost 为准） */
  price: Money
  desc: string
}

export const EQUIPMENT_MODELS: Record<string, EquipmentModel> = {
  'eq-line': { id: 'eq-line', name: '标准设备', cap: EQUIP_CAP_PER_WORKER, depreciation: 20, creditLine: 50, price: 50, desc: '每名生产人员产能 +4 · 月折旧 2w · 额度 5w' },
  'eq-used': { id: 'eq-used', name: '二手产线', cap: EQUIP_CAP_PER_WORKER, depreciation: 10, creditLine: 50, price: 50, desc: '每名生产人员产能 +4 · 月折旧 1w（折旧减半）· 额度 5w' },
  'eq-liquidation': { id: 'eq-liquidation', name: '清算产线', cap: 6, depreciation: 20, creditLine: 80, price: 80, desc: '每名生产人员产能 +6 · 月折旧 2w · 额度 8w' },
}

/** 商店在售型号（单型号起步；型号差异化随事件产线落地，X9 清算产线 / D9 二手产线不进商店） */
export const EQUIPMENT_SHOP: EquipmentModel[] = [EQUIPMENT_MODELS['eq-line']]

/**
 * 加班：一次性支付 2× 本月生产工资计提额（含事件/卡牌薪酬修正），
 * 当月产能 +1× 员工产能部分（人数 × 每人产能，含解锁加成与设备加成；
 * 不含老板基线与卡牌/事件定额修正）。
 * 成本随工资（人数）上涨、效果随产能（人数×设备）放大：
 * 多招人加班更贵、买设备加班更值——设备是加班的放大器而非竞争者。
 */
export const OVERTIME_WAGE_FACTOR = 2
/** 加班解锁线：生产 3 人 */
export const OVERTIME_UNLOCK_STAFF = 3

/** 加班费 = 2 × 生产人员本月工资（salaryPer 已含事件/卡牌修正；<3 人为 0）。 */
export function overtimeCostOf(salaryPerMake: number, makeStaff: number): number {
  return makeStaff >= OVERTIME_UNLOCK_STAFF ? OVERTIME_WAGE_FACTOR * salaryPerMake * makeStaff : 0
}

/** 加班增益 = 员工产能部分（人数 × 每人产能，含解锁加成 + 设备型号合计 equipCap；<3 人为 0）。 */
export function overtimeGainOf(makeStaff: number, equipCap = 0): number {
  return makeStaff >= OVERTIME_UNLOCK_STAFF ? makeStaff * makerCapacityPerStaff(makeStaff, equipCap) : 0
}

// ════════════════════════════════════════════════════════════
// 5. 研发与知识产权
// ════════════════════════════════════════════════════════════

export const RND_PROJECTS: ResearchProjectDef[] = [
  { id: 'bom-mid', name: '中端 BOM', kind: 'bom', tier: 'mid', need: 10, rate: 0.95, rateCap: 1, desc: '解锁中端产品配方（教学：1 人即可 100% 成功）' },
  { id: 'bom-high', name: '高端 BOM', kind: 'bom', tier: 'high', need: 50, rate: 0.6, desc: '解锁高端产品配方' },
  { id: 'bom-special', name: '特殊 BOM', kind: 'bom', tier: 'special', need: 50, rate: 0.45, desc: '解锁特殊产品配方，并揭示新材料' },

  // IP 技能树：三分支 × 三阶段，逐层揭示、阶段 2/3 每层 2 个方向任选（3 + 3×2 + 3×2×2 = 21 项）。
  // 阶段 1（15 / 80%）；阶段 2（30 / 70%）；阶段 3（50 / 60%）。放置 N 人 = N×5 进度、成功率 +N×5%（封顶 90%）。
  // 解锁上游节点后，其下游方向才揭示；每个阶段 2 节点下挂两个阶段 3 节点。
  { id: 'ip-supply-1', name: '采购网络', kind: 'ip', branch: 'supply', stage: 1, ipId: 'I3', need: 15, rate: 0.8, desc: '每类原料供给 +2' },
  { id: 'ip-supply-2', name: '供应链联盟', kind: 'ip', branch: 'supply', stage: 2, preq: 'ip-supply-1', ipId: 'J2', need: 30, rate: 0.7, desc: '每类原料供给 +4，且可多签 1 份长期协议' },
  { id: 'ip-supply-2b', name: '库存管理', kind: 'ip', branch: 'supply', stage: 2, preq: 'ip-supply-1', ipId: 'I6', need: 30, rate: 0.7, desc: '原料与成品库存上限 +10' },
  { id: 'ip-supply-3', name: '成本转移', kind: 'ip', branch: 'supply', stage: 3, preq: 'ip-supply-2', ipId: 'J4', need: 50, rate: 0.6, desc: '原料涨价时，产品售价同步升 1 档' },
  { id: 'ip-supply-3b', name: '大宗集采', kind: 'ip', branch: 'supply', stage: 3, preq: 'ip-supply-2', ipId: 'J9', need: 50, rate: 0.6, desc: '所有原料价格降 1 档' },
  { id: 'ip-supply-3c', name: '财务优化', kind: 'ip', branch: 'supply', stage: 3, preq: 'ip-supply-2b', ipId: 'I5', need: 50, rate: 0.6, desc: '每月利息 -1w' },
  { id: 'ip-supply-3d', name: '财务杠杆', kind: 'ip', branch: 'supply', stage: 3, preq: 'ip-supply-2b', ipId: 'J7', need: 50, rate: 0.6, desc: '借款额度 +20w，利率 -1w' },

  { id: 'ip-channel-1', name: '订单网络', kind: 'ip', branch: 'channel', stage: 1, ipId: 'I9', need: 15, rate: 0.8, desc: '每月订单 +1' },
  { id: 'ip-channel-2', name: '渠道垄断', kind: 'ip', branch: 'channel', stage: 2, preq: 'ip-channel-1', ipId: 'J8', need: 30, rate: 0.7, desc: '每月订单 +2，订单价格升 1 档' },
  { id: 'ip-channel-2b', name: '质量认证', kind: 'ip', branch: 'channel', stage: 2, preq: 'ip-channel-1', ipId: 'I8', need: 30, rate: 0.7, desc: '所有产品售价升 1 档' },
  { id: 'ip-channel-3', name: '品牌壁垒', kind: 'ip', branch: 'channel', stage: 3, preq: 'ip-channel-2', ipId: 'J3', need: 50, rate: 0.6, desc: '销售资源 +8，且品牌加成 +3' },
  { id: 'ip-channel-3b', name: '销售渠道', kind: 'ip', branch: 'channel', stage: 3, preq: 'ip-channel-2', ipId: 'I4', need: 50, rate: 0.6, desc: '销售资源 +3' },
  { id: 'ip-channel-3c', name: '品牌溢价', kind: 'ip', branch: 'channel', stage: 3, preq: 'ip-channel-2b', ipId: 'J10', need: 50, rate: 0.6, desc: '所有产品售价升 1 档（与质量认证叠加）' },
  { id: 'ip-channel-3d', name: '高端渠道', kind: 'ip', branch: 'channel', stage: 3, preq: 'ip-channel-2b', ipId: 'J11', need: 50, rate: 0.6, desc: '每月订单 +1，订单价格升 1 档' },

  { id: 'ip-equip-1', name: '设备专利', kind: 'ip', branch: 'equip', stage: 1, ipId: 'I2', need: 15, rate: 0.8, desc: '每台设备产能 +2' },
  { id: 'ip-equip-2', name: '自动化产线', kind: 'ip', branch: 'equip', stage: 2, preq: 'ip-equip-1', ipId: 'J1', need: 30, rate: 0.7, desc: '每台设备产能 +4' },
  { id: 'ip-equip-2b', name: '工艺优化', kind: 'ip', branch: 'equip', stage: 2, preq: 'ip-equip-1', ipId: 'I1', need: 30, rate: 0.7, desc: '所有产品原料消耗 -1（最低 1）' },
  { id: 'ip-equip-3', name: '研发突破', kind: 'ip', branch: 'equip', stage: 3, preq: 'ip-equip-2', ipId: 'J6', need: 50, rate: 0.6, desc: '研发进度 +4/月，成功率 +10%' },
  { id: 'ip-equip-3b', name: '专利壁垒', kind: 'ip', branch: 'equip', stage: 3, preq: 'ip-equip-2', ipId: 'J5', need: 50, rate: 0.6, desc: '每季度可复制一张已打出的卡' },
  { id: 'ip-equip-3c', name: '精益生产', kind: 'ip', branch: 'equip', stage: 3, preq: 'ip-equip-2b', ipId: 'J12', need: 50, rate: 0.6, desc: '所有产品原料消耗 -2（最低 1）' },
  { id: 'ip-equip-3d', name: '人力优化', kind: 'ip', branch: 'equip', stage: 3, preq: 'ip-equip-2b', ipId: 'I10', need: 50, rate: 0.6, desc: '所有员工薪酬 -0.5w' },
]

/** 每名放置的研发人员每月研发进度 */
export const RND_PROGRESS_PER_WORKER = 5
/** 每名放置的研发人员带来的成功率提升（百分点） */
export const RND_RATE_PER_WORKER = 5
/** 默认成功率封顶（百分点）；单项目可用 rateCap 覆盖（中端教学 100） */
export const RND_RATE_CAP = 90

export const IP_DEFS: IpDef[] = [
  { id: 'I1', name: '工艺优化', pool: 'normal', desc: '所有产品原料消耗 -1（最低 1）', effect: { matSave: 1 } },
  { id: 'I2', name: '设备专利', pool: 'normal', desc: '每台设备产能 +2', effect: { equipCapacity: 2 } },
  { id: 'I3', name: '采购网络', pool: 'normal', desc: '每类原料供给 +2', effect: { matSupply: 2 } },
  { id: 'I4', name: '销售渠道', pool: 'normal', desc: '销售资源 +3', effect: { salesResource: 3 } },
  { id: 'I5', name: '财务优化', pool: 'normal', desc: '每月利息 -1w', effect: { interestSave: 10 } },
  { id: 'I6', name: '库存管理', pool: 'normal', desc: '原料与成品库存上限 +10', effect: { capacityBonus: 10 } },
  { id: 'I7', name: '研发体系', pool: 'normal', desc: '研发进度 +2/月', effect: { rndProgress: 2 } },
  { id: 'I8', name: '质量认证', pool: 'normal', desc: '所有产品售价升 1 档', effect: { priceShift: 1 } },
  { id: 'I9', name: '订单网络', pool: 'normal', desc: '每月订单 +1', effect: { orderBonus: 1 } },
  { id: 'I10', name: '人力优化', pool: 'normal', desc: '所有员工薪酬 -0.5w', effect: { salarySave: 5 } },

  { id: 'J1', name: '自动化产线', pool: 'strong', desc: '每台设备产能 +4', effect: { equipCapacity: 4 } },
  { id: 'J2', name: '供应链联盟', pool: 'strong', desc: '每类原料供给 +4，且可多签 1 份长期协议', effect: { matSupply: 4, agreementSlots: 1 } },
  { id: 'J3', name: '品牌壁垒', pool: 'strong', desc: '销售资源 +8，且品牌加成 +3', effect: { salesResource: 8, brandBonus: 3 } },
  { id: 'J4', name: '成本转移', pool: 'strong', desc: '原料涨价时，产品售价同步升 1 档', effect: { costTransfer: true } },
  { id: 'J5', name: '专利壁垒', pool: 'strong', desc: '每季度可复制一张已打出的卡', effect: { cardCopy: true } },
  { id: 'J6', name: '研发突破', pool: 'strong', desc: '研发进度 +4/月，成功率 +10%', effect: { rndProgress: 4, rndRate: 10 } },
  { id: 'J7', name: '财务杠杆', pool: 'strong', desc: '借款额度 +20w，利率 -1w', effect: { creditLine: 200, rateSave: 1 } },
  { id: 'J8', name: '渠道垄断', pool: 'strong', desc: '每月订单 +2，订单价格升 1 档', effect: { orderBonus: 2, orderPriceShift: 1 } },
  { id: 'J9', name: '大宗集采', pool: 'strong', desc: '所有原料价格降 1 档', effect: { buyTierShift: -1 } },
  { id: 'J10', name: '品牌溢价', pool: 'strong', desc: '所有产品售价升 1 档', effect: { priceShift: 1 } },
  { id: 'J11', name: '高端渠道', pool: 'strong', desc: '每月订单 +1，订单价格升 1 档', effect: { orderBonus: 1, orderPriceShift: 1 } },
  { id: 'J12', name: '精益生产', pool: 'strong', desc: '所有产品原料消耗 -2（最低 1）', effect: { matSave: 2 } },
]

export const IP_BY_ID: Record<string, IpDef> = Object.fromEntries(IP_DEFS.map((i) => [i.id, i]))

/**
 * 知产套装（结构分）：跨分支/跨阶段的 IP 组合，终局一次性计分（不给月度效果）。
 * 单支拿不全——逼玩家规划研发路线，套装是「形状」的结构侧证据。
 */
export interface IpSetDef {
  id: string
  name: string
  desc: string
  ips: string[]
  points: number
}

export const IP_SETS: IpSetDef[] = [
  { id: 'set-supply', name: '供应链闭环', desc: 'J2 供应链联盟 + J9 大宗集采 + I3 采购网络', ips: ['J2', 'J9', 'I3'], points: 15 },
  { id: 'set-channel', name: '渠道霸权', desc: 'J8 渠道垄断 + J11 高端渠道 + I9 订单网络', ips: ['J8', 'J11', 'I9'], points: 15 },
  { id: 'set-brand', name: '品牌溢价', desc: 'J3 品牌壁垒 + J10 品牌溢价 + I8 质量认证', ips: ['J3', 'J10', 'I8'], points: 15 },
  { id: 'set-mfg', name: '精工强研', desc: 'J12 精益生产 + J6 研发突破 + I1 工艺优化', ips: ['J12', 'J6', 'I1'], points: 15 },
]

// ════════════════════════════════════════════════════════════
// 6. 财务参数
// ════════════════════════════════════════════════════════════

export const BASE_CREDIT_LINE: Money = 50 // 5w 基础借款额度
export const MONTHLY_RATE = 0.05 // 月利率 5%（3 个月期限，见 LOAN_TERM_MONTHS）
export const LOAN_TERM_MONTHS = 3 // 借款期限（月）：第 M 月借款，M + 期限 − 1 月末到期，未还部分强制全额归还
export const RATE_SHIFT_UNIT: Money = 10 // 利率档位：每档 1w
export const TAX_RATE = 0.1 // 所得税，亏损不计
export const RND_COST_PER_PROJECT: Money = 30 // 每个研发项目每月固定投入 3w（计入研发费用）
/** 招聘费按 6 个月摊销，每月摊销额 = 招聘费 / 6，四舍五入到 0.1w */
export const RECRUIT_AMORT_MONTHS = 6
export const RECRUIT_AMORT_PER_MONTH: Money = 8 // ≈ 5w / 6 个月，取整为 0.8w

// ════════════════════════════════════════════════════════════
// 7. 事件池（§3.3 全表）
// ════════════════════════════════════════════════════════════

const T = (low = 0, mid = 0, high = 0, special = 0): Record<Tier, number> => ({ low, mid, high, special })

export const EVENTS: GameEventDef[] = [
  // ── 复苏 ──────────────────────────────────────────────
  { id: 'R1', climate: 'recovery', name: '消费回暖', type: 'instant', polarity: 'good', scope: 'sell', text: '本月低端需求 +1，中端需求 +1。', mods: { demand: T(1, 1) } },
  { id: 'R2', climate: 'recovery', name: '原料低价', type: 'instant', polarity: 'good', scope: 'buy', text: '本月所有原料供给 +2，价格降 1 档。', mods: { allSupply: 2, allTierShift: -1 } },
  { id: 'R3', climate: 'recovery', name: '招工不易', type: 'instant', polarity: 'bad', scope: 'make', text: '本月招聘费 +1w（每名）。', mods: { notes: ['招聘费 +1w'] } },
  { id: 'R4', climate: 'recovery', name: '现金紧张', type: 'instant', polarity: 'bad', scope: 'cash', needs: ['finance'], text: '本月借款利率 +1 档（+0.1%）。', mods: { rateShift: 1 } },
  { id: 'R5', climate: 'recovery', name: '政策观望', type: 'instant', polarity: 'neutral', scope: 'ops', needs: ['cards'], text: '本月抽卡多抽 1 张，但手牌上限 -1。', mods: { drawBonus: 1, handBonus: -1, notes: ['抽卡 +1 张', '手牌上限 -1'] } },
  {
    id: 'R6', climate: 'recovery', name: '低息贷款', type: 'choice', polarity: 'good', scope: 'cash', needs: ['finance'], text: '银行愿意放款，代价是抬高你全部借款的利息。', // 保留 needs 标记（融资层已落地，全模式进池；见 engine.buildEventPool 注释）
    options: [
      { label: '接受贷款', detail: '借款额度 +5w，本月借款利率 +1 档（+0.1%）', mods: { notes: ['借款额度 +5w'], rateShift: 1 }, cost: {}, extra: '额度 +5w · 利率 +1 档' },
      { label: '不借款', detail: '本月资金 +2w', gain: 20 },
    ],
  },
  {
    id: 'R7', climate: 'recovery', name: '供应商提价', type: 'choice', polarity: 'bad', scope: 'buy', text: '上游试探性提价。',
    options: [
      { label: '接受提价', detail: '本月所有原料价格升 1 档', mods: { allTierShift: 1 } },
      { label: '支付 2w 锁定原价', detail: '现金 -2w，本月原料价格不变', cost: { cash: 20 } },
    ],
  },
  {
    id: 'R8', climate: 'recovery', name: '渠道选择', type: 'choice', polarity: 'neutral', scope: 'sell', text: '自建渠道还是省下这笔力气。',
    options: [
      { label: '投入渠道（1 AP）', detail: '消耗 1 AP，本月销售资源 +4（可推低端需求 +4 / 中端 +2 / 高端 +1）', cost: { ap: 1 }, mods: { salesResource: 4 } },
      { label: '放弃', detail: '本月销售资源 -2', mods: { salesResource: -2 } },
    ],
  },
  { id: 'R9', climate: 'recovery', name: '囤积原料', type: 'chance', polarity: 'good', scope: 'buy', text: '有批现货正在低价出清。', chance: { cost: { cash: 30 }, mods: { allSupply: 4 }, detail: '支付 3w，本月每类原料供给 +4' } },
  { id: 'R10', climate: 'recovery', name: '技术引进', type: 'chance', polarity: 'good', scope: 'rnd', text: '外部机构可以提供一次技术辅导。', chance: { cost: { cash: 20 }, mods: { rndRate: 15 }, detail: '支付 2w，本月研发成功率 +15%' } },

  // ── 繁荣 ──────────────────────────────────────────────
  { id: 'P1', climate: 'boom', name: '消费旺盛', type: 'instant', polarity: 'good', scope: 'sell', text: '本月低端、中端、高端需求各 +1。', mods: { demand: T(1, 1, 1) } },
  { id: 'P2', climate: 'boom', name: '产能满载', type: 'instant', polarity: 'good', scope: 'make', text: '本月产能 +3。', mods: { capacity: 3 } },
  { id: 'P3', climate: 'boom', name: '原料跟涨', type: 'instant', polarity: 'bad', scope: 'buy', text: '本月所有原料供给 -2，价格升 1 档。', mods: { allSupply: -2, allTierShift: 1 } },
  { id: 'P4', climate: 'boom', name: '用工成本上升', type: 'instant', polarity: 'bad', scope: 'ops', text: '本月每名员工薪酬 +0.5w（全部门）。', mods: { salaryPer: 5 } },
  { id: 'P5', climate: 'boom', name: '资金充裕', type: 'instant', polarity: 'neutral', scope: 'cash', needs: ['finance'], text: '本月借款利率 -1 档（-0.1%），但现金不产生任何利息。', mods: { rateShift: -1 } },
  {
    id: 'P6', climate: 'boom', name: '扩产机会', type: 'choice', polarity: 'good', scope: 'make', text: '设备厂给出一步到位的报价。',
    options: [
      { label: '购买设备（5w）', detail: '现金 -5w，立即获得 1 台标准设备（每名生产人员产能 +4、月折旧 2w、额度 5w；无生产人员则产能无增益）', cost: { cash: 50 }, extra: '设备 +1 · eq-line' },
      { label: '不购买', detail: '本月产能 +5', mods: { capacity: 5 } },
    ],
  },
  {
    id: 'P7', climate: 'boom', name: '渠道压价', type: 'choice', polarity: 'bad', scope: 'sell', text: '渠道商要求更高的分成。',
    options: [
      { label: '让价', detail: '本月售价降 1 档', mods: { price: T(-1, -1, -1, -1) } },
      { label: '支付 3w 维持原价', detail: '现金 -3w，本月售价不变', cost: { cash: 30 } },
    ],
  },
  {
    id: 'P8', climate: 'boom', name: '技术合作', type: 'choice', polarity: 'neutral', scope: 'rnd', text: '一家研究所提出合作研究。',
    options: [
      { label: '支付 2w 合作', detail: '现金 -2w，本月研发进度 +4', cost: { cash: 20 }, mods: { rndProgress: 4 } },
      { label: '自行研究', detail: '本月研发进度 +1', mods: { rndProgress: 1 } },
    ],
  },
  { id: 'P9', climate: 'boom', name: '大订单', type: 'chance', polarity: 'good', scope: 'sell', text: '客户愿意签一份确定性采购合同。', chance: { cost: { ap: 2 }, mods: { orders: 1, orderQty: 10, orderPriceShift: 1 }, detail: '消耗 2 AP，获得 1 个确定性订单（10 件，订单价高于市价 2 档，月末结算交付）' } },
  { id: 'P10', climate: 'boom', name: '猎头服务', type: 'chance', polarity: 'good', scope: 'ops', text: '猎头手上有一份现成名单。', chance: { cost: { cash: 30 }, mods: { notes: ['本月可额外招聘 1 人（不耗 AP）'] }, detail: '支付 3w，本月可多招聘 1 人（不耗 AP）' } },

  // ── 过热 ──────────────────────────────────────────────
  { id: 'O1', climate: 'overheat', name: '需求爆棚', type: 'instant', polarity: 'good', scope: 'sell', text: '本月中端 +1、高端 +2、特殊 +1 需求。', mods: { demand: T(0, 1, 2, 1) } },
  { id: 'O2', climate: 'overheat', name: '加班文化', type: 'instant', polarity: 'good', scope: 'make', text: '本月产能 +3，但每名员工薪酬 +1w（全部门）。', mods: { capacity: 3, salaryPer: 10 } },
  { id: 'O3', climate: 'overheat', name: '原料飞涨', type: 'instant', polarity: 'bad', scope: 'buy', text: '本月所有原料供给 -4、价格升 1 档；芯片额外供给 -1、价格再升 1 档。', mods: { allSupply: -4, allTierShift: 1, materials: { chip: { supply: -1, tierShift: 1 } } } },
  { id: 'O4', climate: 'overheat', name: '银根收紧', type: 'instant', polarity: 'bad', scope: 'cash', needs: ['finance'], text: '本月借款利率 +2 档（+0.2%），借款额度减半。', mods: { rateShift: 2, creditFactor: 0.5 } },
  { id: 'O5', climate: 'overheat', name: '监管检查', type: 'instant', polarity: 'neutral', scope: 'ops', needs: ['cards'], text: '本月每打出一张牌需额外支付 1w。', mods: { notes: ['打牌费用 +1w/张'] } },
  {
    id: 'O6', climate: 'overheat', name: '长期协议', type: 'choice', polarity: 'bad', scope: 'buy', text: '供应商希望你签下长约以对冲涨价。',
    options: [
      { label: '签下长约（4w）', detail: '现金 -4w，立即签订一份包材 3 个月长期协议（每月中批供应，不占部门协议名额）', cost: { cash: 40 }, extra: '立即签订长期协议（包材 · 3 个月）' },
      { label: '拒绝', detail: '本月所有原料价格升 1 档', mods: { allTierShift: 1 } },
    ],
  },
  {
    id: 'O7', climate: 'overheat', name: '提价测试', type: 'choice', polarity: 'good', scope: 'sell', text: '需求旺盛，可以试探提价。',
    options: [
      { label: '提价', detail: '本月售价升 1 档，需求 -1', mods: { price: T(1, 1, 1, 1), demand: T(-1, -1, -1, -1) } },
      { label: '维持原价', detail: '售价与需求均不变' },
    ],
  },
  {
    id: 'O8', climate: 'overheat', name: '设备维护', type: 'choice', polarity: 'neutral', scope: 'make', text: '设备需要一次停机维护。',
    options: [
      { label: '支付 2w 维护', detail: '现金 -2w，本月产能 +2', cost: { cash: 20 }, mods: { capacity: 2 } },
      { label: '带病运转', detail: '本月产能 -1', mods: { capacity: -1 } },
    ],
  },
  { id: 'O9', climate: 'overheat', name: '短期理财', type: 'chance', polarity: 'good', scope: 'cash', text: '有笔短期资金可以拆出去。', chance: { cost: { cash: 50 }, detail: '支付 5w，下月返还 6w', mods: { notes: ['下月现金 +6w'] } } },
  { id: 'O10', climate: 'overheat', name: '技术突破', type: 'chance', polarity: 'good', scope: 'rnd', text: '外部有一份可以买断的技术资料。', chance: { cost: { cash: 30 }, detail: '支付 3w，立即获得 1 个随机普通知识产权（本月有效）', mods: { tempIps: ['normal'] } } },

  // ── 滞涨 ──────────────────────────────────────────────
  { id: 'S1', climate: 'stagflation', name: '需求萎缩', type: 'instant', polarity: 'bad', scope: 'sell', text: '本月低端、中端、高端需求各 -1。', mods: { demand: T(-1, -1, -1) } },
  { id: 'S2', climate: 'stagflation', name: '成本高企', type: 'instant', polarity: 'bad', scope: 'buy', text: '本月所有原料供给 -3，价格升 1 档。', mods: { allSupply: -3, allTierShift: 1 } },
  { id: 'S3', climate: 'stagflation', name: '现金为王', type: 'instant', polarity: 'bad', scope: 'cash', needs: ['finance'], text: '本月借款利率 +2 档（+0.2%）。', mods: { rateShift: 2 } },
  { id: 'S4', climate: 'stagflation', name: '裁员优化', type: 'instant', polarity: 'good', scope: 'ops', text: '本月可免费解雇 1 名员工，并返还其基础招聘费（100%）。', mods: { notes: ['可在运营部解雇 1 人'] } },
  { id: 'S5', climate: 'stagflation', name: '库存积压', type: 'instant', polarity: 'neutral', scope: 'make', text: '产品卖不动，下月全部产品市价降 1 档。', mods: { notes: ['下月售价 -1 档'] } },
  {
    id: 'S6', climate: 'stagflation', name: '价格战', type: 'choice', polarity: 'bad', scope: 'sell', text: '对手已经开始降价。',
    options: [
      { label: '跟降', detail: '本月售价降 1 档，需求 +2', mods: { price: T(-1, -1, -1, -1), demand: T(2, 2, 2, 2) } },
      { label: '不跟', detail: '售价不变，需求 -2', mods: { demand: T(-2, -2, -2, -2) } },
    ],
  },
  {
    id: 'S7', climate: 'stagflation', name: '抄底原料', type: 'choice', polarity: 'good', scope: 'buy', text: '有供应商急需现金。',
    options: [
      { label: '支付 3w', detail: '现金 -3w，本月所有原料价格降 2 档', cost: { cash: 30 }, mods: { allTierShift: -2 } },
      { label: '不动', detail: '本月所有原料价格升 1 档', mods: { allTierShift: 1 } },
    ],
  },
  {
    id: 'S8', climate: 'stagflation', name: '研发降本', type: 'choice', polarity: 'neutral', scope: 'rnd', text: '外协可以分担一部分研发工作。',
    options: [
      { label: '支付 2w', detail: '现金 -2w，本月每个在研项目的研发费用 -3w', cost: { cash: 20 }, mods: { rndCost: -30 } },
      { label: '自己扛', detail: '本月研发进度 -2', mods: { rndProgress: -2 } },
    ],
  },
  { id: 'S9', climate: 'stagflation', name: '债务重组', type: 'chance', polarity: 'good', scope: 'cash', needs: ['finance'], text: '可以谈一次债务重组。', chance: { cost: { cash: 20 }, mods: { rateShift: -2 }, detail: '支付 2w 手续费，本月借款利率 -2 档（-0.2%）' } },
  { id: 'S10', climate: 'stagflation', name: '精益管理', type: 'chance', polarity: 'good', scope: 'ops', text: '顾问团队能压缩一轮人力成本。', chance: { cost: { ap: 1 }, mods: { salaryPer: -5 }, detail: '消耗 1 AP，本月每名员工薪酬 -0.5w' } },

  // ── 衰退 ──────────────────────────────────────────────
  { id: 'D1', climate: 'recession', name: '订单取消', type: 'instant', polarity: 'bad', scope: 'sell', text: '本月低端 -2、中端 -1、高端 -1 需求。', mods: { demand: T(-2, -1, -1) } },
  { id: 'D2', climate: 'recession', name: '原料下跌', type: 'instant', polarity: 'good', scope: 'buy', text: '本月所有原料供给 +3，价格降 1 档。', mods: { allSupply: 3, allTierShift: -1 } },
  { id: 'D3', climate: 'recession', name: '设备闲置', type: 'instant', polarity: 'bad', scope: 'make', text: '本月产能 -3。', mods: { capacity: -3 } },
  { id: 'D4', climate: 'recession', name: '降息周期', type: 'instant', polarity: 'good', scope: 'cash', needs: ['finance'], text: '本月借款利率 -2 档（-0.2%）。', mods: { rateShift: -2 } },
  { id: 'D5', climate: 'recession', name: '人才回流', type: 'instant', polarity: 'neutral', scope: 'ops', text: '本月招聘费 -1w，但每名员工薪酬 +0.5w（全部门）。', mods: { salaryPer: 5, notes: ['招聘费 -1w'] } },
  {
    id: 'D6', climate: 'recession', name: '清仓甩卖', type: 'choice', polarity: 'bad', scope: 'sell', text: '库存压得厉害。',
    options: [
      { label: '大幅甩卖', detail: '本月售价降 2 档，需求 +2', mods: { price: T(-2, -2, -2, -2), demand: T(2, 2, 2, 2) } },
      { label: '守住价格', detail: '售价不变，需求 -2', mods: { demand: T(-2, -2, -2, -2) } },
    ],
  },
  {
    id: 'D7', climate: 'recession', name: '签订长约', type: 'choice', polarity: 'good', scope: 'buy', text: '低位锁定供应是笔好买卖。',
    options: [
      { label: '支付 3w 签长约', detail: '现金 -3w，立即签订一份包材 6 个月长期协议（每月中批供应，不占部门协议名额）', cost: { cash: 30 }, extra: '立即签订 6 个月长期协议（包材）' },
      { label: '不签', detail: '本月所有原料价格降 1 档', mods: { allTierShift: -1 } },
    ],
  },
  {
    id: 'D8', climate: 'recession', name: '逆势研发', type: 'choice', polarity: 'neutral', scope: 'rnd', text: '低谷期正是投入研发的时候。',
    options: [
      { label: '支付 4w', detail: '现金 -4w，本月研发成功率 +25%', cost: { cash: 40 }, mods: { rndRate: 25 } },
      { label: '收缩投入', detail: '本月研发进度 -2', mods: { rndProgress: -2 } },
    ],
  },
  { id: 'D9', climate: 'recession', name: '低价设备', type: 'chance', polarity: 'good', scope: 'make', text: '有企业正在出清设备。', chance: { cost: { cash: 50 }, detail: '支付 5w，获得 1 条二手产线（每名生产人员产能 +4、月折旧 1w（折旧减半）、额度 5w；无生产人员则产能无增益）', mods: { notes: ['设备 +1 · eq-used'] } } },
  { id: 'D10', climate: 'recession', name: '猎头抄底', type: 'chance', polarity: 'good', scope: 'ops', text: '有人才正待价而沽。', chance: { cost: { cash: 20 }, detail: '支付 2w，免费获得 1 名管理人员（不耗 AP）', mods: { notes: ['管理人员 +1'] } } },

  // ── 萧条 ──────────────────────────────────────────────
  { id: 'X1', climate: 'depression', name: '需求冰点', type: 'instant', polarity: 'bad', scope: 'sell', text: '本月低端 -2、中端 -2、高端 -1、特殊 -1 需求。', mods: { demand: T(-2, -2, -1, -1) } },
  { id: 'X2', climate: 'depression', name: '原料白菜价', type: 'instant', polarity: 'good', scope: 'buy', text: '本月所有原料供给 +5、价格降 1 档；芯片供给不增加、价格不变。', mods: { allSupply: 5, allTierShift: -1, materials: { chip: { supply: -5, tierShift: 1 } } } },
  { id: 'X3', climate: 'depression', name: '信贷冻结', type: 'instant', polarity: 'bad', scope: 'cash', needs: ['finance'], text: '本月无法新增借款，且已有借款利率 +1 档（+0.1%）。', mods: { noBorrow: true, rateShift: 1 } },
  { id: 'X4', climate: 'depression', name: '停工潮', type: 'instant', polarity: 'bad', scope: 'make', text: '本月产能 -4。', mods: { capacity: -4 } },
  { id: 'X5', climate: 'depression', name: '破产潮', type: 'instant', polarity: 'neutral', scope: 'ops', text: '人才正待价而沽，本月招聘费 -50%。', mods: { notes: ['招聘费 -50%'] } },
  {
    id: 'X6', climate: 'depression', name: '生存第一', type: 'choice', polarity: 'bad', scope: 'sell', text: '活下来比什么都重要。',
    options: [
      { label: '断腕', detail: '本月售价降 3 档，需求 +1', mods: { price: T(-3, -3, -3, -3), demand: T(1, 1, 1, 1) } },
      { label: '守住价格', detail: '售价不变，需求 -3', mods: { demand: T(-3, -3, -3, -3) } },
    ],
  },
  {
    id: 'X7', climate: 'depression', name: '囤积居奇', type: 'choice', polarity: 'good', scope: 'buy', text: '有人正在恐慌性抛售。',
    options: [
      { label: '支付 5w 抄底', detail: '现金 -5w，本月所有原料价格降 3 档', cost: { cash: 50 }, mods: { allTierShift: -3 } },
      { label: '按兵不动', detail: '本月所有原料价格降 1 档', mods: { allTierShift: -1 } },
    ],
  },
  {
    id: 'X8', climate: 'depression', name: '技术储备', type: 'choice', polarity: 'neutral', scope: 'rnd', text: '有人愿意低价转让技术。',
    options: [
      { label: '支付 3w', detail: '现金 -3w，获得 1 个随机普通知识产权（本月有效）', cost: { cash: 30 }, extra: '获得 1 个随机普通知识产权' },
      { label: '放弃', detail: '本月研发进度 -4', mods: { rndProgress: -4 } },
    ],
  },
  { id: 'X9', climate: 'depression', name: '资产抄底', type: 'chance', polarity: 'good', scope: 'make', text: '破产清算现场有一台好设备。', chance: { cost: { cash: 80 }, detail: '支付 8w，获得 1 条清算产线（每名生产人员产能 +6、月折旧 2w、额度 8w；无生产人员则产能无增益）', mods: { notes: ['设备 +1 · eq-liquidation'] } } },
  { id: 'X10', climate: 'depression', name: '政府救助', type: 'chance', polarity: 'good', scope: 'cash', text: '有一笔无息纾困贷款。', chance: { cost: { ap: 1 }, detail: '消耗 1 AP，获得 10w 无息贷款（下月偿还）', mods: { notes: ['现金 +10w', '下月偿还 10w'] } } },
]

export const EVENT_BY_ID: Record<string, GameEventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]))

// ════════════════════════════════════════════════════════════
// 8. 董事会目标池（§4.3 / §4.4）
// ════════════════════════════════════════════════════════════

export const OPENING_BASIC: GoalDef[] = [
  { id: 'B1', climate: 'opening', kind: 'basic', name: '本季度累计净利润 ≥ 0', desc: '不亏损即可。', metric: 'netProfitQ', compare: 'gte', value: 0, points: 10 },
  { id: 'B2', climate: 'opening', kind: 'basic', name: '本季度累计收入 ≥ 30w', desc: '跑通销售循环。', metric: 'revenueQ', compare: 'gte', value: 300, points: 10 },
  { id: 'B3', climate: 'opening', kind: 'basic', name: '本季度完成 1 次招聘', desc: '至少招聘 1 人，开始搭建团队。', metric: 'hiresQ', compare: 'gte', value: 1, points: 10 },
]

export const OPENING_CHALLENGE: GoalDef[] = [
  { id: 'C1', climate: 'opening', kind: 'challenge', name: '本季度累计净利润 ≥ 10w', desc: '在第一季度就实现盈利。', metric: 'netProfitQ', compare: 'gte', value: 100, points: 15 },
  { id: 'C2', climate: 'opening', kind: 'challenge', name: '季度末现金 ≥ 35w', desc: '留足现金储备。', metric: 'cashEnd', compare: 'gte', value: 350, points: 15 },
  { id: 'C3', climate: 'opening', kind: 'challenge', name: '季度末员工总数 ≥ 3', desc: '搭起最小团队。', metric: 'staffTotal', compare: 'gte', value: 3, points: 15 },
  { id: 'C4', climate: 'opening', kind: 'challenge', name: '本季度至少 2 个月毛利 ≥ 4w', desc: '本季度内任意 2 个月毛利达到 4w 即可，不要求连续。', metric: 'grossProfitMonths', compare: 'gte', value: 2, points: 20 },
  { id: 'C5', climate: 'opening', kind: 'challenge', name: '本季度累计收入 ≥ 50w', desc: '把销售规模做起来。', metric: 'revenueQ', compare: 'gte', value: 500, points: 15 },
  { id: 'C6', climate: 'opening', kind: 'challenge', name: '本季度完成 1 次研发立项', desc: '选择研发项目并投入至少 1 名研发人员。', metric: 'rndStartsQ', compare: 'gte', value: 1, points: 15 },
]

export const GOAL_POOL: Record<Climate, { basic: GoalDef[]; challenge: GoalDef[] }> = {
  recovery: {
    basic: [
      { id: 'RB1', climate: 'recovery', kind: 'basic', name: '季度累计净利润 ≥ 上季度 × 1.1 + 2w', desc: '在复苏中保持盈利增长。', metric: 'netProfitQ', compare: 'gte', growth: { base: 'netProfitQ', factor: 1.1, plus: 20 }, points: 10 },
      { id: 'RB2', climate: 'recovery', kind: 'basic', name: '季度末现金 ≥ 上季度末 + 5w', desc: '把复苏变成真金白银。', metric: 'cashEnd', compare: 'gte', growth: { base: 'cashEnd', factor: 1, plus: 50 }, points: 10 },
      { id: 'RB3', climate: 'recovery', kind: 'basic', name: '本季度完成 1 次设备购买或研发立项', desc: '为下一轮扩张做准备。', metric: 'capexOrRndQ', compare: 'gte', value: 1, points: 10 },
    ],
    challenge: [
      { id: 'RC1', climate: 'recovery', kind: 'challenge', name: '季度累计净利润 ≥ 基本目标 × 1.5', desc: '把基本目标再翻一半。', metric: 'netProfitQ', compare: 'gte', ratioFromBasic: 1.5, points: 20 },
      { id: 'RC2', climate: 'recovery', kind: 'challenge', name: '季度末现金 ≥ 20w 且无逾期借款', desc: '现金充裕，且不拖欠任何款项。', metric: 'cashEnd', compare: 'gte', value: 200, points: 15 },
      { id: 'RC3', climate: 'recovery', kind: 'challenge', name: '本季度完成 2 次研发立项', desc: '连续推进两个研发项目。', metric: 'rndStartsQ', compare: 'gte', value: 2, points: 20 },
      { id: 'RC4', climate: 'recovery', kind: 'challenge', name: '本季度至少 2 个月毛利 ≥ 6w', desc: '稳定的毛利能力。', metric: 'grossProfitMonths', compare: 'gte', value: 2, param: 60, points: 20 },
      { id: 'RC5', climate: 'recovery', kind: 'challenge', name: '季度末员工总数 ≥ 8', desc: '扩张团队。', metric: 'staffTotal', compare: 'gte', value: 8, points: 15 },
      { id: 'RC6', climate: 'recovery', kind: 'challenge', name: '季度销售收入 ≥ 上季度 × 1.3', desc: '销售收入增长三成。', metric: 'revenueQ', compare: 'gte', growth: { base: 'revenueQ', factor: 1.3 }, points: 20 },
    ],
  },
  boom: {
    basic: [
      { id: 'PB1', climate: 'boom', kind: 'basic', name: '季度累计收入 ≥ 上季度 × 1.2 + 5w', desc: '繁荣期要把规模做上去。', metric: 'revenueQ', compare: 'gte', growth: { base: 'revenueQ', factor: 1.2, plus: 50 }, points: 10 },
      { id: 'PB2', climate: 'boom', kind: 'basic', name: '季度累计净利润 ≥ 上季度 × 1.15 + 2w', desc: '收入与利润同步增长。', metric: 'netProfitQ', compare: 'gte', growth: { base: 'netProfitQ', factor: 1.15, plus: 20 }, points: 10 },
      { id: 'PB3', climate: 'boom', kind: 'basic', name: '季度末净资产 ≥ 上季度末 × 1.1 + 5w', desc: '把利润沉到资产里。', metric: 'netAssetsEnd', compare: 'gte', growth: { base: 'netAssetsEnd', factor: 1.1, plus: 50 }, points: 10 },
    ],
    challenge: [
      { id: 'PC1', climate: 'boom', kind: 'challenge', name: '季度累计收入 ≥ 基本目标 × 1.4', desc: '把收入目标再推高四成。', metric: 'revenueQ', compare: 'gte', ratioFromBasic: 1.4, points: 20 },
      { id: 'PC2', climate: 'boom', kind: 'challenge', name: '本季度至少 2 个月需求满足率 ≥ 90%', desc: '不要让到手的订单跑掉。', metric: 'demandFillMonths', compare: 'gte', value: 2, param: 90, points: 20 },
      { id: 'PC3', climate: 'boom', kind: 'challenge', name: '季度末设备总数 ≥ 3', desc: '产能是繁荣期的瓶颈。', metric: 'equipmentCount', compare: 'gte', value: 3, points: 15 },
      { id: 'PC4', climate: 'boom', kind: 'challenge', name: '本季度高端产品收入 ≥ 总收入的 30%', desc: '把产品结构往上推。', metric: 'highEndShare', compare: 'gte', value: 30, points: 25 },
      { id: 'PC5', climate: 'boom', kind: 'challenge', name: '本季度连续 3 个月毛利 ≥ 8w', desc: '整季每月毛利都在 8w 以上。', metric: 'grossProfitMonths', compare: 'gte', value: 3, param: 80, points: 25 },
      { id: 'PC6', climate: 'boom', kind: 'challenge', name: '季度末员工总数 ≥ 10', desc: '把团队扩到十人。', metric: 'staffTotal', compare: 'gte', value: 10, points: 15 },
    ],
  },
  overheat: {
    basic: [
      { id: 'OB1', climate: 'overheat', kind: 'basic', name: '本季度原料采购单价 ≤ 上季度 × 1.1', desc: '控制住采购成本。', metric: 'unitCostQ', compare: 'lte', growth: { base: 'unitCostQ', factor: 1.1 }, points: 10 },
      { id: 'OB2', climate: 'overheat', kind: 'basic', name: '本季度至少 2 个月毛利 ≥ 5w', desc: '在成本高企时保住毛利。', metric: 'grossProfitMonths', compare: 'gte', value: 2, param: 50, points: 10 },
      { id: 'OB3', climate: 'overheat', kind: 'basic', name: '季度末现金 ≥ 15w', desc: '过热期现金是安全垫。', metric: 'cashEnd', compare: 'gte', value: 150, points: 10 },
    ],
    challenge: [
      { id: 'OC1', climate: 'overheat', kind: 'challenge', name: '本季度连续 3 个月毛利 ≥ 6w', desc: '整季每月毛利 6w 以上。', metric: 'grossProfitMonths', compare: 'gte', value: 3, param: 60, points: 25 },
      { id: 'OC2', climate: 'overheat', kind: 'challenge', name: '季度累计净利润 ≥ 上季度 × 1.2', desc: '过热期也要增长。', metric: 'netProfitQ', compare: 'gte', growth: { base: 'netProfitQ', factor: 1.2 }, points: 20 },
      { id: 'OC3', climate: 'overheat', kind: 'challenge', name: '季度末负债 ≤ 总资产 × 0.4', desc: '别在利率高点加杠杆。', metric: 'debtToAssets', compare: 'lte', value: 40, points: 15 },
      { id: 'OC4', climate: 'overheat', kind: 'challenge', name: '本季度至少 1 个月需求满足率 ≥ 95%', desc: '把需求吃干净。', metric: 'demandFillBest', compare: 'gte', value: 95, points: 20 },
      { id: 'OC5', climate: 'overheat', kind: 'challenge', name: '签订并生效 1 份长期供货协议', desc: '需要采购 3 人解锁。', metric: 'agreementsSigned', compare: 'gte', value: 1, points: 15 },
      { id: 'OC6', climate: 'overheat', kind: 'challenge', name: '季度末存货 ≤ 上季度末 × 0.8', desc: '把库存降下来。', metric: 'inventory', compare: 'lte', growth: { base: 'inventory', factor: 0.8 }, points: 15 },
    ],
  },
  stagflation: {
    basic: [
      { id: 'SB1', climate: 'stagflation', kind: 'basic', name: '季度末现金 ≥ 上季度末 × 0.8', desc: '守住现金底线。', metric: 'cashEnd', compare: 'gte', growth: { base: 'cashEnd', factor: 0.8 }, points: 10 },
      { id: 'SB2', climate: 'stagflation', kind: 'basic', name: '季度末负债 ≤ 上季度末负债', desc: '不再新增债务。', metric: 'debt', compare: 'lte', growth: { base: 'debt', factor: 1 }, points: 10 },
      { id: 'SB3', climate: 'stagflation', kind: 'basic', name: '本季度累计净利润 ≥ 0', desc: '不亏损。', metric: 'netProfitQ', compare: 'gte', value: 0, points: 10 },
    ],
    challenge: [
      { id: 'SC1', climate: 'stagflation', kind: 'challenge', name: '季度累计净利润 ≥ 上季度 × 1.1', desc: '滞涨期仍要增长。', metric: 'netProfitQ', compare: 'gte', growth: { base: 'netProfitQ', factor: 1.1 }, points: 20 },
      { id: 'SC2', climate: 'stagflation', kind: 'challenge', name: '季度末负债 ≤ 净资产 × 0.3', desc: '控制资产负债结构。', metric: 'debtToEquity', compare: 'lte', value: 30, points: 20 },
      { id: 'SC3', climate: 'stagflation', kind: 'challenge', name: '本季度至少 2 个月毛利 ≥ 4w', desc: '守住基本毛利。', metric: 'grossProfitMonths', compare: 'gte', value: 2, param: 40, points: 15 },
      { id: 'SC4', climate: 'stagflation', kind: 'challenge', name: '本季度薪酬支出 ≤ 上季度 × 0.9', desc: '把人力成本压下去。', metric: 'salaryQ', compare: 'lte', growth: { base: 'salaryQ', factor: 0.9 }, points: 15 },
      { id: 'SC5', climate: 'stagflation', kind: 'challenge', name: '本季度研发成功 1 项', desc: '完成任意一个研发项目。', metric: 'rndSuccessQ', compare: 'gte', value: 1, points: 20 },
      { id: 'SC6', climate: 'stagflation', kind: 'challenge', name: '季度末存货 ≤ 上季度末 × 0.7', desc: '大幅压缩库存。', metric: 'inventory', compare: 'lte', growth: { base: 'inventory', factor: 0.7 }, points: 15 },
    ],
  },
  recession: {
    basic: [
      { id: 'DB1', climate: 'recession', kind: 'basic', name: '季度末现金 ≥ 10w', desc: '衰退期现金是命。', metric: 'cashEnd', compare: 'gte', value: 100, points: 10 },
      { id: 'DB2', climate: 'recession', kind: 'basic', name: '本季度薪酬支出 ≤ 上季度 × 0.9', desc: '控制固定成本。', metric: 'salaryQ', compare: 'lte', growth: { base: 'salaryQ', factor: 0.9 }, points: 10 },
      { id: 'DB3', climate: 'recession', kind: 'basic', name: '本季度完成 1 次设备购买或研发立项', desc: '在低谷储备资产。', metric: 'capexOrRndQ', compare: 'gte', value: 1, points: 10 },
    ],
    challenge: [
      { id: 'DC1', climate: 'recession', kind: 'challenge', name: '季度累计净利润 ≥ 上季度 × 1.2', desc: '逆势增长。', metric: 'netProfitQ', compare: 'gte', growth: { base: 'netProfitQ', factor: 1.2 }, points: 20 },
      { id: 'DC2', climate: 'recession', kind: 'challenge', name: '季度末负债 ≤ 净资产 × 0.25', desc: '紧缩资产负债表。', metric: 'debtToEquity', compare: 'lte', value: 25, points: 20 },
      { id: 'DC3', climate: 'recession', kind: 'challenge', name: '本季度研发成功率 ≥ 50%，或完成 1 项研发', desc: '低谷是研发的窗口。', metric: 'rndSuccessQ', compare: 'gte', value: 1, points: 20 },
      { id: 'DC4', climate: 'recession', kind: 'challenge', name: '本季度至少 2 个月毛利 ≥ 5w', desc: '保住毛利。', metric: 'grossProfitMonths', compare: 'gte', value: 2, param: 50, points: 20 },
      { id: 'DC5', climate: 'recession', kind: 'challenge', name: '季度末设备总数 ≥ 3', desc: '抄底产能。', metric: 'equipmentCount', compare: 'gte', value: 3, points: 15 },
      { id: 'DC6', climate: 'recession', kind: 'challenge', name: '季度销售收入 ≥ 上季度 × 1.1', desc: '收入逆势上行。', metric: 'revenueQ', compare: 'gte', growth: { base: 'revenueQ', factor: 1.1 }, points: 20 },
    ],
  },
  depression: {
    basic: [
      { id: 'XB1', climate: 'depression', kind: 'basic', name: '季度末现金 ≥ 15w', desc: '萧条期现金比利润重要。', metric: 'cashEnd', compare: 'gte', value: 150, points: 10 },
      { id: 'XB2', climate: 'depression', kind: 'basic', name: '本季度不新增借款，或借款总额 ≤ 上季度末', desc: '不要再借钱了。', metric: 'debt', compare: 'lte', growth: { base: 'debt', factor: 1 }, points: 10 },
      { id: 'XB3', climate: 'depression', kind: 'basic', name: '本季度完成 1 次设备抄底或知识产权收购', desc: '买入比卖出更有价值。', metric: 'capexOrRndQ', compare: 'gte', value: 1, points: 10 },
    ],
    challenge: [
      { id: 'XC1', climate: 'depression', kind: 'challenge', name: '季度末现金 ≥ 30w', desc: '把现金堆起来。', metric: 'cashEnd', compare: 'gte', value: 300, points: 20 },
      { id: 'XC2', climate: 'depression', kind: 'challenge', name: '本季度累计净利润 ≥ 0', desc: '萧条中不亏就是赢。', metric: 'netProfitQ', compare: 'gte', value: 0, points: 20 },
      { id: 'XC3', climate: 'depression', kind: 'challenge', name: '季度末负债 ≤ 净资产 × 0.2', desc: '近乎无债经营。', metric: 'debtToEquity', compare: 'lte', value: 20, points: 25 },
      { id: 'XC4', climate: 'depression', kind: 'challenge', name: '本季度完成 2 次低价资产购买', desc: '买设备，或者买技术。', metric: 'capexQ', compare: 'gte', value: 2, points: 20 },
      { id: 'XC5', climate: 'depression', kind: 'challenge', name: '本季度研发成功 1 项，且成本 ≤ 3w', desc: '用最少的钱推进研发。', metric: 'rndSuccessQ', compare: 'gte', value: 1, points: 20 },
      { id: 'XC6', climate: 'depression', kind: 'challenge', name: '下季度开始前，现金 ≥ 上季度末 × 1.5', desc: '把现金堆到上季度的一倍半。', metric: 'cashEnd', compare: 'gte', growth: { base: 'cashEnd', factor: 1.5 }, points: 25 },
    ],
  },
}

// ════════════════════════════════════════════════════════════
// 8.5 形状目标（常驻里程碑，两种模式都判，终身一次）
//      判定逻辑见 src/core/milestones.ts（指标复用目标系统口径）
// ════════════════════════════════════════════════════════════


export const MILESTONE_SHAPES: Record<MilestoneDef['shape'], string> = {
  supply: '供应链',
  brand: '品牌',
  tech: '技术',
  finance: '财务',
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'M02', shape: 'supply', name: '新材料通道', desc: '完成 1 次供应商开发（复合材或微机电基础供给 > 0）', points: 10 },
  { id: 'M03', shape: 'supply', name: '稳供', desc: '签订并生效 1 份长期供货协议', points: 5 },
  { id: 'M04', shape: 'brand', name: '高端结构', desc: '某季度高端 + 特殊收入占比 ≥ 30%', points: 15 },
  { id: 'M06', shape: 'brand', name: '规模经营', desc: '某季度季度收入 ≥ 100w', points: 10 },
  { id: 'M07', shape: 'tech', name: '技术沉淀', desc: '累计 2 项研发成功', points: 15 },
  { id: 'M08', shape: 'tech', name: '双线产品', desc: '新解锁 2 条产品线（中端 / 高端 / 特殊中完成 2 个）', points: 10 },
  { id: 'M09', shape: 'finance', name: '整季盈利', desc: '某季度内每个月净利润 ≥ 0', points: 10 },
  { id: 'M10', shape: 'finance', name: '健康资产负债', desc: '季度末负债 ≤ 净资产 × 25%', points: 5 },
]

export const MILESTONE_BY_ID = Object.fromEntries(MILESTONES.map((m) => [m.id, m]))

// ════════════════════════════════════════════════════════════
// 9. 卡牌（§5.6 全表）
// ════════════════════════════════════════════════════════════

export interface CardDef {
  id: string
  name: string
  kind: Dept
  /** 核心卡必然入池 */
  core?: boolean
  /** 规则卡：改本月规则/制造取舍（K 系列） */
  rule?: boolean
  /**
   * 强度档位 0~3：档位越高效果越强，对价（AP + 现金）越高。
   * 档位解锁与对应部门人数挂钩：2 人 → 1 档，3 人 → 2 档，5 人 → 3 档（0~1 人仅 0 档）。
   */
  tier: 0 | 1 | 2 | 3
  /** 员工联动卡标记（效果作用于员工机制） */
  tag?: 'staff'
  /** 员工联动子类：amp = 增效（基础效果 +N）/ mod = 改良（改参数）/ swap = 替换（换形态） */
  sub?: 'amp' | 'mod' | 'swap'
  /** 卡片效果正文 */
  text: string
  /** 门槛条件文字 */
  cond?: string
  /** 强化后的效果说明 */
  empowered?: string
  /** 基础效果 */
  base: (ctx: CardCtx) => CardPlayEffect
  /** 强化效果（若不填则沿用 base） */
  strong?: (ctx: CardCtx) => CardPlayEffect
}

/** 提案档位解锁人数（对应部门）：1 档需 2 人，2 档需 3 人，3 档需 5 人；0 档恒可用。 */
export const TIER_STAFF: Record<1 | 2 | 3, number> = { 1: 2, 2: 3, 3: 5 }

/** 提案档位对价：档位越高，AP + 现金对价越高。 */
export const TIER_COST: Record<0 | 1 | 2 | 3, { ap: number; cash: Money }> = {
  0: { ap: 1, cash: 0 },
  1: { ap: 1, cash: 10 },
  2: { ap: 2, cash: 20 },
  3: { ap: 2, cash: 40 },
}

/** 部门人数 → 已解锁提案档位。 */
export function tierUnlockedOf(staff: number): 0 | 1 | 2 | 3 {
  return staff >= TIER_STAFF[3] ? 3 : staff >= TIER_STAFF[2] ? 2 : staff >= TIER_STAFF[1] ? 1 : 0
}

/** 打出卡牌时可读取的上下文：部门人数、库存与卡牌状态，用于处理「若 X ≥ N 人/库存 ≥ N」的门槛。 */
export interface CardCtx {
  staff: Record<Dept, number>
  empowered: boolean
  mats: string[]
  /** 全部产品库存合计（S9 清仓甩卖等库存门槛用）。 */
  prodStock: number
}

const S = (ctx: CardCtx, d: Dept) => ctx.staff[d]

export const CARDS: CardDef[] = [
  // ── 采购 ──────────────────────────────────────────────
  {
    id: 'C1', name: '批量采购', kind: 'buy', core: true, tier: 1,
    text: '本月采购价格降 1 档；自第 2 个已选采购档起再降 1 档。',
    empowered: '本月采购价格降 2 档；自第 2 个已选采购档起再降 1 档。',
    base: () => ({ buyTierShift: -1, flags: ['buyTierExtra'] }),
    strong: () => ({ buyTierShift: -2, flags: ['buyTierExtra'] }),
  },
  {
    id: 'C2', name: '囤货', kind: 'buy', tier: 2,
    text: '本月每类原料供给 +4，且本月采购不占仓容上限。',
    empowered: '本月每类原料供给 +8，且本月采购不占仓容上限。',
    base: (c) => ({ buySupply: c.empowered ? 8 : 4, flags: ['noCap'] }),
  },
  {
    id: 'C3', name: '压价', kind: 'buy', tier: 2,
    text: '本月采购价格降 2 档；选定 1 种原料，其本月供给 −2（采购页选惩罚对象）。',
    cond: '选定 1 种惩罚原料（供给 −2）',
    empowered: '本月采购价格降 3 档，且无供给惩罚。',
    base: () => ({ buyTierShift: -2, flags: ['c3Penalty'] }),
    strong: () => ({ buyTierShift: -3 }),
  },
  {
    id: 'C4', name: '贸易商', kind: 'buy', tier: 0,
    text: '本月获得 1 次额外贸易商购买机会（小批、价格 +1 档，不占档数）。',
    empowered: '本月获得 2 次额外贸易商购买机会（小批、价格 +1 档，不占档数）。',
    base: () => ({ flags: ['trader'] }),
  },
  {
    id: 'C5', name: '长期协议', kind: 'buy', core: true, tier: 2,
    text: '需采购 ≥ 3 人。立即签订一份包材 3 个月长期协议（每月中批供应，不占部门协议名额）。若采购 ≥ 4 人，锁定期改为 6 个月。',
    cond: '采购 ≥ 4 人：锁定期 6 个月',
    empowered: '需采购 ≥ 3 人。立即签订两份包材长期协议，各锁定 6 个月，均不占部门协议名额。',
    base: (c) => ({ flags: [S(c, 'buy') >= 4 ? 'agreement2x6' : 'agreement2x3'] }),
    strong: () => ({ flags: ['agreement2x6', 'agreementDouble'] }),
  },
  {
    id: 'C6', name: '紧急采购', kind: 'buy', tier: 0,
    text: '本月每类原料 1 次紧急采购机会：小批、价格 +2 档，不占档数（采购页使用）。',
    empowered: '本月每类原料 1 次紧急采购机会：中批、价格 +1 档，不占档数（采购页使用）。',
    base: (c) => ({ flags: [c.empowered ? 'urgentMid' : 'urgent'] }),
  },
  {
    id: 'C7', name: '原料替换', kind: 'buy', tier: 0,
    text: '按账面单价出售 5 单位任一原料，按当前价格购入 5 单位另一种原料，不占档数（采购页使用）。',
    empowered: '按账面单价出售 5 单位任一原料，按当前价格购入 7 单位另一种原料，不占档数（采购页使用）。',
    base: (c) => ({ flags: [c.empowered ? 'swapPlus' : 'swap'] }),
  },
  {
    id: 'C8', name: '供应商关系', kind: 'buy', tier: 1,
    text: '本月采购价格降 1 档；若上月也打出过此牌，降 2 档。',
    empowered: '本月采购价格降 2 档；若上月也打出过此牌，降 3 档。',
    base: (c) => ({ buyTierShift: c.empowered ? -2 : -1, flags: ['supplierRelation'] }),
  },
  {
    id: 'C9', name: '期货', kind: 'buy', tier: 2,
    text: '锁定下月档位最高原料的价格（该原料下月档位上涨时，仍按本月锁定档位采购）。',
    empowered: '锁定下月全部原料价格（档位上涨时按本月锁定档位采购）。',
    base: (c) => ({ flags: [c.empowered ? 'futuresAll' : 'futures'] }),
  },
  {
    id: 'C10', name: '清仓', kind: 'buy', tier: 1,
    text: '需采购 ≥ 2 人。本月每类原料 1 次清仓采购机会：小批、价格 -2 档，不占档数（采购页使用）。',
    empowered: '需采购 ≥ 2 人。本月每类原料 1 次清仓采购机会：中批、价格 -2 档，不占档数（采购页使用）。',
    base: (c) => ({ flags: [c.empowered ? 'clearanceMid' : 'clearance'] }),
  },
  // ── 采购·员工联动（增效 / 改良 / 替换） ─────────────────
  {
    id: 'C11', name: '采购培训', kind: 'buy', tier: 1, tag: 'staff', sub: 'amp',
    text: '本月每名采购人员资源 +1（供给加点 / 议价点数）。',
    empowered: '本月每名采购人员资源 +2。',
    base: () => ({ buyResPerStaff: 1 }),
    strong: () => ({ buyResPerStaff: 2 }),
  },
  {
    id: 'C12', name: '谈判专家', kind: 'buy', tier: 2, tag: 'staff', sub: 'mod',
    text: '本月议价 4 点/档 → 3 点/档（需议价已解锁，即采购 ≥ 4 人）。',
    cond: '需议价已解锁',
    empowered: '本月议价 4 点/档 → 2 点/档。',
    base: () => ({ negotiateCost: 3 }),
    strong: () => ({ negotiateCost: 2 }),
  },
  {
    id: 'C13', name: '材料聚焦', kind: 'buy', tier: 2, tag: 'staff', sub: 'swap',
    text: '本月采购资源点数不再用于供给加点，改为指定 1 种原料（采购页选择）：该原料供给 +6、价格 −1 档。',
    cond: '需采购页选定聚焦原料',
    empowered: '该原料供给 +10、价格 −2 档。',
    base: () => ({ flags: ['matFocus'] }),
    strong: () => ({ flags: ['matFocusPlus'] }),
  },
  {
    id: 'C14', name: '供应合约', kind: 'buy', tier: 3, tag: 'staff', sub: 'amp',
    text: '本月长期协议槽 +1，且锁定期可选 6 个月（需采购 3 人解锁协议）。',
    empowered: '本月长期协议槽 +2，且锁定期可选 6 个月。',
    base: () => ({ agreeSlotsPlus: 1, flags: ['agreeLock6'] }),
    strong: () => ({ agreeSlotsPlus: 2, flags: ['agreeLock6'] }),
  },
  {
    id: 'C15', name: '锁价谈判', kind: 'buy', tier: 3, tag: 'staff', sub: 'swap',
    text: '本月资源点数全部计入议价：议价 4 点/档 → 2 点/档，且供给加点上限减半（需议价已解锁）。',
    cond: '需议价已解锁',
    empowered: '议价 4 点/档 → 1 点/档，供给加点上限不变。',
    base: () => ({ negotiateCost: 2, flags: ['supplyPushHalf'] }),
    strong: () => ({ negotiateCost: 1 }),
  },

  // ── 生产 ──────────────────────────────────────────────
  {
    id: 'P1', name: '满负荷', kind: 'make', core: true, tier: 0,
    text: '本月产能 +3。',
    empowered: '本月产能 +6。',
    base: () => ({ capacity: 3 }),
    strong: () => ({ capacity: 6 }),
  },
  {
    id: 'P2', name: '质量管控', kind: 'make', core: true, tier: 0,
    text: '本月产能 +2。',
    empowered: '本月产能 +4，且本月生产成本 -10%。',
    base: (c) => ({ capacity: c.empowered ? 4 : 2, costFactor: c.empowered ? 0.9 : 1 }),
  },
  {
    id: 'P3', name: '加班', kind: 'make', tier: 1,
    text: '本月产能 +4，每名员工薪酬 +0.5w（全部门）。',
    empowered: '本月产能 +7，每名员工薪酬 +1w（全部门）。',
    base: (c) => ({ capacity: c.empowered ? 7 : 4, salary: c.empowered ? 10 : 5 }),
  },
  {
    id: 'P4', name: '设备维护', kind: 'make', tier: 0,
    text: '本月产能 +2。',
    empowered: '本月产能 +4。',
    base: (c) => ({ capacity: c.empowered ? 4 : 2 }),
  },
  {
    id: 'P5', name: '工人培训', kind: 'make', tier: 2,
    text: '需生产 ≥ 3 人。本月每名工人产能 +1。若生产 ≥ 4 人，改为 +2。',
    cond: '生产 ≥ 4 人：每人 +2',
    empowered: '需生产 ≥ 3 人。支付 2w，本月每名工人产能 +2。若生产 ≥ 4 人，改为 +3。',
    base: (c) => ({ capacity: (S(c, 'make') >= 4 ? 2 : 1) * Math.max(1, S(c, 'make')) }),
    strong: (c) => ({ capacity: (S(c, 'make') >= 4 ? 3 : 2) * Math.max(1, S(c, 'make')) }),
  },
  {
    id: 'P6', name: '批量生产', kind: 'make', tier: 1,
    text: '本月产能 +2。若生产 ≥ 5 人，+4。',
    cond: '生产 ≥ 5 人：+4',
    empowered: '本月产能 +4。若生产 ≥ 5 人，+6。',
    base: (c) => ({ capacity: S(c, 'make') >= 5 ? (c.empowered ? 6 : 4) : c.empowered ? 4 : 2 }),
  },
  {
    id: 'P7', name: '精益生产', kind: 'make', tier: 2,
    text: '支付 2w，本月产能 +2，且生产成本 -10%。',
    empowered: '支付 2w，本月产能 +3，且生产成本 -20%。',
    base: (c) => ({ capacity: c.empowered ? 3 : 2, costFactor: c.empowered ? 0.8 : 0.9 }),
  },
  {
    id: 'P8', name: '轮班制', kind: 'make', tier: 1,
    text: '本月产能 +2，每名员工薪酬 +0.5w（全部门）。若生产 ≥ 3 人，无薪酬惩罚。',
    cond: '生产 ≥ 3 人：无惩罚',
    empowered: '本月产能 +4，无薪酬惩罚。',
    base: (c) => ({ capacity: c.empowered ? 4 : 2, salary: c.empowered ? 0 : (S(c, 'make') >= 3 ? 0 : 5) }),
    strong: () => ({ capacity: 4 }),
  },
  {
    id: 'P9', name: '自动化', kind: 'make', tier: 1,
    text: '本月产能 +2。若研发 ≥ 3 人，改为 +4。',
    cond: '研发 ≥ 3 人：+4',
    empowered: '本月产能 +4。若研发 ≥ 3 人，改为 +6。',
    base: (c) => ({ capacity: S(c, 'rnd') >= 3 ? (c.empowered ? 6 : 4) : c.empowered ? 4 : 2 }),
  },
  {
    id: 'P10', name: '库存清理', kind: 'make', tier: 2,
    text: '支付 2w，月末结算时将成品库存最多的产品按账面单价出售 5 件（不计损益，只把存货换成现金）；总库存 ≥ 10 件时出售 10 件。',
    empowered: '支付 2w，月末结算时按账面单价出售 10 件；总库存 ≥ 15 件时出售 15 件。',
    base: (c) => ({ flags: [c.empowered ? 'clearStock15' : 'clearStock'] }),
  },
  // ── 生产·员工联动（增效 / 改良 / 替换） ─────────────────
  {
    id: 'P11', name: '产能提升', kind: 'make', tier: 1, tag: 'staff', sub: 'amp',
    text: '本月每名工人产能 +1。',
    empowered: '本月每名工人产能 +2。',
    base: () => ({ capPerStaff: 1 }),
    strong: () => ({ capPerStaff: 2 }),
  },
  {
    id: 'P12', name: '加班补贴', kind: 'make', tier: 2, tag: 'staff', sub: 'mod',
    text: '本月加班费减半（2× 生产工资 → 1×，需加班已解锁，即生产 ≥ 3 人）。',
    cond: '需加班已解锁',
    empowered: '本月加班费减半，且加班产能 +1× 员工产能。',
    base: () => ({ flags: ['overtimeHalf'] }),
    strong: () => ({ flags: ['overtimeHalfPlus'] }),
  },
  {
    id: 'P13', name: '质效模式', kind: 'make', tier: 2, tag: 'staff', sub: 'swap',
    text: '本月每名工人产能 −1，但生产成本 −20%（以产出换效率）。',
    empowered: '本月每名工人产能 −1，但生产成本 −30%。',
    base: () => ({ capPerStaff: -1, costFactor: 0.8 }),
    strong: () => ({ capPerStaff: -1, costFactor: 0.7 }),
  },
  {
    id: 'P14', name: '全员维护', kind: 'make', tier: 3, tag: 'staff', sub: 'amp',
    text: '本月每名工人产能 +2，且加班费减半（需加班已解锁）。',
    empowered: '本月每名工人产能 +3，加班费减半且加班产能 +1× 员工产能。',
    base: () => ({ capPerStaff: 2, flags: ['overtimeHalf'] }),
    strong: () => ({ capPerStaff: 3, flags: ['overtimeHalfPlus'] }),
  },
  {
    id: 'P15', name: '设备模式', kind: 'make', tier: 3, tag: 'staff', sub: 'swap',
    text: '本月设备产能加成 ×2（每台设备由 +4/人 → +8/人），每名工人基础产能 −1（无设备时净亏，慎用）。',
    cond: '持有设备时效果显著',
    empowered: '本月设备产能加成 ×2，每名工人基础产能不减，且加班费减半。',
    base: () => ({ equipCapFactor: 2, capPerStaff: -1 }),
    strong: () => ({ equipCapFactor: 2, flags: ['overtimeHalf'] }),
  },

  // ── 销售 ──────────────────────────────────────────────
  {
    id: 'S1', name: '促销活动', kind: 'sell', core: true, tier: 0,
    text: '本月低端需求 +2。若销售 ≥ 3 人，额外 +1。',
    cond: '销售 ≥ 3 人：额外 +1',
    empowered: '本月低端需求 +4。若销售 ≥ 3 人，额外 +2。',
    base: (c) => ({ demand: T(2 + (S(c, 'sell') >= 3 ? 1 : 0), 0, 0, 0) }),
    strong: (c) => ({ demand: T(4 + (S(c, 'sell') >= 3 ? 2 : 0), 0, 0, 0) }),
  },
  {
    id: 'S2', name: '渠道拓展', kind: 'sell', tier: 1,
    text: '本月销售资源 +5（可推低端需求 +5 / 中端 +2 / 高端 +1）。若销售 ≥ 2 人，额外 +3。',
    cond: '销售 ≥ 2 人：额外 +3',
    empowered: '本月销售资源 +8（可推低端需求 +8 / 中端 +4 / 高端 +2）。若销售 ≥ 2 人，额外 +5。',
    base: (c) => ({ salesResource: (c.empowered ? 8 : 5) + (S(c, 'sell') >= 2 ? (c.empowered ? 5 : 3) : 0) }),
  },
  {
    id: 'S3', name: '大订单', kind: 'sell', core: true, tier: 1,
    text: '需销售 ≥ 2 人。获得 1 个确定性订单（10 件，订单价高于市价 1 档，月末结算交付）。若销售 ≥ 4 人，数量 15 件。',
    cond: '销售 ≥ 4 人：数量 15',
    empowered: '需销售 ≥ 2 人。支付 2w，获得 2 个确定性订单，各 15 件（订单价高于市价 1 档）。',
    base: (c) => ({ orders: c.empowered ? 2 : 1, orderQty: S(c, 'sell') >= 4 || c.empowered ? 15 : 10, flags: [c.empowered ? 's3x2' : ''] }),
  },
  {
    id: 'S4', name: '提价', kind: 'sell', tier: 1,
    text: '本月产品售价升 1 档，低端与中端需求 -1（高端 / 特殊无需求惩罚）。',
    empowered: '本月产品售价升 2 档，低端与中端需求 -1（高端 / 特殊无需求惩罚）。',
    base: (c) => ({ price: c.empowered ? T(2, 2, 2, 2) : T(1, 1, 1, 1), demand: T(-1, -1, 0, 0) }),
  },
  {
    id: 'S5', name: '品牌建设', kind: 'sell', tier: 1,
    text: '本月高端需求 +1。若研发 ≥ 3 人，额外 +1。',
    cond: '研发 ≥ 3 人：额外 +1',
    empowered: '本月高端需求 +2，特殊需求 +1。若研发 ≥ 3 人，高端额外 +1。',
    base: (c) => ({ demand: T(0, 0, (c.empowered ? 2 : 1) + (S(c, 'rnd') >= 3 ? 1 : 0), c.empowered ? 1 : 0) }),
  },
  {
    id: 'S6', name: '销售激励', kind: 'sell', tier: 1,
    text: '本月销售资源 +3（可推低端需求 +3 / 中端 +1），每名员工薪酬 +0.5w（全部门）。若销售 ≥ 3 人，无薪酬惩罚。',
    cond: '销售 ≥ 3 人：无惩罚',
    empowered: '本月销售资源 +6（可推低端需求 +6 / 中端 +3），无薪酬惩罚。',
    base: (c) => ({ salesResource: c.empowered ? 6 : 3, salary: c.empowered ? 0 : (S(c, 'sell') >= 3 ? 0 : 5) }),
    strong: () => ({ salesResource: 6 }),
  },
  {
    id: 'S7', name: '市场调研', kind: 'sell', tier: 0,
    text: '本月低端需求 +1，中端需求 +1。若销售 ≥ 2 人，额外 +1。',
    cond: '销售 ≥ 2 人：额外 +1',
    empowered: '本月低端 +2、中端 +2。若销售 ≥ 2 人，各额外 +1。',
    base: (c) => {
      const extra = S(c, 'sell') >= 2 ? 1 : 0
      const base = c.empowered ? 2 : 1
      return { demand: T(base + extra, base + extra, 0, 0) }
    },
  },
  {
    id: 'S8', name: '客户关系', kind: 'sell', tier: 2,
    text: '需销售 ≥ 2 人。本月获得 1 个额外确定性订单（10 件，订单价高于市价 1 档）。若本月已有订单，再 +1 个。',
    cond: '已有订单：额外 +1',
    empowered: '需销售 ≥ 2 人。本月获得 2 个额外确定性订单（各 10 件，订单价高于市价 1 档）。若本月已有订单，再 +1 个。',
    base: (c) => ({ orders: c.empowered ? 2 : 1, flags: ['customerRelation', c.empowered ? 's8x2' : ''] }),
  },
  {
    id: 'S9', name: '清仓甩卖', kind: 'sell', tier: 1,
    text: '本月售价降 1 档，需求 +2。若库存 ≥ 15，需求改为 +3。',
    cond: '库存 ≥ 15：需求 +3',
    empowered: '本月售价降 1 档，需求 +3。若库存 ≥ 15，需求改为 +5。',
    base: (c) => {
      const extra = c.prodStock >= 15 ? (c.empowered ? 5 : 3) : c.empowered ? 3 : 2
      return { price: T(-1, -1, -1, -1), demand: T(extra, extra, extra, extra) }
    },
  },
  {
    id: 'S10', name: '高端市场', kind: 'sell', tier: 2,
    text: '需销售 ≥ 3 人（2 档）。本月高端产品售价升 2 档。',
    empowered: '需销售 ≥ 3 人（2 档）。本月高端、特殊产品售价升 2 档。',
    base: () => ({ priceShift: T(0, 0, 2, 0) }),
    strong: () => ({ priceShift: T(0, 0, 2, 2) }),
  },

  // ── 销售·员工联动（增效 / 改良 / 替换） ─────────────────
  {
    id: 'S11', name: '销售培训', kind: 'sell', tier: 1, tag: 'staff', sub: 'amp',
    text: '本月每人销售资源 +2。',
    empowered: '本月每人销售资源 +3。',
    base: () => ({ sellResPerStaff: 2 }),
    strong: () => ({ sellResPerStaff: 3 }),
  },
  {
    id: 'S12', name: '高端定价', kind: 'sell', tier: 2, tag: 'staff', sub: 'mod',
    text: '本月提价 8 点/档 → 6 点/档（需提价已解锁，即销售 ≥ 4 人）。',
    cond: '需提价已解锁',
    empowered: '本月提价 8 点/档 → 4 点/档。',
    base: () => ({ priceRaiseCost: 6 }),
    strong: () => ({ priceRaiseCost: 4 }),
  },
  {
    id: 'S13', name: '以量换价', kind: 'sell', tier: 2, tag: 'staff', sub: 'swap',
    text: '本月全部确定性订单数量 +5 件，订单价 +1 档 → +0（平价成交，以量换价）。',
    empowered: '本月全部确定性订单数量 +10 件，订单价格不变。',
    base: () => ({ orderQtyPlus: 5, orderPriceShift: -1 }),
    strong: () => ({ orderQtyPlus: 10 }),
  },
  {
    id: 'S14', name: '品牌溢价', kind: 'sell', tier: 3, tag: 'staff', sub: 'amp',
    text: '本月每人销售资源 +4，且确定性订单槽 +1（渠道每月多 1 单）。',
    empowered: '本月每人销售资源 +4，确定性订单槽 +2。',
    base: () => ({ sellResPerStaff: 4, orders: 1 }),
    strong: () => ({ sellResPerStaff: 4, orders: 2 }),
  },
  {
    id: 'S15', name: '提价月', kind: 'sell', tier: 3, tag: 'staff', sub: 'swap',
    text: '本月销售资源推需求效果减半，但提价 8 点/档 → 4 点/档（以推力换定价权，需提价已解锁）。',
    cond: '需提价已解锁',
    empowered: '推需求减半，提价 4 点/档且本月可提 2 档。',
    base: () => ({ priceRaiseCost: 4, flags: ['sellPushHalf'] }),
    strong: () => ({ priceRaiseCost: 4, priceRaiseCap: 2, flags: ['sellPushHalf'] }),
  },

  // ── 研发 ──────────────────────────────────────────────
  {
    id: 'R1', name: '加速研发', kind: 'rnd', core: true, tier: 0,
    text: '本月研发进度 +4。若研发 ≥ 3 人，额外 +2。',
    cond: '研发 ≥ 3 人：额外 +2',
    empowered: '本月研发进度 +7。若研发 ≥ 3 人，额外 +3。',
    base: (c) => ({ rndProgress: (c.empowered ? 7 : 4) + (S(c, 'rnd') >= 3 ? (c.empowered ? 3 : 2) : 0) }),
  },
  {
    id: 'R2', name: '降低成本', kind: 'rnd', tier: 1,
    text: '本月每个在研项目的研发费用 -2w。若研发 ≥ 2 人，额外 -1w。',
    cond: '研发 ≥ 2 人：额外 -1w',
    empowered: '本月每个在研项目的研发费用 -4w。若研发 ≥ 2 人，额外 -2w。',
    base: (c) => ({ rndCost: -((c.empowered ? 40 : 20) + (S(c, 'rnd') >= 2 ? (c.empowered ? 20 : 10) : 0)) }),
  },
  {
    id: 'R3', name: '技术合作', kind: 'rnd', core: true, tier: 1,
    text: '本月研发成功率 +15%。若研发 ≥ 4 人，额外 +10%。',
    cond: '研发 ≥ 4 人：额外 +10%',
    empowered: '本月研发成功率 +25%。若研发 ≥ 4 人，额外 +15%。',
    base: (c) => ({ rndRate: (c.empowered ? 25 : 15) + (S(c, 'rnd') >= 4 ? (c.empowered ? 15 : 10) : 0) }),
  },
  {
    id: 'R4', name: '专利申请', kind: 'rnd', tier: 2,
    text: '获得 1 个随机普通知识产权（本月有效）。若研发 ≥ 5 人，改为永久。',
    cond: '研发 ≥ 5 人：普通永久 / 强化本季',
    empowered: '获得 1 个随机强力知识产权（本月有效）。若研发 ≥ 5 人，本季有效。',
    base: (c) => ({ flags: [c.empowered ? 'ipStrongTemp' : 'ipNormalTemp', S(c, 'rnd') >= 5 ? (c.empowered ? 'ipQuarter' : 'ipPerm') : ''] }),
  },
  {
    id: 'R5', name: '研发人员', kind: 'rnd', tier: 0,
    text: '本月研发进度 +3。若研发 ≥ 3 人，额外 +2。',
    cond: '研发 ≥ 3 人：额外 +2',
    empowered: '本月研发进度 +5。若研发 ≥ 3 人，额外 +4。',
    base: (c) => ({ rndProgress: (c.empowered ? 5 : 3) + (S(c, 'rnd') >= 3 ? (c.empowered ? 4 : 2) : 0) }),
  },
  {
    id: 'R6', name: '逆向工程', kind: 'rnd', tier: 2,
    text: '需研发 ≥ 3 人（2 档）。立即解锁 1 个未解锁的产品配方（按中端 → 高端 → 特殊顺序，无需研发放置），并揭示新材料。',
    empowered: '需研发 ≥ 3 人（2 档）。立即解锁 2 个未解锁的产品配方，无需研发放置。',
    base: (c) => ({ flags: [c.empowered ? 'reverse2' : 'reverse'] }),
  },
  {
    id: 'R7', name: '基础研究', kind: 'rnd', tier: 0,
    text: '本月研发进度 +2。若研发 ≥ 3 人，额外 +2。',
    cond: '研发 ≥ 3 人：额外 +2',
    empowered: '本月研发进度 +4。若研发 ≥ 3 人，额外 +3。',
    base: (c) => ({ rndProgress: (c.empowered ? 4 : 2) + (S(c, 'rnd') >= 3 ? (c.empowered ? 3 : 2) : 0) }),
  },
  {
    id: 'R8', name: '技术引进', kind: 'rnd', tier: 2,
    text: '本月研发进度 +6。若研发 ≥ 3 人，改为 +10。',
    cond: '研发 ≥ 3 人：+10',
    empowered: '本月研发进度 +12。',
    base: (c) => ({ rndProgress: S(c, 'rnd') >= 3 ? (c.empowered ? 12 : 10) : c.empowered ? 12 : 6 }),
  },
  {
    id: 'R9', name: '实验设备', kind: 'rnd', tier: 1,
    text: '本月研发成本 -1w，研发进度 +2。若研发 ≥ 4 人，成本改为 -2w。',
    cond: '研发 ≥ 4 人：成本 -2w',
    empowered: '本月研发成本 -2w，研发进度 +4。若研发 ≥ 4 人，成本 -4w。',
    base: (c) => ({ rndCost: -(c.empowered ? 20 : 10) - (S(c, 'rnd') >= 4 ? (c.empowered ? 20 : 10) : 0), rndProgress: c.empowered ? 4 : 2 }),
  },
  {
    id: 'R10', name: '知识产权保护', kind: 'rnd', tier: 3, tag: 'staff', sub: 'amp',
    text: '本月全部在研项目成功率 +25%（受成功率封顶限制）。',
    empowered: '本月全部在研项目成功率 +40%（受成功率封顶限制）。',
    base: () => ({ rndRate: 25 }),
    strong: () => ({ rndRate: 40 }),
  },
  // ── 研发·员工联动（增效 / 改良 / 替换） ─────────────────
  {
    id: 'R11', name: '聚焦攻关', kind: 'rnd', tier: 1, tag: 'staff', sub: 'amp',
    text: '本月每人研发进度 +2。',
    empowered: '本月每人研发进度 +3。',
    base: () => ({ rndProgPerStaff: 2 }),
    strong: () => ({ rndProgPerStaff: 3 }),
  },
  {
    id: 'R12', name: '研发补贴', kind: 'rnd', tier: 2, tag: 'staff', sub: 'mod',
    text: '本月每个在研项目研发费用 −1w，且成功率封顶 90% → 95%。',
    empowered: '本月每个在研项目研发费用 −2w，成功率封顶 100%。',
    base: () => ({ rndCost: -10, rndRateCapPlus: 5 }),
    strong: () => ({ rndCost: -20, rndRateCapPlus: 10 }),
  },
  {
    id: 'R13', name: '求稳模式', kind: 'rnd', tier: 2, tag: 'staff', sub: 'swap',
    text: '本月每人研发进度 5 → 3，但每人成功率加成 5% → 10%（以速度换确定性）。',
    empowered: '每人研发进度 5 → 3，每人成功率加成 5% → 15%。',
    base: () => ({ rndProgPerStaff: -2, rndRatePerStaff: 5 }),
    strong: () => ({ rndProgPerStaff: -2, rndRatePerStaff: 10 }),
  },
  {
    id: 'R14', name: '突破模式', kind: 'rnd', tier: 3, tag: 'staff', sub: 'swap',
    text: '本月研发进度 ×1.5，且月末进度满额的项目中进度最高者额外掷 1 次成功率（取高）。',
    empowered: '本月研发进度 ×2，进度最高的 2 个项目各额外掷 1 次（取高）。',
    base: () => ({ rndProgFactor: 1.5, flags: ['rndReroll1'] }),
    strong: () => ({ rndProgFactor: 2, flags: ['rndReroll2'] }),
  },

  // ── 管理 ──────────────────────────────────────────────
  {
    id: 'M1', name: '抽牌', kind: 'ops', tier: 1,
    text: '抽 1 张牌入手。',
    empowered: '抽 2 张牌入手。',
    base: (c) => ({ flags: [c.empowered ? 'm1b' : 'm1'] }),
  },
  {
    id: 'M2', name: '+1 AP', kind: 'ops', tier: 1, tag: 'staff', sub: 'amp',
    text: '本月 AP +1。若本月未打出其他牌，改为 +2。',
    empowered: '本月 AP +2。若本月未打出其他牌，改为 +3。',
    base: (c) => ({ ap: c.empowered ? 2 : 1, flags: ['m2'] }),
  },
  {
    id: 'M3', name: '复制手牌', kind: 'ops', tier: 2,
    text: '复制一张手牌，立即加入手牌（保留原牌的效果与强化状态）。',
    empowered: '复制一张手牌，立即加入手牌（保留原牌的效果与强化状态），且本月 AP +1。',
    base: (c) => ({ flags: [c.empowered ? 'm3b' : 'm3'], ap: c.empowered ? 1 : 0 }),
  },
  {
    id: 'M4', name: '弃 2 换 1', kind: 'ops', tier: 3,
    text: '弃 2 张手牌，获得 1 张随机强化卡。',
    empowered: '弃 1 张手牌，获得 2 张随机强化卡。',
    base: (c) => ({ flags: [c.empowered ? 'm4b' : 'm4'] }),
  },
  // ── 管理·员工联动（改良 / 替换） ─────────────────────
  {
    id: 'M5', name: '高效招聘', kind: 'ops', tier: 2, tag: 'staff', sub: 'mod',
    text: '本月招聘费 −50%。',
    empowered: '本月招聘费 −75%。',
    base: () => ({ hireFeeFactor: 0.5 }),
    strong: () => ({ hireFeeFactor: 0.25 }),
  },
  {
    id: 'M6', name: '即时授权', kind: 'ops', tier: 2, tag: 'staff', sub: 'swap',
    text: '本月招聘管理人员时，其 AP 上限 +1 即时生效（正常下月生效，招聘本身仍耗 1 AP）。',
    empowered: 'AP 即时生效，且本月管理招聘 1 次不耗 AP。',
    base: () => ({ flags: ['opsApImmediate'] }),
    strong: () => ({ flags: ['opsApImmediate', 'hireApFree'] }),
  },
  {
    id: 'M7', name: '降本模式', kind: 'ops', tier: 3, tag: 'staff', sub: 'swap',
    text: '本月管理 AP 上限 +1 失效（AP 上限回落基础 3），改为：提案费用 −1w/张、招聘费 −50%（以 AP 换成本）。',
    empowered: '同基础版，但本月 AP 上限额外 +1（回落至基础 +1）。',
    base: () => ({ flags: ['opsApOff', 'cardFeeDown'], hireFeeFactor: 0.5 }),
    strong: () => ({ flags: ['opsApOff', 'cardFeeDown'], hireFeeFactor: 0.5, ap: 1 }),
  },

  // ── 规则卡（K 系列：改本月规则，制造取舍；1 AP + 现金） ──────────
  {
    id: 'K1', name: '定价权', kind: 'sell', rule: true, tier: 2, tag: 'staff', sub: 'swap',
    text: '本月现货售价档位由你选（基准 / 高 / 极高）；每高 1 档，各层需求 −1（订单不受影响）。',
    empowered: '本月现货售价档位由你选（基准 / 高 / 极高 / 极高 +1）；需求惩罚减半（每高 1 档 −0，向下取整后生效）。',
    base: () => ({ flags: ['spotPriceChoice'] }),
    strong: () => ({ flags: ['spotPriceChoice', 'spotPriceChoiceNoPenalty'] }),
  },
  {
    id: 'K2', name: '灵活交付', kind: 'sell', rule: true, tier: 1,
    text: '本月订单承诺量 +5（可接超出「库存 + 排产」的订单）；月末交付缺口按接单时订单单价 × 20% 付违约金。',
    empowered: '本月订单承诺量 +10；缺口违约金降至 10%。',
    base: (c) => ({ flags: [c.empowered ? 'flex10' : 'flex5'] }),
    strong: (c) => ({ flags: [c.empowered ? 'flex10' : 'flex5'] }),
  },
  {
    id: 'K3', name: '双档采购', kind: 'buy', rule: true, tier: 1,
    text: '本月 1 种原料可选 2 档（已选档 + 小批，第 2 档价格 +1 档，不占档数）。',
    empowered: '支付 2w，本月 1 种原料可选 2 档（已选档 + 中批，第 2 档价格 +1 档，不占档数）。',
    base: (c) => ({ flags: [c.empowered ? 'doubleLotMid' : 'doubleLot'] }),
    strong: (c) => ({ flags: [c.empowered ? 'doubleLotMid' : 'doubleLot'] }),
  },
  {
    id: 'K4', name: '冲刺判定', kind: 'rnd', rule: true, tier: 2,
    text: '本月研发成功判定掷 2 次取高。',
    empowered: '本月研发成功判定掷 3 次取高。',
    base: (c) => ({ flags: [c.empowered ? 'rndTripleRoll' : 'rndDoubleRoll'] }),
    strong: (c) => ({ flags: [c.empowered ? 'rndTripleRoll' : 'rndDoubleRoll'] }),
  },
  {
    id: 'K5', name: '快周转', kind: 'sell', rule: true, tier: 2,
    text: '本月现货不受需求限制（全部库存可售），但售价 −1 档。',
    empowered: '本月现货不受需求限制（全部库存可售），售价 −1 档，且订单交付 +2 件。',
    base: () => ({ flags: ['spotUnlimited'] }),
    strong: () => ({ flags: ['spotUnlimited', 'spotUnlimitedPlus'] }),
  },
  {
    id: 'K6', name: '编制优化', kind: 'ops', rule: true, tier: 1,
    text: '本月可裁 1 人（任意部门，不耗 AP），返还 100% 基础招聘费。',
    empowered: '本月可裁 2 人（任意部门，不耗 AP），返还 100% 基础招聘费。',
    base: (c) => ({ flags: c.empowered ? ['canFireCard', 'canFireCard'] : ['canFireCard'] }),
    strong: (c) => ({ flags: c.empowered ? ['canFireCard', 'canFireCard'] : ['canFireCard'] }),
  },
  {
    id: 'K7', name: '强化市场情报', kind: 'ops', rule: true, tier: 0,
    text: '预算页展示下季度气候转移概率表（动能 × 步长真实分布），并高概率提示 1 个风险气候。',
    base: () => ({ flags: ['climateOddsPlus'] }),
    strong: () => ({ flags: ['climateOddsPlus'] }),
  },

]

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]))

/** 管理卡解锁条件。 */
export const MGMT_CARD_UNLOCK: Record<string, number> = { M1: 2, M2: 3, M3: 4, M4: 5 }

export function makeCard(defId: string, empowered: boolean, uidSeq: number): CardInstance {
  return { uid: `${defId}#${uidSeq}`, defId, empowered }
}

// ════════════════════════════════════════════════════════════
// 10. 成就
// ════════════════════════════════════════════════════════════

export const ACHIEVEMENTS: { id: string; name: string; desc: string; points: number }[] = [
  { id: '金牌高管', name: '金牌高管', desc: '运营部满员（5 名管理人员）', points: 10 },
  { id: '供应链联盟', name: '供应链联盟', desc: '采购部满员（5 名采购人员）', points: 10 },
  { id: '流水线', name: '流水线', desc: '生产部满员（5 名生产人员）', points: 10 },
  { id: '品牌', name: '品牌', desc: '销售部满员（5 名销售人员）', points: 10 },
  { id: '专利壁垒', name: '专利壁垒', desc: '研发部满员（5 名研发人员）', points: 10 },
]

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))
