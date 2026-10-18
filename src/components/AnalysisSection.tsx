import { useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { useAnalysis } from '../services/analysis'
import TrendChart from './TrendChart'
import FrequencyChart from './FrequencyChart'
import OmissionTable from './OmissionTable'

type RangeKey = 'recent' | 'all' | 'custom'

/** 自定义范围：起止期号（优先）；仅填 N 时取最近 N 期 */
interface CustomRange {
  n: string
  from: string
  to: string
}

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
  const [custom, setCustom] = useState<CustomRange>({ n: '', from: '', to: '' })
  const [customErr, setCustomErr] = useState('')
  // 已应用的自定义切片（null = 未应用/无效）
  const [applied, setApplied] = useState<{ start: number; end: number } | null>(null)

  const draws = useMemo(() => {
    if (range !== 'custom') return range === 'recent' ? sorted.slice(0, 100) : sorted
    if (!applied) return null
    return sorted.slice(applied.start, applied.end + 1)
  }, [sorted, range, applied])

  const result = useAnalysis(draws ?? [], config)

  const applyCustom = () => {
    setCustomErr('')
    setApplied(null)
    const from = custom.from.trim()
    const to = custom.to.trim()
    if (from || to) {
      const iFrom = sorted.findIndex((d) => d.drawNo === from)
      const iTo = sorted.findIndex((d) => d.drawNo === to)
      if (iFrom < 0 || iTo < 0) {
        setCustomErr('起止期号不存在于本地数据，请检查（期号如 2026001）')
        return
      }
      // 若只填了一端，另一端取数据端点
      const s = iFrom < 0 ? sorted.length - 1 : iFrom
      const e = iTo < 0 ? 0 : iTo
      if (s < e) {
        setCustomErr('「起」期号应晚于「止」期号（数据按期号从新到旧）')
        return
      }
      setApplied({ start: e, end: s })
      return
    }
    const n = Number(custom.n)
    if (!Number.isInteger(n) || n < 2 || n > sorted.length) {
      setCustomErr(`请输入 2 ~ ${sorted.length} 的期数，或填写起止期号`)
      return
    }
    setApplied({ start: 0, end: n - 1 })
  }

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
          <button
            className={`range-tab${range === 'custom' ? ' is-active' : ''}`}
            onClick={() => setRange('custom')}
          >
            自定义
          </button>
        </div>
      </div>

      {range === 'custom' && (
        <div className="custom-range">
          <label>
            最近
            <input
              type="number"
              min={2}
              placeholder="期数"
              value={custom.n}
              onChange={(e) => setCustom((c) => ({ ...c, n: e.target.value }))}
            />
            期
          </label>
          <span className="custom-sep">或</span>
          <label>
            从
            <input
              placeholder="起始期号"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </label>
          <label>
            到
            <input
              placeholder="结束期号"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </label>
          <button className="btn" onClick={applyCustom}>
            应用
          </button>
        </div>
      )}
      {range === 'custom' && customErr && <p className="hint custom-err">{customErr}</p>}
      {range === 'custom' && !customErr && applied && (
        <p className="hint">
          已选 {sorted[applied.start]?.drawNo} ~ {sorted[applied.end]?.drawNo} 期（{applied.end - applied.start + 1} 期）
        </p>
      )}

      {!draws ? (
        <p className="hint">请输入并应用自定义范围</p>
      ) : !result ? (
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
