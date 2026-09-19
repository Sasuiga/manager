import { useState } from 'react'
import * as E from '../../core/engine'
import { Icon } from '../icons'
import { Row, Sheet } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

/** 报表页与日志页共用的容器（底部无部门轨道）。 */
export function Panel({ g, mode }: { g: Game; mode: 'report' | 'log' }) {
  return mode === 'report' ? <ReportPanel g={g} /> : <LogPanel g={g} />
}

/* ══════════════ 报表 ══════════════ */

function ReportPanel({ g }: { g: Game }) {
  const s = g.s
  const [month, setMonth] = useState<number | null>(
    s.ledgers.length ? s.ledgers[s.ledgers.length - 1].month : null,
  )
  const idx = month === null ? -1 : s.ledgers.findIndex((l) => l.month === month)
  const led = idx >= 0 ? s.ledgers[idx] : undefined
  const bal = idx >= 0 ? s.balanceHistory[idx] : undefined
  const [drill, setDrill] = useState<string | null>(null)

  if (!led || !bal) {
    return (
      <div className="scroll">
        <div className="card">
          <h3>报表</h3>
          <div className="title-rule" />
          <p className="muted sm">
            还没有已结算的月份。完成第一次结算后，这里会出现利润表、资产负债表与财务比率。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="scroll">
      <div className="wrap">
        {s.ledgers.map((l) => (
          <button
            key={l.month}
            className={`btn btn-mini${l.month === month ? ' on' : ''}`}
            style={{
              width: 'auto',
              boxShadow:
                l.month === month
                  ? 'inset 0 0 0 1px var(--line-gold-hi), var(--glow-gold)'
                  : undefined,
            }}
            onClick={() => setMonth(l.month)}
          >
            <span className="btn-main xs">{l.month}月</span>
          </button>
        ))}
      </div>

      <ProfitCard led={led} onDrill={setDrill} />
      <BalanceCard bal={bal} />
      <RatioCard led={led} bal={bal} />

      <div className="card">
        <div className="section-label">累计</div>
        <Cumulative g={g} />
      </div>

      {drill ? <DrillSheet name={drill} led={led} onClose={() => setDrill(null)} /> : null}
    </div>
  )
}

function Cumulative({ g }: { g: Game }) {
  const s = g.s
  const sum = s.ledgers.reduce(
    (a, l) => ({
      revenue: a.revenue + l.revenue,
      gross: a.gross + l.grossProfit,
      net: a.net + l.netProfit,
    }),
    { revenue: 0, gross: 0, net: 0 },
  )
  return (
    <>
      <Row k="累计收入" v={wan(sum.revenue)} />
      <Row k="累计毛利" v={wan(sum.gross)} />
      <Row k={`累计净利润（${s.ledgers.length} 个月）`} v={wan(sum.net)} cls={sum.net >= 0 ? 'green' : 'red'} />
      <Row k="净资产" v={wan(E.netAssets(s))} />
      <Row k="现金" v={wan(s.cash)} cls={s.cash < 0 ? 'red' : ''} />
      <Row k="借款" v={wan(s.debt)} />
    </>
  )
}

function ProfitCard({ led, onDrill }: { led: E.Ledger; onDrill: (n: string) => void }) {
  const p = led.parts
  const line = (name: string, v: number, drillable = true) => (
    <button key={name} className="row" style={{ width: '100%' }} onClick={() => drillable && onDrill(name)}>
      <span className="row-key">
        {name}
        {drillable ? ' ' : ''}
        {drillable ? <Icon name="chevron" size={11} className="faint" /> : null}
      </span>
      <span className={`row-val ${v < 0 ? 'red' : v > 0 ? 'green' : ''}`}>{wan(v)}</span>
    </button>
  )

  return (
    <div className="card">
      <h3>{led.month}月 · 利润表</h3>
      <div className="title-rule" />
      <div className="stack-sm">
        {line('销售收入', led.revenue)}
        {line('销售成本', -led.cogs)}
        <div className="row bold">
          <span className="row-key">毛利</span>
          <span className="row-val">{wan(led.grossProfit)}</span>
        </div>
        {line('生产费用', -led.mfgExpense)}
        {line('销售费用', -led.sellExpense)}
        {line('管理费用', -led.adminExpense)}
        {line('研发费用', -led.rndExpense)}
        {line('财务费用', -led.financeExpense)}
        <div className="row">
          <span className="row-key">营业外收入</span>
          <span className="row-val green">{wan(p['营业外收入'] ?? 0)}</span>
        </div>
        <div className="row">
          <span className="row-key">所得税</span>
          <span className="row-val red">{wan(-(p['所得税'] ?? 0))}</span>
        </div>
        <div className="row bold">
          <span className="row-key">净利润</span>
          <span className="row-val">{wan(led.netProfit)}</span>
        </div>
      </div>
      <div className="hint">
        现金 {wan(led.cashBegin)} → {wan(led.cashEnd)}
      </div>
    </div>
  )
}

function BalanceCard({ bal }: { bal: E.BalanceSheet }) {
  const net = bal.equipmentGross - bal.equipmentAccum
  return (
    <div className="card">
      <h3>资产负债表</h3>
      <div className="title-rule" />
      <div className="section-label">资产</div>
      <div className="stack-sm">
        <Row k="现金" v={wan(bal.cash)} cls={bal.cash < 0 ? 'red' : ''} />
        <Row k="原料存货" v={wan(bal.inventoryMaterial)} />
        <Row k="成品存货" v={wan(bal.inventoryProduct)} />
        <Row k="待摊招聘费" v={wan(bal.prepaid)} />
        <Row
          k={`设备净值（原值 ${wan(bal.equipmentGross)}）`}
          v={wan(net)}
        />
        <div className="row bold">
          <span className="row-key">资产合计</span>
          <span className="row-val">{wan(bal.totalAssets)}</span>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 'var(--s4)' }}>
        负债与所有者权益
      </div>
      <div className="stack-sm">
        <Row k="借款" v={wan(bal.debt)} />
        <Row k="实收资本" v={wan(bal.paidIn)} />
        <Row k="股东实物投入" v={wan(bal.ownerCapital)} />
        <Row k="留存收益" v={wan(bal.retained)} cls={bal.retained < 0 ? 'red' : ''} />
        <div className="row bold">
          <span className="row-key">负债与权益合计</span>
          <span className="row-val">{wan(bal.debt + bal.equity)}</span>
        </div>
      </div>
      <div className="hint">资产 = 负债 + 所有者权益。借款只作负债列示，不从权益中扣减。</div>
    </div>
  )
}

