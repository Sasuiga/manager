import { useState, Fragment } from 'react'
import * as E from '../../core/engine'
import { STAFF, CARD_BY_ID, PRODUCT_PRICE, EQUIPMENT_SHOP, EQUIP_CAP_PER_WORKER, IP_BY_ID, DEPT_SHORT, DEPT_NAMES, TIER_LABEL, RND_COST_PER_PROJECT, BOMS, MATERIAL_BY_ID, CLIMATE_MATERIAL, CLIMATE_NAMES, EVENTS, LOAN_TERM_MONTHS, overtimeCostOf, overtimeGainOf } from '../../data/game'
import type { CardCtx } from '../../data/game'
import type { CardInstance, Dept } from '../../core/types'
import type { Tier } from '../../core/types'
import { Icon, type IconName } from '../icons'
import { Medallion } from '../ornaments'
import { Row, Sheet } from '../Sheet'
import { wan, tierClass, tierName, TIER_ORDER, clamp } from '../format'
import type { Game } from '../useGame'
import { PreviewPage } from './Preview'

const DEPTS: E.Dept[] = ['ops', 'buy', 'make', 'sell', 'rnd']
export type TurnView = E.Dept | 'preview'

function LedgerSection({ g, dept }: { g: Game; dept: E.Dept }) {
  const d = E.derive(g.s)
  const s = g.s
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const rows = d.deptLedger[dept]
  if (rows.length === 0) return null
  const total = rows.reduce((a, r) => a + (r.debitAmt || r.creditAmt), 0)

  /** 点击金额弹出/收起计算说明，返回行说明 */
  const getDetailLines = (r: typeof rows[number]): string[] => {
    if (r.detail?.length) return r.detail
    if (r.item.includes('工资')) {
      if (r.item.includes('支付')) {
        return [
          `实付上月计提的薪酬 ${wan(r.debitAmt)}（借 应付职工薪酬 / 贷 现金）`,
          '当月计提、次月实发：上月工资在本月现金流出，费用已于计提当月确认',
        ]
      }
      const per = d.salaryPer[dept]
      const base = STAFF[dept].salary
      const lines: string[] = [`基础月薪 ${wan(base)} / 人`]
      if (per !== base) {
        const delta = per - base
        lines.push(`修正后 ${wan(per)} / 人（${delta > 0 ? '+' : ''}${wan(delta)}，受 IP / 事件影响）`)
      }
      lines.push(`人数 ${s.depts[dept].staff} 人`)
      lines.push(`计提额 ${wan(per * s.depts[dept].staff)}（贷 应付职工薪酬，次月实付；本月不动现金）`)
      return lines
    }
    if (r.item.includes('招聘')) {
      const fee = E.hireCost(s, dept)
      const lines: string[] = [`招聘费 ${wan(fee)}（按当前阶梯）`]
      if (s.monthMods.notes?.includes('招聘费 -1w')) lines.push('事件修正：-0.1w')
      if (s.monthMods.notes?.includes('招聘费 +1w')) lines.push('事件修正：+0.1w')
      if (s.monthMods.notes?.includes('招聘费 -50%')) lines.push('事件修正：-50%')
      lines.push(`本月招聘 ${r.debitAmt > 0 ? Math.round(r.debitAmt / fee) : 1} 人`)
      lines.push(`合计 ${wan(r.debitAmt || r.creditAmt)}`)
      return lines
    }
    if (r.item.includes('折旧')) {
      const lines: string[] = []
      for (const e of s.equipment) {
        const charge = Math.min(e.depreciation, Math.max(0, e.cost - e.accumulated))
        lines.push(`${e.name}：${wan(charge)}`)
      }
      lines.push(`合计 ${wan(r.debitAmt || r.creditAmt)}`)
      return lines
    }
    if (r.item.includes('加班')) return ['加班费 = 2× 本月生产工资计提额，安排时发生即支付（选定后不可取消、费用不退还，需生产 ≥ 3 人；效果 = 本月产能 +1× 员工产能，含设备加成）']
    if (r.item.includes('研发')) return [`每个项目每月 ${wan(RND_COST_PER_PROJECT)}`, '本月推进 1 个项目']
    if (r.item.includes('提案')) return ['提案实施费用合计（含卡牌费用），计入管理费用']
    if (r.item.includes('借款到期还款')) return [`期限 ${LOAN_TERM_MONTHS} 个月届满，剩余本金到期强制现金全额归还`, '当月利息已按月末余额计提；现金仍为负则资金断裂']
    if (r.item.includes('借款利息')) return ['借款余额 × 月利率，计入财务费用；提前还款按剩余余额少计']
    if (r.item.includes('生产费用结转')) return ['制造费用未转入存货的部分（工资/折旧/加班/降本差异）当期费用化，与损益表「生产费用」一致']
    if (r.item.includes('流水线入库')) return ['白得产出按本批单位成本计价入库，贷记营业外收入，恒等式不漂移']
    if (r.item.includes('协议手续费')) return ['签订长期协议费用 1w，计入事件与杂项支出']
    if (r.item.includes('供应商开发')) return ['开发费 3w 计入事件与杂项支出；基础供给 +2 立即生效']
    if (r.item.includes('设备购置')) return ['现金资本化为固定资产，不计当期损益；折旧逐月进生产费用']
    if (r.item.includes('借款')) return ['现金与负债同步增减，净资产不变；期限 3 个月，到期未还部分强制全额归还；利息按月末余额确认进财务费用']
    // 手工记账行的兜底说明（正常路径由 r.detail 提供）
    if (r.item.startsWith('采购') || r.item.includes('贸易商') || r.item.includes('协议到货'))
      return ['现金实付全额转入库存（移动加权平均计价）', '库存增加额 = 现金扣减额，与生产领料出库勾稽']
    if (r.item.includes('原料出库'))
      return ['按账面单价（移动加权平均）出库', '库存减记全额转入制造费用，与采购入库同科目勾稽']
    if (r.item.includes('存货入库'))
      return ['领料成本按成本系数折价入账', '降本差异计入生产费用（结算报表可见）']
    if (r.item.includes('销售收入'))
      return ['现金增加，确认销售收入', '金额 = 利润表「销售收入」']
    if (r.item.includes('销售成本'))
      return ['成品存货减记全额结转', '金额 = 利润表「销售成本」，与生产入库同科目勾稽']
    return []
  }

  const showDetail = (r: typeof rows[number]) => {
    setDetail(detail === r.item ? null : r.item)
  }

  return (
    <div className="card" style={{ marginTop: 'var(--s3)' }}>
      <button className="btn btn-mini" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => { setOpen(!open); setDetail(null); }}>
        <span className="btn-main xs">本月账务</span>
        <span className="btn-sub xs">{open ? '收起' : '展开'}</span>
      </button>
      {open ? (
        <div className="stack-sm" style={{ marginTop: 'var(--s2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px', gap: 'var(--s1)', fontSize: 'var(--fs-xs)', color: 'var(--faint)', borderBottom: '1px solid var(--line)', paddingBottom: 'var(--s1)' }}>
            <span>项目</span><span>借方</span><span>贷方</span><span style={{ textAlign: 'right' }}>金额</span>
          </div>
          {rows.map((r) => (
            <div key={r.item} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px', gap: 'var(--s1)', fontSize: 'var(--fs-xs)', padding: 'var(--s1) 0', borderBottom: '1px solid var(--line)' }}>
              <span>{r.item}</span>
              <span style={{ color: 'var(--muted)' }}>{r.debit}</span>
              <span style={{ color: 'var(--muted)' }}>{r.credit}</span>
              <button
                onClick={() => showDetail(r)}
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  background: 'none',
                  border: 'none',
                  color: 'var(--gold-deep)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 500,
                  borderRadius: 'var(--r-sm)',
                  transition: 'background 0.15s',
                }}
                className="ledger-amt"
              >
                {wan(r.debitAmt || r.creditAmt)}
              </button>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px', gap: 'var(--s1)', fontSize: 'var(--fs-xs)', paddingTop: 'var(--s1)', borderTop: '1px solid var(--line)' }}>
            <span className="bold">合计</span>
            <span /><span />
            <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{wan(total)}</span>
          </div>
        </div>
      ) : null}
      {detail ? (
        <div style={{ marginTop: 'var(--s3)', padding: 'var(--s3)', background: 'var(--panel-2)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-xs)' }}>
          {rows.filter((r) => r.item === detail).map((r) => (
            <div key={r.item} style={{ marginBottom: 'var(--s2)' }}>
              <div className="bold" style={{ marginBottom: 'var(--s1)', color: 'var(--ink)' }}>{r.item}</div>
              {getDetailLines(r).map((l, i) => (
                <div key={i} style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{l}</div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
const DEPT_ICON: Record<E.Dept, IconName> = {
  ops: 'ops',
  buy: 'buy',
  make: 'make',
  sell: 'sell',
  rnd: 'rnd',
}

/** 经营页：底部五部门轨道 + 中央操作区。 */
export function TurnScreen({
  g,
  dept,
  onDept,
  onSettle,
}: {
  g: Game
  dept: TurnView
  onDept: (d: TurnView) => void
  onSettle: () => void
}) {
  const s = g.s
  const d = E.derive(s)
  // 完整 / 核心模式均展示全部五部门：核心模式同样含管理部门（管理人员招聘 + 提案实施）
  const visibleDepts: E.Dept[] = DEPTS

  /** 轨道红点：有未处理事项时亮起。 */
  const dots: Record<E.Dept, boolean> = {
    ops: s.hand.length > 0 && s.ap > 0,
    buy: E.allocUsed(s) >= 0 && d.materials.pkg && Object.values(s.materials).some((m) => !m.chosenLot && m.qty === 0),
    make: E.maxProducible(s, 'low') > 0,
    sell: s.orders.length > 0,
    rnd: E.activeResearch(s) === null && s.depts.rnd.staff > 0,
  }

  return (
    <>
      <div className="scroll">
        {dept === 'ops' ? <OpsPage g={g} /> : null}
        {dept === 'buy' ? <BuyPage g={g} /> : null}
        {dept === 'make' ? <MakePage g={g} /> : null}
        {dept === 'sell' ? <SellPage g={g} /> : null}
        {dept === 'rnd' ? <RndPage g={g} /> : null}
        {dept === 'preview' ? <PreviewPage g={g} onSettle={onSettle} /> : null}

        {dept !== 'preview' ? <HireBlock g={g} dept={dept} /> : null}
      </div>

      <nav className="track">
        {visibleDepts.map((k) => (
          <button key={k} className={`track-btn${dept === k ? ' on' : ''}`} onClick={() => onDept(k)}>
            {dots[k] ? <span className="track-dot" /> : null}
            <Icon name={DEPT_ICON[k]} size={19} />
            <span>{DEPT_SHORT[k]}</span>
          </button>
        ))}
        <button
          className={`track-btn track-settle${dept === 'preview' ? ' on' : ''}`}
          onClick={() => s.mode === 'core' ? onDept('preview') : onSettle()}
        >
          <Icon name="settle" size={19} />
          <span>{s.mode === 'core' ? '预算' : '结算'}</span>
        </button>
      </nav>
    </>
  )
}

/* ══════════════ 运营部 ══════════════ */

function OpsPage({ g }: { g: Game }) {
  const s = g.s
  const d = E.derive(s)
  const [view, setView] = useState<'discard' | null>(null)
  const [loan, setLoan] = useState<'borrow' | 'repay' | null>(null)
  /** M3 复制手牌：先选要复制的目标手牌，再打出 */
  const [m3, setM3] = useState<string | null>(null)
  /** J5 专利壁垒：本季可复制一张已打出的提案（免费、不占 AP/打牌数） */
  const [j5, setJ5] = useState(false)
  /** 决议卡槽满时的替换目标（uid） */
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const directiveSlots = E.directiveSlots(s)
  const descOf = (c: CardInstance) => {
    const def = CARD_BY_ID[c.defId]
    return c.empowered && def?.empowered ? def.empowered : def?.text ?? ''
  }

  return (
    <>
      <LedgerSection g={g} dept="ops" />

      {/* 管理动作（标准行动：非卡牌、常驻可用；TTA 式——每个动作输出形状互不重叠） */}
      <div className="card">
        <h3>管理动作</h3>
        <div className="title-rule" />
        <div className="stack">
          <div className="card-item">
            <span className="spine" />
            <span className="card-body">
              <span className="card-name">库存清理</span>
              <span className="card-desc">选定层出售至多 5 件成品（账面均价、不进损益；已接订单仍占库存，慎清）</span>
              <span className="card-cost">1 AP</span>
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              {TIER_ORDER.map((t) => (
                <button
                  key={t}
                  className="btn btn-mini"
                  style={{ width: 'auto' }}
                  disabled={!s.products[t].built || s.products[t].qty <= 0}
                  onClick={() => g.act((st) => E.liquidateStock(st, t))}
                >
                  <span className="btn-main xs">{TIER_LABEL[t]}</span>
                </button>
              ))}
            </span>
          </div>
          <div className="card-item">
            <span className="spine" />
            <span className="card-body">
              <span className="card-name">渠道拜访</span>
              <span className="card-desc">本月自然订单 +1（8–12 件、订单价 +1 档，可接可拒；永久版 = 销售 2/4 人或渠道类知产）</span>
              <span className="card-cost">1 AP</span>
            </span>
            <button className="btn btn-mini" style={{ width: 'auto' }} onClick={() => g.act((st) => E.channelVisit(st))}>
              <span className="btn-main xs">拜访</span>
            </button>
          </div>
          <div className="card-item">
            <span className="spine" />
            <span className="card-body">
              <span className="card-name">市场考察</span>
              <span className="card-desc">预算页展示下季度气候转移概率表（K7 强化情报另加风险提示）</span>
              <span className="card-cost">1 AP</span>
            </span>
            <button className="btn btn-mini" style={{ width: 'auto' }} onClick={() => g.act((st) => E.marketScout(st))}>
              <span className="btn-main xs">考察</span>
            </button>
          </div>
          <div className="card-item">
            <span className="spine" />
            <span className="card-body">
              <span className="card-name">人才市场</span>
              <span className="card-desc">任一新部门招聘 1 人免阶梯招聘费（一口价；生产人员本就免费，不适用）</span>
              <span className="card-cost">1 AP · 2w</span>
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              {(Object.keys(s.depts) as E.Dept[]).map((dept) => (
                <button
                  key={dept}
                  className="btn btn-mini"
                  style={{ width: 'auto' }}
                  disabled={dept === 'make' || s.depts[dept].staff >= 5}
                  title={dept === 'make' ? '生产招聘免费，直接招聘' : '人才市场：1 AP + 2w，免招聘费'}
                  onClick={() => g.act((st) => E.talentFair(st, dept))}
                >
                  <span className="btn-main xs">{DEPT_SHORT[dept]}</span>
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* 长期方案（决议卡 D 系列：入槽后持续到终局，终局计分；每月最多换 1 张） */}
      <div className="card">
        <div className="hstack-between">
          <h3>长期方案（{s.directives.length}/{directiveSlots}）</h3>
          {s.directiveChangedThisMonth ? <span className="xs faint">本月换动已用</span> : null}
        </div>
        <div className="title-rule" />
        {s.directives.length === 0 ? (
          <p className="muted sm">暂无长期方案。打出 D 系决议卡入槽：便宜、无风险、持续到终局；终局每张 +3 分，同部门 2 张再 +5。</p>
        ) : (
          <div className="stack">
            {s.directives.map((x, i) => {
              const def = CARD_BY_ID[x.defId]
              return (
                <div key={`${x.defId}-${i}`} className="card-item">
                  <span className="spine" />
                  <span className="card-body">
                    <span className="card-name">
                      【{DEPT_SHORT[def.kind]}】{def.name}
                      {x.empowered ? <span className="tag gold" style={{ marginLeft: 6 }}>强化</span> : null}
                    </span>
                    <span className="card-desc">{x.empowered && def.empowered ? def.empowered : def.text}</span>
                    <span className="card-cost">持续到终局 · 终局 +3 分/张（同部门 2 张 +5）</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {replaceTarget ? (
          <div className="stack" style={{ marginTop: 'var(--s2)' }}>
            <div className="section-label">选择要替换的方案（本月 1 次）</div>
            {s.directives.map((x, i) => (
              <button
                key={`rep-${i}`}
                className="btn btn-mini"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  g.act((st) => E.playCard(st, replaceTarget, { replaceIdx: i }))
                  setReplaceTarget(null)
                }}
              >
                <span className="btn-main xs">
                  替换【{CARD_BY_ID[x.defId]?.name}】{x.empowered ? '（强化）' : ''}
                </span>
              </button>
            ))}
            <button className="btn btn-mini" style={{ width: '100%' }} onClick={() => setReplaceTarget(null)}>
              <span className="btn-main xs">取消</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* 提案 */}
      <div className="card">
        <div className="hstack-between">
          <h3>提案</h3>
          <div className="wrap">
            <button className="btn btn-mini" style={{ width: 'auto' }} onClick={() => setView('discard')}>
              <span className="btn-main xs">已实施 {s.playedThisMonth.length}</span>
            </button>
          </div>
        </div>
        <div className="title-rule" />
        {s.hand.length === 0 ? (
          <p className="muted sm">暂无提案。</p>
        ) : (
          <div className="stack">
            {s.hand.map((c) => {
              const def = CARD_BY_ID[c.defId]
              const playable = E.canPlay(s, c)
              const cost = E.cardPlayCost(s, def)
              return (
                <div key={c.uid} className={`card-item d-${def.kind}${playable.ok ? '' : ' dim'}`}>
                  <span className="spine" />
                  <span className="card-body">
                    <span className="hstack-between">
                      <span className="card-name">
                        【{DEPT_SHORT[def.kind]}】{def.name}
                        {c.empowered ? <span className="tag gold" style={{ marginLeft: 6 }}>强化</span> : null}
                      </span>
                    </span>
                    <span className="card-desc">{descOf(c)}</span>
                    <span className="card-cost">
                      {`1 AP`}{cost > 0 ? ` · 费用 ${wan(cost)}` : ''}{def.minStaff ? ` · 需${Object.entries(def.minStaff).map(([d2, n]) => `${DEPT_NAMES[d2 as Dept] ?? d2} ≥ ${n} 人`).join('、')}` : ''}
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)', justifyContent: 'center' }}>
                    <button
                      className="btn btn-mini"
                      style={{ width: 'auto' }}
                      disabled={!playable.ok}
                      onClick={() => {
                        if (def.id === 'M3') {
                          if (s.hand.length <= 1) {
                            g.setToast('无其他手牌可复制')
                            return
                          }
                          setM3(c.uid)
                          return
                        }
                        // 决议卡：槽满时需先选替换目标（每月 1 次换动）
                        if (def.directive && s.directives.length >= E.directiveSlots(s)) {
                          setReplaceTarget(c.uid)
                          return
                        }
                        g.act((st) => E.playCard(st, c.uid))
                      }}
                    >
                      <span className="btn-main xs">{def.directive ? (s.directives.length >= E.directiveSlots(s) ? '换入方案' : '入方案槽') : '实施'}</span>
                      {!playable.ok ? <span className="btn-sub xs">{playable.msg}</span> : null}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {s.hand.length > s.handMax ? (
          <div className="warn" style={{ marginTop: 'var(--s3)' }}>
            提案超出上限 {s.hand.length - s.handMax} 项，需弃提案后才能继续。
          </div>
        ) : null}
      </div>

      {/* J5 专利壁垒：本季可复制 1 张本季已打出的提案（免费、不占 AP/打牌数） */}
      {d.ipCardCopy && s.playedThisQuarter.length > 0 ? (
        <div className="card">
          <h3>专利壁垒 · 提案复制</h3>
          <div className="title-rule" />
          <button className="btn btn-mini" onClick={() => setJ5(true)}>
            <span className="btn-main">复制本季已打出提案</span>
            <span className="btn-sub">J5：每季度 1 次，免费生效、不占 AP 与打牌数</span>
          </button>
        </div>
      ) : null}

      {/* 融资：额度内以 1w 为单位借/还；期限 3 个月，到期未还部分强制全额归还；未还清不能借新笔；利息按月末余额 × 月利率进财务费用 */}
      <div className="card">
        <div className="hstack-between">
          <h3>融资</h3>
          <span className="xs faint mono">额度 {wan(d.creditLine)}</span>
        </div>
        <div className="title-rule" />
        <Row k="借款余额" v={wan(s.debt)} />
        {s.loanDueMonth > 0 ? (
          <Row k="还款期限" v={`第 ${s.loanDueMonth} 月到期 · 剩 ${s.loanDueMonth - s.month + 1} 个月`} cls="gold" />
        ) : null}
        <Row k="可用额度" v={wan(d.creditAvailable)} cls={d.creditAvailable > 0 ? 'gold' : ''} />
        <Row k="月利率" v={`${(d.rate * 100).toFixed(1)}%`} />
        {s.debt > 0 ? <Row k="本月利息" v={wan(d.interest)} /> : null}
        <div className="stack" style={{ marginTop: 'var(--s3)' }}>
          <button
            className="btn btn-mini"
            disabled={d.noBorrow || s.debt > 0 || d.creditAvailable < 10}
            onClick={() => setLoan('borrow')}
          >
            <span className="btn-main">借款</span>
            <span className="btn-sub">
              {d.noBorrow
                ? '本月无法新增借款'
                : s.debt > 0
                  ? '先还清上一笔，再借新笔'
                  : d.creditAvailable < 10
                    ? '可用额度不足 1w'
                    : `可用 ${wan(d.creditAvailable)} · 以 1w 为单位 · 期限 ${LOAN_TERM_MONTHS} 个月`}
            </span>
          </button>
          <button className="btn btn-mini" disabled={s.debt <= 0} onClick={() => setLoan('repay')}>
            <span className="btn-main">还款</span>
            <span className="btn-sub">
              {s.debt > 0 ? `余额 ${wan(s.debt)} · 现金 ${wan(s.cash)}${s.loanDueMonth > 0 ? ` · 第 ${s.loanDueMonth} 月到期` : ''}` : '暂无借款'}
            </span>
          </button>
        </div>
      </div>

      {view === 'discard' ? (
        <Sheet
          title="已实施提案"
          sub={`${s.playedThisMonth.length} 项`}
          onClose={() => setView(null)}
        >
          <div className="stack">
            {s.playedThisMonth.length === 0 ? (
              <p className="muted sm">本月暂无已实施提案。</p>
            ) : (
              <>
                <div className="section-label">持续性效果</div>
                <div className="stack-sm" style={{ marginBottom: 'var(--s3)' }}>
                  {s.playedThisMonth.filter((c) => {
                    const def = CARD_BY_ID[c.defId]
                    if (!def?.base) return false
                    const ctx: CardCtx = { staff: { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }, empowered: c.empowered, mats: [], prodStock: 0 }
                    const eff = def.base(ctx)
                    return !(eff.orders || eff.flags?.length)
                  }).map((c) => {
                    const def = CARD_BY_ID[c.defId]
                    return (
                      <div key={c.uid} className={`card-item d-${def.kind}`}>
                        <span className="spine" />
                        <span className="card-body">
                          <span className="card-name">【{DEPT_SHORT[def.kind]}】{def.name}{c.empowered ? '（强化）' : ''}</span>
                          <span className="card-desc">{c.empowered && def.empowered ? def.empowered : def.text}</span>
                        </span>
                      </div>
                    )
                  })}
                  {s.playedThisMonth.filter((c) => {
                    const def = CARD_BY_ID[c.defId]
                    if (!def?.base) return false
                    const ctx: CardCtx = { staff: { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }, empowered: c.empowered, mats: [], prodStock: 0 }
                    const eff = def.base(ctx)
                    return !(eff.orders || eff.flags?.length)
                  }).length === 0 ? <p className="xs faint">无</p> : null}
                </div>
                <div className="section-label">即时效果</div>
                <div className="stack-sm">
                  {s.playedThisMonth.filter((c) => {
                    const def = CARD_BY_ID[c.defId]
                    if (!def?.base) return false
                    const ctx: CardCtx = { staff: { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }, empowered: c.empowered, mats: [], prodStock: 0 }
                    const eff = def.base(ctx)
                    return !!(eff.orders || eff.flags?.length)
                  }).map((c) => {
                    const def = CARD_BY_ID[c.defId]
                    return (
                      <div key={c.uid} className={`card-item d-${def.kind}`}>
                        <span className="spine" />
                        <span className="card-body">
                          <span className="card-name">【{DEPT_SHORT[def.kind]}】{def.name}{c.empowered ? '（强化）' : ''}</span>
                          <span className="card-desc">{c.empowered && def.empowered ? def.empowered : def.text}</span>
                        </span>
                      </div>
                    )
                  })}
                  {s.playedThisMonth.filter((c) => {
                    const def = CARD_BY_ID[c.defId]
                    if (!def?.base) return false
                    const ctx: CardCtx = { staff: { ops: 0, buy: 0, make: 0, sell: 0, rnd: 0 }, empowered: c.empowered, mats: [], prodStock: 0 }
                    const eff = def.base(ctx)
                    return !!(eff.orders || eff.flags?.length)
                  }).length === 0 ? <p className="xs faint">无</p> : null}
                </div>
              </>
            )}
          </div>
        </Sheet>
      ) : null}

      {/* M3 复制手牌：选择要复制的目标手牌 */}
      {m3 ? (
        <M3TargetSheet g={g} cardUid={m3} onClose={() => setM3(null)} />
      ) : null}

      {/* J5 专利壁垒：复制本季已打出的提案（免费、不占 AP/打牌数） */}
      {j5 ? <J5CopySheet g={g} onClose={() => setJ5(false)} /> : null}

      {/* 融资·借/还款：选档式金额菜单（同「选择采购档位」样式），选定即执行 */}
      {loan ? <LoanSheet g={g} mode={loan} onClose={() => setLoan(null)} /> : null}
    </>
  )
}

/** M3 复制手牌的目标选择弹框：选一张手牌，确认后打出 M3 并复制。 */
function M3TargetSheet({ g, cardUid, onClose }: { g: Game; cardUid: string; onClose: () => void }) {
  const s = g.s
  const targets = s.hand.filter((c) => c.uid !== cardUid)
  return (
    <Sheet title="复制手牌" sub="选择要复制的手牌" onClose={onClose}>
      <div className="stack">
        {targets.map((c) => {
          const def = CARD_BY_ID[c.defId]
          return (
            <button
              key={c.uid}
              className={`card-item d-${def.kind}`}
              onClick={() => {
                const r = g.act((st) => E.playCard(st, cardUid, { targetUid: c.uid }))
                if (!r.ok) g.setToast(r.msg)
                onClose()
              }}
            >
              <span className="spine" />
              <span className="card-body">
                <span className="card-name">
                  【{DEPT_SHORT[def.kind]}】{def.name}
                  {c.empowered ? <span className="tag gold" style={{ marginLeft: 6 }}>强化</span> : null}
                </span>
                <span className="card-desc">{c.empowered && def.empowered ? def.empowered : def.text}</span>
              </span>
            </button>
          )
        })}
        {targets.length === 0 ? <p className="muted sm">没有可复制的手牌。</p> : null}
      </div>
    </Sheet>
  )
}

/** J5 专利壁垒：本季已打出的提案中选择一张复制（免费生效、不占 AP/打牌数）。 */
function J5CopySheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s
  const items = s.playedThisQuarter
  return (
    <Sheet title="复制已打出提案" sub="J5 专利壁垒：每季度 1 次，免费生效" onClose={onClose}>
      <div className="stack">
        {items.map((key) => {
          const [defId, emp] = key.split(':')
          const def = CARD_BY_ID[defId]
          if (!def) return null
          const empowered = emp === '1'
          return (
            <button
              key={key}
              className={`card-item d-${def.kind}`}
              onClick={() => {
                const r = g.act((st) => E.copyPlayedCard(st, key))
                if (r.ok) g.setToast(r.msg ?? '已复制')
                else g.setToast(r.msg)
                onClose()
              }}
            >
              <span className="spine" />
              <span className="card-body">
                <span className="card-name">
                  【{DEPT_SHORT[def.kind]}】{def.name}
                  {empowered ? <span className="tag gold" style={{ marginLeft: 6 }}>强化</span> : null}
                </span>
                <span className="card-desc">{empowered && def.empowered ? def.empowered : def.text}</span>
              </span>
            </button>
          )
        })}
        {items.length === 0 ? <p className="muted sm">本季暂无已打出的提案。</p> : null}
      </div>
    </Sheet>
  )
}

/* ══════════════ 采购部 ══════════════ */

function BuyPage({ g }: { g: Game }) {
  const gs = g.s
  const d = E.derive(gs)
  const mats = E.materialViews(gs)
  /** 本期期末资金（回款前，与预算页同一口径）：期初现金 + 事件收益 − 已付/结算时付各项 */
  const presettle = E.preSettleCash(gs)
  const [buy, setBuy] = useState<{ id: string; lot: E.LotSize } | null>(null)
  const [pickLot, setPickLot] = useState<string | null>(null)
  const [trader, setTrader] = useState(false)
  const [agreement, setAgreement] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [clearance, setClearance] = useState(false)
  const [swap, setSwap] = useState(false)
  const urgentOn = gs.monthFlags.includes('urgent') || gs.monthFlags.includes('urgentMid')
  const clearanceOn = gs.monthFlags.includes('clearance') || gs.monthFlags.includes('clearanceMid')
  const swapOn = gs.monthFlags.includes('swap') || gs.monthFlags.includes('swapPlus')

  return (
    <>
      <LedgerSection g={g} dept="buy" />

      {/* 产品 BOM 看板（从生产页挪来）：采购时对照配方估算「买多少原料 ≈ 产多少货」 */}
      <div className="card">
        <h3>产品 BOM</h3>
        <div className="title-rule" />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) 1fr 1fr', columnGap: 'var(--s4)', rowGap: 'var(--s2)', alignItems: 'center' }}>
          <span className="xs" style={{ color: 'var(--gold)' }}>产品</span>
          <span className="xs faint">配方（每件）</span>
          <span className="xs faint">库存 / 成本</span>
          {TIER_ORDER.filter((t) => gs.products[t].built).map((t) => {
            const bom = BOMS[t]
            const p = gs.products[t]
            const recipeText = Object.entries(bom.recipe)
              .map(([id, n]) => `${MATERIAL_BY_ID[id]?.name ?? id}×${n}`)
              .join(' + ')
            return (
              <Fragment key={t}>
                <span className="sm">
                  <b>{bom.name}</b>
                  <span className="faint xs"> · {TIER_LABEL[t]}</span>
                </span>
                <span className="xs faint">{recipeText}</span>
                <span>
                  <span className="mono sm">{p.qty}</span>
                  <span className="faint xs"> 件 · {wan(p.avgCost)}/件</span>
                </span>
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h3>原料采购</h3>
        <div className="title-rule" />
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>材料</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>{gs.mode === 'core' ? '库存 + 计划' : '库存'}</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>供给</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>价格水平</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>库存成本</th>
              {gs.mode === 'core' ? <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>库存占用</th> : null}
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {mats.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 8px' }}>
                  {m.name}
                  {m.isNew ? <span className="tag" style={{ marginLeft: 4, fontSize: '0.75em' }}>新</span> : null}
                </td>
                <td style={{ textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                  {gs.mode === 'core' && m.chosenLot
                    ? `${m.qty} + ${E.plannedPurchaseLine(gs, m.id).qty}`
                    : `${m.qty}/${m.cap}`}
                </td>
                <td style={{ textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                  {m.supply}
                </td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                  <span className={tierClass(m.tierShift)}>{tierName(m.tierShift)}</span>
                </td>
                <td style={{ textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                  {gs.mode === 'core' && m.chosenLot ? (
                    <span className="mono xs">
                      {m.qty > 0 ? (
                        <>
                          {wan(m.avgCost)} →{' '}
                        </>
                      ) : null}
                      <b>{wan(E.plannedMaterialUnitCost(gs, m.id))}</b>
                    </span>
                  ) : m.qty > 0 ? (
                    <span className="mono xs">{wan(m.avgCost)}</span>
                  ) : (
                    <span className="xs faint">无库存</span>
                  )}
                </td>
                {gs.mode === 'core' ? (
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                    {m.qty + (m.chosenLot ? E.plannedPurchaseLine(gs, m.id).qty : 0)}/{m.cap}
                  </td>
                ) : null}
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                  {m.chosenLot ? (
                    gs.mode === 'core' ? (
                      <button
                        className="btn btn-mini"
                        style={{ padding: '2px 8px', fontSize: '0.8em' }}
                        onClick={() => setPickLot(m.id)}
                      >
                        调整
                      </button>
                    ) : <span className="xs faint">已选 {E.lotLabel(m.chosenLot)}</span>
                  ) : (
                    <button
                      className="btn btn-mini"
                      style={{ padding: '2px 8px', fontSize: '0.8em' }}
                      disabled={m.supply <= 0 || gs.lotsUsed >= d.buyLots}
                      onClick={() => setPickLot(m.id)}
                    >
                      采购
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>其他采购手段</h3>
        <div className="title-rule" />
        <div className="stack">
          <button className="btn btn-mini" onClick={() => setTrader(true)}>
            <span className="btn-main">查看贸易商</span>
            <span className="btn-sub">随机品种 · 小批 · 不占档数</span>
          </button>
          <button
            className="btn btn-mini"
            disabled={gs.depts.buy.staff < 3}
            onClick={() => setAgreement(true)}
          >
            <span className="btn-main">签订长期协议</span>
            <span className="btn-sub">
              {gs.depts.buy.staff < 3 ? '需采购 3 人解锁' : '1 AP + 1w'}
            </span>
          </button>
          {urgentOn ? (
            <button className="btn btn-mini" onClick={() => setUrgent(true)}>
              <span className="btn-main">紧急采购</span>
              <span className="btn-sub">卡牌【紧急采购】· 每原料 1 次 · 不占档数</span>
            </button>
          ) : null}
          {clearanceOn ? (
            <button className="btn btn-mini" onClick={() => setClearance(true)}>
              <span className="btn-main">清仓采购</span>
              <span className="btn-sub">卡牌【清仓】· 每原料 1 次 · 不占档数</span>
            </button>
          ) : null}
          {swapOn ? (
            <button className="btn btn-mini" onClick={() => setSwap(true)}>
              <span className="btn-main">原料替换</span>
              <span className="btn-sub">卡牌【原料替换】· 每月 1 次 · 不占档数</span>
            </button>
          ) : null}
        </div>
      </div>

      {gs.agreements.length > 0 ? (
        <div className="card">
          <h3>生效协议</h3>
          <div className="title-rule" />
          <div className="stack-sm">
            {gs.agreements.map((a, i) => {
              const mv = E.materialViews(gs).find((m) => m.id === a.materialId)
              const unit = E.materialPriceAt(a.materialId, a.priceTierShift)
              return (
                <div key={i} className="card">
                  <div className="hstack-between">
                    <span className="sm">
                      {mv?.name ?? a.materialId} · 余 {a.monthsLeft} 月
                    </span>
                    <button className="btn btn-nav" style={{ width: 'auto', padding: '2px var(--s2)' }} onClick={() => g.act((st) => E.cancelAgreement(st, i))}>
                      <span className="xs">终止</span>
                    </button>
                  </div>
                  <Row k="每月自动到货" v={`${a.qty} 件 × ${wan(unit)} = ${wan(a.qty * unit)}（锁定档位价）`} />
                </div>
              )
            })}
          </div>
          <p className="hint">本月协议合计 {wan(presettle.agreementSpend)}，仓容或现金不足时整批跳过。</p>
        </div>
      ) : null}

      {pickLot ? (
        <Sheet title="选择采购档位" sub={mats.find((x) => x.id === pickLot)?.name} onClose={() => setPickLot(null)}>
          <div className="stack">
            {(['small', 'mid', 'large'] as E.LotSize[]).map((lot) => {
              const qty = gs.mode === 'core' ? E.plannedLotQty(gs, pickLot, lot) : E.lotQty(gs, pickLot, lot)
              const price = E.lotPrice(gs, pickLot, lot)
              const total = qty * price
              const chosen = mats.find((x) => x.id === pickLot)?.chosenLot === lot
              const disabled = gs.mode === 'core'
                ? !E.canSetPurchasePlan(gs, pickLot, lot).ok
                : mats.find((x) => x.id === pickLot)?.chosenLot !== null ||
                  qty <= 0 || gs.lotsUsed >= d.buyLots || total > gs.cash
              return (
                <button
                  key={lot}
                  className={`btn btn-mini${chosen ? ' on selected' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    setBuy({ id: pickLot, lot })
                    setPickLot(null)
                  }}
                >
                  <span className="btn-main xs">{E.lotLabel(lot)}</span>
                  <span className="btn-sub xs">{qty} 件 · {wan(price)}/件 = {wan(total)}</span>
                </button>
              )
            })}
            {gs.mode === 'core' && mats.find((x) => x.id === pickLot)?.chosenLot ? (
              <button
                className="btn btn-mini"
                disabled={!E.canSetPurchasePlan(gs, pickLot, null).ok}
                onClick={() => {
                  g.act((st) => E.setPurchasePlan(st, pickLot, null))
                  setPickLot(null)
                }}
              >
                <span className="btn-main xs">不采购</span>
                <span className="btn-sub xs">取消本月采购计划</span>
              </button>
            ) : null}
            {/* 双档采购（K3）：已选档基础上加第二档（小批/中批，+1 档价，不占档数） */}
            {gs.mode === 'core' && d.doubleLotActive && mats.find((x) => x.id === pickLot)?.chosenLot ? (
              <div style={{ marginTop: 'var(--s2)' }}>
                <div className="section-label">双档采购（K3）</div>
                {gs.secondLotMat === pickLot ? (
                  <button className="btn btn-mini" onClick={() => g.act((st) => E.clearSecondLot(st))}>
                    <span className="btn-main xs">第二档：{E.lotLabel(d.doubleLotSize)}（+1 档价）· 点击取消</span>
                  </button>
                ) : (
                  <button className="btn btn-mini" onClick={() => g.act((st) => E.setSecondLot(st, pickLot))}>
                    <span className="btn-main xs">加第二档：{E.lotLabel(d.doubleLotSize)}（+1 档价，不占档数）</span>
                    {gs.secondLotMat ? <span className="btn-sub xs">替换 {mats.find((x) => x.id === gs.secondLotMat)?.name} 的第二档</span> : null}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      {buy ? (
        <BuyConfirmSheet
          g={g}
          data={{ id: buy.id, lot: buy.lot }}
          onClose={() => setBuy(null)}
        />
      ) : null}
      {trader ? <TraderSheet g={g} onClose={() => setTrader(false)} /> : null}
      {urgent ? <UrgentClearanceSheet g={g} mode="urgent" onClose={() => setUrgent(false)} /> : null}
      {clearance ? <UrgentClearanceSheet g={g} mode="clearance" onClose={() => setClearance(false)} /> : null}
      {swap ? <SwapSheet g={g} onClose={() => setSwap(false)} /> : null}
      {agreement ? <AgreementSheet g={g} onClose={() => setAgreement(false)} /> : null}
    </>
  )
}

function BuyConfirmSheet({
  g,
  data,
  onClose,
}: {
  g: Game
  data: { id: string; lot: E.LotSize }
  onClose: () => void
}) {
  const gs = g.s
  const m = E.materialViews(gs).find((x) => x.id === data.id)!
  const qty = gs.mode === 'core' ? E.plannedLotQty(gs, data.id, data.lot) : E.lotQty(gs, data.id, data.lot)
  const price = E.lotPrice(gs, data.id, data.lot)
  const total = qty * price
  const canConfirm = gs.mode === 'core'
    ? E.canSetPurchasePlan(gs, data.id, data.lot).ok
    : qty > 0 && total <= gs.cash
  const clearsPlan = gs.mode === 'core' && E.purchasePlanClearsProduction(gs, data.id, data.lot)
  const [showPriceSrc, setShowPriceSrc] = useState(false)

  return (
    <Sheet
      title={`${m.name} · ${E.lotLabel(data.lot)}`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-nav"
          disabled={!canConfirm}
          onClick={() => {
            g.act((st) => E.buyMaterial(st, data.id, data.lot))
            onClose()
          }}
        >
          <span className="btn-main">
            {qty <= 0 ? '无供给' : !canConfirm ? '无法安排' : gs.mode === 'core' ? '确认采购计划' : '确认采购'}
          </span>
        </button>
      }
    >
      <div className="card">
        <div className="section-label">本次采购</div>
        <Row k="采购量" v={`${qty} 件`} />
                <Row k="单价" v={wan(price) + '/件'} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
          <button onClick={() => setShowPriceSrc(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8em', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0 }}>
            价格拆解 <Icon name="chevron" size={10} />
          </button>
        </div>
        <Row k="总价" v={wan(total)} bold />
        {gs.mode === 'core' ? <Row k="计划后可用现金" v={wan(E.availableCashAfterPurchasePlan(gs) - total + E.plannedPurchaseLine(gs, data.id).cost)} /> : null}
        {clearsPlan ? (
          <div className="info" style={{ marginTop: 'var(--s2)' }}>
            该原料采购量低于原生产需求，确认后生产计划将清空，请重新安排生产。
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="section-label">当前情况</div>
        <Row k="供给" v={`${m.supply} 件`} />
        <Row k="库存" v={`${m.qty}/${m.cap}`} />
        {m.qty > 0 ? (
          <>
            <Row k="账面单价" v={`${wan(m.avgCost)}/件`} />
            <Row k="账面价值" v={wan(m.avgCost * m.qty)} />
          </>
        ) : null}
      </div>

      {showPriceSrc ? (
        <Sheet
          title={`${m.name} ${E.lotLabel(data.lot)} 单价 ${wan(price)}/件`}
          onClose={() => setShowPriceSrc(false)}
        >
          <div className="card">
            <div className="section-label">价格拆解</div>
            <Row k="基础价" v={`${wan(MATERIAL_BY_ID[m.id]?.basePrice ?? m.price)}/件`} />
            {(() => {
              const climateShift = CLIMATE_MATERIAL[gs.climate].tierShift[m.id] ?? 0
              const eventShift = gs.monthMods.allTierShift ?? 0
              const cardShift = E.buyCardShift(gs)
              const staffShift = gs.depts.buy.staff >= 4 ? -1 : 0
              const lotShift = data.lot === 'small' ? 1 : data.lot === 'large' ? -1 : 0
              // 查找事件名称
              const eventNames: string[] = []
              if (eventShift !== 0) {
                for (const ev of EVENTS) {
                  if (ev.mods?.allTierShift === eventShift) {
                    eventNames.push(ev.name)
                  }
                }
              }
              // 查找卡牌名称
              const cardNames: string[] = []
              for (const c of gs.playedThisMonth) {
                const def = CARD_BY_ID[c.defId]
                if (!def || def.kind !== 'buy') continue
                const ctx = E.cardCtx(gs, c.empowered)
                const e = c.empowered && def.strong ? def.strong(ctx) : def.base(ctx)
                if (e.buyTierShift) cardNames.push(`${def.name}(${e.buyTierShift > 0 ? '+' : ''}${e.buyTierShift})`)
              }
              return (
                <>
                  <Row k={`气候修正（${CLIMATE_NAMES[gs.climate]}）`} v={`${climateShift > 0 ? '+' : ''}${climateShift} 档`} />
                  {eventShift !== 0 ? (
                    <div className="row">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="row-key">事件修正</span>
                        {eventNames.length > 0 ? <span className="xs faint">{eventNames.join('、')}</span> : null}
                      </div>
                      <span className="row-val">{eventShift > 0 ? '+' : ''}{eventShift} 档</span>
                    </div>
                  ) : null}
                  {cardShift !== 0 ? (
                    <div className="row">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="row-key">卡牌修正</span>
                        {cardNames.length > 0 ? <span className="xs faint">{cardNames.join('、')}</span> : null}
                      </div>
                      <span className="row-val">{cardShift > 0 ? '+' : ''}{cardShift} 档</span>
                    </div>
                  ) : null}
                  {staffShift !== 0 ? <Row k="采购人数" v={`${staffShift} 档`} /> : null}
                  <Row k="市场基准价" v={`${wan(m.price)}/件`} />
                  <Row k="批量修正" v={`${lotShift > 0 ? '+' : ''}${lotShift} 档`} />
                  <Row k="最终单价" v={`${wan(price)}/件`} bold />
                </>
              )
            })()}
          </div>
        </Sheet>
      ) : null}

      {m.isNew ? (
        <div className="card">
          <div className="section-label">供应商开发</div>
          <Row k="已开发" v={`${m.developed}/6`} />
          <div style={{ marginTop: 'var(--s3)' }}>
            <button
              className="btn btn-mini"
              disabled={m.developed >= 6 || gs.ap < 1 || gs.cash < 30}
              onClick={() => g.act((st) => E.developSupplier(st, data.id))}
            >
              <span className="btn-main">开发供应商</span>
              <span className="btn-sub">1 AP + 3w · 供给 +2</span>
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  )
}

function TraderSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const offers = E.traderOffer(gs)
  const quota = E.traderQuota(gs)
  return (
    <Sheet title="贸易商" sub="小批 · 价格更高 · 不占本月档数" onClose={onClose}>
      {quota > 1 ? (
        <p className="muted sm" style={{ marginBottom: 'var(--s2)' }}>
          卡牌【贸易商】生效中：每品种额外 {quota - 1} 次购买机会
        </p>
      ) : null}
      <div className="stack">
        {offers.map((o) => {
          const used = gs.extraBuys.filter((e) => e.kind === 'trader' && e.materialId === o.materialId).length
          const soldOut = used >= quota
          const total = o.qty * o.price
          return (
            <div key={o.materialId} className="card">
              <Row k={E.materialViews(gs).find((m) => m.id === o.materialId)?.name ?? o.materialId} v={`${o.qty} 件`} />
              <Row k="单价" v={`${wan(o.price)}/件`} />
              <Row k="合计" v={wan(total)} />
              <div style={{ marginTop: 'var(--s3)' }}>
                <button
                  className="btn btn-mini"
                  disabled={soldOut || total > gs.cash || o.qty <= 0}
                  onClick={() => g.act((st) => E.buyFromTrader(st, o.materialId, o.qty, o.price))}
                >
                  <span className="btn-main">{soldOut ? '本月已购' : '购买'}</span>
                </button>
              </div>
            </div>
          )
        })}
        {offers.length === 0 ? <p className="muted sm">本月没有贸易商上门。</p> : null}
      </div>
    </Sheet>
  )
}

/** C6 紧急采购 / C10 清仓：每类原料 1 次、不占档数的额外购买机会。 */
function UrgentClearanceSheet({ g, mode, onClose }: { g: Game; mode: 'urgent' | 'clearance'; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const mats = E.materialViews(gs)
  const mid = gs.monthFlags.includes(mode === 'urgent' ? 'urgentMid' : 'clearanceMid')
  const shift = mode === 'urgent' ? (mid ? 1 : 2) : -2
  const label = mode === 'urgent' ? '紧急采购' : '清仓采购'
  const cardName = mode === 'urgent' ? '紧急采购' : '清仓'
  return (
    <Sheet title={label} sub={`卡牌【${cardName}】· ${mid ? '中批' : '小批'} · 不占档数`} onClose={onClose}>
      <div className="stack">
        {mats.filter((m) => m.supply > 0).map((m) => {
          const used = gs.extraBuys.filter((e) => e.kind === mode && e.materialId === m.id).length
          const soldOut = used >= 1
          const qty = E.lotQty(gs, m.id, mid ? 'mid' : 'small')
          const unit = E.materialPriceAt(m.id, (d.materials[m.id]?.tierShift ?? 0) + shift)
          const total = qty * unit
          return (
            <div key={m.id} className="card">
              <Row k={m.name} v={`${qty} 件 · ${wan(unit)}/件`} />
              <Row k="合计" v={wan(total)} />
              <div style={{ marginTop: 'var(--s3)' }}>
                <button
                  className="btn btn-mini"
                  disabled={soldOut || total > gs.cash || qty <= 0}
                  onClick={() => {
                    const r = g.act((st) => (mode === 'urgent' ? E.urgentBuy(st, m.id) : E.clearanceBuy(st, m.id)))
                    if (!r.ok) g.setToast(r.msg)
                  }}
                >
                  <span className="btn-main">{soldOut ? '本月已用' : total > gs.cash ? '现金不足' : '购买'}</span>
                </button>
              </div>
            </div>
          )
        })}
        {mats.filter((m) => m.supply > 0).length === 0 ? <p className="muted sm">本月没有可供原料。</p> : null}
      </div>
    </Sheet>
  )
}

/** C7 原料替换：出售 5 单位（账面价）→ 购入 5/7 单位（当前价），每月 1 次。 */
function SwapSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const mats = E.materialViews(gs)
  const plus = gs.monthFlags.includes('swapPlus')
  const used = gs.extraBuys.some((e) => e.kind === 'swap')
  const [sellId, setSellId] = useState<string>('')
  const [buyId, setBuyId] = useState<string>('')
  const sell = mats.find((m) => m.id === sellId)
  const buy = mats.find((m) => m.id === buyId)
  const sellState = sellId ? gs.materials[sellId] : undefined
  const sellQty = sell ? Math.min(5, sell.qty) : 0
  const buyQty = buy ? Math.min(plus ? 7 : 5, d.materials[buy.id]?.supply ?? 0) : 0
  const sellUnit = sellState && sellState.qty > 0 ? sellState.value / sellState.qty : 0
  const buyUnit = buy ? E.materialPriceAt(buy.id, (d.materials[buy.id]?.tierShift ?? 0)) : 0
  const sellTotal = sellUnit * sellQty
  const buyTotal = buyUnit * buyQty
  const valid = !used && sell && buy && sell.id !== buy.id && sellQty > 0 && buyQty > 0 && gs.cash + sellTotal >= buyTotal
  return (
    <Sheet title="原料替换" sub={`卡牌【原料替换】· 每月 1 次 · 不占档数`} onClose={onClose}>
      {used ? <p className="muted sm">本月已使用。</p> : null}
      <div className="section-label">出售（按账面单价）</div>
      <div className="stack-sm">
        {mats.filter((m) => m.qty > 0).map((m) => (
          <button key={m.id} className={`btn btn-mini${sellId === m.id ? ' on selected' : ''}`}
            disabled={m.id === buyId}
            onClick={() => setSellId(m.id)}>
            <span className="btn-main xs">{m.name}</span>
            <span className="btn-sub xs">库存 {m.qty} · 账面 {wan(m.avgCost)}/件 · 售 {Math.min(5, m.qty)} 件</span>
          </button>
        ))}
        {mats.filter((m) => m.qty > 0).length === 0 ? <p className="muted sm">无库存原料可出售。</p> : null}
      </div>
      <div className="section-label" style={{ marginTop: 'var(--s3)' }}>购入（按当前档位价）</div>
      <div className="stack-sm">
        {mats.filter((m) => (d.materials[m.id]?.supply ?? 0) > 0).map((m) => (
          <button key={m.id} className={`btn btn-mini${buyId === m.id ? ' on selected' : ''}`}
            disabled={m.id === sellId}
            onClick={() => setBuyId(m.id)}>
            <span className="btn-main xs">{m.name}</span>
            <span className="btn-sub xs">供 {d.materials[m.id]?.supply ?? 0} · 入 {Math.min(plus ? 7 : 5, d.materials[m.id]?.supply ?? 0)} 件 · {wan(E.materialPriceAt(m.id, (d.materials[m.id]?.tierShift ?? 0)))}/件</span>
          </button>
        ))}
        {mats.filter((m) => (d.materials[m.id]?.supply ?? 0) > 0).length === 0 ? <p className="muted sm">本月无可供原料。</p> : null}
      </div>
      <div className="card" style={{ marginTop: 'var(--s3)' }}>
        <Row k="出售所得" v={sell ? wan(sellTotal) : '—'} />
        <Row k="购入支出" v={buy ? wan(buyTotal) : '—'} />
        <Row k="现金净额" cls={(sellTotal - buyTotal) >= 0 ? 'green' : 'red'} v={sell && buy ? wan(sellTotal - buyTotal) : '—'} />
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        <button className="btn btn-primary" disabled={!valid}
          onClick={() => {
            const r = g.act((st) => E.swapMaterials(st, sellId, buyId))
            if (!r.ok) g.setToast(r.msg)
            else onClose()
          }}>
          <span className="btn-main">确认替换</span>
          <span className="btn-sub">出售 {sellQty} 件 · 购入 {buyQty} 件</span>
        </button>
      </div>
    </Sheet>
  )
}

function AgreementSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const mats = E.materialViews(gs).filter((m) => m.supply > 0)
  const slots = E.agreementSlots(gs)
  const months = gs.depts.buy.staff >= 5 ? 6 : 3

  return (
    <Sheet
      title="签订长期协议"
      sub={`协议 ${gs.agreements.length}/${slots} · 锁定期 ${months} 个月`}
      onClose={onClose}
    >
      {gs.agreements.length ? (
        <div className="card">
          <div className="section-label">已生效</div>
          {gs.agreements.map((a, i) => (
            <div key={i} className="hstack-between" style={{ padding: 'var(--s1) 0' }}>
              <span className="sm">
                {E.materialViews(gs).find((m) => m.id === a.materialId)?.name} · 余 {a.monthsLeft} 个月
              </span>
              <button className="btn btn-nav" style={{ width: 'auto', padding: '2px var(--s2)' }} onClick={() => g.act((st) => E.cancelAgreement(st, i))}>
                <span className="xs">终止</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="section-label">可选原料</div>
      <div className="stack">
        {mats.map((m) => {
          const qty = E.lotQty(gs, m.id, 'mid')
          const price = E.lotPrice(gs, m.id, 'mid')
          const disabled = gs.agreements.length >= slots || gs.ap < 1 || gs.cash < 10 || gs.agreements.some((a) => a.materialId === m.id)
          return (
            <div key={m.id} className="card">
              <Row k={m.name} v={`每月 ${qty} 件`} />
              <Row k="当前单价" v={wan(price)} cls={tierClass(m.tierShift)} />
              <Row k="锁定档位" v={tierName(m.tierShift)} />
              <div style={{ marginTop: 'var(--s3)' }}>
                <button
                  className="btn btn-mini"
                  disabled={disabled}
                  onClick={() => g.act((st) => E.signAgreement(st, m.id, months))}
                >
                  <span className="btn-main">
                    {gs.agreements.some((a) => a.materialId === m.id) ? '已签订' : '签订'}
                  </span>
                  <span className="btn-sub">1 AP + 1w</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

/* ══════════════ 生产部 ══════════════ */

function MakePage({ g }: { g: Game }) {
  const gs = g.s
  const cap = E.planCapacity(gs)
  /** 各层 BOM 可产上限（受产能 + 原料双重限制），分配与看板共用。 */
  const maxBy = E.maxProducibleByTier(gs)
  const plannedTotal = E.plannedTotal(gs)
  const remainingCap = Math.max(0, cap - plannedTotal)
  const ucost = E.productionUnitCosts(gs)
  const makeD = E.derive(gs)
  const otCostBase = overtimeCostOf(makeD.salaryPer.make, gs.depts.make.staff)
  const otCost = makeD.overtimeHalf ? Math.round(otCostBase / 2) : otCostBase // 加班补贴（K8 本月 / D7 长期）
  const otGain = overtimeGainOf(gs.depts.make.staff, makeD.equipmentCapBonus + E.plannedEquipmentCap(gs)) * (makeD.overtimeGainPlus ? 2 : 1)
  const [equip, setEquip] = useState(false)
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <LedgerSection g={g} dept="make" />

      {/* 产能分配：与销售资源分配面板同款，已分配产能可在已解锁产品线间自由腾挪 */}
      <div className="card">
        <h3>产能分配</h3>
        <div className="title-rule" />
        <div className="grid-3" style={{ marginBottom: 'var(--s3)' }}>
          <div>
            <div className="stat-label">本月产能</div>
            <div className="stat-value">{cap}</div>
          </div>
          <div>
            <div className="stat-label">已安排</div>
            <div className="stat-value">{plannedTotal}</div>
          </div>
          <div>
            <div className="stat-label">剩余</div>
            <div className="stat-value gold">{remainingCap}</div>
          </div>
        </div>
        <div className="stack-sm">
          {/* 未解锁的产品线先不出现，解锁一个出一个 */}
          {TIER_ORDER.filter((t) => gs.products[t].built).map((t) => {
            const max = maxBy[t]
            const qty = gs.plan.quantities[t]
            const plusDisabled = qty >= max
            const minusDisabled = qty <= 0
            return (
              <div key={t} className="hstack-between">
                <span className="sm">
                  {TIER_LABEL[t]}
                  <span className="faint xs"> · 可产 {max}</span>
                </span>
                <span className="hstack" style={{ gap: 'var(--s2)' }}>
                  <button
                    className="btn btn-nav"
                    style={{ width: 'auto', padding: '2px var(--s3)', opacity: minusDisabled ? 0.4 : 1 }}
                    disabled={minusDisabled}
                    onClick={() => g.mutate((st) => E.setPlan(st, t, Math.max(0, st.plan.quantities[t] - 1)))}
                  >
                    <span>−</span>
                  </button>
                  <span className="mono gold" style={{ minWidth: 28, textAlign: 'center' }}>
                    {qty}
                  </span>
                  <button
                    className="btn btn-nav"
                    style={{ width: 'auto', padding: '2px var(--s3)', opacity: plusDisabled ? 0.4 : 1 }}
                    disabled={plusDisabled}
                    onClick={() =>
                      g.mutate((st) =>
                        E.setPlan(st, t, clamp(st.plan.quantities[t] + 1, 0, E.maxProducible(st, t))),
                      )
                    }
                  >
                    <span>+</span>
                  </button>
                  <button
                    className="btn btn-mini"
                    style={{ width: 'auto', opacity: qty >= max ? 0.4 : 1 }}
                    disabled={qty >= max}
                    onClick={() => g.mutate((st) => E.setPlan(st, t, E.maxProducible(st, t)))}
                  >
                    <span className="btn-main xs">拉满</span>
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <div className="hint">
          {remainingCap} 点未分配。
        </div>
        {gs.mode === 'full' ? <div style={{ marginTop: 'var(--s3)' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={plannedTotal <= 0}
            onClick={() => setConfirm(true)}
          >
            <span className="btn-main">确认生产安排</span>
            <span className="btn-sub">{plannedTotal > 0 ? `共 ${plannedTotal} 件，于结算时统一入库` : '先分配产量'}</span>
          </button>
        </div> : null}
      </div>

      {/* 生产单位成本（统一口径）：材料按采购计划后库存单价，固定成本按排产量分摊；销售页单件毛利与预算页预计毛利共用此数值 */}
      <div className="card">
        <h3>生产单位成本</h3>
        <div className="title-rule" />
        {TIER_ORDER.filter((t) => gs.products[t].built).map((t) => {
          const c = ucost.tiers[t]
          return (
            <Row
              key={t}
              k={
                <>
                  {BOMS[t].name}
                  <span className="faint xs"> · {TIER_LABEL[t]}</span>
                </>
              }
              v={`${wan(c.total)}/件（材料 ${wan(c.material)} + 固定分摊 ${wan(c.fixed)}）`}
            />
          )
        })}
      </div>

      <div className="card">
        <h3>产能补充</h3>
        <div className="title-rule" />
        <div className="stack">
          <button
            className="btn btn-mini"
            disabled={gs.depts.make.staff < 3 || gs.plan.overtime}
            onClick={() => g.act((st) => E.toggleOvertime(st))}
          >
            <span className="btn-main">{gs.plan.overtime ? '本月已安排加班' : '安排加班'}</span>
            <span className="btn-sub">
              {gs.depts.make.staff < 3 ? '需生产 3 人解锁' : gs.plan.overtime
                ? `已付 ${wan(gs.overtimePaid)}（${makeD.overtimeHalf ? '加班补贴减半后' : '2× 生产工资'}，选定后不可取消、费用不退）· 本月产能 +${otGain}${makeD.overtimeGainPlus ? '（加班补贴强化）' : ''}`
                : `发生支付 ${wan(otCost)}（${makeD.overtimeHalf ? '加班补贴（K8/D7）减半后' : '2× 生产工资'}）· 本月产能 +${otGain}${makeD.overtimeHalf ? '（K8 加班补贴）' : ''}`}
            </span>
          </button>
          <button className="btn btn-mini" onClick={() => setEquip(true)}>
            <span className="btn-main">{gs.mode === 'core' ? '生产设备购置计划' : '生产设备购置'}</span>
            <span className="btn-sub">{gs.mode === 'core' ? '预留现金 · 结算时统一购置，当月产能与折旧生效' : '立即付款购置 · 当月产能与折旧生效'} · 每名生产人员产能 +{EQUIP_CAP_PER_WORKER}</span>
          </button>
        </div>
      </div>

      {gs.equipment.length ? (
        <div className="card">
          <h3>设备清单</h3>
          <div className="title-rule" />
          {gs.equipment.map((e) => (
            <Row
              key={e.id}
              k={
                <>
                  {e.name} <span className="faint xs">每人 +{e.cap}</span>
                </>
              }
              v={`净 ${wan(Math.max(0, e.cost - e.accumulated))} / 原值 ${wan(e.cost)}`}
            />
          ))}
        </div>
      ) : null}

      {/* 确认生产安排：按 BOM 立即扣料入库，「原料→存货」记账到部门账务（仅完整模式） */}
      {gs.mode === 'full' && confirm ? <ProductionConfirmSheet g={g} planned={plannedTotal} onDone={() => setConfirm(false)} /> : null}
      {/* 生产设备购置：弹窗选档（同采购选档样式），选定即购 */}
      {equip ? <EquipmentPickSheet g={g} onClose={() => setEquip(false)} /> : null}
    </>
  )
}

/** 确认生产安排弹窗：列出将入库的各线产量与原料消耗，确认后扣料入库。 */
function ProductionConfirmSheet({ g, planned, onDone }: { g: Game; planned: number; onDone: () => void }) {
  const gs = g.s
  const lines = TIER_ORDER
    .map((t) => ({ t, qty: gs.plan.quantities[t], max: gs.plan.quantities[t] + E.maxProducible(gs, t) }))
    .filter((l) => l.qty > 0)
  const willBonus = gs.depts.make.staff >= 5
  const confirm = () => {
    const r = g.act((st) => E.confirmProduction(st))
    if (r.ok) {
      g.setToast(r.msg ?? '生产完成')
      onDone()
    }
  }
  return (
    <Sheet
      title="确认生产安排"
      sub={planned > 0 ? `共 ${planned} 件，确认后立即按 BOM 扣料入库` : null}
      onClose={onDone}
      footer={
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={confirm}>
          <span className="btn-main">确认生产入库</span>
          <span className="btn-sub">原料出库、成品入库，记账到生产账务</span>
        </button>
      }
    >
      <div className="card">
        <div className="section-label">生产安排</div>
        {lines.map(({ t, qty, max }) => (
          <Row
            key={t}
            k={TIER_LABEL[t]}
            v={`${qty} 件${qty > max ? `（原料仅够 ${max}，多出的 ${qty - max} 件留到下月）` : ''}`}
            cls={qty > max ? 'red' : ''}
          />
        ))}
        {lines.length === 0 ? <Row k="安排" v="未分配产量" cls="red" /> : null}
        {willBonus ? <Row k="流水线" v="每 5 件额外入库 1 件（生产 5 人）" /> : null}
      </div>
    </Sheet>
  )
}

/** 生产设备购置弹窗：设备商店三档选项（同「选择采购档位」选单样式），选定即购，现金不足不可选。 */
/** 生产设备购置弹窗：先展示当前持有设备，再给出购买选项（同「选择采购档位」选单样式），选定即购。 */
function EquipmentPickSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  // 持有设备按名称合并（同名多台只列一行）
  const owned = new Map<string, { count: number; net: number; cost: number }>()
  for (const e of gs.equipment) {
    const cur = owned.get(e.name) ?? { count: 0, net: 0, cost: 0 }
    cur.count += 1
    cur.net += Math.max(0, e.cost - e.accumulated)
    cur.cost += e.cost
    owned.set(e.name, cur)
  }
  const core = gs.mode === 'core'
  const applyStep = (modelId: string, count: number) => {
    const r = g.act((st) => E.setPlanEquipment(st, modelId, count))
    if (!r.ok) g.setToast(r.msg)
  }
  return (
    <Sheet
      title="生产设备购置"
      sub={core
        ? '计划预留现金，结算时统一购置：当月产能与折旧生效，借款额度自购置当月起算'
        : '立即付款购置：当月产能与折旧生效，借款额度即时生效'}
      onClose={onClose}
    >
      <div className="card">
        <div className="section-label">当前设备</div>
        {gs.equipment.length === 0 ? (
          <p className="muted sm">暂未持有设备：购置后每名生产人员产能 +{EQUIP_CAP_PER_WORKER}（标准设备）。</p>
        ) : (
          <>
            <div className="stack-sm">
              {[...owned.entries()].map(([name, o]) => (
                <Row key={name} k={`${name} × ${o.count}`} v={`净 ${wan(o.net)} / 原值 ${wan(o.cost)}`} />
              ))}
            </div>
            <Row
              k="合计"
              v={`${gs.equipment.length} 台 · 每名生产人员产能 +${d.equipmentCapBonus}`}
              bold
            />
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--s3)' }}>
        <div className="section-label">{core ? '本月购置计划' : '购买设备'}</div>
        <div className="stack">
          {EQUIPMENT_SHOP.map((e) => {
            const planned = gs.plan.equipment.filter((id) => id === e.id).length
            const stepOk = (n: number) => E.canSetPlanEquipment(gs, e.id, n).ok
            if (core) {
              return (
                <div key={e.id} className="card-item">
                  <span className="spine" />
                  <span className="card-body">
                    <span className="card-name">{e.name} · {wan(e.price)}/台</span>
                    <span className="card-desc">{e.desc}</span>
                    <span className="card-desc">
                      计划 {planned} 台 × 生产 {gs.depts.make.staff} 人：本月产能 +{planned * e.cap * gs.depts.make.staff}
                      {planned > 0 ? ` · 预留现金 ${wan(planned * e.price)}` : ''}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 'var(--s1)', alignItems: 'center' }}>
                    <button className="btn btn-mini" style={{ width: 'auto' }} disabled={planned <= 0 || !stepOk(planned - 1)} onClick={() => applyStep(e.id, planned - 1)}>−</button>
                    <span className="mono xs" style={{ minWidth: 20, textAlign: 'center' }}>{planned}</span>
                    <button className="btn btn-mini" style={{ width: 'auto' }} disabled={!stepOk(planned + 1)} onClick={() => applyStep(e.id, planned + 1)}>＋</button>
                  </span>
                </div>
              )
            }
            return (
              <button
                key={e.id}
                className="btn btn-mini"
                disabled={gs.cash < e.price}
                onClick={() => {
                  const r = g.act((st) => E.buyEquipment(st, e.id))
                  if (r.ok) {
                    g.setToast(`已购置 ${e.name}`)
                    onClose()
                  }
                }}
              >
                <span className="btn-main xs">{e.name} · {wan(e.price)}</span>
                <span className="btn-sub xs">
                  产能 +{e.cap}/人（× 生产人数） · 月折旧 {wan(e.depreciation)} · 借款额度 +{wan(e.creditLine)}
                  {gs.cash < e.price ? ' · 现金不足' : ''}
                </span>
              </button>
            )
          })}
          {core ? (
            <p className="muted sm" style={{ margin: 0 }}>
              计划设备在「结算」时统一付款入库（与采购计划同批执行），结算前可自由增减；预留现金在 HUD「期末资金」桥接中可见。
            </p>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}

/* ══════════════ 销售部 ══════════════ */

/* 市场需求表的一行（类型 / 需求数 / 上限 / 市价 / 单件毛利 / 可用库存），与六列网格对齐 */
function TierRowCells({
  t, p,
  push = 0, over = 0, demand, demandBase, cap, price, avail,
  orderTaken = 0, grossProfit = 0,
}: {
  t: Tier
  p: { built: boolean; qty: number }
  push?: number
  over?: number
  demand: number
  demandBase: number
  cap: number
  price: number
  avail: number
  orderTaken?: number
  grossProfit?: number
}) {
  return (
    <>
      <span className="sm">
        <b>{TIER_LABEL[t]}</b>
        {!p.built ? <span className="faint xs"> · 未解锁</span> : null}
      </span>
      <span className={`mono sm${push > 0 ? ' gold' : ''}`}>
        {demand}
        {over > 0 ? <span className="faint" style={{ color: 'var(--red, #c0392b)' }}> · 超 {over}</span> : null}
      </span>
      <span className="mono xs faint">{demandBase + cap}</span>
      <span className="mono xs">{wan(price)}</span>
      <span className={`mono xs${grossProfit < 0 ? ' bad' : grossProfit > 0 ? ' gold' : ''}`}>{wan(grossProfit)}</span>
      <span>
        <span className="mono sm">{avail}</span>
        {orderTaken > 0 ? <span className="faint xs">（总 {p.qty}）</span> : null}
      </span>
    </>
  )
}

/* 订单需求表的一行（类型 / 需求数 / 来源 / 订单价 / 单件毛利 / 状态） */
function TierOrderRow({
  t, p, qty, price, grossProfit, from, forced, isAccepted, isDeclined, canAccept, onToggle, onShortClick,
}: {
  t: Tier
  p: { built: boolean; qty: number }
  qty: number
  price: number
  grossProfit: number
  from?: string
  forced?: boolean
  isAccepted?: boolean
  isDeclined?: boolean
  canAccept?: boolean
  onToggle?: () => void
  onShortClick?: () => void
}) {
  return (
    <>
      <span className="sm">
        <b>{TIER_LABEL[t]}</b>
        {!p.built ? <span className="faint xs"> · 未解锁</span> : null}
      </span>
      <span className={`mono sm${forced ? '' : isAccepted ? ' gold' : ''}`}>
        {qty} 件
      </span>
      <span className="xs faint">{from}</span>
      <span className="mono xs">{wan(price)}</span>
      <span className={`mono xs${grossProfit < 0 ? ' bad' : grossProfit > 0 ? ' gold' : ''}`}>{wan(grossProfit)}</span>
      {forced ? (
        <span className="xs faint">强制必交</span>
      ) : isAccepted ? (
        <button
          className="btn btn-nav"
          style={{ width: 'auto', padding: '2px var(--s3)', fontSize: 'var(--fs-xs)', opacity: 0.6 }}
          onClick={onToggle}
        >
          已接（点取消）
        </button>
      ) : isDeclined ? (
        <button
          className="btn btn-nav"
          style={{ width: 'auto', padding: '2px var(--s3)', fontSize: 'var(--fs-xs)', opacity: 0.6 }}
          disabled={!canAccept}
          onClick={canAccept ? onToggle : onShortClick}
        >
          已放弃（点接）
        </button>
      ) : canAccept ? (
        <button
          className="btn btn-nav"
          style={{ width: 'auto', padding: '2px var(--s3)', fontSize: 'var(--fs-xs)' }}
          onClick={onToggle}
        >
          接单
        </button>
      ) : (
        <button
          className="btn btn-nav"
          style={{ width: 'auto', padding: '2px var(--s3)', fontSize: 'var(--fs-xs)', opacity: 0.4 }}
          onClick={onShortClick}
        >
          接单
        </button>
      )}
    </>
  )
}

function SellPage({ g }: { g: Game }) {
  const gs = g.s
  const d = E.derive(gs)
  const unitCosts = E.productionUnitCosts(gs)
  /** 预估单件毛利（统一口径）= 单价 − 生产单位成本（计划后库存材料成本 + 固定成本分摊）；与预算页同口径、同数值（不取整），市价与订单价按单件同口径对比。 */
  const estimatedGrossProfit = (tier: Tier, price: number) => price - unitCosts.tiers[tier].total
  const used = E.allocUsed(gs)
  /** 各层强制订单量（事件/卡牌产生，必交）。 */
  const forcedQtyBy: Record<string, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const o of gs.orders) {
    if (o.forced) forcedQtyBy[o.tier] += o.qty
  }
  /** 已接自然订单量（玩家点接单后锁定）。 */
  const acceptedQtyBy: Record<string, number> = { low: 0, mid: 0, high: 0, special: 0 }
  for (const o of gs.orders) {
    if (!o.forced && gs.acceptedOrders.includes(o.id)) acceptedQtyBy[o.tier] += o.qty
  }

  return (
    <>
      <LedgerSection g={g} dept="sell" />

      {/*
        需求与售价面板放在加点面板之前：玩家下方加点时，
        本页「需求 A + B = C」的数字随 derive 实时变化。
      */}
      <div className="card">
        <h3>本月需求与售价</h3>
        <div className="title-rule" />
        {/* 规则卡（K5 快周转 / K1 定价权）生效提示 */}
        {d.spotUnlimited || d.spotPriceActive ? (
          <div className="info" style={{ marginBottom: 'var(--s2)' }}>
            {d.spotUnlimited ? (
              <div className="xs">快周转（K5）：本月现货不受需求限制（全部库存可售）{d.spotUnlimitedPlus ? '，低端需求 +2' : '，售价 −1 档'}。</div>
            ) : null}
            {d.spotPriceActive ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: d.spotUnlimited ? 'var(--s2)' : 0 }} className="hstack">
                <span className="xs">定价权（K1）：现货档位</span>
                {([0, 1, 2] as const).map((n) => (
                  <button
                    key={n}
                    className={`btn btn-mini${(gs.spotPriceChoice ?? 0) === n ? ' on' : ''}`}
                    style={{ width: 'auto' }}
                    onClick={() => g.act((st) => E.setSpotPrice(st, n))}
                  >
                    <span className="btn-main xs">{['基准', '高', '极高'][n]}</span>
                  </button>
                ))}
                {(gs.spotPriceChoice ?? 0) > 0 ? (
                  <span className="xs faint">各层需求 −{Math.ceil((gs.spotPriceChoice ?? 0) * (d.spotPriceNoPenalty ? 0.5 : 1))}（强化版减半）</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {/* 市场需求表：六列（类型 / 需求数 / 上限 / 市价 / 单件毛利 / 可承诺量），库存已扣除订单占用量，列宽与下方订单表对齐 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) 1fr 0.9fr 1fr 1.2fr 1fr', columnGap: 'var(--s4)', rowGap: 'var(--s2)', alignItems: 'center' }}>
          <span className="xs" style={{ color: 'var(--gold)' }}>市场需求</span>
          <span className="xs faint">需求数</span>
          <span className="xs faint">上限</span>
          <span className="xs faint">市价</span>
          <span className="xs faint">单件毛利</span>
          <span className="xs faint">{gs.mode === 'core' ? '可承诺量' : '可用库存'}</span>
          {TIER_ORDER.map((t) => {
            const p = gs.products[t]
            const cost = d.salesPushCost[t]
            const cap = d.salesPushCap[t]
            const push = d.salesPush[t]
            const over = Math.max(0, gs.salesAlloc[t] - cap * cost)
            const orderTaken = forcedQtyBy[t] + acceptedQtyBy[t]
            const avail = Math.max(0, E.committableProductQty(gs, t) - orderTaken)
            return (
              <TierRowCells
                key={t}
                t={t}
                p={p}
                push={push}
                over={over}
                demand={d.demand[t]}
                demandBase={d.demandBase[t]}
                cap={cap}
                price={E.priceAtProduct(t, d.spotShift[t])}
                grossProfit={estimatedGrossProfit(t, E.priceAtProduct(t, d.spotShift[t]))}
                avail={avail}
                orderTaken={orderTaken}
              />
            )
          })}
        </div>

        {/* 订单需求表：六列（类型 / 需求数 / 来源 / 订单价 / 单件毛利 / 状态），列宽与上方对齐 */}
        <div className="title-rule" />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) 1fr 0.9fr 1fr 1.2fr 1fr', columnGap: 'var(--s4)', rowGap: 'var(--s2)', alignItems: 'center' }}>
          <span className="xs" style={{ color: 'var(--gold)' }}>订单需求</span>
          <span className="xs faint">需求数</span>
          <span className="xs faint">来源</span>
          <span className="xs faint">订单价</span>
          <span className="xs faint">单件毛利</span>
          <span className="xs faint">状态</span>
          {gs.orders.map((o) => {
            const orderPrice = E.priceAtProduct(o.tier, o.priceShift + d.priceShift[o.tier] + d.orderPriceBonus)
            const isAccepted = gs.acceptedOrders.includes(o.id)
            const isDeclined = gs.declinedOrders.includes(o.id)
            const canAccept = E.canAcceptOrder(gs, o.id)
            return (
              <TierOrderRow
                key={o.id}
                t={o.tier}
                p={gs.products[o.tier]}
                qty={o.qty}
                price={orderPrice}
                grossProfit={estimatedGrossProfit(o.tier, orderPrice)}
                from={o.flex ? `${o.from} · 灵活交付缺口罚 ${Math.round(d.flexPenaltyRate * 100)}%` : o.from}
                forced={o.forced}
                isAccepted={isAccepted}
                isDeclined={isDeclined}
                canAccept={canAccept}
                onToggle={() => g.mutate((st) => E.toggleOrder(st, o.id))}
                onShortClick={() => g.setToast(gs.mode === 'core' ? '可承诺产品不足，请先增加该产品排产' : '库存不足，先生产再接单')}
              />
            )
          })}
        </div>
      </div>

      <div className="card">
        <h3>销售资源分配</h3>
        <div className="title-rule" />
        <div className="stack-sm">
          {/* 未解锁的产品线没有分配必要，解锁一个出一个 */}
          {TIER_ORDER.filter((t) => gs.products[t].built).map((t) => {
            const cost = d.salesPushCost[t]
            const cap = d.salesPushCap[t]
            const remaining = d.salesResource - used
            const alloc = gs.salesAlloc[t]
            const units = Math.floor(alloc / cost)
            const plusDisabled = remaining < cost || units >= cap
            const minusDisabled = alloc <= 0
            return (
              <div key={t} className="hstack-between">
                <span className="sm">
                  {TIER_LABEL[t]}
                  <span className="faint xs"> · {cost} 点/需求</span>
                </span>
                <span className="hstack" style={{ gap: 'var(--s2)' }}>
                  <button
                    className="btn btn-nav"
                    style={{ width: 'auto', padding: '2px var(--s3)', opacity: minusDisabled ? 0.4 : 1 }}
                    disabled={minusDisabled}
                    onClick={() => g.mutate((st) => E.setAlloc(st, t, st.salesAlloc[t] - cost))}
                  >
                    <span>−</span>
                  </button>
                  <span className="mono gold" style={{ minWidth: 28, textAlign: 'center' }}>
                    {alloc}
                  </span>
                  <button
                    className="btn btn-nav"
                    style={{ width: 'auto', padding: '2px var(--s3)', opacity: plusDisabled ? 0.4 : 1 }}
                    disabled={plusDisabled}
                    onClick={() => g.mutate((st) => E.setAlloc(st, t, st.salesAlloc[t] + cost))}
                  >
                    <span>+</span>
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <div className="hint">
          剩余可分配 {Math.max(0, d.salesResource - used)} 点
        </div>
      </div>

      {gs.orders.length ? (
        <div className="hint" style={{ padding: 'var(--s2) 0' }}>
          订单来源：{gs.orders.map((o) => o.from).filter((v, i, a) => a.indexOf(v) === i).join('、')}
        </div>
      ) : null}
    </>
  )
}

/* ══════════════ 研发部 ══════════════ */

function RndPage({ g }: { g: Game }) {
  const gs = g.s
  const d = E.derive(gs)
  const staff = gs.depts.rnd.staff
  const assigned = E.rndAssignedTotal(gs)
  const slots = E.ipSlots(gs)
  const [ips, setIps] = useState(false)
  const [theme, setTheme] = useState<'prod' | 'ip' | null>(null)

  const themeStats = (kind: E.ResearchKind) => {
    const list = E.RND_PROJECTS.filter((p) => p.kind === kind)
    // 逐层揭示：前置未解锁的阶段 2/3 节点不算可见总数（BOM 无前置，恒 3）
    const visible = list.filter((p) => !p.preq || !!gs.rnd[p.preq]?.done)
    const active = visible.filter((p) => { const s = gs.rnd[p.id]; return !!s?.projectId && !s.done && s.assigned > 0 }).length
    return { active, total: visible.length }
  }
  const bom = themeStats('bom')
  const ip = themeStats('ip')

  const free = Math.max(0, staff - assigned)
  /** 知产展示：永久（ipOwned）+ 季度限时（R4 强化研发 ≥5，quarterIps，季度切换清零）+ 月度限时（卡牌/事件奖励，tempIps，月初清零） */
  const quarterIpIds = gs.quarterIps
  const monthTempIps = E.activeIps(gs).filter((id) => !gs.ipOwned.includes(id) && !quarterIpIds.includes(id))
  const ipRows = [...gs.ipOwned, ...quarterIpIds, ...monthTempIps]

  return (
    <>
      <div className="card">
        <div className="grid-3" style={{ marginBottom: 'var(--s2)' }}>
          <div>
            <div className="stat-label">研发人员</div>
            <div className="stat-value">{staff}<span className="faint">/5</span></div>
          </div>
          <div>
            <div className="stat-label">已放置</div>
            <div className="stat-value">{assigned}</div>
          </div>
          <div>
            <div className="stat-label">本月研发费用</div>
            <div className={`stat-value${d.rndActiveCount > 0 ? ' gold' : ''}`}>{wan(d.rndActiveCount * d.rndCost)}</div>
          </div>
        </div>
        {d.rndActiveCount > 0 ? (
          <p className="hint">{d.rndActiveCount} 个在研 × {wan(d.rndCost)} / 项目。</p>
        ) : null}
        {free > 0 ? (
          <p className="hint">{free} 人未放置，请放到在研项目上。</p>
        ) : null}
      </div>
      <LedgerSection g={g} dept="rnd" />

      <div className="card">
        <h3>研发主题</h3>
        <div className="title-rule" />
        <div className="stack">
          <button className="btn btn-mini" onClick={() => setTheme('prod')}>
            <span className="btn-main">新产品 · BOM 配方</span>
            <span className="btn-sub">在研 {bom.active}/{bom.total} · 解锁当月即可排产</span>
          </button>
          <button className="btn btn-mini" onClick={() => setTheme('ip')}>
            <span className="btn-main">知识产权 · 技能树</span>
            <span className="btn-sub">在研 {ip.active}/{ip.total} · 三分支 · 逐层揭示</span>
          </button>
        </div>
      </div>

      <div className="card">
        <h3>知识结构（终局计分）</h3>
        <div className="title-rule" />
        <div className="stack">
          {E.IP_SETS.map((set) => {
            const have = set.ips.filter((ip) => gs.ipOwned.includes(ip)).length
            const done = have === set.ips.length
            return (
              <div key={set.id} className="card-item" style={{ opacity: done ? 1 : 0.65 }}>
                <span className="spine" />
                <span className="card-body">
                  <span className="card-name">{set.name}{done ? <span className="tag gold" style={{ marginLeft: 6 }}>已成套</span> : null}</span>
                  <span className="card-desc">{set.desc}（{have}/{set.ips.length}）</span>
                  <span className="card-cost">成套终局 +{set.points} 分</span>
                </span>
              </div>
            )
          })}
        </div>
        {d.rndRolls > 1 ? (
          <div className="info" style={{ marginTop: 'var(--s2)' }}>冲刺判定生效（K4 本月 / D1 长期）：研发成功判定掷 {d.rndRolls} 次取高。</div>
        ) : null}
      </div>

      <div className="card">
        <div className="hstack-between">
          <h3>知识产权</h3>
          {gs.mode === 'full' ? (
            <span className="xs faint mono">
              槽位 {gs.ipActive.filter(Boolean).length}/{slots}
            </span>
          ) : (
            <span className="xs faint mono">生效 {ipRows.length}</span>
          )}
        </div>
        <div className="title-rule" />
        {ipRows.length === 0 ? (
          <p className="muted sm">暂无生效的知识产权。完成「知识产权」类研发项目可解锁；卡牌与事件可奖励临时知产。</p>
        ) : (
          <div className="stack-sm">
            {ipRows.map((id) => {
              const quarter = quarterIpIds.includes(id)
              const monthTemp = monthTempIps.includes(id)
              const on = gs.mode === 'core' || gs.ipActive.includes(id)
              const def = IP_BY_ID[id]
              return (
                <div key={id} className="card">
                  <div className="hstack-between">
                    <span className="sm">
                      {def?.name ?? id}
                      {quarter ? (
                        <span className="tag gold" style={{ marginLeft: 6 }}>临时 · 本季</span>
                      ) : monthTemp ? (
                        <span className="tag gold" style={{ marginLeft: 6 }}>临时 · 本月</span>
                      ) : on ? (
                        <span className="tag gold" style={{ marginLeft: 6 }}>{gs.mode === 'core' ? '生效中' : '已激活'}</span>
                      ) : null}
                    </span>
                    {gs.mode === 'full' && !quarter && !monthTemp ? (
                      <button
                        className="btn btn-mini"
                        style={{ width: 'auto' }}
                        onClick={() => setIps(true)}
                      >
                        <span className="btn-main xs">管理</span>
                      </button>
                    ) : null}
                  </div>
                  {def?.desc ? <p className="hint" style={{ marginTop: 'var(--s1)' }}>{def.desc}</p> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {theme === 'prod' ? <RndBomSheet g={g} onClose={() => setTheme(null)} /> : null}
      {theme === 'ip' ? <RndIpSheet g={g} onClose={() => setTheme(null)} /> : null}
      {ips ? <IpSheet g={g} onClose={() => setIps(false)} /> : null}
    </>
  )
}

/** 主题弹框草稿：打开期间只在本地状态调整（不动游戏状态），「确定」时经 confirmRndAssignments 批量写回并锁定本月。 */
function useRndSheetDraft(g: Game, projects: E.ResearchProjectDef[]) {
  const gs = g.s
  const [draft, setDraft] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const p of projects) m[p.id] = gs.rnd[p.id]?.assigned ?? 0
    return m
  })
  const setDraftValue = (id: string, n: number) => setDraft((m) => ({ ...m, [id]: n }))
  /** 本月确认锁：确定后到月初前不再可调（settle 的 advanceMonth 清零） */
  const confirmed = gs.flags['rndConfirmed'] === 1
  // 池约束（跨主题全局）：本弹框外 = 已承诺人员，本弹框内 = 草稿值
  const committedThisSheet = projects.reduce((a, p) => {
    const s = gs.rnd[p.id]
    return a + (s?.projectId && !s.done ? s.assigned : 0)
  }, 0)
  const outsideTotal = E.rndAssignedTotal(gs) - committedThisSheet
  const sheetEffective = projects.reduce((a, p) => {
    const s = gs.rnd[p.id]
    const active = (s?.projectId && !s.done) || (draft[p.id] ?? 0) > 0
    return a + (active ? (draft[p.id] ?? 0) : 0)
  }, 0)
  /** 某项目最多可放置人数（绝对值口径） */
  const capFor = (id: string) => gs.depts.rnd.staff - (outsideTotal + sheetEffective - (draft[id] ?? 0))
  const confirm = () => g.act((st) => E.confirmRndAssignments(st, draft))
  return { draft, setDraftValue, confirmed, capFor, confirm }
}

/** 主题弹框底部：默认「关闭」（关闭即还原草稿）+ T1「确认放置」（写回并锁定本月）。 */
function RndSheetFooter({ confirmed, onConfirm }: { confirmed: boolean; onConfirm: () => void }) {
  return (
    <button className="btn btn-primary" disabled={confirmed} onClick={onConfirm}>
      <span className="btn-main">确认放置</span>
      <span className="btn-sub">{confirmed ? '已确认 · 下月初可再调' : '确认后本月锁定'}</span>
    </button>
  )
}

/** 主题弹框：新产品（BOM 配方）。草稿态调整，确定后本月锁定。 */
function RndBomSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const projects = E.RND_PROJECTS.filter((p) => p.kind === 'bom')
  const { draft, setDraftValue, confirmed, capFor, confirm } = useRndSheetDraft(g, projects)
  return (
    <Sheet
      title="新产品研发"
      sub="BOM 配方 · 解锁后当月排产计划即可生产该层次"
      onClose={onClose}
      footer={(
        <RndSheetFooter
          confirmed={confirmed}
          onConfirm={() => {
            const r = confirm()
            if (r.ok) onClose()
          }}
        />
      )}
    >
      <div className="stack">
        {projects.map((p) => (
          <RndProjectRow
            key={p.id}
            g={g}
            p={p}
            n={draft[p.id] ?? 0}
            cap={capFor(p.id)}
            confirmed={confirmed}
            onAssign={(n) => setDraftValue(p.id, n)}
          />
        ))}
      </div>
    </Sheet>
  )
}

const RND_BRANCH_META: { id: E.RndBranch; name: string; sub: string }[] = [
  { id: 'supply', name: '供应线', sub: '原料供给 · 成本与资金' },
  { id: 'channel', name: '渠道线', sub: '订单 · 品牌与质量' },
  { id: 'equip', name: '装备线', sub: '产能 · 工艺与效率' },
]

/** 主题弹框：知识产权技能树（三分支，阶段 2/3 每层 2 个方向任选，前置解锁后揭示下层）。草稿态调整，确定后本月锁定。 */
function RndIpSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const projects = E.RND_PROJECTS.filter((p) => p.kind === 'ip')
  const { draft, setDraftValue, confirmed, capFor, confirm } = useRndSheetDraft(g, projects)
  return (
    <Sheet
      title="知识产权技能树"
      sub="解锁上游后揭示下层方向（阶段 2/3 各 2 选 1）；效果解锁即生效"
      onClose={onClose}
      footer={(
        <RndSheetFooter
          confirmed={confirmed}
          onConfirm={() => {
            const r = confirm()
            if (r.ok) onClose()
          }}
        />
      )}
    >
      <div className="stack">
        {RND_BRANCH_META.map((b) => {
          const branchProjects = projects.filter((p) => p.branch === b.id)
          // 逐层揭示：前置未解锁的下游方向暂不展示（阶段 1 恒展示）
          const shown = branchProjects.filter((p) => !p.preq || !!gs.rnd[p.preq]?.done)
          const active = shown.filter((p) => { const s = gs.rnd[p.id]; return !!s?.projectId && !s.done }).length
          return (
            <div key={b.id}>
              <div className="section-label">
                {b.name} · {b.sub} — 在研 {active}/{shown.length}
              </div>
              <div className="stack-sm">
                {shown.map((p) => (
                  <RndProjectRow
                    key={p.id}
                    g={g}
                    p={p}
                    n={draft[p.id] ?? 0}
                    cap={capFor(p.id)}
                    confirmed={confirmed}
                    onAssign={(n) => setDraftValue(p.id, n)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

/** 单个研发项目行（内容卡）：状态 / 进度（紫条 = 当前进度，金色标记 = 本月结算后位置）/ 人员放置槽位（草稿态，确定前可增减）。 */
function RndProjectRow({
  g,
  p,
  n,
  cap,
  confirmed,
  onAssign,
}: {
  g: Game
  p: E.ResearchProjectDef
  n: number
  cap: number
  confirmed: boolean
  onAssign: (n: number) => void
}) {
  const gs = g.s
  const d = E.derive(gs)
  const staff = gs.depts.rnd.staff
  const slot = gs.rnd[p.id]
  const done = !!slot?.done
  const started = !!slot?.projectId && !done
  const preqDef = p.preq ? E.RND_PROJECTS.find((x) => x.id === p.preq) : undefined
  const locked = !!p.preq && !gs.rnd[p.preq]?.done
  const { gain, rate } = E.rndProjectOutcome(d, p, n)
  const willRoll = gain > 0 && slot.progress + gain >= p.need
  const pct = Math.min(100, (slot.progress / p.need) * 100)
  const projPct = Math.min(100, ((slot.progress + gain) / p.need) * 100)
  const statusText = done
    ? '已完成'
    : started
      ? `推进中 ${slot.progress}/${p.need}`
      : locked
        ? `需先解锁 ${preqDef?.name ?? '上游'}`
        : n > 0
          ? '确定后立项'
          : '未开始'
  const tagCls = done ? ' green' : started ? ' gold' : locked ? '' : n > 0 ? ' amber' : ''

  return (
    <div className="card">
      <div className="hstack-between">
        <span className="card-name">{p.name}{p.stage ? ` · 阶段 ${p.stage}` : ''}</span>
        <span className={`tag${tagCls}`}>{statusText}</span>
      </div>
      <div className="card-desc">{p.desc}</div>
      {!locked && preqDef ? <div className="xs faint">前置：{preqDef.name}</div> : null}
      {!done ? (
        <>
          <div style={{ margin: 'var(--s3) 0 var(--s1)' }}>
            <div className="bar" style={{ position: 'relative' }}>
              <i style={{ width: `${pct}%`, background: 'var(--grape)' }} />
              {gain > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${projPct}%`,
                    width: 2,
                    background: 'var(--gold-hi)',
                    boxShadow: '0 0 6px rgba(201, 162, 74, 0.8)',
                  }}
                />
              ) : null}
            </div>
            <div className="hstack-between" style={{ marginTop: 4 }}>
              <span className="xs faint">{willRoll ? '本月结算判定成败' : gain > 0 ? '金色标记 = 结算后进度位置' : ''}</span>
              <span className="xs mono">{slot.progress}/{p.need}{gain > 0 ? `（+${gain}）` : ''}</span>
            </div>
          </div>
          <div className="card-cond">
            基础成功率 {Math.round(p.rate * 100)}% · 放置 {n} 人：成功率 {Math.round(rate * 100)}%
          </div>
          {/* 人员放置槽位：5 格（每部门上限 5 人）；草稿态可增减，「确定」后全部锁定至月初 */}
          <div style={{ marginTop: 'var(--s2)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2, 3, 4].map((k) => {
                const count = k + 1
                const lit = count <= n
                const hired = count <= staff
                const usable = !locked && !confirmed && count <= cap
                return (
                  <button
                    key={k}
                    className={`rnd-slot${lit ? ' lit' : ''}${hired ? '' : ' unhired'}${locked ? ' locked' : ''}`}
                    title={
                      !hired
                        ? '需再招聘研发人员'
                        : confirmed
                          ? '已确认锁定，下月初可再调'
                          : lit
                            ? count === n
                              ? '点击收回 1 人'
                              : '点击减少到此格'
                            : '点击放置到此格'
                    }
                    disabled={!usable}
                    onClick={() => onAssign(lit && count === n ? Math.max(0, n - 1) : count)}
                  />
                )
              })}
            </div>
            <button
              className="slot-btn"
              disabled={locked || confirmed || n + 1 > cap}
              title={locked ? '先解锁上游节点' : confirmed ? '已确认锁定' : n + 1 > cap ? '可放置人员已用完' : '多放置 1 人'}
              onClick={() => onAssign(n + 1)}
            >
              +
            </button>
            <span className="xs mono faint">{n}/{staff} 人</span>
          </div>
          {locked ? <span className="xs faint" style={{ display: 'block', marginTop: 4 }}>解锁上游节点后方可放置人员</span> : null}
          {confirmed && n > 0 ? <span className="xs gold" style={{ display: 'block', marginTop: 4 }}>已确认锁定：下月初可再调整</span> : null}
        </>
      ) : null}
    </div>
  )
}

function IpSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const slots = E.ipSlots(gs)
  return (
    <Sheet title="知识产权" sub={`槽位 ${slots} · 每月最多更换 1 次`} onClose={onClose}>
      <div className="stack">
        {gs.ipOwned.map((id) => {
          const def = IP_BY_ID[id]
          const activeSlot = gs.ipActive.indexOf(id)
          return (
            <div key={id} className="card">
              <div className="hstack-between">
                <span className="mat-name">{def?.name ?? id}</span>
                {activeSlot >= 0 ? <span className="tag gold">槽位 {activeSlot + 1}</span> : null}
              </div>
              <div className="title-rule" />
              <p className="card-desc">{def?.desc}</p>
              <div className="wrap" style={{ marginTop: 'var(--s3)' }}>
                {Array.from({ length: slots }, (_, i) => (
                  <button
                    key={i}
                    className="btn btn-mini"
                    style={{ width: 'auto' }}
                    disabled={gs.ipChangedThisMonth && activeSlot !== i}
                    onClick={() =>
                      activeSlot === i
                        ? g.act((st) => E.deactivateIp(st, i))
                        : g.act((st) => E.activateIp(st, id, i))
                    }
                  >
                    <span className="btn-main xs">
                      {activeSlot === i ? `卸下槽 ${i + 1}` : `装入槽 ${i + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {gs.ipChangedThisMonth ? <div className="info">本月已完成一次更换，下月可再调整。</div> : null}
    </Sheet>
  )
}

/** 借/还款金额选择：预设档 + 用满额度/还清（同「选择采购档位」选单样式），选定即执行。 */
function LoanSheet({ g, mode, onClose }: { g: Game; mode: 'borrow' | 'repay'; onClose: () => void }) {
  const s = g.s
  const d = E.derive(s)
  const presets = [10, 50, 100, 200] // 1w / 5w / 10w / 20w
  const full = mode === 'borrow' ? d.creditAvailable : s.debt
  const reasonOf = (a: number): string | null => {
    if (mode === 'borrow') {
      if (s.debt > 0) return '先还清上一笔借款，再借新笔'
      if (d.noBorrow) return '本月无法新增借款'
      if (a > d.creditAvailable) return '超出可用额度'
    } else {
      if (a > s.debt) return '超出借款余额'
      if (a > s.cash) return '现金不足'
    }
    return null
  }
  const run = (a: number) => {
    const r = g.act((st) => (mode === 'borrow' ? E.borrow(st, a) : E.repay(st, a)))
    if (r.ok) {
      g.setToast(r.msg ?? (mode === 'borrow' ? '借款已到账' : '还款完成'))
      onClose()
    }
  }
  const option = (a: number, label: string, note: string) => {
    const reason = reasonOf(a)
    return (
      <button key={`${label}${a}`} className="btn btn-mini" disabled={reason !== null} onClick={() => run(a)}>
        <span className="btn-main xs">{label}</span>
        <span className="btn-sub xs">
          {note}
          {reason ? ` · ${reason}` : ''}
        </span>
      </button>
    )
  }
  const note = (a: number) =>
    mode === 'borrow' ? `现金 +${wan(a)} · 负债 +${wan(a)}` : `现金 −${wan(a)} · 负债 −${wan(a)}`
  return (
    <Sheet
      title={mode === 'borrow' ? '借款' : '还款'}
      sub={
        mode === 'borrow'
          ? `可用额度 ${wan(d.creditAvailable)} · 月利率 ${(d.rate * 100).toFixed(1)}% · 期限 ${LOAN_TERM_MONTHS} 个月`
          : `余额 ${wan(s.debt)}${s.loanDueMonth > 0 ? ` · 第 ${s.loanDueMonth} 月到期` : ''} · 现金 ${wan(s.cash)}`
      }
      onClose={onClose}
    >
      <div className="stack">
        {presets.map((a) => option(a, `${mode === 'borrow' ? '借款' : '还款'} ${wan(a)}`, note(a)))}
        {full > 0 && !presets.includes(full)
          ? option(full, mode === 'borrow' ? `用满额度 ${wan(full)}` : `还清 ${wan(full)}`, note(full))
          : null}
      </div>
    </Sheet>
  )
}

/* ══════════════ 招聘（各部门通用） ══════════════ */

function HireBlock({ g, dept }: { g: Game; dept: E.Dept }) {
  const gs = g.s
  const def = STAFF[dept]
  const staff = gs.depts[dept].staff
  const check = E.canHire(gs, dept)
  const fee = E.hireCost(gs, dept)
  const [hireSheet, setHireSheet] = useState(false)

  /** 招下一个人立刻获得的效果：单人固定 + 下一档解锁。 */
  const immediateEffects: string[] = [...def.base]
  const nextUnlock = def.unlocks.find((u) => u.at === staff + 1)
  if (nextUnlock && nextUnlock.text !== '（无新增解锁）') {
    immediateEffects.push(`解锁：${nextUnlock.text}`)
  }

  return (
    <div className="card">
      <div className="hstack-between">
        <h3>人员招聘</h3>
        <span className="xs faint mono">
          {staff}/5 人
        </span>
      </div>
      <div className="title-rule" />

      <button className="btn btn-mini" disabled={!check.ok} onClick={() => setHireSheet(true)}>
        <span className="btn-main">招聘{DEPT_NAME[dept]}</span>
        {!check.ok ? <span className="btn-sub">{check.msg}</span> : null}
      </button>

      {/* S4 裁员优化（事件）/ K6 编制优化（规则卡）：本月裁员额度，返还 100% 基础招聘费 */}
      {gs.monthFlags.some((f) => f === 'canFire' || f === 'canFireCard') && staff > 0 ? (
        <button
          className="btn btn-mini"
          style={{ marginTop: 'var(--s2)' }}
          onClick={() => {
            const r = g.act((st) => E.fire(st, dept))
            if (r.ok) g.setToast(r.msg ?? '已解雇')
            else g.setToast(r.msg)
          }}
        >
          <span className="btn-main">解雇 1 名{DEPT_NAME[dept]}</span>
          <span className="btn-sub">返还 100% 基础招聘费（S4 事件 / K6 编制优化）</span>
        </button>
      ) : null}

      {/* 解锁轨道：staff 人时，at <= staff 的格子已点亮 */}
      <div className="unlock-track" style={{ marginTop: 'var(--s3)' }}>
        {def.unlocks.map((u) => (
          <div
            key={u.at}
            className={`unlock-node${staff >= u.at ? ' done' : ''}`}
          >
            <span className="unlock-diamond" />
          </div>
        ))}
      </div>

      {/* 固有效果 + 解锁说明 */}
      <div className="stack-sm" style={{ marginTop: 'var(--s2)' }}>
        {def.base.map((b) => (
          <div key={b} className="xs faint">
            固定：{b}
          </div>
        ))}
        {def.unlocks.map((u) => (
          <div key={u.at} className={`xs${staff >= u.at ? ' green' : ' faint'}`}>
            {u.at} 人：{u.text}
          </div>
        ))}
      </div>

      {hireSheet ? (
        <Sheet
          title={`招聘${DEPT_NAME[dept]}`}
          sub={`当前 ${staff}/5 人`}
          onClose={() => setHireSheet(false)}
          footer={
            <button className="btn btn-primary" disabled={!check.ok} onClick={() => {
              g.act((st) => E.hire(st, dept))
              setHireSheet(false)
            }}>
              <span className="btn-main">确认招聘</span>
            </button>
          }
        >
          <div className="card">
            <div className="section-label">成本明细</div>
            <Row k="AP" v="1 点" />
            <Row k="招聘费" v={fee > 0 ? wan(fee) : '免费'} cls={fee > 0 ? '' : 'green'} />
            <Row k="月薪" v={`${wan(def.salary)}/人（本月计提下月支付）`} />
          </div>

          <div className="card" style={{ marginTop: 'var(--s3)' }}>
            <div className="section-label">立即获得</div>
            {immediateEffects.map((e, i) => (
              <div key={i} className="hint" style={{ marginTop: i > 0 ? 'var(--s1)' : 0 }}>{e}</div>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  )
}

const DEPT_NAME: Record<E.Dept, string> = {
  ops: '管理人员',
  buy: '采购人员',
  make: '生产人员',
  sell: '销售人员',
  rnd: '研发人员',
}

export { Medallion, PRODUCT_PRICE }
