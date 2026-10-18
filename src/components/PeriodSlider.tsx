/**
 * U-1c 期数范围滑动条
 * - 双手柄模式：左柄=起始期（较旧），右柄=截止期（较新）
 * - 单手柄模式（single）：仅起点可调，终点固定为最新一期
 * - 两端箭头单步 ±1 期；位置语义：0 = 最旧，count-1 = 最新
 */
export default function PeriodSlider({
  count,
  value,
  single = false,
  minGap = 1,
  format,
  onChange,
}: {
  /** 本地总期数（需 ≥ minGap+1，否则不渲染） */
  count: number
  /** [lo, hi] 当前窗口位置（0=最旧） */
  value: [number, number]
  /** 单手柄模式：hi 固定为 count-1，仅 lo 可调 */
  single?: boolean
  /** 两手柄最小间隔（默认 1，即窗口至少 2 期） */
  minGap?: number
  /** 位置 → 展示文本（期号） */
  format: (pos: number) => string
  onChange: (v: [number, number]) => void
}) {
  const max = count - 1
  if (max < minGap) return null
  const [lo, hi] = value
  const clamp = (p: number) => Math.min(max, Math.max(0, p))
  const setLo = (p: number) => onChange([Math.min(clamp(p), hi - minGap), hi])
  const setHi = (p: number) => onChange([lo, Math.max(clamp(p), lo + minGap)])
  const pct = (p: number) => `${(p / max) * 100}%`

  return (
    <div className="pslider">
      <div className="ps-row">
        <div className="ps-arrows">
          {single ? (
            <button
              type="button"
              className="ps-arrow"
              aria-label="起点向更早一期"
              disabled={lo <= 0}
              onClick={() => setLo(lo - 1)}
            >
              ‹
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ps-arrow"
                aria-label="起点向更早一期"
                disabled={lo <= 0}
                onClick={() => setLo(lo - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="ps-arrow"
                aria-label="起点向更近一期"
                disabled={lo >= hi - minGap}
                onClick={() => setLo(lo + 1)}
              >
                ›
              </button>
            </>
          )}
        </div>
        <div className="ps-track">
          <div className="ps-rail" />
          <div className="ps-fill" style={{ left: pct(lo), width: pct(hi - lo) }} />
          <input
            type="range"
            min={0}
            max={max}
            value={lo}
            aria-label="起点期"
            onChange={(e) => setLo(Number(e.target.value))}
          />
          {!single && (
            <input
              type="range"
              min={0}
              max={max}
              value={hi}
              aria-label="终点期"
              onChange={(e) => setHi(Number(e.target.value))}
            />
          )}
        </div>
        <div className="ps-arrows">
          {single ? (
            <button
              type="button"
              className="ps-arrow"
              aria-label="起点向更近一期"
              disabled={lo >= hi - minGap}
              onClick={() => setLo(lo + 1)}
            >
              ›
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ps-arrow"
                aria-label="终点向更早一期"
                disabled={hi <= lo + minGap}
                onClick={() => setHi(hi - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="ps-arrow"
                aria-label="终点向更近一期"
                disabled={hi >= max}
                onClick={() => setHi(hi + 1)}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>
      <div className="ps-labels">
        <span>
          起 <b>{format(lo)}</b>
        </span>
        <span className="ps-count">共 {hi - lo + 1} 期</span>
        <span>
          {single ? '至最新 ' : '止 '}
          <b>{format(hi)}</b>
        </span>
      </div>
    </div>
  )
}
