import type { Draw, LotteryConfig } from '../config/lotteries'
import type { BacktestRequest, BacktestResult } from '../workers/backtest.worker'

/** 单例回溯 Worker + Promise 化调用（与 services/analysis.ts 同模式） */
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (v: BacktestResult) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<{ id: number; result: BacktestResult }>) => {
      const resolve = pending.get(e.data.id)
      if (resolve) {
        pending.delete(e.data.id)
        resolve(e.data.result)
      }
    }
  }
  return worker
}

export function runBacktest(
  picks: number[][],
  draws: Draw[],
  startDrawNo: string,
  config: LotteryConfig,
): Promise<BacktestResult> {
  const id = ++seq
  const req: BacktestRequest = {
    id,
    picks,
    draws: draws.map((d) => ({ drawNo: d.drawNo, date: d.date, zones: d.zones })),
    startDrawNo,
    prize: config.prize!,
  }
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(req)
  })
}
