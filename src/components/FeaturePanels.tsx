import type { Draw, LotteryConfig } from '../config/lotteries'
import BacktestPanel from './BacktestPanel'
import HealthPanel from './HealthPanel'
import AIPanel from './AIPanel'

/**
 * 第 4 批功能面板聚合（F-03 回溯模拟 / F-04 健康度 / F-05 AI 面板）
 * 整体 lazy 拆包：ECharts 雷达/曲线图不进入首包
 */
export default function FeaturePanels({
  config,
  sorted,
}: {
  config: LotteryConfig
  sorted: Draw[]
}) {
  return (
    <>
      <BacktestPanel config={config} sorted={sorted} />
      <HealthPanel config={config} sorted={sorted} />
      <AIPanel config={config} sorted={sorted} />
    </>
  )
}
