import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { enabledLotteries } from './config/lotteries'
import { db } from './db/db'
import { syncAll } from './services/sync'
import { isGlobalOff, setGlobalOff } from './services/rational'
import { useStore } from './store/useStore'
import SyncBanner from './components/SyncBanner'
import LotteryTabs from './components/LotteryTabs'
import NavTabs, { type TabKey } from './components/NavTabs'
import HomeTab from './components/HomeTab'
import HistoryBrowser from './components/HistoryBrowser'
import RationalTips from './components/RationalTips'

// 各功能分区按需加载（含 ECharts ~500KB）：切到对应分区时才拉取，首屏更轻
const AnalysisSection = lazy(() => import('./components/AnalysisSection'))
const SimPanels = lazy(() => import('./components/SimPanels'))
const MorePanels = lazy(() => import('./components/MorePanels'))

/** U-2 各分区的一句话引导：新用户先看这句，就知道这页干嘛、怎么操作 */
const TAB_DESC: Partial<Record<TabKey, string>> = {
  trend: '点快捷期数或拖动滑块选择统计范围，查看和值走势、号码频率与遗漏情况',
  sim: 'AI 统计选号（多算法融合打分，附入选依据）+ 组合健康度诊断（历史数据统计，无预测含义）',
  history: '选一组号码分析其历史表现，或按期号逐期查看开奖、按年份筛选拉取归档',
  more: '进阶实验功能，新手可忽略',
}

export default function App() {
  const activeLotteryId = useStore((s) => s.activeLotteryId)
  const setSync = useStore((s) => s.setSync)
  const setMeta = useStore((s) => s.setMeta)
  const showRationalTip = useStore((s) => s.showRationalTip)
  const rationalOff = useStore((s) => s.rationalOff)
  const setRationalOffState = useStore((s) => s.setRationalOff)
  const [tab, setTab] = useState<TabKey>('home')

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

  // U-2：切换功能分区后回到页面顶部，避免新旧内容长度不同停在中段
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const latest = sorted[0]

  return (
    <main className="app">
      <header className="app-header">
        <h1>彩票分析平台</h1>
        <p className="tagline">
          彩票历史数据统计工具 · 数据每日自动更新 · 分析仅供娱乐参考，不构成投注建议，请理性购彩
        </p>
      </header>
      <SyncBanner />
      <RationalTips />
      <LotteryTabs />
      <NavTabs tab={tab} onChange={setTab} />
      {draws === undefined ? (
        <p className="loading">读取本地数据库…</p>
      ) : latest ? (
        <>
          {/* U-10：key={tab} 触发重挂载 → 卡片依次浮现动效 */}
          <div className="fade-pane" key={tab}>
            {TAB_DESC[tab] && <p className="tab-desc">{TAB_DESC[tab]}</p>}
            {tab === 'home' && (
              <HomeTab config={config} sorted={sorted} latest={latest} />
            )}
            {tab === 'trend' && (
              <Suspense fallback={<p className="loading">加载分析模块…</p>}>
                <AnalysisSection config={config} sorted={sorted} />
              </Suspense>
            )}
            {tab === 'sim' && (
              <Suspense fallback={<p className="loading">加载选号模块…</p>}>
                <SimPanels config={config} sorted={sorted} />
              </Suspense>
            )}
            {tab === 'history' && <HistoryBrowser config={config} sorted={sorted} />}
            {tab === 'more' && (
              <Suspense fallback={<p className="loading">加载进阶模块…</p>}>
                <MorePanels config={config} sorted={sorted} />
              </Suspense>
            )}
          </div>
        </>
      ) : (
        <p className="hint">本地暂无「{config.name}」数据，等待同步…</p>
      )}
      <footer>
        数据由 GitHub Actions 每日抓取官方开奖 · 本地缓存于浏览器 IndexedDB，离线可用
        <button className="rational-toggle" onClick={toggleRational}>
          理性购彩提醒：{rationalOff ? '已关闭' : '已开启'}
        </button>
      </footer>
    </main>
  )
}
