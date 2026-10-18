import type { Draw, LotteryConfig } from '../config/lotteries'
import EvolutionPanel from './EvolutionPanel'
import ImportCard from './ImportCard'

/** U-2 「更多」分区：进阶实验功能（策略实验室）+ 数据维护（手动导入） */
export default function MorePanels({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  return (
    <>
      <EvolutionPanel config={config} sorted={sorted} />
      <ImportCard config={config} />
    </>
  )
}
