import type { Draw, LotteryConfig } from '../config/lotteries'
import RecommendPanel from './RecommendPanel'
import HealthPanel from './HealthPanel'
// U-4：历史回溯模拟器（模拟选号）暂时隐藏，代码保留，评估后决定去留
// import BacktestPanel from './BacktestPanel'

/**
 * U-2 选号工具分区（U-3 AI 统计选号 + F-04 组合健康度）
 * U-4：F-03 历史回溯模拟器暂时隐藏（组件文件保留，取消挂载）
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
      {/* <BacktestPanel config={config} sorted={sorted} /> */}
      <HealthPanel config={config} sorted={sorted} />
    </>
  )
}
