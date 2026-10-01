import React from 'react'
import { Image as ImageIcon, FolderOpen, Users, MoreHorizontal } from 'lucide-react'
import type { PhotosTab } from '../pages/app/photos/photosTypes'

const NAV: { id: 'timeline' | 'albums' | 'sharing' | 'more'; label: string; icon: React.ElementType }[] = [
  { id: 'timeline', label: 'Photos', icon: ImageIcon },
  { id: 'albums', label: 'Albums', icon: FolderOpen },
  { id: 'sharing', label: 'Partagés', icon: Users },
  { id: 'more', label: 'Plus', icon: MoreHorizontal },
]

export type PhotosBottomNavProps = {
  currentTab: PhotosTab
  onSelectTab: (tab: PhotosTab) => void
}

function navId(tab: PhotosTab): (typeof NAV)[number]['id'] {
  if (tab === 'albums') return 'albums'
  if (tab === 'sharing') return 'sharing'
  if (tab === 'timeline') return 'timeline'
  return 'more'
}

/**
 * Navigation principale Photos en bas d’écran (référence type Google Photos).
 * Photos / Albums / Partagés restent visibles en scroll. Archive, corbeille,
 * dossier sécurisé et réglages sont dans Plus.
 */
export function PhotosBottomNav({ currentTab, onSelectTab }: PhotosBottomNavProps) {
  const activeId = navId(currentTab)
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[45] border-t border-black/[0.06] bg-white pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-1px_0_rgba(0,0,0,0.04),0_-8px_24px_rgba(0,0,0,0.04)] backdrop-blur-md dark:border-white/[0.09] dark:bg-[#1f1f1f] dark:shadow-[0_-1px_0_rgba(255,255,255,0.06),0_-12px_32px_rgba(0,0,0,0.45)] md:left-56"
      aria-label="Navigation Photos"
    >
      <div className="mx-auto flex max-w-[1600px] items-stretch justify-around gap-0.5 px-1.5 sm:px-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = activeId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-normal leading-tight transition-colors duration-150 sm:text-[12px] ${
                active
                  ? 'text-[#e5394a] dark:text-[#ff6b7a] bg-[#fde8ea] dark:bg-white/[0.1]'
                  : 'text-[#5f6368] hover:bg-black/[0.04] dark:text-[#9aa0a6] dark:hover:bg-white/[0.06] dark:hover:text-[#bdc1c6]'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={`h-[22px] w-[22px] shrink-0 sm:h-6 sm:w-6 ${active ? 'opacity-100' : 'opacity-[0.88]'}`}
                aria-hidden
                strokeWidth={active ? 2.25 : 1.85}
              />
              <span className="max-w-[4.5rem] truncate px-0.5 text-center">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
