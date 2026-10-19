import { useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { Ball } from './Ball'
import { db } from '../db/db'
import { ensureYears } from '../services/sync'
import { useStore } from '../store/useStore'
import { analyzeMyNumbers } from '../services/mynumbers'
import PeriodPicker from './PeriodPicker'
import MyNumbersResultView from './MyNumbersResultView'
import MyNumbersPanel from './MyNumbersPanel'
import TicketCheck from './TicketCheck'
import Overlay from './Overlay'

const PAGE = 20

/**
 * U-9 单期号码历史表现（开奖历史行内展开）
 * 该期开奖号码在「此前历史」中的表现：用户可用 PeriodPicker 自选范围（不含本期），
 * 复用 U-4 analyzeMyNumbers 引擎与共用展示组件，默认近 100 期。
 */
function HistPerf({
  config,
  draw,
  older,
}: {
  config: LotteryConfig
  draw: Draw
  /** 该期之前（更早）的全部本地数据，期号降序，[0] = 紧邻该期之前一期 */
  older: Draw[]
}) {
  const m = older.length
  // 窗口位置（0=最旧，m-1=最新）；null = 默认近 100 期
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [lo, hi] = sel ?? [Math.max(0, m - 100), m - 1]

  // 位置 → 降序下标换算：位置 hi（较新）= m-1-hi，位置 lo（较旧）= m-1-lo（与 MyNumbersPanel 同构）
  const windowDraws = useMemo(() => older.slice(m - 1 - hi, m - 1 - lo + 1), [older, m, lo, hi])

  const result = useMemo(
    () => (windowDraws.length >= 2 ? analyzeMyNumbers(config, draw.zones, windowDraws) : null),
    [config, draw, windowDraws],
  )

  if (m < 2) return <p className="hint">该期之前暂无本地历史数据，请先拉取归档。</p>

  return (
    <div className="hist-exp">
      <p className="hint">
        第 {draw.drawNo} 期号码在此前 {m} 期中的表现（默认近 100 期，可自选范围；不含本期）
      </p>
      <PeriodPicker
        count={m}
        value={[lo, hi]}
        format={(pos) => older[m - 1 - pos]?.drawNo ?? ''}
        onChange={(v) => setSel(v)}
      />
      {result && <MyNumbersResultView config={config} result={result} />}
    </div>
  )
}

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
  // U-9 单展开：当前查看历史表现的期号（null = 全部收起）
  const [openNo, setOpenNo] = useState<string | null>(null)

  // 期号 → sorted 降序下标（行内展开时定位「该期之前」的数据切片）
  const idxOf = useMemo(() => new Map(sorted.map((d, i) => [d.drawNo, i])), [sorted])

  const m = meta?.lotteries[config.id]

  // U-10 当前弹层展示的期次（openNo → 降序下标 → Draw）
  const openIdx = openNo ? (idxOf.get(openNo) ?? -1) : -1
  const openDraw = openIdx >= 0 ? sorted[openIdx] : undefined

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
    <>
      <MyNumbersPanel config={config} sorted={sorted} />
      {/* U-12-3 中奖查询：点选号码 + 选期核对奖级 */}
      <TicketCheck config={config} sorted={sorted} />
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
      {/* U-12-1「全部历史」入口已上移至全局数据条（任意 Tab 可见），此处仅保留按年拉取 */}
      {!complete && year !== 'all' && (
        <button className="btn btn-soft" disabled={busy} onClick={pull}>
          {busy ? '拉取中…' : `拉取 ${year} 年归档`}
        </button>
      )}
      {yearMissing && !complete && (
        <p className="hint">「{year} 年」数据尚未拉取到本地，点上方按钮获取归档</p>
      )}
      {msg && <p className="hint">{msg}</p>}

      <div className="hist-list">
        {visible.map((d) => {
          const on = openNo === d.drawNo
          return (
            <div className="hist-item" key={d.drawNo}>
              <div className="hist-row">
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
                <button
                  type="button"
                  className={`hist-act${on ? ' is-open' : ''}`}
                  onClick={() => setOpenNo(on ? null : d.drawNo)}
                  aria-haspopup="dialog"
                >
                  查询
                </button>
              </div>
            </div>
          )
        })}
        {visible.length === 0 && <p className="hint">{year === 'all' ? '暂无数据' : '该年份本地暂无数据'}</p>}
      </div>
      {filtered.length > visible.length && (
        <button className="btn btn-soft hist-more" onClick={() => setLimit((l) => l + PAGE)}>
          加载更多（剩余 {filtered.length - visible.length} 期）
        </button>
      )}
      </section>

      {/* U-10 单期号码历史表现：上层弹层展示（桌面居中弹窗 / 手机底部抽屉） */}
      <Overlay
        open={!!openDraw}
        onClose={() => setOpenNo(null)}
        title={openDraw ? `第 ${openDraw.drawNo} 期 · 号码历史表现` : ''}
        subtitle={openDraw ? `开奖日期 ${openDraw.date}` : undefined}
      >
        {openDraw && openIdx >= 0 && (
          <HistPerf config={config} draw={openDraw} older={sorted.slice(openIdx + 1)} />
        )}
      </Overlay>
    </>
  )
}
