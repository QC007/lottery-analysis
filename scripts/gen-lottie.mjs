// U-14 冷热号 Lottie 动效资产生成器 v2（自研，零外部素材依赖、零成本）
// 运行：node scripts/gen-lottie.mjs → 输出 src/assets/lottie/{flame,frost}.json
// flame v2：中心亮核 + 8 向火舌向四面八方燃烧（相位错开的缩放/明暗闪烁）+ 6 向火星向外飞散，54 帧无缝循环
// frost v2：中心冰核 + 6 向冰晶向外生长蔓延 + 6 向碎晶 + 双冰环向外扩散，360 帧无缝循环
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src', 'assets', 'lottie')
mkdirSync(outDir, { recursive: true })

const V = (n) => Math.round(n * 1e4) / 1e4
const rgb = (hex) => {
  const s = hex.replace('#', '')
  return [
    V(parseInt(s.slice(0, 2), 16) / 255),
    V(parseInt(s.slice(2, 4), 16) / 255),
    V(parseInt(s.slice(4, 6), 16) / 255),
  ]
}
const kf = (frames, dims) =>
  frames.map(([t, s], idx) =>
    idx === frames.length - 1
      ? { t, s }
      : {
          t,
          s,
          i: { x: Array(dims).fill(0.42), y: Array(dims).fill(1) },
          o: { x: Array(dims).fill(0.58), y: Array(dims).fill(0) },
        },
  )
const lkf = (frames, dims) =>
  frames.map(([t, s], idx) =>
    idx === frames.length - 1
      ? { t, s }
      : {
          t,
          s,
          i: { x: Array(dims).fill(0.833), y: Array(dims).fill(0.833) },
          o: { x: Array(dims).fill(0.167), y: Array(dims).fill(0.167) },
        },
  )
const anim = (frames) => ({ a: 1, k: frames })
const stc = (v) => ({ a: 0, k: v })

const sh = (v, i, o) => ({ ty: 'sh', nm: 'path', ks: stc({ v, i, o, c: true }) })
const shLine = (p1, p2) => ({
  ty: 'sh',
  nm: 'line',
  ks: stc({ v: [p1, p2], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], c: false }),
})
const el = (p, s) => ({ ty: 'el', nm: 'ellipse', p: stc(p), s: stc(s) })
const gf = (from, to, c1, c2) => ({
  ty: 'gf',
  nm: 'grad',
  o: stc(100),
  r: 1,
  t: 1,
  s: stc(from),
  e: stc(to),
  g: { p: 2, k: stc([0, ...c1, 1, ...c2]) },
})
const fill = (color, o = 100) => ({ ty: 'fl', nm: 'fill', c: stc(color), o: stc(o), r: 1 })
const st = (color, w, o = 100) => ({
  ty: 'st',
  nm: 'stroke',
  c: stc(color),
  o: stc(o),
  w: stc(w),
  lc: 2,
  lj: 2,
})
const gr = (items, tr = {}) => ({
  ty: 'gr',
  nm: 'group',
  it: [
    ...items,
    {
      ty: 'tr',
      nm: 'tr',
      p: stc(tr.p ?? [0, 0]),
      a: stc(tr.a ?? [0, 0]),
      s: tr.s ?? stc([100, 100]),
      r: tr.r ?? stc(0),
      o: stc(tr.o ?? 100),
      sk: stc(0),
      sa: stc(0),
    },
  ],
})
const layer = (ind, nm, shapes, ks, op) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm,
  sr: 1,
  ks,
  ao: 0,
  shapes,
  ip: 0,
  op,
  st: 0,
  bm: 0,
})
const wrap = (nm, w, h, op, layers) => ({
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op,
  w,
  h,
  nm,
  ddd: 0,
  assets: [],
  layers,
  meta: { g: 'lap-gen-lottie' },
})

