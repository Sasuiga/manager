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
        <h3>{g.s.month}月经营预算</h3>
        <div className="title-rule" />
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          根据当前采购、生产与销售安排推演。现货成交将在结算时确定。
        </p>
      </div>

      <div className="card">
        <h3>预计结果</h3>
        <div className="title-rule" />
        <PreviewMetric title="预计收入" value={moneyRange(preview.revenue)}>
          {preview.products.length ? preview.products.map((product) => (
            <PreviewMetric key={product.tier} nested title={TIER_LABEL[product.tier]} value={moneyRange(product.revenue)}>
              <Row k="订单收入" v={wan(product.orderRevenue)} />
              <Row k="现货收入" v={moneyRange(product.spotRevenue)} />
            </PreviewMetric>
          )) : <Row k="暂无产品明细" v="" cls="faint" />}
        </PreviewMetric>
        <PreviewMetric title="预计毛利" value={moneyRange(preview.grossProfit)}>
          {preview.products.length ? preview.products.map((product) => (
            <PreviewMetric key={product.tier} nested title={TIER_LABEL[product.tier]} value={moneyRange(product.grossProfit)}>
              <Row k="单件毛利" v={`${wan(product.unitGrossProfit)}/件`} />
              <Row k="订单毛利" v={wan(product.orderGrossProfit)} />
              <Row k="现货毛利" v={moneyRange(product.spotGrossProfit)} />
            </PreviewMetric>
          )) : <Row k="暂无产品明细" v="" cls="faint" />}
        </PreviewMetric>
        <PreviewMetric title="预计期末现金" value={moneyRange(preview.cashEnd)}>
          <PreSettleCashBreakdown preview={preview} />
        </PreviewMetric>
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          预计毛利按统一口径：生产单位成本（计划后库存材料成本 + 固定成本分摊）得出单件毛利，乘以预计销售区间；与损益表毛利（库存账面成本结转、费用另计）可能不同。
        </p>
      </div>

      <div className="card">
        <h3>本月安排</h3>
        <div className="title-rule" />
        <Row k="采购支出" v={wan(preview.purchaseSpend)} />
        <Row k="计划生产" v={`${preview.plannedProduction} 件`} />
        <Row k="产能分配" v={`${preview.capacityUsed} / ${preview.capacityTotal}`} />
        <Row k="订单交付" v={`${preview.orderQty} 件`} />
        <Row k="现货预计成交" v={numberRange(preview.spotQty, '件')} />
        <Row k="销售资源分配" v={`${preview.salesResourceUsed} / ${preview.salesResourceTotal}`} />
      </div>

      {preview.rnd.length ? (
        <div className="card">
          <h3>研发进度</h3>
          <div className="title-rule" />
          <p className="card-desc" style={{ color: 'var(--muted)' }}>
            结算时按 seed 判定成败，与现货区间无关。
          </p>
          {preview.rnd.map((r) => (
            <Row
              key={r.projectId}
              k={r.name}
              v={
                r.success === null
                  ? `${r.progress}/${r.need} 进度未满`
                  : r.success
                    ? '成功，下月生效'
                    : '失败，进度保留可重投'
              }
              cls={r.success ? 'green' : r.success === false ? 'red' : ''}
            />
          ))}
        </div>
      ) : null}

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

function PreviewMetric({ title, value, children, nested }: { title: string; value: string; children: React.ReactNode; nested?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: nested ? undefined : '1px solid var(--line)', padding: 'var(--s2) 0' }}>
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

/** 预计期末现金的两段桥接：结算前 = 纯消耗（确定性，不含回款），结算后 = 回款到账（区间）。 */
function PreSettleCashBreakdown({ preview }: { preview: E.OperatingPreview }) {
  const ps = preview.preSettle
  const overSpend = ps.cashAfter < 0
  return (
    <>
      <div className="section-label">结算前 · 纯消耗（未含回款）</div>
      <Row k="月初现金" v={wan(ps.cashBegin)} />
      {ps.purchaseSpend > 0 ? <Row k="− 采购计划" v={wan(ps.purchaseSpend)} /> : null}
      {ps.agreementSpend > 0 ? <Row k="− 协议自动采购" v={wan(ps.agreementSpend)} /> : null}
      {ps.overtimePay > 0 ? <Row k="− 加班费" v={wan(ps.overtimePay)} /> : null}
      {ps.rndInvest > 0 ? <Row k="− 研发投入" v={wan(ps.rndInvest)} /> : null}
      {ps.interest > 0 ? <Row k="− 借款利息" v={wan(ps.interest)} /> : null}
      {ps.wagePaid > 0 ? <Row k="− 上月工资" v={wan(ps.wagePaid)} /> : null}
      <Row k="结算前现金" v={wan(ps.cashAfter)} cls={overSpend ? 'red' : ''} bold />
      {overSpend ? (
        <div className="warn">
          计划超出资金能力：纯消耗超出月初现金 {wan(-ps.cashAfter)}
          {ps.agreementSpend > 0 ? '，协议到货可能因现金不足整月跳过（锁定期照计）' : ''}
        </div>
      ) : null}
      <div className="section-label" style={{ marginTop: 'var(--s2)' }}>结算后 · 回款到账</div>
      {preview.orderRevenue > 0 ? <Row k="+ 订单回款" v={wan(preview.orderRevenue)} /> : null}
      {preview.spotRevenue.max > 0 ? <Row k="+ 现货回款" v={moneyRange(preview.spotRevenue)} /> : null}
      {preview.tax.max > 0 ? <Row k="− 所得税" v={moneyRange(preview.tax)} /> : null}
      <Row k="预计期末现金" v={moneyRange(preview.cashEnd)} bold />
    </>
  )
}

function moneyRange(v: E.ValueRange): string {
  return v.min === v.max ? wan(v.min) : `${wan(v.min)} ～ ${wan(v.max)}`
}

function numberRange(v: E.ValueRange, suffix = ''): string {
  return v.min === v.max ? `${v.min}${suffix}` : `${v.min}～${v.max}${suffix}`
}
