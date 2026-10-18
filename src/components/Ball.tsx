import type { LotteryZone } from '../config/lotteries'

/** 按区决定球色：红球/前区→红，蓝球/后区→蓝，数字区→灰 */
export function ballColorClass(zone: LotteryZone): string {
  if (zone.key === 'red' || zone.key === 'front') return 'ball-red'
  if (zone.key === 'blue' || zone.key === 'back') return 'ball-blue'
  return 'ball-gray'
}

export function Ball({ zone, n }: { zone: LotteryZone; n: number }) {
  return <span className={`ball ${ballColorClass(zone)}`}>{String(n).padStart(2, '0')}</span>
}
