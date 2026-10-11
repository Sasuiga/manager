import { useState } from 'react'
import * as E from '../../core/engine'
import {
  STAFF,
  LOAN_TERM_MONTHS,
  MATERIALS,
  BUY_PRICE_NEGOTIATE_STAFF,
  SELL_PRICE_RAISE_STAFF,
  BUY_TRADER_EXTRA_STAFF,
  buyNegotiateCapOf,
  supplyPushCostOf,
  supplyPushCapOf,
  supplyPushRaiseOf,
  overtimeCostOf,
  overtimeGainOf,
  EQUIPMENT_SHOP,
  WAREHOUSE_SHOP,
  EQUIP_CAP_PER_WORKER,
  TIER_LABEL,
} from '../../data/game'
import { Row, Sheet } from '../Sheet'
import { wan, wanSigned, tierName, TIER_ORDER } from '../format'
import type { Tier } from '../../core/types'
import type { Game } from '../useGame'

const DEPT_NAME: Record<E.Dept, string> = {
  ops: '管理人员',
  buy: '采购人员',
  make: '生产人员',
  sell: '销售人员',
  rnd: '研发人员',
}

type OpenId =
  | 'borrow'
  | 'repay'
  | 'hire'
  | 'trader'
  | 'buySupply'
  | 'buyPrice'
  | 'agreement'
  | 'develop'
  | 'warehouse'
  | 'overtime'
  | 'equip'
  | 'sellDemand'
  | 'sellRaise'

/**
 * 特殊行动：部门本职之外的 AP 消耗型行动。
 * 每部门页下半部分展示本组件：一个行动一个按钮，点击弹出专属弹框；
 * 弹框底部「结算」按钮确认执行（扣 AP），「关闭」即取消（草稿不生效、不扣 AP）。
 */
