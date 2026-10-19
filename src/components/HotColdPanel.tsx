import { lazy, Suspense, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'
import PeriodPicker from './PeriodPicker'

// U-14 冷热号 Lottie 特效：单独 chunk 懒加载（lottie-light ~50KB gzip 不进首包）
const FxLottie = lazy(() => import('./FxLottie'))

const HOT_N = 6
const COLD_N = 6
/** U-5 期数快捷选项（chips，另附滑动条可自由选范围） */
const RANGE_CHIPS = [10, 20, 30, 50, 100]

/**
 * 冷热速览：统计最近 N 期各号码出现次数（纯历史统计，无预测含义）
 * 热 = 出现最多 6 个 / 冷 = 出现最少 6 个（仅当前展示窗口内）
 * U-5：期数选择升级为 PeriodPicker（快捷 chips + 滑动条 + 步进，默认近 30 期）
 */
export default function HotColdPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const n = sorted.length
  const [range, setRange] = useState(30)
  const draws = useMemo(() => sorted.slice(0, Math.min(range, n)), [sorted, range, n])

  // PeriodPicker 位置语义：0=最旧，n-1=最新；single 模式终点固定最新一期
  const win: [number, number] = [n - Math.min(range, n), n - 1]
  const format = (pos: number) => sorted[n - 1 - pos]?.drawNo ?? ''

  const stats = useMemo(
    () =>
      config.zones.map((zone, zi) => {
        const counts = new Map<number, number>()
        for (let num = zone.min; num <= zone.max; num++) counts.set(num, 0)
        for (const d of draws) {
          for (const num of d.zones[zi] ?? []) counts.set(num, (counts.get(num) ?? 0) + 1)
        }
        const asc = [...counts.entries()].sort((a, b) => a[1] - b[1])
        const cold = new Set(asc.slice(0, COLD_N).map(([num]) => num))
        const hot = new Set(asc.slice(-HOT_N).map(([num]) => num))
        return { zone, counts, hot, cold }
      }),
    [config, draws],
  )

  return (
    <section className="card">
      <h2>冷热速览</h2>
      {n >= 2 && (
        <PeriodPicker
          count={n}
          value={win}
          single
          minGap={5}
          chips={RANGE_CHIPS}
          format={format}
          onChange={([lo, hi]) => setRange(hi - lo + 1)}
        />
      )}
      <p className="hint">
        统计最近 {draws.length} 期各号码出现次数：
        <b className="tag-hot">热</b> 出现最多 {HOT_N} 个 / <b className="tag-cold">冷</b> 出现最少 {COLD_N} 个。
        号码为独立随机事件，冷热不代表后续走势，仅供研究参考。
      </p>
      {stats.map(({ zone, counts, hot, cold }) => (
        <div className="zone-block" key={zone.key}>
          <h3>{zone.name}</h3>
          <div className="hotcold-grid">
            {Array.from({ length: zone.max - zone.min + 1 }, (_, i) => i + zone.min).map((num) => (
              <span
                key={num}
                className={`cell${hot.has(num) ? ' is-hot' : ''}${cold.has(num) ? ' is-cold' : ''}`}
              >
                {/* U-14 v3：特效锚定球体（ball-fx 包裹），以球心为圆心向四周辐射 */}
                <span className="ball-fx">
                  {hot.has(num) && (
                    <Suspense fallback={null}>
                      <FxLottie kind="flame" />
                    </Suspense>
                  )}
                  {cold.has(num) && (
                    <Suspense fallback={null}>
                      <FxLottie kind="frost" />
                    </Suspense>
                  )}
                  <Ball zone={zone} n={num} />
                </span>
                <i className="count">{counts.get(num)}</i>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
