import type { Draw, LotteryConfig } from '../config/lotteries'

/**
 * U-3 AI 统计选号（本地多算法融合 · 诚实口径）
 *
 * 融合 4 类算法对用户自选历史窗口内的号码打分，再按分数做「加权不放回抽样」：
 *  ① 全窗口频率统计（权重 35%）：窗口内出现次数越多分越高
 *  ② 近期热度（权重 30%）：窗口内最近 R 期出现次数越多分越高
 *  ③ 冷号遗漏回补（权重 25%）：距上次开出越久分越高
 *  ④ 随机扰动（权重 10%）：每注重新摇噪声，避免结果死板雷同
 *
 * 理性原则：开奖为独立随机事件，任何统计打分都不能提高中奖概率——
 * 本功能是多算法统计游戏，生成结果与机选的期望完全相同，面板中必须如实告知用户。
 */

/** 单注中单个号码及其入选依据 */
export interface RecommendNumber {
  n: number
  /** 入选主因标签，如「近20期出6次·偏热」「遗漏22期·回补」 */
  reason: string
}

export interface RecommendBet {
  /** 按 config.zones 顺序的号码（无序区已升序） */
  zones: RecommendNumber[][]
}

export interface RecommendResult {
  bets: RecommendBet[]
  /** 统计窗口大小（期） */
  windowSize: number
  /** 近期热度子窗口（期） */
  recentSize: number
  /** 窗口起点期号（较旧） */
  fromNo: string
  /** 窗口终点期号（较新） */
  toNo: string
}

const W_FREQ = 0.35
const W_HOT = 0.3
const W_OMI = 0.25
const W_NOISE = 0.1

/** min-max 归一化到 0~1；全部相等时统一 0.5（无区分度） */
function normalize(values: number[]): number[] {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (hi === lo) return values.map(() => 0.5)
  return values.map((v) => (v - lo) / (hi - lo))
}

/**
 * 生成选号结果
 * @param windowDraws 用户自选窗口内的开奖数据（期号降序，newest first）
 * @param betCount 注数（1~5）
 */
export function generateRecommendations(
  config: LotteryConfig,
  windowDraws: Draw[],
  betCount: number,
): RecommendResult {
  const W = windowDraws.length
  const recentSize = Math.max(5, Math.min(30, Math.floor(W / 3), W))
  const recent = windowDraws.slice(0, recentSize)

  const bets: RecommendBet[] = []

  for (let b = 0; b < betCount; b++) {
    const zones: RecommendNumber[][] = config.zones.map((zone, zi) => {
      const range = zone.max - zone.min + 1
      const freq = new Array<number>(range).fill(0)
      const hot = new Array<number>(range).fill(0)
      const omi = new Array<number>(range).fill(W) // 窗口内未出 = W

      for (let i = 0; i < W; i++) {
        for (const n of windowDraws[i].zones[zi] ?? []) {
          const k = n - zone.min
          if (k < 0 || k >= range) continue
          freq[k]++
          // 从最新一期向旧扫描，首次遇到时的下标 i 即当前遗漏（0 = 最新一期刚出）
          if (freq[k] === 1) omi[k] = i
        }
      }
      for (const d of recent) {
        for (const n of d.zones[zi] ?? []) {
          const k = n - zone.min
          if (k >= 0 && k < range) hot[k]++
        }
      }

      const freqN = normalize(freq)
      const hotN = normalize(hot)
      const omiN = normalize(omi)
      // 综合分 = 4 因子加权（噪声每注每号码独立）
      const score = freq.map(
        (_, k) => W_FREQ * freqN[k] + W_HOT * hotN[k] + W_OMI * omiN[k] + W_NOISE * Math.random(),
      )

      // 加权不放回抽样 pick 个
      const picked: number[] = []
      const alive = new Set(Array.from({ length: range }, (_, k) => k))
      for (let p = 0; p < zone.pick && alive.size > 0; p++) {
        let total = 0
        for (const k of alive) total += score[k]
        let r = Math.random() * total
        let chosen = -1
        for (const k of alive) {
          r -= score[k]
          if (r <= 0) {
            chosen = k
            break
          }
        }
        if (chosen < 0) chosen = [...alive][alive.size - 1]
        alive.delete(chosen)
        picked.push(chosen)
      }
      if (!zone.ordered) picked.sort((a, b) => a - b)

      // 入选主因：三个统计因子中归一化分最高者
      return picked.map((k) => {
        const n = k + zone.min
        let reason: string
        if (omiN[k] >= freqN[k] && omiN[k] >= hotN[k]) {
          reason = omi[k] >= W ? `窗口内未出·回补` : `遗漏${omi[k]}期·回补`
        } else if (hotN[k] >= freqN[k]) {
          reason = `近${recentSize}期出${hot[k]}次·偏热`
        } else {
          reason = `窗口出现${freq[k]}次·高频`
        }
        return { n, reason }
      })
    })
    bets.push({ zones })
  }

  return {
    bets,
    windowSize: W,
    recentSize,
    fromNo: windowDraws[W - 1]?.drawNo ?? '',
    toNo: windowDraws[0]?.drawNo ?? '',
  }
}
