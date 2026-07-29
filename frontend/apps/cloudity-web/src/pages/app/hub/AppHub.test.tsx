import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../../test-utils'
import AppHub from './AppHub'

function wrap(ui: React.ReactElement) {
  return <TestRouter>{ui}</TestRouter>
}

describe('AppHub', () => {
  it('renders hub title and category sections', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeTruthy()
    expect(screen.getByText('Fichiers')).toBeTruthy()
  })

  it('renders category sections', () => {
    render(wrap(<AppHub />))
    expect(screen.getByText('Fichiers')).toBeTruthy()
    expect(screen.getByText('Communication')).toBeTruthy()
  })

  it('renders all 10 main app links with aria-label', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('link', { name: 'Ouvrir Drive' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Office' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Pass' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Mail' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Corbeille' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Calendar' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Notes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Tasks' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Contacts' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Photos' })).toBeTruthy()
  })

  it('links each main app to correct route', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('link', { name: 'Ouvrir Drive' }).getAttribute('href')).toBe('/app/drive')
    expect(screen.getByRole('link', { name: 'Ouvrir Office' }).getAttribute('href')).toBe('/app/office')
    expect(screen.getByRole('link', { name: 'Ouvrir Pass' }).getAttribute('href')).toBe('/app/pass')
    expect(screen.getByRole('link', { name: 'Ouvrir Mail' }).getAttribute('href')).toBe('/app/mail')
    expect(screen.getByRole('link', { name: 'Ouvrir Corbeille' }).getAttribute('href')).toBe('/app/corbeille')
    expect(screen.getByRole('link', { name: 'Ouvrir Calendar' }).getAttribute('href')).toBe('/app/calendar')
    expect(screen.getByRole('link', { name: 'Ouvrir Notes' }).getAttribute('href')).toBe('/app/notes')
    expect(screen.getByRole('link', { name: 'Ouvrir Tasks' }).getAttribute('href')).toBe('/app/tasks')
    expect(screen.getByRole('link', { name: 'Ouvrir Contacts' }).getAttribute('href')).toBe('/app/contacts')
    expect(screen.getByRole('link', { name: 'Ouvrir Photos' }).getAttribute('href')).toBe('/app/photos')
  })

  it('does not fetch métier previews (launcher only)', () => {
    render(wrap(<AppHub />))
    expect(screen.queryByText('Chargement…')).toBeNull()
    expect(screen.queryByText(/non lu/i)).toBeNull()
  })
})
