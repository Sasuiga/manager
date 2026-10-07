import { useState } from 'react'
import * as E from '../core/engine'
import { CLIMATE_NAMES, MOMENTUM_NAMES, MILESTONES } from '../data/game'
import { Icon } from './icons'
import { Row, Sheet } from './Sheet'
import { wan } from './format'
import type { Game } from './useGame'

/**
 * 顶部 HUD：环境时间 + 核心资源 + 目标胶囊。
 * 结构按 UI 文档 §三：先让玩家知道「这个月为什么贵 / 好卖」，再是资源。
 * 「期末资金」为按钮：展示本期期末现金（回款前），点击展开期初资金 → 期末现金明细菜单。
 */
export function Hud({
  g,
  onGoals,
}: {
  g: Game
  onGoals: () => void
}) {
  const s = g.s
  const hud = E.hudView(s)
  const goals = E.goalDisplay(s)
  /** 期末资金（回款前）桥接：期初资金 + 事件收益 − 已付/结算时付各项，与预算页同一口径 */
  const ps = E.preSettleCash(s)
  const [fundsOpen, setFundsOpen] = useState(false)

  const goalText = (() => {
    const basicDone = goals.basic ? E.checkGoal(goals.basic.track, goals.basic.current) : false
    if (goals.challenge) {
      const t = goals.challenge.track
      const cur = goals.challenge.current
      const r = t.target > 0 ? Math.min(1, cur / t.target) : 0
      return (
        <span className="hstack" style={{ gap: 'var(--s2)' }}>
          <span className="hstack" style={{ gap: 4 }}>
            基本
            {basicDone ? (
              <Icon name="check" size={13} className="green" />
            ) : (
              <Icon name="clock" size={13} className="faint" />
            )}
          </span>
          <span className="faint">·</span>
          <span>挑战 {Math.round(r * 100)}%</span>
        </span>
      )
    }
    return (
      <span>
        <span className="hstack" style={{ gap: 4 }}>
          基本
          {basicDone ? <Icon name="check" size={13} className="green" /> : <Icon name="clock" size={13} className="faint" />}
        </span>
        <span className="faint"> · 本季无挑战目标</span>
      </span>
    )
  })()

  return (
    <>
      <div className="hud">
        <div className="hud-top">
          <div className="hstack" style={{ gap: 'var(--s2)' }}>
            <span className="hud-month">{s.month}月</span>
            <span className="faint xs mono">Q{Math.ceil(s.month / 3)}</span>
          </div>
          <div className="hstack" style={{ gap: 'var(--s2)' }}>
            <span className="hud-climate">{CLIMATE_NAMES[s.climate as keyof typeof CLIMATE_NAMES]}</span>
            <span className="faint xs">动能 {MOMENTUM_NAMES[s.momentum]}</span>
          </div>
        </div>

        <div className="month-dots" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className={`month-dot${i + 1 < s.month ? ' past' : i + 1 === s.month ? ' now' : ''}`}
            />
          ))}
        </div>

        <div className="stats">
          <button
            className="stat stat-btn"
            onClick={() => setFundsOpen(true)}
            title="查看期初资金 → 期末现金（回款前）明细"
          >
            <div className="stat-label">
              <Icon name="cash" size={11} /> 期末资金
              <Icon name="chevron" size={9} className="faint" />
            </div>
            <div className={`stat-value${ps.cashAfter < 0 ? ' red' : ''}`}>{wan(ps.cashAfter)}</div>
          </button>
          <div className="stat">
            <div className="stat-label">
              <Icon name="ap" size={11} /> AP
            </div>
            <div className="stat-value">
              {s.ap}
              <span className="faint">/{hud.apMax}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">
              <Icon name="card" size={11} /> 提案
            </div>
            <div className="stat-value">
              {s.plays}
              <span className="faint">/{hud.playsMax}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">
              <Icon name="cash" size={11} /> 预计总分
            </div>
            <div className="stat-value">{s.score.total}</div>
          </div>
        </div>

        <button className="goal-chip" onClick={onGoals} title="形状目标（常驻里程碑，两种模式都判，达成即锁定）">
          <span className="hstack" style={{ gap: 'var(--s2)', minWidth: 0 }}>
            <span className="faint xs nowrap">形状</span>
            <span>
              {s.milestones.length}
              <span className="faint">/{MILESTONES.length}</span>
            </span>
          </span>
          <Icon name="chevron" size={14} className="faint" />
        </button>

        <button className="goal-chip" onClick={onGoals}>
          <span className="hstack" style={{ gap: 'var(--s2)', minWidth: 0 }}>
            <span className="faint xs nowrap">目标</span>
            {goalText}
          </span>
          <Icon name="chevron" size={14} className="faint" />
        </button>
      </div>
      {/* 明细菜单放在 .hud 之外：.hud 的 backdrop-filter 会为 fixed 后代建立包含块，困住全屏 Sheet */}
      {fundsOpen ? <FundsSheet g={g} onClose={() => setFundsOpen(false)} /> : null}
    </>
  )
}

