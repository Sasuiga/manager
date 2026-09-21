/**
 * 核心类型定义。
 *
 * 货币单位：全流程内部以「角」（0.1w）为整数单位运算，避免浮点漂移；
 * 展示层统一由 `fmtWan()` 还原为「w」。所有涉及钱的字段类型别名 `Money`。
 */

/** 资金，单位：0.1w（角）。整数运算。 */
export type Money = number

/** 产品层次。 */
export type Tier = 'low' | 'mid' | 'high' | 'special'

/** 部门。'ops' 对应设计文档中的「运营部 / 管理部门」。 */
export type Dept = 'ops' | 'buy' | 'make' | 'sell' | 'rnd'

/** 六大气候。 */
export type Climate = 'recovery' | 'boom' | 'overheat' | 'stagflation' | 'recession' | 'depression'

/** 经济动能。 */
export type Momentum = 'expand' | 'stall' | 'contract'

/** 卡牌类别，与部门一一对应，另加管理卡。 */
export type CardKind = Dept

/** 事件类型。 */
export type EventType = 'instant' | 'choice' | 'chance'

/** 事件极性。 */
export type Polarity = 'good' | 'bad' | 'neutral'

/** 事件作用域。 */
export type Scope = 'cash' | 'buy' | 'make' | 'sell' | 'rnd' | 'ops'

/** 游戏阶段。 */
export type Phase = 'title' | 'board' | 'event' | 'draw' | 'operate' | 'settle' | 'report' | 'gameover' | 'summary'

// ─────────────────────────────────────────────────────────────
// 原料
// ─────────────────────────────────────────────────────────────

export interface MaterialDef {
  id: string
  name: string
  /** 层级 T1–T4，仅作展示与叙事用 */
  grade: number
  /** 基础月供给 */
  baseSupply: number
  /** 基准价（角） */
  basePrice: Money
  /** 基础库存上限 */
  baseCapacity: number
  /** 是否研发解锁的新材料 */
  unlocked?: boolean
  tier?: Tier
}

export interface MaterialState {
  id: string
  /** 本月实际市场供给（已计入气候/事件/人员/知产修正） */
  supply: number
  /** 当前价格（角），由档位决定 */
  price: Money
  /** 相对基准价的档位偏移：-2..+2 */
  tierShift: number
  qty: number
  /**
   * 库存账面价值（角）。移动加权平均价的唯一真相来源。
   * 单价 = value / qty，展示时再取整，避免「先取整再乘」造成账实不符。
   */
  value: Money
  cap: number
  /** 本月已选采购档（null 表示尚未采购） */
  chosenLot: LotSize | null
}

export type LotSize = 'small' | 'mid' | 'large'

export interface MaterialMods {
  supply: number
  tierShift: number
}

// ─────────────────────────────────────────────────────────────
// 部门与人员
// ─────────────────────────────────────────────────────────────

export interface StaffDef {
  dept: Dept
  name: string
  /** 阶梯招聘费（角），依次取值；不足则取末位 */
  hireFees: Money[]
  salary: Money
  /** 固有效果：每多招 1 人立即生效（无里程碑门槛） */
  base: string[]
  unlocks: { at: number; text: string; achievement?: string }[]
}

export interface DeptState {
  /** 已招聘人数 */
  staff: number
  /** 本局累计招聘次数，用于阶梯费用 */
  hired: number
}

// ─────────────────────────────────────────────────────────────
// 设备与生产
// ─────────────────────────────────────────────────────────────

export interface Equipment {
  id: string
  name: string
  capacity: number
  /** 每月折旧（角） */
  depreciation: Money
  /** 可提供的借款额度（角） */
  creditLine: Money
  /** 购置成本（角） */
  cost: Money
  /** 累计折旧，用于净资产计算 */
  accumulated: Money
  purchasedAt: number
}

export interface BomDef {
  tier: Tier
  name: string
  /** 原料 id -> 单件消耗 */
  recipe: Record<string, number>
  /** 基准售价（角） */
  basePrice: Money
  /** 单件标准成本（角），仅用于展示与预检 */
  stdCost: Money
}

export interface ProductState {
  tier: Tier
  built: boolean
  qty: number
  /** 成品库存账面价值（角），口径同 MaterialState.value */
  value: Money
  /** 上月末结转的单位成本，仅用于报表展示 */
  avgCost: Money
}

// ─────────────────────────────────────────────────────────────
// 销售
// ─────────────────────────────────────────────────────────────

export interface Order {
  id: string
  tier: Tier
  qty: number
  /** 价格档位偏移，通常 +1 */
  priceShift: number
  /** 交付月份 */
  dueMonth: number
  /** 来源描述 */
  from: string
  /**
   * 强制订单（事件/卡牌产生）：到月必交，库存不足则部分失效。
   * 非强制（销售渠道自然订单）：库存足够时自动接，不足则留到下月再判断。
   */
  forced?: boolean
}

