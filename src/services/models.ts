import type { Draw, LotteryConfig, LotteryZone } from '../config/lotteries'

/**
 * 模型匹配（本地、诚实口径）
 *
 * 设计原则（对应需求 21.1 风险条款）：
 * - 每个模型在每期"只使用该期之前的数据"做走前验证（walk-forward），杜绝未来信息泄露
 * - 评估指标 = 主区命中个数；同时展示随机基准线（超几何分布期望 E = pick²/N）
 * - 匹配分换算：50 分 = 随机基准水平。理论上所有模型都会在 50 附近波动——
 *   这正是平台想传达的理性事实：任何选号策略都无法超越随机水平
 * - 模型类型为描述型统计策略，参数（窗口/阈值）与需求文档 13.4 对齐
 */

export interface ModelDef {
  type: string
  name: string
  desc: string
}

/** 候选模型（含随机基准模型自身，用于直观对照） */
export const MODEL_DEFS: ModelDef[] = [
  { type: 'random', name: '随机基准模型', desc: '按号码全集均匀随机选号（确定性伪随机，可复现）' },
  { type: 'hot30', name: '超短热号模型', desc: '选最近 30 期出现次数最多的 6 个主区号码' },
  { type: 'hot100', name: '近期热号模型', desc: '选最近 100 期出现次数最多的 6 个主区号码' },
  { type: 'freqall', name: '全历史频率模型', desc: '选有史以来出现次数最多的 6 个主区号码' },
  { type: 'cold', name: '冷号回补模型', desc: '选当前遗漏期数最长的 6 个主区号码' },
]

/** 走前回测的默认期数（评估窗口总长）；U-5 起可选，最大 = 全部本地历史 */
export const EVAL_PERIODS = 200
/** 进化评估窗口（期）——需求 13.4：晋升/淘汰均按"连续 10 窗口"判定 */
export const WINDOW = 10
/** 每期模型可用历史深度上限 */
const HIST_MAX = 1000
/** 每期最少历史期数（不足则该期不参与评估） */
const MIN_HIST = 30
/** 窗口"贴合"判定：窗口平均命中 ≥ 期望 × 0.9（随机波动带内） */
export const FIT_RATIO = 0.9

/** 随机基准期望：超几何分布均值 E[pick 中命中数] = pick × pick / N */
export function baselineExpected(zone: LotteryZone): number {
  const n = zone.max - zone.min + 1
  return (zone.pick * zone.pick) / n
}

export interface ModelEval {
  type: string
  name: string
  desc: string
  /** 走前回测平均主区命中数 */
  avgHits: number
  /** 按时间先后排列的各窗口平均命中 */
  windowHits: number[]
  /** 各窗口是否"贴合"（≥ E × FIT_RATIO） */
  windowsFit: boolean[]
  /** 匹配分：50 = 随机基准（与 avgHits 线性换算，0-100 截断） */
  score: number
  /** 实际参与评估的期数 */
  periods: number
}

/* ---------- 确定性伪随机（随机基准模型用，同期号结果可复现） ---------- */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 各模型在第 i 期（sorted 降序下标）的选号：只允许使用 sorted[i+1..] 的历史 */
function pickFor(
  type: string,
  history: Draw[],
  zone: LotteryZone,
  targetDrawNo: string,
): number[] {
  const nums: number[] = []
  for (let n = zone.min; n <= zone.max; n++) nums.push(n)

  if (type === 'random') {
    const rnd = mulberry32(hashStr(targetDrawNo))
    const pool = [...nums]
    const out: number[] = []
    for (let k = 0; k < zone.pick; k++) {
      out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0])
    }
    return out.sort((a, b) => a - b)
  }

  // 计数/遗漏权重 → 取权重最高（或遗漏最长）的 pick 个
  const weight = new Map<number, number>(nums.map((n) => [n, 0]))
  const scanLen =
    type === 'hot30' ? Math.min(30, history.length) : type === 'hot100' ? Math.min(100, history.length) : history.length
  for (let h = 0; h < scanLen; h++) {
    for (const n of history[h]?.zones[0] ?? []) weight.set(n, (weight.get(n) ?? 0) + 1)
  }

  if (type === 'cold') {
    // 权重改写为当前遗漏（从未出现 = history.length）
    for (const n of nums) weight.set(n, history.length)
    for (let h = 0; h < history.length; h++) {
      if (history[h]?.zones[0]?.some((n) => weight.has(n))) {
        for (const n of history[h].zones[0]) weight.set(n, h)
      }
    }
    return [...weight.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, zone.pick)
      .map(([n]) => n)
      .sort((a, b) => a - b)
  }

  return [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, zone.pick)
    .map(([n]) => n)
    .sort((a, b) => a - b)
}

/** 对最近 maxPeriods 期做走前回测（sorted 为期号降序全部本地数据；maxPeriods 默认 200，可传 sorted.length 评估全部历史） */
export function evaluateModels(
  config: LotteryConfig,
  sorted: Draw[],
  maxPeriods: number = EVAL_PERIODS,
): ModelEval[] {
  const zone = config.zones[0]
  const E = baselineExpected(zone)

  // 参与评估的目标期下标：0..maxPeriods-1（降序），时间从旧到新评估窗口
  const targetIdx: number[] = []
  for (let i = 0; i < Math.min(maxPeriods, sorted.length); i++) {
    if (sorted.length - (i + 1) >= MIN_HIST) targetIdx.push(i)
  }
  // 时间升序排列（评估窗口 0 = 最旧）
  targetIdx.reverse()

  return MODEL_DEFS.map((def) => {
    const hits: number[] = targetIdx.map((i) => {
      const history = sorted.slice(i + 1, i + 1 + HIST_MAX)
      const pick = pickFor(def.type, history, zone, sorted[i].drawNo)
      let h = 0
      for (const n of pick) if (sorted[i].zones[0].includes(n)) h++
      return h
    })

    // 切窗口（时间升序 → 窗口 0 最旧）
    const windowHits: number[] = []
    for (let w = 0; w < hits.length; w += WINDOW) {
      const seg = hits.slice(w, w + WINDOW)
      windowHits.push(seg.reduce((s, x) => s + x, 0) / (seg.length || 1))
    }
    const windowsFit = windowHits.map((avg) => avg >= E * FIT_RATIO)
    const avgHits = hits.length ? hits.reduce((s, x) => s + x, 0) / hits.length : 0
    const score = Math.max(0, Math.min(100, Math.round(50 + ((avgHits - E) / E) * 200)))

    return {
      type: def.type,
      name: def.name,
      desc: def.desc,
      avgHits: Math.round(avgHits * 1000) / 1000,
      windowHits: windowHits.map((x) => Math.round(x * 100) / 100),
      windowsFit,
      score,
      periods: hits.length,
    }
  })
}
