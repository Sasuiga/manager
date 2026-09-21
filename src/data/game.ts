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
 * 与销售 5 人的资源池（38）大致会师，全游戏没有大段死点。
 */
export const SALES_PUSH_CAP: Record<Tier, number> = {
  low: 3 * BASE_DEMAND.low,
  mid: 3 * BASE_DEMAND.mid,
  high: 3 * BASE_DEMAND.high,
  special: 3 * BASE_DEMAND.special,
}

/**
 * 每层「1 点需求」的销售资源成本（v1.2）：层级越高，多一个客户越难。
 * 低端 1 点/需求 是中端的 1/2、高端的 1/3、特殊的 1/4，
 * 把「全灌高端」的每点性价比从 6 倍差距压到约 2 倍；
 * 且 1 点成本的低端天然是零头吸收器：任何剩点总能换成低端需求（除非低端已顶满 15）。
 */
export const SALES_PUSH_COST: Record<Tier, number> = { low: 1, mid: 2, high: 3, special: 4 }

export const BOMS: Record<Tier, BomDef> = {
  low: { tier: 'low', name: '标准品', recipe: { pkg: 2, resin: 1 }, basePrice: 60, stdCost: 40 },
  mid: { tier: 'mid', name: '精工件', recipe: { resin: 2, alloy: 1 }, basePrice: 120, stdCost: 60 },
  high: { tier: 'high', name: '精密件', recipe: { alloy: 1, chip: 1 }, basePrice: 240, stdCost: 120 },
  special: { tier: 'special', name: '特种件', recipe: { micro: 1, comp: 1, alloy: 1 }, basePrice: 360, stdCost: 150 },
}

/**
 * 产品售价档位表。索引 = 基准档位（2） + shift。
 * 售价可降至「极低」或升至「极高」，故不做下限截断太狠。
 */
export const PRODUCT_PRICE: Record<Tier, number[]> = {
  low: [40, 50, 60, 70, 80],
  mid: [80, 100, 120, 140, 160],
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
      { at: 2, text: '抽卡可选上限 3 → 4' },
      { at: 3, text: '手牌上限 5 → 6' },
      { at: 4, text: '每月可打牌数 2 → 3，并强化卡牌效果' },
      { at: 5, text: '抽卡可选上限 4 → 5，手牌上限 6 → 7', achievement: '金牌高管' },
    ],
  },
  buy: {
    dept: 'buy',
    name: '采购人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 10,
    base: ['每类原料供给 +2', '每月可选采购档数 +1'],
    unlocks: [
      { at: 2, text: '贸易商每月随机供应品种 +1' },
      { at: 3, text: '解锁长期供货协议' },
      { at: 4, text: '所有原料价格降 1 档，并强化卡牌效果' },
      { at: 5, text: '可同时签 2 份长期协议，且锁定期可选 6 个月', achievement: '供应链联盟' },
    ],
  },
  make: {
    dept: 'make',
    name: '生产人员',
    hireFees: [0], // 生产人员无阶梯招聘费，仅消耗 AP
    salary: 5,
    base: ['有设备坑位产能 +4，无坑位 +2'],
    unlocks: [
      { at: 2, text: '每名工人产能 +2' },
      { at: 3, text: '解锁加班：0.5w 临时 +10 产能，每月 1 次' },
      { at: 4, text: '每名工人产能 +1，并强化卡牌效果' },
      { at: 5, text: '每生产 5 件额外入库 1 件', achievement: '流水线' },
    ],
  },
  sell: {
    dept: 'sell',
    name: '销售人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 15,
    base: ['立即增加销售资源（见下表）'],
    unlocks: [
      { at: 2, text: '每月获得 1 个确定性订单' },
      { at: 3, text: '每人销售资源 +4 → +6' },
      { at: 4, text: '每月获得 3 个确定性订单' },
      { at: 5, text: '每人 +6 → +8，并实现成本转移', achievement: '品牌' },
    ],
  },
  rnd: {
    dept: 'rnd',
    name: '研发人员',
    hireFees: [50, 40, 30, 20, 10],
    salary: 20,
    base: ['研发进度 +2/月，成功率 +5%'],
    unlocks: [
      { at: 2, text: '（无新增解锁）' },
      { at: 3, text: '可同时激活 2 个知识产权' },
      { at: 4, text: '（无新增解锁）' },
      { at: 5, text: '可同时激活 3 个知识产权', achievement: '专利壁垒' },
    ],
  },
}

/** 销售人员每人的销售资源贡献（§7.2.4）。 */
export const SALES_RESOURCE_STEPS = [0, 4, 4, 6, 6, 8]
/** 每月确定性订单数（§7.2.6）。 */
export const SALES_ORDER_COUNT = [0, 0, 1, 1, 3, 3]
export const BASE_SALES_RESOURCE = 10
export const BASE_HAND = 5
export const BASE_PLAYS = 2
export const BASE_AP = 3
export const START_CASH = 1000 // 100w

/** 采购档位：可选档数（§6.1.2）。 */
export const BUY_LOT_SLOTS = [2, 3, 4, 5, 6, 7]

