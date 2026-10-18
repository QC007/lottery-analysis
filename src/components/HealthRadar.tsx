import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { HealthDimension } from '../services/health'

echarts.use([RadarChart, TooltipComponent, LegendComponent, CanvasRenderer])

/** 六维健康度雷达图（F-04） */
export default function HealthRadar({ dimensions }: { dimensions: HealthDimension[] }) {
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
    chart.setOption(
      {
        tooltip: {},
        radar: {
          indicator: dimensions.map((d) => ({ name: d.name, max: 100 })),
          radius: '68%',
          axisName: { color: '#4e5969', fontSize: 12 },
          splitArea: { areaStyle: { color: ['#fff', '#f7f8fa'] } },
          splitLine: { lineStyle: { color: '#e5e6eb' } },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                value: dimensions.map((d) => d.score),
                name: '健康度评分',
                areaStyle: { color: 'rgba(59,124,255,0.25)' },
                lineStyle: { color: '#3b7cff' },
                itemStyle: { color: '#3b7cff' },
              },
            ],
          },
        ],
      },
      true,
    )
  }, [dimensions])

  return <div ref={ref} className="chart chart-sm" />
}
