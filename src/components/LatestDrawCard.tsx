import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 金额格式化：≥1亿 → X.XX 亿元；≥1万 → X.X 万元；否则 X 元 */
function fmtMoney(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿元`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万元`
  return `${n} 元`
}

/**
 * 最新开奖卡片：期号 + 开奖日期（含星期）+ 奖池滚存/销售额（U-7，数据缺失时自动隐藏）+ 各区分球
 */
export default function LatestDrawCard({ config, draw }: { config: LotteryConfig; draw: Draw }) {
  const d = new Date(`${draw.date}T00:00:00`)
  const week = Number.isNaN(d.getTime()) ? null : WEEK[d.getDay()]

  return (
    <section className="card">
      <h2>最新开奖 · {config.name}</h2>
      <p className="draw-meta">
        第 {draw.drawNo} 期 · {draw.date}
        {week ? `（周${week}）` : ''}
      </p>
      {(draw.pool !== undefined || draw.sales !== undefined) && (
        <div className="draw-info">
          {draw.pool !== undefined && (
            <span>
              奖池滚存 <b>{fmtMoney(draw.pool)}</b>
            </span>
          )}
          {draw.sales !== undefined && (
            <span>
              本期销售额 <b>{fmtMoney(draw.sales)}</b>
            </span>
          )}
        </div>
      )}
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
