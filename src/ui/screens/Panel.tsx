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

/**
 * 报表页（重做）：只有一页，不再「每月一张报表」切换。
 * 展示最近 2 个月（本期 / 上期）并列对照，与正常财务报表的本期/上期风格一致；
 * 列头直接用具体月数（如「2月 / 1月」）而非「本期 / 上期」——
 * 结算后玩家已进入下月，写「本期」容易与当前经营月混淆。
 * 仅结算过 1 个月时，第二列留空（—）。
 */
function ReportPanel({ g }: { g: Game }) {
  const s = g.s
  const n = s.ledgers.length
  const cur = n > 0 ? s.ledgers[n - 1] : undefined
  const prev = n > 1 ? s.ledgers[n - 2] : undefined
  const curBal = n > 0 ? s.balanceHistory[n - 1] : undefined
  const prevBal = n > 1 ? s.balanceHistory[n - 2] : undefined
  const [drill, setDrill] = useState<{ item: string; month: number } | null>(null)

  if (!cur || !curBal) {
    return (
      <div className="scroll">
        <div className="card">
          <h3>财务报表</h3>
          <div className="title-rule" />
          <p className="muted sm">尚无已结算月份。</p>
        </div>
      </div>
    )
  }

  // 列头用具体月数：「2月 / 1月」「2月末 / 1月末」，不写「本期 / 上期」
  const periodHead: [string, string] = [`${cur.month}月`, prev ? `${prev.month}月` : '—']
  const balanceHead: [string, string] = [`${cur.month}月末`, prev ? `${prev.month}月末` : '—']
  const drillLed = drill ? s.ledgers.find((l) => l.month === drill.month) : undefined

  return (
    <div className="scroll">
      <div className="card">
        <h3>利润表</h3>
        <div className="title-rule" />
        <StmtTable
          head={periodHead}
          curMonth={cur.month}
          prevMonth={prev?.month ?? 0}
          rows={pnlRows(cur, prev)}
          onDrill={(item, month) => setDrill({ item, month })}
        />
        <div className="hint">
          现金：{cur.month}月 {wan(cur.cashBegin)} → {wan(cur.cashEnd)}
          {prev ? `；${prev.month}月 ${wan(prev.cashBegin)} → ${wan(prev.cashEnd)}` : ''}
        </div>
      </div>

      <div className="card">
        <h3>资产负债表</h3>
        <div className="title-rule" />
        <StmtTable head={balanceHead} curMonth={cur.month} prevMonth={prev?.month ?? 0} rows={balRows(curBal, prevBal)} />
      </div>

      <div className="card">
        <h3>财务比率</h3>
        <div className="title-rule" />
        <StmtTable head={periodHead} curMonth={cur.month} prevMonth={prev?.month ?? 0} rows={ratioRows(cur, curBal, prev, prevBal)} />
      </div>

      <div className="card">
        <div className="section-label">累计</div>
        <Cumulative g={g} />
      </div>

      {drill && drillLed ? <DrillSheet name={drill.item} led={drillLed} onClose={() => setDrill(null)} /> : null}
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

/** 金额单元格：undefined → 留空（—）；sign 决定着色（sign = 正负着色，neg = 仅负数红）。 */
type Cell = { text: string; cls?: string; drill?: string }
type RowDef =
  | { kind: 'section'; label: string }
  | { kind: 'row'; label: string; cur: Cell; prev: Cell; bold?: boolean }

const DASH: Cell = { text: '—' }

const money = (v: number | undefined, sign: 'sign' | 'neg' | 'none' = 'none', drill?: string): Cell => {
  if (v === undefined) return { text: '—', drill }
  let cls = ''
  if (sign === 'sign') cls = v < 0 ? 'red' : v > 0 ? 'green' : ''
  else if (sign === 'neg') cls = v < 0 ? 'red' : ''
  return { text: wan(v), cls, drill }
}

/** 两列表报表：项目 | 本期 | 上期（期末），与正常财务报表版式一致；金额格可下钻。 */
function StmtTable({
  head,
  rows,
  curMonth,
  prevMonth,
  onDrill,
}: {
  head: [string, string]
  rows: RowDef[]
  curMonth: number
  prevMonth: number
  onDrill?: (item: string, month: number) => void
}) {
  const val = (c: Cell, month: number) => {
    const cls = `stmt-val${c.cls ? ` ${c.cls}` : ''}`
    const item = c.drill
    if (item && onDrill)
      return (
        <button className={`${cls} click`} onClick={() => onDrill(item, month)}>
          {c.text}
          <Icon name="chevron" size={10} className="faint" />
        </button>
      )
    return <span className={cls}>{c.text}</span>
  }

  return (
    <div className="stmt">
      <div className="stmt-head">
        <span>项目</span>
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      {rows.map((r, i) =>
        r.kind === 'section' ? (
          <div key={r.label} className="stmt-section">
            {r.label}
          </div>
        ) : (
          <div key={`${r.label}-${i}`} className={`stmt-row${r.bold ? ' bold' : ''}`}>
            <span className="stmt-label">{r.label}</span>
            {val(r.cur, curMonth)}
            {val(r.prev, prevMonth)}
          </div>
        ),
      )}
    </div>
  )
}

/** 利润表行：本期金额 / 上期金额；可下钻科目点开后看构成。 */
function pnlRows(cur: E.Ledger, prev: E.Ledger | undefined): RowDef[] {
  const L = (
    label: string,
    f: (l: E.Ledger) => number,
    opts: { bold?: boolean; sign?: 'sign' | 'none'; drill?: boolean } = {},
  ): RowDef => ({
    kind: 'row',
    label,
    cur: money(f(cur), opts.sign ?? 'sign', opts.drill === false ? undefined : label),
    prev: prev ? money(f(prev), opts.sign ?? 'sign', opts.drill === false ? undefined : label) : DASH,
    bold: opts.bold,
  })
  return [
    L('销售收入', (l) => l.revenue),
    L('销售成本', (l) => -l.cogs),
    L('毛利', (l) => l.grossProfit, { bold: true, drill: false }),
    L('生产费用', (l) => -l.mfgExpense),
    L('销售费用', (l) => -l.sellExpense),
    L('管理费用', (l) => -l.adminExpense),
    L('研发费用', (l) => -l.rndExpense),
    L('财务费用', (l) => -l.financeExpense),
    L('营业外收入', (l) => l.parts['营业外收入'] ?? 0, { sign: 'none', drill: false }),
    L('所得税', (l) => -(l.parts['所得税'] ?? 0), { sign: 'none', drill: false }),
    L('净利润', (l) => l.netProfit, { bold: true, drill: false }),
  ]
}

/** 资产负债表行：期末余额 / 上期末余额。 */
function balRows(cur: E.BalanceSheet, prev: E.BalanceSheet | undefined): RowDef[] {
  const L = (
    label: string,
    f: (b: E.BalanceSheet) => number,
    opts: { bold?: boolean; sign?: 'neg' | 'none' } = {},
  ): RowDef => ({
    kind: 'row',
    label,
    cur: money(f(cur), opts.sign ?? 'none'),
    prev: prev ? money(f(prev), opts.sign ?? 'none') : DASH,
    bold: opts.bold,
  })
  return [
    { kind: 'section', label: '资产' },
    L('现金', (b) => b.cash, { sign: 'neg' }),
    L('原料存货', (b) => b.inventoryMaterial),
    L('成品存货', (b) => b.inventoryProduct),
    L('设备净值', (b) => b.equipmentGross - b.equipmentAccum),
    L('资产合计', (b) => b.totalAssets, { bold: true }),
    { kind: 'section', label: '负债与权益' },
    L('借款', (b) => b.debt),
    L('应付职工薪酬', (b) => b.wagePayable),
    L('实收资本', (b) => b.paidIn),
    L('股东实物投入', (b) => b.ownerCapital),
    L('留存收益', (b) => b.retained, { sign: 'neg' }),
    L('负债与权益合计', (b) => b.debt + b.wagePayable + b.equity, { bold: true }),
  ]
}

const RATIO_DEFS: { label: string; calc: (l: E.Ledger, b: E.BalanceSheet) => string }[] = [
  { label: '毛利率', calc: (l) => (l.revenue > 0 ? `${((l.grossProfit / l.revenue) * 100).toFixed(1)}%` : '—') },
  { label: '净利率', calc: (l) => (l.revenue > 0 ? `${((l.netProfit / l.revenue) * 100).toFixed(1)}%` : '—') },
  { label: '需求满足率', calc: (l) => (l.demandTotal > 0 ? `${((l.demandFilled / l.demandTotal) * 100).toFixed(0)}%` : '—') },
  { label: '资产负债率', calc: (_l, b) => (b.totalAssets > 0 ? `${(((b.debt + b.wagePayable) / b.totalAssets) * 100).toFixed(0)}%` : '—') },
  { label: '债务权益比', calc: (_l, b) => (b.equity > 0 ? `${((b.debt / b.equity) * 100).toFixed(0)}%` : '—') },
  { label: '权益乘数', calc: (_l, b) => (b.equity > 0 ? (b.totalAssets / b.equity).toFixed(2) : '—') },
]

function ratioRows(cur: E.Ledger, curBal: E.BalanceSheet, prev?: E.Ledger, prevBal?: E.BalanceSheet): RowDef[] {
  return RATIO_DEFS.map((d) => ({
    kind: 'row' as const,
    label: d.label,
    cur: { text: d.calc(cur, curBal) },
    prev: prev && prevBal ? { text: d.calc(prev, prevBal) } : DASH,
  }))
}

/** 科目下钻。 */
function DrillSheet({ name, led, onClose }: { name: string; led: E.Ledger; onClose: () => void }) {
  const p = led.parts
  const lines: [string, string][] = []

  switch (name) {
    case '销售收入':
      lines.push(['订单收入', wan(p['订单收入'] ?? 0)])
      lines.push(['现货收入', wan(p['现货收入'] ?? 0)])
      lines.push(['订单笔数', `${led.orders.length}`])
      lines.push(['现货笔数', `${led.spots.length}`])
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
      break
    case '生产费用':
    case '生产费用':
      lines.push(['生产人员薪酬', wan(p['生产人员薪酬'] ?? 0)])
      lines.push(['设备折旧', wan(p['设备折旧'] ?? 0)])
      lines.push(['加班费', wan(p['加班费'] ?? 0)])
      break
    case '销售费用':
      lines.push(['销售人员薪酬', wan(p['销售人员薪酬'] ?? 0)])
      break
    case '管理费用':
      lines.push(['运营人员薪酬', wan(p['运营人员薪酬'] ?? 0)])
      lines.push(['采购人员薪酬', wan(p['采购人员薪酬'] ?? 0)])
      lines.push(['招聘费（净）', wan(p['招聘费'] ?? 0)])
      lines.push(['提案费用', wan(p['提案费用'] ?? 0)])
      break
    case '研发费用':
      lines.push(['研发人员薪酬', wan(p['研发人员薪酬'] ?? 0)])
      lines.push(['项目投入', wan(p['研发项目投入'] ?? 0)])
      break
    case '财务费用':
      lines.push(['借款利息', wan(p['借款利息'] ?? 0)])
      lines.push(['事件与杂项支出', wan(p['事件与杂项支出'] ?? 0)])
      break
  }

  return (
    <Sheet title={name} sub={`${led.month}月 · 明细`} onClose={onClose}>
      <div className="card">
        {lines.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </div>
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
