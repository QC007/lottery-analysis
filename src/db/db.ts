import Dexie, { type Table } from 'dexie'
import type { Draw } from '../config/lotteries'

/** IndexedDB 中的开奖记录（统一 Draw 结构 + 彩种归属） */
export interface DrawRecord extends Draw {
  lottery: string
}

/** 每彩种同步状态（对应 data/meta.json 的进度水位） */
export interface SyncState {
  lottery: string
  /** 已同步到的最新期号 */
  latestDrawNo: string
  /** 已完整拉取的年份归档 */
  years: number[]
  /** 最近同步时间戳 */
  syncedAt: number
}

/** 通用键值设置（F-05：LLM 配置、首次提示标记等；存 IndexedDB 而非 localStorage，避免 XSS 读取） */
export interface SettingRecord {
  key: string
  value: unknown
}

class LotteryDB extends Dexie {
  draws!: Table<DrawRecord, [string, string]>
  syncState!: Table<SyncState, string>
  settings!: Table<SettingRecord, string>

  constructor() {
    super('lap-db')
    this.version(1).stores({
      // 复合主键 [lottery+drawNo] 天然防重，bulkPut 即 upsert
      draws: '[lottery+drawNo], lottery, date',
      syncState: 'lottery',
    })
    // v2：新增 settings 键值表（原有两表结构不变）
    this.version(2).stores({
      draws: '[lottery+drawNo], lottery, date',
      syncState: 'lottery',
      settings: 'key',
    })
  }
}

export const db = new LotteryDB()
