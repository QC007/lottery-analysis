import { useState } from 'react'
import type { LotteryConfig } from '../config/lotteries'
import { ensureYears } from '../services/sync'
import { useStore } from '../store/useStore'

/**
 * U-12-1 全局数据覆盖条（App 级，位于功能导航下方，任意分区可见）
 * 本地历史未收录完整时常驻展示「拉取全部历史」入口，带逐年进度反馈；已完整则不渲染。
 * 数据拉取走 ensureYears（年份归档），完成后 useLiveQuery 自动刷新计数。
 */
export default function GlobalDataBar({
  config,
  count,
}: {
  config: LotteryConfig
  /** 本地已有期数 */
  count: number
}) {
  const meta = useStore((s) => s.meta)
  const m = meta?.lotteries[config.id]
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (!m) return null
  const complete = count >= m.totalDraws
  if (complete) return null

  const pull = async () => {
    setBusy(true)
    setMsg('准备拉取…')
    try {
      const added = await ensureYears(config, m.archiveYears, (done, total) =>
        setMsg(`拉取归档 ${done}/${total} 年…`),
      )
      setMsg(added > 0 ? `已拉取 ${added} 期` : '历史归档已是完整状态')
    } catch (err) {
      setMsg(`拉取失败：${err instanceof Error ? err.message : String(err)}`)
    }
    setBusy(false)
  }

  return (
    <div className="data-bar" role="status">
      <span className="data-bar-label">
        <i className="data-bar-ico" aria-hidden="true" />
        {config.name}历史数据 {count}/{m.totalDraws} 期
      </span>
      <button className="btn btn-soft data-bar-btn" disabled={busy} onClick={pull}>
        {busy ? msg || '拉取中…' : '拉取全部历史'}
      </button>
    </div>
  )
}
