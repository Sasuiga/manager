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
          根据当前采购、生产与销售安排推演。现货成交按公开需求 100% 结算。
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
        <PreviewMetric title="预计下期期初现金" value={moneyRange(preview.cashEnd)}>
          <PreSettleCashBreakdown preview={preview} />
        </PreviewMetric>
        <p className="card-desc" style={{ color: 'var(--muted)' }}>
          预计毛利按统一口径：生产单位成本（计划后库存材料成本 + 固定成本分摊）得出单件毛利，乘以预计销售区间；与损益表毛利（库存账面成本结转、费用另计）可能不同。
        </p>
      </div>

      {preview.rnd.length ? (
        <div className="card">
          <h3>研发进度</h3>
          <div className="title-rule" />
          <p className="card-desc" style={{ color: 'var(--muted)' }}>
            结算时按 seed 判定成败。
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

      <div className="card">
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onSettle}>
          <span className="btn-main">确认本月方案并结算</span>
          <span className="btn-sub">现货成交按公开需求 100% 结算</span>
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
 *  本期 = 期初现金 + 已收 − 已付/结算时付 → 本期期末资金（回款前，确定性）；
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
      <Row k="期初现金（= 上期结算后）" v={wan(ps.cashOpen)} />
      {ps.gainedMisc > 0 ? <Row k="+ 事件收益（已收）" v={wan(ps.gainedMisc)} /> : null}
      {ps.eventCashIn > 0 ? <Row k="+ 事件现金（纾困贷款 · 下月偿还）" v={wan(ps.eventCashIn)} /> : null}
      {ps.paidHire > 0 ? <Row k="− 招聘费（已付）" v={wan(ps.paidHire)} /> : null}
      {ps.paidMisc > 0 ? <Row k="− 杂项支出（已付）" v={wan(ps.paidMisc)} /> : null}
      {ps.paidCapex > 0 ? <Row k="− 设备购置（已付）" v={wan(ps.paidCapex)} /> : null}
      {ps.paidRepay > 0 ? <Row k="− 还款（已付）" v={wan(ps.paidRepay)} /> : null}
      {ps.paidPurchase > 0 ? <Row k="− 采购实付（已付）" v={wan(ps.paidPurchase)} /> : null}
      {ps.purchasePlan > 0 ? <Row k="− 采购计划（结算时付）" v={wan(ps.purchasePlan)} /> : null}
      {ps.agreementSpend > 0 ? <Row k="− 协议自动采购" v={wan(ps.agreementSpend)} /> : null}
      {ps.overtimePay > 0 ? <Row k="− 加班费" v={wan(ps.overtimePay)} /> : null}
      {ps.rndInvest > 0 ? <Row k="− 研发投入" v={wan(ps.rndInvest)} /> : null}
      {ps.interest > 0 ? <Row k="− 借款利息" v={wan(ps.interest)} /> : null}
      {ps.wagePaid > 0 ? <Row k="− 上月工资" v={wan(ps.wagePaid)} /> : null}
      <Row k="本期期末资金（回款前）" v={wan(ps.cashAfter)} cls={overSpend ? 'red' : ''} bold />
      {overSpend ? (
        <div className="warn">
          计划超出资金能力：期末资金（回款前）为负 {wan(-ps.cashAfter)}
          {ps.agreementSpend > 0 ? '，协议到货可能因现金不足整月跳过（锁定期照计）' : ''}
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
        下期 · 挂账负债（本期方案已承诺）
      </div>
      {nl.wagePayable > 0 ? <Row k="− 应付职工薪酬（本月计提，下月实付）" v={wan(nl.wagePayable)} /> : null}
      {nl.interestEstimate > 0 ? <Row k="− 借款利息（按当前借款估算）" v={wan(nl.interestEstimate)} /> : null}
      {nl.pendingCost > 0 ? <Row k="− 挂账支出（下月支付）" v={wan(nl.pendingCost)} /> : null}
      {nl.pendingIncome > 0 ? <Row k="+ 挂账收入（下月到账）" v={wan(nl.pendingIncome)} cls="green" /> : null}
      {nl.net === 0 ? <Row k="下期无挂账负债" v="" cls="faint" /> : null}
      {nl.net !== 0 ? (
        <Row k="预计下期可动用现金（期初 − 净挂账负债）" v={moneyRange(availableAfter)} cls={gap > 0 ? 'red' : ''} bold />
      ) : null}
      {gap > 0 ? (
        <div className="warn">
          下期资金缺口：预计期初现金扣除挂账收入后不足以覆盖下期挂账负债，缺口 {wan(gap)}；可由下期回款弥补，或考虑借款周转
        </div>
      ) : null}
    </>
  )
}

function moneyRange(v: E.ValueRange): string {
  return v.min === v.max ? wan(v.min) : `${wan(v.min)} ～ ${wan(v.max)}`
}
