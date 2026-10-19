import { useEffect, useRef } from 'react'

/**
 * U-14 v4 冷热号 Canvas 粒子动效（React.lazy 单独 chunk，零依赖）
 * 火焰：中心脉动辉光 + 全向余烬粒子（加法混合发光，黄→橙→红随生命周期渐变）
 * 寒气：中心呼吸冷光 + 慢旋冰晶六角 + 全向冰晶微粒（加法混合，闪烁漂移）
 * 全部实例共享一个 RAF 循环；标签页不可见时自动暂停；prefers-reduced-motion 时仅渲染静态帧。
 */

type Kind = 'flame' | 'frost'

interface Particle {
  /** 极坐标：角度 / 半径 / 径向速度(px/s) */
  a: number
  r: number
  v: number
  life: number
  ttl: number
  size: number
  seed: number
}

/* ---- 全局共享 RAF 循环（24 个实例只跑一个定时器） ---- */
const updaters = new Set<(dt: number, t: number) => void>()
let rafId = 0
let lastT = 0
const loop = (t: number) => {
  const dt = Math.min(50, t - lastT)
  lastT = t
  updaters.forEach((u) => u(dt, t))
  rafId = updaters.size > 0 ? requestAnimationFrame(loop) : 0
}
const startLoop = () => {
  if (!rafId) {
    lastT = performance.now()
    rafId = requestAnimationFrame(loop)
  }
}

/* ---- 预渲染发光精灵（径向渐变圆，粒子的“光点”素材） ---- */
function makeGlowSprite(inner: string, mid: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.35, mid)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}
let sprites: { warm: HTMLCanvasElement; ember: HTMLCanvasElement; cool: HTMLCanvasElement } | null = null
const getSprites = () =>
  (sprites ??= {
    warm: makeGlowSprite('rgba(255,246,205,1)', 'rgba(255,178,71,0.55)'),
    ember: makeGlowSprite('rgba(255,214,120,1)', 'rgba(255,90,26,0.5)'),
    cool: makeGlowSprite('rgba(255,255,255,1)', 'rgba(150,205,255,0.5)'),
  })

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

