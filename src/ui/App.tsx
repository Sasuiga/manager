import { useState } from 'react'
import * as E from '../core/engine'
import { useGame, type Game } from './useGame'
import { Hud } from './Hud'
import { TitleScreen, EndScreen } from './screens/Title'
import { EventScreen } from './screens/Event'
import { DrawScreen } from './screens/Draw'
import { BoardScreen } from './screens/Board'
import { TurnScreen, type TurnView } from './screens/Turn'
import { ReportSheet } from './screens/Report'
import { GoalsSheet } from './screens/Goals'
import { Panel } from './screens/Panel'
import { Icon } from './icons'

type Tab = 'run' | 'report' | 'log'

export function App() {
  const [run, setRun] = useState<{ seed: number } | null>(null)
  const g = useGame(run?.seed ?? null)

  if (!g || run === null) return <TitleScreen onStart={(seed) => setRun({ seed })} />
  return <GameRoot g={g} onRestart={() => setRun(null)} />
}

function GameRoot({ g, onRestart }: { g: Game; onRestart: () => void }) {
  const s = g.s
  const [tab, setTab] = useState<Tab>('run')
  const [dept, setDept] = useState<TurnView>('buy')
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [settling, setSettling] = useState(false)

  if (s.result !== 'playing' || s.phase === 'summary' || s.phase === 'gameover') {
    return <EndScreen g={g} onRestart={onRestart} />
  }

  // 事件：抽到事件后需处理
  if (s.phase === 'event' && !s.eventResolved) return <EventScreen g={g} />

  // 董事会：选挑战目标（每季度初）
  if (s.challengeOffered.length > 0) return <BoardScreen g={g} />

  // 立项阶段：每月开始、事件之后独立的一次活动
  if (s.phase === 'draw') return <DrawScreen g={g} />

  return (
    <>
      <div className="app">
        <Hud g={g} onGoals={() => setGoalsOpen(true)} />

        <div className="tabs">
          {(
            [
              ['run', '经营'],
              ['report', '报表'],
              ['log', '日志'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} className={`btn btn-nav${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
              <span className="btn-main">{label}</span>
            </button>
          ))}
        </div>

        {tab === 'run' ? (
          <TurnScreen
            g={g}
            dept={dept}
            onDept={setDept}
            onSettle={() => {
              g.setReport(E.settleMonth(g.s))
              setSettling(true)
            }}
          />
        ) : tab === 'report' ? (
          <Panel g={g} mode="report" />
        ) : (
          <Panel g={g} mode="log" />
        )}
      </div>

      {goalsOpen ? <GoalsSheet g={g} onClose={() => setGoalsOpen(false)} /> : null}
      {settling ? <SettleFlow g={g} onDone={() => setSettling(false)} /> : null}
      {g.toast ? <Toast msg={g.toast} onClose={() => g.setToast(null)} /> : null}
    </>
  )
}

/** 结算 → 报表 → 进入下月。 */
function SettleFlow({ g, onDone }: { g: Game; onDone: () => void }) {
  const s = g.s
  return (
    <ReportSheet
      g={g}
      onAdvance={() => {
        E.nextMonth(s)
        g.setReport(null)
        onDone()
      }}
    />
  )
}

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="sheet-overlay" onClick={onClose} style={{ alignItems: 'center' }}>
      <div
        className="card"
        style={{ maxWidth: 320, margin: '0 auto var(--s6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hstack" style={{ gap: 'var(--s3)' }}>
          <Icon name="warn" size={18} className="gold" />
          <span>{msg}</span>
        </div>
        <div style={{ marginTop: 'var(--s3)' }}>
          <button className="btn btn-primary" onClick={onClose}>
            <span className="btn-main">知道了</span>
          </button>
        </div>
      </div>
    </div>
  )
}
