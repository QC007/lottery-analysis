import type { Draw } from '../config/lotteries'
import { db, type ModelEvent, type ModelRecord } from '../db/db'
import { MODEL_DEFS, WINDOW, type ModelEval } from './models'

/**
 * 进化引擎（本地状态机，参数对齐需求 13.4）
 * - 晋升：testing 连续 WINDOW×10 期（10 个窗口）全部贴合 → safety（安全期 10 期）
 * - 淘汰：testing/active 连续 10 个窗口全部偏离 → deprecated；active 退役后自动播种同类型替身
 * - 安全期：以窗口为单位倒计时，归零转 active
 * 全程仅使用走前回测统计，不含任何预测语义；状态与事件持久化于 IndexedDB。
 */

export type Transition = { modelId: string; text: string }

function defOf(type: string) {
  return MODEL_DEFS.find((m) => m.type === type)
}

/** 首次打开时播种模型池：5 个候选模型全部以 testing 状态进入观察期 */
export async function ensurePoolSeeded(
  lottery: string,
  latestDrawNo: string,
): Promise<void> {
  const existing = await db.modelPool.where('lottery').equals(lottery).count()
  if (existing > 0) return
  const now = Date.now()
  const records: ModelRecord[] = MODEL_DEFS.map((def) => ({
    id: `${lottery}:${def.type}:${now}`,
    lottery,
    type: def.type,
    name: def.name,
    status: 'testing',
    bornAt: now,
    bornDrawNo: latestDrawNo,
    weight: 1,
  }))
  const events: ModelEvent[] = records.map((r) => ({
    lottery,
    modelId: r.id,
    at: now,
    drawNo: latestDrawNo,
    type: 'seeded',
    detail: `模型「${r.name}」进入观察期`,
  }))
  await db.modelPool.bulkAdd(records)
  await db.modelEvents.bulkAdd(events)
}

/**
 * 运行一轮进化评估：按各模型最近 10 个窗口的贴合/偏离序列执行状态迁移。
 * @param evals evaluateModels() 的结果（含 windowsFit，时间升序）
 * @returns 状态迁移日志（空数组 = 本轮无变化）
 */
export async function runEvolution(
  lottery: string,
  sorted: Draw[],
  evals: ModelEval[],
): Promise<Transition[]> {
  const latestDrawNo = sorted[0]?.drawNo ?? ''
  await ensurePoolSeeded(lottery, latestDrawNo)
  const pool = await db.modelPool.where('lottery').equals(lottery).toArray()
  const now = Date.now()
  const transitions: Transition[] = []

  /** 最近 10 个窗口（时间升序取尾部）；不足 10 个窗口不判定 */
  const fitByType = new Map(evals.map((e) => [e.type, e]))
  const recentFit = (type: string): boolean[] | null => {
    const e = fitByType.get(type)
    if (!e || e.windowsFit.length < 10) return null
    return e.windowsFit.slice(-10)
  }

  for (const rec of pool) {
    if (rec.status === 'deprecated') continue
    const fit = recentFit(rec.type)

    if (rec.status === 'testing' && fit) {
      if (fit.every(Boolean)) {
        rec.status = 'safety'
        rec.safetyRemaining = 10
        transitions.push({ modelId: rec.id, text: `「${rec.name}」连续 10 窗口贴合 → 晋级正式（安全期 10 期）` })
        await db.modelEvents.add({
          lottery,
          modelId: rec.id,
          at: now,
          drawNo: latestDrawNo,
          type: 'promoted',
          detail: '连续 10 个评估窗口贴合随机基准带，晋级正式算法（安全期 10 期）',
        })
      } else if (fit.every((f) => !f)) {
        rec.status = 'deprecated'
        rec.retiredDrawNo = latestDrawNo
        transitions.push({ modelId: rec.id, text: `「${rec.name}」连续 10 窗口偏离 → 退役` })
        await db.modelEvents.add({
          lottery,
          modelId: rec.id,
          at: now,
          drawNo: latestDrawNo,
          type: 'deprecated',
          detail: '连续 10 个评估窗口低于随机基准带，予以淘汰',
        })
        // 自动播种同类型替身（延续该策略路线的观察）
        const def = defOf(rec.type)
        if (def) {
          const born: ModelRecord = {
            id: `${lottery}:${def.type}:${now + 1}`,
            lottery,
            type: def.type,
            name: def.name,
            status: 'testing',
            bornAt: now + 1,
            bornDrawNo: latestDrawNo,
            weight: 1,
          }
          await db.modelPool.add(born)
          await db.modelEvents.add({
            lottery,
            modelId: born.id,
            at: now + 1,
            drawNo: latestDrawNo,
            type: 'seeded',
            detail: `作为「${rec.name}」退役后的同类型替身进入观察期`,
          })
          transitions.push({ modelId: born.id, text: `已播种同类型替身「${def.name}」（观察期）` })
        }
      }
    } else if (rec.status === 'safety') {
      // 一个评估轮次 = 10 期 = 安全期全额倒计时
      rec.safetyRemaining = (rec.safetyRemaining ?? 0) - WINDOW
      if (rec.safetyRemaining <= 0) {
        rec.status = 'active'
        rec.safetyRemaining = 0
        transitions.push({ modelId: rec.id, text: `「${rec.name}」安全期结束 → 转为正式算法` })
        await db.modelEvents.add({
          lottery,
          modelId: rec.id,
          at: now,
          drawNo: latestDrawNo,
          type: 'safety_end',
          detail: '安全期（10 期）届满且未触发淘汰，转为正式算法',
        })
      }
    } else if (rec.status === 'active' && fit) {
      if (fit.every((f) => !f)) {
        rec.status = 'deprecated'
        rec.retiredDrawNo = latestDrawNo
        transitions.push({ modelId: rec.id, text: `「${rec.name}」（正式）连续 10 窗口偏离 → 退役` })
        await db.modelEvents.add({
          lottery,
          modelId: rec.id,
          at: now,
          drawNo: latestDrawNo,
          type: 'deprecated',
          detail: '正式算法连续 10 个评估窗口偏离随机基准带，触发淘汰',
        })
        const def = defOf(rec.type)
        if (def) {
          const born: ModelRecord = {
            id: `${lottery}:${def.type}:${now + 1}`,
            lottery,
            type: def.type,
            name: def.name,
            status: 'testing',
            bornAt: now + 1,
            bornDrawNo: latestDrawNo,
            weight: 1,
          }
          await db.modelPool.add(born)
          await db.modelEvents.add({
            lottery,
            modelId: born.id,
            at: now + 1,
            drawNo: latestDrawNo,
            type: 'seeded',
            detail: `作为「${rec.name}」退役后的同类型替身进入观察期`,
          })
          transitions.push({ modelId: born.id, text: `已播种同类型替身「${def.name}」（观察期）` })
        }
      }
    }
    await db.modelPool.put(rec)
  }

  return transitions
}
