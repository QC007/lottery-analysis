import type { Draw, LotteryConfig } from '../config/lotteries'
import RecommendPanel from './RecommendPanel'
import BacktestPanel from './BacktestPanel'
import HealthPanel from './HealthPanel'

/**
 * U-2 模拟选号分区（U-3 AI 推荐 + F-03 历史回溯 + F-04 组合健康度）
 * 都是「选号/生成号码 → 出结果」场景，聚合为一个 lazy 包
 */
export default function SimPanels({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  return (
    <>
      <RecommendPanel config={config} sorted={sorted} />
      <BacktestPanel config={config} sorted={sorted} />
      <HealthPanel config={config} sorted={sorted} />
    </>
  )
}
