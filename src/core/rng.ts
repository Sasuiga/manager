/** 确定性随机数：mulberry32。同一 seed 必得同一局。 */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  /** 当前内部状态，可序列化保存。 */
  get state(): number {
    return this.s
  }

  static fromState(s: number): Rng {
    return new Rng(s)
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]
  }

  /** 从数组中不放回抽取 n 个。 */
  sample<T>(arr: readonly T[], n: number): T[] {
    const pool = [...arr]
    const out: T[] = []
    const k = Math.min(n, pool.length)
    for (let i = 0; i < k; i++) out.push(pool.splice(this.int(pool.length), 1)[0])
    return out
  }

  /** 按权重抽取索引。 */
  weighted(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) return 0
    let r = this.next() * total
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) return i
    }
    return weights.length - 1
  }
}
