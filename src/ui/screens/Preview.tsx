import { useState } from 'react'
import * as E from '../../core/engine'
import { TIER_LABEL } from '../../data/game'
import { Row } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

export function PreviewPage({ g, onSettle }: { g: Game; onSettle: () => void }) {
  const preview = E.previewOperations(g.s)

  return (
    <>
      <div className="card">
        <h3>{g.s.month}月经营预演</h3>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          根据当前采购、生产与销售安排推演。现货成交将在结算时确定。
        </p>
      </div>

      <div className="card">
        <div className="section-label">预计结果</div>
        <PreviewMetric title="预计收入" value={moneyRange(preview.revenue)}>
          <Row k="订单收入" v={wan(preview.orderRevenue)} />
          <Row k="现货收入" v={moneyRange(preview.spotRevenue)} />
        </PreviewMetric>
        <PreviewMetric title="预计毛利" value={moneyRange(preview.grossProfit)}>
          <Row k="预计收入" v={moneyRange(preview.revenue)} />
          <Row k="预计销售成本" v={moneyRange(preview.cogs)} />
        </PreviewMetric>
        <PreviewMetric title="预计期末现金" value={moneyRange(preview.cashEnd)}>
          <Row k="当前现金" v={wan(preview.currentCash)} />
          <Row k="采购付款" v={wan(preview.purchaseSpend)} />
          <Row k="订单回款" v={wan(preview.orderRevenue)} />
          <Row k="现货回款" v={moneyRange(preview.spotRevenue)} />
          <Row k="月末支付" v={moneyRange(preview.monthEndPayments)} />
        </PreviewMetric>
      </div>

      <div className="card">
        <div className="section-label">本月安排</div>
        <Row k="采购支出" v={wan(preview.purchaseSpend)} />
        <Row k="计划生产" v={`${preview.plannedProduction} 件`} />
        <Row k="产能分配" v={`${preview.capacityUsed} / ${preview.capacityTotal}`} />
        <Row k="订单交付" v={`${preview.orderQty} 件`} />
        <Row k="现货预计成交" v={numberRange(preview.spotQty, '件')} />
        <Row k="销售资源分配" v={`${preview.salesResourceUsed} / ${preview.salesResourceTotal}`} />
      </div>

      {preview.products.length ? (
        <div className="stack-sm">
          <div className="section-label">分产品结果</div>
          {preview.products.map((product) => (
            <div className="card" key={product.tier}>
              <div className="hstack-between">
                <h3>{TIER_LABEL[product.tier]}</h3>
                <span className="tag">{product.planned} 件</span>
              </div>
              <div className="title-rule" />
              <Row k="计划生产" v={`${product.planned} 件`} />
              <Row k="订单交付" v={`${product.orderQty} 件`} />
              <Row k="现货预计成交" v={numberRange(product.spotQty, '件')} />
              <Row k="预计收入" v={moneyRange(product.revenue)} />
              <Row k="预计毛利" v={moneyRange(product.grossProfit)} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onSettle}>
          <span className="btn-main">确认本月方案并结算</span>
          <span className="btn-sub">现货成交结果将在结算时确定</span>
        </button>
      </div>
    </>
  )
}

function PreviewMetric({ title, value, children }: { title: string; value: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid var(--line)', padding: 'var(--s2) 0' }}>
      <button
        className="row"
        style={{ width: '100%', border: 0, background: 'transparent', padding: 0, color: 'inherit', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="row-key">{title}</span>
        <span className="row-val mono">{value} <span className="faint xs">{open ? '收起' : '展开'}</span></span>
      </button>
      {open ? <div style={{ marginTop: 'var(--s2)', paddingLeft: 'var(--s3)' }}>{children}</div> : null}
    </div>
  )
}

function moneyRange(v: E.ValueRange): string {
  return v.min === v.max ? wan(v.min) : `${wan(v.min)} ～ ${wan(v.max)}`
}

function numberRange(v: E.ValueRange, suffix = ''): string {
  return v.min === v.max ? `${v.min}${suffix}` : `${v.min}～${v.max}${suffix}`
}
