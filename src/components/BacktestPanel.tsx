import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { runBacktest } from '../services/backtest'
import type { BacktestResult } from '../workers/backtest.worker'
import NumberPicker, { togglePick } from './NumberPicker'
import BacktestChart from './BacktestChart'
import { isSuppressed, suppress24h } from '../services/rational'

type RangeKey = '100' | '1y' | '3y' | 'all' | 'custom'

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '100', label: '近 100 期' },
  { key: '1y', label: '近 1 年' },
  { key: '3y', label: '近 3 年' },
  { key: 'all', label: '全部历史' },
  { key: 'custom', label: '自定义' },
]

interface Group {
  /** 每区已选号码 */
  picks: number[][]
}

function emptyPicks(config: LotteryConfig): number[][] {
  return config.zones.map(() => [])
}

function picksComplete(config: LotteryConfig, picks: number[][]): boolean {
  return config.zones.every((z, i) => (picks[i] ?? []).length === z.pick)
}

/** 由范围快捷项推算起始期号（draws 降序） */
function resolveStartDrawNo(sorted: Draw[], range: RangeKey): string | null {
  if (sorted.length === 0) return null
  if (range === 'all') return sorted[sorted.length - 1].drawNo
  if (range === '100') return sorted[Math.min(99, sorted.length - 1)].drawNo
  if (range === 'custom') return null // 由 resolveCustomStart 处理
  const years = range === '1y' ? 1 : 3
  const cutoff = new Date(sorted[0].date)
  cutoff.setFullYear(cutoff.getFullYear() - years)
  const iso = cutoff.toISOString().slice(0, 10)
  // 找到不早于 cutoff 的最旧一期
  let start = sorted[sorted.length - 1]
  for (const d of sorted) if (d.date >= iso) start = d
  return start.drawNo
}

/** 自定义范围起始期号：填了期号用期号（须存在），否则取最近 N 期 */
function resolveCustomStart(sorted: Draw[], startNo: string, n: string): string | null {
  if (sorted.length === 0) return null
  const no = startNo.trim()
  if (no) {
    return sorted.some((d) => d.drawNo === no) ? no : null
  }
  const count = Number(n)
  if (!Number.isInteger(count) || count < 2 || count > sorted.length) return null
  return sorted[Math.min(count - 1, sorted.length - 1)].drawNo
}

