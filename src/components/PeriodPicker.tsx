import { useRef, useState } from 'react'

/**
 * U-4 期数选择器（三合一触控控件）
 *  ① 快捷范围 chips：一键选「近 N 期 / 全部」（锚定最新一期）
 *  ② 自定义滑动条：轨道任意位置按下，距触点最近的手柄吸附到触点并继续拖动
 *     —— 解决 U-1c 原生双 range「上层 input 拦截点击、双手柄接近时点不中目标手柄」的缺陷；
 *     整条轨道 44px 高均为触控热区，触屏 touch-action:none 防止拖动时页面滚动
 *  ③ 大步进按钮组（U-7 改为单端微调）：−10 / −1 / +1 / +10 微调「当前目标手柄」
 *     （不再是整窗平移）；目标 = 最近点按/拖动的手柄，也可点「微调起点/终点」直接切换，
 *     目标手柄带高亮描边；single 模式终点固定为最新一期，恒微调起点
 *
 * 位置语义与 U-1c PeriodSlider 一致：0 = 最旧，count-1 = 最新
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
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'lo' | 'hi' | null>(null)
  /** U-7 步进微调目标手柄（最近点按/拖动者；single 恒 lo） */
  const [target, setTarget] = useState<'lo' | 'hi'>('lo')

  const [lo, hi] = value
  const size = hi - lo + 1
  const stepTarget: 'lo' | 'hi' = single ? 'lo' : target

  /** chips：锚定最新一期，窗口大小 = n */
  const anchorLatest = (n: number) => {
    const l = Math.max(0, Math.min(max - n + 1, max - minGap))
    onChange([l, max])
  }

  /** U-7 步进：微调当前目标手柄 ±N 期（非整窗平移；越界自动夹取，无变化不上报） */
  const nudge = (delta: number) => {
    applyPos(stepTarget, (stepTarget === 'lo' ? lo : hi) + delta)
  }

  /* ---------------- 滑动条 ---------------- */

  const pct = (p: number) => `${(p / max) * 100}%`

  /** 触点 clientX → 位置（0..max，四舍五入取整） */
  const posFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const ratio = r.width > 0 ? (clientX - r.left) / r.width : 0
    return Math.max(0, Math.min(max, Math.round(ratio * max)))
  }

  /** 把手柄移动到指定位置（自动夹取边界与 minGap；无变化不上报） */
  const applyPos = (which: 'lo' | 'hi', p: number) => {
    if (single || which === 'lo') {
      const v = Math.max(0, Math.min(p, hi - minGap))
      if (v !== lo) onChange([v, hi])
    } else {
      const v = Math.min(max, Math.max(p, lo + minGap))
      if (v !== hi) onChange([lo, v])
    }
  }

  /** 距触点最近的手柄（single 模式唯一手柄）；等距时取左柄 */
  const nearestHandle = (p: number): 'lo' | 'hi' => {
    if (single) return 'lo'
    return Math.abs(p - lo) <= Math.abs(p - hi) ? 'lo' : 'hi'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const which = nearestHandle(posFromClientX(e.clientX))
    setDragging(which)
    setTarget(which) // U-7：点按/拖动的手柄成为步进微调目标
    // 最近手柄吸附到触点（点轨道即移动最近手柄）
    applyPos(which, posFromClientX(e.clientX))
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 极少数环境不支持捕获，拖动仍可用，只是滑出轨道会中断 */
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    applyPos(dragging, posFromClientX(e.clientX))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(null)
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* 已释放 */
    }
  }

  /** 键盘微调（无障碍）：←/→ 移动 1 期 */
  const onHandleKey = (e: React.KeyboardEvent, which: 'lo' | 'hi') => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    e.preventDefault()
    applyPos(which, (which === 'lo' ? lo : hi) + step)
  }

  if (max < minGap) return null

  const chipActive = (n: number) => hi === max && size === Math.min(n, count)
  const allActive = lo === 0 && hi === max
  // U-7：步进按钮是否可用取决于目标手柄能否向该方向移动
  const canOlder = stepTarget === 'lo' ? lo > 0 : hi > lo + minGap
  const canNewer = stepTarget === 'lo' ? lo < hi - minGap : hi < max
  const targetLabel = stepTarget === 'lo' ? '起点' : '终点'

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

      <div
        ref={trackRef}
        className="pp-slider"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="pp-rail" />
        <div className="pp-fill" style={{ left: pct(lo), width: pct(hi - lo) }} />
        <div
          className={`pp-handle${dragging === 'lo' ? ' is-drag' : ''}${stepTarget === 'lo' ? ' is-target' : ''}`}
          style={{ left: pct(lo) }}
          role="slider"
          tabIndex={0}
          aria-label={single ? '起点期' : '起点期（较早；步进微调目标）'}
          aria-valuemin={0}
          aria-valuemax={hi - minGap}
          aria-valuenow={lo}
          aria-valuetext={format(lo)}
          onKeyDown={(e) => onHandleKey(e, 'lo')}
        />
        {!single && (
          <div
            className={`pp-handle${dragging === 'hi' ? ' is-drag' : ''}${stepTarget === 'hi' ? ' is-target' : ''}`}
            style={{ left: pct(hi) }}
            role="slider"
            tabIndex={0}
            aria-label="终点期（较新；步进微调目标）"
            aria-valuemin={lo + minGap}
            aria-valuemax={max}
            aria-valuenow={hi}
            aria-valuetext={format(hi)}
            onKeyDown={(e) => onHandleKey(e, 'hi')}
          />
        )}
      </div>

      {!single && (
        <div className="pp-targets" role="group" aria-label="步进微调目标">
          <button
            type="button"
            className={`pp-target${stepTarget === 'lo' ? ' is-active' : ''}`}
            onClick={() => setTarget('lo')}
          >
            微调起点
          </button>
          <button
            type="button"
            className={`pp-target${stepTarget === 'hi' ? ' is-active' : ''}`}
            onClick={() => setTarget('hi')}
          >
            微调终点
          </button>
        </div>
      )}

      <div className="pp-stepper">
        <div className="pp-btns">
          <button
            type="button"
            className="pp-btn"
            disabled={!canOlder}
            onClick={() => nudge(-10)}
            aria-label={`${targetLabel}向更早 10 期`}
          >
            −10
          </button>
          <button
            type="button"
            className="pp-btn"
            disabled={!canOlder}
            onClick={() => nudge(-1)}
            aria-label={`${targetLabel}向更早 1 期`}
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
            onClick={() => nudge(1)}
            aria-label={`${targetLabel}向更近 1 期`}
          >
            +1
          </button>
          <button
            type="button"
            className="pp-btn"
            disabled={!canNewer}
            onClick={() => nudge(10)}
            aria-label={`${targetLabel}向更近 10 期`}
          >
            +10
          </button>
        </div>
      </div>
    </div>
  )
}
