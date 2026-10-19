import { useStore } from '../store/useStore'

/** 顶部同步状态条（U-10：emoji 换 CSS 状态圆点/spinner） */
export default function SyncBanner() {
  const syncPhase = useStore((s) => s.syncPhase)
  const syncMessage = useStore((s) => s.syncMessage)
  if (syncPhase === 'idle') return null
  return (
    <div className={`sync-banner sync-${syncPhase}`}>
      <i className="sync-dot" aria-hidden="true" />
      {syncMessage}
    </div>
  )
}
