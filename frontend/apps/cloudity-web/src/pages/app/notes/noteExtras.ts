import type { NoteExtras } from '../../../api'

export const MAX_NOTE_IMAGES = 8
export const MAX_IMAGE_BYTES = 600_000

export function emptyExtras(): NoteExtras {
  return { checklist: [], images: [], drawing: null }
}

export function newChecklistId(): string {
  return `cl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function newImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

/** Compresse / redimensionne une image en data URL JPEG (cible ~maxBytes). */
export async function compressImageFile(file: File, maxBytes = MAX_IMAGE_BYTES): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const maxSide = 1600
  let w = bitmap.width
  let h = bitmap.height
  if (w > maxSide || h > maxSide) {
    const scale = Math.min(maxSide / w, maxSide / h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas indisponible')
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  let quality = 0.85
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length * 0.75 > maxBytes && quality > 0.35) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  while (dataUrl.length * 0.75 > maxBytes && (w > 400 || h > 400)) {
    w = Math.round(w * 0.75)
    h = Math.round(h * 0.75)
    canvas.width = w
    canvas.height = h
    const bmp2 = await createImageBitmap(file)
    ctx.drawImage(bmp2, 0, 0, w, h)
    bmp2.close()
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length * 0.75 > maxBytes) {
    throw new Error('Image trop volumineuse après compression')
  }
  return dataUrl
}
