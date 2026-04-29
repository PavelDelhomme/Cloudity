import React from 'react'
import { Image as ImageIcon, FolderOpen, Archive, Trash2, Lock } from 'lucide-react'
import type { PhotosTab } from '../pages/app/photosTypes'

const NAV: { id: PhotosTab; label: string; icon: React.ElementType }[] = [
  { id: 'timeline', label: 'Photos', icon: ImageIcon },
  { id: 'albums', label: 'Albums', icon: FolderOpen },
  { id: 'archive', label: 'Archivé', icon: Archive },
  { id: 'trash', label: 'Corbeille', icon: Trash2 },
  { id: 'locked', label: 'Verrouillé', icon: Lock },
]

export type PhotosBottomNavProps = {
  currentTab: PhotosTab
  onSelectTab: (tab: PhotosTab) => void
}

/**
 * Navigation principale Photos en bas d’écran (référence type Google Photos / app mobile).
 * Sur desktop, décalage `md:left-56` pour rester dans la colonne principale lorsque la sidebar app est dépliée (w-56).
 */
export function PhotosBottomNav({ currentTab, onSelectTab }: PhotosBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[45] border-t border-black/[0.06] bg-white pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-1px_0_rgba(0,0,0,0.04),0_-8px_24px_rgba(0,0,0,0.04)] backdrop-blur-md dark:border-white/[0.09] dark:bg-[#1f1f1f] dark:shadow-[0_-1px_0_rgba(255,255,255,0.06),0_-12px_32px_rgba(0,0,0,0.45)] md:left-56"
      aria-label="Navigation Photos"
    >
      <div className="mx-auto flex max-w-[1600px] items-stretch justify-around gap-0.5 px-1.5 sm:px-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = currentTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-normal leading-tight transition-colors duration-150 sm:text-[12px] ${
                active
                  ? 'text-[#1a73e8] dark:text-[#8ab4f8] bg-[#e8f0fe] dark:bg-white/[0.1]'
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
