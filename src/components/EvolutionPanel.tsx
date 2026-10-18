import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { db, type ModelEvent, type ModelRecord } from '../db/db'
import { baselineExpected, evaluateModels, type ModelEval } from '../services/models'
import { ensurePoolSeeded, runEvolution, type Transition } from '../services/evolution'
import ModelMatchChart from './ModelMatchChart'

const STATUS_TEXT: Record<ModelRecord['status'], string> = {
  testing: '观察期',
  safety: '安全期',
  active: '正式算法',
  deprecated: '已退役',
}
const STATUS_COLOR: Record<ModelRecord['status'], string> = {
  testing: '#fbbc04',
  safety: '#34a853',
  active: '#34a853',
  deprecated: '#9aa0a6',
}

/** F-06 模型进化时间胶囊 + 本地模型匹配（走前回测 + 随机基准线） */
export default function EvolutionPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const [evals, setEvals] = useState<ModelEval[] | null>(null)
  const [pool, setPool] = useState<ModelRecord[]>([])
  const [selected, setSelected] = useState<ModelRecord | null>(null)
  const [events, setEvents] = useState<ModelEvent[]>([])
  const [log, setLog] = useState<Transition[]>([])
  const [busy, setBusy] = useState(false)

  const configId = config.id
  const baseline = useMemo(() => baselineExpected(config.zones[0]), [config])
  const enough = sorted.length >= 40

  // 彩种切换：重算 + 确保模型池已播种
  useEffect(() => {
    setEvals(null)
    setPool([])
    setSelected(null)
    setEvents([])
    setLog([])
    if (!enough) return
    const evals_ = evaluateModels(config, sorted)
    setEvals(evals_)
    void ensurePoolSeeded(configId, sorted[0].drawNo).then(() =>
      db.modelPool.where('lottery').equals(configId).toArray().then(setPool),
    )
  }, [configId, config, sorted, enough])

  const openDetail = (rec: ModelRecord) => {
    setSelected(rec)
    void db.modelEvents
      .where('[lottery+modelId]')
      .equals([rec.lottery, rec.id])
      .sortBy('at')
      .then(setEvents)
  }

  const run = async () => {
    if (!evals) return
    setBusy(true)
    try {
      const transitions = await runEvolution(configId, sorted, evals)
      setLog(transitions)
      const poolNow = await db.modelPool.where('lottery').equals(configId).toArray()
      setPool(poolNow)
      if (selected) {
        const cur = poolNow.find((p) => p.id === selected.id)
        if (cur) openDetail(cur)
      }
    } finally {
      setBusy(false)
    }
  }

  // 时间胶囊：以"期数"为宽度单位（bornIdx 最大者 = 最旧，占满全宽）
  const idxOf = useMemo(() => {
    const m = new Map<string, number>()
    sorted.forEach((d, i) => m.set(d.drawNo, i))
    return m
  }, [sorted])
  const maxIdx = sorted.length
  const segments = pool.map((r) => {
    const bornIdx = idxOf.get(r.bornDrawNo) ?? maxIdx
    const endIdx = r.retiredDrawNo ? (idxOf.get(r.retiredDrawNo) ?? 0) : 0
    return { rec: r, width: Math.max(((bornIdx - endIdx + 1) / (maxIdx || 1)) * 100, 2.5) }
  })

  const statusOf = (type: string): ModelRecord['status'] | null =>
    pool.filter((p) => p.status !== 'deprecated' && p.type === type).sort((a, b) => b.bornAt - a.bornAt)[0]?.status ??
    null

  return (
    <section className="card">
      <div className="card-head">
        <h2>模型匹配与进化引擎</h2>
        <button className="btn" disabled={!evals || busy} onClick={run}>
          {busy ? '评估中…' : '运行一轮进化评估'}
        </button>
      </div>

      <div className="model-limits">
        <b>模型局限性说明</b>
        <p>
          匹配分反映模型对历史统计特征的贴合程度，不代表预测能力。所有模型的中奖概率与随机选择完全相同——
          下图随机基准线（超几何期望 {baseline.toFixed(2)}）就是任何策略无法稳定跨越的天花板。
          进化引擎展示的是"模型会被持续检验和替换"这一机制本身。
        </p>
      </div>

      {!enough ? (
        <p className="hint">本地数据不足 40 期，请先同步历史数据后再使用模型匹配。</p>
      ) : !evals ? (
        <p className="hint">回测计算中…</p>
      ) : (
        <>
          <h3 className="sub-title">走前回测（每期仅用当期之前数据，共 {evals[0]?.periods ?? 0} 期）</h3>
          <ModelMatchChart evals={evals} baseline={baseline} />
          <table className="omission-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>匹配分（50=随机基准）</th>
                <th>平均命中</th>
                <th>近 10 窗口贴合</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {evals.map((e) => {
                const st = statusOf(e.type)
                const recentFit = e.windowsFit.slice(-10)
                return (
                  <tr key={e.type}>
                    <td className="health-detail" title={e.desc}>
                      {e.name}
                    </td>
                    <td>{e.score}</td>
                    <td>{e.avgHits}</td>
                    <td>{recentFit.filter(Boolean).length} / {recentFit.length}</td>
                    <td>{st ? STATUS_TEXT[st] : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="hint">
            贴合 = 窗口平均命中 ≥ 期望×0.9（随机波动带内）。晋升需连续 10 窗口贴合，连续 10 窗口偏离则淘汰（参数与需求 13.4 对齐）。
          </p>

          {log.length > 0 && (
            <div className="evo-log">
              <h3 className="sub-title">本轮状态迁移</h3>
              <ul>
                {log.map((t, i) => (
                  <li key={i}>{t.text}</li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="sub-title">模型进化时间胶囊（胶囊宽度 = 存活期数）</h3>
          <div className="capsule-track">
            {segments.length === 0 ? (
              <span className="hint">模型池初始化中…</span>
            ) : (
              segments
                .slice()
                .sort((a, b) => (idxOf.get(a.rec.bornDrawNo) ?? 0) - (idxOf.get(b.rec.bornDrawNo) ?? 0))
                .map(({ rec, width }) => (
                  <button
                    key={rec.id}
                    className={`capsule${selected?.id === rec.id ? ' is-selected' : ''}`}
                    style={{ width: `${width}%`, background: STATUS_COLOR[rec.status] }}
                    onClick={() => openDetail(rec)}
                    title={`${rec.name} · ${STATUS_TEXT[rec.status]}`}
                  >
                    <span>{rec.name}</span>
                    <em>{STATUS_TEXT[rec.status]}</em>
                  </button>
                ))
            )}
          </div>

          {selected && (
            <div className="capsule-detail">
              <h4>
                {selected.name} · {STATUS_TEXT[selected.status]}
                {selected.status === 'safety' && `（剩余 ${selected.safetyRemaining ?? 0} 期）`}
              </h4>
              <p className="hint">{evals.find((e) => e.type === selected.type)?.desc}</p>
              <p className="hint">
                权重 {selected.weight} · 存活期数{' '}
                {(() => {
                  const bornIdx = idxOf.get(selected.bornDrawNo) ?? maxIdx
                  const endIdx = selected.retiredDrawNo ? (idxOf.get(selected.retiredDrawNo) ?? 0) : 0
                  return bornIdx - endIdx + 1
                })()}{' '}
                期（起点 {selected.bornDrawNo} 期
                {selected.retiredDrawNo ? `，退役于 ${selected.retiredDrawNo} 期` : '，至今'}）
              </p>
              <ul>
                {events.map((ev) => (
                  <li key={ev.id}>
                    <b>{ev.drawNo} 期</b>：{ev.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
