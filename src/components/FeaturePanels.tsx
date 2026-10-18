import type { Draw, LotteryConfig } from '../config/lotteries'
import BacktestPanel from './BacktestPanel'
import HealthPanel from './HealthPanel'
// U-1a 屏蔽：F-05 AI 面板涉及 LLM Key 敏感配置，待后端 ai proxy 上线后以云端形态恢复
// import AIPanel from './AIPanel'
import EvolutionPanel from './EvolutionPanel'
import ImportCard from './ImportCard'

/**
 * 第 4/5 批功能面板聚合（F-03/F-04/F-06+进化引擎/手动导入）
 * 整体 lazy 拆包：ECharts 图表不进入首包
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
      <EvolutionPanel config={config} sorted={sorted} />
      <ImportCard config={config} />
    </>
  )
}
