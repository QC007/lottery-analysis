import { useEffect, useMemo, lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { enabledLotteries } from './config/lotteries'
import { db } from './db/db'
import { syncAll } from './services/sync'
import { useStore } from './store/useStore'
import SyncBanner from './components/SyncBanner'
import LotteryTabs from './components/LotteryTabs'
import LatestDrawCard from './components/LatestDrawCard'
import HotColdPanel from './components/HotColdPanel'
import HistoryPanel from './components/HistoryPanel'

// 分析区（含 ECharts ~500KB）按需加载：首包不包含，滚动到需用时才拉取
const AnalysisSection = lazy(() => import('./components/AnalysisSection'))

export default function App() {
  const activeLotteryId = useStore((s) => s.activeLotteryId)
  const setSync = useStore((s) => s.setSync)
  const setMeta = useStore((s) => s.setMeta)

  const config = enabledLotteries.find((l) => l.id === activeLotteryId) ?? enabledLotteries[0]

  // IndexedDB 响应式查询：同步写入后 UI 自动刷新
  const draws = useLiveQuery(
    () => db.draws.where('lottery').equals(config.id).toArray(),
    [config.id],
  )

  // drawNo 定宽（7 位/5 位），字符串降序 = 期号降序
  const sorted = useMemo(
    () => (draws ?? []).slice().sort((a, b) => (a.drawNo < b.drawNo ? 1 : -1)),
    [draws],
  )

  // 启动同步（D-05）：meta 水位对比 → 增量拉取；失败不阻塞本地缓存展示
  useEffect(() => {
    setSync('syncing', '正在检查数据更新…')
    syncAll((r) => setSync('syncing', `同步「${r.name}」…`))
      .then(({ meta, results }) => {
        setMeta(meta)
        const fail = results.find((r) => r.error)
        if (fail) {
          setSync('error', `${fail.name} 同步失败：${fail.error}`)
        } else {
          const added = results.reduce((s, r) => s + r.added, 0)
          setSync('done', added > 0 ? `同步完成，新增 ${added} 期` : '数据已是最新')
        }
      })
      .catch((err) =>
        setSync('error', `同步失败：${err instanceof Error ? err.message : String(err)}`),
      )
  }, [setSync, setMeta])

  const latest = sorted[0]

  return (
    <main className="app">
      <h1>彩票分析平台</h1>
      <p className="disclaimer">
        本站为彩票历史数据研究工具，所有分析仅供娱乐参考，不构成任何投注建议。
        彩票开奖为独立随机事件，历史数据不具备预测能力，请理性购彩。
      </p>
      <SyncBanner />
      <LotteryTabs />
      {draws === undefined ? (
        <p className="hint">读取本地数据库…</p>
      ) : latest ? (
        <>
          <LatestDrawCard config={config} draw={latest} />
          <HotColdPanel config={config} draws={sorted} />
          <Suspense fallback={<p className="hint">加载分析模块…</p>}>
            <AnalysisSection config={config} sorted={sorted} />
          </Suspense>
          <HistoryPanel config={config} localCount={sorted.length} />
        </>
      ) : (
        <p className="hint">本地暂无「{config.name}」数据，等待同步…</p>
      )}
      <footer>
        数据由 GitHub Actions 每日抓取官方开奖 · 本地缓存于浏览器 IndexedDB，离线可用
      </footer>
    </main>
  )
}
