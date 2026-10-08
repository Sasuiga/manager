import { useState } from 'react'
import * as E from '../../core/engine'
import { TIER_LABEL, CLIMATE_NAMES } from '../../data/game'
import { Row } from '../Sheet'
import { wan } from '../format'
import type { Game } from '../useGame'

export function PreviewPage({ g, onSettle }: { g: Game; onSettle: () => void }) {
  const preview = E.previewOperations(g.s)

  return (
    <>
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
        <PreviewMetric title="预计下期期初现金" value={moneyRange(preview.cashEnd)}>
          <PreSettleCashBreakdown preview={preview} />
        </PreviewMetric>
      </div>

      {preview.rnd.length ? (
        <div className="card">
          <h3>研发进度</h3>
          <div className="title-rule" />
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

      {/* 市场情报（K7）：下季度气候转移概率表（动能 × 步长 的真实转移分布） */}
      {E.derive(g.s).climateOddsVisible ? (
        <div className="card">
          <h3>下季度气候展望（K7 强化市场情报）</h3>
          <div className="title-rule" />
          <div className="stack-sm">
            {(Object.entries(g.s.nextClimateOdds) as [string, number][])
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([cl, v]) => (
                <Row key={cl} k={CLIMATE_NAMES[cl as keyof typeof CLIMATE_NAMES] ?? cl} v={`${(v * 100).toFixed(1)}%`} />
              ))}
          </div>
          {E.derive(g.s).climateOddsPlus ? (
            <p className="hint">强化版：高概率风险气候（需求下降 / 供给涨价）宜提前布局库存与定价。</p>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onSettle}>
          <span className="btn-main">确认本月方案并结算</span>
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

/** 预计下期期初现金的三段桥接（按资金时间序，逐行参与加总）：
 *  本期 = 期末资金（回款前，确定性，明细在顶部「期末资金」菜单）；
 *  结算边界 = 回款到账（区间）→ 下期期初现金；
 *  下期 = 期初现金 − 挂账负债（应付职工薪酬/利息估算/挂账收付）→ 下期资金缺口提示。 */
function PreSettleCashBreakdown({ preview }: { preview: E.OperatingPreview }) {
  const ps = preview.preSettle
  const overSpend = ps.cashAfter < 0
  /** 下期挂账负债：应付职工薪酬（本月计提，下月实付）+ 借款利息（估算）+ 挂账收付；缺口 = max(0, 净挂账 − 预计下期期初现金下限)。 */
  const nl = preview.nextLiabilities
  const availableAfter: E.ValueRange = { min: preview.cashEnd.min - nl.net, max: preview.cashEnd.max - nl.net }
  const gap = Math.max(0, -availableAfter.min)
  return (
    <>
      <div className="section-label">本期 · 现金计划（回款前）</div>
      {/* 期初到期末不再逐项列示，直接取结果；明细见顶部 HUD「期末资金」按钮 */}
      <Row k="本期期末资金（回款前）" v={wan(ps.cashAfter)} cls={overSpend ? 'red' : ''} bold />
      {overSpend ? (
        <div className="warn">
          期末资金（回款前）为负 {wan(-ps.cashAfter)}
          {ps.agreementSpend > 0 ? '，协议到货可能因现金不足整月跳过' : ''}
        </div>
      ) : null}
      <div className="section-label" style={{ marginTop: 'var(--s2)' }}>
        本期结算 → 下期期初
      </div>
      {preview.orderRevenue > 0 ? <Row k="+ 订单回款" v={wan(preview.orderRevenue)} /> : null}
      {preview.spotRevenue.max > 0 ? <Row k="+ 现货回款" v={moneyRange(preview.spotRevenue)} /> : null}
      {preview.tax.max > 0 ? <Row k="− 所得税" v={moneyRange(preview.tax)} /> : null}
      <Row k="预计下期期初现金" v={moneyRange(preview.cashEnd)} bold />
      <div className="section-label" style={{ marginTop: 'var(--s2)' }}>
        下期 · 挂账负债
      </div>
      {nl.wagePayable > 0 ? <Row k="− 应付职工薪酬" v={wan(nl.wagePayable)} /> : null}
      {nl.interestEstimate > 0 ? <Row k="− 借款利息" v={wan(nl.interestEstimate)} /> : null}
      {nl.pendingCost > 0 ? <Row k="− 挂账支出" v={wan(nl.pendingCost)} /> : null}
      {nl.pendingIncome > 0 ? <Row k="+ 挂账收入" v={wan(nl.pendingIncome)} cls="green" /> : null}
      {nl.net === 0 ? <Row k="下期无挂账负债" v="" cls="faint" /> : null}
      {nl.net !== 0 ? (
        <Row k="预计下期可动用现金" v={moneyRange(availableAfter)} cls={gap > 0 ? 'red' : ''} bold />
      ) : null}
      {gap > 0 ? (
        <div className="warn">
          下期资金缺口 {wan(gap)}，可由下期回款弥补
        </div>
      ) : null}
    </>
  )
}

function moneyRange(v: E.ValueRange): string {
  return v.min === v.max ? wan(v.min) : `${wan(v.min)} ～ ${wan(v.max)}`
}
