import type { Draw, LotteryConfig } from '../config/lotteries'
import type { TabKey } from './NavTabs'
import LatestDrawCard from './LatestDrawCard'
import HotColdPanel from './HotColdPanel'

/** U-2 首页分区：最新开奖 + 三个核心功能入口卡 + 冷热速览 */
export default function HomeTab({
  config,
  sorted,
  latest,
  onGo,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据（冷热速览用） */
  sorted: Draw[]
  latest: Draw
  onGo: (t: TabKey) => void
}) {
  return (
    <>
      <LatestDrawCard config={config} draw={latest} />
      <div className="entry-grid">
        <button className="entry-card" onClick={() => onGo('trend')}>
          <b>走势分析</b>
          <span>和值走势 · 号码频率 · 遗漏</span>
        </button>
        <button className="entry-card" onClick={() => onGo('sim')}>
          <b>模拟选号</b>
          <span>测测这组号码的历史盈亏</span>
        </button>
        <button className="entry-card" onClick={() => onGo('history')}>
          <b>开奖历史</b>
          <span>逐期开奖号码查询</span>
        </button>
      </div>
      <HotColdPanel config={config} draws={sorted} />
    </>
  )
}
