import { enabledLotteries, type Draw, type LotteryConfig } from '../config/lotteries'
import { db, type DrawRecord, type SyncState } from '../db/db'

/**
 * 数据同步服务（D-05）
 * 启动：读 meta.json 对比 IndexedDB 水位 → 增量拉 latest.json（近 ~100 期热数据）
 * 历史：ensureYears() 按需拉 {彩种}/{年份}.json 冷数据归档
 * 数据源：GitHub Pages 同源静态 JSON（BASE_URL 兼容本地 dev 与 Pages 部署）
 */

export interface LotteryMeta {
  name: string
  latestDrawNo: string
  latestDate: string
  /** U-7 水位修订号（latest.json updatedAt）：扩展字段补全后期号不变也需重拉 */
  rev?: string
  latestCount: number
  archiveYears: number[]
  totalDraws: number
}

export interface MetaJson {
  generatedAt: string
  lotteries: Record<string, LotteryMeta>
}

export interface SyncResult {
  lottery: string
  name: string
  updated: boolean
  added: number
  error?: string
}

async function fetchJson<T>(path: string): Promise<T> {
  // cache: no-store 保证 meta.json 每次拿到最新水位
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`拉取 ${path} 失败: HTTP ${res.status}`)
  return (await res.json()) as T
}

/** 全量同步所有已启用彩种；返回 meta 供 UI 展示覆盖率 */
export async function syncAll(
  onProgress?: (r: SyncResult) => void,
): Promise<{ meta: MetaJson; results: SyncResult[] }> {
  const meta = await fetchJson<MetaJson>('data/meta.json')
  const results: SyncResult[] = []
  for (const cfg of enabledLotteries) {
    const r = await syncLottery(cfg, meta).catch((err): SyncResult => ({
      lottery: cfg.id,
      name: cfg.name,
      updated: false,
      added: 0,
      error: err instanceof Error ? err.message : String(err),
    }))
    results.push(r)
    onProgress?.(r)
  }
  return { meta, results }
}

/** 同步单彩种：对比水位 → 拉 latest.json → upsert 入库 */
async function syncLottery(cfg: LotteryConfig, meta: MetaJson): Promise<SyncResult> {
  const m = meta.lotteries[cfg.id]
  if (!m) return { lottery: cfg.id, name: cfg.name, updated: false, added: 0, error: 'meta 缺少该彩种' }

  const state = await db.syncState.get(cfg.id)
  // 水位未变则跳过（期号一致且修订号 rev 一致；U-7 rev 用于奖池字段补全后强制重拉）
  if (state && state.latestDrawNo === m.latestDrawNo && state.rev === m.rev) {
    return { lottery: cfg.id, name: cfg.name, updated: false, added: 0 }
  }

  const latest = await fetchJson<{ draws: Draw[] }>(`data/${cfg.id}/latest.json`)
  const records: DrawRecord[] = latest.draws.map((d) => ({ ...d, lottery: cfg.id }))
  await db.transaction('rw', db.draws, db.syncState, async () => {
    await db.draws.bulkPut(records)
    const nextState: SyncState = {
      lottery: cfg.id,
      latestDrawNo: m.latestDrawNo,
      years: state?.years ?? [],
      syncedAt: Date.now(),
      rev: m.rev,
    }
    await db.syncState.put(nextState)
  })
  return { lottery: cfg.id, name: cfg.name, updated: true, added: records.length }
}

/** 按需拉取年份归档（查看全量历史 / 分析引擎需要冷数据时调用），返回新增期数 */
export async function ensureYears(
  cfg: LotteryConfig,
  metaYears: number[],
  /** U-12-1 逐年进度回调（done/total，每抓完一年触发一次） */
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const state = await db.syncState.get(cfg.id)
  const have = new Set(state?.years ?? [])
  const missing = metaYears.filter((y) => !have.has(y))
  let added = 0
  let done = 0
  for (const year of missing) {
    const archive = await fetchJson<{ draws: Draw[] }>(`data/${cfg.id}/${year}.json`)
    const records = archive.draws.map((d) => ({ ...d, lottery: cfg.id }))
    await db.draws.bulkPut(records)
    added += records.length
    done++
    onProgress?.(done, missing.length)
  }
  if (missing.length > 0) {
    await db.syncState.put({
      lottery: cfg.id,
      latestDrawNo: state?.latestDrawNo ?? '',
      years: [...have, ...missing].sort((a, b) => b - a),
      syncedAt: Date.now(),
    })
  }
  return added
}
