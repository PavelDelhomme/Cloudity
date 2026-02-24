import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

describe('App', () => {
  it('smoke test', () => {
    expect(true).toBe(true)
  })
  it('renders text', () => {
    render(<div>Cloudity Admin</div>)
    const el = screen.getByText('Cloudity Admin')
    expect(el).toBeTruthy()
    expect(el.textContent).toBe('Cloudity Admin')
  })
})
