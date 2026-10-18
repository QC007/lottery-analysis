import { useEffect, useMemo, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { useAnalysis } from '../services/analysis'
import { db } from '../db/db'
import {
  AI_FIRST_TIP_KEY,
  buildSteps,
  clearLLMSettings,
  followupMessages,
  loadLLMSettings,
  saveLLMSettings,
  stepMessages,
  streamChat,
  type AnalysisStep,
  type LLMSettings,
} from '../services/ai'

const SAMPLE_SIZE = 300

interface Followup {
  q: string
  a: string
  loading: boolean
  error?: string
}

/** F-05 AI 分析分步解释面板 */
export default function AIPanel({
  config,
  sorted,
}: {
  config: LotteryConfig
  /** 期号降序的全部本地数据 */
  sorted: Draw[]
}) {
  const draws = useMemo(() => sorted.slice(0, SAMPLE_SIZE), [sorted])
  const analysis = useAnalysis(draws, config)

  const [settings, setSettings] = useState<LLMSettings | null>(null)
  const [draft, setDraft] = useState<LLMSettings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [steps, setSteps] = useState<AnalysisStep[] | null>(null)
  const [aiText, setAiText] = useState<Record<string, string>>({})
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({})
  const [aiError, setAiError] = useState<Record<string, string>>({})
  const [followups, setFollowups] = useState<Record<string, Followup[]>>({})
  const [question, setQuestion] = useState<Record<string, string>>({})
  const [tipVisible, setTipVisible] = useState(false)

  const configId = config.id
  useEffect(() => {
    setSteps(null)
    setAiText({})
    setFollowups({})
    setAiError({})
  }, [configId])

  useEffect(() => {
    loadLLMSettings().then((s) => {
      setSettings(s)
      setDraft(s)
      if (!s.apiKey) setSettingsOpen(true)
    })
  }, [])

  const hasKey = Boolean(settings?.apiKey)

  const generate = async () => {
    if (!analysis) return
    const seen = await db.settings.get(AI_FIRST_TIP_KEY)
    if (!seen) {
      setTipVisible(true)
      return
    }
    doGenerate()
  }

  const doGenerate = () => {
    if (!analysis) return
    const built = buildSteps(config, SAMPLE_SIZE, sorted.length, analysis)
    setSteps(built)
    setAiText({})
    setAiError({})
    // 综合解读步骤：有 Key 时由 AI 流式生成，失败/超时保留本地模板
    const summary = built.find((s) => s.key === 'summary')
    if (summary && hasKey && settings) {
      void callAI(summary)
    }
  }

  const confirmTip = async () => {
    await db.settings.put({ key: AI_FIRST_TIP_KEY, value: true })
    setTipVisible(false)
    doGenerate()
  }

  const callAI = async (step: AnalysisStep, extra?: string) => {
    if (!settings?.apiKey) return
    setAiLoading((m) => ({ ...m, [step.key]: true }))
    setAiError((m) => ({ ...m, [step.key]: '' }))
    try {
      await streamChat(settings, stepMessages(step, extra), (full) =>
        setAiText((m) => ({ ...m, [step.key]: full })),
      )
    } catch (err) {
      setAiError((m) => ({
        ...m,
        [step.key]:
          err instanceof DOMException && err.name === 'AbortError'
            ? 'AI 响应超时，已保留生成内容，可重试'
            : `AI 调用失败（${err instanceof Error ? err.message : String(err)}），已降级为本地解读`,
      }))
    } finally {
      setAiLoading((m) => ({ ...m, [step.key]: false }))
    }
  }

  const ask = async (step: AnalysisStep) => {
    const q = (question[step.key] ?? '').trim()
    if (!q || !settings?.apiKey) return
    setQuestion((m) => ({ ...m, [step.key]: '' }))
    setFollowups((m) => ({
      ...m,
      [step.key]: [...(m[step.key] ?? []), { q, a: '', loading: true }],
    }))
    try {
      await streamChat(settings, followupMessages(step, q), (full) =>
        setFollowups((m) => {
          const list = [...(m[step.key] ?? [])]
          list[list.length - 1] = { q, a: full, loading: false }
          return { ...m, [step.key]: list }
        }),
      )
    } catch (err) {
      setFollowups((m) => {
        const list = [...(m[step.key] ?? [])]
        list[list.length - 1] = {
          q,
          a: '',
          loading: false,
          error:
            err instanceof DOMException && err.name === 'AbortError'
              ? 'AI 响应超时，请重试'
              : `调用失败：${err instanceof Error ? err.message : String(err)}`,
        }
        return { ...m, [step.key]: list }
      })
    }
  }

  const saveSettings = async () => {
    if (!draft) return
    await saveLLMSettings(draft)
    setSettings(draft)
    setSettingsOpen(false)
  }

  const clearKey = async () => {
    await clearLLMSettings()
    const s = await loadLLMSettings()
    setSettings(s)
    setDraft(s)
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>AI 分析分步解释面板</h2>
        <button className="range-tab" onClick={() => setSettingsOpen((v) => !v)}>
          {hasKey ? 'AI 已配置' : '配置 API Key'}
        </button>
      </div>
      <p className="hint">
        分步展示分析过程：每一步包含数据来源、计算过程与结论，可展开查看、可对任意步骤追问 AI。
      </p>

      {settingsOpen && draft && (
        <div className="ai-settings">
          <label>
            API 端点（OpenAI 兼容）
            <input
              value={draft.endpoint}
              onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </label>
          <label>
            模型
            <input
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </label>
          <div className="ai-settings-actions">
            <button className="btn" onClick={saveSettings}>
              保存
            </button>
            {hasKey && (
              <button className="btn btn-ghost" onClick={clearKey}>
                一键清除 Key
              </button>
            )}
          </div>
          <p className="hint">
            Key 仅存储在浏览器 IndexedDB 中，不上传任何服务器；调用 LLM 产生的费用属个人账户行为。未配置 Key
            时面板使用本地规则引擎生成解读。
          </p>
        </div>
      )}

      <div className="bt-controls">
        <button
          className="btn"
          disabled={!analysis || draws.length === 0}
          onClick={generate}
        >
          {steps ? '重新生成分析' : '生成分析'}
        </button>
        <span className="hint">样本：最近 {draws.length} 期（不足 300 期按实际）</span>
      </div>

      {steps && (
        <div className="ai-steps">
          {steps.map((s) => (
            <details key={s.key} className="ai-step" open={s.key === 'overview'}>
              <summary>{s.title}</summary>
              <div className="ai-step-body">
                <p>
                  <em>数据来源：</em>
                  {s.source}
                </p>
                <p>
                  <em>计算过程：</em>
                  {s.process}
                </p>
                <p>
                  <em>结论：</em>
                  {aiText[s.key] ?? s.conclusion}
                  {aiLoading[s.key] && <span className="ai-cursor">▍</span>}
                </p>
                {aiError[s.key] && <p className="ai-error">{aiError[s.key]}</p>}
                {s.key === 'summary' && hasKey && !aiLoading[s.key] && (
                  <button className="range-tab" onClick={() => callAI(s)}>
                    {aiText[s.key] || aiError[s.key] ? '重新生成 AI 解读' : 'AI 生成解读'}
                  </button>
                )}

                <div className="ai-followups">
                  {(followups[s.key] ?? []).map((f, i) => (
                    <div key={i} className="ai-followup">
                      <p className="ai-q">问：{f.q}</p>
                      <p className="ai-a">
                        {f.error ? <span className="ai-error">{f.error}</span> : f.a}
                        {f.loading && <span className="ai-cursor">▍</span>}
                      </p>
                    </div>
                  ))}
                  {hasKey ? (
                    <div className="ai-ask">
                      <input
                        value={question[s.key] ?? ''}
                        onChange={(e) =>
                          setQuestion((m) => ({ ...m, [s.key]: e.target.value }))
                        }
                        placeholder="就本步骤追问 AI…"
                        onKeyDown={(e) => e.key === 'Enter' && ask(s)}
                      />
                      <button className="btn" onClick={() => ask(s)}>
                        追问
                      </button>
                    </div>
                  ) : (
                    <p className="hint">配置 API Key 后可对本步骤追问 AI。</p>
                  )}
                </div>
              </div>
            </details>
          ))}
          <p className="ai-disclaimer">
            彩票开奖为随机事件，本分析仅供参考，不具备预测能力，请理性购彩。
          </p>
        </div>
      )}

      {tipVisible && (
        <div className="ai-modal-mask">
          <div className="ai-modal">
            <h3>使用 AI 分析前须知</h3>
            <p>AI 分析基于历史数据统计，不具备预测能力。</p>
            <p>每期开奖相互独立，任何分析都无法提高中奖概率。</p>
            <button className="btn" onClick={confirmTip}>
              我已了解
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
