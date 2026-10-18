import type { Draw, PrizeRule } from '../config/lotteries'

/**
 * 回溯模拟引擎（Web Worker，F-03）
 * 输入一组号码 + 起始期号，模拟"从该期开始每期都投注这组号码"：
 * 逐期比对中奖情况，输出累计投入/累计中奖/净盈亏时间线与统计。
 *
 * 奖级判定：按 prize.tiers 顺序取第一个命中的奖级（官方规则）。
 * 浮动奖（amount=0，一、二等奖）：单独计数，不计入金额 —— 历史每期实际
 * 派奖金额不在静态数据中，估算会失真，UI 如实标注"未计入"。
 */

export interface BacktestRequest {
  id: number
  /** 用户选定号码（按 zones 顺序，各区升序） */
  picks: number[][]
  /** 参与模拟的历史开奖（drawNo 降序，[0] 为最新期） */
  draws: Draw[]
  /** 起始期号（含）；模拟范围 = 起始期 ~ 最新期 */
  startDrawNo: string
  prize: PrizeRule
}

export interface BacktestPoint {
  drawNo: string
  date: string
  /** 截至该期累计投入（元） */
  invested: number
  /** 截至该期累计固定奖中奖（元，不含浮动奖） */
  won: number
  /** won - invested */
  net: number
  /** 该期命中奖级名；未中奖为 null */
  tierName: string | null
}

export interface BacktestResult {
  /** 实际参与模拟的期数 */
  periods: number
  unitCost: number
  totalInvested: number
  totalWon: number
  net: number
  /** 最高连亏期数（连续未中任何奖级） */
  maxLoseStreak: number
  /** 各奖级命中次数（按 tiers 顺序） */
  tierHits: { name: string; amount: number; hits: number }[]
  /** 时间升序的逐期累计序列 */
  points: BacktestPoint[]
}

function matchTier(
  pick: number[][],
  draw: Draw,
  prize: PrizeRule,
): { name: string; amount: number } | null {
  const mainHit = countHits(pick[0] ?? [], draw.zones[0] ?? [])
  const subHit = countHits(pick[1] ?? [], draw.zones[1] ?? [])
  for (const tier of prize.tiers) {
    if (tier.match.some(([m, s]) => m === mainHit && s === subHit)) {
      return { name: tier.name, amount: tier.amount }
    }
  }
  return null
}

function countHits(pick: number[], drawn: number[]): number {
  let n = 0
  for (const x of pick) if (drawn.includes(x)) n++
  return n
}

function backtest(req: BacktestRequest): BacktestResult {
  const { picks, draws, startDrawNo, prize } = req

  // 模拟范围：起始期（含）~ 最新期；draws 降序 → 过滤后翻转为时间升序
  const scope = draws
    .filter((d) => d.drawNo >= startDrawNo)
    .sort((a, b) => (a.drawNo < b.drawNo ? -1 : 1))

  const tierHits = prize.tiers.map((t) => ({ name: t.name, amount: t.amount, hits: 0 }))
  const points: BacktestPoint[] = []

  let invested = 0
  let won = 0
  let loseStreak = 0
  let maxLoseStreak = 0

  for (const d of scope) {
    invested += prize.unitCost
    const hit = matchTier(picks, d, prize)
    if (hit) {
      const idx = tierHits.findIndex((t) => t.name === hit.name)
      if (idx >= 0) tierHits[idx].hits++
      won += hit.amount
      loseStreak = 0
    } else {
      loseStreak++
      maxLoseStreak = Math.max(maxLoseStreak, loseStreak)
    }
    points.push({
      drawNo: d.drawNo,
      date: d.date,
      invested,
      won,
      net: won - invested,
      tierName: hit?.name ?? null,
    })
  }

  return {
    periods: scope.length,
    unitCost: prize.unitCost,
    totalInvested: invested,
    totalWon: won,
    net: won - invested,
    maxLoseStreak,
    tierHits,
    points,
  }
}

self.onmessage = (e: MessageEvent<BacktestRequest>) => {
  ;(self as unknown as Worker).postMessage({ id: e.data.id, result: backtest(e.data) })
}
