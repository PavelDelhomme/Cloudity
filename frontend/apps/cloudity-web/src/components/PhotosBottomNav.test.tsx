import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PhotosBottomNav } from './PhotosBottomNav'

describe('PhotosBottomNav', () => {
  it('expose les 4 onglets Google Photos et signale l’onglet actif', () => {
    const onSelect = vi.fn()
    render(<PhotosBottomNav currentTab="timeline" onSelectTab={onSelect} />)
    expect(screen.getByRole('navigation', { name: 'Navigation Photos' })).toBeTruthy()
    for (const label of ['Photos', 'Collections', 'Créer', 'Recherche']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Photos' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }))
    expect(onSelect).toHaveBeenCalledWith('collections')
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSelect).toHaveBeenCalledWith('create')
    fireEvent.click(screen.getByRole('button', { name: 'Recherche' }))
    expect(onSelect).toHaveBeenCalledWith('search')
  })

  it('archive / albums restent sous Collections (pas un 5e onglet)', () => {
    const onSelect = vi.fn()
    render(<PhotosBottomNav currentTab="albums" onSelectTab={onSelect} />)
    expect(screen.getByRole('button', { name: 'Collections' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('button', { name: 'Albums' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Partagés' })).toBeNull()
  })
})
