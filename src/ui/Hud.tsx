import * as E from '../core/engine'
import { CLIMATE_NAMES } from '../data/game'
import { Icon } from './icons'
import { wan } from './format'
import type { Game } from './useGame'

/**
 * 顶部 HUD：环境时间 + 核心资源 + 目标胶囊。
 * 结构按 UI 文档 §三：先让玩家知道「这个月为什么贵 / 好卖」，再是资源。
 */
export function Hud({
  g,
  onGoals,
}: {
  g: Game
  onGoals: () => void
}) {
  const s = g.s
  const hud = E.hudView(s)
  const goals = E.goalDisplay(s)

  const goalText = (() => {
    const basicDone = goals.basic ? E.checkGoal(goals.basic.track, goals.basic.current) : false
    if (goals.challenge) {
      const t = goals.challenge.track
      const cur = goals.challenge.current
      const r = t.target > 0 ? Math.min(1, cur / t.target) : 0
      return (
        <span className="hstack" style={{ gap: 'var(--s2)' }}>
          <span className="hstack" style={{ gap: 4 }}>
            基本
            {basicDone ? (
              <Icon name="check" size={13} className="green" />
            ) : (
              <Icon name="clock" size={13} className="faint" />
            )}
          </span>
          <span className="faint">·</span>
          <span>挑战 {Math.round(r * 100)}%</span>
        </span>
      )
    }
    return (
      <span>
        <span className="hstack" style={{ gap: 4 }}>
          基本
          {basicDone ? <Icon name="check" size={13} className="green" /> : <Icon name="clock" size={13} className="faint" />}
        </span>
        <span className="faint"> · 本季无挑战目标</span>
      </span>
    )
  })()

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hstack" style={{ gap: 'var(--s2)' }}>
          <span className="hud-month">{s.month}月</span>
          <span className="faint xs mono">Q{Math.ceil(s.month / 3)}</span>
        </div>
        <div className="hstack" style={{ gap: 'var(--s2)' }}>
          <span className="hud-climate">{CLIMATE_NAMES[s.climate as keyof typeof CLIMATE_NAMES]}</span>
        </div>
      </div>

      <div className="month-dots" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className={`month-dot${i + 1 < s.month ? ' past' : i + 1 === s.month ? ' now' : ''}`}
          />
        ))}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">
            <Icon name="cash" size={11} /> 现金
          </div>
          <div className={`stat-value${s.cash < 0 ? ' red' : ''}`}>{wan(s.cash)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <Icon name="ap" size={11} /> AP
          </div>
          <div className="stat-value">
            {s.ap}
            <span className="faint">/{hud.apMax}</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <Icon name="card" size={11} /> 提案
          </div>
          <div className="stat-value">
            {s.plays}
            <span className="faint">/{hud.playsMax}</span>
          </div>
        </div>
      </div>

      <button className="goal-chip" onClick={onGoals}>
        <span className="hstack" style={{ gap: 'var(--s2)', minWidth: 0 }}>
          <span className="faint xs nowrap">目标</span>
          {goalText}
        </span>
        <Icon name="chevron" size={14} className="faint" />
      </button>
    </div>
  )
}
