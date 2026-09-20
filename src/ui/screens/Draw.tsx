import { useState } from 'react'
import * as E from '../../core/engine'
import { CARD_BY_ID, CLIMATE_HINTS, DEPT_SHORT } from '../../data/game'
import { Icon } from '../icons'
import { Corners } from '../ornaments'
import { Sheet } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

/**
 * 立项阶段：每月开始时、事件之后独立的一次活动（设计文档 §5 / UI §九）。
 *
 * 抽 N 项、选 M 项入手，未选中的放回提案库；确认后才进入经营布局阶段，
 * 因此一个月只能立项这一次。进入立项阶段时 enterDraw 自动抽 N 项到「待选」区，
 * 玩家一次看到全部 N 张，从中选 M 张入手。开局（第 1 月）同样是「五选三」。
 */
export function DrawScreen({ g }: { g: Game }) {
  const s = g.s
  const hud = E.hudView(s)
  const [view, setView] = useState<'hand' | 'discard' | 'deck' | null>(null)
  const [discardMode, setDiscardMode] = useState(false)
  const [discardSelected, setDiscardSelected] = useState<string[]>([])

  const full = s.drawnSelected.length >= s.drawM
  const noDraw = s.drawn.length === 0 && s.deck.length === 0
  const overLimit = s.hand.length - s.handMax

  /** 确认后若提案超上限，弹出提案列表让玩家选择废掉以腾出空间。 */
  const confirm = () => {
    // 常规情况：抽 N 张选 M 张，未选中的放回牌库后进入经营。
    const r = E.confirmDraw(s)
    if (!r.ok) {
      g.setToast(r.msg)
      return
    }
    if (s.hand.length > s.handMax) {
      setDiscardMode(true)
      setDiscardSelected([])
      setView('hand')
      return
    }
    E.enterOperate(s)
    g.mutate(() => {})
  }

  /** 废案模式关闭时，若提案仍超上限则自动开启。 */
  const closeSheet = () => {
    setView(null)
    if (discardMode) {
      setDiscardMode(false)
      setDiscardSelected([])
      if (s.hand.length > s.handMax) setView('hand')
    }
  }

  /** 切换废案选中状态。 */
  const toggleDiscard = (uid: string) => {
    setDiscardSelected((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    )
  }

  /** 确认废案：一次性废掉所有选中的提案，然后进入经营。 */
  const confirmDiscard = () => {
    if (discardSelected.length === 0) return
    g.mutate((st) => {
      for (const uid of discardSelected) E.discardCard(st, uid)
    })
    setDiscardMode(false)
    setDiscardSelected([])
    setView(null)
    E.enterOperate(s)
    g.mutate(() => {})
  }

  return (
    <div className="title-wrap" style={{ alignItems: 'flex-start', paddingTop: 'var(--s6)' }}>
      <div className="hero" style={{ width: '100%', maxWidth: 520 }}>
        <Corners />

        <div className="hstack" style={{ gap: 'var(--s3)' }}>
          <span className="medal">
            <Icon name="card" size={18} />
          </span>
          <div>
            <div className="hud-month" style={{ fontSize: 'var(--fs-2xl)' }}>
              {s.month}月 · 立项阶段
            </div>
            <div className="xs faint">{hud.climateName}｜{CLIMATE_HINTS[s.climate]} · 每月一次</div>
          </div>
        </div>

        <div className="divider" />

        {/* 本局参数：抽 N 选 M / 提案 / 可实施数 / AP */}
        <div className="card">
          <div className="xs mono">抽 {s.drawN} 选 {s.drawM}</div>
          <div className="title-rule" />
          <div className="grid-4">
            <button className="stat-cell click" onClick={() => setView('hand')}
              aria-label="查看储备提案">
              <span className="stat-label">储备提案</span>
              <span className="stat-value">
                {s.hand.length}
                <span className="faint">/{s.handMax}</span>
              </span>
            </button>
            <div className="stat-cell">
              <span className="stat-label">可实施数</span>
              <span className="stat-value">
                {s.plays}
                <span className="faint">/{hud.playsMax}</span>
              </span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">AP</span>
              <span className="stat-value">
                {s.ap}
                <span className="faint">/{hud.apMax}</span>
              </span>
            </div>
            <button className="stat-cell click" onClick={() => setView('discard')}
              aria-label="查看已实施提案">
              <span className="stat-label">已实施</span>
              <span className="stat-value">{s.playedThisMonth.length}</span>
            </button>
          </div>
        </div>

        {/* 提案库已空：本月跳过立项 */}
        {noDraw ? (
          <div className="card" style={{ marginTop: 'var(--s4)' }}>
            <h3>本月立项</h3>
            <div className="title-rule" />
            <p className="muted sm">储备提案已空，本月跳过立项。</p>
          </div>
        ) : null}

        {/* 选牌：抽到的 N 张（或开局赠送的 3 张） */}
        {s.drawn.length > 0 ? (
          <div style={{ marginTop: 'var(--s4)' }}>
            <div className="section-label">
              选 {s.drawM} 张入手
            </div>
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
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* 确认选择 */}
        <div style={{ marginTop: 'var(--s4)' }}>
          <div>
            {s.drawn.length > 0 ? (
              <button className="btn btn-primary" disabled={s.drawnSelected.length === 0} onClick={confirm}>
                <span className="btn-main">确认选择</span>
              </button>
            ) : noDraw ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  E.enterOperate(s)
                  g.mutate(() => {})
                }}
              >
                <span className="btn-main">进入经营</span>
                <span className="btn-sub">提案库已空，本月不立项</span>
              </button>
            ) : null}
          </div>
        </div>

        {view ? (
          <Sheet
            title={view === 'hand' ? (discardMode ? `提案 · 请废 ${overLimit} 项` : '提案') : view === 'discard' ? '已实施' : '提案库'}
            sub={
              view === 'hand'
                ? `${s.hand.length}/${s.handMax} 项${discardMode ? ` · 已选废 ${discardSelected.length}/${overLimit}` : ''}`
                : view === 'discard'
                  ? `${s.discard.length} 项`
                  : `剩余 ${s.deck.length} 项`
            }
            onClose={closeSheet}
            footer={
              view === 'hand' && discardMode ? (
                <button
                  className="btn btn-primary"
                  disabled={discardSelected.length < overLimit}
                  onClick={confirmDiscard}
                >
                  <span className="btn-main">确认废案（{discardSelected.length}/{overLimit}）</span>
                  <span className="btn-sub">废掉选中提案，进入本月经营</span>
                </button>
              ) : undefined
            }
          >
            <div className="stack">
              {view === 'hand' && discardMode ? (
                <div className="info" style={{ marginBottom: 'var(--s2)' }}>
                  点击提案选中，选中后高亮显示。需废 {overLimit} 项才能保留新立项的提案。
                </div>
              ) : null}
              {(view === 'hand' ? s.hand : view === 'discard' ? s.discard : s.deck).map((c) => {
                const def = CARD_BY_ID[c.defId]
                const discarded = discardSelected.includes(c.uid)
                return (
                  <div
                    key={c.uid}
                    className={`card-item d-${def.kind}${discardMode ? (discarded ? ' on' : '') : ''}`}
                    style={{ position: 'relative', cursor: view === 'hand' && discardMode ? 'pointer' : undefined }}
                    onClick={() => view === 'hand' && discardMode ? toggleDiscard(c.uid) : undefined}
                  >
                    <span className="spine" />
                    <span className="card-body">
                      <span className="hstack-between">
                        <span className="card-name">
                          【{DEPT_SHORT[def.kind]}】{def.name}
                          {c.empowered ? <span className="tag gold" style={{ marginLeft: 6 }}>强化</span> : null}
                        </span>
                        {view === 'hand' && discardMode ? (
                          <span className={`tag${discarded ? ' gold' : ''}`}>{discarded ? '将弃' : '选择'}</span>
                        ) : null}
                      </span>
                      <span className="card-desc">{def.text}</span>
                      {view === 'hand' && !discardMode ? (
                        <span className="card-cost">
{E.cardPlayCost(s, def) > 0 ? `实施费用 ${wan(E.cardPlayCost(s, def))}` : '实施费用：无'}
                        </span>
                      ) : null}
                    </span>
                  </div>
                )
              })}
              {(view === 'hand' ? s.hand : view === 'discard' ? s.discard : s.deck).length === 0 ? (
                <p className="muted sm">空空如也。</p>
              ) : null}
            </div>
          </Sheet>
        ) : null}
      </div>
    </div>
  )
}
