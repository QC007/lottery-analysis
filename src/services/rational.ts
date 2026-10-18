import { db } from '../db/db'

/**
 * F-10 情绪感知的理性提示（本地判断，不涉及隐私）
 * - 触发规则与防疲劳（24h 内同一提示不重复）对应需求 3.7 节
 * - 偏好存 db.settings（key=rationalTips），可全局关闭
 */

export type TipKey = 'longSession' | 'lossSim' | 'rapidSwitch'

export const TIP_TEXT: Record<TipKey, string> = {
  longSession: '您已连续分析 30 分钟，建议休息一下，适度使用更健康。',
  lossSim: '历史数据不代表未来，请理性购彩。',
  rapidSwitch: '分析维度切换较多，可能造成信息过载，建议聚焦 1-2 个维度。',
}

const KEY = 'rationalTips'

interface RationalState {
  off: boolean
  /** 各提示的 24h 抑制截止时间戳 */
  suppressedUntil: Record<string, number>
}

async function load(): Promise<RationalState> {
  const row = await db.settings.get(KEY)
  return { off: false, suppressedUntil: {}, ...((row?.value as Partial<RationalState>) ?? {}) }
}

async function save(s: RationalState): Promise<void> {
  await db.settings.put({ key: KEY, value: s })
}

export async function isGlobalOff(): Promise<boolean> {
  return (await load()).off
}

export async function setGlobalOff(off: boolean): Promise<void> {
  const s = await load()
  await save({ ...s, off })
}

/** 该提示当前是否处于 24h 抑制期或全局关闭 */
export async function isSuppressed(key: TipKey): Promise<boolean> {
  const s = await load()
  if (s.off) return true
  return (s.suppressedUntil[key] ?? 0) > Date.now()
}

/** 24h 内不再展示该提示 */
export async function suppress24h(key: TipKey): Promise<void> {
  const s = await load()
  await save({ ...s, suppressedUntil: { ...s.suppressedUntil, [key]: Date.now() + 24 * 3600_000 } })
}