/**
 * 期末资金明细：期初资金 → 逐项过账（行动阶段实付 + 结算时付）→ 期末现金（回款前）。
 * 口径与预算页「预计下期期初现金」桥接完全一致（preSettleCash）；
 * 回款与所得税属于结算边界，不在本菜单列示。
 */
function FundsSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s
  const ps = E.preSettleCash(s)
  const over = ps.cashAfter < 0
  return (
    <Sheet title="期末资金" sub={`${s.month}月 · 期初资金 → 期末现金（回款前）`} onClose={onClose}>
      <div className="card">
        <div className="section-label">本期 · 现金计划（回款前）</div>
        <Row k="期初资金（= 上期结算后）" v={wan(ps.cashOpen)} />
        {ps.gainedMisc > 0 ? <Row k="+ 事件收益（已收）" v={wan(ps.gainedMisc)} /> : null}
        {ps.eventCashIn > 0 ? <Row k="+ 事件现金（纾困贷款 · 下月偿还）" v={wan(ps.eventCashIn)} /> : null}
        {ps.paidHire > 0 ? <Row k="− 招聘费（已付）" v={wan(ps.paidHire)} /> : null}
        {ps.paidMisc > 0 ? <Row k="− 杂项支出（已付）" v={wan(ps.paidMisc)} /> : null}
        {ps.paidCapex > 0 ? <Row k="− 设备购置（已付）" v={wan(ps.paidCapex)} /> : null}
        {ps.paidRepay > 0 ? <Row k="− 还款（已付）" v={wan(ps.paidRepay)} /> : null}
        {ps.paidPurchase > 0 ? <Row k="− 采购实付（已付）" v={wan(ps.paidPurchase)} /> : null}
        {ps.purchasePlan > 0 ? <Row k="− 采购计划（结算时付）" v={wan(ps.purchasePlan)} /> : null}
        {ps.equipmentPlan > 0 ? <Row k="− 设备购置计划（结算时付）" v={wan(ps.equipmentPlan)} /> : null}
        {ps.agreementSpend > 0 ? <Row k="− 协议自动采购" v={wan(ps.agreementSpend)} /> : null}
        {ps.overtimePay > 0 ? <Row k="− 加班费" v={wan(ps.overtimePay)} /> : null}
        {ps.rndInvest > 0 ? <Row k="− 研发投入" v={wan(ps.rndInvest)} /> : null}
        {ps.interest > 0 ? <Row k="− 借款利息" v={wan(ps.interest)} /> : null}
        {ps.wagePaid > 0 ? <Row k="− 上月工资" v={wan(ps.wagePaid)} /> : null}
        <Row k="期末资金（回款前）" v={wan(ps.cashAfter)} cls={over ? 'red' : ''} bold />
        {over ? (
          <div className="warn">
            期末资金（回款前）为负 {wan(-ps.cashAfter)}
            {ps.agreementSpend > 0 ? '，协议到货可能因现金不足整月跳过' : ''}
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}
