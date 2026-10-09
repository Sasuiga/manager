# 提案档位制 + 员工联动卡设计（2026-09 卡牌层重构）

> 背景：提案（卡牌）系统改为三件事——
> ① 卡牌按效果强度分 0/1/2/3 四档，档位越高效果越强、对价（AP + 现金）越高；
> ② 档位与对应部门人数挂钩：2 人解锁 1 档、3 人解锁 2 档、5 人解锁 3 档（0~1 人仅 0 档）；
> ③ 提案出现与部门人数分布解耦，纯随机（档内均匀）。
> 另加一层「员工联动卡」：一部分提案不直接给独立数值，而是**增效 / 改良 / 替换**员工机制本身，
> 让「人数底数 × 卡牌放大」产生协同，员工机制因此更强。
>
> 本文记录设计口径与代码落点；数值仍以 `src/core` + `src/data/game.ts` 为准，待模拟试验后调参。

## 1. 档位与对价

| 档 | 人数门槛（对应部门） | AP | 现金 |
|---|---|---|---|
| 0 | 0~1 人 | 1 | 0 |
| 1 | 2 人 | 1 | 1w |
| 2 | 3 人 | 2 | 2w |
| 3 | 5 人 | 2 | 4w |

- 常量：`TIER_STAFF = {1: 2, 2: 3, 3: 5}`、`TIER_COST`（`src/data/game.ts`）。
- 旧 `CardDef.cost`（每卡现金）与 `minStaff`（人数门槛）字段删除，统一由 `tier` 决定；
  事件修正（「打牌费用 +1w/张」）与 M7 降本模式（−1w/张）仍在 `cardPlayCost` 上叠加。
- `MGMT_CARD_UNLOCK`（M1~M4 按 2/3/4/5 人注入牌库）删除：管理卡并入牌库、按档位 gate。

## 2. 出现规则（纯随机）

- 牌库构建：全部提案卡 1 副入池；**0 档卡额外 1 副**（保证开局 0 人部门有选择）。
- 抽牌（`actions.drawCards`）：在「tier ≤ 该部门已解锁档」的池内，
  **先等概率选一档，再在该档牌内等概率随机**（档内均匀、档位间均匀，与人数分布无关）。
- 旧 `weightOf`（按部门人数加权）删除。
- 打出门槛：`canPlay` 检查 `tierUnlockedOf(staff[def.kind]) ≥ def.tier`（裁员后高档手牌会「变锁」，UI 显示人数要求）。

## 3. 员工联动卡（tag: 'staff'，sub: amp/mod/swap）

设计原则：
1. **增效（amp）**：基础轴 +N（产能/资源/进度），随人数放大；
2. **改良（mod）**：改既有机制参数（议价/提价点数、研发成本/封顶、招聘费、加班费）；
3. **替换（swap）**：本月把部门基础能力换一种形态兑现（基础轴 −N + 替代轴 +M，或时间形态替换），必有副作用。
- 部门各守其责：不做跨部门借调；替换只改「本部门能力的兑现方式」。

### 新增卡表（22 张）

| 卡 | 部门 | 档 | 类型 | 效果 |
|---|---|---|---|---|
| C11 采购培训 | buy | 1 | 增效 | 每人采购资源 +1（强化 +2） |
| C12 谈判专家 | buy | 2 | 改良 | 议价 4→3 点/档（强化 2 点/档） |
| C13 材料聚焦 | buy | 2 | 替换 | 点数不做供给加点；指定 1 原料供给 +6 价 −1 档（强化 +10/−2） |
| C14 供应合约 | buy | 3 | 增效 | 协议槽 +1 且 6 月锁定期可选（强化槽 +2） |
| C15 锁价谈判 | buy | 3 | 替换 | 议价 4→2 点/档、供给加点上限减半（强化 1 点/档、上限不变） |
| P11 产能提升 | make | 1 | 增效 | 每名工人产能 +1（强化 +2） |
| P12 加班补贴 | make | 2 | 改良 | 加班费减半（吸收旧 K8；强化 +加班产能 1× 员工产能） |
| P13 质效模式 | make | 2 | 替换 | 每名工人产能 −1，生产成本 −20%（强化 −30%） |
| P14 全员维护 | make | 3 | 增效 | 每名工人产能 +2 且加班费减半（强化 +3） |
| P15 设备模式 | make | 3 | 替换 | 设备产能加成 ×2（+4→+8/人），每名工人基础产能 −1；强化基础不减 + 加班减半 |
| S11 销售培训 | sell | 1 | 增效 | 每人销售资源 +2（强化 +3） |
| S12 高端定价 | sell | 2 | 改良 | 提价 8→6 点/档（强化 4 点/档） |
| S13 以量换价 | sell | 2 | 替换 | 全部确定性订单 +5 件、订单价 +1→+0（强化 +10 件、价不变） |
| S14 品牌溢价 | sell | 3 | 增效 | 每人销售资源 +4 且订单槽 +1（强化槽 +2） |
| S15 提价月 | sell | 3 | 替换 | 推需求减半，提价 8→4 点/档；强化可提 2 档 |
| R11 聚焦攻关 | rnd | 1 | 增效 | 每人研发进度 +2（强化 +3） |
| R12 研发补贴 | rnd | 2 | 改良 | 研发费 −1w/项目、成功率封顶 90%→95%（强化 −2w、100%） |
| R13 求稳模式 | rnd | 2 | 替换 | 每人进度 5→3，每人成功率加成 5%→10%（强化 15%） |
| R14 突破模式 | rnd | 3 | 替换 | 研发进度 ×1.5，月末满额项目进度最高者补掷 1 次取高（强化 ×2、前 2 项目） |
| M5 高效招聘 | ops | 2 | 改良 | 招聘费 −50%（强化 −75%） |
| M6 即时授权 | ops | 2 | 替换 | 管理招聘的 AP+1 即时生效（强化：管理招聘 1 次不耗 AP） |
| M7 降本模式 | ops | 3 | 替换 | 管理 AP 上限 +1 失效，改为提案费 −1w/张、招聘费 −50%（强化 AP 净 +1） |

