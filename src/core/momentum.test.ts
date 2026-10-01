import { describe, expect, it } from 'vitest'
import { newGame } from './game'
import { advanceMonth } from './settle'
import { Rng } from './rng'
import { CLIMATE_ORDER, MOMENTUM_NAMES, MOMENTUM_ODDS } from '../data/game'
import type { Climate, GameState, Momentum } from './types'

/** 可控取值序列的 mock rng（advanceMonth 每个季度只消费 2 个值：动能 roll、步长 roll）。 */
function mockRng(values: number[]): Rng {
  let i = 0
  return { next: () => values[Math.min(i++, values.length - 1)] } as unknown as Rng
}

/** 置于季度末（第 3 月）：advanceMonth 进入第 4 月触发季度切换。 */
function atQuarterEnd(climate: Climate): GameState {
  const s = newGame(1)
  s.climate = climate
  s.month = 3
  return s
}

describe('季度切换：动能驱动气候（§3.1.1）', () => {
  it('动能按当前气候的概率表掷出（MOMENTUM_ODDS）', () => {
    // overheat 的表为 [0.15, 0.15, 0.7]
    const cases: Array<[number, Momentum]> = [
      [0.05, 'expand'],
      [0.2, 'stall'],
      [0.95, 'contract'],
    ]
    for (const [mRoll, expectMomentum] of cases) {
      const s = atQuarterEnd('overheat')
      advanceMonth(s, mockRng([mRoll, 0.5]))
      expect(s.momentum, `mRoll=${mRoll} → ${MOMENTUM_NAMES[s.momentum]}`).toBe(expectMomentum)
    }
  })

  it('动能定方向、步长定幅度：扩张→前进、停滞→原地、收缩→后退', () => {
    // 扩张 ×1：过热 → 滞涨
    let s = atQuarterEnd('overheat')
    advanceMonth(s, mockRng([0.05, 0.5]))
    expect(s.climate).toBe('stagflation')
    expect(s.momentum).toBe('expand')
    // 停滞 ×0：留在过热
    s = atQuarterEnd('overheat')
    advanceMonth(s, mockRng([0.2, 0.8]))
    expect(s.climate).toBe('overheat')
    expect(s.momentum).toBe('stall')
    // 收缩 ×2：过热 → 回退两格到复苏
    s = atQuarterEnd('overheat')
    advanceMonth(s, mockRng([0.95, 0.95]))
    expect(s.climate).toBe('recovery')
    expect(s.momentum).toBe('contract')
  })

  it('各气候下动能的实际频率与 MOMENTUM_ODDS 一致（3000 次统计）', () => {
    for (const climate of CLIMATE_ORDER) {
      const s = newGame(1)
      const rng = new Rng(7)
      const counts: Record<Momentum, number> = { expand: 0, stall: 0, contract: 0 }
      const N = 3000
      for (let i = 0; i < N; i++) {
        s.month = 3
        s.climate = climate
        advanceMonth(s, rng)
        counts[s.momentum]++
      }
      const [pE, pS, pC] = MOMENTUM_ODDS[climate]
      expect(Math.abs(counts.expand / N - pE), `expand @ ${climate}`).toBeLessThan(0.03)
      expect(Math.abs(counts.stall / N - pS), `stall @ ${climate}`).toBeLessThan(0.03)
      expect(Math.abs(counts.contract / N - pC), `contract @ ${climate}`).toBeLessThan(0.03)
    }
  })

  it('nextClimateOdds 与实际转移分布一致（动能概率 × 步长分布）', () => {
    for (const climate of CLIMATE_ORDER) {
      const s = atQuarterEnd(climate)
      const [pE, pS, pC] = MOMENTUM_ODDS[climate]
      // 掷到「停滞 ×0」：气候原地不动，预测即该气候自身的转移分布
      advanceMonth(s, mockRng([pE + pS / 2, 0.8]))
      expect(s.climate).toBe(climate)
      const idx = CLIMATE_ORDER.indexOf(climate)
      const names = CLIMATE_ORDER
      expect(s.nextClimateOdds[names[idx]]).toBeCloseTo(pS + 0.2 * (pE + pC))
      expect(s.nextClimateOdds[names[(idx + 1) % 6]]).toBeCloseTo(pE * 0.7)
      expect(s.nextClimateOdds[names[(idx + 2) % 6]]).toBeCloseTo(pE * 0.1)
      expect(s.nextClimateOdds[names[(idx + 5) % 6]]).toBeCloseTo(pC * 0.7)
      expect(s.nextClimateOdds[names[(idx + 4) % 6]]).toBeCloseTo(pC * 0.1)
      const sum = Object.values(s.nextClimateOdds).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 5)
    }
  })
})
