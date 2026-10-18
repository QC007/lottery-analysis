/**
 * U-3 触控友好期数选择器（替代 U-1c PeriodSlider）
 *
 * 设计依据：手机手指操作 —— 大触控目标（≥40px）、无精细拖拽：
 *  ① 快捷范围 chips：一键选「近 N 期 / 全部」（锚定最新一期）
 *  ② 大步进按钮组：−10 / −1 / +1 / +10 平移窗口（dual 模式整体平移保持窗口大小；
 *     single 模式仅移动起点，终点固定为最新一期）
 *
 * 位置语义与 PeriodSlider 一致：0 = 最旧，count-1 = 最新
 */
export default function PeriodPicker({
  count,
  value,
  single = false,
  minGap = 1,
  chips = [30, 50, 100, 200],
  format,
  onChange,
}: {
  /** 本地总期数（需 ≥ minGap+1，否则不渲染） */
  count: number
  /** [lo, hi] 当前窗口位置（0=最旧） */
  value: [number, number]
  /** 单起点模式：hi 固定为 count-1，仅 lo 可调（回溯模拟起点） */
  single?: boolean
  /** 两端最小间隔（默认 1，即窗口至少 2 期） */
  minGap?: number
  /** 快捷窗口大小（期）；自动追加「全部」 */
  chips?: number[]
  /** 位置 → 展示文本（期号） */
  format: (pos: number) => string
  onChange: (v: [number, number]) => void
}) {
  const max = count - 1
  if (max < minGap) return null
  const [lo, hi] = value
  const size = hi - lo + 1

  /** chips：锚定最新一期，窗口大小 = n */
  const anchorLatest = (n: number) => {
    const l = Math.max(0, Math.min(max - n + 1, max - minGap))
    onChange([l, max])
  }

  /** 步进：dual 整体平移（保持窗口大小，触边即止）；single 仅移起点 */
  const shift = (delta: number) => {
    if (single) {
      const l = Math.max(0, Math.min(lo + delta, hi - minGap))
      if (l !== lo) onChange([l, hi])
    } else {
      const d = delta < 0 ? Math.max(delta, -lo) : Math.min(delta, max - hi)
      if (d !== 0) onChange([lo + d, hi + d])
    }
  }

  const chipActive = (n: number) => hi === max && size === Math.min(n, count)
  const allActive = lo === 0 && hi === max
  const canOlder = lo > 0
  const canNewer = single ? lo < hi - minGap : hi < max

  return (
    <div className="ppicker">
      <div className="pp-chips" role="group" aria-label="快捷期数范围">
        {chips
          .filter((n) => n < count)
          .map((n) => (
            <button
              key={n}
              type="button"
              className={`pp-chip${chipActive(n) ? ' is-active' : ''}`}
              onClick={() => anchorLatest(n)}
            >
              近{n}期
            </button>
          ))}
        <button
          type="button"
          className={`pp-chip${allActive ? ' is-active' : ''}`}
          onClick={() => onChange([0, max])}
        >
          全部
        </button>
      </div>
      <div className="pp-stepper">
        <div className="pp-btns">
          <button
            type="button"
            className="pp-btn"
            disabled={!canOlder}
            onClick={() => shift(-10)}
            aria-label={single ? '起点向更早 10 期' : '窗口向更早 10 期'}
          >
            −10
          </button>
          <button
            type="button"
            className="pp-btn"
            disabled={!canOlder}
            onClick={() => shift(-1)}
            aria-label={single ? '起点向更早 1 期' : '窗口向更早 1 期'}
          >
            −1
          </button>
        </div>
        <div className="pp-info">
          <span className="pp-range">
            <b>{format(lo)}</b>
            {single ? ' 起' : ` ~ `}
            {!single && <b>{format(hi)}</b>}
          </span>
          <span className="pp-count">共 {size} 期</span>
        </div>
        <div className="pp-btns">
          <button
            type="button"
            className="pp-btn"
            disabled={!canNewer}
            onClick={() => shift(1)}
            aria-label={single ? '起点向更近 1 期' : '窗口向更近 1 期'}
          >
            +1
          </button>
          <button
            type="button"
            className="pp-btn"
            disabled={!canNewer}
            onClick={() => shift(10)}
            aria-label={single ? '起点向更近 10 期' : '窗口向更近 10 期'}
          >
            +10
          </button>
        </div>
      </div>
    </div>
  )
}