export interface SaleRecord {
  tier: Tier
  qty: number
  unitPrice: Money
  /** 展示用单位成本（取整） */
  unitCost: Money
  /** 实际结转的存货金额（精确值，与出库减记完全相等） */
  cost?: Money
  revenue: Money
  channel: 'order' | 'spot'
}

// ─────────────────────────────────────────────────────────────
// 研发与知识产权
// ─────────────────────────────────────────────────────────────

export type ResearchKind = 'bom' | 'ip'

export interface ResearchProjectDef {
  id: string
  name: string
  kind: ResearchKind
  /** 进度需求 */
  need: number
  /** 基础成功率 0–1 */
  rate: number
  /** BOM 项目对应的层次 */
  tier?: Tier
  /** IP 项目对应的池 */
  ipPool?: 'normal' | 'strong'
  desc: string
}

export interface ResearchSlot {
  projectId: string | null
  progress: number
  /** 本局已完成次数（用于条件型目标） */
  done: boolean
}

export interface IpDef {
  id: string
  name: string
  pool: 'normal' | 'strong'
  desc: string
  effect: Partial<IpEffect>
}

export interface IpEffect {
  matSave: number
  equipCapacity: number
  matSupply: number
  salesResource: number
  interestSave: Money
  capacityBonus: number
  rndProgress: number
  priceShift: number
  orderBonus: number
  salarySave: Money
  agreementSlots: number
  brandBonus: number
  costTransfer: boolean
  cardCopy: boolean
  rndRate: number
  creditLine: Money
  rateSave: number
  orderPriceShift: number
}

// ─────────────────────────────────────────────────────────────
// 卡牌
// ─────────────────────────────────────────────────────────────

/** 一张已实例化的卡（进入牌库/手牌/弃牌堆的实体）。 */
export interface CardInstance {
  uid: string
  defId: string
  /** 已强化 */
  empowered: boolean
}

export interface CardPlayEffect {
  /** 本月采购价格档位修正 */
  buyTierShift?: number
  /** 本月每类原料供给修正 */
  buySupply?: number
  /** 本月可选采购档数修正 */
  buyLots?: number
  /** 本月售价档位修正（分层） */
  priceShift?: Record<Tier, number>
  /** 本月需求修正（分层） */
  demand?: Record<Tier, number>
  /** 本月产能修正 */
  capacity?: number
  /** 本月生产成本系数（0.9 = -10%） */
  costFactor?: number
  /** 本月薪酬修正（角） */
  salary?: Money
  /** 本月研发进度修正 */
  rndProgress?: number
  /** 本月研发成功率修正 */
  rndRate?: number
  /** 本月研发成本修正（角） */
  rndCost?: Money
  /** 本月销售资源修正 */
  salesResource?: number
  /** 立刻获得的确定性订单数 */
  orders?: number
  /** 立刻获得的订单数量（每单件数） */
  orderQty?: number
  /** 本月 AP 修正 */
  ap?: number
  /** 本月打牌数修正 */
  plays?: number
  /** 本月利息修正（角） */
  interest?: Money
  /** 特殊标记，见 actions.ts 的 applyCardSpecial */
  flags?: string[]
}

/**
 * 打出卡牌时的上下文：用于处理「若某部门 ≥ N 人，则效果改为 …」的门槛分支。
 */
export interface CardCtx {
  staff: Record<Dept, number>
  empowered: boolean
  mats: string[]
  /** 全部产品库存合计（S9 清仓甩卖等库存门槛用）。 */
  prodStock: number
}

// ─────────────────────────────────────────────────────────────
// 事件
// ─────────────────────────────────────────────────────────────

export interface EventOption {
  label: string
  /** 消耗 */
  cost?: { cash?: Money; ap?: number; materials?: Record<string, number> }
  /** 应用的修饰 */
  mods?: MonthMods
  /** 描述的代价/收益文本 */
  detail: string
  /** 收益：立即获得现金 */
  gain?: Money
  /** 立即获得订单 */
  orders?: number
  /** 额外的描述行，用于弹窗 */
  extra?: string
}

export interface GameEventDef {
  id: string
  climate: Climate
  name: string
  type: EventType
  polarity: Polarity
  scope: Scope
  /** 卡片正面的效果文案 */
  text: string
  mods?: MonthMods
  options?: EventOption[]
  /** 机会事件：参与成本与效果 */
  chance?: {
    cost: { cash?: Money; ap?: number }
    mods?: MonthMods
    detail: string
  }
}

