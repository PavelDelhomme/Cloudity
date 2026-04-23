import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import GlobalSearchPalette from './GlobalSearchPalette'
import { routerFuture } from '../test-utils'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return (
    <span data-testid="location-probe">
      {pathname}
      {search}
    </span>
  )
}

function renderPalette(initialEntries: string[] = ['/app']) {
  return render(
    <MemoryRouter initialEntries={initialEntries} future={routerFuture}>
      <GlobalSearchPalette />
      <LocationProbe />
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
})

describe('GlobalSearchPalette', () => {
  it('ouvre la modale au clic sur la loupe', () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la recherche/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recherche' })).toBeTruthy()
  })

  it('navigue vers /app/drive?q=… au submit du formulaire', async () => {
    renderPalette(['/app/mail'])
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la recherche/i }))
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: '  rapport  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir le Drive \(recherche\)/i }))
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toContain('/app/drive')
      expect(screen.getByTestId('location-probe').textContent).toContain('q=rapport')
    })
  })

  it('navigue vers Contacts avec le même terme', async () => {
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la recherche/i }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alice' } })
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir Contacts/i }))
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toBe('/app/contacts?q=alice')
    })
  })

  it('Drive sans requête : /app/drive sans query', async () => {
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la recherche/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Ouvrir le Drive$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toBe('/app/drive')
    })
  })

  it('ferme la modale avec Échap', () => {
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la recherche/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Ctrl+K ouvre la palette quand le focus n’est pas dans un champ', () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true, bubbles: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('Ctrl+K ne toggle pas depuis un input hors palette', () => {
    render(
      <MemoryRouter initialEntries={['/app']} future={routerFuture}>
        <input data-testid="external" aria-label="champ externe" />
        <GlobalSearchPalette />
      </MemoryRouter>
    )
    const external = screen.getByTestId('external')
    external.focus()
    fireEvent.keyDown(external, { key: 'k', ctrlKey: true, bubbles: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
