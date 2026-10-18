import type { Draw, LotteryConfig, PrizeRule } from '../config/lotteries'

/**
 * U-4 自选号码历史表现分析（纯函数，主线程计算量极小）
 * 输入一组用户自选号码 + 自选历史窗口，输出：
 *  - 该窗口内中过哪些奖（按官方奖级规则逐期比对，次数统计 + 中奖期明细）
 *  - 组内每个号码的出现次数、出现概率、当前遗漏、最大不出期数（最大遗漏）、最大连续出期数
 *
 * 奖级判定与 backtest.worker 一致：按 prize.tiers 顺序取第一个命中的奖级。
 */

export interface PrizeHit {
  drawNo: string
  date: string
  tierName: string
  /** 单注固定奖金；0 = 浮动奖（一、二等奖，金额未含在静态数据中） */
  amount: number
}

export interface NumberStat {
  n: number
  /** 窗口内出现次数 */
  count: number
  /** 出现概率 = 次数 / 窗口期数 */
  ratio: number
  /** 当前遗漏：距窗口最新期连续未出期数（整窗未出 = periods） */
  currentGap: number
  /** 最大不出期数（最大遗漏） */
  maxGap: number
  /** 最大连续出期数 */
  maxStreak: number
}

export interface MyNumbersResult {
  /** 窗口期数 */
  periods: number
  /** 各奖级命中次数（按 tiers 顺序；无奖级配置的彩种为空数组） */
  tierHits: { name: string; amount: number; hits: number }[]
  /** 中奖期明细（期号降序，最新在前） */
  hits: PrizeHit[]
  /** 每区每个所选号码的统计（号码升序） */
  zones: { key: string; name: string; stats: NumberStat[] }[]
}

function countHits(pick: number[], drawn: number[]): number {
  let n = 0
  for (const x of pick) if (drawn.includes(x)) n++
  return n
}

function matchTier(
  picks: number[][],
  draw: Draw,
  prize: PrizeRule,
): { name: string; amount: number } | null {
  const mainHit = countHits(picks[0] ?? [], draw.zones[0] ?? [])
  const subHit = countHits(picks[1] ?? [], draw.zones[1] ?? [])
  for (const tier of prize.tiers) {
    if (tier.match.some(([m, s]) => m === mainHit && s === subHit)) {
      return { name: tier.name, amount: tier.amount }
    }
  }
  return null
}

/** 单号码统计。present 为时间降序布尔序列（[0] = 最新期，true = 该期开出） */
function statOne(present: boolean[]): Omit<NumberStat, 'n'> {
  const periods = present.length
  let count = 0
  for (const p of present) if (p) count++

  // 当前遗漏：从最新期往旧数，连续未出期数
  let currentGap = 0
  while (currentGap < periods && !present[currentGap]) currentGap++

  // 时间升序扫描最大遗漏与最大连出（窗口两端的长遗漏同样计入）
  let gap = 0
  let maxGap = 0
  let streak = 0
  let maxStreak = 0
  for (let i = periods - 1; i >= 0; i--) {
    if (present[i]) {
      streak++
      if (streak > maxStreak) maxStreak = streak
      if (gap > maxGap) maxGap = gap
      gap = 0
    } else {
      gap++
      streak = 0
    }
  }
  if (gap > maxGap) maxGap = gap

  return {
    count,
    ratio: periods > 0 ? count / periods : 0,
    currentGap,
    maxGap,
    maxStreak,
  }
}

/**
 * @param config 彩种配置（奖级规则取自 config.prize）
 * @param picks 用户选定号码（按 zones 顺序，各区升序）
 * @param windowDraws 自选历史窗口（期号降序，[0] 为窗口最新期）
 */
export function analyzeMyNumbers(
  config: LotteryConfig,
  picks: number[][],
  windowDraws: Draw[],
): MyNumbersResult {
  const periods = windowDraws.length

  const tierHits = (config.prize?.tiers ?? []).map((t) => ({
    name: t.name,
    amount: t.amount,
    hits: 0,
  }))
  const hits: PrizeHit[] = []
  if (config.prize) {
    for (const d of windowDraws) {
      const t = matchTier(picks, d, config.prize)
      if (t) {
        const row = tierHits.find((x) => x.name === t.name)
        if (row) row.hits++
        hits.push({ drawNo: d.drawNo, date: d.date, tierName: t.name, amount: t.amount })
      }
    }
  }

  const zones = config.zones.map((zone, zi) => ({
    key: zone.key,
    name: zone.name,
    stats: (picks[zi] ?? []).map((num) => {
      const present = windowDraws.map((d) => (d.zones[zi] ?? []).includes(num))
      return { n: num, ...statOne(present) }
    }),
  }))

  return { periods, tierHits, hits, zones }
}
