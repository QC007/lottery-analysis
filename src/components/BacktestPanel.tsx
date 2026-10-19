import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { runBacktest } from '../services/backtest'
import type { BacktestResult } from '../workers/backtest.worker'
import NumberPicker, { togglePick } from './NumberPicker'
import BacktestChart from './BacktestChart'
import PeriodPicker from './PeriodPicker'
import { isSuppressed, suppress24h } from '../services/rational'
import MotionCard from './MotionCard'

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

/** 默认模拟起点：约 3 年前（本地数据不足 3 年则取最旧一期） */
function defaultStartIdx(sorted: Draw[]): number {
  if (sorted.length === 0) return 0
  const cutoff = new Date(sorted[0].date)
  cutoff.setFullYear(cutoff.getFullYear() - 3)
  const iso = cutoff.toISOString().slice(0, 10)
  let idx = sorted.length - 1
  for (let i = 0; i < sorted.length; i++) if (sorted[i].date >= iso) idx = i
  return idx
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
  // 模拟起点期号（null = 默认近 3 年）；锚定 drawNo，归档扩充时自动跟随
  const [startNo, setStartNo] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<{ a: BacktestResult; b?: BacktestResult } | null>(null)
  // F-10：查看亏损模拟结果后的内联理性提示（24h 防疲劳）
  const [lossTip, setLossTip] = useState(false)

  // 彩种变化时重置选择与结果
  const configId = config.id
  useEffect(() => {
    setGroupA({ picks: emptyPicks(config) })
    setGroupB({ picks: emptyPicks(config) })
    setStartNo(null)
    setResults(null)
  }, [configId, config])

  const startIdx = useMemo(() => {
    if (sorted.length === 0) return 0
    if (!startNo) return defaultStartIdx(sorted)
    const i = sorted.findIndex((d) => d.drawNo === startNo)
    return i >= 0 ? i : defaultStartIdx(sorted)
  }, [sorted, startNo])
  const startDrawNo = sorted[startIdx]?.drawNo ?? null

  const readyA = picksComplete(config, groupA.picks)
  const readyB = picksComplete(config, groupB.picks)
  const canRun = readyA && (!compareOn || readyB) && sorted.length > 1 && !running

  const run = async () => {
    if (!startDrawNo) return
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
    <MotionCard className="card">
      <div className="card-head">
        <h2>模拟选号 · 历史回溯</h2>
        <label className="bt-compare">
          <input
            type="checkbox"
            checked={compareOn}
            onChange={(e) => setCompareOn(e.target.checked)}
          />
          对比模式（A/B 两组）
        </label>
      </div>
      <p className="hint">
        ① 在下方选出这组号码 ② 点快捷期数选起点（或用 −10/−1/+1/+10 微调）③ 点「开始模拟」：
        看这组号从那天起每期都花 {config.prize.unitCost} 元买，累计投入多少、中回多少、净盈亏多少。
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

      {sorted.length >= 2 && (
        <PeriodPicker
          single
          chips={[100, 300, 500]}
          count={sorted.length}
          value={[sorted.length - 1 - startIdx, sorted.length - 1]}
          format={(pos) => sorted[sorted.length - 1 - pos]?.drawNo ?? ''}
          onChange={([lo]) => setStartNo(sorted[sorted.length - 1 - lo].drawNo)}
        />
      )}

      <div className="bt-controls">
        <button className="btn" disabled={!canRun} onClick={run}>
          {running ? '计算中…' : '开始模拟'}
        </button>
      </div>

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
    </MotionCard>
  )
}
