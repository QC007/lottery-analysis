import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { checkPrize, type PrizeCheck } from '../services/mynumbers'
import NumberPicker, { togglePick } from './NumberPicker'
import { Ball } from './Ball'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * U-12-3 中奖查询（历史 Tab）
 * 点选一组号码 → 选一期开奖 → 核对奖级（官方奖级规则，单期静态核对）。
 * 说明：彩票扫描（拍照 OCR 识读票面）在零第三方依赖约束下无法实现，
 * 本功能以「点选号码 + 选期核对」覆盖同一诉求。
 */
export default function TicketCheck({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const [picks, setPicks] = useState<number[][]>(() => config.zones.map(() => []))
  // 选中期号（默认最新一期）
  const [drawNo, setDrawNo] = useState('')
  const [result, setResult] = useState<PrizeCheck | null>(null)

  // 彩种切换重置
  const configId = config.id
  useEffect(() => {
    setPicks(config.zones.map(() => []))
    setDrawNo('')
    setResult(null)
  }, [configId, config])

  // 本地数据到位后默认选中最新一期
  useEffect(() => {
    if (!drawNo && sorted.length > 0) setDrawNo(sorted[0].drawNo)
  }, [sorted, drawNo])

  // 输入变化后旧结果作废，避免结果与输入不一致
  useEffect(() => {
    setResult(null)
  }, [picks, drawNo])

  const draw = useMemo(() => sorted.find((d) => d.drawNo === drawNo), [sorted, drawNo])
  const ready = config.zones.every((z, i) => (picks[i] ?? []).length === z.pick)
  const canRun = ready && !!draw

  const run = () => {
    if (!canRun || !draw) return
    setResult(checkPrize(config, picks, draw))
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>中奖查询</h2>
      </div>
      <p className="hint">
        点选一组号码、再选一期开奖，即可按官方奖级规则核对是否中奖及对应奖级。
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

      <div className="tc-period">
        <span className="zone-name">核对期次</span>
        <select
          className="hist-select"
          value={drawNo}
          onChange={(e) => setDrawNo(e.target.value)}
          aria-label="选择核对期次"
        >
          {sorted.map((d) => (
            <option key={d.drawNo} value={d.drawNo}>
              第 {d.drawNo} 期（{d.date}）
            </option>
          ))}
        </select>
      </div>

      <div className="bt-controls">
        <button className="btn" disabled={!canRun} onClick={run}>
          核对中奖
        </button>
      </div>
      {!ready && <p className="hint">按上方各区要求选满号码后可核对</p>}
      {sorted.length === 0 && <p className="hint">本地暂无数据，请先等待同步完成。</p>}

      {result && (
        <div className="tc-result">
          <p className="tc-result-head">
            第 {result.draw.drawNo} 期（{result.draw.date}）开奖号码
          </p>
          <div>
            {result.draw.zones.map((nums, i) => (
              <div className="zone" key={config.zones[i].key}>
                <span className="zone-name">{config.zones[i].name}</span>
                {nums.map((n) => (
                  <Ball key={n} zone={config.zones[i]} n={n} />
                ))}
              </div>
            ))}
          </div>
          <div className="tc-hits">
            {result.zones.map((z) => (
              <p className="tc-hit-row" key={z.name}>
                <span className="tc-hit-label">{z.name}命中 {z.hitNums.length} 个</span>
                {z.hitNums.length > 0 ? (
                  <span className="tc-hit-nums">{z.hitNums.map(pad).join(' ')}</span>
                ) : (
                  <span className="tc-hit-nums is-none">—</span>
                )}
              </p>
            ))}
          </div>
          {result.tier ? (
            <div className="tc-tier is-win" role="status">
              <b>{result.tier.name}</b>
              <span>
                {result.tier.amount > 0
                  ? `单注奖金 ${result.tier.amount.toLocaleString('zh-CN')} 元`
                  : '浮动奖金 · 金额按当期奖池与中奖注数而定'}
              </span>
            </div>
          ) : (
            <div className="tc-tier is-miss" role="status">
              未中奖 · 该注号码未命中任何奖级，理性购彩，祝好运
            </div>
          )}
        </div>
      )}
    </section>
  )
}
