/** U-2 功能分区导航：开奖 / 走势分析 / 选号工具 / 历史 / 更多 */
export type TabKey = 'home' | 'trend' | 'sim' | 'history' | 'more'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: '开奖' },
  { key: 'trend', label: '走势分析' },
  { key: 'sim', label: '选号工具' },
  { key: 'history', label: '历史' },
  { key: 'more', label: '更多' },
]

export default function NavTabs({
  tab,
  onChange,
}: {
  tab: TabKey
  onChange: (t: TabKey) => void
}) {
  return (
    <nav className="fn-tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`fn-tab${t.key === tab ? ' is-active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
