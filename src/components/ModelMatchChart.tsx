import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { ModelEval } from '../services/models'
import { CHART, TOOLTIP_DARK } from '../theme/chart'

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

const COLORS = [CHART.blue, CHART.red, CHART.green, CHART.gold, CHART.purple]

/** 模型匹配柱状图：走前回测平均命中 + 随机基准线（诚实展示"都在基准附近"） */
export default function ModelMatchChart({
  evals,
  baseline,
}: {
  evals: ModelEval[]
  baseline: number
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
    if (!chart || evals.length === 0) return
    chart.setOption(
      {
        tooltip: {
          ...TOOLTIP_DARK,
          trigger: 'axis',
          formatter: (ps: Array<{ dataIndex: number }>) => {
            const e = evals[ps[0]?.dataIndex]
            return e
              ? `${e.name}<br/>平均命中 <b>${e.avgHits}</b>（${e.periods} 期走前回测）<br/>随机基准 ${baseline.toFixed(2)}`
              : ''
          },
        },
        grid: { left: 44, right: 16, top: 30, bottom: 40 },
        xAxis: {
          type: 'category',
          data: evals.map((e) => e.name),
          axisLabel: { color: CHART.text, fontSize: 11, interval: 0, rotate: 20 },
          axisLine: { lineStyle: { color: CHART.axisLine } },
        },
        yAxis: {
          type: 'value',
          min: (v: { min: number }) => Math.max(0, Math.floor(v.min - 0.3)),
          axisLabel: { color: CHART.text, fontSize: 10 },
          splitLine: { lineStyle: { color: CHART.splitLine } },
        },
        series: [
          {
            type: 'bar',
            barWidth: 28,
            data: evals.map((e, i) => ({ value: e.avgHits, itemStyle: { color: COLORS[i % COLORS.length] } })),
            label: { show: true, position: 'top', fontSize: 10, color: CHART.textStrong },
            markLine: {
              silent: true,
              symbol: 'none',
              label: { formatter: `随机基准 ${baseline.toFixed(2)}`, color: CHART.red, fontSize: 10 },
              lineStyle: { color: CHART.red, type: 'dashed' },
              data: [{ yAxis: Math.round(baseline * 1000) / 1000 }],
            },
          },
        ],
      },
      true,
    )
  }, [evals, baseline])

  return <div ref={ref} className="chart chart-sm" />
}
