import type { LotteryConfig } from '../config/lotteries'
import type { MyNumbersResult } from '../services/mynumbers'
import { Ball } from './Ball'

/** 中奖明细最多列出条数（超出提示总数） */
const HIT_LIST_CAP = 50

/**
 * 一组号码历史表现的结果展示（U-4 自选号码分析 / U-6 AI 统计选号结果点击查看 共用）
 * 纯展示组件：奖级命中统计 + 中奖明细 + 每号码 次数/概率/遗漏/连出 + 免责声明
 */
export default function MyNumbersResultView({
  config,
  result,
}: {
  config: LotteryConfig
  result: MyNumbersResult
}) {
  const fixedHits = result.tierHits.filter((t) => t.amount > 0).reduce((s, t) => s + t.hits, 0)
  const floatHits = result.tierHits.filter((t) => t.amount === 0).reduce((s, t) => s + t.hits, 0)

  return (
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
  )
}
