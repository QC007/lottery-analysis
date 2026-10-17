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
  const maxPages = backfill ? MAX_BACKFILL_PAGES : MAX_INCREMENTAL_PAGES
  for (let page = 1; page <= maxPages; page++) {
    const list = await fetchPage(config, page)
    if (list.length === 0) break
    const fresh = list.filter((d) => !known.has(d.drawNo))
    fetched.push(...fresh)
    // 增量模式：本页出现已知期号，说明已追上，无需再翻页
    if (!backfill && fresh.length < list.length) break
    await sleep(PAGE_DELAY_MS)
  }

  if (fetched.length === 0) {
    console.log(`[${config.name}] 无新数据`)
  } else {
    console.log(`[${config.name}] 抓到 ${fetched.length} 期新数据，校验中…`)

    // ---- 校验：任何一期不合格则整批放弃，保护已有数据 ----
    for (const d of fetched) {
      const { ok, errors } = validateDraw(config, d)
      if (!ok) throw new Error(`数据校验失败 ${d.drawNo}: ${errors.join('; ')}`)
    }

    // ---- 合并 + 连续性告警 ----
    let all = dedupeAndSort([...fetched, ...existing.draws])
    for (const w of checkContinuity(all)) console.warn(`⚠️  [${config.name}] ${w}`)

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

/** 抓取一页官方数据（带重试），返回统一开奖对象数组 */
async function fetchPage(config, pageNo) {
  const src = config.sources.official
  const url = src.urlTemplate
    .replace('{pageNo}', String(pageNo))
    .replace('{pageSize}', String(PAGE_SIZE))

  let lastErr
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...(src.headers ?? {}) },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return parseOfficial(config, await res.json())
    } catch (err) {
      lastErr = err
      if (attempt < RETRY) await sleep(1000 * attempt)
    }
  }
  throw new Error(`第 ${pageNo} 页抓取失败: ${lastErr.message}`)
}

/** 官方响应 → 统一开奖对象 */
function parseOfficial(config, json) {
  if (config.sources.official.parser === 'sporttery') {
    // 实测结构：{ value: { list: [{ lotteryDrawNum, lotteryDrawTime, lotteryDrawResult: "02 09 21 26 32 06 12" }] } }
    return (json?.value?.list ?? []).map((item) => ({
      drawNo: String(item.lotteryDrawNum),
      date: String(item.lotteryDrawTime),
      zones: splitZones(config, String(item.lotteryDrawResult).trim().split(/\s+/).map(Number)),
    }))
  }
  // cwl 实测结构：{ result: [{ code, date: "2026-10-15(四)", red: "05,21,22,23,28,31", blue: "14" }] }
  return (json?.result ?? []).map((item) => ({
    drawNo: String(item.code),
    date: String(item.date).slice(0, 10),
    zones: splitZones(
      config,
      [...String(item.red).split(','), ...(item.blue ? [item.blue] : [])].map(Number),
    ),
  }))
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