/** 单月修饰集合，所有来源（气候/事件/卡牌/知产）汇总后的运行时视图。 */
export interface MonthMods {
  /** 每类原料的供给与价格档位修正 */
  materials?: Record<string, MaterialMods>
  /** 全原料统一修正（叠加在 materials 之上） */
  allSupply?: number
  allTierShift?: number
  /** 需求分层修正 */
  demand?: Partial<Record<Tier, number>>
  /** 售价分层修正 */
  price?: Partial<Record<Tier, number>>
  /** 产能修正 */
  capacity?: number
  /** 薪酬修正（每名员工，角） */
  salaryPer?: Money
  /** 利率修正（百分点：1 表示月利率 +0.1%） */
  rateShift?: number
  /** 借款额度系数（0.5 = 减半） */
  creditFactor?: number
  /** 无法借款 */
  noBorrow?: boolean
  /** 结转至下月的售价修正（库存积压等） */
  carryoverPrice?: Partial<Record<Tier, number>>
  /** 本季度生效的临时知产：'normal' / 'strong' 表示随机池，或具体知产 id */
  tempIps?: string[]
  /** 本月额外订单 */
  orders?: number
  orderQty?: number
  orderPriceShift?: number
  /** 采购档数修正 */
  buyLots?: number
  /** 研发进度 / 成功率 / 成本修正 */
  rndProgress?: number
  rndRate?: number
  rndCost?: Money
  /** 销售资源修正 */
  salesResource?: number
  /** 制造成本系数（0.9 = -10%） */
  costFactor?: number
  /** 本月 AP / 打牌数修正 */
  ap?: number
  plays?: number
  /** 抽卡张数 / 手牌上限修正 */
  drawBonus?: number
  handBonus?: number
  /** 本月运营提示文本（同时承担部分即时结算语义） */
  notes?: string[]
}

// ─────────────────────────────────────────────────────────────
// 董事会目标
// ─────────────────────────────────────────────────────────────

export type GoalMetric =
  | 'netProfitQ'
  | 'revenueQ'
  | 'cashEnd'
  | 'netAssetsEnd'
  | 'staffTotal'
  | 'equipmentCount'
  | 'hiresQ'
  | 'rndStartsQ'
  | 'rndSuccessQ'
  | 'grossProfitMonths'
  | 'grossProfitQ'
  | 'demandFillMonths'
  | 'demandFillBest'
  | 'debt'
  | 'debtToEquity'
  | 'debtToAssets'
  | 'inventory'
  | 'salaryQ'
  | 'highEndShare'
  | 'agreementsSigned'
  | 'capexQ'
  | 'capexOrRndQ'
  | 'unitCostQ'

export type GoalCompare = 'gte' | 'lte'

export interface GoalDef {
  id: string
  climate: Climate | 'opening'
  kind: 'basic' | 'challenge'
  name: string
  /** 完整规则文字 */
  desc: string
  metric: GoalMetric
  compare: GoalCompare
  /** 绝对阈值（角 / 件 / 人 / 百分点） */
  value?: number
  /** 附加参数，用于「毛利 ≥ Xw 的月份数」一类目标 */
  param?: number
  /** 比率型：metric 与基准 metric 的比值 */
  ratio?: { base: GoalMetric; factor: number }
  /** 以当季基本目标的目标值为基数 */
  ratioFromBasic?: number
  /** 引用「上季度同指标」的增长率，首季不使用 */
  growth?: { base: GoalMetric; factor: number; plus?: number }
  /** 分值 */
  points: number
}

export interface GoalTrack {
  def: GoalDef
  /** 目标值（角/件/人） */
  target: number
  /** 比率型时的分母上限 */
  limit?: number
}

// ─────────────────────────────────────────────────────────────
// 财务报表
// ─────────────────────────────────────────────────────────────

export interface PnlLine {
  key: string
  label: string
  value: Money
  /** 明细行 */
  detail?: { label: string; value: Money }[]
  bold?: boolean
  total?: boolean
}

export interface BalanceLine {
  key: string
  label: string
  value: Money
  detail?: { label: string; value: Money }[]
  bold?: boolean
  total?: boolean
}

export interface CashFlowLine {
  key: string
  label: string
  value: Money
  detail?: { label: string; value: Money }[]
  bold?: boolean
}

export interface Ratios {
  grossMargin: number
  netMargin: number
  currentRatio: number
  debtToAssets: number
  debtToEquity: number
  roa: number
  roe: number
  inventoryTurnover: number
}

export interface Ledger {
  month: number
  revenue: Money
  cogs: Money
  grossProfit: Money
  sellExpense: Money
  adminExpense: Money
  rndExpense: Money
  mfgExpense: Money
  financeExpense: Money
  netProfit: Money
  cashBegin: Money
  cashEnd: Money
  borrowing: Money
  repayment: Money
  capex: Money
  orders: SaleRecord[]
  spots: SaleRecord[]
  /** 归集的各项明细，用于下钻 */
  parts: Record<string, Money>
  /** 需求满足情况 */
  demandFilled: number
  demandTotal: number
}

