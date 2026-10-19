import Lottie from 'lottie-light-react'
import flameData from '../assets/lottie/flame.json'
import frostData from '../assets/lottie/frost.json'

/**
 * U-14 冷热号 Lottie 动效（经 React.lazy 单独 chunk，不进首包）
 * 火焰叠在热号球体后上方，冰晶在冷号球体后旋转；
 * 底层 CSS 光晕（U-13）保留，形成「光晕氛围 + 主体动效」双层结构。
 */
export default function FxLottie({ kind }: { kind: 'flame' | 'frost' }) {
  return (
    <i className={`fx-lottie fx-${kind}`} aria-hidden="true">
      <Lottie
        animationData={kind === 'flame' ? flameData : frostData}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
      />
    </i>
  )
}
