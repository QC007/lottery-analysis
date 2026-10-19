import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { db, type ModelEvent, type ModelRecord } from '../db/db'
import { baselineExpected, EVAL_PERIODS, evaluateModels, type ModelEval } from '../services/models'
import { ensurePoolSeeded, runEvolution, type Transition } from '../services/evolution'
import ModelMatchChart from './ModelMatchChart'
import MotionCard from './MotionCard'

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

/** 回测期数快捷选项（U-5：上限由 200 放开到全部本地历史） */
const PERIOD_CHIPS = [200, 500, 1000]

/** F-06 模型进化时间胶囊 + 本地模型匹配（走前回测 + 随机基准线） */
export default function EvolutionPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  // U-5：回测期数可选（默认 200，最大全部历史）；计算期间保留旧结果避免面板抖动
  const [periods, setPeriods] = useState(EVAL_PERIODS)
  const [evalState, setEvalState] = useState<{
    configId: string
    periods: number
    evals: ModelEval[]
  } | null>(null)
  const [pool, setPool] = useState<ModelRecord[]>([])
  const [selected, setSelected] = useState<ModelRecord | null>(null)
  const [events, setEvents] = useState<ModelEvent[]>([])
  const [log, setLog] = useState<Transition[]>([])
  const [busy, setBusy] = useState(false)

  const configId = config.id
  const baseline = useMemo(() => baselineExpected(config.zones[0]), [config])
  const enough = sorted.length >= 40

  const evals = evalState?.configId === configId ? evalState.evals : null
  const computing = enough && (!evals || evalState?.periods !== periods)

  // 彩种切换/期数切换：异步重算（全量回测耗时较长，setTimeout 让出主线程先渲染）
  useEffect(() => {
    setSelected(null)
    setEvents([])
    setLog([])
    if (!enough) return
    const timer = setTimeout(() => {
      const evals_ = evaluateModels(config, sorted, periods)
      setEvalState({ configId, periods, evals: evals_ })
      void ensurePoolSeeded(configId, sorted[0].drawNo).then(() =>
        db.modelPool.where('lottery').equals(configId).toArray().then(setPool),
      )
    }, 30)
    return () => clearTimeout(timer)
  }, [configId, config, sorted, enough, periods])

  const openDetail = (rec: ModelRecord) => {
    setSelected(rec)
    void db.modelEvents
      .where('[lottery+modelId]')
      .equals([rec.lottery, rec.id])
      .sortBy('at')
      .then(setEvents)
  }

  const run = async () => {
    if (!evals || computing) return
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
    <MotionCard className="card" delay={0.07}>
      <div className="card-head">
        <h2>选号策略实验室</h2>
        <button className="btn" disabled={!evals || busy || computing} onClick={run}>
          {busy ? '评估中…' : '运行一轮评估'}
        </button>
      </div>

      <div className="model-limits">
        <b>这是什么</b>
        <p>
          系统内置 5 个统计选号策略（热号、冷号等），用历史数据逐期检验它们的贴合度，达标晋升、偏离淘汰。
          匹配分反映的是对历史统计特征的贴合程度，不代表预测能力——图中随机基准线（超几何期望{' '}
          {baseline.toFixed(2)}）就是任何策略无法稳定跨越的天花板。
        </p>
      </div>

      {enough && (
        <div className="pp-chips" role="group" aria-label="回测期数范围">
          {PERIOD_CHIPS.filter((m) => m < sorted.length).map((m) => (
            <button
              key={m}
              type="button"
              className={`pp-chip${periods === m ? ' is-active' : ''}`}
              onClick={() => setPeriods(m)}
            >
              近{m}期
            </button>
          ))}
          <button
            type="button"
            className={`pp-chip${periods >= sorted.length ? ' is-active' : ''}`}
            onClick={() => setPeriods(sorted.length)}
          >
            全部
          </button>
        </div>
      )}

      {!enough ? (
        <p className="hint">本地数据不足 40 期，请先同步历史数据后再使用模型匹配。</p>
      ) : !evals ? (
        <p className="hint">回测计算中…</p>
      ) : (
        <>
          {computing && <p className="hint">正在按新期数范围重新回测…</p>}
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
    </MotionCard>
  )
}
