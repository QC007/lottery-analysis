/** U-2 功能分区导航：开奖 / 走势分析 / 选号工具 / 历史 / 更多（U-10 加内联 SVG 图标） */
import type { ReactNode } from 'react'

export type TabKey = 'home' | 'trend' | 'sim' | 'history' | 'more'

/** U-10 内联 SVG 图标公共属性（手写线条图标，零依赖） */
const ico = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  {
    key: 'home',
    label: '开奖',
    icon: (
      <svg {...ico}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
      </svg>
    ),
  },
  {
    key: 'trend',
    label: '走势分析',
    icon: (
      <svg {...ico}>
        <path d="M3 17l5-6 4 3 7-9" />
        <path d="M16 5h3v3" />
      </svg>
    ),
  },
  {
    key: 'sim',
    label: '选号工具',
    icon: (
      <svg {...ico}>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.8" />
      </svg>
    ),
  },
  {
    key: 'history',
    label: '历史',
    icon: (
      <svg {...ico}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  {
    key: 'more',
    label: '更多',
    icon: (
      <svg {...ico}>
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="19" cy="12" r="1.2" />
      </svg>
    ),
  },
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
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
