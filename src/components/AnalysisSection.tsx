import { useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { useAnalysis } from '../services/analysis'
import TrendChart from './TrendChart'
import FrequencyChart from './FrequencyChart'
import OmissionTable from './OmissionTable'

type RangeKey = 'recent' | 'all'

/** 分析区：范围切换 → Worker 计算 → 走势图 + 频率图 + 遗漏表 */
export default function AnalysisSection({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const [range, setRange] = useState<RangeKey>('recent')
  const draws = useMemo(
    () => (range === 'recent' ? sorted.slice(0, 100) : sorted),
    [sorted, range],
  )
  const result = useAnalysis(draws, config)

  return (
    <section className="card">
      <div className="card-head">
        <h2>走势与号码分析</h2>
        <div className="range-tabs">
          <button
            className={`range-tab${range === 'recent' ? ' is-active' : ''}`}
            onClick={() => setRange('recent')}
          >
            近 100 期
          </button>
          <button
            className={`range-tab${range === 'all' ? ' is-active' : ''}`}
            onClick={() => setRange('all')}
          >
            本地全部 {sorted.length} 期
          </button>
        </div>
      </div>

      {!result ? (
        <p className="hint">分析引擎计算中（Web Worker）…</p>
      ) : (
        <>
          <h3 className="sub-title">「{config.zones[0].name}」和值走势（{result.total} 期）</h3>
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
    </section>
  )
}
