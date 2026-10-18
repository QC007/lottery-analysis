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

/** 模型池记录（F-06/进化引擎）：一个模型的一次生命周期 */
export interface ModelRecord {
  /** 彩种:类型:出生时间戳 */
  id: string
  lottery: string
  /** 模型类型（models.ts 中定义） */
  type: string
  name: string
  /** testing 观察期 / safety 晋级安全期 / active 正式 / deprecated 退役 */
  status: 'testing' | 'safety' | 'active' | 'deprecated'
  bornAt: number
  /** 生命周期起点期号 */
  bornDrawNo: string
  /** 退役期号（退役后填充） */
  retiredDrawNo?: string
  /** 安全期剩余期数（safety 状态用） */
  safetyRemaining?: number
  /** 权重（描述型模型固定 1，展示用） */
  weight: number
}

/** 模型生命周期事件（时间胶囊点击详情的数据源） */
export interface ModelEvent {
  id?: number
  lottery: string
  modelId: string
  at: number
  /** 事件发生时的最新期号 */
  drawNo: string
  type: 'seeded' | 'promoted' | 'safety_end' | 'deprecated'
  detail: string
}

class LotteryDB extends Dexie {
  draws!: Table<DrawRecord, [string, string]>
  syncState!: Table<SyncState, string>
  settings!: Table<SettingRecord, string>
  modelPool!: Table<ModelRecord, string>
  modelEvents!: Table<ModelEvent, number>

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
    // v3：模型池 + 生命周期事件（进化引擎/F-06）
    this.version(3).stores({
      draws: '[lottery+drawNo], lottery, date',
      syncState: 'lottery',
      settings: 'key',
      modelPool: 'id, lottery, status, [lottery+status]',
      modelEvents: '++id, lottery, modelId, [lottery+modelId]',
    })
  }
}

export const db = new LotteryDB()
