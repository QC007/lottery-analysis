/**
 * 开奖数据校验模块（纯 ESM、零依赖、无 Node API）
 * 复用方：
 *   ① scripts/fetch-data.mjs —— GitHub Actions 抓取入库前校验
 *   ② 前端手动 CSV 导入（第 5 批）—— 浏览器端同一套校验
 * 统一开奖对象：{ drawNo: string, date: 'YYYY-MM-DD', zones: number[][] }
 */

/**
 * 校验单期开奖数据
 * @param {object} config 彩种配置（lotteries.json 中的一项）
 * @param {object} draw   统一开奖对象
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDraw(config, draw) {
  const errors = []

  if (!draw || typeof draw !== 'object') {
    return { ok: false, errors: ['记录不是对象'] }
  }

  // 期号格式（双色球 7 位 / 大乐透 5 位，见 config.drawNoPattern）
  if (!new RegExp(config.drawNoPattern).test(String(draw.drawNo ?? ''))) {
    errors.push(`期号格式非法: "${draw.drawNo}"（期望匹配 ${config.drawNoPattern}）`)
  }

  // 日期合法且真实存在
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(draw.date ?? '')) ||
    Number.isNaN(Date.parse(draw.date))
  ) {
    errors.push(`开奖日期非法: "${draw.date}"`)
  }

  // 号码区
  if (!Array.isArray(draw.zones) || draw.zones.length !== config.zones.length) {
    errors.push(`号码区数量不符: 期望 ${config.zones.length} 区，实际 ${draw.zones?.length ?? 0} 区`)
  } else {
    config.zones.forEach((zone, i) => {
      const nums = draw.zones[i]
      if (!Array.isArray(nums) || nums.length !== zone.pick) {
        errors.push(`「${zone.name}」应开 ${zone.pick} 个号，实际 ${nums?.length ?? 0} 个`)
        return
      }
      for (const n of nums) {
        if (!Number.isInteger(n) || n < zone.min || n > zone.max) {
          errors.push(`「${zone.name}」号码越界: ${n}（合法范围 ${zone.min}-${zone.max}）`)
        }
      }
      // 无序区不允许同区重号（有序区如排列三允许，如 1 1 2）
      if (!zone.ordered && new Set(nums).size !== nums.length) {
        errors.push(`「${zone.name}」存在重复号码: ${nums.join(',')}`)
      }
    })
  }

  return { ok: errors.length === 0, errors }
}

/**
 * 按 drawNo 降序排序并去重（同 drawNo 保留先出现者）
 * @param {Array} draws
 * @returns {Array}
 */
export function dedupeAndSort(draws) {
  const seen = new Set()
  return draws
    .filter((d) => {
      if (seen.has(d.drawNo)) return false
      seen.add(d.drawNo)
      return true
    })
    .sort((a, b) => (a.drawNo < b.drawNo ? 1 : a.drawNo > b.drawNo ? -1 : 0))
}

/**
 * 期号连续性检查（入参须为降序数组）：同年份内序号应逐期差 1
 * 仅告警不阻断（官方可能临时取消某期开奖）
 * @returns {string[]} 告警信息列表
 */
export function checkContinuity(draws) {
  const warnings = []
  for (let i = 0; i < draws.length - 1; i++) {
    const cur = parseDrawNo(draws[i].drawNo)
    const next = parseDrawNo(draws[i + 1].drawNo)
    if (cur.yearPart === next.yearPart && cur.serial - next.serial !== 1) {
      warnings.push(
        `期号不连续: ${draws[i].drawNo} 与 ${draws[i + 1].drawNo} 之间缺失 ${cur.serial - next.serial - 1} 期`,
      )
    }
  }
  return warnings
}

/**
 * 期号解析：7 位 = 4 位年 + 3 位序号（双色球/3D/七乐彩）
 *          5 位 = 2 位年 + 3 位序号（大乐透/排列三）
 */
function parseDrawNo(drawNo) {
  const s = String(drawNo)
  if (s.length === 7) return { yearPart: s.slice(0, 4), serial: Number(s.slice(4)) }
  return { yearPart: s.slice(0, 2), serial: Number(s.slice(2)) }
}

/**
 * 解析 CSV 行（前端手动导入用，第 5 批）
 * 模板：期号,开奖日期,号1,号2,...,号N（号码按配置 zones 顺序展开）
 * @param {object} config 彩种配置
 * @param {string[]} fields 已按逗号切分的字段
 * @returns {{ drawNo: string, date: string, zones: number[][] }}
 */
export function parseCsvRow(config, fields) {
  const [drawNo, date, ...rest] = fields.map((s) => String(s).trim())
  const zones = []
  let idx = 0
  for (const zone of config.zones) {
    const nums = rest.slice(idx, idx + zone.pick).map(Number)
    zones.push(zone.ordered ? nums : nums.sort((a, b) => a - b))
    idx += zone.pick
  }
  return { drawNo, date, zones }
}
