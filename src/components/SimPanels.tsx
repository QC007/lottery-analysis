import type { Draw, LotteryConfig } from '../config/lotteries'
import BacktestPanel from './BacktestPanel'
import HealthPanel from './HealthPanel'

/**
 * U-2 模拟选号分区（F-03 历史回溯 + F-04 组合健康度）
 * 两个面板都是「选一组号码 → 出结果」场景，聚合为一个 lazy 包
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
      <BacktestPanel config={config} sorted={sorted} />
      <HealthPanel config={config} sorted={sorted} />
    </>
  )
}