/** 生产人员产能基础贡献。 */
export const MAKER_CAP_WITH_SLOT = 4
export const MAKER_CAP_NO_SLOT = 2

/** 加成计算：每名工人的产能（含解锁加成）。 */
export function makerCapacityPerStaff(staff: number): number {
  let v = MAKER_CAP_WITH_SLOT
  if (staff >= 2) v += 2
  if (staff >= 4) v += 1
  return v
}

export const EQUIPMENT_SHOP: { id: string; name: string; capacity: number; depreciation: Money; creditLine: Money; price: Money; desc: string }[] = [
  { id: 'eq-line', name: '标准产线', capacity: 10, depreciation: 20, creditLine: 50, price: 50, desc: '产能 10 · 安置 1 人' },
  { id: 'eq-precision', name: '精密产线', capacity: 16, depreciation: 35, creditLine: 80, price: 90, desc: '产能 16 · 安置 1 人' },
  { id: 'eq-auto', name: '自动化产线', capacity: 24, depreciation: 50, creditLine: 120, price: 150, desc: '产能 24 · 安置 1 人' },
]

export const OVERTIME_CAPACITY = 10
export const OVERTIME_COST: Money = 5

// ════════════════════════════════════════════════════════════
// 5. 研发与知识产权
// ════════════════════════════════════════════════════════════

export const RND_PROJECTS: ResearchProjectDef[] = [
  { id: 'bom-mid', name: '中端 BOM', kind: 'bom', tier: 'mid', need: 30, rate: 0.7, desc: '解锁中端产品配方' },
  { id: 'bom-high', name: '高端 BOM', kind: 'bom', tier: 'high', need: 50, rate: 0.55, desc: '解锁高端产品配方' },
  { id: 'bom-special', name: '特殊 BOM', kind: 'bom', tier: 'special', need: 70, rate: 0.4, desc: '解锁特殊产品配方，并揭示新材料' },
  { id: 'ip-normal', name: '普通知识产权', kind: 'ip', ipPool: 'normal', need: 30, rate: 0.7, desc: '从普通池随机获得 1 项' },
  { id: 'ip-strong', name: '强力知识产权', kind: 'ip', ipPool: 'strong', need: 50, rate: 0.5, desc: '从强力池随机获得 1 项' },
]

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
]

export const IP_BY_ID: Record<string, IpDef> = Object.fromEntries(IP_DEFS.map((i) => [i.id, i]))

// ════════════════════════════════════════════════════════════
// 6. 财务参数
// ════════════════════════════════════════════════════════════

