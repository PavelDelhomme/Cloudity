import { describe, expect, it } from 'vitest'
import { mobileOtaAppFromPath, resolveMobileOtaTarget } from './mobileOtaPrompt'

describe('mobileOtaAppFromPath', () => {
  it('résout Notes depuis /app/notes', () => {
    const app = mobileOtaAppFromPath('/app/notes')
    expect(app?.slug).toBe('cloudity_notes')
    expect(app?.label).toBe('Notes')
  })

  it('résout Mail depuis /app/mail/inbox', () => {
    expect(mobileOtaAppFromPath('/app/mail/inbox')?.slug).toBe('cloudity_mail')
  })

  it('résout admin', () => {
    expect(mobileOtaAppFromPath('/4dm1n/mobile-distribution')?.slug).toBe('cloudity_admin')
  })
})

describe('resolveMobileOtaTarget', () => {
  it('lit ?next= encodé', () => {
    const app = resolveMobileOtaTarget('/app/tasks?foo=bar')
    expect(app?.slug).toBe('cloudity_tasks')
  })
})
