import * as E from '../../core/engine'
import { TIERS, TIER_LABEL } from '../../data/game'
import { Icon } from '../icons'
import { Corners } from '../ornaments'
import { Row } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

const SCOPE_NAME: Record<string, string> = {
  cash: '资金',
  buy: '采购',
  make: '生产',
  sell: '销售',
  rnd: '研发',
  ops: '运营',
}

/**
 * 事件阶段：即时事件直接显示结果并进入经营；
 * 抉择 / 机会事件给出选项，选完进入经营。
 */
export function EventScreen({ g }: { g: Game }) {
  const s = g.s
  const ev = s.currentEvent

  if (!ev) {
    return (
      <div className="title-wrap">
        <div className="hero title-card">
          <Corners />
          <p className="muted">本月无事件。</p>
          <div style={{ marginTop: 'var(--s5)' }}>
            <button className="btn btn-primary" onClick={() => enter()}>
              <span className="btn-main">进入立项</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const enter = () => {
    s.eventResolved = true
    E.enterDraw(s)
    g.mutate(() => {})
  }

  const polarityClass =
    ev.polarity === 'good' ? 'good' : ev.polarity === 'bad' ? 'bad' : ''

  return (
    <div className="title-wrap" style={{ alignItems: 'flex-start', paddingTop: 'var(--s6)' }}>
      <div className="hero" style={{ width: '100%', maxWidth: 520 }}>
        <Corners />

        <div className="hstack" style={{ gap: 'var(--s3)' }}>
          <span className="medal">
            <Icon name="log" size={18} />
          </span>
          <div>
            <div className="hud-month" style={{ fontSize: 'var(--fs-2xl)' }}>
              {s.month}月 · 事件
            </div>
            <div className="xs faint">{E.hudView(s).climateName} · {E.hudView(s).momentum}</div>
          </div>
        </div>

        <div className="divider" />

        <div className={`event-card ${polarityClass}`}>
          <div className="hstack-between">
            <span className="event-name">{ev.name}</span>
            <span className="event-scope">{SCOPE_NAME[ev.scope] ?? ev.scope}</span>
          </div>
          <div className="title-rule" />
          <p className="event-body">{ev.text}</p>
        </div>

        {/* 即时事件：无选项 */}
        {ev.type === 'instant' ? (
          <div style={{ marginTop: 'var(--s5)' }}>
            <div className="section-label">即刻效果</div>
            <div className="card">
              <InstantEffect g={g} />
            </div>
            <div style={{ marginTop: 'var(--s5)' }}>
              <button className="btn btn-primary" onClick={enter}>
                <span className="btn-main">继续</span>
                <span className="btn-sub">进入本月立项</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* 抉择事件 */}
        {ev.type === 'choice' && ev.options ? (
          <div style={{ marginTop: 'var(--s5)' }}>
            <div className="section-label">你的决定</div>
            <div className="stack">
              {ev.options.map((o, i) => {
                const cost: string[] = []
                if (o.cost?.ap) cost.push(`${o.cost.ap} AP`)
                if (o.cost?.cash) cost.push(wan(o.cost.cash))
                return (
                  <button
                    key={i}
                    className="card-item d-ops"
                    onClick={() => {
                      E.applyEventOption(s, i)
                      enter()
                    }}
                  >
                    <span className="spine" />
                    <span className="card-body">
                      <span className="card-name">{o.label}</span>
                      <span className="card-desc">{o.detail}</span>
                      {cost.length ? <span className="card-cost">消耗 {cost.join(' + ')}</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* 机会事件 */}
        {ev.type === 'chance' && ev.chance ? (
          <div style={{ marginTop: 'var(--s5)' }}>
            <div className="section-label">机会</div>
            <div className="card">
              <Row k="效果" v={ev.chance.detail} />
              {ev.chance.cost.cash ? <Row k="代价" v={wan(ev.chance.cost.cash)} /> : null}
              {ev.chance.cost.ap ? <Row k="代价" v={`${ev.chance.cost.ap} AP`} /> : null}
            </div>
            <div className="stack" style={{ marginTop: 'var(--s4)' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  E.acceptChance(s)
                  enter()
                }}
              >
                <span className="btn-main">把握机会</span>
              </button>
              <button
                className="btn btn-nav"
                onClick={() => {
                  E.skipEvent(s)
                  enter()
                }}
              >
                <span className="btn-main">放弃</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 即时事件的效果来自 monthMods，这里翻译成人话。 */
function InstantEffect({ g }: { g: Game }) {
  const d = E.derive(g.s)
  const notes = d.notes ?? []
  const rows: [string, string][] = []

  if (d.demand) {
    const parts = TIERS.map((t) => `${TIER_LABEL[t]} ${d.demand[t]}`).join(' · ')
    rows.push(['本月需求', parts])
  }
  if (d.capacity) rows.push(['本月产能', `${d.capacity}`])
  if (d.buyLots) rows.push(['采购档数', `${d.buyLots}`])

  return (
    <div className="stack-sm">
      {rows.map(([k, v]) => (
        <Row key={k} k={k} v={v} />
      ))}
      {notes.map((n) => (
        <Row key={n} k={n} v="" />
      ))}
      {!rows.length && !notes.length ? <span className="muted sm">本月无额外修正。</span> : null}
    </div>
  )
}