export const BASE_CREDIT_LINE: Money = 200 // 20w 基础借款额度
export const MONTHLY_RATE = 0.008 // 月利率 0.8%
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
  { id: 'R3', climate: 'recovery', name: '招工不易', type: 'instant', polarity: 'bad', scope: 'make', text: '本月招聘成本 +1w（每名）。', mods: { notes: ['招聘费 +1w'] } },
  { id: 'R4', climate: 'recovery', name: '现金紧张', type: 'instant', polarity: 'bad', scope: 'cash', text: '本月借款利息 +1w。', mods: { rateShift: 1 } },
  { id: 'R5', climate: 'recovery', name: '政策观望', type: 'instant', polarity: 'neutral', scope: 'ops', text: '本月抽卡多抽 1 张，但手牌上限 -1。', mods: { drawBonus: 1, handBonus: -1, notes: ['抽卡 +1 张', '手牌上限 -1'] } },
  {
    id: 'R6', climate: 'recovery', name: '低息贷款', type: 'choice', polarity: 'good', scope: 'cash', text: '银行愿意放款，代价是抬高你全部借款的利息。',
    options: [
      { label: '接受贷款', detail: '借款额度 +5w，本月借款利率 +1w', mods: { notes: ['借款额度 +5w'] }, cost: {}, extra: '额度 +5w · 利率 +1w' },
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
      { label: '投入渠道（1 AP）', detail: '消耗 1 AP，本月销售资源 +4', cost: { ap: 1 }, mods: { salesResource: 4 } },
      { label: '放弃', detail: '本月销售资源 -2', mods: { salesResource: -2 } },
    ],
  },
  { id: 'R9', climate: 'recovery', name: '囤积原料', type: 'chance', polarity: 'good', scope: 'buy', text: '有批现货正在低价出清。', chance: { cost: { cash: 30 }, mods: { allSupply: 4 }, detail: '支付 3w，本月每类原料供给 +4' } },
  { id: 'R10', climate: 'recovery', name: '技术引进', type: 'chance', polarity: 'good', scope: 'rnd', text: '外部机构可以提供一次技术辅导。', chance: { cost: { cash: 20 }, mods: { rndRate: 15 }, detail: '支付 2w，本月研发成功率 +15%' } },

  // ── 繁荣 ──────────────────────────────────────────────
  { id: 'P1', climate: 'boom', name: '消费旺盛', type: 'instant', polarity: 'good', scope: 'sell', text: '本月低端、中端、高端需求各 +1。', mods: { demand: T(1, 1, 1) } },
  { id: 'P2', climate: 'boom', name: '产能满载', type: 'instant', polarity: 'good', scope: 'make', text: '本月产能 +2。', mods: { capacity: 2 } },
  { id: 'P3', climate: 'boom', name: '原料跟涨', type: 'instant', polarity: 'bad', scope: 'buy', text: '本月所有原料供给 -2，价格升 1 档。', mods: { allSupply: -2, allTierShift: 1 } },
  { id: 'P4', climate: 'boom', name: '用工成本上升', type: 'instant', polarity: 'bad', scope: 'ops', text: '本月每名员工薪酬 +0.5w。', mods: { salaryPer: 5 } },
  { id: 'P5', climate: 'boom', name: '资金充裕', type: 'instant', polarity: 'neutral', scope: 'cash', text: '本月借款利率 -1w，但现金不产生任何利息。', mods: { rateShift: -1 } },
  {
    id: 'P6', climate: 'boom', name: '扩产机会', type: 'choice', polarity: 'good', scope: 'make', text: '设备厂给出一步到位的报价。',
    options: [
      { label: '购买设备（5w）', detail: '现金 -5w，立即获得一台产能 10 的设备', cost: { cash: 50 }, extra: '设备 +1 · 产能 +10' },
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
  { id: 'P9', climate: 'boom', name: '大订单', type: 'chance', polarity: 'good', scope: 'sell', text: '客户愿意签一份确定性采购合同。', chance: { cost: { ap: 2 }, mods: { orders: 1, orderQty: 10, orderPriceShift: 1 }, detail: '消耗 2 AP，获得 1 个确定性订单（数量 10，价格 +1 档）' } },
  { id: 'P10', climate: 'boom', name: '猎头服务', type: 'chance', polarity: 'good', scope: 'ops', text: '猎头手上有一份现成名单。', chance: { cost: { cash: 30 }, mods: { notes: ['本月可额外招聘 1 人（不耗 AP）'] }, detail: '支付 3w，本月可多招聘 1 人（不耗 AP）' } },

  // ── 过热 ──────────────────────────────────────────────
  { id: 'O1', climate: 'overheat', name: '需求爆棚', type: 'instant', polarity: 'good', scope: 'sell', text: '本月中端 +1、高端 +2、特殊 +1 需求。', mods: { demand: T(0, 1, 2, 1) } },
  { id: 'O2', climate: 'overheat', name: '加班文化', type: 'instant', polarity: 'good', scope: 'make', text: '本月产能 +3，但每名员工薪酬 +1w。', mods: { capacity: 3, salaryPer: 10 } },
  { id: 'O3', climate: 'overheat', name: '原料飞涨', type: 'instant', polarity: 'bad', scope: 'buy', text: '本月所有原料供给 -4、价格升 1 档；芯片额外供给 -1、价格再升 1 档。', mods: { allSupply: -4, allTierShift: 1, materials: { chip: { supply: -1, tierShift: 1 } } } },
  { id: 'O4', climate: 'overheat', name: '银根收紧', type: 'instant', polarity: 'bad', scope: 'cash', text: '本月借款利率 +2w，借款额度减半。', mods: { rateShift: 2, creditFactor: 0.5 } },
  { id: 'O5', climate: 'overheat', name: '监管检查', type: 'instant', polarity: 'neutral', scope: 'ops', text: '本月每打出一张牌需额外支付 1w。', mods: { notes: ['打牌费用 +1w/张'] } },
  {
    id: 'O6', climate: 'overheat', name: '长期协议', type: 'choice', polarity: 'bad', scope: 'buy', text: '供应商希望你签下长约以对冲涨价。',
    options: [
      { label: '签下长约（4w）', detail: '现金 -4w，锁定一种原料 3 个月，每月中批供应（不占部门协议名额）', cost: { cash: 40 }, extra: '立即签订 1 份长期协议' },
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
  { id: 'O10', climate: 'overheat', name: '技术突破', type: 'chance', polarity: 'good', scope: 'rnd', text: '外部有一份可以买断的技术资料。', chance: { cost: { cash: 30 }, detail: '支付 3w，立即获得 1 个随机普通知识产权（持续到本季结束）', mods: { tempIps: ['normal'] } } },

  // ── 滞涨 ──────────────────────────────────────────────
  { id: 'S1', climate: 'stagflation', name: '需求萎缩', type: 'instant', polarity: 'bad', scope: 'sell', text: '本月低端、中端、高端需求各 -1。', mods: { demand: T(-1, -1, -1) } },
  { id: 'S2', climate: 'stagflation', name: '成本高企', type: 'instant', polarity: 'bad', scope: 'buy', text: '本月所有原料供给 -3，价格升 1 档。', mods: { allSupply: -3, allTierShift: 1 } },
  { id: 'S3', climate: 'stagflation', name: '现金为王', type: 'instant', polarity: 'bad', scope: 'cash', text: '本月借款利率 +2w。', mods: { rateShift: 2 } },
  { id: 'S4', climate: 'stagflation', name: '裁员优化', type: 'instant', polarity: 'good', scope: 'ops', text: '本月可免费解雇 1 名员工，并返还其招聘费 50%。', mods: { notes: ['可在运营部解雇 1 人'] } },
  { id: 'S5', climate: 'stagflation', name: '库存积压', type: 'instant', polarity: 'neutral', scope: 'make', text: '本月生产入库的产品，下月售价降 1 档。', mods: { notes: ['下月售价 -1 档'] } },
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
      { label: '支付 2w', detail: '现金 -2w，本月研发费用 -3w', cost: { cash: 20 }, mods: { rndCost: -30 } },
      { label: '自己扛', detail: '本月研发进度 -2', mods: { rndProgress: -2 } },
    ],
  },
  { id: 'S9', climate: 'stagflation', name: '债务重组', type: 'chance', polarity: 'good', scope: 'cash', text: '可以谈一次债务重组。', chance: { cost: { cash: 20 }, mods: { rateShift: -2 }, detail: '支付 2w 手续费，本月借款利率 -2w' } },
  { id: 'S10', climate: 'stagflation', name: '精益管理', type: 'chance', polarity: 'good', scope: 'ops', text: '顾问团队能压缩一轮人力成本。', chance: { cost: { ap: 1 }, mods: { salaryPer: -5 }, detail: '消耗 1 AP，本月每名员工薪酬 -0.5w' } },

  // ── 衰退 ──────────────────────────────────────────────
  { id: 'D1', climate: 'recession', name: '订单取消', type: 'instant', polarity: 'bad', scope: 'sell', text: '本月低端 -2、中端 -1、高端 -1 需求。', mods: { demand: T(-2, -1, -1) } },
  { id: 'D2', climate: 'recession', name: '原料下跌', type: 'instant', polarity: 'good', scope: 'buy', text: '本月所有原料供给 +3，价格降 1 档。', mods: { allSupply: 3, allTierShift: -1 } },
  { id: 'D3', climate: 'recession', name: '设备闲置', type: 'instant', polarity: 'bad', scope: 'make', text: '本月产能 -3。', mods: { capacity: -3 } },
  { id: 'D4', climate: 'recession', name: '降息周期', type: 'instant', polarity: 'good', scope: 'cash', text: '本月借款利率 -2w。', mods: { rateShift: -2 } },
  { id: 'D5', climate: 'recession', name: '人才回流', type: 'instant', polarity: 'neutral', scope: 'ops', text: '本月招聘费 -1w，但每名员工薪酬 +0.5w。', mods: { salaryPer: 5, notes: ['招聘费 -1w'] } },
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
      { label: '支付 3w 签长约', detail: '现金 -3w，锁定一种原料 6 个月，每月中批供应', cost: { cash: 30 }, extra: '立即签订 1 份 6 个月长期协议' },
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
  { id: 'D9', climate: 'recession', name: '低价设备', type: 'chance', polarity: 'good', scope: 'make', text: '有企业正在出清设备。', chance: { cost: { cash: 50 }, detail: '支付 5w，获得一台产能 10 的设备，折旧减半', mods: { notes: ['设备 +1（折旧减半）'] } } },
  { id: 'D10', climate: 'recession', name: '猎头抄底', type: 'chance', polarity: 'good', scope: 'ops', text: '有人才正待价而沽。', chance: { cost: { cash: 20 }, detail: '支付 2w，免费获得 1 名管理人员（不耗 AP）', mods: { notes: ['管理人员 +1'] } } },

  // ── 萧条 ──────────────────────────────────────────────
  { id: 'X1', climate: 'depression', name: '需求冰点', type: 'instant', polarity: 'bad', scope: 'sell', text: '本月低端 -2、中端 -2、高端 -1、特殊 -1 需求。', mods: { demand: T(-2, -2, -1, -1) } },
  { id: 'X2', climate: 'depression', name: '原料白菜价', type: 'instant', polarity: 'good', scope: 'buy', text: '本月所有原料供给 +5、价格降 1 档；芯片供给不增加、价格不变。', mods: { allSupply: 5, allTierShift: -1, materials: { chip: { supply: -5, tierShift: 1 } } } },
  { id: 'X3', climate: 'depression', name: '信贷冻结', type: 'instant', polarity: 'bad', scope: 'cash', text: '本月无法新增借款，且已有借款利率 +1w。', mods: { noBorrow: true, rateShift: 1 } },
  { id: 'X4', climate: 'depression', name: '停工潮', type: 'instant', polarity: 'bad', scope: 'make', text: '本月产能 -4。', mods: { capacity: -4 } },
  { id: 'X5', climate: 'depression', name: '破产潮', type: 'instant', polarity: 'neutral', scope: 'ops', text: '可以低价收购 1 名员工，需支付其原招聘费 50%。', mods: { notes: ['招聘费 -50%'] } },
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
      { label: '支付 3w', detail: '现金 -3w，获得 1 个随机普通知识产权', cost: { cash: 30 }, extra: '获得 1 个随机普通知识产权' },
      { label: '放弃', detail: '本月研发进度 -4', mods: { rndProgress: -4 } },
    ],
  },
  { id: 'X9', climate: 'depression', name: '资产抄底', type: 'chance', polarity: 'good', scope: 'make', text: '破产清算现场有一台好设备。', chance: { cost: { cash: 80 }, detail: '支付 8w，获得一台产能 15 的设备', mods: { notes: ['设备 +1 · 产能 15'] } } },
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
// 9. 卡牌（§5.6 全表）
// ════════════════════════════════════════════════════════════

