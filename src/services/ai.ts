import { db } from '../db/db'
import type { LotteryConfig } from '../config/lotteries'
import type { AnalysisResult } from '../workers/analysis.worker'

/**
 * AI 服务层（F-05）
 * - LLM 配置存 IndexedDB settings 表（不落 localStorage / 日志 / URL）
 * - OpenAI 兼容 Chat Completions 接口，SSE 流式输出，AbortController 超时控制
 * - 无 Key / 调用失败 → 本地规则引擎生成分析文本（降级）
 */

export interface LLMSettings {
  endpoint: string
  apiKey: string
  model: string
}

const SETTINGS_KEY = 'llm'
export const AI_FIRST_TIP_KEY = 'aiFirstTipSeen'

export const DEFAULT_LLM: LLMSettings = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export async function loadLLMSettings(): Promise<LLMSettings> {
  const row = await db.settings.get(SETTINGS_KEY)
  return { ...DEFAULT_LLM, ...((row?.value as Partial<LLMSettings>) ?? {}) }
}

export async function saveLLMSettings(s: LLMSettings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: s })
}

export async function clearLLMSettings(): Promise<void> {
  await db.settings.delete(SETTINGS_KEY)
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 流式调用 LLM（SSE）。onToken 逐段回调增量文本，返回完整文本。
 * 超时（默认 30s）或网络错误时抛出异常，已生成部分通过 onToken 保留。
 */
export async function streamChat(
  settings: LLMSettings,
  messages: ChatMessage[],
  onToken: (fullText: string) => void,
  timeoutMs = 30000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(settings.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({ model: settings.model, messages, stream: true }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    if (!resp.body) throw new Error('无响应流')

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta: string = json.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            full += delta
            onToken(full)
          }
        } catch {
          // 半包 JSON 留待下一片段
        }
      }
    }
    return full
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------- 本地规则引擎（降级） ---------------- */

export interface AnalysisStep {
  key: string
  title: string
  /** 数据来源说明 */
  source: string
  /** 计算过程说明 */
  process: string
  /** 结论（本地模板生成；有 LLM 时可被 AI 文本替换） */
  conclusion: string
  /** 注入追问上下文用的结构化摘要 */
  context: string
}

const SYSTEM_PROMPT = `你是彩票历史数据统计的解读助手。规则：
1. 只解读给定的历史统计数据，不做任何预测性承诺
2. 必须强调开奖是独立随机事件，历史规律不代表未来
3. 语言简洁客观，每条解读不超过 120 字
4. 结尾提示理性购彩`

/** 由本地分析结果构建分步报告（分步框架不依赖 LLM） */
export function buildSteps(
  config: LotteryConfig,
  sampleSize: number,
  total: number,
  result: AnalysisResult,
): AnalysisStep[] {
  const zoneNames = config.zones.map((z) => z.name).join('、')
  const ballTotal = config.zones.reduce((s, z) => s + z.pick, 0)

  const steps: AnalysisStep[] = []

  // 第一步：数据概览
  steps.push({
    key: 'overview',
    title: '第一步：数据概览',
    source: `本地 IndexedDB 中「${config.name}」最近 ${result.total} 期开奖数据（样本共 ${total} 期）`,
    process: `逐期解析 ${zoneNames}，共 ${result.total} 期 × 每期 ${ballTotal} 个号码`,
    conclusion: `样本量 ${result.total} 期，满足统计描述的基本要求。注意：样本描述仅反映历史，不构成任何预测依据。`,
    context: `彩种=${config.name}，样本期数=${result.total}，每注结构=${zoneNames}`,
  })

  // 第二步：频率分析
  for (const z of result.zones) {
    const sortedByCount = [...z.numbers].sort((a, b) => b.count - a.count)
    const hot = sortedByCount.slice(0, 5).map((x) => `${String(x.n).padStart(2, '0')}(${x.count}次)`)
    const cold = sortedByCount.slice(-5).reverse().map((x) => `${String(x.n).padStart(2, '0')}(${x.count}次)`)
    steps.push({
      key: `freq-${z.key}`,
      title: `频率分析：${z.name}`,
      source: `最近 ${result.total} 期${z.name}开出记录`,
      process: '统计每个号码在样本期内的出现次数，按次数排序取前/后 5 名',
      conclusion: `频率最高：${hot.join('、')}；频率最低：${cold.join('、')}。频率差异在随机波动范围内属正常现象。`,
      context: `分区=${z.name}，热号=${hot.join(' ')}，冷号=${cold.join(' ')}`,
    })
  }

  // 第三步：遗漏分析
  const firstZone = result.zones[0]
  if (firstZone) {
    const byGap = [...firstZone.numbers].sort((a, b) => b.currentGap - a.currentGap)
    const top = byGap.slice(0, 5).map((x) => `${String(x.n).padStart(2, '0')}(遗漏${x.currentGap}期)`)
    steps.push({
      key: 'omission',
      title: `遗漏分析：${firstZone.name}`,
      source: `最近 ${result.total} 期${firstZone.name}开出记录`,
      process: '统计每个号码自最新一期起连续未开出的期数（当前遗漏），取前 5 名',
      conclusion: `当前遗漏最长：${top.join('、')}。遗漏长不代表「该出了」，每期开出概率独立不变。`,
      context: `分区=${firstZone.name}，当前遗漏 TOP5=${top.join(' ')}`,
    })
  }

  // 第四步：综合建议（占位，LLM 可用时替换为 AI 文本）
  steps.push({
    key: 'summary',
    title: '综合解读',
    source: `以上各步统计结果（样本 ${result.total} 期）`,
    process: sampleSize > 0 ? '汇总频率、遗漏等统计特征' : '',
    conclusion:
      '从历史统计看，各号码出现频率与遗漏均在随机波动范围内。任何基于历史数据的选号策略都无法改变单注中奖概率——每期开奖相互独立。请以娱乐心态参与，量力而行。',
    context: steps.map((s) => s.context).join('\n'),
  })

  return steps
}

/** 生成某一步的 AI 解读（基于该步上下文） */
export function stepMessages(step: AnalysisStep, extra?: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请解读以下彩票统计步骤并给出客观结论：\n【${step.title}】\n数据来源：${step.source}\n统计上下文：\n${step.context}${extra ? `\n补充要求：${extra}` : ''}`,
    },
  ]
}

/** 追问：将当前步骤上下文 + 用户问题注入 */
export function followupMessages(step: AnalysisStep, question: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `背景——【${step.title}】统计上下文：\n${step.context}\n\n用户追问：${question}`,
    },
  ]
}
