import { create } from 'zustand'
import type { MetaJson } from '../services/sync'
import { isSuppressed, TIP_TEXT, type TipKey } from '../services/rational'

export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error'

/** 顶部理性提示（F-10） */
export interface RationalTip {
  key: TipKey
  text: string
}

interface AppState {
  /** 当前查看的彩种 */
  activeLotteryId: string
  setActiveLottery: (id: string) => void
  /** 同步状态条 */
  syncPhase: SyncPhase
  syncMessage: string
  setSync: (phase: SyncPhase, message?: string) => void
  /** 远端 meta.json（展示本地/远端覆盖率用） */
  meta: MetaJson | null
  setMeta: (m: MetaJson) => void
  /** F-10 理性提示 */
  rationalOff: boolean
  setRationalOff: (off: boolean) => void
  rationalTip: RationalTip | null
  /** 触发提示：全局关闭或 24h 抑制期内则静默跳过 */
  showRationalTip: (key: TipKey) => void
  dismissRationalTip: () => void
}

export const useStore = create<AppState>((set) => ({
  activeLotteryId: 'ssq',
  setActiveLottery: (id) => set({ activeLotteryId: id }),
  syncPhase: 'idle',
  syncMessage: '',
  setSync: (phase, message = '') => set({ syncPhase: phase, syncMessage: message }),
  meta: null,
  setMeta: (m) => set({ meta: m }),
  rationalOff: false,
  setRationalOff: (off) => set({ rationalOff: off }),
  rationalTip: null,
  showRationalTip: (key) => {
    void isSuppressed(key).then((blocked) => {
      if (!blocked) set({ rationalTip: { key, text: TIP_TEXT[key] } })
    })
  },
  dismissRationalTip: () => set({ rationalTip: null }),
}))
