import lotteriesJson from './lotteries.json'

/**
 * 彩种配置（配置驱动架构，需求文档 5.1 节）
 * 纯数据在 lotteries.json —— 它是唯一数据源：
 *   ① 前端（本文件加类型导出）
 *   ② scripts/fetch-data.mjs（GitHub Actions 抓取脚本直接读 JSON）
 * 新增彩种只需修改 lotteries.json，核心代码零改动。
 */

/** 号码区规则 */
export interface LotteryZone {
  /** 区标识（存储键），如 red / blue / front / back / digit */
  key: string
  /** 展示名，如「红球」「前区」 */
  name: string
  min: number
  max: number
  /** 每注开出个数 */
  pick: number
  /** 是否有序（排列三/3D 有序；双色球/大乐透无序，存储时升序） */
  ordered: boolean
}

export interface LotterySource {
  /** 响应解析器标识，scripts/fetch-data.mjs 按此分发解析 */
  parser: 'sporttery' | 'cwl' | 'huiniao' | 'apihz'
  /** URL 模板，占位符 {pageNo} {pageSize}（apihz 单期源无占位符） */
  urlTemplate: string
  /** 抓取需附加的请求头（体彩 WAF 要求 Referer） */
  headers?: Record<string, string>
}

/**
 * 奖级规则（回溯模拟器 F-03 使用，官方规则）
 * match 元素为 [主区命中数, 副区命中数]；amount=0 表示浮动奖（模拟中单独计数、不计入金额）
 * tiers 必须按奖金优先级从高到低排序，判定时取第一个命中的奖级
 */
export interface PrizeTier {
  name: string
  match: [number, number][]
  /** 单注固定奖金（元）；0 = 浮动奖 */
  amount: number
}

export interface PrizeRule {
  /** 单注成本（元） */
  unitCost: number
  tiers: PrizeTier[]
}

export interface LotteryConfig {
  /** 彩种唯一标识（数据目录名）：ssq / dlt / pl3 / fc3d / qlc */
  id: string
  name: string
  /** 发行方：体彩 sporttery / 福彩 welfare */
  issuer: 'sporttery' | 'welfare'
  /** 是否启用数据管道（V1.0 仅 ssq + dlt） */
  enabled: boolean
  /** 开奖周期描述 */
  drawSchedule: string
  /** 期号格式正则（字符串形式）：7 位=4 位年+3 位序号；5 位=2 位年+3 位序号 */
  drawNoPattern: string
  zones: LotteryZone[]
  /** 奖级规则（仅"主区+副区"两区无序彩种；有序数字彩种不适用） */
  prize?: PrizeRule
  sources: {
    /** 官方抓取源（Actions 服务端使用） */
    official: LotterySource
    /** 备用源 1：灰鸟（可分页补历史） */
    fallback: LotterySource
    /** 备用源 2：apihz（单期最新，最后兜底） */
    fallback2?: LotterySource
  }
}

export const lotteries = lotteriesJson as unknown as Record<string, LotteryConfig>

/** 已启用彩种列表 */
export const enabledLotteries: LotteryConfig[] = Object.values(lotteries).filter(
  (l) => l.enabled,
)

/** 统一开奖记录格式（data/*.json 与 IndexedDB 共用） */
export interface Draw {
  drawNo: string
  /** YYYY-MM-DD */
  date: string
  /** 按 zones 顺序的号码数组；无序区升序存储 */
  zones: number[][]
  /** U-7 开奖后奖池滚存（元）；仅官方源抓取的新数据有，历史数据/备用源可能缺失 */
  pool?: number
  /** U-7 本期销售额（元）；同上可选 */
  sales?: number
}
