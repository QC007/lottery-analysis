import { useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'
import { db } from '../db/db'
import { ensureYears } from '../services/sync'
import { useStore } from '../store/useStore'

const PAGE = 20

/**
 * 历史开奖浏览页（U-1a）：覆盖度 + 年份筛选 + 分页列表
 * 数据源为本地 IndexedDB 全量（props.sorted 降序）；缺年份数据时按需拉取年份归档 JSON
 */
export default function HistoryBrowser({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const meta = useStore((s) => s.meta)
  const [year, setYear] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const m = meta?.lotteries[config.id]

  // 年份下拉 = 本地已有年份 ∪ 远端归档年份（降序）
  const yearOptions = useMemo(() => {
    const s = new Set(sorted.map((d) => d.date.slice(0, 4)))
    m?.archiveYears.forEach((y) => s.add(String(y)))
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [sorted, m])

  const filtered = useMemo(
    () => (year === 'all' ? sorted : sorted.filter((d) => d.date.slice(0, 4) === year)),
    [sorted, year],
  )
  const visible = filtered.slice(0, limit)
  const complete = m ? sorted.length >= m.totalDraws : false

  // 所选年份是否本地缺数据（归档里有但本地没拉）
  const yearMissing = useMemo(() => {
    if (year === 'all' || !m) return false
    return !sorted.some((d) => d.date.slice(0, 4) === year) && m.archiveYears.includes(Number(year))
  }, [year, sorted, m])

  const pull = async () => {
    if (!m) return
    setBusy(true)
    setMsg('拉取归档中…')
    try {
      const years = year === 'all' ? m.archiveYears : [Number(year)]
      const added = await ensureYears(config, years)
      const total = await db.draws.where('lottery').equals(config.id).count()
      setMsg(added > 0 ? `已拉取 ${added} 期归档，本地共 ${total} 期` : '历史归档已是完整状态')
    } catch (err) {
      setMsg(`拉取失败: ${err instanceof Error ? err.message : String(err)}`)
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>历史开奖</h2>
        <select className="hist-select" value={year} onChange={(e) => { setYear(e.target.value); setLimit(PAGE) }}>
          <option value="all">全部年份</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
      </div>

      <p className="hint">
        本地 {sorted.length} 期 / 远端 {m?.totalDraws ?? '…'} 期（{config.drawSchedule}）
        {complete && ' · 已完整'}
      </p>
      {!complete && (
        <button className="btn" disabled={busy} onClick={pull}>
          {busy ? '拉取中…' : `拉取${year === 'all' ? '全部历史' : `${year} 年`}归档`}
        </button>
      )}
      {yearMissing && !complete && (
        <p className="hint">「{year} 年」数据尚未拉取到本地，点上方按钮获取归档</p>
      )}
      {msg && <p className="hint">{msg}</p>}

      <div className="hist-list">
        {visible.map((d) => (
          <div className="hist-row" key={d.drawNo}>
            <span className="hist-no">第 {d.drawNo} 期</span>
            <span className="hist-date">{d.date}</span>
            <span className="hist-balls">
              {d.zones.map((nums, zi) => (
                <span className="hist-zone" key={config.zones[zi].key}>
                  {nums.map((n) => (
                    <Ball key={n} zone={config.zones[zi]} n={n} />
                  ))}
                </span>
              ))}
            </span>
          </div>
        ))}
        {visible.length === 0 && <p className="hint">{year === 'all' ? '暂无数据' : '该年份本地暂无数据'}</p>}
      </div>
      {filtered.length > visible.length && (
        <button className="btn btn-ghost hist-more" onClick={() => setLimit((l) => l + PAGE)}>
          加载更多（剩余 {filtered.length - visible.length} 期）
        </button>
      )}
    </section>
  )
}
