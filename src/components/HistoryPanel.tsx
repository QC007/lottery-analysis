import { useState } from 'react'
import type { LotteryConfig } from '../config/lotteries'
import { db } from '../db/db'
import { ensureYears } from '../services/sync'
import { useStore } from '../store/useStore'

/** 历史覆盖面板：展示本地/远端期数，支持按需拉取年份归档（冷数据） */
export default function HistoryPanel({
  config,
  localCount,
}: {
  config: LotteryConfig
  localCount: number
}) {
  const meta = useStore((s) => s.meta)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const m = meta?.lotteries[config.id]
  if (!m) return null

  const complete = localCount >= m.totalDraws
  const minYear = Math.min(...m.archiveYears)
  const maxYear = Math.max(...m.archiveYears)

  const pull = async () => {
    setBusy(true)
    setMsg('拉取归档中…')
    try {
      const added = await ensureYears(config, m.archiveYears)
      const total = await db.draws.where('lottery').equals(config.id).count()
      setMsg(added > 0 ? `已拉取 ${added} 期归档，本地共 ${total} 期` : '历史归档已是完整状态')
    } catch (err) {
      setMsg(`拉取失败: ${err instanceof Error ? err.message : String(err)}`)
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <h2>历史数据覆盖</h2>
      <p className="hint">
        本地 {localCount} 期 / 远端 {m.totalDraws} 期（{config.drawSchedule}，归档 {minYear}~{maxYear}）
        {complete && ' · 已完整'}
      </p>
      {!complete && (
        <button className="btn" disabled={busy} onClick={pull}>
          {busy ? '拉取中…' : '拉取全部历史归档'}
        </button>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}
