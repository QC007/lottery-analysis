import { useRef, useState } from 'react'
import type { Draw, LotteryConfig } from '../config/lotteries'
import { db } from '../db/db'
import {
  checkContinuity,
  dedupeAndSort,
  parseCsvRow,
  validateDraw,
} from '../../scripts/validate.mjs'

interface ParseResult {
  valid: Draw[]
  errors: string[]
  warnings: string[]
}

/**
 * 手动 CSV 导入（D-06 兜底链路最后一环）
 * 校验复用 scripts/validate.mjs（与 GitHub Actions 抓取同一套），upsert 语义不删除已有数据。
 */
export default function ImportCard({ config }: { config: LotteryConfig }) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const configId = config.id

  const downloadTemplate = () => {
    const header = [
      '期号',
      '开奖日期',
      ...config.zones.flatMap((z) => Array.from({ length: z.pick }, (_, i) => `${z.name}${i + 1}`)),
    ]
    const sampleNums = config.zones.flatMap((z) => {
      const out: number[] = []
      for (let k = 0; k < z.pick; k++) out.push(z.min + k)
      return out
    })
    const sampleNo = config.drawNoPattern.includes('{7}') || config.id === 'ssq' ? '2026001' : '26001'
    const csv = `\ufeff${[header.join(','), [sampleNo, '2026-01-01', ...sampleNums].join(',')].join('\r\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `导入模板-${config.name}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const parse = () => {
    setMsg('')
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('期号')) // 跳过模板表头
    if (lines.length === 0) {
      setParsed(null)
      setMsg('请先粘贴或选择 CSV 内容')
      return
    }
    const valid: Draw[] = []
    const errors: string[] = []
    lines.forEach((line, i) => {
      const fields = line.split(',').map((s) => s.trim())
      const draw = parseCsvRow(config, fields)
      const { ok, errors: errs } = validateDraw(config, draw)
      if (ok) valid.push(draw)
      else errors.push(`第 ${i + 1} 行：${errs.join('；')}`)
    })
    const deduped = dedupeAndSort(valid)
    const warnings = checkContinuity(deduped)
    setParsed({ valid: deduped, errors, warnings })
  }

  const doImport = async () => {
    if (!parsed || parsed.valid.length === 0) return
    const existed = await db.draws.bulkGet(
      parsed.valid.map((d) => [configId, d.drawNo] as [string, string]),
    )
    const overwrite = existed.filter(Boolean).length
    await db.draws.bulkPut(parsed.valid.map((d) => ({ lottery: configId, ...d })))
    setMsg(
      `导入完成：新增 ${parsed.valid.length - overwrite} 期，覆盖更新 ${overwrite} 期（upsert 不删除已有数据）`,
    )
    setParsed(null)
    setText('')
  }

  const onFile = async (f: File) => {
    const t = await f.text()
    setText(t)
  }

  return (
    <section className="card">
      <h2>手动导入数据</h2>
      <p className="hint">
        自动同步失效时的备用通道：下载模板、填入官方开奖号码后导入。校验规则与自动抓取一致；
        导入只增不删，已有期号会被覆盖更新。
      </p>
      <div className="import-actions">
        <button className="range-tab" onClick={downloadTemplate}>
          下载 CSV 模板
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        <button className="range-tab" onClick={() => fileRef.current?.click()}>
          选择 CSV 文件
        </button>
        <button className="range-tab" onClick={() => setText('')}>
          清空
        </button>
      </div>
      <textarea
        className="import-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`也可直接粘贴 CSV 内容，每行一期：\n期号,开奖日期,${config.zones
          .map((z) => `${z.name}×${z.pick}`)
          .join(',')}`}
        rows={5}
      />
      <div className="import-actions">
        <button className="btn" onClick={parse}>
          解析并校验
        </button>
        {parsed && parsed.valid.length > 0 && !parsed.errors.length && (
          <button className="btn" onClick={doImport}>
            确认导入 {parsed.valid.length} 期
          </button>
        )}
      </div>

      {parsed && (
        <div className="import-result">
          <p className="hint">
            校验通过 <b>{parsed.valid.length}</b> 期，错误 <b>{parsed.errors.length}</b> 行
            {parsed.warnings.length > 0 && `，连续性告警 ${parsed.warnings.length} 条`}
          </p>
          {parsed.errors.slice(0, 5).map((e) => (
            <p className="ai-error" key={e}>
              {e}
            </p>
          ))}
          {parsed.errors.length > 5 && <p className="ai-error">…共 {parsed.errors.length} 条错误，已显示前 5 条</p>}
          {parsed.warnings.slice(0, 3).map((w) => (
            <p className="hint" key={w}>
              ⚠ {w}
            </p>
          ))}
          {parsed.valid.length > 0 && parsed.errors.length > 0 && (
            <p className="hint">修正错误行后可再次解析；当前仅可导入通过校验的 {parsed.valid.length} 期。</p>
          )}
        </div>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}