export interface CardDef {
  id: string
  name: string
  kind: Dept
  /** 核心卡必然入池 */
  core?: boolean
  /** 卡片效果正文 */
  text: string
  /** 门槛条件文字 */
  cond?: string
  /** 打出费用（角） */
  cost?: Money
  /** 打出所需的最低部门人员数（key 为部门，value 为人数） */
  minStaff?: Partial<Record<Dept, number>>
  /** 强化后的效果说明 */
  empowered?: string
  /** 基础效果 */
  base: (ctx: CardCtx) => CardPlayEffect
  /** 强化效果（若不填则沿用 base） */
  strong?: (ctx: CardCtx) => CardPlayEffect
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
    id: 'C1', name: '批量采购', kind: 'buy', core: true,
    text: '本月采购价格降 1 档。若本月采购档数 ≥ 2，额外降 1 档。',
    empowered: '本月采购价格降 2 档。若本月采购档数 ≥ 2，额外降 1 档。',
    base: (c) => ({ buyTierShift: -1, flags: c.empowered ? ['buyTierExtra'] : [] }),
    strong: () => ({ buyTierShift: -2, flags: ['buyTierExtra'] }),
  },
  {
    id: 'C2', name: '囤货', kind: 'buy',
    text: '本月每类原料供给 +4，且本月采购的原料不占库存上限。',
    empowered: '本月每类原料供给 +8，且本月采购的原料不占库存上限。',
    base: (c) => ({ buySupply: c.empowered ? 8 : 4, flags: ['noCap'] }),
  },
  {
    id: 'C3', name: '压价', kind: 'buy',
    text: '本月采购价格降 2 档，但本月可选档数 -1。',
    empowered: '本月采购价格降 3 档，且不受可选档数惩罚。',
    base: (c) => ({ buyTierShift: -2, buyLots: -1, flags: c.empowered ? ['noLotPenalty'] : [] }),
    strong: () => ({ buyTierShift: -3 }),
  },
  {
    id: 'C4', name: '贸易商', kind: 'buy',
    text: '本月获得一次额外小批采购机会，价格 +1 档。若采购 ≥ 3 人，可指定品种。',
    cond: '采购 ≥ 3 人：可指定品种',
    empowered: '本月获得两次额外小批采购机会，价格不变，且可指定品种。',
    base: () => ({ flags: ['trader'] }),
  },
  {
    id: 'C5', name: '长期协议', kind: 'buy', core: true,
    text: '立即签订一份长期协议，不占部门协议名额。若采购 ≥ 4 人，锁定期改为 6 个月。',
    cond: '采购 ≥ 4 人：锁定期 6 个月',
    empowered: '立即签订两份长期协议，锁定期 6 个月，均不占部门协议名额。',
    base: (c) => ({ flags: [S(c, 'buy') >= 4 ? 'agreement2x6' : 'agreement2x3'] }),
    strong: () => ({ flags: ['agreement2x6', 'agreementDouble'] }),
  },
  {
    id: 'C6', name: '紧急采购', kind: 'buy',
    text: '立即获得小批原料，价格 +2 档，不占本月档数。若本月已打出过紧急采购，可再打出 1 次。',
    empowered: '立即获得中批原料，价格 +1 档，不占本月档数。',
    base: (c) => ({ flags: [c.empowered ? 'urgentMid' : 'urgent'] }),
  },
  {
    id: 'C7', name: '原料替换', kind: 'buy',
    text: '将一种原料替换为等量另一种原料，按当前价格结算差价。',
    empowered: '替换时额外获得 2 单位目标原料。',
    base: (c) => ({ flags: [c.empowered ? 'swapPlus' : 'swap'] }),
  },
  {
    id: 'C8', name: '供应商关系', kind: 'buy',
    text: '本月采购价格降 1 档。若上月也打出过此牌，改为降 2 档。',
    empowered: '本月采购价格降 2 档。若上月也打出过此牌，改为降 3 档。',
    base: (c) => ({ buyTierShift: c.empowered ? -2 : -1, flags: ['supplierRelation'] }),
  },
  {
    id: 'C9', name: '期货', kind: 'buy', cost: 20,
    text: '支付 2w，锁定下月一种原料价格。若下月该原料涨价，你仍按本月价格采购。',
    empowered: '支付 2w，锁定下月全部原料价格。',
    base: (c) => ({ flags: [c.empowered ? 'futuresAll' : 'futures'] }),
  },
  {
    id: 'C10', name: '清仓', kind: 'buy',
    text: '以低 2 档价格购买小批指定原料。若本月不采购其他原料，额外 +2 单位。',
    empowered: '以低 2 档价格购买中批指定原料，且额外 +2 单位。',
    base: (c) => ({ flags: [c.empowered ? 'clearanceMid' : 'clearance'] }),
  },

  // ── 生产 ──────────────────────────────────────────────
  {
    id: 'P1', name: '满负荷', kind: 'make', core: true,
    text: '本月产能 +2。若本月产能全部用完，额外 +1。',
    empowered: '本月产能 +4。若本月产能全部用完，额外 +2。',
    base: (c) => ({ capacity: c.empowered ? 4 : 2, flags: ['fullLoad'] }),
  },
  {
    id: 'P2', name: '质量管控', kind: 'make', core: true,
    text: '本月产能 +2。',
    empowered: '本月产能 +4，且本月生产成本 -10%。',
    base: (c) => ({ capacity: c.empowered ? 4 : 2, costFactor: c.empowered ? 0.9 : 1 }),
  },
  {
    id: 'P3', name: '加班', kind: 'make',
    text: '本月产能 +3，但薪酬 +1w。可支付 2w 改为 +5。',
    empowered: '本月产能 +5，薪酬 +1w。可支付 2w 改为 +8。',
    base: (c) => ({ capacity: c.empowered ? 5 : 3, salary: 10, flags: ['overtimeCard'] }),
  },
  {
    id: 'P4', name: '设备维护', kind: 'make',
    text: '本月产能 +1。',
    empowered: '本月产能 +3。',
    base: (c) => ({ capacity: c.empowered ? 3 : 1 }),
  },
  {
    id: 'P5', name: '工人培训', kind: 'make',
    text: '本月每名工人产能 +1。若生产 ≥ 4 人，改为 +2。',
    cond: '生产 ≥ 4 人：每人 +2',
    empowered: '本月每名工人产能 +2。若生产 ≥ 4 人，改为 +3。',
    base: (c) => ({ capacity: (S(c, 'make') >= 4 ? 2 : 1) * Math.max(1, S(c, 'make')) }),
    strong: (c) => ({ capacity: (S(c, 'make') >= 4 ? 3 : 2) * Math.max(1, S(c, 'make')) }),
  },
  {
    id: 'P6', name: '批量生产', kind: 'make',
    text: '本月产能 +2。若生产 ≥ 5 人，改为 +3。',
    cond: '生产 ≥ 5 人：+3',
    empowered: '本月产能 +4。若生产 ≥ 5 人，改为 +5。',
    base: (c) => ({ capacity: S(c, 'make') >= 5 ? (c.empowered ? 5 : 3) : c.empowered ? 4 : 2 }),
  },
  {
    id: 'P7', name: '精益生产', kind: 'make',
    text: '本月产能 +1，且生产成本 -10%。',
    empowered: '本月产能 +2，且生产成本 -20%。',
    base: (c) => ({ capacity: c.empowered ? 2 : 1, costFactor: c.empowered ? 0.8 : 0.9 }),
  },
  {
    id: 'P8', name: '轮班制', kind: 'make',
    text: '本月产能 +2，薪酬 +0.5w。若生产 ≥ 3 人，无薪酬惩罚。',
    cond: '生产 ≥ 3 人：无惩罚',
    empowered: '本月产能 +4。若生产 ≥ 3 人，无薪酬惩罚。',
    base: (c) => ({ capacity: c.empowered ? 4 : 2, salary: S(c, 'make') >= 3 ? 0 : 5 }),
  },
  {
    id: 'P9', name: '自动化', kind: 'make',
    text: '本月产能 +2。若研发 ≥ 3 人，改为 +4。',
    cond: '研发 ≥ 3 人：+4',
    empowered: '本月产能 +4。若研发 ≥ 3 人，改为 +6。',
    base: (c) => ({ capacity: S(c, 'rnd') >= 3 ? (c.empowered ? 6 : 4) : c.empowered ? 4 : 2 }),
  },
  {
    id: 'P10', name: '库存清理', kind: 'make',
    text: '将 5 单位库存商品以成本价出售。若库存 ≥ 10，可出售 10 单位。',
    empowered: '将 10 单位库存商品以成本价出售。若库存 ≥ 10，可出售 15 单位。',
    base: (c) => ({ flags: [c.empowered ? 'clearStock15' : 'clearStock'] }),
  },

  // ── 销售 ──────────────────────────────────────────────
  {
    id: 'S1', name: '促销活动', kind: 'sell', core: true,
    text: '本月低端需求 +2。若销售 ≥ 3 人，额外 +1。',
    cond: '销售 ≥ 3 人：额外 +1',
    empowered: '本月低端需求 +4。若销售 ≥ 3 人，额外 +2。',
    base: (c) => ({ demand: T(2 + (S(c, 'sell') >= 3 ? 1 : 0), 0, 0, 0), capacity: 0 }),
    strong: (c) => ({ demand: T(4 + (S(c, 'sell') >= 3 ? 2 : 0), 0, 0, 0) }),
  },
  {
    id: 'S2', name: '渠道拓展', kind: 'sell',
    text: '本月销售资源 +5。若销售 ≥ 2 人，额外 +3。',
    cond: '销售 ≥ 2 人：额外 +3',
    empowered: '本月销售资源 +8。若销售 ≥ 2 人，额外 +5。',
    base: (c) => ({ salesResource: (c.empowered ? 8 : 5) + (S(c, 'sell') >= 2 ? (c.empowered ? 5 : 3) : 0) }),
  },
  {
    id: 'S3', name: '大订单', kind: 'sell', core: true,
    text: '获得 1 个确定性订单，数量 10。若销售 ≥ 4 人，改为数量 15。',
    cond: '销售 ≥ 4 人：数量 15',
    empowered: '获得 2 个确定性订单，数量 15。',
    base: (c) => ({ orders: c.empowered ? 2 : 1, orderQty: S(c, 'sell') >= 4 || c.empowered ? 15 : 10, flags: [c.empowered ? 's3x2' : ''] }),
  },
  {
    id: 'S4', name: '提价', kind: 'sell',
    text: '本月售价升 1 档，但需求 -1。若高端产品，无需求惩罚。',
    cond: '高端产品：无惩罚',
    empowered: '本月售价升 2 档，需求 -1。',
    base: (c) => ({ price: T(c.empowered ? 2 : 1, c.empowered ? 2 : 1, c.empowered ? 2 : 1, c.empowered ? 2 : 1), demand: T(-1, -1, 0, 0) }),
  },
  {
    id: 'S5', name: '品牌建设', kind: 'sell',
    text: '本月高端需求 +1。若研发 ≥ 3 人，额外 +1。',
    cond: '研发 ≥ 3 人：额外 +1',
    empowered: '本月高端需求 +2，特殊需求 +1。若研发 ≥ 3 人，高端额外 +1。',
    base: (c) => ({ demand: T(0, 0, (c.empowered ? 2 : 1) + (S(c, 'rnd') >= 3 ? 1 : 0), c.empowered ? 1 : 0) }),
  },
  {
    id: 'S6', name: '销售激励', kind: 'sell',
    text: '本月销售资源 +3，薪酬 +0.5w。若销售 ≥ 3 人，无薪酬惩罚。',
    cond: '销售 ≥ 3 人：无惩罚',
    empowered: '本月销售资源 +6。若销售 ≥ 3 人，无薪酬惩罚。',
    base: (c) => ({ salesResource: c.empowered ? 6 : 3, salary: S(c, 'sell') >= 3 ? 0 : 5 }),
  },
  {
    id: 'S7', name: '市场调研', kind: 'sell',
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
    id: 'S8', name: '客户关系', kind: 'sell',
    text: '本月确定性订单 +1。若已有订单，额外 +1。',
    cond: '已有订单：额外 +1',
    empowered: '本月确定性订单 +2。若已有订单，额外 +1。',
    base: (c) => ({ orders: c.empowered ? 2 : 1, flags: ['customerRelation', c.empowered ? 's8x2' : ''] }),
  },
  {
    id: 'S9', name: '清仓甩卖', kind: 'sell',
    text: '本月售价降 1 档，需求 +2。若库存 ≥ 15，需求改为 +3。',
    cond: '库存 ≥ 15：需求 +3',
    empowered: '本月售价降 1 档，需求 +3。若库存 ≥ 15，需求改为 +5。',
    base: (c) => {
      const extra = c.prodStock >= 15 ? (c.empowered ? 5 : 3) : c.empowered ? 3 : 2
      return { price: T(-1, -1, -1, -1), demand: T(extra, extra, extra, extra) }
    },
  },
  {
    id: 'S10', name: '高端市场', kind: 'sell',
    text: '本月高端产品售价升 1 档。若销售 ≥ 4 人，额外升 1 档。',
    cond: '销售 ≥ 4 人：额外 +1 档',
    empowered: '本月高端、特殊产品售价升 2 档。',
    base: (c) => ({ priceShift: T(0, 0, S(c, 'sell') >= 4 ? 2 : 1, c.empowered ? 2 : 0) }),
  },

  // ── 研发 ──────────────────────────────────────────────
  {
    id: 'R1', name: '加速研发', kind: 'rnd', core: true,
    text: '本月研发进度 +4。若研发 ≥ 3 人，额外 +2。',
    cond: '研发 ≥ 3 人：额外 +2',
    empowered: '本月研发进度 +7。若研发 ≥ 3 人，额外 +3。',
    base: (c) => ({ rndProgress: (c.empowered ? 7 : 4) + (S(c, 'rnd') >= 3 ? (c.empowered ? 3 : 2) : 0) }),
  },
  {
    id: 'R2', name: '降低成本', kind: 'rnd',
    text: '本月研发成本 -2w。若研发 ≥ 2 人，额外 -1w。',
    cond: '研发 ≥ 2 人：额外 -1w',
    empowered: '本月研发成本 -4w。若研发 ≥ 2 人，额外 -2w。',
    base: (c) => ({ rndCost: -((c.empowered ? 40 : 20) + (S(c, 'rnd') >= 2 ? (c.empowered ? 20 : 10) : 0)) }),
  },
  {
    id: 'R3', name: '技术合作', kind: 'rnd', core: true,
    text: '本月研发成功率 +15%。若研发 ≥ 4 人，额外 +10%。',
    cond: '研发 ≥ 4 人：额外 +10%',
    empowered: '本月研发成功率 +25%。若研发 ≥ 4 人，额外 +15%。',
    base: (c) => ({ rndRate: (c.empowered ? 25 : 15) + (S(c, 'rnd') >= 4 ? (c.empowered ? 15 : 10) : 0) }),
  },
  {
    id: 'R4', name: '专利申请', kind: 'rnd',
    text: '获得 1 个随机普通知识产权，持续到本季结束。若研发 ≥ 5 人，改为永久。',
    cond: '研发 ≥ 5 人：永久',
    empowered: '获得 1 个随机强力知识产权，持续到本季结束。若研发 ≥ 5 人，改为永久。',
    base: (c) => ({ flags: [c.empowered ? 'ipStrongTemp' : 'ipNormalTemp', S(c, 'rnd') >= 5 ? 'ipPerm' : ''] }),
  },
  {
    id: 'R5', name: '研发人员', kind: 'rnd',
    text: '本月研发进度 +3。若研发 ≥ 3 人，额外 +2。',
    cond: '研发 ≥ 3 人：额外 +2',
    empowered: '本月研发进度 +5。若研发 ≥ 3 人，额外 +4。',
    base: (c) => ({ rndProgress: (c.empowered ? 5 : 3) + (S(c, 'rnd') >= 3 ? (c.empowered ? 4 : 2) : 0) }),
  },
  {
    id: 'R6', name: '逆向工程', kind: 'rnd',
    minStaff: { rnd: 3 },
    text: '需研发 ≥ 3 人。立即获得 1 个已研发产品的 BOM，无需研发。',
    empowered: '需研发 ≥ 3 人。立即获得 2 个已研发产品的 BOM，无需研发。',
    base: (c) => ({ flags: [c.empowered ? 'reverse2' : 'reverse'] }),
  },
  {
    id: 'R7', name: '基础研究', kind: 'rnd',
    text: '本月研发进度 +2。若研发 ≥ 3 人，额外 +2。',
    cond: '研发 ≥ 3 人：额外 +2',
    empowered: '本月研发进度 +4。若研发 ≥ 3 人，额外 +3。',
    base: (c) => ({ rndProgress: (c.empowered ? 4 : 2) + (S(c, 'rnd') >= 3 ? (c.empowered ? 3 : 2) : 0) }),
  },
  {
    id: 'R8', name: '技术引进', kind: 'rnd', cost: 30,
    text: '支付 3w，本月研发进度 +6。若研发 ≥ 3 人，改为 +10。',
    cond: '研发 ≥ 3 人：+10',
    empowered: '支付 3w，本月研发进度 +12。',
    base: (c) => ({ rndProgress: S(c, 'rnd') >= 3 ? (c.empowered ? 12 : 10) : c.empowered ? 12 : 6 }),
  },
  {
    id: 'R9', name: '实验设备', kind: 'rnd',
    text: '本月研发成本 -1w，研发进度 +2。若研发 ≥ 4 人，成本改为 -2w。',
    cond: '研发 ≥ 4 人：成本 -2w',
    empowered: '本月研发成本 -2w，研发进度 +4。若研发 ≥ 4 人，成本 -4w。',
    base: (c) => ({ rndCost: -(c.empowered ? 20 : 10) - (S(c, 'rnd') >= 4 ? (c.empowered ? 20 : 10) : 0), rndProgress: c.empowered ? 4 : 2 }),
  },
  {
    id: 'R10', name: '知识产权保护', kind: 'rnd',
    text: '本月知识产权不会被事件影响。若研发 ≥ 5 人，额外获得 1 个激活槽。',
    cond: '研发 ≥ 5 人：额外激活槽',
    empowered: '本月知识产权不会被事件影响，且立即获得 1 个激活槽。',
    base: (c) => ({ flags: [c.empowered || S(c, 'rnd') >= 5 ? 'ipSlotPlus' : 'ipProtected'] }),
  },

  // ── 管理 ──────────────────────────────────────────────
  {
    id: 'M1', name: '抽 1 弃 1', kind: 'ops',
    text: '抽 1 张牌，然后弃 1 张牌。若弃的是业务卡，再抽 1 张。',
    empowered: '抽 2 张牌，然后弃 1 张牌。若弃的是业务卡，再抽 2 张。',
    base: (c) => ({ flags: [c.empowered ? 'm1b' : 'm1'] }),
  },
  {
    id: 'M2', name: '+1 AP', kind: 'ops',
    text: '本月 AP +1。若本月未打出其他牌，改为 +2。',
    empowered: '本月 AP +2。若本月未打出其他牌，改为 +3。',
    base: (c) => ({ ap: c.empowered ? 2 : 1, flags: ['m2'] }),
  },
  {
    id: 'M3', name: '复制手牌', kind: 'ops',
    text: '复制一张手牌，立即加入手牌。若复制的是强化卡，额外 +1 AP。',
    empowered: '复制一张手牌，加入手牌并使其实效按强化计算。若为强化卡，额外 +2 AP。',
    base: (c) => ({ flags: [c.empowered ? 'm3b' : 'm3'] }),
  },
  {
    id: 'M4', name: '弃 2 换 1', kind: 'ops',
    text: '弃 2 张手牌，获得 1 张随机强化卡。',
    empowered: '弃 1 张手牌，获得 2 张随机强化卡。',
    base: (c) => ({ flags: [c.empowered ? 'm4b' : 'm4'] }),
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
