import type { Draw, LotteryConfig } from '../config/lotteries'
import LatestDrawCard from './LatestDrawCard'
import HotColdPanel from './HotColdPanel'

/**
 * U-2 首页分区：最新开奖 + 冷热速览
 * U-7：移除四个功能入口卡——导航 Tab 已覆盖全部功能，重复入口徒增滚动
 */
export default function HomeTab({
  config,
  sorted,
  latest,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据（冷热速览用） */
  sorted: Draw[]
  latest: Draw
}) {
  return (
    <>
      <LatestDrawCard config={config} draw={latest} />
      <HotColdPanel config={config} sorted={sorted} />
    </>
  )
}
