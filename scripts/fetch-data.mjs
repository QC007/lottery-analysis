#!/usr/bin/env node
/**
 * 彩票开奖数据抓取脚本（GitHub Actions 用，Node 20+，零依赖）
 *
 * 用法：
 *   node scripts/fetch-data.mjs            增量抓取（默认，追上最新即停）
 *   node scripts/fetch-data.mjs --backfill 全量回填（首次运行 / 数据修复）
 *
 * 数据流：官方 API → 校验 → 合并 → data/{彩种}/latest.json（近 100 期）
 *        溢出部分归档 data/{彩种}/{年份}.json → 更新 data/meta.json
 * 任一彩种校验/抓取失败：该彩种不写盘，脚本以非零码退出（工作流据此建 Issue 告警）
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDraw, dedupeAndSort, checkContinuity } from './validate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')

const PAGE_SIZE = 100 // 两官方 API 均实测支持 100（2026-10-18）
const PAGE_DELAY_MS = 400 // 节流，礼貌访问官方接口
const MAX_INCREMENTAL_PAGES = 5 // 增量最多翻 5 页（500 期 ≈ 一年半，超出请 --backfill）
const MAX_BACKFILL_PAGES = 60 // 全量上限 6000 期，覆盖全部历史
const LATEST_KEEP = 100 // latest.json 保留最近 100 期（决策 D-04）
const RETRY = 3
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const backfill = process.argv.includes('--backfill')

const lotteries = JSON.parse(
  await readFile(path.join(ROOT, 'src', 'config', 'lotteries.json'), 'utf8'),
)

main()

async function main() {
  await mkdir(DATA_DIR, { recursive: true })
  console.log(`模式: ${backfill ? '全量回填' : '增量抓取'}\n`)

  const results = []
  let hasFailure = false

  for (const config of Object.values(lotteries)) {
    if (!config.enabled) continue
    try {
      results.push(await syncLottery(config))
    } catch (err) {
      hasFailure = true
      console.error(`❌ [${config.name}] 同步失败: ${err.message}`)
      results.push({ id: config.id, name: config.name, ok: false, error: err.message })
    }
  }

  await writeMeta(results.filter((r) => r.ok))

  console.log('\n==== 同步摘要 ====')
  for (const r of results) {
    console.log(
      r.ok
        ? `✅ ${r.name}: 新增 ${r.added} 期，最近期号 ${r.latestDrawNo}（${r.latestDate}），累计 ${r.total} 期`
        : `❌ ${r.name}: ${r.error}`,
    )
  }
  if (hasFailure) process.exit(1)
}

/** 同步单个彩种：抓取 → 校验 → 合并 → latest/归档写盘 */
async function syncLottery(config) {
  const dir = path.join(DATA_DIR, config.id)
  await mkdir(dir, { recursive: true })

  const existing = await readJson(path.join(dir, 'latest.json'), { draws: [] })
  const known = new Set(existing.draws.map((d) => d.drawNo))

  // ---- 抓取 ----
  const fetched = []
  const rawAll = [] // U-7：本页全部解析结果（含已入库期，供扩展字段补全）
  const maxPages = backfill ? MAX_BACKFILL_PAGES : MAX_INCREMENTAL_PAGES
  for (let page = 1; page <= maxPages; page++) {
    const { list, src } = await fetchPage(config, page)
    if (list.length === 0) break
    rawAll.push(...list)
    const fresh = list.filter((d) => !known.has(d.drawNo))
    fetched.push(...fresh)
    // 单期源（apihz）只抓一页，抓完即停
    if (src.parser === 'apihz') break
    // 增量模式：本页出现已知期号，说明已追上，无需再翻页
    if (!backfill && fresh.length < list.length) break
    await sleep(PAGE_DELAY_MS)
  }

  // ---- U-7 扩展字段补全：官方源（sporttery/cwl）带奖池/销售额，
  //      为已入库但缺字段的同期号记录补上（只补缺失字段，绝不覆盖号码/日期）----
  let extraPatched = false
  const rawMap = new Map(rawAll.map((d) => [d.drawNo, d]))
  for (const d of existing.draws) {
    const raw = rawMap.get(d.drawNo)
    if (!raw) continue
    if (raw.pool !== undefined && d.pool === undefined) {
      d.pool = raw.pool
      extraPatched = true
    }
    if (raw.sales !== undefined && d.sales === undefined) {
      d.sales = raw.sales
      extraPatched = true
    }
  }

  // U-17：备用源（灰鸟/apihz）不含奖池与销售额，最新一期可能缺这两个字段
  const needsExtras = (list) => {
    const d = list[0]
    return !!d && (d.pool === undefined || d.sales === undefined)
  }

  if (fetched.length === 0 && !extraPatched && !needsExtras(existing.draws)) {
    console.log(`[${config.name}] 无新数据`)
  } else {
    if (fetched.length > 0) {
      console.log(`[${config.name}] 抓到 ${fetched.length} 期新数据，校验中…`)

      // ---- 校验：任何一期不合格则整批放弃，保护已有数据 ----
      for (const d of fetched) {
        const { ok, errors } = validateDraw(config, d)
        if (!ok) throw new Error(`数据校验失败 ${d.drawNo}: ${errors.join('; ')}`)
      }
    } else {
      console.log(`[${config.name}] 补全 ${existing.draws.length} 期内已有期的奖池/销售额字段`)
    }

    // ---- 合并 + 连续性告警 ----
    let all = dedupeAndSort([...fetched, ...existing.draws])
    for (const w of checkContinuity(all)) console.warn(`⚠️  [${config.name}] ${w}`)

    // U-17：最新一期若不是来自官方源，再取官方第 1 页补齐奖池/销售额
    if (needsExtras(all)) await fillLatestExtras(config, all[0])

    // ---- 溢出归档（超出近 100 期部分按开奖年份归档）----
    const overflow = all.slice(LATEST_KEEP)
    if (overflow.length > 0) {
      const years = [...new Set(overflow.map((d) => d.date.slice(0, 4)))]
      for (const year of years) {
        const archivePath = path.join(dir, `${year}.json`)
        const archive = await readJson(archivePath, { draws: [] })
        const merged = dedupeAndSort([
          ...overflow.filter((d) => d.date.startsWith(year)),
          ...archive.draws,
        ])
        await writeJson(archivePath, {
          lottery: config.id,
          year: Number(year),
          count: merged.length,
          draws: merged,
        })
      }
      all = all.slice(0, LATEST_KEEP)
    }

    await writeJson(path.join(dir, 'latest.json'), {
      lottery: config.id,
      count: all.length,
      updatedAt: new Date().toISOString(),
      draws: all,
    })
  }

  // ---- 汇总（重读目录，含未变化的归档）----
  const summary = await summarize(config, dir)
  summary.added = fetched.length
  return summary
}

