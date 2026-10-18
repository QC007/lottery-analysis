import type { ZoneStats } from '../workers/analysis.worker'

/** 遗漏表：号码 / 出现次数 / 当前遗漏 / 最大遗漏 / 平均间隔 */
export default function OmissionTable({ zone }: { zone: ZoneStats }) {
  // 按当前遗漏降序（久未开的排前面）
  const rows = [...zone.numbers].sort((a, b) => b.currentGap - a.currentGap)
  return (
    <div className="omission-wrap">
      <h3>{zone.name}遗漏</h3>
      <table className="omission-table">
        <thead>
          <tr>
            <th>号码</th>
            <th>出现</th>
            <th>当前遗漏</th>
            <th>最大遗漏</th>
            <th>平均间隔</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.n}>
              <td>{String(s.n).padStart(2, '0')}</td>
              <td>{s.count}</td>
              <td className={s.currentGap >= s.maxGap * 0.8 ? 'gap-hot' : ''}>{s.currentGap}</td>
              <td>{s.maxGap}</td>
              <td>{s.avgGap}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
