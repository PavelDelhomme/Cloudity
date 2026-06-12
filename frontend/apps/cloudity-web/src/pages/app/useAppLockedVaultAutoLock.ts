import { useEffect } from 'react'
import {
  type AppLockedVaultKind,
  revokeAppLockedVaultSession,
} from './appLockedVault'

export function useAppLockedVaultAutoLock(
  kind: AppLockedVaultKind,
  scope: string | null,
  lockEnabled: boolean,
  unlocked: boolean,
  onLock: () => void
): void {
  useEffect(() => {
    if (!lockEnabled || !scope || !unlocked) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        revokeAppLockedVaultSession(kind, scope)
        onLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [kind, lockEnabled, onLock, scope, unlocked])
}