export function SpecialActions({ g, dept }: { g: Game; dept: E.Dept }) {
  const s = g.s
  const d = E.derive(s)
  const [open, setOpen] = useState<OpenId | null>(null)

  type Item = { id: OpenId; name: string; sub: string; disabled?: boolean }
  const fee = E.hireCost(s, dept)
  const hireCheck = E.canHire(s, dept)
  const hireItem: Item = {
    id: 'hire',
    name: `招聘${DEPT_NAME[dept]}`,
    disabled: !hireCheck.ok,
    sub: hireCheck.ok ? `1 AP${fee > 0 ? ` + ${wan(fee)}` : ''} · 当前 ${s.depts[dept].staff}/5 人` : hireCheck.msg,
  }

  let items: Item[]
  if (dept === 'ops') {
    items = [
      {
        id: 'borrow',
        name: '申请贷款',
        disabled: d.noBorrow || s.debt > 0 || d.creditAvailable < 10 || s.ap < 1,
        sub: s.ap < 1
          ? 'AP 不足（结算 1 AP）'
          : d.noBorrow
            ? '本月无法新增借款'
            : s.debt > 0
              ? '先还清上一笔，再借新笔'
              : d.creditAvailable < 10
                ? '可用额度不足 1w'
                : `1 AP · 可用 ${wan(d.creditAvailable)} · 期限 ${LOAN_TERM_MONTHS} 个月 · 当月不计息`,
      },
      {
        id: 'repay',
        name: '归还贷款',
        disabled: s.debt <= 0 || s.ap < 1,
        sub: s.debt <= 0 ? '暂无借款' : s.ap < 1 ? 'AP 不足（结算 1 AP）' : `1 AP · 余额 ${wan(s.debt)} · 现金 ${wan(s.cash)}`,
      },
      hireItem,
    ]
  } else if (dept === 'buy') {
    const offers = E.traderOffer(s)
    const slots = E.agreementSlots(s)
    const usedA = s.agreements.length
    const months = d.flags.includes('agreeLock6') ? 6 : 3
    const developable = E.materialViews(s).filter((mv) => mv.isNew && mv.developed < 6)
    const minWhPrice = Math.min(...WAREHOUSE_SHOP.map((w) => w.price))
    const whCap = WAREHOUSE_SHOP[0].matCap
    items = [
      {
        id: 'trader',
        name: '贸易商采购',
        disabled: s.ap < 1,
        sub: s.ap < 1
          ? 'AP 不足（购买 1 AP/次）'
          : `1 AP/次 · 小批 +1 档 · 额外批次 · 本月 ${offers.length} 种报价${s.depts.buy.staff >= BUY_TRADER_EXTRA_STAFF ? '（3 人 +1 种）' : ''}`,
      },
      {
        id: 'buySupply',
        name: '扩大供应',
        disabled: s.ap < 1,
        sub: s.ap < 1
          ? 'AP 不足（结算 1 AP）'
          : `1 AP · 供给加点（量）· 与价格谈判共用池 ${d.buyResource} 点（已用 ${d.buyResourceUsed}）`,
      },
      {
        id: 'buyPrice',
        name: '价格谈判',
        disabled: s.ap < 1,
        sub:
          s.ap < 1
            ? 'AP 不足（结算 1 AP）'
            : s.depts.buy.staff < BUY_PRICE_NEGOTIATE_STAFF
              ? `1 AP · 议价（价）· 需采购 ${BUY_PRICE_NEGOTIATE_STAFF} 人解锁（当前 ${s.depts.buy.staff} 人）`
              : `1 AP · 议价（价）${d.buyNegotiateCost} 点/档 · 与扩大供应共用池`,
      },
      {
        id: 'agreement',
        name: '签订长期协议',
        disabled: usedA >= slots || s.ap < 1 || s.cash < 10,
        sub:
          usedA >= slots
            ? `名额 ${usedA}/${slots}（由 C5/C14/J2/事件授予）`
            : s.ap < 1
              ? 'AP 不足（结算 1 AP）'
              : s.cash < 10
                ? '现金不足 1w 手续费'
                : `1 AP + 1w · 锁定 ${months} 个月中批到货`,
      },
      {
        id: 'develop',
        name: '开发供应商',
        disabled: developable.length === 0 || s.ap < 1 || s.cash < 30,
        sub:
          developable.length === 0
            ? '暂无可开发新材料（复合材/微机电）'
            : s.ap < 1
              ? 'AP 不足（结算 1 AP）'
              : s.cash < 30
                ? '现金不足 3w'
                : `1 AP + 3w · 基础供给 +2（立即生效）`,
      },
      {
        id: 'warehouse',
        name: '仓库扩建',
        disabled: s.ap < 1 || s.cash < minWhPrice,
        sub:
          s.ap < 1
            ? 'AP 不足（结算 1 AP）'
            : s.cash < minWhPrice
              ? `现金不足（${wan(minWhPrice)}/座）`
              : `结算 1 AP · 现金即付当月生效（每类原料库存上限 +${whCap}，月折旧 ${wan(WAREHOUSE_SHOP[0].depreciation)}）`,
      },
      hireItem,
    ]
  } else if (dept === 'make') {
    const staff = s.depts.make.staff
    const otCostBase = overtimeCostOf(d.salaryPer.make, staff)
    const otCost = d.overtimeHalf ? Math.round(otCostBase / 2) : otCostBase
    const otGain = overtimeGainOf(staff, d.equipmentCapBonus) * (d.overtimeGainPlus ? 2 : 1)
    const minEquipPrice = Math.min(...EQUIPMENT_SHOP.map((e) => e.price))
    items = [
      {
        id: 'overtime',
        name: '安排加班',
        disabled: staff < 3 || s.plan.overtime || s.ap < 1 || s.cash < otCost,
        sub:
          staff < 3
            ? '需生产 3 人解锁'
            : s.plan.overtime
              ? `本月已安排（已付 ${wan(s.overtimePaid)}，不可取消）`
              : s.ap < 1
                ? 'AP 不足（结算 1 AP）'
                : s.cash < otCost
                  ? '现金不足'
                  : `1 AP + ${wan(otCost)} · 本月产能 +${otGain}`,
      },
      {
        id: 'equip',
        name: '设备引进',
        disabled: s.ap < 1 || s.cash < minEquipPrice,
        sub:
          s.ap < 1
            ? 'AP 不足（结算 1 AP）'
            : s.cash < minEquipPrice
              ? `现金不足（${wan(minEquipPrice)}/台）`
              : `结算 1 AP · 现金即付当月生效（每名生产人员产能 +${EQUIP_CAP_PER_WORKER}）`,
      },
      hireItem,
    ]
  } else if (dept === 'sell') {
    const usedPts = E.allocUsed(s) + TIER_ORDER.reduce((a, t) => a + (s.sellPriceAlloc[t] ?? 0) * d.sellRaiseCost, 0)
    items = [
      {
        id: 'sellDemand',
        name: '刺激需求',
        disabled: s.ap < 1,
        sub: s.ap < 1
          ? 'AP 不足（结算 1 AP）'
          : `1 AP · 需求加点（量）· 与上调售价共用池 ${d.salesResource} 点（已用 ${usedPts}）`,
      },
      {
        id: 'sellRaise',
        name: '上调售价',
        disabled: s.ap < 1,
        sub:
          s.ap < 1
            ? 'AP 不足（结算 1 AP）'
            : s.depts.sell.staff < SELL_PRICE_RAISE_STAFF
              ? `1 AP · 提价（价）· 需销售 ${SELL_PRICE_RAISE_STAFF} 人解锁（当前 ${s.depts.sell.staff} 人）`
              : `1 AP · 提价（价）${d.sellRaiseCost} 点/档 · 与刺激需求共用池`,
      },
      hireItem,
    ]
  } else {
    items = [hireItem]
  }

  return (
    <div className="card">
      <div className="hstack-between">
        <h3>特殊行动</h3>
        <span className="xs faint mono">AP {s.ap}/{d.apMax}</span>
      </div>
      <div className="title-rule" />
      <div className="stack">
        {items.map((it) => (
          <button
            key={it.id}
            className="btn btn-mini"
            style={it.disabled ? { opacity: 0.45 } : undefined}
            disabled={it.disabled}
            onClick={() => setOpen(it.id)}
          >
            <span className="btn-main">{it.name}</span>
            <span className="btn-sub">{it.sub}</span>
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 'var(--s2)' }}>
        点开弹框调整/选定后，底部「结算」确认执行并扣 AP；「关闭」即取消（草稿不生效、不扣 AP）。
      </p>

      {open === 'borrow' ? <LoanSheet g={g} mode="borrow" onClose={() => setOpen(null)} /> : null}
      {open === 'repay' ? <LoanSheet g={g} mode="repay" onClose={() => setOpen(null)} /> : null}
      {open === 'hire' ? <HireSheet g={g} dept={dept} onClose={() => setOpen(null)} /> : null}
      {open === 'trader' ? <TraderSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'buySupply' ? <BuySupplySheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'buyPrice' ? <BuyPriceSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'agreement' ? <AgreementsSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'develop' ? <DevelopSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'overtime' ? <OvertimeSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'equip' ? <EquipmentPickSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'warehouse' ? <WarehousePickSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'sellDemand' ? <SellDemandSheet g={g} onClose={() => setOpen(null)} /> : null}
      {open === 'sellRaise' ? <SellRaiseSheet g={g} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

/** 各部门页的配套人员信息（人数/解锁轨道/固定与解锁效果）：本职区展示，行动在「特殊行动·人员招聘」中结算。 */
export function StaffCard({ g, dept }: { g: Game; dept: E.Dept }) {
  const s = g.s
  const def = STAFF[dept]
  const staff = s.depts[dept].staff
  return (
    <div className="card">
      <div className="hstack-between">
        <h3>{DEPT_NAME[dept]}</h3>
        <span className="xs faint mono">
          {staff}/5 人
        </span>
      </div>
      <div className="title-rule" />
      {/* 解锁轨道：staff 人时，at <= staff 的格子已点亮 */}
      <div className="unlock-track">
        {def.unlocks.map((u) => (
          <div key={u.at} className={`unlock-node${staff >= u.at ? ' done' : ''}`}>
            <span className="unlock-diamond" />
          </div>
        ))}
      </div>
      {/* 固有效果 + 解锁说明 */}
      <div className="stack-sm" style={{ marginTop: 'var(--s2)' }}>
        {def.base.map((b) => (
          <div key={b} className="xs faint">
            固定：{b}
          </div>
        ))}
        {def.unlocks.map((u) => (
          <div key={u.at} className={`xs${staff >= u.at ? ' green' : ' faint'}`}>
            {u.at} 人：{u.text}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════ 人员招聘（1 AP + 招聘费） ══════════════ */

function HireSheet({ g, dept, onClose }: { g: Game; dept: E.Dept; onClose: () => void }) {
  const s = g.s
  const def = STAFF[dept]
  const staff = s.depts[dept].staff
  const check = E.canHire(s, dept)
  const fee = E.hireCost(s, dept)

  /** 招下一个人立刻获得的效果：单人固定 + 下一档解锁。 */
  const immediateEffects: string[] = [...def.base]
  const nextUnlock = def.unlocks.find((u) => u.at === staff + 1)
  if (nextUnlock && nextUnlock.text !== '（无新增解锁）') {
    immediateEffects.push(`解锁：${nextUnlock.text}`)
  }

  return (
    <Sheet
      title={`招聘${DEPT_NAME[dept]}`}
      sub={`当前 ${staff}/5 人`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!check.ok}
          onClick={() => {
            const r = g.act((st) => E.hire(st, dept))
            if (r.ok) onClose()
          }}
        >
          <span className="btn-main">结算 · 确认招聘</span>
          <span className="btn-sub">{check.ok ? `1 AP${fee > 0 ? ` + ${wan(fee)}` : ''}` : check.msg}</span>
        </button>
      }
    >
      <div className="card">
        <div className="section-label">成本明细</div>
        <Row k="AP" v="1 点" />
        <Row k="招聘费" v={fee > 0 ? wan(fee) : '免费'} cls={fee > 0 ? '' : 'green'} />
        <Row k="月薪" v={`${wan(def.salary)}/人（本月计提下月支付）`} />
      </div>

      <div className="card" style={{ marginTop: 'var(--s3)' }}>
        <div className="section-label">立即获得</div>
        {immediateEffects.map((e, i) => (
          <div key={i} className="hint" style={{ marginTop: i > 0 ? 'var(--s1)' : 0 }}>
            {e}
          </div>
        ))}
      </div>

      {/* S4 裁员优化（事件）/ K6 编制优化（规则卡）：本月裁员额度，返还 100% 基础招聘费（免 AP） */}
      {s.monthFlags.some((f) => f === 'canFire' || f === 'canFireCard') && staff > 0 ? (
        <div style={{ marginTop: 'var(--s3)' }}>
          <button
            className="btn btn-mini"
            onClick={() => {
              const r = g.act((st) => E.fire(st, dept))
              if (r.ok) g.setToast(r.msg ?? '已解雇')
              else g.setToast(r.msg)
            }}
          >
            <span className="btn-main">解雇 1 名{DEPT_NAME[dept]}</span>
            <span className="btn-sub">免 AP（S4 事件 / K6 编制优化额度）· 返还 100% 基础招聘费</span>
          </button>
        </div>
      ) : null}
    </Sheet>
  )
}

/* ══════════════ 融资：申请贷款 / 归还贷款（各 1 AP） ══════════════ */

/** 申请/归还贷款金额选择：预设档 + 用满额度/还清（先选定，再点「结算」执行，各 1 AP；关闭即取消）。 */
function LoanSheet({ g, mode, onClose }: { g: Game; mode: 'borrow' | 'repay'; onClose: () => void }) {
  const s = g.s
  const d = E.derive(s)
  const presets = [10, 50, 100, 200] // 1w / 5w / 10w / 20w
  const full = mode === 'borrow' ? d.creditAvailable : s.debt
  const [amount, setAmount] = useState<number | null>(null)
  /** 本笔操作带来的「本月利息」变化：借款当月不计息（次月才起息），其余月份按月末余额×月利率在结算时确认（行动阶段不直接扣现金），单独模拟当前金额。 */
  const interestDelta = (a: number): number => {
    const copy = JSON.parse(JSON.stringify(s)) as E.GameState
    copy.ap = Math.max(copy.ap, 1) // 结算需 1 AP：模拟时保证可用
    if (mode === 'borrow') E.borrow(copy, a)
    else E.repay(copy, a)
    return E.derive(copy).interest - d.interest
  }
  const reasonOf = (a: number): string | null => {
    if (mode === 'borrow') {
      if (s.debt > 0) return '先还清上一笔借款，再借新笔'
      if (d.noBorrow) return '本月无法新增借款'
      if (a > d.creditAvailable) return '超出可用额度'
    } else {
      if (a > s.debt) return '超出借款余额'
      if (a > s.cash) return '现金不足'
    }
    return null
  }
  const note = (a: number) => {
    const delta = interestDelta(a)
    const interestPart =
      mode === 'borrow' && delta === 0
        ? '当月不计息（次月起息，到期/还款时本息一起还掉）'
        : `本月利息 ${wanSigned(delta)}（结算时确认，行动阶段不直接扣现金）`
    return mode === 'borrow'
      ? `现金 +${wan(a)} · 负债 +${wan(a)} · ${interestPart}`
      : `现金 −${wan(a)} · 负债 −${wan(a)} · ${interestPart}`
  }
  const option = (a: number, label: string) => {
    const reason = reasonOf(a)
    return (
      <button
        key={label}
        className={`btn btn-mini${amount === a ? ' on selected' : ''}`}
        disabled={reason !== null}
        onClick={() => setAmount(a)}
      >
        <span className="btn-main xs">{label}</span>
        <span className="btn-sub xs">
          {note(a)}
          {reason ? ` · ${reason}` : ''}
        </span>
      </button>
    )
  }
  const apOk = s.ap >= 1
  return (
    <Sheet
      title={mode === 'borrow' ? '申请贷款' : '归还贷款'}
      sub={
        mode === 'borrow'
          ? `可用额度 ${wan(d.creditAvailable)} · 月利率 ${(d.rate * 100).toFixed(1)}% · 期限 ${LOAN_TERM_MONTHS} 个月 · 当月不计息、次月起息`
          : `余额 ${wan(s.debt)}${s.loanDueMonth > 0 ? ` · 第 ${s.loanDueMonth} 月到期` : ''} · 现金 ${wan(s.cash)}`
      }
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={amount === null || !apOk}
          onClick={() => {
            const r = g.act((st) => (mode === 'borrow' ? E.borrow(st, amount!) : E.repay(st, amount!)))
            if (r.ok) {
              g.setToast(r.msg ?? (mode === 'borrow' ? '贷款已到账' : '贷款已归还'))
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · {mode === 'borrow' ? '申请贷款' : '归还贷款'}{amount ? ` ${wan(amount)}` : ''}</span>
          <span className="btn-sub">{apOk ? '1 AP' : 'AP 不足（结算 1 AP）'}</span>
        </button>
      }
    >
      <div className="stack">
        {presets.map((a) => option(a, `${mode === 'borrow' ? '申请贷款' : '归还贷款'} ${wan(a)}`))}
        {full > 0 && !presets.includes(full)
          ? option(full, mode === 'borrow' ? `用满额度 ${wan(full)}` : `还清 ${wan(full)}`)
          : null}
      </div>
      <p className="hint" style={{ marginTop: 'var(--s2)' }}>
        选定额后点「结算」执行（1 AP）；「关闭」即取消，不扣 AP、不动现金。
      </p>
    </Sheet>
  )
}

/* ══════════════ 贸易商（1 AP/次，原子行动：一次结算 1 个品种） ══════════════ */

/** 贸易商：选定 1 个品种后点「结算」购买（1 AP/次 + 现金）；再买其他品种需重新点开后单独结算（再 1 AP）。关闭即取消，草稿不生效。 */
function TraderSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s
  const offers = E.traderOffer(s)
  const quota = E.traderQuota(s)
  const [sel, setSel] = useState<string | null>(null)
  const chosen = offers.find((o) => o.materialId === sel)
  const totalCash = chosen ? chosen.qty * chosen.price : 0
  const cashOk = !chosen || totalCash <= s.cash
  const apOk = s.ap >= 1
  return (
    <Sheet
      title="贸易商"
      sub="小批 · 价格 +1 档 · 额外批次 · 1 AP/次（每次结算 1 个品种）"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!chosen || !cashOk || !apOk}
          onClick={() => {
            if (!chosen) return
            const r = g.act((st) => E.buyFromTrader(st, chosen.materialId, chosen.qty, chosen.price))
            if (r.ok) {
              g.setToast(r.msg ?? '已入库')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认购买{chosen ? ` ${chosen.qty} 件` : ''}</span>
          <span className="btn-sub">
            {!chosen ? '未选品种' : !apOk ? 'AP 不足' : !cashOk ? '现金不足' : `1 AP + ${wan(totalCash)}`}
          </span>
        </button>
      }
    >
      {quota > 1 ? (
        <p className="muted sm" style={{ marginBottom: 'var(--s2)' }}>
          卡牌【贸易商】生效中：每品种额外 {quota - 1} 次购买机会（每次 1 AP，逐个选定结算）
        </p>
      ) : null}
      <div className="stack">
        {offers.map((o) => {
          const used = s.extraBuys.filter((e) => e.kind === 'trader' && e.materialId === o.materialId).length
          const soldOut = used >= quota
          const total = o.qty * o.price
          const on = sel === o.materialId
          return (
            <div key={o.materialId} className="card">
              <Row
                k={E.materialViews(s).find((m) => m.id === o.materialId)?.name ?? o.materialId}
                v={`${o.qty} 件 · ${wan(o.price)}/件 = ${wan(total)}`}
              />
              {used > 0 ? <Row k="本月已购" v={`${used}/${quota}`} /> : null}
              <div style={{ marginTop: 'var(--s2)' }}>
                <button
                  className={`btn btn-mini${on ? ' on selected' : ''}`}
                  disabled={soldOut || o.qty <= 0 || total > s.cash}
                  onClick={() => setSel(on ? null : o.materialId)}
                >
                  <span className="btn-main xs">{on ? '已选入结算（点取消）' : '选入结算'}</span>
                  <span className="btn-sub xs">
                    {on ? `1 AP + ${wan(total)}` : soldOut ? '本月已购' : total > s.cash ? '现金不足' : '1 AP + 现金'}
                  </span>
                </button>
              </div>
            </div>
          )
        })}
        {offers.length === 0 ? <p className="muted sm">本月没有贸易商上门。</p> : null}
      </div>
      <p className="hint" style={{ marginTop: 'var(--s2)' }}>
        原子行动：每次结算只买 1 个品种（1 AP + 现金）；再买其他品种需重新点开后单独结算（再 1 AP）。「关闭」即取消，不扣 AP、不动现金。
      </p>
    </Sheet>
  )
}

/* ══════════════ 扩大供应（结算 1 AP，原子行动） ══════════════ */

/**
 * 扩大供应（量）：供给加点（件数）草稿态调整——只在本地状态，
 * 点「结算 · 确认扩大供应」写回供给草稿并扣 1 AP（与价格谈判/议价共用池）；「关闭」即取消（草稿不生效、不扣 AP）。
 */
function BuySupplySheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  /** 价格谈判（议价）已确认用量（有效档数 × 点数/档）：本弹框可用池 = 总池 − 已确认定价点 */
  const priceUsed = MATERIALS.reduce((a, m) => a + (d.buyPricePush[m.id] ?? 0) * d.buyNegotiateCost, 0)
  const [supply, setSupply] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const x of MATERIALS) m[x.id] = gs.buySupplyAlloc[x.id] ?? 0
    return m
  })
  /** 草稿已用点数（供给件数 × 档位成本） */
  const draftUsed = MATERIALS.reduce(
    (a, mdef) => a + (supply[mdef.id] ?? 0) * supplyPushCostOf(mdef.id),
    0,
  )
  const free = Math.max(0, d.buyResource - priceUsed - draftUsed)

  return (
    <Sheet
      title="扩大供应"
      sub={`供给加点（量）· 与价格谈判共用池 ${d.buyResource} 点（价格谈判已用 ${priceUsed}）`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={gs.ap < 1}
          onClick={() => {
            const r = g.act((st) => E.confirmBuySupplyAlloc(st, supply))
            if (r.ok) {
              g.setToast(r.msg ?? '扩大供应已确认')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认扩大供应</span>
          <span className="btn-sub">
            {gs.ap < 1 ? 'AP 不足（结算 1 AP）' : `1 AP · 已用 ${priceUsed + draftUsed}/${d.buyResource} 点`}
          </span>
        </button>
      }
    >
      <div className="stack-sm">
        {MATERIALS.map((mdef) => {
          const units = supply[mdef.id] ?? 0
          const sCost = supplyPushCostOf(mdef.id)
          const sCap = d.supplyPushHalf ? Math.floor(supplyPushCapOf(mdef.id) / 2) : supplyPushCapOf(mdef.id)
          const sRaise = supplyPushRaiseOf(mdef.id) // 供给加点达基础供给 50% → 价格 +1 档
          const pushDisabled = d.matFocusActive || sCap <= 0 // 材料聚焦（C13）：点数不再用于供给加点
          const supplyPlusOk = !pushDisabled && free >= sCost && units < sCap
          return (
            <div
              key={mdef.id}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 1fr) 1fr', columnGap: 'var(--s4)', alignItems: 'center' }}
            >
              <span className="sm">
                <b>{mdef.name}</b>
                <span className="faint xs"> · {sCost} 点/件{sRaise > 0 ? ` · 投满 ${sRaise} 件价格 +1 档` : ''}</span>
              </span>
              <span className="hstack" style={{ gap: 'var(--s2)', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: units <= 0 ? 0.4 : 1 }}
                  disabled={units <= 0}
                  onClick={() => setSupply((m) => ({ ...m, [mdef.id]: (m[mdef.id] ?? 0) - 1 }))}
                >
                  <span>−</span>
                </button>
                <span className="mono xs" style={{ minWidth: 40, textAlign: 'center' }}>
                  +{units} 件
                </span>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: supplyPlusOk ? 1 : 0.4 }}
                  disabled={!supplyPlusOk}
                  onClick={() => setSupply((m) => ({ ...m, [mdef.id]: (m[mdef.id] ?? 0) + 1 }))}
                >
                  <span>+</span>
                </button>
              </span>
            </div>
          )
        })}
      </div>
      <div className="hint">
        本月采购资源 {d.buyResource} 点 · 草稿已用 {draftUsed} 点（供给成本 = 件数 × 档位成本{d.supplyPushHalf ? '，上限减半（锁价谈判）' : ''}，上限 3× 基础供给；
        供给加点达到该料基础供给 50% 时价格 +1 档）。
        {d.matFocusActive ? '材料聚焦（C13）生效中：点数改投聚焦原料，供给加点停用。' : ''}
        点「结算」确认并扣 1 AP（再调整需再 1 AP）；「关闭」取消，草稿不生效。
      </div>
    </Sheet>
  )
}

/* ══════════════ 价格谈判（结算 1 AP，原子行动） ══════════════ */

/**
 * 价格谈判（价）：议价（档数）草稿态调整——只在本地状态，
 * 点「结算 · 确认价格谈判」写回复议草稿并扣 1 AP（与扩大供应共用池）；「关闭」即取消（草稿不生效、不扣 AP）。
 */
function BuyPriceSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const staff = gs.depts.buy.staff
  /** 议价（采购 ≥2 人解锁）：点数/档受卡牌修正，档上限随人数（2 人 1 档 / 4 人 2 档） */
  const canPrice = staff >= BUY_PRICE_NEGOTIATE_STAFF
  const priceCap = buyNegotiateCapOf(staff)
  const negCost = d.buyNegotiateCost
  /** 扩大供应已确认用量（件数 × 档位成本）：本弹框可用池 = 总池 − 已确认供给点 */
  const priceConfirmed = MATERIALS.reduce((a, m) => a + (d.buyPricePush[m.id] ?? 0) * negCost, 0)
  const supplyUsed = d.buyResourceUsed - priceConfirmed
  const [price, setPrice] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const x of MATERIALS) m[x.id] = gs.buyPriceAlloc[x.id] ?? 0
    return m
  })
  /** 草稿已用点数（议价档数 × 点数/档） */
  const draftUsed = MATERIALS.reduce((a, mdef) => a + (price[mdef.id] ?? 0) * negCost, 0)
  const free = Math.max(0, d.buyResource - supplyUsed - draftUsed)

  return (
    <Sheet
      title="价格谈判"
      sub={`议价（价）· 与扩大供应共用池 ${d.buyResource} 点（供给已用 ${supplyUsed}）`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={gs.ap < 1}
          onClick={() => {
            const r = g.act((st) => E.confirmBuyPriceAlloc(st, price))
            if (r.ok) {
              g.setToast(r.msg ?? '价格谈判已确认')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认价格谈判</span>
          <span className="btn-sub">
            {gs.ap < 1 ? 'AP 不足（结算 1 AP）' : `1 AP · 已用 ${supplyUsed + draftUsed}/${d.buyResource} 点`}
          </span>
        </button>
      }
    >
      <div className="stack-sm">
        {MATERIALS.map((mdef) => {
          const tiers = price[mdef.id] ?? 0
          const pricePlusOk = canPrice && free >= negCost && tiers < priceCap
          return (
            <div
              key={mdef.id}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 1fr) 1fr', columnGap: 'var(--s4)', alignItems: 'center' }}
            >
              <span className="sm">
                <b>{mdef.name}</b>
                <span className="faint xs"> · 每降 1 档该料供给 −2</span>
              </span>
              <span className="hstack" style={{ gap: 'var(--s2)', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: !canPrice || tiers <= 0 ? 0.4 : 1 }}
                  disabled={!canPrice || tiers <= 0}
                  onClick={() => setPrice((m) => ({ ...m, [mdef.id]: (m[mdef.id] ?? 0) - 1 }))}
                >
                  <span>−</span>
                </button>
                <span className="mono xs" style={{ minWidth: 40, textAlign: 'center' }}>
                  −{tiers} 档
                </span>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: pricePlusOk ? 1 : 0.4 }}
                  disabled={!pricePlusOk}
                  onClick={() => setPrice((m) => ({ ...m, [mdef.id]: (m[mdef.id] ?? 0) + 1 }))}
                >
                  <span>+</span>
                </button>
              </span>
            </div>
          )
        })}
      </div>
      <div className="hint">
        本月采购资源 {d.buyResource} 点 · 草稿已用 {draftUsed} 点（议价 {negCost} 点/档（基础 4，卡牌可降），每料最多 {priceCap} 档，每降 1 档该料供给 −2）。
        {staff < BUY_PRICE_NEGOTIATE_STAFF ? `议价需采购 ${BUY_PRICE_NEGOTIATE_STAFF} 人解锁（当前 ${staff} 人）。` : ''}
        点「结算」确认并扣 1 AP（再调整需再 1 AP）；「关闭」取消，草稿不生效。
      </div>
    </Sheet>
  )
}

/* ══════════════ 刺激需求（结算 1 AP，原子行动） ══════════════ */

/**
 * 刺激需求（量）：需求加点（点数）草稿态调整——只在本地状态，
 * 点「结算 · 确认刺激需求」写回需求草稿并扣 1 AP（与上调售价共用池）；「关闭」即取消（草稿不生效、不扣 AP）。
 */
function SellDemandSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  /** 提价已确认用量（有效档数 × 点数/档）：本弹框可用池 = 总池 − 已确认提价点 */
  const raiseUsed = TIER_ORDER.reduce((a, t) => a + (d.sellPriceRaise[t] ?? 0) * d.sellRaiseCost, 0)
  const [demand, setDemand] = useState<Record<Tier, number>>(() => {
    const m: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
    for (const t of TIER_ORDER) m[t] = gs.salesAlloc[t] ?? 0
    return m
  })
  /** 草稿已用点数（需求点数原值） */
  const draftUsed = TIER_ORDER.reduce((a, t) => a + (demand[t] ?? 0), 0)
  const free = Math.max(0, d.salesResource - raiseUsed - draftUsed)

  return (
    <Sheet
      title="刺激需求"
      sub={`需求加点（量）· 与上调售价共用池 ${d.salesResource} 点（上调售价已用 ${raiseUsed}）`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={gs.ap < 1}
          onClick={() => {
            const r = g.act((st) => E.confirmSellDemandAlloc(st, demand))
            if (r.ok) {
              g.setToast(r.msg ?? '刺激需求已确认')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认刺激需求</span>
          <span className="btn-sub">
            {gs.ap < 1 ? 'AP 不足（结算 1 AP）' : `1 AP · 已用 ${raiseUsed + draftUsed}/${d.salesResource} 点`}
          </span>
        </button>
      }
    >
      <div className="stack-sm">
        {TIER_ORDER.filter((t) => gs.products[t].built).map((t) => {
          const cost = d.salesPushCost[t]
          const capUnits = d.salesPushCap[t]
          const points = demand[t] ?? 0
          const units = Math.floor(points / cost)
          const demandPlusOk = free >= cost && units < capUnits
          return (
            <div
              key={t}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 1fr) 1fr', columnGap: 'var(--s4)', alignItems: 'center' }}
            >
              <span className="sm">
                <b>{TIER_LABEL[t]}</b>
                <span className="faint xs"> · {cost} 点/需求</span>
              </span>
              <span className="hstack" style={{ gap: 'var(--s2)', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: points <= 0 ? 0.4 : 1 }}
                  disabled={points <= 0}
                  onClick={() => setDemand((m) => ({ ...m, [t]: Math.max(0, (m[t] ?? 0) - cost) }))}
                >
                  <span>−</span>
                </button>
                <span className="mono gold" style={{ minWidth: 36, textAlign: 'center' }}>
                  +{units}
                </span>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: demandPlusOk ? 1 : 0.4 }}
                  disabled={!demandPlusOk}
                  onClick={() => setDemand((m) => ({ ...m, [t]: (m[t] ?? 0) + cost }))}
                >
                  <span>+</span>
                </button>
              </span>
            </div>
          )
        })}
      </div>
      <div className="hint">
        本月销售资源 {d.salesResource} 点 · 草稿已用 {draftUsed} 点（需求成本 = 需求数 × 档位成本，上限 3× 基础需求；
        每层需求 1 点成本：低端 1 / 中端 2 / 高端 4 / 特殊 6）。提价每升 1 档，该层需求 −1（仅现货，订单价不受影响）。
        点「结算」确认并扣 1 AP（再调整需再 1 AP）；「关闭」取消，草稿不生效。
      </div>
    </Sheet>
  )
}

/* ══════════════ 上调售价（结算 1 AP，原子行动） ══════════════ */

/**
 * 上调售价（价）：提价（档数）草稿态调整——只在本地状态，
 * 点「结算 · 确认上调售价」写回提价草稿并扣 1 AP（与刺激需求共用池）；「关闭」即取消（草稿不生效、不扣 AP）。
 */
function SellRaiseSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const staff = gs.depts.sell.staff
  /** 提价（销售 ≥2 人解锁）：8 点/档，档上限随人数（2 人 1 档 / 4 人 2 档，卡牌可升） */
  const canRaise = staff >= SELL_PRICE_RAISE_STAFF
  const raiseCap = d.sellRaiseCap
  const raiseCost = d.sellRaiseCost
  /** 需求加点已确认用量：本弹框可用池 = 总池 − 已确认需求点 */
  const demandUsed = E.allocUsed(gs)
  const [raise, setRaise] = useState<Record<Tier, number>>(() => {
    const m: Record<Tier, number> = { low: 0, mid: 0, high: 0, special: 0 }
    for (const t of TIER_ORDER) m[t] = gs.sellPriceAlloc[t] ?? 0
    return m
  })
  /** 草稿已用点数（提价档数 × 点数/档） */
  const draftUsed = TIER_ORDER.reduce((a, t) => a + (raise[t] ?? 0) * raiseCost, 0)
  const free = Math.max(0, d.salesResource - demandUsed - draftUsed)

  return (
    <Sheet
      title="上调售价"
      sub={`提价（价）· 与刺激需求共用池 ${d.salesResource} 点（需求已用 ${demandUsed}）`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={gs.ap < 1}
          onClick={() => {
            const r = g.act((st) => E.confirmSellPriceAlloc(st, raise))
            if (r.ok) {
              g.setToast(r.msg ?? '上调售价已确认')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认上调售价</span>
          <span className="btn-sub">
            {gs.ap < 1 ? 'AP 不足（结算 1 AP）' : `1 AP · 已用 ${demandUsed + draftUsed}/${d.salesResource} 点`}
          </span>
        </button>
      }
    >
      <div className="stack-sm">
        {TIER_ORDER.filter((t) => gs.products[t].built).map((t) => {
          const tiers = raise[t] ?? 0
          const raisePlusOk = canRaise && free >= raiseCost && tiers < raiseCap
          return (
            <div
              key={t}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 1fr) 1fr', columnGap: 'var(--s4)', alignItems: 'center' }}
            >
              <span className="sm">
                <b>{TIER_LABEL[t]}</b>
                <span className="faint xs"> · 每升 1 档该层需求 −1（仅现货）</span>
              </span>
              <span className="hstack" style={{ gap: 'var(--s2)', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: !canRaise || tiers <= 0 ? 0.4 : 1 }}
                  disabled={!canRaise || tiers <= 0}
                  onClick={() => setRaise((m) => ({ ...m, [t]: (m[t] ?? 0) - 1 }))}
                >
                  <span>−</span>
                </button>
                <span className="mono xs" style={{ minWidth: 36, textAlign: 'center' }}>
                  +{tiers} 档
                </span>
                <button
                  className="btn btn-nav"
                  style={{ width: 'auto', padding: '2px var(--s3)', opacity: raisePlusOk ? 1 : 0.4 }}
                  disabled={!raisePlusOk}
                  onClick={() => setRaise((m) => ({ ...m, [t]: (m[t] ?? 0) + 1 }))}
                >
                  <span>+</span>
                </button>
              </span>
            </div>
          )
        })}
      </div>
      <div className="hint">
        本月销售资源 {d.salesResource} 点 · 草稿已用 {draftUsed} 点（提价 {raiseCost} 点/档（基础 8，卡牌可降），每层最多 {raiseCap} 档（2 人 1 档 / 4 人 2 档），
        每升 1 档该层需求 −1，仅现货、订单价不受影响）。
        {staff < SELL_PRICE_RAISE_STAFF ? `提价需销售 ${SELL_PRICE_RAISE_STAFF} 人解锁（当前 ${staff} 人）。` : ''}
        点「结算」确认并扣 1 AP（再调整需再 1 AP）；「关闭」取消，草稿不生效。
      </div>
    </Sheet>
  )
}

/* ══════════════ 长期协议签订（1 AP + 1w） ══════════════ */

/** 用可用名额签订长期协议（1 AP + 1w 手续费，锁定档位价中批到货）；关闭即取消。 */
function AgreementsSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const slots = E.agreementSlots(gs)
  const used = gs.agreements.length
  const months = d.flags.includes('agreeLock6') ? 6 : 3
  const signableMats = E.materialViews(gs).filter((mv) => mv.supply > 0 && !gs.agreements.some((a) => a.materialId === mv.id))
  const [sel, setSel] = useState<string | null>(null)
  const reason = !sel ? '未选原料' : gs.ap < 1 ? 'AP 不足' : gs.cash < 10 ? '现金不足 1w' : null
  return (
    <Sheet
      title="签订长期协议"
      sub={`名额 ${used}/${slots} · 锁定 ${months} 个月`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={reason !== null}
          onClick={() => {
            const r = g.act((st) => E.signAgreement(st, sel!, months))
            if (r.ok) {
              g.setToast(r.msg ?? '已签订')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认签订</span>
          <span className="btn-sub">{reason ?? '1 AP + 1w 手续费'}</span>
        </button>
      }
    >
      <p className="hint sm">
        长期协议由提案/事件授予名额：C5【长期协议】立即签订（采购 ≥ 4 人锁定期 6 个月）、C14【供应合约】本月加名额且 6 月锁定、J2【供应链联盟】永久 +1 名额、事件【签订长约/长期协议】立即签订。用名额签订需 1 AP + 1w 手续费，之后连续数月按签约时的价格档位获得中批原料。
      </p>
      <div className="stack-sm" style={{ marginTop: 'var(--s2)' }}>
        {signableMats.length > 0 ? (
          signableMats.map((mv) => (
            <button
              key={mv.id}
              className={`btn btn-mini${sel === mv.id ? ' on selected' : ''}`}
              onClick={() => setSel(mv.id)}
            >
              <span className="btn-main xs">{mv.name} · 每月 {E.lotQty(gs, mv.id, 'mid')} 件</span>
              <span className="btn-sub xs">锁定 {tierName(mv.tierShift)}（{wan(E.materialPriceAt(mv.id, mv.tierShift))}/件）</span>
            </button>
          ))
        ) : (
          <p className="hint sm">本月没有可签的原料（需供给 &gt; 0 且未签同类协议）。</p>
        )}
      </div>
    </Sheet>
  )
}

/* ══════════════ 供应商开发（1 AP + 3w） ══════════════ */

/** 开发新材料供应商（1 AP + 3w，基础供给 +2 立即生效，上限 6）；关闭即取消。 */
function DevelopSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const developable = E.materialViews(gs).filter((mv) => mv.isNew && mv.developed < 6)
  const [sel, setSel] = useState<string | null>(null)
  const reason = !sel ? '未选原料' : gs.ap < 1 ? 'AP 不足' : gs.cash < 30 ? '现金不足 3w' : null
  return (
    <Sheet
      title="开发供应商"
      sub="仅新材料（复合材/微机电）· 供给 +2 立即生效"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={reason !== null}
          onClick={() => {
            const r = g.act((st) => E.developSupplier(st, sel!))
            if (r.ok) {
              g.setToast(r.msg ?? '已开发')
              onClose()
            }
          }}
        >
          <span className="btn-main">结算 · 确认开发</span>
          <span className="btn-sub">{reason ?? '1 AP + 3w'}</span>
        </button>
      }
    >
      <div className="stack-sm">
        {developable.map((mv) => (
          <button
            key={mv.id}
            className={`btn btn-mini${sel === mv.id ? ' on selected' : ''}`}
            onClick={() => setSel(mv.id)}
          >
            <span className="btn-main xs">{mv.name}</span>
            <span className="btn-sub xs">已开发 {mv.developed}/6 · 每开发 1 次基础供给 +2</span>
          </button>
        ))}
        {developable.length === 0 ? <p className="hint sm">暂无可开发新材料。</p> : null}
      </div>
    </Sheet>
  )
}

/* ══════════════ 安排加班（1 AP + 现金） ══════════════ */

/** 安排加班预览与结算（1 AP + 2× 生产工资发生支付，选定后不可取消、费用不退）；关闭即取消。 */
function OvertimeSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  const staff = gs.depts.make.staff
  const otCostBase = overtimeCostOf(d.salaryPer.make, staff)
  const otCost = d.overtimeHalf ? Math.round(otCostBase / 2) : otCostBase
  const otGain = overtimeGainOf(staff, d.equipmentCapBonus) * (d.overtimeGainPlus ? 2 : 1)
  const arranged = gs.plan.overtime
  const reason = arranged
    ? '本月已安排（不可取消）'
    : staff < 3
      ? '需生产 3 人解锁'
      : gs.ap < 1
        ? 'AP 不足'
        : gs.cash < otCost
          ? '现金不足'
          : null
  return (
    <Sheet
      title="安排加班"
      sub={`需生产 3 人 · 产能 +${otGain}`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={reason !== null}
          onClick={() => {
            const r = g.act((st) => E.toggleOvertime(st))
            if (r.ok) {
              g.setToast(r.msg ?? '加班已安排')
              onClose()
            }
          }}
        >
          <span className="btn-main">{arranged ? '已安排（不可取消）' : '结算 · 确认安排'}</span>
          <span className="btn-sub">
            {reason ?? `1 AP + ${wan(otCost)}（发生支付，${d.overtimeHalf ? '加班补贴减半后' : '2× 生产工资'}）`}
          </span>
        </button>
      }
    >
      <div className="card">
        <div className="section-label">成本与效果</div>
        <Row k="加班费" v={wan(otCost)} />
        <Row k="AP" v="1 点" />
        <Row k="产能增益" v={`本月产能 +${otGain}`} />
      </div>
      <p className="hint">
        安排时发生支付（非工资式计提下月实付）；选定后不可取消、费用不退还（清空生产计划不影响）。
        关闭即取消，不扣 AP、不动现金。
      </p>
    </Sheet>
  )
}

/* ══════════════ 设备引进（1 AP/型号 + 现金，选定即实付） ══════════════ */

/** 设备引进弹窗（原子行动）：先展示当前持有设备，再给出购置选项（选定 1 型号 + 台数，1 AP/次）。
 * 弹框内型号/台数为草稿；底部「结算」实付现金、入账（每次 1 AP，单型号每次 ≤5 台），当月产能/折旧/额度即生效；再购其他型号需重新点开后单独结算（再 1 AP）；「关闭」取消（草稿不生效、不扣 AP、不动现金）。 */
function EquipmentPickSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  // 持有设备按名称合并（同名多台只列一行）
  const owned = new Map<string, { count: number; net: number; cost: number }>()
  for (const e of gs.equipment) {
    const cur = owned.get(e.name) ?? { count: 0, net: 0, cost: 0 }
    cur.count += 1
    cur.net += Math.max(0, e.cost - e.accumulated)
    cur.cost += e.cost
    owned.set(e.name, cur)
  }
  // 草稿态：选定 1 型号 + 台数（原子行动：每次结算 1 个型号 1 AP；再购其他型号需重新点开后单独结算）
  const [sel, setSel] = useState<string | null>(null)
  const [count, setCount] = useState(1)
  const model = EQUIPMENT_SHOP.find((e) => e.id === sel)
  const draftCost = model ? count * model.price : 0
  const reason = !model ? '请选择型号' : gs.ap < 1 ? 'AP 不足' : gs.cash < draftCost ? '现金不足' : null
  const settle = () => {
    if (!model) return
    const r = g.act((st) => E.buyEquipment(st, model.id, count))
    if (r.ok) {
      g.setToast(`已结算购置：${model.name} ×${count}（现金即付，当月生效，−1 AP）`)
      onClose()
    }
  }
  return (
    <Sheet
      title="设备引进"
      sub="1 AP/型号 · 现金即付、当月生效（产能与折旧，借款额度自购置当月起算）"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" disabled={reason !== null} onClick={settle}>
          <span className="btn-main">结算 · 确认购置{model ? ` ${model.name} ×${count}` : ''}</span>
          <span className="btn-sub">{reason ?? `1 AP + ${wan(draftCost)} 现金即付（当月生效）`}</span>
        </button>
      }
    >
      <div className="card">
        <div className="section-label">当前设备</div>
        {gs.equipment.length === 0 ? (
          <p className="muted sm">暂未持有设备：购置后每名生产人员产能 +{EQUIP_CAP_PER_WORKER}（标准设备）。</p>
        ) : (
          <>
            <div className="stack-sm">
              {[...owned.entries()].map(([name, o]) => (
                <Row key={name} k={`${name} × ${o.count}`} v={`净 ${wan(o.net)} / 原值 ${wan(o.cost)}`} />
              ))}
            </div>
            <Row
              k="合计"
              v={`${gs.equipment.length} 台 · 每名生产人员产能 +${d.equipmentCapBonus}`}
              bold
            />
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--s3)' }}>
        <div className="section-label">购置（草稿，结算后生效）</div>
        <div className="stack">
          {EQUIPMENT_SHOP.map((e) => {
            const on = sel === e.id
            return (
              <div key={e.id} className="card-item">
                <span className="spine" />
                <span className="card-body">
                  <span className="card-name">{e.name} · {wan(e.price)}/台</span>
                  <span className="card-desc">{e.desc}</span>
                  <span className="card-desc">
                    {on
                      ? `草稿 ${count} 台 × 生产 ${gs.depts.make.staff} 人：本月产能 +${count * e.cap * gs.depts.make.staff} · 现金 ${wan(count * e.price)}`
                      : '未选购置'}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 'var(--s1)', alignItems: 'center' }}>
                  <button
                    className={`btn btn-mini${on ? ' on selected' : ''}`}
                    style={{ width: 'auto' }}
                    onClick={() => {
                      setSel(on ? null : e.id)
                      setCount(1)
                    }}
                  >
                    {on ? '已选' : '选定'}
                  </button>
                  {on ? (
                    <>
                      <button className="btn btn-mini" style={{ width: 'auto' }} disabled={count <= 1} onClick={() => setCount(count - 1)}>−</button>
                      <span className="mono xs" style={{ minWidth: 20, textAlign: 'center' }}>{count}</span>
                      <button className="btn btn-mini" style={{ width: 'auto' }} disabled={!E.canBuyEquipment(gs, e.id, count + 1).ok} onClick={() => setCount(count + 1)}>＋</button>
                    </>
                  ) : null}
                </span>
              </div>
            )
          })}
          <p className="muted sm" style={{ margin: 0 }}>
            原子行动：每次结算只购置 1 个型号（1 AP，单型号最多 5 台）；结算时现金即付（资本化为固定资产，不计入当期损益），设备立即入库：本月产能、折旧与借款额度当月起生效；再购其他型号需重新点开后单独结算（再 1 AP）。「关闭」取消（不扣 AP、不动现金）。
          </p>
        </div>
      </div>
    </Sheet>
  )
}

