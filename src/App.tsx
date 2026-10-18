import { useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { enabledLotteries } from './config/lotteries'
import { db } from './db/db'
import { syncAll } from './services/sync'
import { isGlobalOff, setGlobalOff } from './services/rational'
import { useStore } from './store/useStore'
import SyncBanner from './components/SyncBanner'
import LotteryTabs from './components/LotteryTabs'
import LatestDrawCard from './components/LatestDrawCard'
import HotColdPanel from './components/HotColdPanel'
import HistoryBrowser from './components/HistoryBrowser'
import RationalTips from './components/RationalTips'

// 分析区（含 ECharts ~500KB）按需加载：首包不包含，滚动到需用时才拉取
const AnalysisSection = lazy(() => import('./components/AnalysisSection'))
// 第 4 批功能面板（F-03/F-04/F-05，含 ECharts 雷达/曲线）同样拆包
const FeaturePanels = lazy(() => import('./components/FeaturePanels'))

export default function App() {
  const activeLotteryId = useStore((s) => s.activeLotteryId)
  const setSync = useStore((s) => s.setSync)
  const setMeta = useStore((s) => s.setMeta)
  const showRationalTip = useStore((s) => s.showRationalTip)
  const rationalOff = useStore((s) => s.rationalOff)
  const setRationalOffState = useStore((s) => s.setRationalOff)

  // F-10：加载全局理性提示开关
  useEffect(() => {
    void isGlobalOff().then(setRationalOffState)
  }, [setRationalOffState])

  // F-10 触发 1：连续可见使用 30 分钟 → 温和横幅（可见时段累计，后台标签页不计）
  const visibleMs = useRef(0)
  const lastTick = useRef(Date.now())
  const longTipFired = useRef(false)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      if (document.visibilityState === 'visible') visibleMs.current += now - lastTick.current
      lastTick.current = now
      if (!longTipFired.current && visibleMs.current >= 30 * 60_000) {
        longTipFired.current = true
        showRationalTip('longSession')
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [showRationalTip])

  // F-10 触发 2：5 分钟内切换分析维度（彩种）> 20 次 → 提示聚焦
  const switchTimes = useRef<number[]>([])
  useEffect(() => {
    const now = Date.now()
    switchTimes.current = switchTimes.current.filter((t) => now - t < 5 * 60_000)
    switchTimes.current.push(now)
    if (switchTimes.current.length > 20) showRationalTip('rapidSwitch')
  }, [activeLotteryId, showRationalTip])

  const toggleRational = () => {
    const next = !rationalOff
    setRationalOffState(next)
    void setGlobalOff(next)
  }

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
      <RationalTips />
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
          <Suspense fallback={<p className="hint">加载功能面板…</p>}>
            <FeaturePanels config={config} sorted={sorted} />
          </Suspense>
          <HistoryBrowser config={config} sorted={sorted} />
        </>
      ) : (
        <p className="hint">本地暂无「{config.name}」数据，等待同步…</p>
      )}
      <footer>
        数据由 GitHub Actions 每日抓取官方开奖 · 本地缓存于浏览器 IndexedDB，离线可用
        <button className="rational-toggle" onClick={toggleRational}>
          理性提示：{rationalOff ? '关' : '开'}
        </button>
      </footer>
    </main>
  )
}
