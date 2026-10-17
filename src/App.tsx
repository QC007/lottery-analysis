import { enabledLotteries } from './config/lotteries'

export default function App() {
  return (
    <main className="app">
      <h1>彩票分析平台</h1>
      <p className="disclaimer">
        本站为彩票历史数据研究工具，所有分析仅供娱乐参考，不构成任何投注建议。
        彩票开奖为独立随机事件，历史数据不具备预测能力，请理性购彩。
      </p>
      <section>
        <h2>已接入彩种（配置驱动）</h2>
        <ul>
          {enabledLotteries.map((l) => (
            <li key={l.id}>
              <strong>{l.name}</strong>
              <span className="schedule">{l.drawSchedule}</span>
              <span className="zones">
                {l.zones.map((z) => `${z.name} ${z.min}~${z.max} 选 ${z.pick}`).join(' + ')}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <footer>第 1 批骨架 · 数据管道由 GitHub Actions 每日抓取官方开奖数据驱动</footer>
    </main>
  )
}