/* ══════════════ 仓库扩建（1 AP/型号 + 现金，选定即实付） ══════════════ */

/** 仓库扩建弹窗（采购部特殊行动，原子行动）：先展示当前持有仓库（仓容加成 + 折旧），再给出购置选项（选定 1 型号 + 座数，1 AP/次）。
 * 弹框内型号/座数为草稿；底部「结算」实付现金、入账（每次 1 AP，单型号每次 ≤5 座），每类原料库存上限/折旧/借款额度当月起生效；再购其他型号需重新点开后单独结算（再 1 AP）；「关闭」取消（草稿不生效、不扣 AP、不动现金）。 */
function WarehousePickSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const gs = g.s
  const d = E.derive(gs)
  // 持有仓库按名称合并（同名多座只列一行）
  const owned = new Map<string, { count: number; net: number; cost: number }>()
  for (const w of gs.warehouses) {
    const cur = owned.get(w.name) ?? { count: 0, net: 0, cost: 0 }
    cur.count += 1
    cur.net += Math.max(0, w.cost - w.accumulated)
    cur.cost += w.cost
    owned.set(w.name, cur)
  }
  // 草稿态：选定 1 型号 + 座数（原子行动：每次结算 1 个型号 1 AP；再购其他型号需重新点开后单独结算）
  const [sel, setSel] = useState<string | null>(null)
  const [count, setCount] = useState(1)
  const model = WAREHOUSE_SHOP.find((w) => w.id === sel)
  const draftCost = model ? count * model.price : 0
  const reason = !model ? '请选择型号' : gs.ap < 1 ? 'AP 不足' : gs.cash < draftCost ? '现金不足' : null
  const settle = () => {
    if (!model) return
    const r = g.act((st) => E.buyWarehouse(st, model.id, count))
    if (r.ok) {
      g.setToast(`已结算购置：${model.name} ×${count}（现金即付，仓容/折旧当月生效，−1 AP）`)
      onClose()
    }
  }
  return (
    <Sheet
      title="仓库扩建"
      sub="1 AP/型号 · 现金即付、当月生效（每类原料库存上限与折旧，借款额度自购置当月起算）"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" disabled={reason !== null} onClick={settle}>
          <span className="btn-main">结算 · 确认购置{model ? ` ${model.name} ×${count}` : ''}</span>
          <span className="btn-sub">
            {reason ?? `1 AP + ${wan(draftCost)} 现金即付（当月生效）`}
          </span>
        </button>
      }
    >
      <div className="card">
        <div className="section-label">当前仓库</div>
        {gs.warehouses.length === 0 ? (
          <p className="muted sm">暂未持有仓库：各类原料库存上限为基础上限（见采购页「库存 x/y」）。购置后每类原料上限提升（含研发解锁的新材料）。</p>
        ) : (
          <>
            <div className="stack-sm">
              {[...owned.entries()].map(([name, o]) => (
                <Row key={name} k={`${name} × ${o.count}`} v={`净 ${wan(o.net)} / 原值 ${wan(o.cost)}`} />
              ))}
            </div>
            <Row
              k="合计"
              v={`${gs.warehouses.length} 座 · 每类原料库存上限 +${d.warehouseCapBonus} · 月折旧 ${wan(d.warehouseDepreciation)}`}
              bold
            />
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--s3)' }}>
        <div className="section-label">购置（草稿，结算后生效）</div>
        <div className="stack">
          {WAREHOUSE_SHOP.map((w) => {
            const on = sel === w.id
            return (
              <div key={w.id} className="card-item">
                <span className="spine" />
                <span className="card-body">
                  <span className="card-name">{w.name} · {wan(w.price)}/座</span>
                  <span className="card-desc">{w.desc}</span>
                  <span className="card-desc">
                    {on
                      ? `草稿 ${count} 座：每类原料库存上限 +${count * w.matCap} · 现金 ${wan(count * w.price)}（月折旧 ${wan(count * w.depreciation)}）`
                      : '未选购置'}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 'var(--s1)', alignItems: 'center' }}>
                  <button
                    className={`btn btn-mini${on ? ' on selected' : ''}`}
                    style={{ width: 'auto' }}
                    onClick={() => {
                      setSel(on ? null : w.id)
                      setCount(1)
                    }}
                  >
                    {on ? '已选' : '选定'}
                  </button>
                  {on ? (
                    <>
                      <button className="btn btn-mini" style={{ width: 'auto' }} disabled={count <= 1} onClick={() => setCount(count - 1)}>−</button>
                      <span className="mono xs" style={{ minWidth: 20, textAlign: 'center' }}>{count}</span>
                      <button className="btn btn-mini" style={{ width: 'auto' }} disabled={!E.canBuyWarehouse(gs, w.id, count + 1).ok} onClick={() => setCount(count + 1)}>＋</button>
                    </>
                  ) : null}
                </span>
              </div>
            )
          })}
          <p className="muted sm" style={{ margin: 0 }}>
            原子行动：每次结算只购置 1 个型号（1 AP，单型号最多 5 座）；结算时现金即付（资本化为固定资产，不计入当期损益），仓库立即入账：每类原料库存上限、折旧与借款额度当月起生效；再购其他型号需重新点开后单独结算（再 1 AP）。「关闭」取消（不扣 AP、不动现金）。
          </p>
        </div>
      </div>
    </Sheet>
  )
}
