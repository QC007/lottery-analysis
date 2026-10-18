import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { HealthDimension } from '../services/health'
import { CHART, TOOLTIP_DARK } from '../theme/chart'

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
        tooltip: { ...TOOLTIP_DARK },
        radar: {
          indicator: dimensions.map((d) => ({ name: d.name, max: 100 })),
          radius: '68%',
          axisName: { color: CHART.text, fontSize: 12 },
          splitArea: { areaStyle: { color: ['rgba(88,166,255,0.04)', 'transparent'] } },
          splitLine: { lineStyle: { color: CHART.axisLine } },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                value: dimensions.map((d) => d.score),
                name: '健康度评分',
                areaStyle: { color: 'rgba(88,166,255,0.22)' },
                lineStyle: { color: CHART.blue },
                itemStyle: { color: CHART.blue },
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
