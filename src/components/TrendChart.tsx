import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { SumPoint } from '../workers/analysis.worker'

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

/** 主区和值走势折线图（支持框选缩放） */
export default function TrendChart({ points }: { points: SumPoint[] }) {
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
    if (!chart) return
    const avg = points.reduce((s, p) => s + p.sum, 0) / (points.length || 1)
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const p = points[ps[0]?.dataIndex]
          return p ? `${p.drawNo} 期<br/>${p.date}<br/>和值 <b>${p.sum}</b>` : ''
        },
      },
      grid: { left: 44, right: 16, top: 28, bottom: 52 },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.drawNo),
        axisLabel: { color: '#86909c', fontSize: 10, interval: Math.floor(points.length / 8) },
        axisLine: { lineStyle: { color: '#e5e6eb' } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#86909c', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f1f3' } },
      },
      dataZoom: [{ type: 'inside' }],
      series: [
        {
          type: 'line',
          data: points.map((p) => p.sum),
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#3b7cff', width: 1.5 },
          itemStyle: { color: '#3b7cff' },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { formatter: '均值 {c}', color: '#86909c', fontSize: 10 },
            lineStyle: { color: '#ff9a2e', type: 'dashed' },
            data: [{ yAxis: Math.round(avg * 10) / 10 }],
          },
        },
      ],
    })
  }, [points])

  return <div ref={ref} className="chart" />
}