export default function FxParticles({ kind }: { kind: Kind }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 高分屏适配：CSS 尺寸 × DPR
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cssSize = canvas.clientWidth || 56
    canvas.width = cssSize * dpr
    canvas.height = cssSize * dpr
    ctx.scale(dpr, dpr)
    const C = cssSize / 2 // 中心（= 球心）
    const maxR = cssSize * 0.52

    const sp = getSprites()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const parts: Particle[] = []
    const budget = kind === 'flame' ? 26 : 16

    const spawn = (p: Particle) => {
      p.a = rand(0, Math.PI * 2)
      p.r = rand(1, 4)
      p.v = kind === 'flame' ? rand(9, 22) : rand(2.5, 7)
      p.life = 0
      p.ttl = kind === 'flame' ? rand(0.7, 1.5) : rand(2.2, 3.8)
      p.size = kind === 'flame' ? rand(3.5, 7.5) : rand(2, 4.5)
      p.seed = rand(0, 100)
    }
    for (let i = 0; i < budget; i++) {
      const p = {} as Particle
      spawn(p)
      p.life = rand(0, p.ttl) // 初始相位错开，避免齐发
      parts.push(p)
    }

    const draw = (dtMs: number, t: number) => {
      const dt = dtMs / 1000
      ctx.clearRect(0, 0, cssSize, cssSize)
      ctx.globalCompositeOperation = 'lighter'

      if (kind === 'flame') {
        // 中心脉动辉光（球后的“火心”）
        const pulse = 0.42 + 0.16 * Math.sin(t * 0.006)
        const coreR = C * (0.62 + 0.06 * Math.sin(t * 0.004))
        const core = ctx.createRadialGradient(C, C, 0, C, C, coreR)
        core.addColorStop(0, `rgba(255,196,92,${pulse})`)
        core.addColorStop(0.55, `rgba(255,110,32,${pulse * 0.5})`)
        core.addColorStop(1, 'rgba(160,30,8,0)')
        ctx.fillStyle = core
        ctx.fillRect(0, 0, cssSize, cssSize)
      } else {
        // 中心呼吸冷光
        const pulse = 0.3 + 0.12 * Math.sin(t * 0.0022)
        const core = ctx.createRadialGradient(C, C, 0, C, C, C * 0.66)
        core.addColorStop(0, `rgba(190,224,255,${pulse})`)
        core.addColorStop(0.6, `rgba(96,160,235,${pulse * 0.45})`)
        core.addColorStop(1, 'rgba(20,60,140,0)')
        ctx.fillStyle = core
        ctx.fillRect(0, 0, cssSize, cssSize)
        // 慢旋冰晶六角（双层反向，微弱结构感）
        for (const [rot, alpha] of [
          [t * 0.00012, 0.34],
          [-t * 0.00009, 0.22],
        ] as const) {
          ctx.save()
          ctx.translate(C, C)
          ctx.rotate(rot)
          ctx.strokeStyle = `rgba(210,236,255,${alpha})`
          ctx.lineWidth = 1.1
          ctx.beginPath()
          for (let k = 0; k < 6; k++) {
            const ang = (k * Math.PI) / 3
            const rr = C * 0.6
            const x = Math.cos(ang) * rr
            const y = Math.sin(ang) * rr
            if (k === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
            // 每条边的外延小枝
            ctx.moveTo(x * 0.55, y * 0.55)
            ctx.lineTo(x * 0.55 + Math.cos(ang + 0.5) * 5, y * 0.55 + Math.sin(ang + 0.5) * 5)
            ctx.moveTo(x * 0.55, y * 0.55)
          }
          ctx.closePath()
          ctx.stroke()
          ctx.restore()
        }
      }

      // 粒子更新与绘制
      for (const p of parts) {
        p.life += dt
        if (p.life >= p.ttl || p.r > maxR) spawn(p)
        p.r += p.v * dt
        const k = p.life / p.ttl // 0..1
        const x = C + Math.cos(p.a) * p.r
        const y = C + Math.sin(p.a) * p.r

        if (kind === 'flame') {
          // 黄亮→橙红：早期 warm 精灵，晚期叠 ember 红精灵，透明度随生命衰减
          const fade = 1 - k
          const s = p.size * (1 - k * 0.45) * 2
          ctx.globalAlpha = Math.min(1, fade * 1.6)
          ctx.drawImage(sp.warm, x - s / 2, y - s / 2, s, s)
          ctx.globalAlpha = fade * k * 0.9
          const s2 = s * 1.25
          ctx.drawImage(sp.ember, x - s2 / 2, y - s2 / 2, s2, s2)
        } else {
          // 冰晶微粒：闪烁（高频明暗）+ 缓慢外漂，十字星光
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(p.life * 4 + p.seed))
          const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85
          const s = p.size * 2.2
          ctx.globalAlpha = tw * fade
          ctx.drawImage(sp.cool, x - s / 2, y - s / 2, s, s)
          ctx.strokeStyle = `rgba(235,246,255,${0.8 * tw * fade})`
          ctx.lineWidth = 0.8
          const g = p.size * 0.9
          ctx.beginPath()
          ctx.moveTo(x - g, y)
          ctx.lineTo(x + g, y)
          ctx.moveTo(x, y - g)
          ctx.lineTo(x, y + g)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const update = (dt: number, t: number) => draw(dt, t)

    if (reduced) {
      // 减弱动态偏好：只绘制一帧静态画面
      draw(33, 500)
      return
    }
    updaters.add(update)
    startLoop()
    return () => {
      updaters.delete(update)
    }
  }, [kind])

  return (
    <i className={`fx-lottie fx-${kind}`} aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </i>
  )
}
