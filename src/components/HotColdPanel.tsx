import { useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'

const HOT_N = 6
const COLD_N = 6
/** U-3 期数快捷选项（触控 chips） */
const RANGE_CHIPS = [10, 20, 30, 50, 100]

/**
 * 冷热速览：统计最近 N 期各号码出现次数（纯历史统计，无预测含义）
 * 热 = 出现最多 6 个 / 冷 = 出现最少 6 个（仅当前展示窗口内）
 * U-3：期数可由用户通过大触控 chips 自选（默认近 30 期）
 */
export default function HotColdPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const [range, setRange] = useState(30)
  const draws = useMemo(() => sorted.slice(0, Math.min(range, sorted.length)), [sorted, range])

  const stats = useMemo(
    () =>
      config.zones.map((zone, zi) => {
        const counts = new Map<number, number>()
        for (let n = zone.min; n <= zone.max; n++) counts.set(n, 0)
        for (const d of draws) {
          for (const n of d.zones[zi] ?? []) counts.set(n, (counts.get(n) ?? 0) + 1)
        }
        const asc = [...counts.entries()].sort((a, b) => a[1] - b[1])
        const cold = new Set(asc.slice(0, COLD_N).map(([n]) => n))
        const hot = new Set(asc.slice(-HOT_N).map(([n]) => n))
        return { zone, counts, hot, cold }
      }),
    [config, draws],
  )

  return (
    <section className="card">
      <h2>冷热速览</h2>
      <div className="pp-chips" role="group" aria-label="冷热统计期数">
        {RANGE_CHIPS.filter((n) => n <= sorted.length).map((n) => (
          <button
            key={n}
            type="button"
            className={`pp-chip${range === n ? ' is-active' : ''}`}
            onClick={() => setRange(n)}
          >
            近{n}期
          </button>
        ))}
        {RANGE_CHIPS.every((n) => n < sorted.length) && (
          <button
            type="button"
            className={`pp-chip${range >= sorted.length ? ' is-active' : ''}`}
            onClick={() => setRange(sorted.length)}
          >
            全部
          </button>
        )}
      </div>
      <p className="hint">
        统计最近 {draws.length} 期各号码出现次数：
        <b className="tag-hot">热</b> 出现最多 {HOT_N} 个 / <b className="tag-cold">冷</b> 出现最少 {COLD_N} 个。
        号码为独立随机事件，冷热不代表后续走势，仅供研究参考。
      </p>
      {stats.map(({ zone, counts, hot, cold }) => (
        <div className="zone-block" key={zone.key}>
          <h3>{zone.name}</h3>
          <div className="hotcold-grid">
            {Array.from({ length: zone.max - zone.min + 1 }, (_, i) => i + zone.min).map((n) => (
              <span
                key={n}
                className={`cell${hot.has(n) ? ' is-hot' : ''}${cold.has(n) ? ' is-cold' : ''}`}
              >
                <Ball zone={zone} n={n} />
                <i className="count">{counts.get(n)}</i>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
