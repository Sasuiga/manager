import * as E from '../../core/engine'
import { Icon } from '../icons'
import { Corners } from '../ornaments'
import type { Game } from '../useGame'

/** 标题页：hero 全配（角饰 + 大衬线标题 + T1 主按钮）。 */
export function TitleScreen({ onStart }: { onStart: (seed: number) => void }) {
  const start = () => onStart(Math.floor(Math.random() * 1e9))

  return (
    <div className="title-wrap">
      <div className="hero title-card">
        <Corners />
        <div className="hstack" style={{ justifyContent: 'center', marginBottom: 'var(--s5)' }}>
          <span className="medal lg">
            <Icon name="seal" size={24} />
          </span>
        </div>
        <h1 className="title-name">总经理十二个月</h1>
        <div className="divider" />
        <p className="title-sub">
          一间小厂，一辆破车，十二个月。
          <br />
          从复苏到萧条，你要让账面好看，也要让董事会满意。
        </p>

        <div style={{ marginTop: 'var(--s6)' }} className="stack">
          <button className="btn btn-primary" onClick={start}>
            <span className="btn-main">开始新的一局</span>
            <span className="btn-sub">十二个月 · 单机 · 随机气候</span>
          </button>
        </div>

        <div className="hint" style={{ marginTop: 'var(--s5)' }}>
          采购原料、安排生产、分配销售资源、推进研发。
          <br />
          每月结束会自动生成利润表与资产负债表——数字骗不了人。
        </div>
      </div>
    </div>
  )
}

/** 终局页：hero 全配 + 得分明细。 */
export function EndScreen({ g, onRestart }: { g: Game; onRestart: () => void }) {
  const s = g.s
  const sc = E.computeScore(s)
  const won = s.result === 'won'
  const net = E.netAssets(s)

  const rows: [string, number, string][] = [
    ['盈利分', sc.profit, '12 个月累计净利润 ÷ 10w × 1.5'],
    ['资产分', sc.assets, '期末净资产 ÷ 10w × 1.0'],
    ['目标分', sc.goal, '董事会目标累计得分'],
    ['成就分', sc.achievement, '达成成就的加分'],
  ]

  return (
    <div className="title-wrap">
      <div className="hero title-card" style={{ maxWidth: 480 }}>
        <Corners />
        <div className="hstack" style={{ justifyContent: 'center', marginBottom: 'var(--s4)' }}>
          <span className="medal lg">
            <Icon name={won ? 'check' : 'cross'} size={22} />
          </span>
        </div>

        <h1 className="title-name" style={{ fontSize: 'var(--fs-3xl)' }}>
          {won ? '执掌期满' : '提前出局'}
        </h1>

        {!won && s.lossReason ? (
          <p className="title-sub" style={{ color: 'var(--red)' }}>
            {s.lossReason}
          </p>
        ) : null}

        <div className="divider" />

        <div className="stack-sm" style={{ textAlign: 'left' }}>
          <div className="row bold">
            <span className="row-key">总得分</span>
            <span className="row-val" style={{ fontSize: 'var(--fs-2xl)' }}>
              {sc.total}
            </span>
          </div>
          {rows.map(([k, v, hint]) => (
            <div key={k}>
              <div className="row">
                <span className="row-key">{k}</span>
                <span className={`row-val ${v < 0 ? 'red' : v > 0 ? 'green' : ''}`}>
                  {v > 0 ? '+' : ''}
                  {v}
                </span>
              </div>
              <div className="hint" style={{ marginTop: 0, marginBottom: 'var(--s1)' }}>
                {hint}
              </div>
            </div>
          ))}
          <div className="row">
            <span className="row-key">累计净利润</span>
            <span className={`row-val ${sc.netsum < 0 ? 'red' : 'green'}`}>{sc.netsum / 10}w</span>
          </div>
          <div className="row">
            <span className="row-key">期末净资产</span>
            <span className={`row-val ${net < 0 ? 'red' : ''}`}>{net / 10}w</span>
          </div>
        </div>

        {s.achievements.length ? (
          <>
            <div className="section-label" style={{ marginTop: 'var(--s5)' }}>
              成就
            </div>
            <div className="wrap" style={{ justifyContent: 'center' }}>
              {s.achievements.map((id) => (
                <span key={id} className="tag gold">
                  {id}
                </span>
              ))}
            </div>
          </>
        ) : null}

        <div style={{ marginTop: 'var(--s6)' }}>
          <button className="btn btn-primary" onClick={onRestart}>
            <span className="btn-main">再来一局</span>
          </button>
        </div>
      </div>
    </div>
  )
}
