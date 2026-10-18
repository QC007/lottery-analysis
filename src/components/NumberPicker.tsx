import type { LotteryZone } from '../config/lotteries'

/**
 * 选号增删纯函数（父组件在函数式 setState 中调用，保证基于最新状态）：
 * 已选 → 移除；未满上限 → 加入并升序；已满且未选 → 不变。
 */
export function togglePick(cur: number[], n: number, pick: number): number[] {
  if (cur.includes(n)) return cur.filter((x) => x !== n)
  if (cur.length < pick) return [...cur, n].sort((a, b) => a - b)
  return cur
}

/**
 * 通用号码选择器（F-03 回溯模拟 / F-04 健康度诊断共用）
 * 受控组件：仅上报被点击的号码，增删逻辑由父组件用函数式 setState 完成
 * （避免连续快速点击时闭包内 selected 快照过期导致选号丢失）。
 */
export default function NumberPicker({
  zone,
  selected,
  onToggle,
}: {
  zone: LotteryZone
  /** 已选号码（升序） */
  selected: number[]
  onToggle: (n: number) => void
}) {
  const nums: number[] = []
  for (let n = zone.min; n <= zone.max; n++) nums.push(n)

  const colorClass =
    zone.key === 'red' || zone.key === 'front'
      ? 'pick-red'
      : zone.key === 'blue' || zone.key === 'back'
        ? 'pick-blue'
        : 'pick-gray'

  return (
    <div className="picker">
      <div className="picker-head">
        <span className="zone-name">{zone.name}</span>
        <span className="hint">
          选 {zone.pick} 个（已选 {selected.length}/{zone.pick}）
        </span>
      </div>
      <div className="picker-grid">
        {nums.map((n) => {
          const on = selected.includes(n)
          const full = !on && selected.length >= zone.pick
          return (
            <button
              key={n}
              type="button"
              className={`pick-ball ${colorClass}${on ? ' is-on' : ''}${full ? ' is-off' : ''}`}
              onClick={() => onToggle(n)}
            >
              {String(n).padStart(2, '0')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
