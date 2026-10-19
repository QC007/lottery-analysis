// U-14 冷热号 Lottie 动效资产生成器（自研，零外部素材依赖、零成本）
// 运行：node scripts/gen-lottie.mjs → 输出 src/assets/lottie/{flame,frost}.json
// flame：三层火舌（外焰/内焰/焰心）+ 两粒上腾火星，1.8s 无缝循环
// frost：六角冰晶慢速自旋 + 亮度呼吸 + 两粒环绕冰点，12s 无缝循环
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
// 缓入缓出关键帧：frames = [[t, [..vals]], ...]
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
// 线性关键帧（对角贝塞尔 = 匀速）
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
const st = (color, w) => ({
  ty: 'st',
  nm: 'stroke',
  c: stc(color),
  o: stc(100),
  w: stc(w),
  lc: 2,
  lj: 2,
})
const fill = (color) => ({ ty: 'fl', nm: 'fill', c: stc(color), o: stc(100), r: 1 })
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

/* ---------------- 火焰（100×120，54 帧 = 1.8s 循环） ---------------- */
const FR_F = 54
// 火舌轮廓（底宽顶尖，顺时针）
const vF = [[50, 6], [68, 28], [80, 54], [83, 78], [72, 100], [50, 111], [28, 100], [17, 78], [20, 54], [32, 28]]
const oF = [[3, 5], [7, 10], [3, 9], [-4, 9], [-9, 4], [-9, -4], [-4, -9], [-3, -9], [-7, -10], [6, -7]]
const iF = [[-3, 5], [-2, -8], [-7, -9], [-3, -9], [4, -8], [9, -4], [9, 4], [4, 8], [3, 9], [-7, 10]]
const firePath = sh(vF, iF, oF)