function Summary({ name, r }: { name: string; r: BacktestResult }) {
  const fixedHits = r.tierHits.filter((t) => t.amount > 0).reduce((s, t) => s + t.hits, 0)
  const floatHits = r.tierHits.filter((t) => t.amount === 0).reduce((s, t) => s + t.hits, 0)
  return (
    <div className="bt-summary">
      <h4 className="bt-name">{name}</h4>
      <div className="bt-grid">
        <div className="bt-cell">
          <em>模拟期数</em>
          <b>{r.periods}</b>
        </div>
        <div className="bt-cell">
          <em>累计投入</em>
          <b>{r.totalInvested} 元</b>
        </div>
        <div className="bt-cell">
          <em>累计中奖（固定奖）</em>
          <b>{r.totalWon} 元</b>
        </div>
        <div className={`bt-cell ${r.net < 0 ? 'is-loss' : 'is-profit'}`}>
          <em>净盈亏</em>
          <b>{r.net} 元</b>
        </div>
        <div className="bt-cell">
          <em>中奖期数（固定奖）</em>
          <b>
            {fixedHits} / {r.periods}
          </b>
        </div>
        <div className="bt-cell">
          <em>最高连亏</em>
          <b>{r.maxLoseStreak} 期</b>
        </div>
      </div>
      {floatHits > 0 && (
        <p className="hint">
          模拟期内命中浮动奖（一、二等奖）{floatHits} 次；浮动奖每期金额不同且未含在静态数据中，未计入上方金额。
        </p>
      )}
      <table className="omission-table bt-tiers">
        <thead>
          <tr>
            <th>奖级</th>
            <th>单注奖金</th>
            <th>命中次数</th>
          </tr>
        </thead>
        <tbody>
          {r.tierHits.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td>{t.amount > 0 ? `${t.amount} 元` : '浮动'}</td>
              <td className={t.hits > 0 ? 'gap-hot' : ''}>{t.hits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** F-03「如果当时选了这个号」回溯模拟器 */
export default function BacktestPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const [groupA, setGroupA] = useState<Group>({ picks: emptyPicks(config) })
  const [groupB, setGroupB] = useState<Group>({ picks: emptyPicks(config) })
  const [compareOn, setCompareOn] = useState(false)
  const [range, setRange] = useState<RangeKey>('3y')
  // 自定义范围：起始期号（优先）或最近 N 期
  const [customStart, setCustomStart] = useState('')
  const [customN, setCustomN] = useState('')
  const [customErr, setCustomErr] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<{ a: BacktestResult; b?: BacktestResult } | null>(null)
  // F-10：查看亏损模拟结果后的内联理性提示（24h 防疲劳）
  const [lossTip, setLossTip] = useState(false)

  // 彩种变化时重置选择与结果
  const configId = config.id
  useEffect(() => {
    setGroupA({ picks: emptyPicks(config) })
    setGroupB({ picks: emptyPicks(config) })
    setResults(null)
  }, [configId, config])

  const readyA = picksComplete(config, groupA.picks)
  const readyB = picksComplete(config, groupB.picks)
  const canRun = readyA && (!compareOn || readyB) && sorted.length > 0 && !running

  const run = async () => {
    setCustomErr('')
    const startDrawNo =
      range === 'custom'
        ? resolveCustomStart(sorted, customStart, customN)
        : resolveStartDrawNo(sorted, range)
    if (!startDrawNo) {
      setCustomErr('自定义范围无效：请填写本地存在的起始期号，或 2 ~ 本地期数 的期数')
      return
    }
    setRunning(true)
    setLossTip(false)
    try {
      const a = await runBacktest(groupA.picks, sorted, startDrawNo, config)
      const b =
        compareOn && readyB
          ? await runBacktest(groupB.picks, sorted, startDrawNo, config)
          : undefined
      setResults({ a, b })
      const worstNet = Math.min(a.net, b?.net ?? a.net)
      if (worstNet < 0) {
        const suppressed = await isSuppressed('lossSim')
        if (!suppressed) setLossTip(true)
      }
    } finally {
      setRunning(false)
    }
  }

  const chartSeries = useMemo(() => {
    if (!results) return []
    const list = [{ name: compareOn ? '组合 A' : '净盈亏', points: results.a.points }]
    if (results.b) list.push({ name: '组合 B', points: results.b.points })
    return list
  }, [results, compareOn])

  if (!config.prize) return null

  return (
    <section className="card">
      <div className="card-head">
        <h2>「如果当时选了这个号」回溯模拟</h2>
        <label className="bt-compare">
          <input
            type="checkbox"
            checked={compareOn}
            onChange={(e) => setCompareOn(e.target.checked)}
          />
          对比模式
        </label>
      </div>
      <p className="hint">
        输入一组号码并选择起始范围，模拟「从那天开始每期都花 {config.prize.unitCost}
        元投注这组号码」的完整资金时间线。
      </p>

      <div className="bt-groups">
        <div className="bt-group">
          <h3 className="sub-title">{compareOn ? '组合 A' : '选号'}</h3>
          {config.zones.map((z, zi) => (
            <NumberPicker
              key={z.key}
              zone={z}
              selected={groupA.picks[zi]}
              onToggle={(n) =>
                setGroupA((g) => ({
                  picks: g.picks.map((p, i) => (i === zi ? togglePick(p, n, z.pick) : p)),
                }))
              }
            />
          ))}
        </div>
        {compareOn && (
          <div className="bt-group">
            <h3 className="sub-title">组合 B</h3>
            {config.zones.map((z, zi) => (
              <NumberPicker
                key={z.key}
                zone={z}
                selected={groupB.picks[zi]}
                onToggle={(n) =>
                  setGroupB((g) => ({
                    picks: g.picks.map((p, i) => (i === zi ? togglePick(p, n, z.pick) : p)),
                  }))
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="bt-controls">
        <div className="range-tabs">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              className={`range-tab${range === o.key ? ' is-active' : ''}`}
              onClick={() => setRange(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button className="btn" disabled={!canRun} onClick={run}>
          {running ? '计算中…' : '开始模拟'}
        </button>
      </div>

      {range === 'custom' && (
        <div className="custom-range">
          <label>
            从
            <input
              placeholder="起始期号"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <span className="custom-sep">或最近</span>
          <label>
            <input
              type="number"
              min={2}
              placeholder="期数"
              value={customN}
              onChange={(e) => setCustomN(e.target.value)}
            />
            期
          </label>
          <span className="hint">（模拟从起点运行至最新一期）</span>
        </div>
      )}
      {range === 'custom' && customErr && <p className="hint custom-err">{customErr}</p>}

      {sorted.length === 0 && <p className="hint">本地暂无数据，请先等待同步完成。</p>}

      {results && (
        <>
          <BacktestChart series={chartSeries} />
          <div className="bt-summaries">
            <Summary name={compareOn ? '组合 A' : '模拟结果'} r={results.a} />
            {results.b && <Summary name="组合 B" r={results.b} />}
          </div>
          {lossTip && (
            <div className="loss-tip" role="status">
              <span>历史数据不代表未来，请理性购彩。</span>
              <button
                className="rational-btn"
                onClick={() => void suppress24h('lossSim').then(() => setLossTip(false))}
              >
                24h 内不再提示
              </button>
              <button className="rational-btn" onClick={() => setLossTip(false)}>
                知道了
              </button>
            </div>
          )}
          <p className="hint bt-disclaimer">
            基于历史数据的模拟结果，不代表未来表现。彩票开奖为独立随机事件，任何号码组合的长期期望收益均为负，请理性购彩。
          </p>
        </>
      )}
    </section>
  )
}
