import { expect, test } from '@playwright/test'
import { login } from './fixtures/auth'

type DriveNode = {
  id: number
  tenant_id: number
  user_id: number
  parent_id: number | null
  name: string
  is_folder: boolean
  size: number
  mime_type: string
  created_at: string
  updated_at: string
  taken_at?: string | null
  photo_archived_at?: string | null
  deleted_at?: string | null
}

const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64')

function photoNode(id: number, name: string): DriveNode {
  return {
    id,
    tenant_id: 1,
    user_id: 1,
    parent_id: null,
    name,
    is_folder: false,
    size: 128,
    mime_type: 'image/jpeg',
    created_at: '2026-01-10T12:00:00.000Z',
    updated_at: '2026-01-10T12:00:00.000Z',
    taken_at: '2026-01-10T12:00:00.000Z',
  }
}

test.describe('Photos archive et corbeille (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    page.on('dialog', (dialog) => void dialog.accept())
  })

  test('archive une photo puis la restaure depuis l’onglet Archivé', async ({ page }) => {
    const timeline = [photoNode(901, 'e2e-archive.jpg')]
    const archive: DriveNode[] = []
    const archivedIds: number[] = []
    const unarchivedIds: number[] = []

    await page.route('**/drive/nodes/*/thumbnail**', async (route) => {
      await route.fulfill({ status: 200, body: TINY_JPEG, headers: { 'Content-Type': 'image/jpeg' } })
    })
    await page.route('**/photos/timeline**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: timeline, limit: 48, offset: 0, has_more: false }),
      })
    })
    await page.route('**/drive/photos/archive', async (route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(archive) })
        return
      }
      const body = await req.postDataJSON() as { ids?: number[] }
      archivedIds.push(...(body.ids ?? []))
      const moved = timeline.splice(0, timeline.length).map((node) => ({
        ...node,
        photo_archived_at: '2026-01-10T13:00:00.000Z',
      }))
      archive.push(...moved)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: moved.length }) })
    })
    await page.route('**/drive/photos/unarchive', async (route) => {
      const body = await route.request().postDataJSON() as { ids?: number[] }
      unarchivedIds.push(...(body.ids ?? []))
      const restored = archive.splice(0, archive.length).map(({ photo_archived_at: _archivedAt, ...node }) => node)
      timeline.push(...restored)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: restored.length }) })
    })

    await page.goto('/app/photos')
    await expect(page.getByRole('button', { name: /Ouvrir e2e-archive\.jpg/ })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click()
    await page.getByRole('button', { name: 'Sélectionner e2e-archive.jpg' }).click()
    await page.getByRole('button', { name: 'Archiver la sélection' }).click()
    await expect.poll(() => archivedIds).toContain(901)

    await page.goto('/app/photos?tab=archive')
    await expect(page.getByRole('heading', { name: 'Archivé' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /Ouvrir e2e-archive\.jpg/ })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Restaurer' }).click()
    await expect.poll(() => unarchivedIds).toContain(901)
  })

  test('met une photo à la corbeille puis la restaure depuis l’onglet Corbeille', async ({ page }) => {
    const timeline = [photoNode(902, 'e2e-trash.jpg')]
    const trash: DriveNode[] = []
    const deletedIds: number[] = []
    const restoredIds: number[] = []

    await page.route('**/drive/nodes/*/thumbnail**', async (route) => {
      await route.fulfill({ status: 200, body: TINY_JPEG, headers: { 'Content-Type': 'image/jpeg' } })
    })
    await page.route('**/photos/timeline**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: timeline, limit: 48, offset: 0, has_more: false }),
      })
    })
    await page.route('**/drive/nodes/trash', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trash) })
    })
    await page.route('**/drive/nodes/*/restore', async (route) => {
      const match = route.request().url().match(/\/drive\/nodes\/(\d+)\/restore/)
      const id = match ? Number.parseInt(match[1]!, 10) : null
      if (id != null) restoredIds.push(id)
      const restored = trash.splice(0, trash.length).map(({ deleted_at: _deletedAt, ...node }) => node)
      timeline.push(...restored)
      await route.fulfill({ status: 200 })
    })
    await page.route('**/drive/nodes/*', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/thumbnail')) {
        await route.fulfill({ status: 200, body: TINY_JPEG, headers: { 'Content-Type': 'image/jpeg' } })
        return
      }
      if (req.method() === 'GET' && url.includes('/drive/nodes/trash')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trash) })
        return
      }
      if (req.method() === 'POST' && url.includes('/restore')) {
        const match = url.match(/\/drive\/nodes\/(\d+)\/restore/)
        const id = match ? Number.parseInt(match[1]!, 10) : null
        if (id != null) restoredIds.push(id)
        const restored = trash.splice(0, trash.length).map(({ deleted_at: _deletedAt, ...node }) => node)
        timeline.push(...restored)
        await route.fulfill({ status: 200 })
        return
      }
      if (req.method() !== 'DELETE') {
        await route.continue()
        return
      }
      const match = url.match(/\/drive\/nodes\/(\d+)/)
      const id = match ? Number.parseInt(match[1]!, 10) : null
      if (id != null) deletedIds.push(id)
      const idx = timeline.findIndex((node) => node.id === id)
      if (idx >= 0) {
        const [deleted] = timeline.splice(idx, 1)
        trash.push({ ...deleted, deleted_at: '2026-01-10T13:00:00.000Z' })
      }
      await route.fulfill({ status: 200 })
    })

    await page.goto('/app/photos')
    await expect(page.getByRole('button', { name: /Ouvrir e2e-trash\.jpg/ })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click()
    await page.getByRole('button', { name: 'Sélectionner e2e-trash.jpg' }).click()
    await page.getByRole('button', { name: 'Mettre à la corbeille' }).click()
    await expect.poll(() => deletedIds).toContain(902)

    await page.goto('/app/photos?tab=trash')
    await expect(page.getByRole('heading', { name: 'Corbeille' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /Ouvrir e2e-trash\.jpg/ })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Restaurer' }).click()
    await expect.poll(() => restoredIds).toContain(902)
  })
})
