import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../../test-utils'
import AppHub from './AppHub'

function wrap(ui: React.ReactElement) {
  return <TestRouter>{ui}</TestRouter>
}

describe('AppHub (FE-HUB-01 — grille liens)', () => {
  it('affiche le titre Applications', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeTruthy()
  })

  it('affiche les catégories produit', () => {
    render(wrap(<AppHub />))
    expect(screen.getByText('Fichiers')).toBeTruthy()
    expect(screen.getByText('Communication')).toBeTruthy()
    expect(screen.getByText('Compte')).toBeTruthy()
  })

  it('expose un lien par app (aria-label Ouvrir …)', () => {
    render(wrap(<AppHub />))
    for (const name of [
      'Drive',
      'Office',
      'Pass',
      'Mail',
      'Corbeille',
      'Calendar',
      'Notes',
      'Tasks',
      'Contacts',
      'Photos',
      'Paramètres',
    ]) {
      expect(screen.getByRole('link', { name: `Ouvrir ${name}` })).toBeTruthy()
    }
  })

  it('pointe chaque app vers la bonne route', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('link', { name: 'Ouvrir Drive' }).getAttribute('href')).toBe('/app/drive')
    expect(screen.getByRole('link', { name: 'Ouvrir Mail' }).getAttribute('href')).toBe('/app/mail/')
    expect(screen.getByRole('link', { name: 'Ouvrir Paramètres' }).getAttribute('href')).toBe(
      '/app/settings'
    )
  })

  it('n’affiche aucun aperçu métier (loader / non lus)', () => {
    render(wrap(<AppHub />))
    expect(screen.queryByText('Chargement…')).toBeNull()
    expect(screen.queryByText(/non lu/i)).toBeNull()
    expect(screen.queryByText(/fichier récent/i)).toBeNull()
  })
})