/** 抓取一页数据（带重试 + 多源 fallback），返回 { list, src } */
async function fetchPage(config, pageNo) {
  const sources = Object.values(config.sources).filter((s) => s?.urlTemplate)

  let lastErr
  for (const src of sources) {
    const url = src.urlTemplate
      .replace('{pageNo}', String(pageNo))
      .replace('{pageSize}', String(PAGE_SIZE))

    for (let attempt = 1; attempt <= RETRY; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, ...(src.headers ?? {}) },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { list: parseSource(config, src.parser, await res.json()), src }
      } catch (err) {
        lastErr = err
        if (attempt < RETRY) await sleep(1000 * attempt)
      }
    }
    console.warn(`⚠️  [${config.name}] 源 ${src.parser} 失败: ${lastErr.message}，尝试下一个源`)
  }
  throw new Error(`第 ${pageNo} 页抓取失败: ${lastErr.message}`)
}

/** U-17：为最新一期补全官方源独有的奖池/销售额（备用源无这两字段） */
async function fillLatestExtras(config, target) {
  const sources = Object.values(config.sources).filter(
    (s) => s?.urlTemplate && (s.parser === 'sporttery' || s.parser === 'cwl'),
  )
  for (const src of sources) {
    const url = src.urlTemplate.replace('{pageNo}', '1').replace('{pageSize}', String(PAGE_SIZE))
    for (let attempt = 1; attempt <= RETRY; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, ...(src.headers ?? {}) } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const list = parseSource(config, src.parser, await res.json())
        const hit = list.find((d) => d.drawNo === target.drawNo)
        if (hit) {
          let filled = false
          if (target.pool === undefined && hit.pool !== undefined) {
            target.pool = hit.pool
            filled = true
          }
          if (target.sales === undefined && hit.sales !== undefined) {
            target.sales = hit.sales
            filled = true
          }
          if (filled) {
            console.log(`[${config.name}] 最新期 ${target.drawNo} 已补全奖池/销售额`)
            return
          }
        }
        break
      } catch (err) {
        if (attempt === RETRY) {
          console.warn(`⚠️  [${config.name}] 奖池补全失败(${src.parser}): ${err.message}`)
        } else {
          await sleep(1000 * attempt)
        }
      }
    }
  }
}

/** 期号归一化：7 位彩种若返回 5 位短号（如灰鸟 26118），补 "20" 前缀为 2026118 */
function normDrawNo(config, drawNo) {
  const s = String(drawNo)
  if (config.drawNoPattern.includes('{7}') && s.length === 5) return '20' + s
  return s
}

