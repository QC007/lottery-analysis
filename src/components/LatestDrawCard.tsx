import { Fragment } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 金额格式化：≥1亿 → [X.XX, 亿元]；≥1万 → [X.X, 万元]；否则 [X, 元]（数字与单位分设字号） */
function fmtMoney(n: number): [string, string] {
  if (n >= 1e8) return [(n / 1e8).toFixed(2), '亿元']
  if (n >= 1e4) return [(n / 1e4).toFixed(1), '万元']
  return [String(n), '元']
}

/**
 * 最新开奖 hero 卡（U-11：首页视觉主角）
 * 期号 + 开奖日期（含星期）+ 大球阵 + 奖池滚存/销售额大数字（U-7，数据缺失时自动隐藏）
 */
export default function LatestDrawCard({ config, draw }: { config: LotteryConfig; draw: Draw }) {
  const d = new Date(`${draw.date}T00:00:00`)
  const week = Number.isNaN(d.getTime()) ? null : WEEK[d.getDay()]

  return (
    <section className="card card-hero">
      <div className="hero-head">
        <span className="hero-label">最新开奖 · {config.name}</span>
        <span className="hero-date">
          第 {draw.drawNo} 期 · {draw.date}
          {week ? `（周${week}）` : ''}
        </span>
      </div>
      {/* U-15 批⑥：红/蓝球合并为一行，区间细分隔线，颜色即语义（去掉文字标签省宽度） */}
      <div className="zone hero-zone">
        {draw.zones.map((nums, i) => (
          <Fragment key={config.zones[i].key}>
            {i > 0 && <span className="zone-sep" aria-hidden="true" />}
            {nums.map((n) => (
              <Ball key={n} zone={config.zones[i]} n={n} />
            ))}
          </Fragment>
        ))}
      </div>
      {(draw.pool !== undefined || draw.sales !== undefined) && (
        <div className="hero-stats">
          {draw.pool !== undefined && (
            <div className="hero-stat">
              <span className="hero-stat-label">奖池滚存</span>
              <b className="hero-stat-num">
                {fmtMoney(draw.pool)[0]}
                <i>{fmtMoney(draw.pool)[1]}</i>
              </b>
            </div>
          )}
          {draw.sales !== undefined && (
            <div className="hero-stat">
              <span className="hero-stat-label">本期销售额</span>
              <b className="hero-stat-num">
                {fmtMoney(draw.sales)[0]}
                <i>{fmtMoney(draw.sales)[1]}</i>
              </b>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
