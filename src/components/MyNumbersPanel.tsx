import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { analyzeMyNumbers, type MyNumbersResult } from '../services/mynumbers'
import NumberPicker, { togglePick } from './NumberPicker'
import PeriodPicker from './PeriodPicker'
import { Ball } from './Ball'

/** 中奖明细最多列出条数（超出提示总数） */
const HIT_LIST_CAP = 50

function emptyPicks(config: LotteryConfig): number[][] {
  return config.zones.map(() => [])
}

function picksComplete(config: LotteryConfig, picks: number[][]): boolean {
  return config.zones.every((z, i) => (picks[i] ?? []).length === z.pick)
}

/**
 * U-4 自选号码分析（历史 Tab）
 * ① 选一组号码 ② 选历史范围 ③ 点「开始分析」：
 * 该组号码在此历史片段中中过哪些奖（官方奖级规则逐期比对），
 * 以及组内每个号码的出现次数、概率、当前遗漏、最大遗漏、最大连出。
 */
export default function MyNumbersPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const n = sorted.length
  const [picks, setPicks] = useState<number[][]>(() => emptyPicks(config))
  // 窗口以期号锚定（from=较旧，to=较新），null = 默认近 100 期
  const [sel, setSel] = useState<{ from: string; to: string } | null>(null)
  const [result, setResult] = useState<MyNumbersResult | null>(null)

  // 彩种变化时重置
  const configId = config.id
  useEffect(() => {
    setPicks(emptyPicks(config))
    setSel(null)
    setResult(null)
  }, [configId, config])

  // 输入（选号/窗口）变化后旧结果作废，避免结果与输入不一致
  useEffect(() => {
    setResult(null)
  }, [picks, sel])

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

  const ready = picksComplete(config, picks)
  const canRun = ready && windowDraws.length >= 2

  const run = () => {
    if (!canRun) return
    setResult(analyzeMyNumbers(config, picks, windowDraws))
  }

  const fixedHits = result
    ? result.tierHits.filter((t) => t.amount > 0).reduce((s, t) => s + t.hits, 0)
    : 0
  const floatHits = result
    ? result.tierHits.filter((t) => t.amount === 0).reduce((s, t) => s + t.hits, 0)
    : 0

  return (
    <section className="card">
      <div className="card-head">
        <h2>自选号码分析</h2>
      </div>
      <p className="hint">
        ① 在下方选出一组号码 ② 点快捷期数或拖动滑块选历史范围 ③ 点「开始分析」：
        看这组号码在这段历史里中过哪些奖，以及每个号码的出现次数、概率、遗漏与连出情况。
      </p>

      {config.zones.map((z, zi) => (
        <NumberPicker
          key={z.key}
          zone={z}
          selected={picks[zi] ?? []}
          onToggle={(num) =>
            setPicks((ps) => ps.map((p, i) => (i === zi ? togglePick(p, num, z.pick) : p)))
          }
        />
      ))}

      {n >= 2 && (
        <PeriodPicker
          count={n}
          value={win}
          format={format}
          onChange={([lo, hi]) =>
            setSel({ from: sorted[n - 1 - lo].drawNo, to: sorted[n - 1 - hi].drawNo })
          }
        />
      )}

      <div className="bt-controls">
        <button className="btn" disabled={!canRun} onClick={run}>
          开始分析
        </button>
      </div>
      {!ready && <p className="hint">按上方各区要求选满号码后可开始分析</p>}
      {n < 2 && <p className="hint">本地暂无数据，请先等待同步完成。</p>}

      {result && (
        <>
          <h3 className="sub-title">奖级命中（{result.periods} 期）</h3>
          {config.prize ? (
            result.hits.length > 0 ? (
              <>
                <p className="hint">
                  共 {result.hits.length} 期中奖：固定奖 {fixedHits} 期
                  {floatHits > 0 &&
                    `，浮动奖（一、二等奖）${floatHits} 期（金额未含在静态数据中，未计入）`}
                </p>
                <table className="omission-table bt-tiers">
                  <thead>
                    <tr>
                      <th>奖级</th>
                      <th>单注奖金</th>
                      <th>命中次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.tierHits.map((t) => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td>{t.amount > 0 ? `${t.amount} 元` : '浮动'}</td>
                        <td className={t.hits > 0 ? 'gap-hot' : ''}>{t.hits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mn-hits">
                  {result.hits.slice(0, HIT_LIST_CAP).map((h) => (
                    <div className="mn-hit-row" key={h.drawNo}>
                      <span>第 {h.drawNo} 期</span>
                      <span className="mn-date">{h.date}</span>
                      <span className="mn-tier">
                        {h.tierName}
                        {h.amount > 0 ? ` · ${h.amount} 元` : ' · 浮动奖'}
                      </span>
                    </div>
                  ))}
                </div>
                {result.hits.length > HIT_LIST_CAP && (
                  <p className="hint">
                    共 {result.hits.length} 期中奖，仅列最近 {HIT_LIST_CAP} 期
                  </p>
                )}
              </>
            ) : (
              <p className="hint">该历史范围内这组号码未中任何奖级。</p>
            )
          ) : (
            <p className="hint">该彩种暂无奖级规则配置，仅统计号码表现。</p>
          )}

          {result.zones.map((z, zi) => (
            <div key={z.key}>
              <h3 className="sub-title">「{z.name}」所选号码表现</h3>
              <table className="omission-table mn-table">
                <thead>
                  <tr>
                    <th>号码</th>
                    <th>出现次数</th>
                    <th>出现概率</th>
                    <th>当前遗漏</th>
                    <th>最大遗漏</th>
                    <th>最大连出</th>
                  </tr>
                </thead>
                <tbody>
                  {z.stats.map((s) => (
                    <tr key={s.n}>
                      <td>
                        <Ball zone={config.zones[zi]} n={s.n} />
                      </td>
                      <td className={s.count > 0 ? 'gap-hot' : ''}>{s.count}</td>
                      <td>{(s.ratio * 100).toFixed(1)}%</td>
                      <td>{s.count === 0 ? '整窗未出' : s.currentGap}</td>
                      <td>{s.maxGap}</td>
                      <td>{s.maxStreak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <p className="hint">
            以上为历史数据的统计描述，不代表未来表现。彩票开奖为独立随机事件，冷热与遗漏不代表未来走势，请理性购彩。
          </p>
        </>
      )}
    </section>
  )
}
