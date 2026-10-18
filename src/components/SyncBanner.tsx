import { useStore } from '../store/useStore'

/** 顶部同步状态条 */
export default function SyncBanner() {
  const syncPhase = useStore((s) => s.syncPhase)
  const syncMessage = useStore((s) => s.syncMessage)
  if (syncPhase === 'idle') return null
  const icon = syncPhase === 'syncing' ? '⏳' : syncPhase === 'done' ? '✅' : '❌'
  return (
    <div className={`sync-banner sync-${syncPhase}`}>
      {icon} {syncMessage}
    </div>
  )
}
