import * as E from '../../core/engine'
import type { GoalTrack } from '../../core/engine'
import { Icon } from '../icons'
import { Sheet, Bar } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

const MONEY_METRICS: string[] = [
  'netProfitQ',
  'revenueQ',
  'cashEnd',
  'netAssetsEnd',
  'grossProfitQ',
  'debt',
  'inventory',
  'salaryQ',
  'unitCostQ',
]
const COUNT_METRICS: string[] = ['staffTotal', 'hiresQ', 'equipmentCount']

/** 目标追踪：本季度基本 / 挑战目标 + 历史记录。 */
export function GoalsSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s
  const goals = E.goalDisplay(s)

  return (
    <Sheet title="董事会目标" sub={`第 ${Math.ceil(s.month / 3)} 季度 · ${E.hudView(s).climateName}`} onClose={onClose}>
      {goals.basic ? (
        <GoalCard track={goals.basic.track} current={goals.basic.current} kind="basic" />
      ) : null}

      {goals.challenge ? (
        <GoalCard
          track={goals.challenge.track}
          current={goals.challenge.current}
          kind="challenge"
        />
      ) : (
        <div className="info">本季度未选择挑战目标。</div>
      )}

      {s.challengeOffered.length ? (
        <div className="card">
          <div className="section-label">待选挑战目标</div>
          {s.challengeOffered.map((t, i) => (
            <div key={i} className="stack-sm" style={{ paddingBottom: 'var(--s2)' }}>
              <span className="sm">{t.def.name}</span>
              <span className="xs faint">{t.def.desc}</span>
            </div>
          ))}
        </div>
      ) : null}

      {s.goalHistory.length ? (
        <div className="card">
          <div className="section-label">历史记录</div>
          {[...s.goalHistory].reverse().map((h, i) => (
            <div key={i} className="row">
              <span className="row-key">
                Q{h.quarter} · {h.name}
              </span>
              <span className="row-val hstack" style={{ gap: 'var(--s2)' }}>
                <span className="hstack" style={{ gap: 3 }}>
                  基本
                  <Icon name={h.basic ? 'check' : 'cross'} size={12} className={h.basic ? 'green' : 'red'} />
                </span>
                {h.challenge !== null ? (
                  <span className="hstack" style={{ gap: 3 }}>
                    挑战
                    <Icon name={h.challenge ? 'check' : 'cross'} size={12} className={h.challenge ? 'gold' : 'faint'} />
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <div className="section-label">董事会耐心</div>
        <div className="row">
          <span className="row-key">连续未达成</span>
          <span className={`row-val ${s.misses > 0 ? 'red' : ''}`}>
            {s.misses === 0 ? '本季度已达标' : `${s.misses} / 2`}
          </span>
        </div>
        <div className="row">
          <span className="row-key">累计目标分</span>
          <span className="row-val gold">{s.goalPoints}</span>
        </div>
        <div className="hint">
          基本目标是硬指标：连续两个季度未达成即被免职。
          挑战目标二选一，只影响得分，不影响去留。
        </div>
      </div>
    </Sheet>
  )
}

function GoalCard({
  track,
  current,
  kind,
}: {
  track: GoalTrack
  current: number
  kind: 'basic' | 'challenge'
}) {
  const done = E.checkGoal(track, current)
  const fmt = (v: number) => {
    const m = track.def.metric
    if (MONEY_METRICS.includes(m)) return wan(v)
    if (COUNT_METRICS.includes(m)) return `${v} 人`
    return `${v}`
  }

  const icon = done ? 'check' : 'clock'
  const iconCls = done ? 'green' : 'faint'

  return (
    <div className="card">
      <div className="hstack-between">
        <span className="hstack" style={{ gap: 'var(--s2)' }}>
          <span className={`tag${kind === 'challenge' ? ' gold' : ''}`}>{kind === 'basic' ? '基本' : '挑战'}</span>
          <span className="card-name">{track.def.name}</span>
        </span>
        <span className={`hstack ${iconCls}`} style={{ gap: 'var(--s1)' }}>
          <Icon name={icon as 'check'} size={15} />
          <span className="xs">{done ? '已达标' : '进行中'}</span>
        </span>
      </div>
      <div className="card-desc" style={{ marginTop: 'var(--s2)' }}>
        {track.def.desc}
      </div>

      <div className="hstack-between" style={{ marginTop: 'var(--s3)' }}>
        <span className="xs faint">
          当前 <span className="mono gold">{fmt(current)}</span>
        </span>
        <span className="xs faint">
          目标 <span className="mono">{fmt(track.target)}</span>
        </span>
      </div>
      <div style={{ marginTop: 'var(--s1)' }}>
        <Bar value={current} max={track.target} kind={done ? 'emerald' : undefined} done={done} />
      </div>

      <div className="hstack-between" style={{ marginTop: 'var(--s2)' }}>
        <span className="xs faint">剩余差距</span>
        <span className="xs mono">
          {done ? '—' : fmt(Math.max(0, track.target - current))}
        </span>
      </div>
      <div className="hint">
        {track.def.compare === 'lte' ? '不高于' : '达到'} {fmt(track.target)} 即达成 · 奖励 {track.def.points} 分
      </div>
    </div>
  )
}
