/**
 * U-1b 深色大屏统一图表配色（与 index.css 的 CSS 变量保持一致）
 * 所有 ECharts 图表的轴/网格/系列颜色统一从这里取，避免散落硬编码。
 */
export const CHART = {
  /** 轴标签、次要文字 */
  text: '#8b949e',
  /** 强调文字（图表内 label） */
  textStrong: '#e6edf3',
  /** 轴线 */
  axisLine: '#30363d',
  /** 网格分割线 */
  splitLine: '#21262d',
  /** 主蓝（折线/柱/雷达） */
  blue: '#58a6ff',
  /** 金色（均值线/高亮） */
  gold: '#e3b341',
  /** 红（亏损/热） */
  red: '#f85149',
  /** 绿（盈利/回本线） */
  green: '#3fb950',
  /** 橙（警告） */
  orange: '#f0883e',
  /** 紫（多系列辅助） */
  purple: '#bc8cff',
} as const

/** 深色 tooltip 公共样式（各图表 spread 进 tooltip 配置） */
export const TOOLTIP_DARK = {
  backgroundColor: '#1c2129',
  borderColor: '#30363d',
  textStyle: { color: '#e6edf3', fontSize: 12 },
  extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.4); border-radius: 6px;',
} as const

/** 深色 dataZoom slider 公共样式 */
export const DATAZOOM_SLIDER_DARK = {
  height: 16,
  bottom: 6,
  borderColor: '#30363d',
  backgroundColor: '#161b22',
  fillerColor: 'rgba(88,166,255,0.18)',
  handleStyle: { color: '#58a6ff', borderColor: '#58a6ff' },
  moveHandleStyle: { color: '#30363d' },
  emphasis: { handleStyle: { color: '#79c0ff' } },
  dataBackground: {
    lineStyle: { color: '#30363d' },
    areaStyle: { color: 'rgba(88,166,255,0.06)' },
  },
  selectedDataBackground: {
    lineStyle: { color: '#58a6ff' },
    areaStyle: { color: 'rgba(88,166,255,0.12)' },
  },
  textStyle: { color: '#8b949e', fontSize: 10 },
} as const
