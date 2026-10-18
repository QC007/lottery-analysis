import { create } from 'zustand'
import type { MetaJson } from '../services/sync'

export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error'

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
}

export const useStore = create<AppState>((set) => ({
  activeLotteryId: 'ssq',
  setActiveLottery: (id) => set({ activeLotteryId: id }),
  syncPhase: 'idle',
  syncMessage: '',
  setSync: (phase, message = '') => set({ syncPhase: phase, syncMessage: message }),
  meta: null,
  setMeta: (m) => set({ meta: m }),
}))
