import { useState, Fragment } from 'react'
import * as E from '../../core/engine'
import { STAFF, CARD_BY_ID, PRODUCT_PRICE, EQUIPMENT_SHOP, IP_BY_ID, DEPT_SHORT, TIER_LABEL, RND_COST_PER_PROJECT, BOMS, MATERIAL_BY_ID } from '../../data/game'
import type { CardCtx } from '../../data/game'
import type { Tier } from '../../core/types'
import { Icon, type IconName } from '../icons'
import { Medallion } from '../ornaments'
import { Row, Sheet } from '../Sheet'
import { wan, tierClass, tierName, TIER_ORDER, clamp } from '../format'
import type { Game } from '../useGame'

const DEPTS: E.Dept[] = ['ops', 'buy', 'make', 'sell', 'rnd']

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
      const per = d.salaryPer[dept]
      const base = STAFF[dept].salary
      const lines: string[] = [`基础月薪 ${wan(base)} / 人`]
      if (per !== base) {
        const delta = per - base
        lines.push(`修正后 ${wan(per)} / 人（${delta > 0 ? '+' : ''}${wan(delta)}，受 IP / 事件影响）`)
      }
      lines.push(`人数 ${s.depts[dept].staff} 人`)
      lines.push(`计提额 ${wan(per * s.depts[dept].staff)}`)
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
    if (r.item.includes('加班')) return ['加班费固定 0.5w（需生产 ≥ 3 人）']
    if (r.item.includes('研发')) return [`每个项目每月 ${wan(RND_COST_PER_PROJECT)}`, '本月推进 1 个项目']
    if (r.item.includes('提案')) return ['提案实施费用合计（含卡牌费用等）']
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
    <div style={{ marginTop: 'var(--s3)' }}>
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
  dept: E.Dept
  onDept: (d: E.Dept) => void
  onSettle: () => void
}) {
  const s = g.s
  const d = E.derive(s)

  /** 轨道红点：有未处理事项时亮起。 */
  const dots: Record<E.Dept, boolean> = {
    ops: s.hand.length > 0 && s.plays > 0,
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

        <HireBlock g={g} dept={dept} />
      </div>

      <nav className="track">
        {DEPTS.map((k) => (
          <button key={k} className={`track-btn${dept === k ? ' on' : ''}`} onClick={() => onDept(k)}>
            {dots[k] ? <span className="track-dot" /> : null}
            <Icon name={DEPT_ICON[k]} size={19} />
            <span>{DEPT_SHORT[k]}</span>
          </button>
        ))}
        <button className="track-btn track-settle" onClick={onSettle}>
          <Icon name="settle" size={19} />
          <span>结算</span>
        </button>
      </nav>
    </>
  )
}

/* ══════════════ 运营部 ══════════════ */

function OpsPage({ g }: { g: Game }) {
  const s = g.s
  const [view, setView] = useState<'discard' | null>(null)

  return (
    <>
      <div className="card">
        <div className="hstack-between">
          <h3>运营部</h3>
        </div>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          招募管理人员可提升 AP 上限（下月生效）；每月实施提案辅助各业务部门开展运营。
        </p>
        <LedgerSection g={g} dept="ops" />
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
          <p className="muted sm">提案是空的。已实施的提案会进入已实施列表。</p>
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
                    <span className="card-desc">{def.text}</span>
                    <span className="card-cost">
{cost > 0 ? `实施费用 ${wan(cost)}` : '实施费用：无'}
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)', justifyContent: 'center' }}>
                    <button
                      className="btn btn-mini"
                      style={{ width: 'auto' }}
                      disabled={!playable.ok}
                      onClick={() => g.act((st) => E.playCard(st, c.uid))}
                    >
                      <span className="btn-main xs">实施</span>
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
                          <span className="card-name">【{DEPT_SHORT[def.kind]}】{def.name}</span>
                          <span className="card-desc">{def.text}</span>
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
                          <span className="card-name">【{DEPT_SHORT[def.kind]}】{def.name}</span>
                          <span className="card-desc">{def.text}</span>
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
    </>
  )
}

/* ══════════════ 采购部 ══════════════ */

