import { useState } from 'react'
import * as E from '../../core/engine'
import { STAFF, CARD_BY_ID, PRODUCT_PRICE, EQUIPMENT_SHOP, IP_BY_ID, DEPT_SHORT, TIER_LABEL } from '../../data/game'
import { Icon, type IconName } from '../icons'
import { Medallion } from '../ornaments'
import { Row, Sheet } from '../Sheet'
import { wan, tierClass, tierName, TIER_ORDER, clamp } from '../format'
import type { Game } from '../useGame'

const DEPTS: E.Dept[] = ['ops', 'buy', 'make', 'sell', 'rnd']
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
    make: s.plan.qty === 0 && E.maxProducible(s, 'low') > 0,
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

        <button className="btn btn-primary" onClick={onSettle} style={{ marginTop: 'var(--s2)' }}>
          <span className="btn-main">结束本月</span>
          <span className="btn-sub">
            现金 {wan(s.cash)} · AP {s.ap}/{E.hudView(s).apMax}
          </span>
        </button>
      </div>

      <nav className="track">
        {DEPTS.map((k) => (
          <button key={k} className={`track-btn${dept === k ? ' on' : ''}`} onClick={() => onDept(k)}>
            {dots[k] ? <span className="track-dot" /> : null}
            <Icon name={DEPT_ICON[k]} size={19} />
            <span>{DEPT_SHORT[k]}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

/* ══════════════ 运营部 ══════════════ */

function OpsPage({ g }: { g: Game }) {
  const s = g.s
  const hud = E.hudView(s)
  const [view, setView] = useState<'hand' | 'discard' | 'deck' | null>(null)

  return (
    <>
      <div className="card">
        <div className="hstack-between">
          <h3>运营部</h3>
          <span className="xs faint mono">
            手牌 {s.hand.length}/{s.handMax}
          </span>
        </div>
        <div className="title-rule" />
        <div className="grid-3">
          <div>
            <div className="stat-label">AP</div>
            <div className="stat-value">
              {s.ap}
              <span className="faint">/{hud.apMax}</span>
            </div>
          </div>
          <div>
            <div className="stat-label">可打牌数</div>
            <div className="stat-value">
              {s.plays}
              <span className="faint">/{hud.playsMax}</span>
            </div>
          </div>
          <div>
            <div className="stat-label">管理人员</div>
            <div className="stat-value">{s.depts.ops.staff}</div>
          </div>
        </div>
        <div className="hint">
          打牌不耗 AP，但占本月可打牌数。抽牌 {s.drawN} 选 {s.drawM}。
        </div>
      </div>

      {/* 抽卡 */}
      {s.drawn.length ? (
        <DrawBlock g={g} />
      ) : (
        <div className="card">
          <h3>抽卡</h3>
          <div className="title-rule" />
          <p className="muted sm">本月的推广方案已备好，抽 {s.drawN} 张、选 {s.drawM} 张入手。</p>
          <div style={{ marginTop: 'var(--s3)' }}>
            <button
              className="btn btn-mini"
              disabled={s.deck.length === 0}
              onClick={() => g.mutate((st) => E.drawCards(st))}
            >
              <span className="btn-main">抽卡 · {s.drawN} 选 {s.drawM}</span>
              {s.deck.length === 0 ? <span className="btn-sub">牌库已空</span> : null}
            </button>
          </div>
        </div>
      )}

      {/* 手牌 */}
      <div className="card">
        <div className="hstack-between">
          <h3>手牌</h3>
          <div className="wrap">
            <button className="btn btn-mini" style={{ width: 'auto' }} onClick={() => setView('discard')}>
              <span className="btn-main xs">弃牌堆 {s.discard.length}</span>
            </button>
            <button className="btn btn-mini" style={{ width: 'auto' }} onClick={() => setView('deck')}>
              <span className="btn-main xs">牌库 {s.deck.length}</span>
            </button>
          </div>
        </div>
        <div className="title-rule" />
        {s.hand.length === 0 ? (
          <p className="muted sm">手牌是空的。先抽卡吧。</p>
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
                    {def.cond ? <span className="card-cond">{def.cond}</span> : null}
                    <span className="card-cost">
                      {cost > 0 ? `打出费用 ${wan(cost)}` : '打出费用：无'} · 不耗 AP
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)', justifyContent: 'center' }}>
                    <button
                      className="btn btn-mini"
                      style={{ width: 'auto' }}
                      disabled={!playable.ok}
                      onClick={() => g.act((st) => E.playCard(st, c.uid))}
                    >
                      <span className="btn-main xs">打出</span>
                      {!playable.ok ? <span className="btn-sub xs">{playable.msg}</span> : null}
                    </button>
                    <button
                      className="btn btn-nav"
                      style={{ width: 'auto', padding: 'var(--s1) var(--s3)' }}
                      onClick={() => g.mutate((st) => E.discardCard(st, c.uid))}
                    >
                      <span className="xs">弃掉</span>
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {s.hand.length > s.handMax ? (
          <div className="warn" style={{ marginTop: 'var(--s3)' }}>
            手牌超出上限 {s.hand.length - s.handMax} 张，需弃牌后才能继续。
          </div>
        ) : null}
      </div>

      {view ? (
        <Sheet
          title={view === 'discard' ? '弃牌堆' : '牌库'}
          sub={view === 'discard' ? `${s.discard.length} 张` : `剩余 ${s.deck.length} 张`}
          onClose={() => setView(null)}
        >
          <div className="stack">
            {(view === 'discard' ? s.discard : s.deck).map((c) => {
              const def = CARD_BY_ID[c.defId]
              return (
                <div key={c.uid} className={`card-item d-${def.kind}`}>
                  <span className="spine" />
                  <span className="card-body">
                    <span className="card-name">
                      【{DEPT_SHORT[def.kind]}】{def.name}
                    </span>
                    <span className="card-desc">{def.text}</span>
                  </span>
                </div>
              )
            })}
            {(view === 'discard' ? s.discard : s.deck).length === 0 ? (
              <p className="muted sm">空空如也。</p>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  )
}

/** 抽卡阶段：列表式，效果直出。 */
function DrawBlock({ g }: { g: Game }) {
  const s = g.s
  const full = s.drawnSelected.length >= s.drawM

  return (
    <div className="card">
      <div className="hstack-between">
        <h3>抽卡阶段</h3>
        <span className="xs mono gold">
          已选 {s.drawnSelected.length}/{s.drawM}
        </span>
      </div>
      <div className="title-rule" />
      <div className="stack">
        {s.drawn.map((c) => {
          const def = CARD_BY_ID[c.defId]
          const on = s.drawnSelected.includes(c.uid)
          const dim = full && !on
          return (
            <button
              key={c.uid}
              className={`card-item d-${def.kind}${on ? ' on' : ''}${dim ? ' dim' : ''}`}
              onClick={() => g.mutate((st) => E.toggleDrawn(st, c.uid))}
            >
              <span className="spine" />
              <span className="card-body">
                <span className="hstack-between">
                  <span className="card-name">
                    【{DEPT_SHORT[def.kind]}】{def.name}
                    {c.empowered ? <span className="tag gold" style={{ marginLeft: 6 }}>强化</span> : null}
                  </span>
                  <span className={`tag${on ? ' gold' : ''}`}>{on ? '已选' : '选择'}</span>
                </span>
                <span className="card-desc">{def.text}</span>
                {def.cond ? <span className="card-cond">{def.cond}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 'var(--s4)' }}>
        <button
          className="btn btn-primary"
          disabled={s.drawnSelected.length === 0}
          onClick={() => g.act((st) => E.confirmDraw(st))}
        >
          <span className="btn-main">确认选择（已选 {s.drawnSelected.length}/{s.drawM}）</span>
        </button>
      </div>
    </div>
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
        <div className="hstack-between">
          <h3>采购部</h3>
          <span className="xs faint mono">
            档数 {gs.lotsUsed}/{d.buyLots}
          </span>
        </div>
        <div className="title-rule" />
        <div className="grid-3">
          <div>
            <div className="stat-label">现金</div>
            <div className={`stat-value${gs.cash < 0 ? ' red' : ''}`}>{wan(gs.cash)}</div>
          </div>
          <div>
            <div className="stat-label">采购人员</div>
            <div className="stat-value">{gs.depts.buy.staff}</div>
          </div>
          <div>
            <div className="stat-label">协议名额</div>
            <div className="stat-value">
              {gs.agreements.length}/{E.agreementSlots(gs)}
            </div>
          </div>
        </div>
        <div className="hint">每类原料每月最多选一个档位；长期协议每月自动到货，不占档数。</div>
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
  const d = E.derive(gs)
  const cap = E.planCapacity(gs)
  const [equip, setEquip] = useState(false)

  return (
    <>
      <div className="card">
        <div className="hstack-between">
          <h3>生产部</h3>
          <span className="xs faint mono">产能 {cap}</span>
        </div>
        <div className="title-rule" />
        <div className="grid-3">
          <div>
            <div className="stat-label">生产人员</div>
            <div className="stat-value">{gs.depts.make.staff}</div>
          </div>
          <div>
            <div className="stat-label">设备数</div>
            <div className="stat-value">{gs.equipment.length}</div>
          </div>
          <div>
            <div className="stat-label">月折旧</div>
            <div className="stat-value">{wan(d.notes ? 0 : gs.equipment.reduce((a, e) => a + Math.min(e.depreciation, Math.max(0, e.cost - e.accumulated)), 0))}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>本月生产计划</h3>
        <div className="title-rule" />
        {/*
          产能与需求必须并排给玩家看：只显示产能会诱导盲目生产，
          而卖不掉的成品会沉在库存里，占用现金却换不回收入。
        */}
        <div className="grid-3" style={{ marginBottom: 'var(--s3)' }}>
          <div>
            <div className="stat-label">本月产能</div>
            <div className="stat-value">{cap}</div>
          </div>
          <div>
            <div className="stat-label">预计需求</div>
            <div className="stat-value">{d.demand.low}</div>
          </div>
          <div>
            <div className="stat-label">成品库存</div>
            <div className="stat-value">{TIER_ORDER.reduce((a, t) => a + gs.products[t].qty, 0)}</div>
          </div>
        </div>
        <div className="stack">
          {TIER_ORDER.map((t) => {
            const p = gs.products[t]
            const bom = TIER_LABEL[t]
            const max = p.built ? E.maxProducible(gs, t) : 0
            const on = gs.plan.tier === t
            const recipe = Object.entries(E.derive(gs).materials && {})
            void recipe
            return (
              <div key={t} className={`card-item d-make${on ? ' on' : ''}`} style={{ cursor: p.built ? 'pointer' : 'default' }}>
                <span className="spine" />
                <span className="card-body">
                  <span className="hstack-between">
                    <span className="card-name">{bom}</span>
                    <span className="tag">{p.built ? `可产 ${max}` : '未解锁'}</span>
                  </span>
                  <span className="card-desc">
                    库存 {p.qty} 件 · 单位成本 {wan(p.avgCost)}
                  </span>
                  {p.built ? (
                    <span className="hstack" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
                      <button
                        className="btn btn-nav"
                        style={{ width: 'auto', padding: '2px var(--s3)' }}
                        onClick={() => g.mutate((st) => E.setPlan(st, { tier: t, qty: Math.max(0, st.plan.qty - 1) }))}
                      >
                        <span>−</span>
                      </button>
                      <span className="mono gold" style={{ minWidth: 40, textAlign: 'center' }}>
                        {on ? gs.plan.qty : 0}
                      </span>
                      <button
                        className="btn btn-nav"
                        style={{ width: 'auto', padding: '2px var(--s3)' }}
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
                        style={{ width: 'auto' }}
                        onClick={() => g.mutate((st) => E.setPlan(st, { tier: t, qty: E.maxProducible(st, t) }))}
                      >
                        <span className="btn-main xs">拉满</span>
                      </button>
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
        {/*
          产能要跟两个出口一起看：现货需求 + 确定性订单。
          订单不占现货需求，且价格高一档，所以只看现货会低估可销量。
        */}
        <div className="hint">
          按 BOM 消耗原料：低端 包材×2 + 树脂×1；中端 树脂×2 + 合金×1。产量受产能与原料双重限制。
          <br />
          销路有两条：现货（吃各层需求，见销售页）与订单（{gs.orders.reduce((a, o) => a + o.qty, 0)} 件在手，
          不占需求，价格高 1 档）。超过这两者的产量只会变成库存压住现金。
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

      {equip ? <EquipmentSheet g={g} onClose={() => setEquip(false)} /> : null}
    </>
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

function SellPage({ g }: { g: Game }) {
  const gs = g.s
  const d = E.derive(gs)
  const used = E.allocUsed(gs)

  return (
    <>
      <div className="card">
        <div className="hstack-between">
          <h3>销售部</h3>
          <span className="xs faint mono">
            资源 {used}/{d.salesResource}
          </span>
        </div>
        <div className="title-rule" />
        <div className="grid-3">
          <div>
            <div className="stat-label">销售人员</div>
            <div className="stat-value">{gs.depts.sell.staff}</div>
          </div>
          <div>
            <div className="stat-label">品牌加成</div>
            <div className="stat-value">{d.brandBonus > 0 ? `+${d.brandBonus}` : '—'}</div>
          </div>
          <div>
            <div className="stat-label">待交付订单</div>
            <div className="stat-value">{gs.orders.length}</div>
          </div>
        </div>
        <div className="hint">销售资源决定各产品层次能抢到多少现货需求；订单优先于现货结算。</div>
      </div>

      <div className="card">
        <h3>销售资源分配</h3>
        <div className="title-rule" />
        <div className="stack-sm">
          {TIER_ORDER.map((t) => {
            const p = gs.products[t]
            const alloc = gs.salesAlloc[t]
            const remaining = d.salesResource - used
            return (
              <div key={t} className="hstack-between">
                <span className="sm">
                  {TIER_LABEL[t]}
                  {!p.built ? <span className="faint xs"> · 未解锁</span> : null}
                </span>
                <span className="hstack" style={{ gap: 'var(--s2)' }}>
                  <button
                    className="btn btn-nav"
                    style={{ width: 'auto', padding: '2px var(--s3)' }}
                    onClick={() => g.mutate((st) => E.setAlloc(st, t, st.salesAlloc[t] - 1))}
                  >
                    <span>−</span>
                  </button>
                  <span className="mono gold" style={{ minWidth: 28, textAlign: 'center' }}>
                    {alloc}
                  </span>
                  <button
                    className="btn btn-nav"
                    style={{ width: 'auto', padding: '2px var(--s3)' }}
                    disabled={remaining <= 0}
                    onClick={() => g.mutate((st) => E.setAlloc(st, t, st.salesAlloc[t] + 1))}
                  >
                    <span>+</span>
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <div className="hint">
          剩余可分配 {Math.max(0, d.salesResource - used)} 点。未分配的资源不会生效。
        </div>
      </div>

      <div className="card">
        <h3>本月需求与售价</h3>
        <div className="title-rule" />
        {TIER_ORDER.map((t) => (
          <Row
            key={t}
            k={TIER_LABEL[t]}
            v={`需求 ${d.demand[t]} · 售价 ${wan(d.price[t])}`}
            cls={tierClass(d.priceShift[t])}
          />
        ))}
        <div className="hint">需求由气候与经济动能决定；售价随气候修正浮动。</div>
      </div>

      {gs.orders.length ? (
        <div className="card">
          <h3>待交付订单</h3>
          <div className="title-rule" />
          {gs.orders.map((o) => (
            <Row
              key={o.id}
              k={`${TIER_LABEL[o.tier]} × ${o.qty}`}
              v={`${o.from} · ${o.dueMonth}月前交付`}
            />
          ))}
          <div className="hint">库存充足时结算会自动交付；不足的部分失效，无惩罚。</div>
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
        <div className="hstack-between">
          <h3>研发部</h3>
          <span className="xs faint mono">人员 {gs.depts.rnd.staff}</span>
        </div>
        <div className="title-rule" />
        <div className="grid-3">
          <div>
            <div className="stat-label">月进度</div>
            <div className="stat-value">{d.rndProgress}</div>
          </div>
          <div>
            <div className="stat-label">成功率加成</div>
            <div className="stat-value">
              {d.rndRate > 0 ? `+${d.rndRate}%` : '—'}
            </div>
          </div>
          <div>
            <div className="stat-label">{d.rndCostTotal > 0 ? '本月投入' : '立项后每月'}</div>
            <div className="stat-value">{wan(d.rndCostTotal > 0 ? d.rndCostTotal : d.rndCost)}</div>
          </div>
        </div>
        <div className="hint">每月只能推进一个项目，投入按项目计入研发费用。</div>
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

  return (
    <div className="card">
      <div className="hstack-between">
        <h3>人员招聘</h3>
        <span className="xs faint mono">
          {staff}/5 人
        </span>
      </div>
      <div className="title-rule" />

      <button className="btn btn-mini" disabled={!check.ok} onClick={() => g.act((st) => E.hire(st, dept))}>
        <span className="btn-main">招聘{DEPT_NAME[dept]}</span>
        <span className="btn-sub">
          {!check.ok ? check.msg : fee > 0 ? `1 AP + ${wan(fee)}` : '1 AP'}
        </span>
      </button>

      <div className="hint">
        当前 {staff} 人 · 下次招聘费 {fee > 0 ? wan(fee) : '免费'} · 月薪 {wan(def.salary)}/人
        <br />
        {def.base}
      </div>

      <div className="section-label" style={{ marginTop: 'var(--s3)' }}>
        解锁轨道
      </div>
      <div className="unlock-track">
        {def.unlocks.map((u) => (
          <div
            key={u.at}
            className={`unlock-node${staff >= u.at ? ' done' : staff + 1 === u.at ? ' now' : ''}`}
          >
            <span className="unlock-diamond" />
            <span className="unlock-label">{u.text.slice(0, 6)}</span>
          </div>
        ))}
      </div>
      {def.unlocks.find((u) => u.at === staff + 1) ? (
        <div className="hint">下一档：{def.unlocks.find((u) => u.at === staff + 1)!.text}</div>
      ) : staff >= 5 ? (
        <div className="hint">已解锁全部档位。</div>
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
