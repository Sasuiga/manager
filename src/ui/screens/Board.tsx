import { useState } from 'react'
import * as E from '../../core/engine'
import type { GoalTrack } from '../../core/engine'
import { Icon } from '../icons'
import { Corners } from '../ornaments'
import { Bar } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

/**
 * 董事会目标阶段：展示基本目标，并要求从两个挑战目标中选一个。
 * 选完进入本月事件。
 */
export function BoardScreen({ g }: { g: Game }) {
  const s = g.s
  const goals = E.goalDisplay(s)
  const [pick, setPick] = useState<number | null>(null)

  const offered = s.challengeOffered
  const needChoose = offered.length > 0

  const confirm = () => {
    if (needChoose) {
      if (pick === null) {
        g.setToast('请选择一个挑战目标')
        return
      }
      E.chooseChallenge(s, pick)
    }
    E.beginMonthEvent(s)
    g.mutate(() => {})
  }

  return (
    <div className="title-wrap" style={{ alignItems: 'flex-start', paddingTop: 'var(--s6)' }}>
      <div className="hero" style={{ width: '100%', maxWidth: 520 }}>
        <Corners />
        <div className="hstack" style={{ gap: 'var(--s3)' }}>
          <span className="medal">
            <Icon name="report" size={18} />
          </span>
          <div>
            <h1 style={{ fontSize: 'var(--fs-2xl)' }}>第 {Math.ceil(s.month / 3)} 季度 · 董事会</h1>
            <div className="xs faint">
              {s.month}月 · 本季度目标已下达
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* 基本目标：必达 */}
        {goals.basic ? (
          <div className="card" style={{ boxShadow: 'inset 0 0 0 1px var(--line-gold), 0 0 0 1px var(--line)' }}>
            <div className="hstack-between">
              <span className="tag">基本</span>
              <span className="xs faint">必达 · 未达成记 1 次失误</span>
            </div>
            <div className="card-name" style={{ marginTop: 'var(--s2)' }}>
              {goals.basic.track.def.name}
            </div>
            <div className="card-desc">{goals.basic.track.def.desc}</div>
            <div className="hstack-between" style={{ marginTop: 'var(--s3)' }}>
              <span className="xs faint">当前进度</span>
              <span className="xs mono gold">{goalValue(goals.basic.track, goals.basic.current)}</span>
            </div>
            <div style={{ marginTop: 'var(--s1)' }}>
              <Bar value={goals.basic.current} max={goals.basic.track.target} done={E.checkGoal(goals.basic.track, goals.basic.current)} />
            </div>
          </div>
        ) : null}

        {/* 挑战目标：二选一 */}
        {needChoose ? (
          <>
            <div className="section-label" style={{ marginTop: 'var(--s5)' }}>
              挑战目标 · 二选一
            </div>
            <div className="stack">
              {offered.map((t, i) => (
                <button
                  key={t.def.name + i}
                  className={`card-item d-ops${pick === i ? ' on' : ''}`}
                  style={{ boxShadow: pick === i ? undefined : 'inset 0 0 0 1px var(--line)' }}
                  onClick={() => setPick(i)}
                >
                  <span className="spine" />
                  <span className="card-body">
                    <span className="hstack-between">
                      <span className="card-name">{t.def.name}</span>
                      <span className="tag gold">+{t.def.points} 分</span>
                    </span>
                    <span className="card-desc">{t.def.desc}</span>
                    <span className="card-cond">{thresholdText(t)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="hint">未选中的挑战目标本季度不再追踪，但仍可在目标面板中查看。</div>
          </>
        ) : (
          <div className="info" style={{ marginTop: 'var(--s4)' }}>
            本季度挑战目标已选定。
          </div>
        )}

        <div style={{ marginTop: 'var(--s6)' }}>
          <button className="btn btn-primary" onClick={confirm}>
            <span className="btn-main">{needChoose ? '确认选择并开始本月' : '开始本月'}</span>
            <span className="btn-sub">{s.month}月 · {E.hudView(s).climateName}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function goalValue(t: GoalTrack, cur: number) {
  const m = t.def.metric
  const isMoney = ['netProfitQ', 'revenueQ', 'cashEnd', 'netAssetsEnd', 'grossProfitQ', 'debt', 'inventory', 'salaryQ', 'unitCostQ'].includes(m)
  const isCount = ['staffTotal', 'hiresQ', 'equipmentCount'].includes(m)
  const fmt = (v: number) => (isMoney ? wan(v) : isCount ? `${v} 人` : `${v}`)
  return `${fmt(cur)} / ${fmt(t.target)}`
}

function thresholdText(t: GoalTrack) {
  const cmp = t.def.compare === 'lte' ? '不高于' : '达到'
  const m = t.def.metric
  const isMoney = ['netProfitQ', 'revenueQ', 'cashEnd', 'netAssetsEnd', 'grossProfitQ', 'debt', 'inventory', 'salaryQ'].includes(m)
  const val = isMoney ? wan(t.target) : `${t.target}`
  return `需${cmp} ${val}`
}

