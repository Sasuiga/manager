import { useState } from 'react'
import * as E from '../../core/engine'
import { Icon } from '../icons'
import { Sheet, Row, Bar } from '../Sheet'
import { wan, wanSigned } from '../format'
import type { Game } from '../useGame'

/**
 * 结算报表：利润表 → 资产负债表 → 比率，逐段展开。
 * 科目可点开下钻看构成。
 */
export function ReportSheet({ g, onAdvance }: { g: Game; onAdvance: () => void }) {
  const rep = g.lastReport
  const [drill, setDrill] = useState<string | null>(null)

  if (!rep) return null

  const led = rep.ledger
  const bal = rep.balance
  const p = led.parts

  if (drill) {
    return <DrillSheet name={drill} onClose={() => setDrill(null)} rep={rep} />
  }

  return (
    <Sheet
      title={`${rep.month}月 · 结算`}
      sub={`第 ${Math.ceil(rep.month / 3)} 季度 · 现金 ${wan(led.cashBegin)} → ${wan(led.cashEnd)}`}
      onClose={onAdvance}
      footer={
        <button className="btn btn-primary" onClick={onAdvance}>
          <span className="btn-main">进入 {rep.month + 1} 月</span>
        </button>
      }
    >
      {/* 生产与销售摘要 */}
      <div className="card">
        <div className="section-label">本月经营</div>
        <Row k="产量" v={`${rep.production.produced} 件（计划 ${rep.production.planned}）`} />
        <Row k="单位成本" v={wan(rep.production.unitCost)} />
        <Row k="订单交付" v={rep.sales.orders.length ? `${rep.sales.orders.reduce((a, s) => a + s.qty, 0)} 件` : '无'} />
        <Row k="现货成交" v={rep.sales.spots.length ? `${rep.sales.spots.reduce((a, s) => a + s.qty, 0)} 件` : '无'} />
        <Row
          k="需求满足率"
          v={`${(rep.sales.fillRate * 100).toFixed(0)}%`}
          cls={rep.sales.fillRate >= 0.9 ? 'green' : rep.sales.fillRate >= 0.5 ? '' : 'red'}
        />
      </div>

      {rep.warnings.length ? (
        <div className="stack-sm">
          {rep.warnings.map((w) => (
            <div key={w} className="warn">
              {w}
            </div>
          ))}
        </div>
      ) : null}

      {rep.autoPurchase.length ? (
        <div className="card">
          <div className="section-label">长期协议到货</div>
          {rep.autoPurchase.map((a, i) => (
            <Row key={i} k={`${a.name} × ${a.qty}`} v={a.skipped ? a.skipped : wan(a.total)} cls={a.skipped ? 'red' : ''} />
          ))}
        </div>
      ) : null}

      {rep.rnd ? (
        <div className="card">
          <div className="section-label">研发</div>
          <Row k={rep.rnd.name} v={`${rep.rnd.progress}/${rep.rnd.need}`} />
          <Row
            k="本月判定"
            v={rep.rnd.success === null ? '进度未满' : rep.rnd.success ? '成功' : '失败（保留进度）'}
            cls={rep.rnd.success ? 'green' : rep.rnd.success === false ? 'red' : ''}
          />
          <div style={{ marginTop: 'var(--s2)' }}>
            <Bar value={rep.rnd.progress} max={rep.rnd.need} kind="emerald" />
          </div>
        </div>
      ) : null}

      {/* 利润表 */}
      <div className="card">
        <h3>利润表</h3>
        <div className="title-rule" />
        <div className="stack-sm">
          {(
            [
              ['销售收入', led.revenue],
              ['销售成本', -led.cogs],
            ] as [string, number][]
          ).map(([k, v]) => (
            <DrillRow key={k} name={k} value={v} onClick={() => setDrill(k)} />
          ))}
          <Row k="毛利" v={wan(led.grossProfit)} cls={led.grossProfit >= 0 ? 'green' : 'red'} bold />
          {(
            [
              ['生产费用', -led.mfgExpense],
              ['销售费用', -led.sellExpense],
              ['管理费用', -led.adminExpense],
              ['研发费用', -led.rndExpense],
              ['财务费用', -led.financeExpense],
            ] as [string, number][]
          ).map(([k, v]) => (
            <DrillRow key={k} name={k} value={v} onClick={() => setDrill(k)} />
          ))}
          <Row k="营业外收入" v={wan(p['营业外收入'] ?? 0)} cls="green" />
          <Row k="所得税" v={wan(-(p['所得税'] ?? 0))} />
          <Row
            k="净利润"
            v={wan(led.netProfit)}
            cls={led.netProfit >= 0 ? 'green' : 'red'}
            bold
          />
        </div>
      </div>

      {/* 资产负债表 */}
      <div className="card">
        <h3>资产负债表</h3>
        <div className="title-rule" />
        <div className="section-label">资产</div>
        <div className="stack-sm">
          <Row k="现金" v={wan(bal.cash)} cls={bal.cash < 0 ? 'red' : ''} />
          <Row k="原料存货" v={wan(bal.inventoryMaterial)} />
          <Row k="成品存货" v={wan(bal.inventoryProduct)} />
          <Row k="待摊招聘费" v={wan(bal.prepaid)} />
          <Row k="设备净值" v={wan(bal.equipmentGross - bal.equipmentAccum)} />
          <Row k="资产合计" v={wan(bal.totalAssets)} bold />
        </div>
        <div className="section-label" style={{ marginTop: 'var(--s4)' }}>
          负债与权益
        </div>
        <div className="stack-sm">
          <Row k="借款" v={wan(bal.debt)} />
          <Row k="实收资本" v={wan(bal.paidIn)} />
          <Row k="股东实物投入" v={wan(bal.ownerCapital)} />
          <Row k="留存收益" v={wan(bal.retained)} cls={bal.retained < 0 ? 'red' : ''} />
          <Row k="负债与权益合计" v={wan(bal.debt + bal.equity)} bold />
        </div>
      </div>

      {/* 总览 */}
      <div className="card">
        <div className="section-label">总览</div>
        <Row k="累计净利润" v={wanSigned(g.s.ledgers.reduce((a, l) => a + l.netProfit, 0))} />
        <Row k="净资产" v={wan(E.netAssets(g.s))} />
        <Row k="现金" v={wan(g.s.cash)} cls={g.s.cash < 0 ? 'red' : ''} />
      </div>
    </Sheet>
  )
}

