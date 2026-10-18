import { enabledLotteries } from '../config/lotteries'
import { useStore } from '../store/useStore'

/** 彩种切换 Tab（配置驱动，新增彩种自动出现） */
export default function LotteryTabs() {
  const activeLotteryId = useStore((s) => s.activeLotteryId)
  const setActiveLottery = useStore((s) => s.setActiveLottery)
  return (
    <nav className="tabs">
      {enabledLotteries.map((l) => (
        <button
          key={l.id}
          className={`tab${l.id === activeLotteryId ? ' is-active' : ''}`}
          onClick={() => setActiveLottery(l.id)}
        >
          {l.name}
        </button>
      ))}
    </nav>
  )
}
