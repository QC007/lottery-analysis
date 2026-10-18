import type { Draw, LotteryConfig } from '../config/lotteries'

/**
 * 分析引擎（Web Worker 内运行，避免大计算阻塞 UI）
 * 纯函数、零依赖：输入统一 Draw 数组（降序，[0] 为最新期）+ 彩种分区配置
 * 统计口径（样本内统计，仅描述历史，不构成任何预测）：
 *   count      —— 样本内出现次数
 *   currentGap —— 当前遗漏：自最新一期起连续未开出的期数（最新期开出则为 0；样本内未出现则为样本期数）
 *   maxGap     —— 最大遗漏：各遗漏段（含首尾段与当前遗漏段）的最大值
 *   avgGap     —— 平均间隔 ≈ 样本期数 / (出现次数 + 1)
 */

export interface NumberStat {
  n: number
  count: number
  currentGap: number
  maxGap: number
  avgGap: number
}

export interface ZoneStats {
  key: string
  name: string
  numbers: NumberStat[]
}

export interface SumPoint {
  drawNo: string
  date: string
  /** 主区（第一区）和值 */
  sum: number
}

export interface AnalysisResult {
  /** 参与统计的期数 */
  total: number
  zones: ZoneStats[]
  /** 和值走势（按期号升序，供折线图） */
  sumTrend: SumPoint[]
}

export interface AnalyzeRequest {
  id: number
  draws: Draw[]
  config: Pick<LotteryConfig, 'zones'>
}
function analyze(req: AnalyzeRequest): AnalysisResult {
  const { draws, config } = req
  const total = draws.length

  const zones: ZoneStats[] = config.zones.map((zone, zi) => {
    const numbers: NumberStat[] = []
    for (let n = zone.min; n <= zone.max; n++) {
      let count = 0
      let lastPosAsc = -1 // 升序遍历中最近一次出现的位置（距最新期的期数）
      let firstSeen = false
      let prevPosAsc = -1
      let maxGap = 0

      // j 从 total-1 → 0 即按时间从旧到新遍历
      for (let j = total - 1; j >= 0; j--) {
        if (draws[j]?.zones[zi]?.includes(n)) {
          count++
          if (firstSeen) maxGap = Math.max(maxGap, prevPosAsc - j - 1)
          firstSeen = true
          prevPosAsc = j
          lastPosAsc = j
        }
      }

      const currentGap = count === 0 ? total : lastPosAsc
      // 首段：样本最旧端到最早一次出现之间的遗漏（近似样本无限延伸）
      const headGap = count === 0 ? total : total - 1 - prevPosAsc
      maxGap = Math.max(maxGap, headGap, currentGap)
      const avgGap = Math.round((total / (count + 1)) * 10) / 10

      numbers.push({ n, count, currentGap, maxGap, avgGap })
    }
    return { key: zone.key, name: zone.name, numbers }
  })

  // 和值走势：drawNo 定宽，字符串升序 = 时间升序
  const sumTrend: SumPoint[] = [...draws]
    .sort((a, b) => (a.drawNo < b.drawNo ? -1 : 1))
    .map((d) => ({
      drawNo: d.drawNo,
      date: d.date,
      sum: (d.zones[0] ?? []).reduce((s, x) => s + x, 0),
    }))

  return { total, zones, sumTrend }
}

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  ;(self as unknown as Worker).postMessage({ id: e.data.id, result: analyze(e.data) })
}
