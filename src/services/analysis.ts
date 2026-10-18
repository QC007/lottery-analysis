import { useEffect, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import type { AnalysisResult, AnalyzeRequest } from '../workers/analysis.worker'

/** 单例分析 Worker + Promise 化调用 */
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (v: AnalysisResult) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<{ id: number; result: AnalysisResult }>) => {
      const resolve = pending.get(e.data.id)
      if (resolve) {
        pending.delete(e.data.id)
        resolve(e.data.result)
      }
    }
  }
  return worker
}

export function analyze(draws: Draw[], config: LotteryConfig): Promise<AnalysisResult> {
  const id = ++seq
  const req: AnalyzeRequest = {
    id,
    draws: draws.map((d) => ({ drawNo: d.drawNo, date: d.date, zones: d.zones })),
    config: { zones: config.zones },
  }
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(req)
  })
}

/** React Hook：输入变化自动重算（异步，不阻塞 UI） */
export function useAnalysis(
  draws: Draw[],
  config: LotteryConfig,
): AnalysisResult | null {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  useEffect(() => {
    let cancelled = false
    setResult(null)
    if (draws.length === 0) return
    analyze(draws, config).then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
  }, [draws, config])
  return result
}
