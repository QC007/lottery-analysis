import type { Draw, LotteryConfig } from '../config/lotteries'

/**
 * 组合健康度诊断（F-04）纯函数
 * 6 个维度独立评分（0-100），综合分为加权平均（权重可配置，默认均等）。
 * 「历史常见区间」取本地历史样本主区和值/跨度的 5%~95% 分位区间。
 * 说明：诊断维度均针对主区（副区仅 1-2 个号码，无分布意义）。
 */

export interface HealthDimension {
  key: string
  name: string
  score: number
  detail: string
  /** 低分时给出的建议 */
  advice?: string
}

export interface HealthReport {
  dimensions: HealthDimension[]
  /** 综合健康度（加权平均，0-100） */
  overall: number
}

/** 各维度默认权重（可配置） */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  oddEven: 1,
  bigSmall: 1,
  spread: 1,
  consecutive: 1,
  sum: 1,
  span: 1,
}

function percentile(sortedNums: number[], p: number): number {
  if (sortedNums.length === 0) return 0
  const idx = (sortedNums.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sortedNums[lo] + (sortedNums[hi] - sortedNums[lo]) * (idx - lo)
}

/** 偏离均衡比例评分：偏离 0 → 100，逐步扣减 */
function balanceScore(actual: number, pick: number, ratio: number): number {
  const ideal = pick * ratio
  const deviation = Math.abs(actual - ideal)
  return Math.max(0, Math.round(100 - deviation * 28))
}

/** 历史分位区间评分：P5~P95 内 100，P1~P99 线性过渡，区间外低分 */
function rangeScore(value: number, hist: number[]): { score: number; p5: number; p95: number } {
  const s = [...hist].sort((a, b) => a - b)
  const p5 = percentile(s, 0.05)
  const p95 = percentile(s, 0.95)
  const p1 = percentile(s, 0.01)
  const p99 = percentile(s, 0.99)
  let score: number
  if (value >= p5 && value <= p95) score = 100
  else if (value >= p1 && value <= p99) {
    const dist = value < p5 ? p5 - value : value - p95
    const band = value < p5 ? p5 - p1 : p99 - p95
    score = Math.round(100 - (dist / (band || 1)) * 45)
  } else score = 25
  return { score, p5: Math.round(p5), p95: Math.round(p95) }
}

const CONSECUTIVE_TABLE = [80, 100, 65, 40, 25, 10]

export function diagnose(
  picks: number[][],
  config: LotteryConfig,
  history: Draw[],
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): HealthReport {
  const zone = config.zones[0]
  const main = [...(picks[0] ?? [])].sort((a, b) => a - b)
  const pick = main.length

  // 历史主区和值/跨度样本
  const histSums: number[] = []
  const histSpans: number[] = []
  for (const d of history) {
    const z = d.zones[0] ?? []
    if (z.length === 0) continue
    histSums.push(z.reduce((s, x) => s + x, 0))
    histSpans.push(z[z.length - 1] - z[0])
  }

  const dimensions: HealthDimension[] = []

  // 1. 奇偶均衡
  const oddCount = main.filter((n) => n % 2 === 1).length
  const oddTotal = zone.max - zone.min + 1
  const oddRatio = Math.ceil(oddTotal / 2) / oddTotal
  const oddScore = balanceScore(oddCount, pick, oddRatio)
  dimensions.push({
    key: 'oddEven',
    name: '奇偶均衡',
    score: oddScore,
    detail: `奇数 ${oddCount} 个 / 偶数 ${pick - oddCount} 个，理论期望约 ${(pick * oddRatio).toFixed(1)} 个奇数`,
    advice:
      oddScore < 70
        ? oddCount > pick * oddRatio
          ? '奇数偏多，建议替换 1-2 个奇数为偶数'
          : '偶数偏多，建议替换 1-2 个偶数为奇数'
        : undefined,
  })

  // 2. 大小均衡
  const mid = (zone.max + zone.min) / 2
  const bigCount = main.filter((n) => n > mid).length
  const bigRatio = (zone.max - Math.floor(mid)) / oddTotal
  const bigScore = balanceScore(bigCount, pick, bigRatio)
  dimensions.push({
    key: 'bigSmall',
    name: '大小均衡',
    score: bigScore,
    detail: `大号（>${Math.floor(mid)}）${bigCount} 个 / 小号 ${pick - bigCount} 个`,
    advice:
      bigScore < 70
        ? bigCount > pick * bigRatio
          ? '大号偏多，建议增加小号'
          : '小号偏多，建议增加大号'
        : undefined,
  })

  // 3. 区间分布（主区三等分）
  const segSize = oddTotal / 3
  const seg = [0, 0, 0]
  for (const n of main) seg[Math.min(2, Math.floor((n - zone.min) / segSize))]++
  const covered = seg.filter((c) => c > 0).length
  const evenness = 1 - (Math.max(...seg) - Math.min(...seg)) / (pick || 1)
  const spreadScore = Math.round((covered / 3) * 60 + Math.max(0, evenness) * 40)
  dimensions.push({
    key: 'spread',
    name: '区间分布',
    score: spreadScore,
    detail: `三段分布 ${seg.join(' / ')}，覆盖 ${covered}/3 个区间`,
    advice: covered < 3 ? '号码集中在部分区间，建议分散到三个区间' : undefined,
  })

  // 4. 连号检测
  let consecPairs = 0
  for (let i = 1; i < main.length; i++) if (main[i] === main[i - 1] + 1) consecPairs++
  const consecScore = CONSECUTIVE_TABLE[Math.min(consecPairs, CONSECUTIVE_TABLE.length - 1)]
  dimensions.push({
    key: 'consecutive',
    name: '连号检测',
    score: consecScore,
    detail: consecPairs === 0 ? '无连号' : `含 ${consecPairs} 组连号`,
    advice:
      consecPairs >= 3 ? '连号过多，历史开奖中极少出现 3 组以上连号' : undefined,
  })

  // 5. 和值合理
  const sum = main.reduce((s, x) => s + x, 0)
  const sumR = rangeScore(sum, histSums)
  dimensions.push({
    key: 'sum',
    name: '和值合理',
    score: sumR.score,
    detail: `和值 ${sum}，历史常见区间 ${sumR.p5} ~ ${sumR.p95}`,
    advice:
      sumR.score < 70
        ? sum < sumR.p5
          ? '和值偏低，建议增加大号'
          : '和值偏高，建议增加小号'
        : undefined,
  })

  // 6. 跨度合理
  const span = pick > 1 ? main[pick - 1] - main[0] : 0
  const spanR = rangeScore(span, histSpans)
  dimensions.push({
    key: 'span',
    name: '跨度合理',
    score: spanR.score,
    detail: `跨度 ${span}，历史常见区间 ${spanR.p5} ~ ${spanR.p95}`,
    advice:
      spanR.score < 70
        ? span < spanR.p5
          ? '跨度过小，号码过于集中，建议拉开首尾距离'
          : '跨度过大，历史罕见'
        : undefined,
  })

  const totalW = dimensions.reduce((s, d) => s + (weights[d.key] ?? 1), 0)
  const overall = Math.round(
    dimensions.reduce((s, d) => s + d.score * (weights[d.key] ?? 1), 0) / (totalW || 1),
  )

  return { dimensions, overall }
}
