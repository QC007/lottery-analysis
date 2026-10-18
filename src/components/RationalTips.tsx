import { useStore } from '../store/useStore'
import { suppress24h } from '../services/rational'

/** F-10 顶部理性提示横幅：温和、可关闭、支持 24h 抑制 */
export default function RationalTips() {
  const tip = useStore((s) => s.rationalTip)
  const dismiss = useStore((s) => s.dismissRationalTip)

  if (!tip) return null

  return (
    <div className="rational-banner" role="status">
      <span>{tip.text}</span>
      <span className="rational-actions">
        <button
          className="rational-btn"
          onClick={() => {
            void suppress24h(tip.key).then(dismiss)
          }}
        >
          24h 内不再提示
        </button>
        <button className="rational-btn" onClick={dismiss}>
          知道了
        </button>
      </span>
    </div>
  )
}