function DrillRow({ name, value, onClick }: { name: string; value: number; onClick: () => void }) {
  return (
    <button className="row" style={{ width: '100%' }} onClick={onClick}>
      <span className="row-key">
        {name} <Icon name="chevron" size={11} className="faint" />
      </span>
      <span className={`row-val ${value < 0 ? 'red' : value > 0 ? 'green' : ''}`}>
        {wan(value)}
      </span>
    </button>
  )
}

/** 科目下钻：显示构成与算法。 */
function DrillSheet({
  name,
  rep,
  onClose,
}: {
  name: string
  rep: E.SettleReport
  onClose: () => void
}) {
  const led = rep.ledger
  const p = led.parts
  const lines: [string, string][] = []

  switch (name) {
    case '销售收入':
      lines.push(['订单收入', wan(p['订单收入'] ?? 0)])
      lines.push(['现货收入', wan(p['现货收入'] ?? 0)])
      lines.push(['订单笔数', `${rep.sales.orders.length}`])
      lines.push(['现货笔数', `${rep.sales.spots.length}`])
      break
    case '销售成本':
      lines.push(['按各笔实际结转的存货价值合计', wan(led.cogs)])
      lines.push(['成交件数', `${[...rep.sales.orders, ...rep.sales.spots].reduce((a, s) => a + s.qty, 0)}`])
      lines.push(['单位成本', wan(rep.production.unitCost)])
      break
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
      lines.push(['招聘费摊销', wan(p['招聘费摊销'] ?? 0)])
      break
    case '研发费用':
      lines.push(['研发人员薪酬', wan(p['研发人员薪酬'] ?? 0)])
      lines.push(['项目投入', wan(p['研发项目投入'] ?? 0)])
      break
    case '财务费用':
      lines.push(['借款利息', wan(p['借款利息'] ?? 0)])
      lines.push(['事件与杂项支出', wan(p['事件与杂项支出'] ?? 0)])
      lines.push(['卡牌费用', wan(p['卡牌与事件费用'] ?? 0)])
      break
    default:
      lines.push(['金额', wan(0)])
  }

  return (
    <Sheet title={name} sub={`${rep.month}月 · 明细`} onClose={onClose}>
      <div className="card">
        {lines.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </div>
      <div className="hint">
        事件开销与打牌费用在支付当月确认为费用，结算时不再重复扣减现金。
      </div>
    </Sheet>
  )
}