### 既有卡处置

- **K8 加班补贴删除**（并入 P12，效果同口径：`overtimeHalf` / `overtimeHalfPlus` flag 复用）；
- **R10 知识产权保护** 重标为 rnd 3 档增效卡（`ipSlotsPlus` mod 取代 `ipSlotPlus` flag，`ipSlots()` 读 derive）；（2026-10-09：槽位制移除，改为在研项目成功率 +25%/强化 +40%，走 `rndRate` 字段，`ipSlotsPlus` 退场，见交接文档）；
- **M2 +1 AP** 标为 ops 1 档增效卡（效果不变）；
- 其余 50 张既有卡按效果强度标 0~3 档（见 `CARDS` 中 `tier` 字段），数值不变。

## 4. 机制落点（代码）

| 位置 | 内容 |
|---|---|
| `data/game.ts` | `CardDef.tier/tag/sub`；`TIER_STAFF/TIER_COST/tierUnlockedOf`；52 旧卡重标 + 22 新卡；`STAFF.unlocks` 文案加「提案 N 档解锁」；删 K8、留 `MGMT_CARD_UNLOCK` 兼容导出 |
| `core/types.ts` | `MonthMods`/`CardPlayEffect` 新增 15 个员工联动字段；`GameState.focusMat`（C13 选料） |
| `core/derive.ts` | `mergeMods`/`cardEffectToMods` 处理新字段（加法型累加；成本取最小、上限/倍率取最大）；产能（capPerStaff/equipCapFactor）、采购资源（buyResPerStaff）、议价（negotiateCost）、供给加点（supplyPushHalf/matFocus）、销售资源（sellResPerStaff）、推需求（sellPushHalf）、提价（priceRaiseCost/Cap）、订单（orderQtyPlus/orderPriceShift）、AP 上限（opsApOff）、研发（rndProgPerStaff/rndProgFactor/rndRatePerStaff/rndRateCapPlus）；暴露 `buyNegotiateCost/sellRaiseCost/sellRaiseCap/...` 供 UI |
| `core/actions.ts` | `drawCards` 档内均匀抽牌（删 `weightOf`）；`canPlay/cardPlayCost/playCard` 走档位；`hireCost` 乘 `hireFeeFactor`；`hire` 支持 `opsApImmediate/hireApFree`；`ipSlots/agreementSlots` 读 mod；新增 `setFocusMat`；`setSellPriceAlloc` 支持 0~cap |
| `core/game.ts` | `buildDeck` 全卡 1 副 + 0 档 2 副；删 ops 注入 |
| `core/settle.ts` | R14 补掷（rnd 结算段）；`syncManagementCards` 变 no-op；提案费用台账按档位对价 |
| `core/engine.ts` | 导出 `setFocusMat/TIER_COST/TIER_STAFF/tierUnlockedOf`；月初重置 `focusMat` |
| UI | 卡面「N 档 + 增效/改良/替换」标签与 AP+现金对价、锁定提示（Turn/Draw）；采购页 C13 选料、议价/供给加点随卡牌变化（d.buyNegotiateCost、d.supplyPushHalf、d.matFocusActive）；销售页提价随 d.sellRaiseCost/Cap；协议页 6 月锁定期（agreeLock6） |
| 测试 | `tier.test.ts`（解锁边界/对价/抽牌池/全部联动字段）；ap-unify、core-loop、directives、engine 测试适配新门槛 |

## 5. 待试验/调参点

- 档位对价表（1/2/4w）与 AP 消耗节奏：2 AP 的 2/3 档在 3 AP 月份是否过紧；
- 3 档卡强度（5 人解锁的招牌位）是否够「招牌」；
- 联动卡占比约 30%（22 张新 + 既有 3 张）是否稀释独立效果卡；
- 改良卡前提未解锁时的废牌率（如 P12 在无加班解锁时打出：`overtimeHalf` flag 无消费对象，等于白打——可后续加 canPlay 提示）。
