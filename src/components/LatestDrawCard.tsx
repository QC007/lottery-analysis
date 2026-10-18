import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'

/** 最新开奖卡片：期号 + 日期 + 各区分球展示 */
export default function LatestDrawCard({ config, draw }: { config: LotteryConfig; draw: Draw }) {
  return (
    <section className="card">
      <h2>最新开奖 · {config.name}</h2>
      <p className="draw-meta">
        第 {draw.drawNo} 期 · {draw.date}
      </p>
      <div>
        {draw.zones.map((nums, i) => (
          <div className="zone" key={config.zones[i].key}>
            <span className="zone-name">{config.zones[i].name}</span>
            {nums.map((n) => (
              <Ball key={n} zone={config.zones[i]} n={n} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
