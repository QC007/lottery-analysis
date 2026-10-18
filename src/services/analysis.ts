import { useEffect, useRef, useState } from 'react'
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

/**
 * React Hook：输入变化自动重算（异步，不阻塞 UI）
 * U-5 防抖动：stale-while-revalidate —— 新结果返回前保留上一次结果，
 * 图表不卸载、页面高度稳定；同时在途请求期间的新输入合并为一次尾随重算，
 * 避免拖动滑动条时 Worker 消息积压。
 * 彩种切换时返回 null（不同彩种的结果不可混用）。
 */
export function useAnalysis(
  draws: Draw[],
  config: LotteryConfig,
): AnalysisResult | null {
  const [state, setState] = useState<{ configId: string; result: AnalysisResult } | null>(null)
  const busyRef = useRef(false)
  const latestRef = useRef<{ draws: Draw[]; config: LotteryConfig }>({ draws, config })

  useEffect(() => {
    latestRef.current = { draws, config }
    if (draws.length === 0 || busyRef.current) return
    busyRef.current = true
    const run = () => {
      const { draws: d, config: c } = latestRef.current
      void analyze(d, c).then((r) => {
        setState({ configId: c.id, result: r })
        if (latestRef.current.draws !== d || latestRef.current.config !== c) {
          run() // 计算期间输入又变了：用最新输入尾随重算一次
        } else {
          busyRef.current = false
        }
      })
    }
    run()
  }, [draws, config])

  return state?.configId === config.id ? state.result : null
}
