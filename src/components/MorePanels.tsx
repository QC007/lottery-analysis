import type { Draw, LotteryConfig } from '../config/lotteries'
import EvolutionPanel from './EvolutionPanel'
// U-5：手动 CSV 导入暂时隐藏（后续由后端统一管理该功能），代码保留
// import ImportCard from './ImportCard'

/** U-2 「更多」分区：进阶实验功能（策略实验室）；U-5 起手动导入入口隐藏，待后端接管 */
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
      {/* <ImportCard config={config} /> */}
    </>
  )
}
