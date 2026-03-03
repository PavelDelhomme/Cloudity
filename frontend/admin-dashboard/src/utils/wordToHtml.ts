/**
 * Conversion Word (.docx / .doc) → HTML pour ouverture dans l’éditeur.
 * Utilise mammoth pour un rendu sémantique (titres, listes, gras, etc.).
 */

import mammoth from 'mammoth'

/** Convertit un blob Word (.docx ou .doc) en HTML. */
export async function wordBlobToHtml(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  return result.value || '<p></p>'
}