/** 日期归一化：从 "2026-10-17"、"2026-10-17 21:25:00"、"2026-10-15(四)" 中提取 YYYY-MM-DD */
function normDate(s) {
  const m = String(s ?? '').match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

/** 数值字段归一化："796,723,787.40" → 796723787.4；空/非法 → undefined */
function num(s) {
  if (s === undefined || s === null || s === '') return undefined
  const n = Number(String(s).replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** 按 parser 类型分发解析 */
function parseSource(config, parser, json) {
  if (parser === 'sporttery') {
    // 实测结构：{ value: { list: [{ lotteryDrawNum, lotteryDrawTime, lotteryDrawResult,
    //   poolBalanceAfterdraw: "796,723,787.40", totalSaleAmount: "316,189,166" }] } }
    // U-7：pool=开奖后奖池滚存（元）、sales=本期销售额（元）
    return (json?.value?.list ?? []).map((item) => ({
      drawNo: normDrawNo(config, item.lotteryDrawNum),
      date: normDate(item.lotteryDrawTime),
      zones: splitZones(config, String(item.lotteryDrawResult).trim().split(/\s+/).map(Number)),
      pool: num(item.poolBalanceAfterdraw),
      sales: num(item.totalSaleAmount),
    }))
  }
  if (parser === 'cwl') {
    // 实测结构：{ result: [{ code, date: "2026-10-15(四)", red: "05,21,22,23,28,31", blue: "14",
    //   poolmoney: 7868047916, sales: "364378528" }] }
    // U-7：pool=开奖后奖池（元）、sales=销售额（元）
    return (json?.result ?? []).map((item) => ({
      drawNo: normDrawNo(config, item.code),
      date: normDate(item.date),
      zones: splitZones(
        config,
        [...String(item.red).split(','), ...(item.blue ? [item.blue] : [])].map(Number),
      ),
      pool: num(item.poolmoney ?? item.poolMoneyafterprize),
      sales: num(item.sales),
    }))
  }
  if (parser === 'huiniao') {
    // 实测结构：{ code: 1, data: { data: { list: [{ code, day, one:"02", ..., seven:"12" }] } } }
    // list 元素为对象（早期曾按 "@{...}" 字符串解析，实测确认是对象）
    const list = json?.data?.data?.list ?? []
    return list.map((item) => {
      const f = typeof item === 'string' ? parseHuiniaoString(item) : item
      const nums = [f.one, f.two, f.three, f.four, f.five, f.six, f.seven]
        .filter((v) => v !== undefined && v !== null && v !== '')
        .map(Number)
      return {
        drawNo: normDrawNo(config, f.code),
        date: normDate(f.day),
        zones: splitZones(config, nums),
      }
    })
  }
  if (parser === 'apihz') {
    // 实测结构：{ qihao, time, number: "05|21|22|23|28|31|14" }（单期，无分页）
    const nums = String(json.number).split('|').map(Number)
    return [{
      drawNo: normDrawNo(config, json.qihao),
      date: normDate(json.time),
      zones: splitZones(config, nums),
    }]
  }
  throw new Error(`未知 parser: ${parser}`)
}

/** 兼容灰鸟可能的 "@{code=...; day=...}" 字符串形态 */
function parseHuiniaoString(str) {
  const f = {}
  for (const pair of str.replace(/^@?\{|\}$/g, '').split('; ')) {
    const idx = pair.indexOf('=')
    if (idx > 0) f[pair.slice(0, idx).trim()] = pair.slice(idx + 1)
  }
  return f
}

/** 按配置各 zones 的 pick 依次切分号码；无序区升序存储 */
function splitZones(config, nums) {
  const zones = []
  let idx = 0
  for (const z of config.zones) {
    const slice = nums.slice(idx, idx + z.pick)
    zones.push(z.ordered ? slice : [...slice].sort((a, b) => a - b))
    idx += z.pick
  }
  return zones
}

/** 汇总单个彩种的最新状态（供 meta.json 与摘要使用） */
async function summarize(config, dir) {
  const latest = await readJson(path.join(dir, 'latest.json'), { draws: [] })
  const files = await readdir(dir)
  const archiveYears = files
    .filter((f) => /^\d{4}\.json$/.test(f))
    .map((f) => Number(f.slice(0, 4)))
    .sort((a, b) => b - a)

  let total = latest.draws.length
  for (const y of archiveYears) {
    const a = await readJson(path.join(dir, `${y}.json`), { draws: [] })
    total += a.draws.length
  }

  return {
    id: config.id,
    name: config.name,
    ok: true,
    latestDrawNo: latest.draws[0]?.drawNo ?? null,
    latestDate: latest.draws[0]?.date ?? null,
    /** U-7 水位修订号 = latest.json 的 updatedAt：扩展字段补全会变，前端据此强制重拉 */
    rev: latest.updatedAt ?? null,
    latestCount: latest.draws.length,
    archiveYears,
    total,
  }
}

/** 写 data/meta.json（前端启动时据此判断增量同步） */
async function writeMeta(okResults) {
  const meta = { generatedAt: new Date().toISOString(), lotteries: {} }
  for (const r of okResults) {
    meta.lotteries[r.id] = {
      name: r.name,
      latestDrawNo: r.latestDrawNo,
      latestDate: r.latestDate,
      rev: r.rev,
      latestCount: r.latestCount,
      archiveYears: r.archiveYears,
      totalDraws: r.total,
    }
  }
  await writeJson(path.join(DATA_DIR, 'meta.json'), meta)
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(p, obj) {
  await writeFile(p, JSON.stringify(obj) + '\n')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
