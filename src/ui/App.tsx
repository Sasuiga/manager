import { useMemo, useState } from 'react'
import * as E from '../core/engine'
import { useGame, type Game } from './useGame'
import { Hud } from './Hud'
import { Sheet, Row } from './Sheet'
import { TitleScreen, EndScreen } from './screens/Title'
import { EventScreen } from './screens/Event'
import { DrawScreen } from './screens/Draw'
import { BoardScreen } from './screens/Board'
import { TurnScreen } from './screens/Turn'
import { ReportSheet } from './screens/Report'
import { GoalsSheet } from './screens/Goals'
import { Panel } from './screens/Panel'
import { Icon } from './icons'
import { wan, TIER_ORDER } from './format'

type Tab = 'run' | 'report' | 'log'

export function App() {
  const [seed, setSeed] = useState<number | null>(null)
  const g = useGame(seed)

  if (!g || seed === null) return <TitleScreen onStart={setSeed} />
  return <GameRoot g={g} onRestart={() => setSeed(null)} />
}

function GameRoot({ g, onRestart }: { g: Game; onRestart: () => void }) {
  const s = g.s
  const [tab, setTab] = useState<Tab>('run')
  const [dept, setDept] = useState<E.Dept>('ops')
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

  // 经营阶段尚未开始（例如刚开局）
  if (s.phase !== 'operate' && s.phase !== 'report') {
    // 自动进入事件阶段，不再让玩家多点一次
    E.beginMonthEvent(s)
    g.mutate(() => {})
    return null
  }

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
          <TurnScreen g={g} dept={dept} onDept={setDept} onSettle={() => setSettling(true)} />
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
  const [step, setStep] = useState<'confirm' | 'report'>('confirm')
  const s = g.s
  const hud = E.hudView(s)

  const risks = useMemo(() => {
    const out: string[] = []
    if (s.cash < 0) out.push('现金已为负，结算后会直接破产')
    const goals = E.goalDisplay(s)
    if (goals.basic && !E.checkGoal(goals.basic.track, goals.basic.current))
      out.push('基本目标尚未达标，结算后将判定为未完成')
    if (s.hand.length > s.handMax) out.push(`提案超出上限 ${s.hand.length - s.handMax} 项`)
    if (s.ap > 0) out.push(`还剩 ${s.ap} 点 AP 未使用`)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, g.tick])

  if (step === 'confirm') {
    const plannedProd = TIER_ORDER.reduce((a, t) => a + (s.plan.tier === t ? s.plan.qty : 0), 0)
    return (
      <Sheet
        title="结束本月"
        sub={`${s.month}月 · 结算后进入 ${s.month + 1} 月`}
        onClose={onDone}
        footer={
          <button
            className="btn btn-primary"
            onClick={() => {
              g.setReport(E.settleMonth(g.s))
              setStep('report')
            }}
          >
            <span className="btn-main">确认结算</span>
          </button>
        }
      >
        <div className="card">
          <div className="section-label">本月安排</div>
          <Row
            k="生产"
            v={plannedProd > 0 ? `待生产 ${plannedProd} 件（已确认部分已入库）` : '未安排'}
            cls={plannedProd > 0 ? '' : 'red'}
          />
          <Row k="产能" v={`${E.planCapacity(s)}`} />
          <Row k="销售资源" v={`${E.allocUsed(s)}/${hud.salesResource}`} />
          <Row k="现金" v={wan(s.cash)} cls={s.cash < 0 ? 'red' : ''} />
          <Row k="AP" v={`${s.ap}/${hud.apMax}`} />
          <Row k="可实施数" v={`${s.plays}/${hud.playsMax}`} />
        </div>

        {risks.length ? (
          <div className="stack-sm">
            <div className="section-label">提示</div>
            {risks.map((r) => (
              <div key={r} className={r.includes('破产') ? 'warn' : 'info'}>
                {r}
              </div>
            ))}
          </div>
        ) : null}
      </Sheet>
    )
  }

  return (
    <ReportSheet
      g={g}
      onAdvance={() => {
        E.nextMonth(g.s)
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
