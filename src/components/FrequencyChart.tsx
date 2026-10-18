import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { ZoneStats } from '../workers/analysis.worker'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

/** 单区号码频率柱状图（x=号码，y=出现次数） */
export default function FrequencyChart({ zone }: { zone: ZoneStats }) {
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
    const maxCount = Math.max(...zone.numbers.map((s) => s.count), 1)
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const s = zone.numbers[ps[0]?.dataIndex]
          return s
            ? `${zone.name} ${String(s.n).padStart(2, '0')}<br/>出现 <b>${s.count}</b> 次 · 当前遗漏 ${s.currentGap} 期`
            : ''
        },
      },
      grid: { left: 40, right: 12, top: 20, bottom: 24 },
      xAxis: {
        type: 'category',
        data: zone.numbers.map((s) => String(s.n).padStart(2, '0')),
        axisLabel: { color: '#86909c', fontSize: 10 },
        axisLine: { lineStyle: { color: '#e5e6eb' } },
      },
      yAxis: {
        type: 'value',
        max: Math.ceil(maxCount * 1.15),
        axisLabel: { color: '#86909c', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f1f3' } },
      },
      series: [
        {
          type: 'bar',
          data: zone.numbers.map((s) => s.count),
          itemStyle: { color: '#3b7cff', borderRadius: [2, 2, 0, 0] },
          barMaxWidth: 14,
        },
      ],
    })
  }, [zone])

  return <div ref={ref} className="chart chart-sm" />
}
