import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { useAnalysis } from '../services/analysis'
import TrendChart from './TrendChart'
import FrequencyChart from './FrequencyChart'
import OmissionTable from './OmissionTable'
import PeriodPicker from './PeriodPicker'

/** 分析区：期数快捷 chips + 步进按钮选窗口 → Worker 计算 → 走势图 + 频率图 + 遗漏表 */
export default function AnalysisSection({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const n = sorted.length
  // 窗口以期号锚定（from=较旧，to=较新），null = 默认近 100 期；
  // 锚定 drawNo 而非位置：归档数据扩充时期号不变，窗口自动跟随
  const [sel, setSel] = useState<{ from: string; to: string } | null>(null)
  const configId = config.id
  useEffect(() => setSel(null), [configId])

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

  const draws = useMemo(
    () => (n > 0 ? sorted.slice(toIdx, Math.max(fromIdx, toIdx) + 1) : []),
    [sorted, n, toIdx, fromIdx],
  )
  const result = useAnalysis(draws, config)

  // 滑动条位置语义：0=最旧，n-1=最新
  const win: [number, number] = [n - 1 - Math.max(fromIdx, toIdx), n - 1 - toIdx]
  const format = (pos: number) => sorted[n - 1 - pos]?.drawNo ?? ''

  return (
    <section className="card">
      <div className="card-head">
        <h2>走势与号码分析</h2>
      </div>

      {n < 2 ? (
        <p className="hint">本地数据不足，请等待同步完成。</p>
      ) : (
        <>
          <p className="hint">统计范围：点快捷期数一键选择，或用 −10/−1/+1/+10 平移窗口；图表支持滚轮 / 双指缩放。</p>
          <PeriodPicker
            count={n}
            value={win}
            format={format}
            onChange={([lo, hi]) =>
              setSel({ from: sorted[n - 1 - lo].drawNo, to: sorted[n - 1 - hi].drawNo })
            }
          />
          {!result ? (
            <p className="hint">分析引擎计算中（Web Worker）…</p>
          ) : (
            <>
              <h3 className="sub-title">
                「{config.zones[0].name}」和值走势（{result.total} 期）
              </h3>
              <TrendChart points={result.sumTrend} />
              {result.zones.map((z) => (
                <div className="zone-analysis" key={z.key}>
                  <h3 className="sub-title">{z.name}频率</h3>
                  <FrequencyChart zone={z} />
                  <OmissionTable zone={z} />
                </div>
              ))}
              <p className="hint">
                以上为历史数据统计描述，号码开出为独立随机事件，冷热与遗漏不代表未来走势，请理性看待。
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