/* ============ 火焰 v2（100×100，54 帧 = 1.8s 无缝循环） ============ */
const FR_F = 54
// 火舌轮廓：尖端朝上，基部在中心（[50,50]），供 8 向旋转复用
const tonguePath = sh(
  [[50, 10], [58, 30], [55, 45], [50, 50], [45, 45], [42, 30]],
  [[-3, 4], [-1, -5], [0, -3], [3, -1], [1, -3], [1, 4]],
  [[3, 4], [1, -5], [0, -3], [-3, -1], [-1, -3], [-4, 3]],
)
// 单条火舌图层：grad 基部暖黄→尖部橙红，缩放呼吸 + 明暗闪烁（相位可错开）
const flameTongue = (ind, angle, phase, warm) =>
  layer(
    ind,
    `tongue-${angle}`,
    [
      gr(
        [tonguePath, gf([50, 50], [50, 10], warm ? rgb('#ffc24d') : rgb('#ff9a3d'), warm ? rgb('#ff7a1f') : rgb('#e33429'))],
        {
          p: [50, 50],
          a: [50, 50],
          // 火舌向外“窜”：基部固定中心，沿该方向缩放脉动
          s: anim(
            kf(
              [
                [0, [92, 92]],
                [6.75, [106, 112]],
                [13.5, [95, 90]],
                [20.25, [104, 108]],
                [27, [92, 92]],
                [33.75, [105, 110]],
                [40.5, [94, 91]],
                [47.25, [103, 106]],
                [54, [92, 92]],
              ],
              2,
            ),
          ),
        },
      ),
    ],
    {
      o: anim(
        kf(
          [
            [0, [82]],
            [6.75, [100]],
            [13.5, [86]],
            [20.25, [98]],
            [27, [84]],
            [33.75, [100]],
            [40.5, [88]],
            [47.25, [96]],
            [54, [82]],
          ],
          1,
        ),
      ),
      r: stc(angle),
      p: stc([50, 50, 0]),
      a: stc([50, 50, 0]),
      s: stc([100, 100, 100]),
    },
    FR_F,
  )