function BuyPage({ g }: { g: Game }) {
  const gs = g.s
  const d = E.derive(gs)
  const mats = E.materialViews(gs)
  const [detail, setDetail] = useState<string | null>(null)
  const [trader, setTrader] = useState(false)
  const [agreement, setAgreement] = useState(false)

  return (
    <>
      <div className="card">
        <h3>采购部</h3>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          每月为原料选择采购档位，签长期协议锁定供货量；人员越多档位越宽、可解锁高级材料。
        </p>
        <LedgerSection g={g} dept="buy" />
        <p className="hint" style={{ marginTop: 'var(--s2)' }}>
          采购实付现金自动入账「借 库存 / 贷 现金」，金额与库存账面、生产领料出库严格勾稽。
        </p>
      </div>

      {mats.map((m) => (
        <div key={m.id} className="card">
          <div className="mat-head">
            <span className="mat-name">
              {m.name}
              {m.isNew ? <span className="tag" style={{ marginLeft: 6 }}>新材料</span> : null}
            </span>
            <span className="mat-meta">
              库存 {m.qty}/{m.cap}
            </span>
          </div>
          <div className="title-rule" />
          <div className="hstack-between">
            <span className="xs faint">
              供给 <span className="mono">{m.supply}</span>
            </span>
            <span className={`xs mono ${tierClass(m.tierShift)}`}>价格：{tierName(m.tierShift)}</span>
          </div>

          <div className="lot-row">
            {(['small', 'mid', 'large'] as E.LotSize[]).map((lot) => {
              const qty = E.lotQty(gs, m.id, lot)
              const price = E.lotPrice(gs, m.id, lot)
              const total = qty * price
              const chosen = m.chosenLot === lot
              const disabled =
                m.chosenLot !== null || qty <= 0 || gs.lotsUsed >= d.buyLots || total > gs.cash
              return (
                <button
                  key={lot}
                  className={`btn btn-mini${chosen ? ' on' : ''}`}
                  disabled={disabled}
                  onClick={() => g.act((st) => E.buyMaterial(st, m.id, lot))}
                >
                  <span className="btn-main xs">{E.lotLabel(lot)}</span>
                  <span className="btn-sub xs">
                    {qty} 件 · {wan(total)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="hint">
            账面单价 {wan(m.avgCost)}/件
            {m.chosenLot ? ' · 本月已选档' : ''}
          </div>

          {m.supply > 0 ? (
            <button className="btn btn-nav" style={{ marginTop: 'var(--s2)' }} onClick={() => setDetail(m.id)}>
              <span className="btn-main xs">查看明细</span>
              <Icon name="chevron" size={13} />
            </button>
          ) : null}
        </div>
      ))}

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
        </div>
      </div>

      {detail ? <MaterialSheet g={g} id={detail} onClose={() => setDetail(null)} /> : null}
      {trader ? <TraderSheet g={g} onClose={() => setTrader(false)} /> : null}
      {agreement ? <AgreementSheet g={g} onClose={() => setAgreement(false)} /> : null}
    </>
  )
}

function MaterialSheet({ g, id, onClose }: { g: Game; id: string; onClose: () => void }) {
  const gs = g.s
  const m = E.materialViews(gs).find((x) => x.id === id)!
  const d = E.derive(gs)
  const dm = d.materials[id]

  return (
    <Sheet title={m.name} sub={`供给 ${m.supply} · 库存 ${m.qty}/${m.cap}`} onClose={onClose}>
      <div className="card">
        <Row k="市场供给" v={`${m.supply} 件`} />
        <Row k="价格档位" v={tierName(m.tierShift)} cls={tierClass(m.tierShift)} />
        <Row k="当前单价" v={`${wan(m.price)}/件`} />
        <Row k="库存上限" v={`${m.cap}`} />
        <Row k="账面单价" v={`${wan(m.avgCost)}/件`} />
        <Row k="账面价值" v={wan(m.avgCost * m.qty)} />
      </div>

      <div className="card">
        <div className="section-label">价格来源</div>
        <Row k="基础价" v={wan(dm?.price ?? m.price)} />
        <Row k="气候修正" v={tierName(m.tierShift)} cls={tierClass(m.tierShift)} />
        <Row k="采购人数加成" v={`${gs.depts.buy.staff} 人`} />
        {m.developed > 0 ? <Row k="供应商开发" v={`基础供给 +${m.developed}`} /> : null}
      </div>

      <div className="card">
        <div className="section-label">各档报价</div>
        {(['small', 'mid', 'large'] as E.LotSize[]).map((lot) => {
          const qty = E.lotQty(gs, id, lot)
          const price = E.lotPrice(gs, id, lot)
          return <Row key={lot} k={E.lotLabel(lot)} v={`${qty} 件 × ${wan(price)} = ${wan(qty * price)}`} />
        })}
      </div>

      {m.isNew ? (
        <div className="card">
          <div className="section-label">供应商开发</div>
          <p className="muted sm">每次 1 AP + 3w，基础供给 +2，最多开发 3 次（上限 6）。</p>
          <Row k="已开发" v={`${m.developed}/6`} />
          <div style={{ marginTop: 'var(--s3)' }}>
            <button
              className="btn btn-mini"
              disabled={m.developed >= 6 || gs.ap < 1 || gs.cash < 30}
              onClick={() => g.act((st) => E.developSupplier(st, id))}
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
  return (
    <Sheet title="贸易商" sub="小批 · 价格更高 · 不占本月档数" onClose={onClose}>
      <div className="stack">
        {offers.map((o) => {
          const used = gs.extraBuys.some((e) => e.kind === 'trader' && e.materialId === o.materialId)
          const total = o.qty * o.price
          return (
            <div key={o.materialId} className="card">
              <Row k={E.materialViews(gs).find((m) => m.id === o.materialId)?.name ?? o.materialId} v={`${o.qty} 件`} />
              <Row k="单价" v={`${wan(o.price)}/件`} />
              <Row k="合计" v={wan(total)} />
              <div style={{ marginTop: 'var(--s3)' }}>
                <button
                  className="btn btn-mini"
                  disabled={used || total > gs.cash || o.qty <= 0}
                  onClick={() => g.act((st) => E.buyFromTrader(st, o.materialId, o.qty, o.price))}
                >
                  <span className="btn-main">{used ? '本月已购' : '购买'}</span>
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

function AgreementSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const mats = E.materialViews(gs).filter((m) => m.supply > 0)
  const slots = E.agreementSlots(gs)
  const months = gs.depts.buy.staff >= 5 ? 6 : 3

  return (
    <Sheet
      title="签订长期协议"
      sub={`协议 ${gs.agreements.length}/${slots} · 锁定期 ${months} 个月`}
      onClose={onClose}
    >
      <div className="info">
        每月自动到货中批，价格锁定，不占本月采购档数；每月仍需付款，并占库存。
      </div>

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
      <div className="hint">
        采购 {d.buyLots} 档可用；研发到 5 人可将锁定期延长至 6 个月。
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
  const plannedTotal = TIER_ORDER.reduce((a, t) => a + (gs.plan.tier === t ? gs.plan.qty : 0), 0)
  const remainingCap = Math.max(0, cap - plannedTotal)
  const [equip, setEquip] = useState(false)
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <div className="card">
        <h3>生产部</h3>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          将产能分配到各产品线，确认后按 BOM 立即扣料入库；设备与加班可提升产能上限，人员越多单月产量越高。
        </p>
        <LedgerSection g={g} dept="make" />
      </div>

      {/* 产品 BOM 看板：与销售部「市场需求表」同款布局，仅展示已解锁产品线 */}
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
        <div className="hint">配方按 BOM 扣料；库存为成品总件数，单位成本为最近批次入账均价。</div>
      </div>

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
            const on = gs.plan.tier === t
            const qty = on ? gs.plan.qty : 0
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
                    onClick={() => g.mutate((st) => E.setPlan(st, { tier: t, qty: Math.max(0, st.plan.qty - 1) }))}
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
                        E.setPlan(st, {
                          tier: t,
                          qty: clamp((st.plan.tier === t ? st.plan.qty : 0) + 1, 0, E.maxProducible(st, t)),
                        }),
                      )
                    }
                  >
                    <span>+</span>
                  </button>
                  <button
                    className="btn btn-mini"
                    style={{ width: 'auto', opacity: qty >= max ? 0.4 : 1 }}
                    disabled={qty >= max}
                    onClick={() => g.mutate((st) => E.setPlan(st, { tier: t, qty: E.maxProducible(st, t) }))}
                  >
                    <span className="btn-main xs">拉满</span>
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <div className="hint">
          1 点产能生产 1 件；可在已解锁产品线间自由分配，各线受产能与原料双重限制。剩余 {remainingCap} 点未分配。
        </div>
        <div style={{ marginTop: 'var(--s3)' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={plannedTotal <= 0}
            onClick={() => setConfirm(true)}
          >
            <span className="btn-main">确认生产安排</span>
            <span className="btn-sub">{plannedTotal > 0 ? `共 ${plannedTotal} 件，确认后立即扣料入库` : '先分配产量'}</span>
          </button>
        </div>
      </div>

      <div className="card">
        <h3>加班与设备</h3>
        <div className="title-rule" />
        <div className="stack">
          <button
            className="btn btn-mini"
            disabled={gs.depts.make.staff < 3 || gs.plan.overtime}
            onClick={() => g.act((st) => E.toggleOvertime(st))}
          >
            <span className="btn-main">{gs.plan.overtime ? '本月已安排加班' : '安排加班'}</span>
            <span className="btn-sub">
              {gs.depts.make.staff < 3 ? '需生产 3 人解锁' : '0.5w · 本月产能 +10'}
            </span>
          </button>
          <button className="btn btn-mini" onClick={() => setEquip(true)}>
            <span className="btn-main">购买设备</span>
            <span className="btn-sub">扩充产能与借款额度</span>
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
                  {e.name} <span className="faint xs">产能 {e.capacity}</span>
                </>
              }
              v={`净 ${wan(Math.max(0, e.cost - e.accumulated))} / 原值 ${wan(e.cost)}`}
            />
          ))}
        </div>
      ) : null}

      {/* 确认生产安排：按 BOM 立即扣料入库，「原料→存货」记账到部门账务 */}
      {confirm ? (
        <ProductionConfirmSheet g={g} planned={plannedTotal} onDone={() => setConfirm(false)} />
      ) : null}
      {equip ? <EquipmentSheet g={g} onClose={() => setEquip(false)} /> : null}
    </>
  )
}

/** 确认生产安排弹窗：列出将入库的各线产量与原料消耗，确认后扣料入库。 */
function ProductionConfirmSheet({ g, planned, onDone }: { g: Game; planned: number; onDone: () => void }) {
  const gs = g.s
  const lines = TIER_ORDER
    .map((t) => ({ t, qty: gs.plan.tier === t ? gs.plan.qty : 0, max: E.maxProducible(gs, t) }))
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
      <div className="hint">
        确认后即按 BOM 消耗原料并入库（单位成本按账面价结转），本月账务新增「原料→存货」记录；未分配的剩余产能月末释放。
      </div>
    </Sheet>
  )
}

function EquipmentSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  return (
    <Sheet title="购买设备" sub="增加产能、安置工人、提升借款额度" onClose={onClose}>
      <div className="stack">
        {EQUIPMENT_SHOP.map((e) => (
          <div key={e.id} className="card">
            <div className="hstack-between">
              <span className="mat-name">{e.name}</span>
              <span className="tag gold">{wan(e.price)}</span>
            </div>
            <div className="title-rule" />
            <Row k="产能" v={`+${e.capacity}`} />
            <Row k="月折旧" v={wan(e.depreciation)} />
            <Row k="借款额度" v={`+${wan(e.creditLine)}`} />
            <div style={{ marginTop: 'var(--s3)' }}>
              <button
                className="btn btn-mini"
                disabled={gs.cash < e.price}
                onClick={() => g.act((st) => E.buyEquipment(st, e.id))}
              >
                <span className="btn-main">购买</span>
                <span className="btn-sub">{gs.cash < e.price ? '现金不足' : `支付 ${wan(e.price)}`}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="hint">设备折旧在提足原值后停止，不会把账面价值压成负数。</div>
    </Sheet>
  )
}

/* ══════════════ 销售部 ══════════════ */

/* 市场需求表的一行（类型 / 需求数 / 市价 / 可用库存） */
function TierRowCells({
  t, p,
  push = 0, over = 0, demand, demandBase, cap, price, avail,
  orderTaken = 0,
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
}) {
  return (
    <>
      <span className="sm">
        <b>{TIER_LABEL[t]}</b>
        {!p.built ? <span className="faint xs"> · 未解锁</span> : null}
      </span>
      <span />
      <span className={`mono sm${push > 0 ? ' gold' : ''}`}>
        {demand}<span className="faint">（上限 {demandBase + cap}）</span>
        {over > 0 ? <span className="faint" style={{ color: 'var(--red, #c0392b)' }}> · 超 {over}</span> : null}
      </span>
      <span className="mono xs">{wan(price)}</span>
      <span>
        <span className="mono sm">{avail}</span>
        {orderTaken > 0 ? <span className="faint xs">（总 {p.qty}）</span> : null}
      </span>
    </>
  )
}

/* 订单需求表的一行（类型 / 需求数 / 订单价 / 状态 / 来源） */
function TierOrderRow({
  t, p, qty, price, from, forced, isAccepted, isDeclined, canAccept, onToggle, onShortClick,
}: {
  t: Tier
  p: { built: boolean; qty: number }
  qty: number
  price: number
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
      <span className="xs faint">{from}</span>
      <span className={`mono sm${forced ? '' : isAccepted ? ' gold' : ''}`}>
        {qty} 件
      </span>
      <span className="mono xs">{wan(price)}</span>
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
          onClick={onToggle}
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
      <div className="card">
        <h3>销售部</h3>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          将销售资源投向各层需求，资源越多需求盘子越大；人员越多销售资源越丰富，可解锁自然订单。
        </p>
        <LedgerSection g={g} dept="sell" />
        <p className="hint" style={{ marginTop: 'var(--s2)' }}>
          结算后自动入账「销售收入 / 销售成本」：收入 = 现金增加，成本 = 成品存货减记，与利润表严格勾稽。
        </p>
      </div>

      {/*
        需求与售价面板放在加点面板之前：玩家下方加点时，
        本页「需求 A + B = C」的数字随 derive 实时变化。
      */}
      <div className="card">
        <h3>本月需求与售价</h3>
        <div className="title-rule" />
        {/* 市场需求表：四列（类型 / 需求 / 售价 / 库存），库存已扣除订单占用量 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) 1fr 1fr 1fr 1fr', columnGap: 'var(--s4)', rowGap: 'var(--s2)', alignItems: 'center' }}>
          <span className="xs" style={{ color: 'var(--gold)' }}>市场需求</span>
          <span />
          <span className="xs faint">需求数</span>
          <span className="xs faint">市价</span>
          <span className="xs faint">可用库存</span>
          {TIER_ORDER.map((t) => {
            const p = gs.products[t]
            const cost = d.salesPushCost[t]
            const cap = d.salesPushCap[t]
            const push = d.salesPush[t]
            const over = Math.max(0, gs.salesAlloc[t] - cap * cost)
            const orderTaken = forcedQtyBy[t] + acceptedQtyBy[t]
            const avail = Math.max(0, p.qty - orderTaken)
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
                price={d.price[t]}
                avail={avail}
                orderTaken={orderTaken}
              />
            )
          })}
        </div>

        {/* 订单需求表：五列（类型 / 来源 / 需求数 / 订单价 / 状态），列宽与上方对齐 */}
        <div className="title-rule" />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) 1fr 1fr 1fr 1fr', columnGap: 'var(--s4)', rowGap: 'var(--s2)', alignItems: 'center' }}>
          <span className="xs" style={{ color: 'var(--gold)' }}>订单需求</span>
          <span className="xs faint">来源</span>
          <span className="xs faint">需求数</span>
          <span className="xs faint">订单价</span>
          <span className="xs faint">状态</span>
          {gs.orders.map((o) => {
            const orderPrice = E.priceAtProduct(o.tier, o.priceShift + d.priceShift[o.tier])
            const isAccepted = gs.acceptedOrders.includes(o.id)
            const isDeclined = gs.declinedOrders.includes(o.id)
            const canAccept = gs.products[o.tier].qty >= o.qty
            return (
              <TierOrderRow
                key={o.id}
                t={o.tier}
                p={gs.products[o.tier]}
                qty={o.qty}
                price={orderPrice}
                from={o.from}
                forced={o.forced}
                isAccepted={isAccepted}
                isDeclined={isDeclined}
                canAccept={canAccept}
                onToggle={() => g.mutate((st) => E.toggleOrder(st, o.id))}
                onShortClick={() => g.setToast('库存不足，先生产再接单')}
              />
            )
          })}
        </div>
        <div className="hint">
          可用库存 = 总库存 − 强制订单占用 − 已接自然订单占用。强制订单到月必交；自然订单点接后锁定库存，再点取消。
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
          订单来源：{gs.orders.map((o) => o.from).filter((v, i, a) => a.indexOf(v) === i).join('、')} · 强制必交 / 自然库存够才接，不足留到下月。
        </div>
      ) : null}
    </>
  )
}

/* ══════════════ 研发部 ══════════════ */

function RndPage({ g }: { g: Game }) {
  const gs = g.s
  const d = E.derive(gs)
  const active = E.activeResearch(gs)
  const slots = E.ipSlots(gs)
  const [ips, setIps] = useState(false)

  return (
    <>
      <div className="card">
        <h3>研发部</h3>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          推进研发项目，解锁新产品与知识产权；人员越多每月进度越快、成功率越高。
        </p>
        <LedgerSection g={g} dept="rnd" />
      </div>

      <div className="card">
        <h3>研发项目</h3>
        <div className="title-rule" />
        <div className="stack">
          {E.RND_PROJECTS.map((p) => {
            const slot = gs.rnd[p.id]
            const isActive = active === p.id
            const rate = Math.min(100, Math.round((p.rate + d.rndRate / 100) * 100))
            return (
              <div key={p.id} className={`card-item d-rnd${isActive ? ' on' : ''}`}>
                <span className="spine" />
                <span className="card-body">
                  <span className="hstack-between">
                    <span className="card-name">{p.name}</span>
                    <span className="tag">
                      {slot.done ? '已完成' : `${slot.progress}/${p.need}`}
                    </span>
                  </span>
                  <span className="card-desc">{p.desc}</span>
                  <span className="card-cond">
                    基础成功率 {Math.round(p.rate * 100)}% · 当前 {rate}%
                  </span>
                  <div style={{ marginTop: 'var(--s2)' }}>
                    <button
                      className="btn btn-mini"
                      disabled={slot.done || gs.depts.rnd.staff < 1 || isActive}
                      onClick={() => g.act((st) => E.startResearch(st, p.id))}
                    >
                      <span className="btn-main">
                        {slot.done ? '已完成' : isActive ? '推进中' : '推进研发'}
                      </span>
                      <span className="btn-sub">
                        {gs.depts.rnd.staff < 1 ? '需 1 名研发人员' : `立项后每月 ${wan(d.rndCost)}`}
                      </span>
                    </button>
                  </div>
                </span>
              </div>
            )
          })}
        </div>
        <div className="hint">研发失败会保留进度，下月可继续推进。</div>
      </div>

      <div className="card">
        <div className="hstack-between">
          <h3>知识产权</h3>
          <span className="xs faint mono">
            槽位 {gs.ipActive.filter(Boolean).length}/{slots}
          </span>
        </div>
        <div className="title-rule" />
        {gs.ipOwned.length === 0 ? (
          <p className="muted sm">尚未拥有知识产权。完成「知识产权」类研发项目后可获得。</p>
        ) : (
          <div className="stack-sm">
            {gs.ipOwned.map((id) => {
              const on = gs.ipActive.includes(id)
              const def = IP_BY_ID[id]
              return (
                <div key={id} className="hstack-between">
                  <span className="sm">
                    {def?.name ?? id}
                    {on ? <span className="tag gold" style={{ marginLeft: 6 }}>已激活</span> : null}
                  </span>
                  <button
                    className="btn btn-mini"
                    style={{ width: 'auto' }}
                    onClick={() => setIps(true)}
                  >
                    <span className="btn-main xs">管理</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {ips ? <IpSheet g={g} onClose={() => setIps(false)} /> : null}
    </>
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
