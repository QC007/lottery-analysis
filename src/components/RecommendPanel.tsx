import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { generateRecommendations, type RecommendResult } from '../services/recommend'
import { Ball } from './Ball'
import PeriodPicker from './PeriodPicker'

const BET_CHIPS = [1, 2, 3, 4, 5]
/** 数据少于此期数时统计意义太弱，不允许生成 */
const MIN_WINDOW = 10

/**
 * U-3 AI 推荐号码
 * 用户主动点击生成：选历史期数范围 + 注数（1~5）→ 多算法融合打分 → 加权抽样
 * 每个号码附入选依据，整体附推算原理与诚实免责声明
 */
export default function RecommendPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const n = sorted.length
  // 统计窗口（期号锚定，null = 默认近 100 期）——与分析区同一模式
  const [sel, setSel] = useState<{ from: string; to: string } | null>(null)
  const [betCount, setBetCount] = useState(2)
  const [result, setResult] = useState<RecommendResult | null>(null)

  const configId = config.id
  useEffect(() => {
    setSel(null)
    setResult(null)
    setBetCount(2)
  }, [configId])

  const toIdx = useMemo(() => {
    if (!sel) return 0
    const i = sorted.findIndex((d) => d.drawNo === sel.to)
    return i >= 0 ? i : 0
  }, [sorted, sel])
  const fromIdx = useMemo(() => {
    if (!sel) return Math.min(99, n - 1)
    const i = sorted.findIndex((d) => d.drawNo === sel.from)
    return i >= 0 ? i : Math.min(99, n - 1)
  }, [sorted, sel, n])

  const windowDraws = useMemo(
    () => (n > 0 ? sorted.slice(toIdx, Math.max(fromIdx, toIdx) + 1) : []),
    [sorted, n, toIdx, fromIdx],
  )

  // PeriodPicker 位置语义：0=最旧，n-1=最新
  const win: [number, number] = [n - 1 - Math.max(fromIdx, toIdx), n - 1 - toIdx]
  const format = (pos: number) => sorted[n - 1 - pos]?.drawNo ?? ''

  const canGenerate = windowDraws.length >= MIN_WINDOW
  const generate = () => {
    if (!canGenerate) return
    setResult(generateRecommendations(config, windowDraws, betCount))
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>AI 推荐号码</h2>
      </div>
      <p className="hint">
        ① 选历史期数范围 ② 选注数 ③ 点「生成推荐」：频率、热度、遗漏回补等多种统计
        算法融合打分后加权抽样，每个号码下方附入选依据。
      </p>

      {n >= 2 && (
        <PeriodPicker
          count={n}
          value={win}
          format={format}
          onChange={([lo, hi]) => {
            setSel({ from: sorted[n - 1 - lo].drawNo, to: sorted[n - 1 - hi].drawNo })
            setResult(null)
          }}
        />
      )}

      <div className="rec-controls">
        <div className="pp-chips" role="group" aria-label="生成注数">
          {BET_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className={`pp-chip${betCount === c ? ' is-active' : ''}`}
              onClick={() => setBetCount(c)}
            >
              {c} 注
            </button>
          ))}
        </div>
        <button className="btn" disabled={!canGenerate} onClick={generate}>
          生成推荐
        </button>
      </div>
      {!canGenerate && (
        <p className="hint">当前窗口仅 {windowDraws.length} 期，至少 {MIN_WINDOW} 期才能生成，请扩大范围。</p>
      )}

      {result && (
        <>
          {result.bets.map((bet, bi) => (
            <div className="rec-bet" key={bi}>
              <h3 className="sub-title">第 {bi + 1} 注</h3>
              {bet.zones.map((nums, zi) => (
                <div className="rec-zone" key={config.zones[zi].key}>
                  <span className="zone-name">{config.zones[zi].name}</span>
                  <div className="rec-nums">
                    {nums.map(({ n: num, reason }) => (
                      <span className="rec-cell" key={num}>
                        <Ball zone={config.zones[zi]} n={num} />
                        <i className="rec-reason">{reason}</i>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <p className="hint rec-principle">
            <b>推算原理</b>：基于你选定的 {result.windowSize} 期历史（{result.fromNo} ~{' '}
            {result.toNo}），对全部号码做 4 类算法打分——① 全窗口频率统计（权重 35%）
            ② 近 {result.recentSize} 期热度（权重 30%）③ 冷号遗漏回补（权重 25%）
            ④ 随机扰动（权重 10%）；加权合成 0~1 综合分后按分数做「不放回抽样」逐注生成。
            号码下方标签为该号码得分最高的因子，即入选主因。
          </p>
          <p className="hint bt-disclaimer">
            重要：每期开奖相互独立，历史统计不改变任何号码的中奖概率——以上推荐与机选期望完全相同，
            仅为多算法统计游戏，不构成投注建议，请理性购彩。
          </p>
        </>
      )}
    </section>
  )
}
