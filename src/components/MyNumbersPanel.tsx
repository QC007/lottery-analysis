import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { analyzeMyNumbers, type MyNumbersResult } from '../services/mynumbers'
import NumberPicker, { togglePick } from './NumberPicker'
import PeriodPicker from './PeriodPicker'
import MyNumbersResultView from './MyNumbersResultView'
import MotionCard from './MotionCard'

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

  return (
    <MotionCard className="card">
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

      {result && <MyNumbersResultView config={config} result={result} />}
    </MotionCard>
  )
}
