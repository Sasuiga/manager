import { useCallback, useRef, useState } from 'react'
import * as E from '../core/engine'
import type { GameMode, GameState } from '../core/engine'
import type { ActionResult } from '../core/actions'

/**
 * 引擎状态的外壳。
 *
 * GameState 是可变对象，直接原地修改；这里用一个自增的 tick 触发重渲染，
 * 不做深拷贝——12 个月的存档与整棵状态树都不大，够用且省事。
 */
export interface Game {
  s: GameState
  /** 执行一个动作；返回结果供弹窗提示用 */
  act: (fn: (s: GameState) => ActionResult) => ActionResult
  /** 无返回值的原地修改（例如设置计划数量） */
  mutate: (fn: (s: GameState) => void) => void
  lastReport: E.SettleReport | null
  setReport: (r: E.SettleReport | null) => void
  /** 动作失败的提示 */
  toast: string | null
  setToast: (t: string | null) => void
  tick: number
}

export function useGame(seed: number | null, mode: GameMode = 'full'): Game | null {
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [lastReport, setReport] = useState<E.SettleReport | null>(null)
  const ref = useRef<GameState | null>(null)

  if (seed !== null && ref.current === null) {
    ref.current = E.newGame(seed, mode)
    E.startGame(ref.current)
  }

  const bump = useCallback(() => setTick((t) => t + 1), [])

  const act = useCallback(
    (fn: (s: GameState) => ActionResult): ActionResult => {
      const s = ref.current
      if (!s) return { ok: false, msg: '未开局' }
      const r = fn(s)
      if (!r.ok && r.msg) setToast(r.msg)
      bump()
      return r
    },
    [bump],
  )

  const mutate = useCallback(
    (fn: (s: GameState) => void) => {
      const s = ref.current
      if (!s) return
      fn(s)
      bump()
    },
    [bump],
  )

  const onSetReport = useCallback(
    (r: E.SettleReport | null) => {
      setReport(r)
      bump()
    },
    [bump],
  )

  /**
   * 刻意不做 memo：`s` 是可变对象，缓存的快照会在「首次渲染 seed 仍为 null」
   * 时把 ref.current 永久定死成 null，之后再也不更新。
   * 这里每次渲染都从 ref 现取，重渲染由 tick 驱动。
   */
  return {
    s: ref.current as GameState,
    act,
    mutate,
    lastReport,
    setReport: onSetReport,
    toast,
    setToast,
    tick,
  }
}
