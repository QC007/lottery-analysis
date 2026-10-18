import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { BacktestPoint } from '../workers/backtest.worker'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
])

/** 净盈亏曲线（F-03）：支持拖动/缩放查看任意时间点累计数据，支持对比模式多系列 */
export default function BacktestChart({
  series,
}: {
  /** 每条曲线：名称 + 时间升序点位 */
  series: { name: string; points: BacktestPoint[] }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chartRef.current = echarts.init(ref.current)
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || series.length === 0) return
    const xData = series[0].points.map((p) => p.drawNo)
    const colors = ['#e34040', '#3b7cff', '#16a34a']
    chart.setOption(
      {
        tooltip: {
          trigger: 'axis',
          formatter: (ps: Array<{ seriesIndex: number; dataIndex: number }>) => {
            const idx = ps[0]?.dataIndex ?? 0
            const p0 = series[0].points[idx]
            if (!p0) return ''
            const lines = [`${p0.drawNo} 期（${p0.date}）`]
            for (const s of ps) {
              const p = series[s.seriesIndex].points[idx]
              if (p) {
                const tier = p.tierName ? ` · 中${p.tierName}` : ''
                lines.push(
                  `${series[s.seriesIndex].name}：净盈亏 <b>${p.net}</b> 元（投 ${p.invested} / 中 ${p.won}）${tier}`,
                )
              }
            }
            return lines.join('<br/>')
          },
        },
        legend: series.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
        grid: { left: 56, right: 16, top: series.length > 1 ? 30 : 20, bottom: 56 },
        xAxis: {
          type: 'category',
          data: xData,
          axisLabel: { color: '#86909c', fontSize: 10, interval: Math.floor(xData.length / 8) },
          axisLine: { lineStyle: { color: '#e5e6eb' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#86909c', fontSize: 10 },
          splitLine: { lineStyle: { color: '#f0f1f3' } },
        },
        dataZoom: [
          { type: 'inside' },
          { type: 'slider', height: 18, bottom: 8, textStyle: { fontSize: 10 } },
        ],
        series: series.map((s, i) => ({
          name: s.name,
          type: 'line',
          data: s.points.map((p) => p.net),
          symbol: 'none',
          lineStyle: { color: colors[i % colors.length], width: 1.5 },
          itemStyle: { color: colors[i % colors.length] },
          markLine:
            i === 0
              ? {
                  silent: true,
                  symbol: 'none',
                  label: { formatter: '回本线', color: '#86909c', fontSize: 10 },
                  lineStyle: { color: '#16a34a', type: 'dashed' },
                  data: [{ yAxis: 0 }],
                }
              : undefined,
        })),
      },
      true,
    )
  }, [series])

  return <div ref={ref} className="chart" />
}
