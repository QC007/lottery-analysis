import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { diagnose, type HealthReport } from '../services/health'
import NumberPicker, { togglePick } from './NumberPicker'
import HealthRadar from './HealthRadar'

function emptyPicks(config: LotteryConfig): number[][] {
  return config.zones.map(() => [])
}

/** F-04 组合健康度诊断 */
export default function HealthPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const [picks, setPicks] = useState<number[][]>(emptyPicks(config))
  const [report, setReport] = useState<HealthReport | null>(null)

  const configId = config.id
  useEffect(() => {
    setPicks(emptyPicks(config))
    setReport(null)
  }, [configId, config])

  const ready = config.zones.every((z, i) => (picks[i] ?? []).length === z.pick)
  const canRun = ready && sorted.length > 0

  const advices = useMemo(
    () => report?.dimensions.filter((d) => d.advice) ?? [],
    [report],
  )

  return (
    <section className="card">
      <div className="card-head">
        <h2>组合健康度诊断</h2>
      </div>
      <p className="hint">
        输入一组号码，从奇偶、大小、区间、连号、和值、跨度六个维度评估组合的「均衡性」（历史常见区间取自本地{' '}
        {sorted.length} 期样本）。
      </p>

      {config.zones.map((z, zi) => (
        <NumberPicker
          key={z.key}
          zone={z}
          selected={picks[zi]}
          onToggle={(n) =>
            setPicks((p) => p.map((x, i) => (i === zi ? togglePick(x, n, z.pick) : x)))
          }
        />
      ))}

      <div className="bt-controls">
        <button className="btn" disabled={!canRun} onClick={() => setReport(diagnose(picks, config, sorted))}>
          开始诊断
        </button>
      </div>
      {sorted.length === 0 && <p className="hint">本地暂无数据，请先等待同步完成。</p>}

      {report && (
        <>
          <div className="health-overall">
            <span className="health-score">{report.overall}</span>
            <span className="health-label">综合健康度</span>
          </div>
          <HealthRadar dimensions={report.dimensions} />
          <table className="omission-table">
            <thead>
              <tr>
                <th>维度</th>
                <th>得分</th>
                <th>检测详情</th>
              </tr>
            </thead>
            <tbody>
              {report.dimensions.map((d) => (
                <tr key={d.key}>
                  <td>{d.name}</td>
                  <td className={d.score < 70 ? 'gap-hot' : ''}>{d.score}</td>
                  <td className="health-detail">{d.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {advices.length > 0 && (
            <div className="health-advice">
              <h3 className="sub-title">调整建议</h3>
              <ul>
                {advices.map((d) => (
                  <li key={d.key}>
                    【{d.name}】{d.advice}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="hint bt-disclaimer">
            健康度仅描述组合与历史统计特征的吻合程度，不代表中奖概率更高。每组号码的中奖概率完全相同，请理性看待。
          </p>
        </>
      )}
    </section>
  )
}