export interface BalanceSheet {
  cash: Money
  inventoryMaterial: Money
  inventoryProduct: Money
  /** 待摊招聘费 */
  prepaid: Money
  equipmentGross: Money
  equipmentAccum: Money
  totalAssets: Money
  debt: Money
  equity: Money
  retained: Money
  paidIn: Money
  ownerCapital: Money
}

// ─────────────────────────────────────────────────────────────
// 游戏状态
// ─────────────────────────────────────────────────────────────

export interface LogEntry {
  month: number
  kind: 'event' | 'board' | 'settle' | 'action' | 'report'
  text: string
  detail?: string[]
}

export interface GameState {
  seed: number
  /** 确定性随机的当前状态，序列化后仍可精确续接 */
  rngState: number
  month: number
  phase: Phase
  climate: Climate
  momentum: Momentum
  nextClimateOdds: Record<Climate, number>

  cash: Money
  debt: Money
  paidIn: Money
  /** 股东以实物投入的资产（开局的初始产线），计入所有者权益 */
  ownerCapital: Money
  /** 待摊招聘费：招聘支出先资本化，按 RECRUIT_AMORT_MONTHS 个月摊销进管理费用 */
  prepaid: Money
  retained: Money

  ap: number
  apMax: number
  plays: number
  playsMax: number
  handMax: number
  drawN: number
  drawM: number

  depts: Record<Dept, DeptState>
  materials: Record<string, MaterialState>
  products: Record<Tier, ProductState>
  equipment: Equipment[]

  salesResource: number
  salesAlloc: Record<Tier, number>
  orders: Order[]

  rnd: Record<string, ResearchSlot>
  ipOwned: string[]
  ipActive: (string | null)[]
  ipChangedThisMonth: boolean
  materialsDeveloped: Record<string, number>
  agreements: Agreement[]
  /** 期货锁价：材料 id -> 锁定的价格档位 */
  futures: Record<string, number>
  /** 本月使用的额外采购次数（贸易商 / 紧急采购 / 清仓） */
  extraBuys: { kind: string; materialId: string; qty: number; price: Money; used: boolean }[]
  /** 本月已采购档数 */
  lotsUsed: number
  /** 本月生产计划 */
  plan: { tier: Tier | null; qty: number; overtime: boolean }
  /** 一次性收益将在下月到账 */
  /**
   * 跨月挂账：当月确认、次月收付现金。
   *
   * 若只在次月凭空加减现金，等于无凭据地创造或消灭资产，
   * 资产负债表必然失衡。因此当月按权责发生制入账，
   * 次月结算时冲销对应的应收/应付。
   */
  pendingIncome: Money
  pendingCost: Money
  /** 下月售价修正（库存积压等） */
  nextMonthPrice: Partial<Record<Tier, number>>
  /** 本月已完成的研发立项 */
  rndStartsThisMonth: string[]
  /** 本月因事件、打牌等直接付出、需要计入当期费用的现金 */
  miscExpense: Money
  /** 本月因事件直接获得的、需要计入当期收益的现金 */
  miscIncome: Money

  deck: CardInstance[]
  hand: CardInstance[]
  discard: CardInstance[]
  drawn: CardInstance[]
  drawnSelected: string[]
  playedThisMonth: CardInstance[]
  monthMods: MonthMods
  cardMods: MonthMods
  /** 本月打出且持续生效的临时标记 */
  monthFlags: string[]

  currentEvent: GameEventDef | null
  eventResolved: boolean
  eventChosen: number | null
  eventSkipped: boolean

  basicGoal: GoalTrack | null
  challengeGoal: GoalTrack | null
  challengeOffered: GoalTrack[]
  boardPrompted: boolean
  misses: number
  goalPoints: number
  goalHistory: { quarter: number; basic: boolean; challenge: boolean | null; name: string; challengeName: string }[]
  /** 上一季度的指标快照，供「上季度 × N」型目标引用 */
  quarterSnapshot: Partial<Record<string, Money>>

  ledgers: Ledger[]
  balanceHistory: BalanceSheet[]
  log: LogEntry[]

  result: 'playing' | 'won' | 'lost'
  lossReason?: string
  score: ScoreBreakdown
  achievements: string[]
  /** 已消耗的一次性交互标记 */
  flags: Record<string, number>
}

export interface Agreement {
  materialId: string
  monthsLeft: number
  priceTierShift: number
  /** 每月供应量（中批） */
  qty: number
}

export interface ScoreBreakdown {
  profit: number
  assets: number
  goal: number
  achievement: number
  event: number
  total: number
  netsum: Money
  assetsEnd: Money
}