// 相位：给每条火舌的 st 错开（负相位 = 提前进入循环内不同时间点）
const tongueLayer = (ind, angle, warm) => {
  const l = flameTongue(ind, angle, 0, warm)
  l.st = -((angle / 45) * 6.75) % FR_F // 每条错开 1/8 循环
  return l
}
// 向外飞散的火星（沿角度飞出，透明度首尾归零无缝循环）
const ember = (ind, angle, size, phase) =>
  layer(
    ind,
    `ember-${angle}`,
    [gr([el([50, 50], [size, size]), fill(rgb('#ffd36e'))], { r: stc(angle) })],
    {
      o: anim(kf([[0, [0]], [7, [95]], [40, [70]], [50, [15]], [54, [0]]], 1)),
      r: stc(0),
      // 朝上方向运动，由组旋转决定实际飞散方向
      p: anim(kf([[0, [50, 38, 0]], [13.5, [50, 28, 0]], [27, [50, 20, 0]], [40.5, [50, 14, 0]], [54, [50, 10, 0]]], 3)),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_F,
  )

const flame = wrap('flame', 100, 100, FR_F, [
  // 底层辉光：整体呼吸
  layer(
    1,
    'glow',
    [el([50, 50], [88, 88]), gf([50, 50], [50, 6], rgb('#ff8a2b'), rgb('#7a1408'))],
    {
      o: anim(kf([[0, [42]], [13.5, [58]], [27, [46]], [40.5, [56]], [54, [42]]], 1)),
      r: stc(0),
      p: stc([0, 0, 0]),
      a: stc([0, 0, 0]),
      s: anim(kf([[0, [96, 96, 100]], [13.5, [104, 104, 100]], [27, [98, 98, 100]], [40.5, [103, 103, 100]], [54, [96, 96, 100]]], 3)),
    },
    FR_F,
  ),
  // 8 向火舌（冷暖色交替）
  ...[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => tongueLayer(2 + i, a, i % 2 === 0)),
  // 中心亮核：快速闪烁
  layer(
    10,
    'core',
    [el([50, 50], [30, 30]), gf([50, 62], [50, 38], rgb('#fff3c4'), rgb('#ffb347'))],
    {
      o: anim(kf([[0, [92]], [6.75, [100]], [13.5, [88]], [20.25, [98]], [27, [90]], [33.75, [100]], [40.5, [86]], [47.25, [96]], [54, [92]]], 1)),
      r: stc(0),
      p: stc([0, 0, 0]),
      a: stc([0, 0, 0]),
      s: anim(kf([[0, [100, 100, 100]], [13.5, [110, 110, 100]], [27, [98, 98, 100]], [40.5, [108, 108, 100]], [54, [100, 100, 100]]], 3)),
    },
    FR_F,
  ),
  // 6 向火星（60° 间隔，两个相位组）
  ...[0, 60, 120, 180, 240, 300].map((a, i) => {
    const l = ember(11 + i, a, i % 2 === 0 ? 6 : 5, i)
    l.st = -(i * 9) % FR_F
    return l
  }),
])

/* ============ 冰霜 v2（100×100，360 帧 = 12s 无缝循环） ============ */
const FR_C = 360
// 冰晶主刺：尖刺朝上 + 侧枝，供 6 向旋转复用
const spikeItems = [
  sh(
    [[50, 6], [53.5, 38], [50, 46], [46.5, 38]],
    [[-1.5, 8], [-1.5, -3], [2, -2], [1.5, 8]],
    [[1.5, 8], [1.5, -3], [-2, -2], [-3, 4]],
  ),
  gf([50, 46], [50, 6], rgb('#9fd3ff'), rgb('#eaf6ff')),
  shLine([50, 22], [43, 14]),
  shLine([50, 22], [57, 14]),
  shLine([50, 33], [44, 26]),
  shLine([50, 33], [56, 26]),
  st(rgb('#d6ecff'), 3),
]
// 单支冰晶：自中心向外生长蔓延（scale 0→100 再回缩，相位错开此起彼伏）
const frostSpike = (ind, angle, scaleMax) =>
  layer(
    ind,
    `spike-${angle}`,
    [
      gr(spikeItems, {
        p: [50, 50],
        a: [50, 50],
        s: anim(
          kf(
            [
              [0, [24, 24]],
              [60, [scaleMax, scaleMax]],
              [120, [scaleMax * 0.92, scaleMax * 0.92]],
              [180, [24, 24]],
              [240, [24, 24]],
              [300, [24, 24]],
              [360, [24, 24]],
            ],
            2,
          ),
        ),
      }),
    ],
    {
      o: anim(kf([[0, [0]], [30, [95]], [150, [90]], [180, [0]], [360, [0]]], 1)),
      r: stc(angle),
      p: stc([50, 50, 0]),
      a: stc([50, 50, 0]),
      s: stc([100, 100, 100]),
    },
    FR_C,
  )
// 向外扩散的冰环（细描边圆环扩大并淡出，双环相位错开，持续“蔓延”感）
const frostRing = (ind, phase) => {
  const l = layer(
    ind,
    `ring-${phase}`,
    [el([50, 50], [30, 30]), st(rgb('#bfe2ff'), 3, 70)],
    {
      o: anim(kf([[0, [0]], [20, [65]], [140, [10]], [180, [0]], [360, [0]]], 1)),
      r: stc(0),
      p: stc([0, 0, 0]),
      a: stc([0, 0, 0]),
      s: anim(kf([[0, [30, 30, 100]], [180, [300, 300, 100]], [360, [30, 30, 100]]], 3)),
    },
    FR_C,
  )
  l.st = -phase
  return l
}
const frost = wrap('frost', 100, 100, FR_C, [
  // 底层寒雾呼吸
  layer(
    1,
    'mist',
    [el([50, 50], [92, 92]), gf([50, 50], [50, 4], rgb('#5aa9e6'), rgb('#0b3d91'))],
    {
      o: anim(kf([[0, [30]], [90, [44]], [180, [32]], [270, [42]], [360, [30]]], 1)),
      r: stc(0),
      p: stc([0, 0, 0]),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_C,
  ),
  // 6 向主冰晶（向外生长蔓延，相位各错 60 帧）
  ...[0, 60, 120, 180, 240, 300].map((a, i) => {
    const l = frostSpike(2 + i, a, 100)
    l.st = -(i * 30) % FR_C
    return l
  }),
  // 6 向碎晶（30° 偏移，更小更快，相位错 30 帧）
  ...[30, 90, 150, 210, 270, 330].map((a, i) => {
    const l = frostSpike(8 + i, a, 62)
    l.st = -(i * 30 + 45) % FR_C
    return l
  }),
  // 双冰环向外扩散
  frostRing(14, 0),
  frostRing(15, 90),
  // 中心冰核：呼吸
  layer(
    16,
    'core',
    [el([50, 50], [18, 18]), gf([50, 58], [50, 42], rgb('#ffffff'), rgb('#bfe2ff'))],
    {
      o: anim(kf([[0, [88]], [45, [100]], [90, [88]], [135, [100]], [180, [88]], [225, [100]], [270, [88]], [315, [100]], [360, [88]]], 1)),
      r: stc(0),
      p: stc([0, 0, 0]),
      a: stc([0, 0, 0]),
      s: anim(kf([[0, [96, 96, 100]], [90, [104, 104, 100]], [180, [96, 96, 100]], [270, [104, 104, 100]], [360, [96, 96, 100]]], 3)),
    },
    FR_C,
  ),
])

for (const [name, data] of [['flame', flame], ['frost', frost]]) {
  const file = join(outDir, `${name}.json`)
  writeFileSync(file, JSON.stringify(data))
  console.log(`${name}.json written: ${(statSync(file).size / 1024).toFixed(1)} KB`)
}