const flame = wrap('flame', 100, 120, FR_F, [
  // 外焰：深橙→绯红渐变，慢速呼吸 + 轻微摆动
  layer(
    1,
    'outer',
    [gr([firePath, gf([50, 112], [50, 18], rgb('#ff6a2b'), rgb('#c9241f'))], { p: [50, 111], a: [50, 111] })],
    {
      o: stc(92),
      r: anim(kf([[0, [0]], [13.5, [2.5]], [27, [0]], [40.5, [-2.5]], [54, [0]]], 1)),
      p: stc([50, 111, 0]),
      a: stc([50, 111, 0]),
      s: anim(
        kf(
          [[0, [100, 100, 100]], [13.5, [106, 111, 100]], [27, [100, 100, 100]], [40.5, [103.5, 108, 100]], [54, [100, 100, 100]]],
          3,
        ),
      ),
    },
    FR_F,
  ),
  // 内焰：琥珀→亮橙，静止基形 [62,58]，组内脉冲呼吸
  layer(
    2,
    'inner',
    [
      gr(
        [firePath, gf([50, 110], [50, 30], rgb('#ffc24d'), rgb('#ff7a1f'))],
        {
          p: [50, 111],
          a: [50, 111],
          s: anim(
            kf(
              [
                [0, [100, 100]],
                [6.75, [104, 107]],
                [13.5, [99, 95]],
                [20.25, [103, 105]],
                [27, [100, 100]],
                [33.75, [104, 106]],
                [40.5, [99, 95]],
                [47.25, [103, 105]],
                [54, [100, 100]],
              ],
              2,
            ),
          ),
        },
      ),
    ],
    {
      o: stc(95),
      r: stc(0),
      p: stc([50, 111, 0]),
      a: stc([50, 111, 0]),
      s: stc([62, 58, 100]),
    },
    FR_F,
  ),
  // 焰心：暖黄椭圆，快速明暗闪烁
  layer(
    3,
    'core',
    [el([50, 97], [26, 30]), fill(rgb('#ffe9a8'))],
    {
      o: anim(
        kf([[0, [92]], [6.75, [100]], [13.5, [88]], [20.25, [98]], [27, [90]], [33.75, [100]], [40.5, [86]], [47.25, [96]], [54, [92]]], 1),
      ),
      r: stc(0),
      p: stc([0, 0, 0]),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_F,
  ),
  // 火星 A：自底部升腾，透明度首尾归零保证循环无缝
  layer(
    4,
    'spark-a',
    [el([50, 95], [7, 7]), fill(rgb('#ffd36e'))],
    {
      o: anim(kf([[0, [0]], [5, [90]], [40, [80]], [50, [20]], [54, [0]]], 1)),
      r: stc(0),
      p: anim(
        kf([[0, [44, 98, 0]], [13.5, [52, 74, 0]], [27, [46, 52, 0]], [40.5, [54, 34, 0]], [54, [48, 24, 0]]], 3),
      ),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_F,
  ),
  // 火星 B：相位错开的第二粒小火星
  layer(
    5,
    'spark-b',
    [el([50, 95], [5.5, 5.5]), fill(rgb('#ffe1a0'))],
    {
      o: anim(kf([[0, [0]], [27, [0]], [33, [85]], [48, [50]], [54, [0]]], 1)),
      r: stc(0),
      p: anim(
        kf([[0, [56, 96, 0]], [13.5, [50, 72, 0]], [27, [58, 48, 0]], [40.5, [50, 36, 0]], [54, [52, 26, 0]]], 3),
      ),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_F,
  ),
])

/* ---------------- 冰霜（100×100，360 帧 = 12s 循环） ---------------- */
const FR_C = 360
const spokeItems = [
  shLine([50, 12], [50, 88]),
  shLine([50, 30], [41, 21]),
  shLine([50, 30], [59, 21]),
  shLine([50, 70], [41, 79]),
  shLine([50, 70], [59, 79]),
  st(rgb('#eaf6ff'), 5),
]
const frost = wrap('frost', 100, 100, FR_C, [
  // 六角冰晶：三组辐条 0/60/120°，整层匀速自旋 + 呼吸明暗
  layer(
    1,
    'flake',
    [
      gr(spokeItems, { r: stc(0) }),
      gr(spokeItems, { r: stc(60) }),
      gr(spokeItems, { r: stc(120) }),
      gr([el([50, 50], [9, 9]), fill(rgb('#eaf6ff'))]),
    ],
    {
      o: anim(
        kf([[0, [88]], [45, [100]], [90, [88]], [135, [100]], [180, [88]], [225, [100]], [270, [88]], [315, [100]], [360, [88]]], 1),
      ),
      r: anim(lkf([[0, [0]], [360, [360]]], 1)),
      p: stc([50, 50, 0]),
      a: stc([50, 50, 0]),
      s: stc([100, 100, 100]),
    },
    FR_C,
  ),
  // 环绕冰点 A（顺时针公转一圈）
  layer(
    2,
    'dot-a',
    [el([50, 50], [6, 6]), fill(rgb('#bfe2ff'))],
    {
      o: anim(kf([[0, [0]], [45, [75]], [315, [75]], [360, [0]]], 1)),
      r: stc(0),
      p: anim(
        lkf([[0, [78, 50, 0]], [90, [50, 78, 0]], [180, [22, 50, 0]], [270, [50, 22, 0]], [360, [78, 50, 0]]], 3),
      ),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_C,
  ),
  // 环绕冰点 B（反相位小冰点）
  layer(
    3,
    'dot-b',
    [el([50, 50], [4.5, 4.5]), fill(rgb('#d6ecff'))],
    {
      o: anim(kf([[0, [0]], [45, [60]], [315, [60]], [360, [0]]], 1)),
      r: stc(0),
      p: anim(
        lkf([[0, [22, 50, 0]], [90, [50, 22, 0]], [180, [78, 50, 0]], [270, [50, 78, 0]], [360, [22, 50, 0]]], 3),
      ),
      a: stc([0, 0, 0]),
      s: stc([100, 100, 100]),
    },
    FR_C,
  ),
])

for (const [name, data] of [['flame', flame], ['frost', frost]]) {
  const file = join(outDir, `${name}.json`)
  writeFileSync(file, JSON.stringify(data))
  console.log(`${name}.json written: ${(statSync(file).size / 1024).toFixed(1)} KB`)
}