function RatioCard({ led, bal }: { led: E.Ledger; bal: E.BalanceSheet }) {
  const eq = bal.equity
  const rows: [string, string][] = [
    ['毛利率', led.revenue > 0 ? `${((led.grossProfit / led.revenue) * 100).toFixed(1)}%` : '—'],
    ['净利率', led.revenue > 0 ? `${((led.netProfit / led.revenue) * 100).toFixed(1)}%` : '—'],
    ['需求满足率', led.demandTotal > 0 ? `${((led.demandFilled / led.demandTotal) * 100).toFixed(0)}%` : '—'],
    ['资产负债率', bal.totalAssets > 0 ? `${((bal.debt / bal.totalAssets) * 100).toFixed(0)}%` : '—'],
    ['债务权益比', eq > 0 ? `${((bal.debt / eq) * 100).toFixed(0)}%` : '—'],
    ['权益乘数', eq > 0 ? (bal.totalAssets / eq).toFixed(2) : '—'],
  ]
  return (
    <div className="card">
      <h3>财务比率</h3>
      <div className="title-rule" />
      <div className="stack-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="row">
            <span className="row-key">{k}</span>
            <span className="row-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 科目下钻。 */
function DrillSheet({ name, led, onClose }: { name: string; led: E.Ledger; onClose: () => void }) {
  const p = led.parts
  const lines: [string, string][] = []
  let note = ''

  switch (name) {
    case '销售收入':
      lines.push(['订单收入', wan(p['订单收入'] ?? 0)])
      lines.push(['现货收入', wan(p['现货收入'] ?? 0)])
      lines.push(['订单笔数', `${led.orders.length}`])
      lines.push(['现货笔数', `${led.spots.length}`])
      note = '订单优先于现货结算；订单不足交付时剩余量失效，无惩罚。'
      break
    case '销售成本':
      lines.push(['成交件数', `${[...led.orders, ...led.spots].reduce((a, s) => a + s.qty, 0)}`])
      lines.push(['结转金额', wan(led.cogs)])
      lines.push([
        '平均单位成本',
        wan(
          [...led.orders, ...led.spots].reduce((a, s) => a + s.qty, 0) > 0
            ? led.cogs / [...led.orders, ...led.spots].reduce((a, s) => a + s.qty, 0)
            : 0,
        ),
      ])
      note = '按移动加权平均单价等比例出库，与入库使用同一个成本口径。'
      break
    case '生产费用':
      lines.push(['生产人员薪酬', wan(p['生产人员薪酬'] ?? 0)])
      lines.push(['设备折旧', wan(p['设备折旧'] ?? 0)])
      lines.push(['加班费', wan(p['加班费'] ?? 0)])
      note = '折旧在提足原值后停止，不会把设备账面价值压成负数。'
      break
    case '销售费用':
      lines.push(['销售人员薪酬', wan(p['销售人员薪酬'] ?? 0)])
      break
    case '管理费用':
      lines.push(['运营人员薪酬', wan(p['运营人员薪酬'] ?? 0)])
      lines.push(['采购人员薪酬', wan(p['采购人员薪酬'] ?? 0)])
      lines.push(['招聘费摊销', wan(p['招聘费摊销'] ?? 0)])
      note = '招聘费先资本化为待摊费用，按 6 个月摊销。'
      break
    case '研发费用':
      lines.push(['研发人员薪酬', wan(p['研发人员薪酬'] ?? 0)])
      lines.push(['项目投入', wan(p['研发项目投入'] ?? 0)])
      break
    case '财务费用':
      lines.push(['借款利息', wan(p['借款利息'] ?? 0)])
      lines.push(['事件与杂项支出', wan(p['事件与杂项支出'] ?? 0)])
      lines.push(['提案费用', wan(p['提案与事件费用'] ?? 0)])
      note = '事件与实施费用在支付当时已扣现金，结算时只确认费用，不重复扣款。'
      break
  }

  return (
    <Sheet title={name} sub={`${led.month}月 · 明细`} onClose={onClose}>
      <div className="card">
        {lines.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </div>
      {note ? <div className="hint">{note}</div> : null}
    </Sheet>
  )
}

/* ══════════════ 日志 ══════════════ */

const LOG_KINDS: [string, string][] = [
  ['all', '全部'],
  ['event', '事件'],
  ['board', '董事会'],
  ['settle', '结算'],
  ['action', '操作'],
]

function LogPanel({ g }: { g: Game }) {
  const s = g.s
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState<number | null>(null)
  const list = s.log.filter((l) => filter === 'all' || l.kind === filter)

  return (
    <div className="scroll">
      <div className="wrap">
        {LOG_KINDS.map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-mini${filter === k ? ' on' : ''}`}
            style={{ width: 'auto' }}
            onClick={() => setFilter(k)}
          >
            <span className="btn-main xs">{label}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <h3>公司纪事</h3>
        <div className="title-rule" />
        {list.length === 0 ? (
          <p className="muted sm">暂无记录。</p>
        ) : (
          <div className="stack-sm">
            {[...list].reverse().map((l, i) => (
              <div key={`${l.month}-${l.kind}-${i}`}>
                <button
                  className="row"
                  style={{ width: '100%' }}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span className="row-key" style={{ flex: 1, textAlign: 'left', color: 'var(--ink)' }}>
                    <span className="faint xs mono">{l.month}月</span> {l.text}
                  </span>
                  {l.detail?.length ? <Icon name="chevron" size={13} className="faint" /> : null}
                </button>
                {open === i && l.detail?.length ? (
                  <div className="stack-sm" style={{ paddingLeft: 'var(--s3)', paddingBottom: 'var(--s2)' }}>
                    {l.detail.map((d) => (
                      <span key={d} className="xs muted">
                        {d}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
